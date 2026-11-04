import { expireReservations } from "../services/order-maintenance";
import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";
import { createCheckoutHandlers } from "../controllers/checkout-handlers";
import { checkoutSchema, manualPaymentAccount } from "../validation/checkout-validation";

const address = { zoneId: "abesan-estate", streetOrClose: "Test Close", houseNumber: "1", phoneNumber: "08012345678" };
const request = (body: unknown, key = randomUUID()) => new Request("http://localhost/api/checkout", { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": key }, body: JSON.stringify(body) });
test("checkout rejects client prices, duplicate lines and unsupported delivery addresses", () => {
  const line = { productId: randomUUID(), optionId: randomUUID(), quantity: 1 };
  assert.equal(checkoutSchema.safeParse({ items: [line], deliveryAddress: address }).success, true);
  for (const value of [
    { items: [line], deliveryAddress: address, total: 1 },
    { items: [{ ...line, price: 1 }], deliveryAddress: address },
    { items: [line, line], deliveryAddress: address },
    { items: [line], deliveryAddress: { ...address, zoneId: "" } },
    { items: [line], deliveryAddress: { ...address, streetOrClose: " " } },
    { items: [{ ...line, quantity: 0 }], deliveryAddress: address },
  ]) assert.equal(checkoutSchema.safeParse(value).success, false);
  assert.equal(manualPaymentAccount.accountNumber, "6645847720");
});
test("unauthenticated checkout and non-admin verification never access the database", async () => {
  const db = {} as PrismaClient;
  const guest = createCheckoutHandlers({ db, currentUser: async () => null, readBody: async () => { throw Error("Must not read body"); } });
  assert.equal((await guest.create(request({}))).status, 401);
  assert.equal((await guest.detail(randomUUID())).status, 401);
  const customer = createCheckoutHandlers({ db, currentUser: async () => ({ id: randomUUID(), name: null, phone: null, image: null, email: null, role: "CUSTOMER", isActive: true }), readBody: async (req) => req.json() });
  assert.equal((await customer.action(request({ action: "verify" }), randomUUID(), true)).status, 403);
  assert.equal((await customer.action(request({ action: "verify" }), randomUUID())).status, 403);
});
test("database checkout reserves stock once, verifies manually and restores cancelled stock once", { skip: !process.env.TEST_DATABASE_URL }, async () => {
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.TEST_DATABASE_URL }) });
  const userId = randomUUID();
  const otherId = randomUUID();
  const productId = randomUUID();
  const optionId = randomUUID();
  const adminId = randomUUID();
  const unavailableProductId = randomUUID();
  const unavailableOptionId = randomUUID();
  const session = (id: string, role: "ADMIN" | "CUSTOMER" = "CUSTOMER") => ({ id, role, name: "Checkout test", email: null, phone: null, image: null, isActive: true });
  const handlers = (id: string, role: "ADMIN" | "CUSTOMER" = "CUSTOMER") => createCheckoutHandlers({ db, currentUser: async () => session(id, role), readBody: async (req) => req.json() });
  try {
    await db.user.createMany({ data: [{ id: userId }, { id: otherId }, { id: adminId, role: "ADMIN" }] });
    await db.product.create({ data: { id: productId, name: "Checkout test apple", category: "FRUIT", productType: "redApple", options: { create: { id: optionId, size: "SMALL", label: "Test", price: 12345, stock: 10 } } } });
    const zone = await db.deliveryZone.findUniqueOrThrow({ where: { id: "abesan-estate" } });
    const customer = handlers(userId);
    const admin = handlers(adminId, "ADMIN");
    const payload = { items: [{ productId, optionId, quantity: 2 }], deliveryAddress: address };
    await db.product.create({ data: { id: unavailableProductId, name: "Unavailable test grape", category: "FRUIT", isAvailable: false, options: { create: { id: unavailableOptionId, size: "SMALL", label: "Test grape", price: 20000, stock: 5 } } } });
    const mixed = { ...payload, items: [...payload.items, { productId: unavailableProductId, optionId: unavailableOptionId, quantity: 1 }] };
    const review = await customer.review(request({ items: mixed.items }));
    const reviewed = await review.json();
    assert.equal(reviewed.eligible, false);
    assert.equal(reviewed.total, null);
    assert.match(reviewed.lines[1].issue, /unavailable/);
    assert.equal((await customer.create(request(mixed))).status, 409);
    assert.equal(await db.order.count({ where: { userId } }), 0);
    assert.equal((await db.productOption.findUniqueOrThrow({ where: { id: optionId } })).stock, 10);
    await db.product.update({ where: { id: unavailableProductId }, data: { isAvailable: true } });
    await db.productOption.update({ where: { id: unavailableOptionId }, data: { stock: 0 } });
    assert.equal((await customer.create(request(mixed))).status, 409);
    assert.equal(await db.order.count({ where: { userId } }), 0);
    const key = randomUUID();
    const response = await customer.create(request(payload, key));
    assert.equal(response.status, 201);
    const { order } = await response.json();
    assert.equal(order.total, 24690 + zone.deliveryFee);
    assert.equal(order.paymentStatus, "PENDING");
    await db.product.update({ where: { id: productId }, data: { isAvailable: false } });
    const blocked = await (await customer.detail(order.id)).json();
    assert.equal(blocked.eligibility.eligible, false);
    assert.equal(blocked.account, null);
    const blockedReplay = await (await customer.create(request(payload, key))).json();
    assert.equal(blockedReplay.account, null);
    await db.product.update({ where: { id: productId }, data: { isAvailable: true } });
    await db.productOption.update({ where: { id: optionId }, data: { stock: 0 } });
    const reserved = await (await customer.detail(order.id)).json();
    assert.equal(reserved.eligibility.eligible, true, "reserved items remain payable even if free stock reaches zero");
    await db.productOption.update({ where: { id: optionId }, data: { stock: 8 } });
    assert.equal((await db.productOption.findUniqueOrThrow({ where: { id: optionId } })).stock, 8);
    const replay = await customer.create(request(payload, key));
    assert.equal((await replay.json()).order.id, order.id);
    assert.equal((await db.productOption.findUniqueOrThrow({ where: { id: optionId } })).stock, 8);
    assert.equal((await customer.create(request({ ...payload, items: [{ ...payload.items[0], quantity: 3 }] }, key))).status, 409);
    assert.equal((await handlers(otherId).detail(order.id)).status, 404);
    assert.equal((await handlers(otherId).action(request({ action: "reported" }), order.id)).status, 404);
    assert.equal((await admin.action(request({ action: "verify" }), order.id, true)).status, 409);
    await customer.action(request({ action: "reported" }), order.id);
    assert.equal((await customer.detail(order.id).then((r) => r.json())).order.paymentStatus, "REVIEW_REQUIRED");
    assert.equal((await customer.action(request({ action: "cancel" }), order.id)).status, 409);
    const verified = await admin.action(request({ action: "verify" }), order.id, true);
    assert.equal((await verified.json()).order.paymentStatus, "SUCCESS");
    assert.equal((await customer.action(request({ action: "reported" }), order.id)).status, 409);
    assert.equal((await admin.action(request({ action: "deliver" }), order.id, true)).status, 409);
    assert.equal((await customer.action(request({ action: "process" }), order.id)).status, 403);
    for (const action of ["process", "dispatch", "deliver"]) {
      assert.equal((await admin.action(request({ action }), order.id, true)).status, 200);
      assert.equal((await admin.action(request({ action }), order.id, true)).status, 200);
    }
    assert.equal((await (await customer.detail(order.id)).json()).order.deliveryStatus, "DELIVERED");
    const second = (await (await customer.create(request(payload))).json()).order;
    await customer.action(request({ action: "cancel" }), second.id);
    await customer.action(request({ action: "cancel" }), second.id);
    assert.equal((await db.productOption.findUniqueOrThrow({ where: { id: optionId } })).stock, 8);
    const third = (await (await customer.create(request(payload))).json()).order;
    await customer.action(request({ action: "reported" }), third.id);
    await admin.action(request({ action: "reject" }), third.id, true);
    await admin.action(request({ action: "reject" }), third.id, true);
    assert.equal((await db.productOption.findUniqueOrThrow({ where: { id: optionId } })).stock, 8);
    const expired = (await (await customer.create(request(payload))).json()).order;
    await db.order.update({ where: { id: expired.id }, data: { createdAt: new Date(Date.now() - 25 * 3600000) } });
    assert.equal((await (await customer.detail(expired.id)).json()).account, null);
    assert.equal(await expireReservations(db), 1);
    assert.equal(await expireReservations(db), 0);
    assert.equal((await db.productOption.findUniqueOrThrow({ where: { id: optionId } })).stock, 8);
    assert.equal((await customer.create(request({ ...payload, items: [{ ...payload.items[0], quantity: 9 }] }))).status, 409);
    assert.equal((await db.productOption.findUniqueOrThrow({ where: { id: optionId } })).stock, 8);
  } finally {
    await db.payment.deleteMany({ where: { order: { userId } } });
    await db.orderItem.deleteMany({ where: { order: { userId } } });
    await db.order.deleteMany({ where: { userId } });
    await db.productOption.deleteMany({ where: { productId: { in: [productId, unavailableProductId] } } });
    await db.product.deleteMany({ where: { id: { in: [productId, unavailableProductId] } } });
    await db.user.deleteMany({ where: { id: { in: [userId, otherId, adminId] } } });
    await db.$disconnect();
  }
});
