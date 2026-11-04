import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID, createHash, createHmac } from "node:crypto";
import type { PrismaClient } from "../../generated/prisma/client";
import { orderEvent, productEvent } from "./events";
import { processNotification } from "./worker";
import { verifySignature, workerUrl, type PushTransport } from "./transport";
import { notificationHandlers } from "./handlers";
import { NextRequest } from "next/server";
import { guardRequest } from "../auth/proxy-policy";
const id = () => randomUUID();
const product = { id: id(), name: "Apple", isAvailable: true, options: [{ size: "SMALL", stock: 4 }] };
test("catalogue events detect available creations/stock additions but not edits/decreases/unavailable stock", () => {
  assert.ok(productEvent(null, product));
  assert.ok(productEvent({ ...product, isAvailable: false }, product));
  assert.ok(productEvent(product, { ...product, options: [{ size: "SMALL", stock: 5 }] }));
  for (const changed of [{ ...product, name: "Green apple" }, { ...product, options: [{ size: "SMALL", stock: 3 }] }, { ...product, isAvailable: false }]) assert.equal(productEvent(product, changed), null);
  assert.equal(productEvent(null, { ...product, options: [{ size: "SMALL", stock: 0 }] }), null);
});
test("order event keys deduplicate repeated transitions and require an owner", () => {
  const order = { id: id(), userId: id() };
  assert.deepEqual(orderEvent(order, "verify"), orderEvent(order, "verify"));
  assert.equal(orderEvent({ ...order, userId: null }, "verify"), null);
  assert.equal(orderEvent(order, "unknown"), null);
  assert.notEqual(orderEvent(order, "verify")?.key, orderEvent(order, "process")?.key);
});
function harness(size = 1) {
  const now = new Date(), userId = id(), sessionId = id();
  const event = { id: id(), kind: "catalogue", userId: null as string | null, entityId: id(), createdAt: now, expiresAt: new Date(Date.now() + 86400000), fanoutDone: false, completedAt: null as Date | null, cursor: null as string | null, leaseId: null as string | null, leaseUntil: null as Date | null, title: "New product", body: "Available" };
  const installations = Array.from({ length: size }, (_, i) => ({ id: `${String(i).padStart(8, "0")}-0000-4000-8000-000000000000`, userId, sessionId, token: `ExpoPushToken[test${i}]`, platform: "android", createdAt: now, user: { isActive: true, catalogueNotificationsEnabled: true, notificationsEnabled: true }, session: { userId, expires: new Date(Date.now() + 86400000) } }));
  type Delivery = { id: string; installationId: string; userId: string; sessionId: string; token: string; state: string; attempts: number; receiptChecks: number; ticket: string | null };
  const deliveries: Delivery[] = [];
  let sends = 0, failSend = false, invalid = false, missing = false;
  const transport: PushTransport = {
    send: async messages => { sends += messages.length; if (failSend) throw Error("network"); return messages.map((_, i) => invalid ? { status: "error", details: { error: "DeviceNotRegistered" } } : { status: "ok", id: `ticket-${sends}-${i}` }); },
    receipts: async tickets => Object.fromEntries(missing ? [] : tickets.map(ticket => [ticket, { status: "ok" }])),
  };
  const update = (delivery: Delivery, data: Record<string, unknown>) => {
    const record = delivery as unknown as Record<string, unknown>;
    for (const [key, value] of Object.entries(data)) record[key] = value && typeof value === "object" && "increment" in value ? Number(record[key]) + Number(value.increment) : value;
    return delivery;
  };
  const fake = {
    notificationEvent: {
      updateMany: async ({ where, data }: { where: { leaseId?: string }; data: Record<string, unknown> }) => {
        if (where.leaseId ? event.leaseId !== where.leaseId : event.completedAt || event.leaseUntil && event.leaseUntil > new Date()) return { count: 0 };
        Object.assign(event, data); return { count: 1 };
      }, findUnique: async () => event, findUniqueOrThrow: async () => ({ ...event }),
      update: async ({ data }: { data: Record<string, unknown> }) => { Object.assign(event, data); return event; },
    },
    pushInstallation: {
      findMany: async ({ where, take }: { where: { id?: { gt: string } }; take: number }) => installations.filter(i => !where.id || i.id > where.id.gt).slice(0, take),
      findUnique: async ({ where }: { where: { id: string } }) => installations.find(i => i.id === where.id) ?? null,
      deleteMany: async ({ where }: { where: { id: string; token: string } }) => { const index = installations.findIndex(i => i.id === where.id && i.token === where.token); if (index >= 0) installations.splice(index, 1); return { count: index >= 0 ? 1 : 0 }; },
    },
    notificationDelivery: {
      createMany: async ({ data }: { data: Delivery[] }) => { for (const delivery of data) if (!deliveries.some(old => old.installationId === delivery.installationId)) deliveries.push({ ...delivery, id: id(), state: "PENDING", attempts: 0, receiptChecks: 0, ticket: null }); },
      findMany: async ({ where, take }: { where: { state: string }; take: number }) => deliveries.filter(d => d.state === where.state).slice(0, take),
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => update(deliveries.find(d => d.id === where.id)!, data),
      updateMany: async ({ where, data }: { where: { id: { in: string[] } }; data: Record<string, unknown> }) => { deliveries.filter(d => where.id.in.includes(d.id)).forEach(d => update(d, data)); },
      count: async () => deliveries.filter(d => ["PENDING", "RECEIPT"].includes(d.state)).length,
    },
    $transaction: async (run: (tx: unknown) => Promise<unknown>) => run(fake),
  };
  const db = fake as unknown as PrismaClient;
  return { event, installations, deliveries, run: () => processNotification(db, event.id, transport), sends: () => sends, fail: (value: boolean) => { failSend = value; }, invalid: () => { invalid = true; }, missing: () => { missing = true; } };
}
test("worker paginates 45 devices, checks receipts and never resends completed deliveries", async () => {
  const h = harness(45);
  for (let i = 0; i < 8 && !h.event.completedAt; i++) await h.run();
  assert.equal(h.deliveries.length, 45); assert.equal(h.sends(), 45); assert.ok(h.event.completedAt);
  await h.run(); assert.equal(h.sends(), 45);
});
test("network failure retains work, releases lease and retries successfully", async () => {
  const h = harness(); h.fail(true); await assert.rejects(h.run(), /network/);
  assert.equal(h.event.leaseId, null); assert.equal(h.deliveries[0].state, "PENDING");
  h.fail(false); await h.run(); await h.run(); assert.equal(h.deliveries[0].attempts, 2); assert.ok(h.event.completedAt);
});
test("preference/session/owner/platform checks prevent unauthorized sends", async () => {
  for (const mutate of [
    (h: ReturnType<typeof harness>) => { h.installations[0].user.catalogueNotificationsEnabled = false; },
    (h: ReturnType<typeof harness>) => { h.installations[0].session.expires = new Date(0); },
    (h: ReturnType<typeof harness>) => { h.installations[0].platform = "ios"; },
    (h: ReturnType<typeof harness>) => { h.event.kind = "order"; h.event.userId = id(); },
    (h: ReturnType<typeof harness>) => { h.installations[0].user.isActive = false; },
  ]) { const h = harness(); mutate(h); await h.run(); assert.equal(h.sends(), 0); }
  const h = harness(); h.event.expiresAt = new Date(0); await h.run(); assert.equal(h.sends(), 0); assert.ok(h.event.completedAt);
});
test("invalid tokens are removed; absent receipts stop after fifteen checks", async () => {
  const invalid = harness(); invalid.invalid(); await invalid.run(); assert.equal(invalid.installations.length, 0);
  const missing = harness(); await missing.run(); missing.missing();
  for (let i = 0; i < 15; i++) await missing.run();
  assert.equal(missing.deliveries[0].state, "FAILED"); assert.equal(missing.sends(), 1); assert.ok(missing.event.completedAt);
});
test("QStash signature verifies exact body, destination, expiry and rotated signing key", async () => {
  const names = ["QSTASH_CURRENT_SIGNING_KEY", "QSTASH_NEXT_SIGNING_KEY", "NOTIFICATIONS_ORIGIN"];
  const old = names.map(name => process.env[name]);
  try {
    process.env.QSTASH_CURRENT_SIGNING_KEY = "current-signing-key-for-tests-000000000";
    process.env.QSTASH_NEXT_SIGNING_KEY = "next-signing-key-for-tests-00000000000";
    process.env.NOTIFICATIONS_ORIGIN = "https://shop.example";
    const body = JSON.stringify({ eventId: id() });
    function jwt(key: string, exp = Math.floor(Date.now() / 1000) + 60, url = workerUrl()) {
      const header = Buffer.from(JSON.stringify({ alg: "HS256" })).toString("base64url");
      const payload = Buffer.from(JSON.stringify({ iss: "Upstash", sub: url, exp, body: createHash("sha256").update(body).digest("base64url") })).toString("base64url");
      const input = `${header}.${payload}`; return `${input}.${createHmac("sha256", key).update(input).digest("base64url")}`;
    }
    assert.equal(await verifySignature(body, jwt(process.env.QSTASH_NEXT_SIGNING_KEY)), true);
    assert.equal(await verifySignature(body + " ", jwt(process.env.QSTASH_CURRENT_SIGNING_KEY)), false);
    assert.equal(await verifySignature(body, jwt(process.env.QSTASH_CURRENT_SIGNING_KEY, 1)), false);
    assert.equal(await verifySignature(body, jwt(process.env.QSTASH_CURRENT_SIGNING_KEY, undefined, "https://wrong.example")), false);
    assert.equal(await verifySignature(body, "forged"), false);
  } finally { names.forEach((name, i) => { if (old[i] === undefined) delete process.env[name]; else process.env[name] = old[i]; }); }
});
test("push endpoints fail closed without configuration/mobile auth and reject forged webhook", async () => {
  const old = process.env.NOTIFICATIONS_ENABLED;
  try {
    const handlers = notificationHandlers({} as PrismaClient, request => request.json());
    process.env.NOTIFICATIONS_ENABLED = "false"; assert.equal((await handlers.register(new Request("https://shop.example"))).status, 503);
    process.env.NOTIFICATIONS_ENABLED = "true"; assert.equal((await handlers.register(new Request("https://shop.example"))).status, 401);
    assert.equal((await handlers.worker(new Request("https://shop.example", { method: "POST", body: "{}" }))).status, 401);
  } finally { if (old === undefined) delete process.env.NOTIFICATIONS_ENABLED; else process.env.NOTIFICATIONS_ENABLED = old; }
});
test("only exact worker POST bypasses customer auth", async () => {
  const response = await guardRequest(new NextRequest("https://shop.example/api/notifications/worker", { method: "POST" }), async () => { throw Error("Must not read customer auth"); });
  assert.equal(response.headers.get("x-middleware-next"), "1");
  assert.equal((await guardRequest(new NextRequest("https://shop.example/api/notifications/devices"), async () => null)).status, 401);
});

test("a changed account/session cannot receive an already-materialized delivery", async () => {
  const h = harness(); h.fail(true); await assert.rejects(h.run());
  h.fail(false); h.installations[0].sessionId = id();
  await h.run();
  assert.equal(h.sends(), 1); // Only the original failed transport attempt.
  assert.equal(h.deliveries[0].state, "SKIPPED");
});

test("duplicate active worker cannot send while the event lease is held", async () => {
  const h = harness(); h.event.leaseId = id(); h.event.leaseUntil = new Date(Date.now() + 120000);
  await assert.rejects(h.run(), /already processing/);
  assert.equal(h.sends(), 0);
});

test("committed payment transition records its outbox event before publishing; no-op repeats do not enqueue", async () => {
  const { createCheckoutHandlers } = await import("../../controllers/checkout-handlers");
  const orderId = id(), userId = id();
  let committed = false, writes = 0, kicks = 0;
  let current = { id: orderId, userId, status: "PENDING", paymentStatus: "REVIEW_REQUIRED", createdAt: new Date(), deliveryAddress: {}, deliveryZoneId: "zone", total: 100, items: [], payment: { provider: "manual_transfer", amount: 100 } };
  const tx = {
    order: { findFirst: async () => current, update: async () => ({ ...current, status: "PAID", paymentStatus: "SUCCESS" }) },
  };
  const db = {
    $transaction: async (run: (value: typeof tx) => Promise<typeof current>) => { const result = await run(tx); current = result; committed = true; return result; },
    deliveryZone: { findUnique: async () => ({ isAvailable: true }) }, productOption: { findMany: async () => [] },
  } as unknown as PrismaClient;
  const handlers = createCheckoutHandlers({ db, currentUser: async () => ({ id: id(), name: null, email: null, image: null, phone: null, role: "ADMIN", isActive: true }), readBody: r => r.json(),
    notify: async (transaction, event) => { assert.equal(transaction, tx); assert.equal(committed, false); assert.equal(event.userId, userId); writes++; },
    kick: async () => { assert.equal(committed, true); kicks++; },
  });
  const request = () => new Request("https://shop.example", { method: "PATCH", body: JSON.stringify({ action: "verify" }) });
  assert.equal((await handlers.action(request(), orderId, true)).status, 200);
  assert.equal(writes, 1); assert.equal(kicks, 1);
  assert.equal((await handlers.action(request(), orderId, true)).status, 200);
  assert.equal(writes, 1);
});

// Recovery tests remain beside the implementation for code tracing.
import "./recovery-tests";
