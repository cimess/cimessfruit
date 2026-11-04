import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "../../generated/prisma/client";
import { applyCredit, creditPlan, settleCredit } from "./credit";
import { approveReturn, transferCredit } from "./service";
import { approvalSchema, bankSchema, refundWaitMs } from "./validation";
import { ignoreEvent } from "../../server/notifications/events";
const id = () => randomUUID();
const now = new Date("2026-10-29T12:00:00Z");
test("return validation rejects duplicate lines, invalid banks and non-integral quantities", () => {
  const item = { orderItemId: id(), quantity: 1 };
  assert.equal(approvalSchema.safeParse({ key: id(), reason: "Not ripe", items: [item] }).success, true);
  assert.equal(approvalSchema.safeParse({ key: id(), reason: "Not ripe", items: [item, item] }).success, false);
  assert.equal(approvalSchema.safeParse({ key: id(), reason: "Not ripe", items: [{ ...item, quantity: 1.5 }] }).success, false);
  assert.equal(bankSchema.safeParse({ bank: "Bank", accountName: "Customer", accountNumber: "0123456789" }).success, true);
  assert.equal(bankSchema.safeParse({ bank: "Bank", accountName: "Customer", accountNumber: "123" }).success, false);
});
function ledger(amount = 1000) {
  const owner = id(), creditId = id();
  type Allocation = { id: string; creditId: string; orderId: string; amount: number; state: string };
  type Transfer = { id: string; creditId: string; key: string; amount: number; state: string; reference: string | null };
  const credit = { id: creditId, orderId: id(), userId: owner, choice: "CREDIT", approvedAmount: amount, balance: amount, reserved: 0, spent: 0, locked: 0, refunded: 0, refundDueAt: new Date(Date.now() + 60000), bankDetails: { bank: "Test Bank", accountName: "Customer", accountNumber: "0123456789" } };
  const allocations: Allocation[] = [], transfers: Transfer[] = [];
  const invariant = () => {
    assert.equal(credit.approvedAmount, credit.balance + credit.reserved + credit.spent + credit.locked + credit.refunded);
    for (const field of [credit.balance, credit.reserved, credit.spent, credit.locked, credit.refunded]) assert.ok(field >= 0);
  };
  const fake = {
    dispute: { updateMany: async () => ({ count: 0 }) },
    returnCredit: {
      findMany: async () => credit.balance > 0 && (credit.refundDueAt > new Date()) && !transfers.some(t => t.state === "PENDING") ? [{ id: creditId, balance: credit.balance }] : [],
      findUnique: async () => structuredClone({ ...credit, transfers: transfers.filter(t => t.state === "PENDING") }),
      updateMany: async ({ where, data }: { where: { balance?: number | { gte: number }; reserved?: { gte: number }; locked?: { gte: number }; transfers?: unknown }; data: Record<string, { increment?: number; decrement?: number }> }) => {
        if (typeof where.balance === "number" && where.balance !== credit.balance || typeof where.balance === "object" && credit.balance < where.balance.gte || where.reserved && credit.reserved < where.reserved.gte || where.locked && credit.locked < where.locked.gte || where.transfers && transfers.some(t => t.state === "PENDING")) return { count: 0 };
        const record = credit as unknown as Record<string, number>;
        for (const [key, value] of Object.entries(data)) record[key] += (value.increment ?? 0) - (value.decrement ?? 0);
        invariant(); return { count: 1 };
      },
    },
    creditAllocation: {
      create: async ({ data }: { data: Omit<Allocation, "id"> }) => { const row = { ...data, id: id() }; allocations.push(row); return row; },
      findMany: async ({ where }: { where: { orderId: string; state: string } }) => allocations.filter(a => a.orderId === where.orderId && a.state === where.state).map(a => ({ ...a })),
      updateMany: async ({ where, data }: { where: { id: string; state: string }; data: { state: string } }) => { const row = allocations.find(a => a.id === where.id && a.state === where.state); if (!row) return { count: 0 }; Object.assign(row, data); return { count: 1 }; },
    },
    refundTransfer: {
      findUnique: async ({ where }: { where: { key?: string; id?: string } }) => transfers.find(t => where.key ? t.key === where.key : t.id === where.id) ?? null,
      findUniqueOrThrow: async ({ where }: { where: { id: string } }) => transfers.find(t => t.id === where.id)!,
      findFirst: async ({ where }: { where: { id: string; creditId: string } }) => transfers.find(t => t.id === where.id && t.creditId === where.creditId) ?? null,
      create: async ({ data }: { data: Omit<Transfer, "id" | "state" | "reference"> }) => { const row = { ...data, id: id(), state: "PENDING", reference: null }; transfers.push(row); return row; },
      updateMany: async ({ where, data }: { where: { id: string; state: string }; data: Partial<Transfer> }) => { const row = transfers.find(t => t.id === where.id && t.state === where.state); if (!row) return { count: 0 }; Object.assign(row, data); return { count: 1 }; },
    },
  };
  const tx = fake as unknown as Prisma.TransactionClient;
  return { tx, owner, credit, allocations, transfers, invariant,
    transfer: (key = id()) => { credit.choice = "CREDIT"; credit.refundDueAt = new Date(0); return transferCredit(tx, creditId, { action: "transfer", key }, id(), ignoreEvent, now); },
  };
}
test("Transfer locks the exact remainder; checkout cannot spend it", async () => {
  const h = ledger(); const payout = await h.transfer();
  assert.equal(payout.amount, 1000); assert.equal(h.credit.balance, 0); assert.equal(h.credit.locked, 1000);
  await assert.rejects(creditPlan(h.tx, h.owner, 500), /No spendable/);
  await assert.rejects(applyCredit(h.tx, h.owner, id(), [{ creditId: h.credit.id, amount: 500 }], true), /changed or was locked/);
  h.invariant();
});
test("partly spent credit leaves only the remainder for manual transfer", async () => {
  const h = ledger(); const orderId = id(); const plan = await creditPlan(h.tx, h.owner, 600);
  await applyCredit(h.tx, h.owner, orderId, plan.plan, true);
  const payout = await h.transfer(); assert.equal(payout.amount, 400);
  await transferCredit(h.tx, h.credit.id, { action: "confirm", transferId: payout.id, reference: "BANK-001" }, id(), ignoreEvent, now);
  assert.deepEqual([h.credit.spent, h.credit.refunded, h.credit.locked], [600, 400, 0]); h.invariant();
});
test("full use leaves nothing to refund; partial coverage calculates only the bank difference", async () => {
  const h = ledger(); const plan = await creditPlan(h.tx, h.owner, 1500);
  assert.deepEqual([plan.applied, plan.due], [1000, 500]);
  await applyCredit(h.tx, h.owner, id(), plan.plan, false);
  assert.equal(h.credit.reserved, 1000); await assert.rejects(h.transfer(), /No spendable/);
});
test("unpaid replacement cancellation returns reserved credit, without changing a locked transfer snapshot", async () => {
  const h = ledger(); const orderId = id(); const plan = await creditPlan(h.tx, h.owner, 600);
  await applyCredit(h.tx, h.owner, orderId, plan.plan, false); const payout = await h.transfer(); assert.equal(payout.amount, 400);
  await settleCredit(h.tx, orderId, "release"); assert.equal(h.credit.balance, 600); assert.equal(h.credit.locked, 400);
  await assert.rejects(creditPlan(h.tx, h.owner, 600), /No spendable/);
  await transferCredit(h.tx, h.credit.id, { action: "confirm", transferId: payout.id, reference: "BANK-002" }, id(), ignoreEvent, now);
  await assert.rejects(creditPlan(h.tx, h.owner, 600), /No spendable/); assert.equal(h.credit.balance, 600); h.invariant();
});
test("verification spends a reservation once; expiry/cancel releases it once", async () => {
  for (const action of ["spend", "release"] as const) {
    const h = ledger(), orderId = id(); const plan = await creditPlan(h.tx, h.owner, 600);
    await applyCredit(h.tx, h.owner, orderId, plan.plan, false);
    await settleCredit(h.tx, orderId, action); await settleCredit(h.tx, orderId, action);
    assert.equal(h.credit.reserved, 0); assert.equal(h.credit.spent, action === "spend" ? 600 : 0); h.invariant();
  }
});
test("20-minute server gate, saved bank details and transfer idempotency protect manual payouts", async () => {
  const h = ledger(); h.credit.refundDueAt = new Date(now.getTime() + refundWaitMs);
  await assert.rejects(transferCredit(h.tx, h.credit.id, { action: "transfer", key: id() }, id(), ignoreEvent, now), /20-minute/); h.credit.refundDueAt = now;
  const key = id(), first = await h.transfer(key), again = await h.transfer(key);
  assert.equal(first.id, again.id); assert.equal(h.transfers.length, 1);
  await transferCredit(h.tx, h.credit.id, { action: "confirm", transferId: first.id, reference: "BANK-003" }, id(), ignoreEvent, now);
  await transferCredit(h.tx, h.credit.id, { action: "confirm", transferId: first.id, reference: "BANK-003" }, id(), ignoreEvent, now);
  assert.equal(h.credit.refunded, 1000);
  await assert.rejects(transferCredit(h.tx, h.credit.id, { action: "confirm", transferId: first.id, reference: "OTHER" }, id(), ignoreEvent, now), /different reference/);
});
test("audited unlock restores credit but cannot unlock a completed transfer", async () => {
  const h = ledger(); const payout = await h.transfer();
  await transferCredit(h.tx, h.credit.id, { action: "unlock", transferId: payout.id, reason: "Checked bank: no transfer was sent" }, id(), ignoreEvent, now);
  assert.equal(h.credit.balance, 1000); assert.equal(h.credit.locked, 0); assert.equal(h.transfers[0].state, "CANCELLED"); h.invariant();
});
test("approval calculates paid line prices, prevents over-return and restocks only inspected fruit", async () => {
  const orderId = id(), userId = id(), itemId = id(), optionId = id();
  let restocked = 0;
  const item = { id: itemId, productOptionId: optionId, quantity: 2, unitPrice: 300, returnedItems: [] as { quantity: number }[] };
  const credits: { approvedAmount: number; deliveryRefund: number }[] = [];
  const tx = {
    returnCredit: { findUnique: async () => null, create: async ({ data }: { data: { approvedAmount: number; deliveryRefund: number } }) => { credits.push(data); return { ...data, id: id(), orderId, userId }; } },
    order: { findUnique: async () => ({ id: orderId, userId, user: { isActive: true }, paymentStatus: "SUCCESS", status: "DELIVERED", total: 700, deliveryFee: 100, items: [item], returnCredits: credits }), update: async () => ({}) },
    productOption: { update: async () => { restocked++; } },
  } as unknown as Prisma.TransactionClient;
  const input = approvalSchema.parse({ key: id(), reason: "Not ripe", items: [{ orderItemId: itemId, quantity: 1 }] });
  const result = await approveReturn(tx, orderId, input, id(), ignoreEvent, now);
  assert.equal(result.approvedAmount, 300); assert.equal(restocked, 0);
  item.returnedItems.push({ quantity: 1 });
  await assert.rejects(approveReturn(tx, orderId, { ...input, items: [{ ...input.items[0], quantity: 2 }] }, id(), ignoreEvent, now), /exceeds/);
  await approveReturn(tx, orderId, { ...input, key: id(), refundDelivery: true, items: [{ ...input.items[0], restock: true }] }, id(), ignoreEvent, now);
  assert.equal(restocked, 1); assert.equal(credits[1].approvedAmount, 400);
});

test("confirmed transfer cannot be unlocked and client-supplied refund amounts are rejected", async () => {
  const { transferSchema } = await import("./validation");
  assert.equal(transferSchema.safeParse({ action: "transfer", key: id(), amount: 1 }).success, false);
  const h = ledger(), payout = await h.transfer();
  await transferCredit(h.tx, h.credit.id, { action: "confirm", transferId: payout.id, reference: "BANK-DONE" }, id(), ignoreEvent, now);
  await assert.rejects(transferCredit(h.tx, h.credit.id, { action: "unlock", transferId: payout.id, reason: "An incorrect attempt to unlock" }, id(), ignoreEvent, now), /no longer/);
  h.invariant();
});
test("returns require authentication and refund administration requires an administrator", async () => {
  const { returnHandlers } = await import("./handlers");
  for (const [role, expected] of [[null, 401], ["CUSTOMER", 403]] as const) {
    const handlers = returnHandlers({ db: {} as PrismaClient, currentUser: async () => role ? { id: id(), role, name: null, email: null, image: null, phone: null, isActive: true } : null, readBody: async () => { throw Error("Must not read body"); } });
    assert.equal((await handlers.transfer(new Request("https://shop.example", { method: "POST" }), id())).status, expected);
    assert.equal((await handlers.order(new Request("https://shop.example", { method: "POST" }), id(), true)).status, expected);
  }
});

test("checkout pays fully with credit or exposes only the top-up, and retries never deduct twice", async () => {
  const { createCheckoutHandlers } = await import("../../controllers/checkout-handlers");
  for (const scenario of [{ total: 600, replacement: false }, { total: 1500, replacement: false }, { total: 600, replacement: true }]) {
    const total = scenario.total;
    const h = ledger(), productId = id(), optionId = id();
    const option = { id: optionId, productId, stock: 10, price: total, label: "One", detail: "", product: { name: "Apple", isAvailable: true, imageUrl: null } };
    const zone = { id: "zone", isAvailable: true, deliveryFee: scenario.replacement ? 100 : 0, estimatedMinutesMin: 10, estimatedMinutesMax: 20 };
    let saved: Record<string, unknown> | null = null;
    const replacementId = id(); let replacementClaims = 0;
    const tx = Object.assign(h.tx, {
      dispute: {
        findFirst: async () => scenario.replacement ? { id: replacementId, creditId: h.credit.id } : null,
        updateMany: async () => { replacementClaims++; return { count: 1 }; },
      },
      deliveryZone: { findUnique: async () => zone },
      productOption: { findMany: async () => [option], updateMany: async () => ({ count: 1 }) },
      order: {
        findUnique: async () => saved,
        create: async ({ data }: { data: Record<string, unknown> & { items: { create: unknown[] }; payment: { create: Record<string, unknown> } } }) => {
          saved = { status: "PENDING", paymentStatus: "PENDING", createdAt: new Date(), ...data, items: data.items.create, payment: data.payment.create };
          return saved;
        },
      },
    });
    const db = { ...tx, $transaction: async (run: (value: typeof tx) => Promise<unknown>) => run(tx) } as unknown as PrismaClient;
    const handlers = createCheckoutHandlers({ db, currentUser: async () => ({ id: h.owner, role: "CUSTOMER", name: null, email: null, image: null, phone: null, isActive: true }), readBody: r => r.json() });
    const key = id(); const request = () => new Request("https://shop.example/api/checkout", { method: "POST", headers: { "Idempotency-Key": key }, body: JSON.stringify({ useReturnCredit: true, ...(scenario.replacement ? { replacementDisputeId: replacementId } : {}), items: [{ productId, optionId, quantity: 1 }], deliveryAddress: { zoneId: "zone", streetOrClose: "Street", houseNumber: "1", phoneNumber: "08012345678" } }) });
    const response = await handlers.create(request()); assert.equal(response.status, 201);
    const result = await response.json();
    assert.equal(result.order.deliveryFee, 0);
    assert.equal(replacementClaims, scenario.replacement ? 1 : 0);
    assert.equal(result.order.creditApplied, Math.min(total, 1000));
    assert.equal(result.order.payment.amount, Math.max(0, total - 1000));
    assert.equal(result.order.paymentStatus, total <= 1000 ? "SUCCESS" : "PENDING");
    assert.equal(result.account === null, total <= 1000);
    const balance = h.credit.balance, allocations = h.allocations.length;
    assert.equal((await handlers.create(request())).status, 201);
    assert.equal(h.credit.balance, balance); assert.equal(h.allocations.length, allocations); h.invariant();
  }
});
