import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "../generated/prisma/client";
import type { DataCache } from "../server/cache/json-cache";
import { expireReservations } from "../services/order-maintenance";
import { createCheckoutHandlers } from "../controllers/checkout-handlers";

const id = "c1a10276-792a-4430-88a7-9988af339b7f";
const address = { zoneId: "zone", streetOrClose: "Test Close", houseNumber: "1", phoneNumber: "08012345678" };

test("cancel/reject invalidates stock only after commit, and checkout reads never use Redis", async () => {
  for (const action of ["cancel", "reject"] as const) {
    let committed = false, invalidations = 0, restored = 0;
    const cache: DataCache = {
      remember: async () => { throw Error("Checkout must not use cached stock"); },
      invalidate: async scope => { assert.equal(scope, "products"); assert.equal(committed, true); invalidations++; },
    };
    const order = { id, userId: id, status: "PENDING", paymentStatus: action === "reject" ? "REVIEW_REQUIRED" : "PENDING", createdAt: new Date(), deliveryAddress: address, deliveryZoneId: "zone", total: 100, items: [{ productOptionId: id, quantity: 1, name: "Apple" }], payment: { provider: "manual_transfer", amount: 100 } };
    const tx = {
      order: { findFirst: async () => order, update: async () => ({ ...order, status: "CANCELLED", paymentStatus: "FAILED" }) },
      productOption: { update: async () => { restored++; } },
    };
    const db = {
      $transaction: async (fn: (value: typeof tx) => Promise<unknown>) => { const result = await fn(tx); committed = true; return result; },
      deliveryZone: { findUnique: async () => ({ isAvailable: true }) },
      productOption: { findMany: async () => [{ id, product: { isAvailable: true } }] },
    } as unknown as PrismaClient;
    const handlers = createCheckoutHandlers({ db, cache, currentUser: async () => ({ id, name: null, email: null, image: null, phone: null, role: action === "reject" ? "ADMIN" : "CUSTOMER", isActive: true }), readBody: req => req.json() });
    const request = () => new Request("https://example.com/api/orders/" + id, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
    assert.equal((await handlers.action(request(), id, action === "reject")).status, 200);
    assert.equal(restored, 1);
    assert.equal(invalidations, 1);
    db.$transaction = (async () => { throw { code: "P2034" }; }) as typeof db.$transaction;
    assert.equal((await handlers.action(request(), id, action === "reject")).status, 409);
    assert.equal(invalidations, 1);
  }
});

test("reservation expiry invalidates after commit; empty/failed batches do not invalidate", async () => {
  let committed = false, invalidations = 0, empty = false;
  const tx = {
    order: { findMany: async () => empty ? [] : [{ id, items: [{ productOptionId: id, quantity: 1 }] }], update: async () => ({}) },
    productOption: { update: async () => ({}) },
  };
  const db = { $transaction: async (fn: (value: typeof tx) => Promise<unknown>) => { const result = await fn(tx); committed = true; return result; } } as unknown as PrismaClient;
  const cache: DataCache = { remember: (_s, _k, _t, load) => load(), invalidate: async () => { assert.equal(committed, true); invalidations++; } };
  assert.equal(await expireReservations(db, new Date(), cache), 1);
  assert.equal(invalidations, 1);
  empty = true;
  assert.equal(await expireReservations(db, new Date(), cache), 0);
  assert.equal(invalidations, 1);
  db.$transaction = (async () => { throw Error("rollback"); }) as typeof db.$transaction;
  await assert.rejects(expireReservations(db, new Date(), cache), /rollback/);
  assert.equal(invalidations, 1);
});

test("new checkout reserves authoritative stock and invalidates only after commit", async () => {
  let committed = false, invalidations = 0, reservations = 0;
  const option = { id, productId: id, stock: 5, price: 100, label: "Small", detail: "", product: { name: "Apple", isAvailable: true, imageUrl: null } };
  const zone = { id: "zone", isAvailable: true, deliveryFee: 50, estimatedMinutesMin: 10, estimatedMinutesMax: 20 };
  const tx = {
    deliveryZone: { findUnique: async () => zone },
    productOption: { findMany: async () => [option], updateMany: async () => { reservations++; return { count: 1 }; } },
    order: {
      findUnique: async () => null,
      create: async ({ data }: { data: Record<string, unknown> & { items: { create: unknown[] }; payment: { create: unknown } } }) => ({ ...data, status: "PENDING", paymentStatus: "PENDING", createdAt: new Date(), items: data.items.create, payment: data.payment.create }),
    },
  };
  const db = { ...tx, $transaction: async (fn: (value: typeof tx) => Promise<unknown>) => { const result = await fn(tx); committed = true; return result; } } as unknown as PrismaClient;
  const cache: DataCache = {
    remember: async () => { throw Error("Checkout must use PostgreSQL"); },
    invalidate: async () => { assert.equal(committed, true); invalidations++; },
  };
  const handlers = createCheckoutHandlers({ db, cache, currentUser: async () => ({ id, name: null, email: null, image: null, phone: null, role: "CUSTOMER", isActive: true }), readBody: req => req.json() });
  const request = () => new Request("https://example.com/api/checkout", { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": id }, body: JSON.stringify({ items: [{ productId: id, optionId: id, quantity: 1 }], deliveryAddress: address }) });
  assert.equal((await handlers.create(request())).status, 201);
  assert.equal(reservations, 1);
  assert.equal(invalidations, 1);
  db.$transaction = (async () => { throw { code: "P2034" }; }) as typeof db.$transaction;
  assert.equal((await handlers.create(request())).status, 409);
  assert.equal(invalidations, 1);
});
