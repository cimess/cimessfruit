import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import type { PrismaClient } from "../generated/prisma/client";
import { createMaintenanceHandler } from "../controllers/maintenance-handler";
import { reservationExpired, reservationLifetime, reservationBatchSize } from "../services/order-maintenance";
import { guardRequest } from "../server/auth/proxy-policy";

const secret = "local-worker-test-secret";
const request = (authorization?: string) => new Request("http://localhost/api/cron/maintenance", {
  headers: authorization ? { authorization } : {},
});

test("expiry is inclusive at 24 hours, not 12 hours", () => {
  const now = new Date("2026-10-29T12:00:00Z");
  assert.equal(reservationLifetime, 24 * 3600000);
  assert.equal(reservationExpired(new Date(now.getTime() - reservationLifetime + 1), now), false);
  assert.equal(reservationExpired(new Date(now.getTime() - reservationLifetime), now), true);
});

test("worker fails closed before touching database for missing/wrong secrets", async () => {
  const db = { $transaction: () => { throw Error("Must not access database"); } } as unknown as PrismaClient;
  for (const configured of [undefined, "short"]) {
    assert.equal((await createMaintenanceHandler({ db, secret: () => configured })(request())).status, 503);
  }
  const run = createMaintenanceHandler({ db, secret: () => secret });
  for (const value of [undefined, "Bearer invalid", `Bearer ${secret}x`, `bearer ${secret}`]) {
    assert.equal((await run(request(value))).status, 401);
  }
});

test("worker awaits bounded atomic expiry, filters reported/paid orders and returns retry on failure", async () => {
  let calls = 0;
  const db = { $transaction: async (run: (tx: unknown) => Promise<number>, options: unknown) => {
    calls++;
    assert.deepEqual(options, { isolationLevel: "Serializable" });
    return run({ order: { findMany: async (query: { where: unknown; take: number; orderBy: unknown }) => {
      assert.equal(query.take, reservationBatchSize);
      assert.deepEqual(query.orderBy, [{ createdAt: "asc" }, { id: "asc" }]);
      const where = query.where as { status: string; paymentStatus: string; payment: unknown };
      assert.equal(where.status, "PENDING");
      assert.equal(where.paymentStatus, "PENDING");
      assert.deepEqual(where.payment, { provider: "manual_transfer", status: "PENDING" });
      return [];
    } } });
  } } as unknown as PrismaClient;
  const run = createMaintenanceHandler({ db, secret: () => secret });
  const response = await run(request(`Bearer ${secret}`));
  assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control")!, /no-store/);
  assert.deepEqual(await response.json(), { expired: 0, batches: 1, batchSize: reservationBatchSize, moreMayRemain: false });
  assert.equal(calls, 1);
  db.$transaction = (async () => { throw { code: "P2034" }; }) as typeof db.$transaction;
  const failed = await run(request(`Bearer ${secret}`));
  assert.equal(failed.status, 503);
  assert.equal(failed.headers.get("retry-after"), "60");
});

test("only the exact GET worker route skips customer auth; handler owns secret validation", async () => {
  const readSession = async () => { throw Error("Customer auth must not run for cron"); };
  const cron = await guardRequest(new NextRequest("https://fruit.example/api/cron/maintenance"), readSession);
  assert.equal(cron.headers.get("x-middleware-next"), "1");
  for (const path of ["/api/cron/maintenance/other", "/api/cron/other"]) {
    assert.equal((await guardRequest(new NextRequest(`https://fruit.example${path}`), async () => null)).status, 401);
  }
});

test("daily worker caps a full backlog at ten batches and reports remaining work", async () => {
  let batches = 0, updates = 0, dispatches = 0;
  const tx = { order: {
    findMany: async () => Array.from({ length: reservationBatchSize }, (_, i) => ({ id: String(i), items: [] })),
    update: async () => { updates++; },
  } };
  const db = { $transaction: async (run: (value: typeof tx) => Promise<number>) => {
    batches++;
    return run(tx);
  } } as unknown as PrismaClient;
  const response = await createMaintenanceHandler({ db, secret: () => secret, kick: async () => { dispatches++; } })(request(`Bearer ${secret}`));
  assert.equal(response.status, 200);
  assert.equal(batches, 10);
  assert.equal(updates, 200);
  assert.equal(dispatches, 1);
  assert.deepEqual(await response.json(), { expired: 200, batches: 10, batchSize: 20, moreMayRemain: true });
});
test("separate daily upload and notification cron paths bypass customer sessions only for GET", async () => {
  for (const path of ["/api/cron/uploads", "/api/cron/notifications", "/api/cron/credentials"]) {
    const result = await guardRequest(new NextRequest(`https://shop.test${path}`), async () => { throw Error("Cron handler owns authentication"); });
    assert.equal(result.status, 200);
    const denied = await guardRequest(new NextRequest(`https://shop.test${path}`, { method: "POST" }), async () => null);
    assert.notEqual(denied.status, 200);
  }
});
