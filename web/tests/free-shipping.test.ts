import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "../generated/prisma/client";
import { createCheckoutHandlers } from "../controllers/checkout-handlers";
import { expireReservations } from "../services/order-maintenance";

// Fake adapter checks handler behavior without connecting to a database.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
 type Row = Record<string, any>;
function setup(balance = 5, fee = 500) {
  const userId = randomUUID(), productId = randomUUID(), optionId = randomUUID();
  const zone = { id: "test", isAvailable: true, deliveryFee: fee, estimatedMinutesMin: 10, estimatedMinutesMax: 20 };
  const option = { id: optionId, productId, stock: 20, price: 1000, label: "Small", detail: "", product: { name: "Apple", isAvailable: true, productType: "redApple", images: [] } };
  const orders: Row[] = [];
  const tx = {
    user: {
      updateMany: async ({ where, data }: Row) => { assert.equal(where.id, userId); assert.deepEqual(where.freeShipping, { gt: 0 }); if (balance <= 0) return { count: 0 }; balance -= data.freeShipping.decrement; return { count: 1 }; },
      update: async ({ data }: Row) => { balance += data.freeShipping.increment; },
    },
    deliveryZone: { findUnique: async () => zone },
    productOption: { findMany: async () => [option], updateMany: async () => ({ count: 1 }), update: async () => ({}) },
    order: {
      findUnique: async ({ where }: Row) => orders.find(o => o.idempotencyKey === where.userId_idempotencyKey.idempotencyKey) ?? null,
      findFirst: async ({ where }: Row) => orders.find(o => o.id === where.id) ?? null,
      findMany: async () => orders.filter(o => o.status === "PENDING" && o.paymentStatus === "PENDING"),
      create: async ({ data }: Row) => { const order = { status: "PENDING", paymentStatus: "PENDING", createdAt: new Date(), ...data, items: data.items.create, payment: data.payment.create }; orders.push(order); return order; },
      update: async ({ where, data }: Row) => { const row = orders.find(o => o.id === where.id)!; Object.assign(row, { ...data, payment: { ...row.payment, ...data.payment?.update } }); return row; },
    },
  };
  const db = { ...tx, $transaction: async (run: (client: typeof tx) => Promise<unknown>) => {
    const before = balance;
    try { return await run(tx); } catch (error) { balance = before; throw error; }
  } } as unknown as PrismaClient;
  const handlers = createCheckoutHandlers({ db, currentUser: async () => ({ id: userId, role: "ADMIN", isActive: true, name: null, email: null, phone: null, image: null }), readBody: request => request.json() });
  const body = { items: [{ productId, optionId, quantity: 1 }], deliveryAddress: { zoneId: "test", streetOrClose: "Test", houseNumber: "1", phoneNumber: "08012345678" }, useFreeShipping: true };
  const request = (value: unknown, key = randomUUID()) => new Request("https://fruit.example/api/checkout", { method: "POST", headers: { "Idempotency-Key": key }, body: JSON.stringify(value) });
  return { db, tx, handlers, body, request, balance: () => balance, orders };
}
test("free shipping waives delivery and consumes one allowance across retries", async () => {
  const f = setup(); const key = randomUUID();
  const response = await f.handlers.create(f.request(f.body, key));
  assert.equal(response.status, 201);
  const { order } = await response.json();
  assert.equal(order.usedFreeShipping, true); assert.equal(order.deliveryFee, 0); assert.equal(order.total, 1000); assert.equal(order.payment.amount, 1000); assert.equal(f.balance(), 4);
  assert.equal((await f.handlers.create(f.request(f.body, key))).status, 201); assert.equal(f.balance(), 4);
  assert.equal((await f.handlers.create(f.request({ ...f.body, useFreeShipping: false }, key))).status, 409);
});
test("empty allowance rejects checkout; unchecked and already-free delivery do not consume it", async () => {
  const f = setup(0);
  assert.equal((await f.handlers.create(f.request(f.body))).status, 409); assert.equal(f.orders.length, 0); assert.equal(f.balance(), 0);
  const normal = await (await f.handlers.create(f.request({ ...f.body, useFreeShipping: false }))).json();
  assert.equal(normal.order.total, 1500); assert.equal(normal.order.usedFreeShipping, false);
  const free = setup(5, 0); const result = await (await free.handlers.create(free.request(free.body))).json();
  assert.equal(result.order.usedFreeShipping, false); assert.equal(free.balance(), 5);
});
test("cancel and reject restore the allowance only once", async () => {
  for (const action of ["cancel", "reject"]) {
    const f = setup(); const { order } = await (await f.handlers.create(f.request(f.body))).json();
    if (action === "reject") await f.handlers.action(f.request({ action: "reported" }), order.id);
    assert.equal((await f.handlers.action(f.request({ action }), order.id, true)).status, 200);
    assert.equal((await f.handlers.action(f.request({ action }), order.id, true)).status, 200); assert.equal(f.balance(), 5);
  }
});
test("expiry restores free shipping once", async () => {
  const f = setup(); await f.handlers.create(f.request(f.body));
  assert.equal(await expireReservations(f.db), 1); assert.equal(await expireReservations(f.db), 0); assert.equal(f.balance(), 5);
});
test("five free orders exhaust the allowance without allowing a negative balance", async () => {
  const f = setup();
  for (let i = 0; i < 5; i++) assert.equal((await f.handlers.create(f.request(f.body))).status, 201);
  assert.equal(f.balance(), 0);
  assert.equal((await f.handlers.create(f.request(f.body))).status, 409);
  assert.equal(f.orders.length, 5); assert.equal(f.balance(), 0);
});
test("failed stock reservation rolls back the free delivery deduction", async () => {
  const f = setup();
  f.tx.productOption.updateMany = async () => ({ count: 0 });
  assert.equal((await f.handlers.create(f.request(f.body))).status, 409);
  assert.equal(f.balance(), 5); assert.equal(f.orders.length, 0);
});
