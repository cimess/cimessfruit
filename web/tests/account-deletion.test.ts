import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID, createHash } from "node:crypto";
import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { createDeletionHandlers } from "../controllers/account-deletion";
const request = (body: unknown) => new Request("https://shop.test/api/account-deletion", { method: "POST", body: JSON.stringify(body) });
test("disabling requires confirmation, preserves customer and financial history, and revokes credentials atomically", { skip: !process.env.TEST_DATABASE_URL }, async () => {
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.TEST_DATABASE_URL }) });
  const id = randomUUID(), email = `${id}@example.test`, orderId = randomUUID(); let token = "";
  const handlers = createDeletionHandlers({ db, readBody: r => r.json(), allowAttempt: async () => true, origin: () => "https://shop.test", send: async (_email, _subject, text) => { token = new URLSearchParams(new URL(text.match(/https:\/\/[^\s]+/)![0]).hash.slice(1)).get("token")!; } });
  try {
    await db.user.create({ data: { id, email, name: "Private name", deliveryAddress: { street: "Private road" } } });
    await db.session.create({ data: { userId: id, sessionToken: randomUUID(), expires: new Date(Date.now()+60000) } });
    await db.account.create({ data: { userId: id, type: "oauth", provider: "google", providerAccountId: id, access_token: "private-oauth-token" } });
    await db.mobileAuthGrant.create({ data: { userId: id, codeHash: randomUUID(), challenge: "test", expires: new Date(Date.now()+60000) } });
    await db.conversation.create({ data: { userId: id, subject: "Private message", messages: { create: { body: "Private text" } } } });
    await db.order.create({ data: { id: orderId, userId: id, deliveryZoneId: "abesan-estate", deliveryAddress: { phoneNumber: "08000000000", coordinates: { latitude: 6, longitude: 3 } }, deliveryFee: 0, itemSubtotal: 100, total: 100, estimatedDeliveryTime: "test", idempotencyKey: randomUUID(), requestHash: "private-hash", payment: { create: { amount: 100, provider: "manual_transfer", providerReference: randomUUID(), verifiedResponse: { private: "data" } } } } });
    assert.equal((await handlers.request(request({ email }))).status, 200);
    assert.ok(token);
    assert.ok(await db.user.findUnique({ where: { id } }));
    assert.equal((await handlers.complete(request({ token, confirmation: "no" }))).status, 400);
    assert.equal(await db.session.count({ where: { userId: id } }), 1);
    await db.order.update({ where: { id: orderId }, data: { status: "DELIVERED", paymentStatus: "SUCCESS" } });
    await db.verificationToken.update({ where: { token: createHash("sha256").update(token).digest("hex") }, data: { expires: new Date(0) } });
    assert.equal((await handlers.complete(request({ token, confirmation: "DISABLE" }))).status, 400);
    await handlers.request(request({ email }));
    assert.equal((await handlers.complete(request({ token, confirmation: "DISABLE" }))).status, 200);
    assert.equal((await db.user.findUniqueOrThrow({ where: { id } })).isActive, false);
    assert.ok((await db.user.findUniqueOrThrow({ where: { id } })).selfDisabledAt);
    assert.equal(await db.session.count({ where: { userId: id } }), 0);
    assert.equal(await db.account.count({ where: { userId: id } }), 1);
    assert.equal(await db.mobileAuthGrant.count({ where: { userId: id } }), 0);
    assert.equal(await db.conversation.count({ where: { userId: id } }), 1);
    const order = await db.order.findUniqueOrThrow({ where: { id: orderId }, include: { payment: true } });
    assert.equal(order.userId, id); assert.equal(order.total, 100); assert.deepEqual(order.payment?.verifiedResponse, { private: "data" });
    assert.deepEqual(order.deliveryAddress, { phoneNumber: "08000000000", coordinates: { latitude: 6, longitude: 3 } });
    assert.equal((await handlers.complete(request({ token, confirmation: "DISABLE" }))).status, 400);
  } finally {
    await db.payment.deleteMany({ where: { orderId } }); await db.order.deleteMany({ where: { id: orderId } });
    await db.mobileAuthGrant.deleteMany({ where: { userId: id } }); await db.verificationToken.deleteMany({ where: { identifier: { contains: id } } });
    await db.user.deleteMany({ where: { id } }); await db.$disconnect();
  }
});
test("deletion rejects malformed requests and rate limits before database access", async () => {
  let accessed = false;
  const db = { user: { findUnique: async () => { accessed = true; } } } as unknown as PrismaClient;
  const handler = createDeletionHandlers({ db, readBody: r => r.json(), allowAttempt: async () => false, origin: () => "https://shop.test", send: async () => {} });
  assert.equal((await handler.request(request({ email: "invalid" }))).status, 400);
  assert.equal((await handler.request(request({ email: "a@example.test" }))).status, 429);
  assert.equal(accessed, false);
});
