import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "../../generated/prisma/client";
import { disputeSchema, evidenceSchema, decisionSchema } from "./validation";
import { refundPolicy } from "./policy";
import { createDispute, decideDispute } from "./service";
import { returnHandlers } from "../returns/handlers";
import { disputeHandlers } from "./handlers";
import { ignoreEvent } from "../../server/notifications/events";
const id = () => randomUUID();

test("disputes validate affected items, evidence protocols and default buy-again choice", () => {
  const input = { key: id(), orderId: id(), reason: "SPOILT", body: "The fruit is spoiled", items: [{ orderItemId: id(), quantity: 1 }] };
  assert.equal(disputeSchema.parse(input).requestedChoice, "CREDIT");
  assert.equal(disputeSchema.safeParse({ ...input, items: [input.items[0], input.items[0]] }).success, false);
  assert.equal(evidenceSchema.safeParse(["javascript:alert(1)"]).success, false);
  assert.equal(evidenceSchema.safeParse(["https://user:password@example.com/image"]).success, false);
  assert.equal(evidenceSchema.safeParse(["https://example.com/photo.jpg"]).success, true);
});
test("refund policy separates whole-order business fault, partial issues and reviewed exceptions", () => {
  assert.equal(refundPolicy("STORE_CANCELLED", "STORE", true).refundDelivery, true);
  assert.equal(refundPolicy("SPOILT", "RIDER", true).refundDelivery, true);
  assert.equal(refundPolicy("MISSING_ITEMS", "STORE", false).refundDelivery, false);
  assert.equal(refundPolicy("CHANGE_OF_MIND", "CUSTOMER", true).refundDelivery, false);
  assert.throws(() => refundPolicy("FAILED_DELIVERY", "CUSTOMER", true), /exception/);
  assert.throws(() => refundPolicy("SPOILT", "STORE", true, false), /differs/);
  assert.equal(refundPolicy("SPOILT", "STORE", true, false, "Customer agreed delivery was unaffected").refundDelivery, false);
});
test("dispute creation verifies paid ownership and persists case plus message without credit", async () => {
  const userId = id(), orderId = id(), itemId = id(), conversationId = id();
  let creates = 0;
  const tx = {
    dispute: { findUnique: async () => null, findFirst: async () => null, create: async ({ data }: { data: object }) => ({ ...data, id: id() }) },
    order: { findFirst: async ({ where }: { where: { userId: string } }) => { assert.equal(where.userId, userId); return { id: orderId, paymentStatus: "SUCCESS", items: [{ id: itemId, quantity: 2 }] }; } },
    conversation: { create: async ({ data }: { data: { kind: string; messages: { create: { body: string } } } }) => { creates++; assert.equal(data.kind, "DISPUTE"); assert.equal(data.messages.create.body, "Spoiled fruit"); return { id: conversationId }; } },
  } as unknown as Prisma.TransactionClient;
  const result = await createDispute(tx, userId, disputeSchema.parse({ key: id(), orderId, reason: "SPOILT", body: "Spoiled fruit", items: [{ orderItemId: itemId, quantity: 1 }] }));
  assert.equal(result.conversationId, conversationId); assert.equal(creates, 1);
  await assert.rejects(createDispute(tx, userId, disputeSchema.parse({ key: id(), orderId, reason: "SPOILT", body: "Spoiled fruit", items: [{ orderItemId: id(), quantity: 1 }] })), /belong/);
});
function decisionFixture() {
  const userId = id(), orderId = id(), itemId = id();
  const order = { id: orderId, userId, user: { isActive: true }, paymentStatus: "SUCCESS", status: "DELIVERED", total: 700, deliveryFee: 100, items: [{ id: itemId, quantity: 2, unitPrice: 300, returnedItems: [] }], returnCredits: [] };
  const dispute = { id: id(), userId, orderId, conversationId: id(), status: "OPEN", reason: "SPOILT", requestedChoice: "BANK_REFUND", items: [{ orderItemId: itemId, quantity: 2 }], order };
  let credit: Record<string, unknown> | null = null;
  const tx = {
    dispute: { findUnique: async () => ({ ...dispute }), updateMany: async ({ data }: { data: object }) => { Object.assign(dispute, data); return { count: 1 }; } },
    order: { findUnique: async () => order, update: async ({ data }: { data: object }) => { Object.assign(order, data); return order; } },
    returnCredit: { findUnique: async () => null, create: async ({ data }: { data: object }) => { credit = { id: id(), choice: "BANK_REFUND", ...data }; return credit; }, update: async ({ data }: { data: object }) => { Object.assign(credit!, data); return credit; } },
    productOption: { update: async () => { throw Error("Disputes must not restock automatically"); } },
    conversation: { update: async () => ({}) },
  } as unknown as Prisma.TransactionClient;
  return { tx, dispute, order, credit: () => credit };
}
test("approval starts a new 20-minute window and credits goods plus policy delivery without a physical return", async () => {
  const h = decisionFixture(), now = new Date("2026-10-29T12:00:00Z");
  await decideDispute(h.tx, h.dispute.id, id(), decisionSchema.parse({ decision: "APPROVE", responsibility: "STORE", note: "Verified spoiled fruit" }), ignoreEvent, now);
  assert.equal(h.credit()!.approvedAmount, 700);
  assert.equal((h.credit()!.refundDueAt as Date).getTime(), now.getTime() + 1200000);
  assert.equal(h.order.status, "RESOLVED"); assert.equal(h.dispute.status, "APPROVED");
  await assert.rejects(decideDispute(h.tx, h.dispute.id, id(), decisionSchema.parse({ decision: "APPROVE", responsibility: "STORE", note: "Duplicate decision" }), ignoreEvent), /already/);
});
test("rejection records an explanation but creates no financial credit", async () => {
  const h = decisionFixture();
  await decideDispute(h.tx, h.dispute.id, id(), decisionSchema.parse({ decision: "REJECT", responsibility: "CUSTOMER", note: "Reviewed evidence and explained decision" }), ignoreEvent);
  assert.equal(h.credit(), null); assert.equal(h.dispute.status, "REJECTED");
});
test("choice changes require ownership and strictly precede the server deadline", async () => {
  const owner = id(), creditId = id(); let choice = "BANK_REFUND", deadline = Date.now() + 60000;
  const tx = {
    returnCredit: { updateMany: async ({ where, data }: { where: { userId: string; refundDueAt: { gt: Date } }; data: { choice: string } }) => {
      if (where.userId !== owner || where.refundDueAt.gt.getTime() >= deadline) return { count: 0 };
      choice = data.choice; return { count: 1 };
    } }, dispute: { findUnique: async () => null },
  };
  const db = { $transaction: async (run: (value: typeof tx) => Promise<unknown>) => run(tx) } as unknown as PrismaClient;
  const handlers = returnHandlers({ db, currentUser: async () => ({ id: owner, role: "CUSTOMER", name: null, email: null, phone: null, image: null, isActive: true }), readBody: r => r.json() });
  const request = (value: string) => new Request("https://shop.example", { method: "PATCH", body: JSON.stringify({ choice: value }) });
  assert.equal((await handlers.choice(request("CREDIT"), creditId)).status, 200); assert.equal(choice, "CREDIT");
  deadline = Date.now() - 1;
  assert.equal((await handlers.choice(request("BANK_REFUND"), creditId)).status, 409); assert.equal(choice, "CREDIT");
});
test("customer cannot decide a dispute or bypass admin checks", async () => {
  const handlers = disputeHandlers({ db: {} as PrismaClient, currentUser: async () => ({ id: id(), role: "CUSTOMER", name: null, email: null, phone: null, image: null, isActive: true }), readBody: async () => { throw Error("Must not read body"); }, allowAttempt: async () => true, notify: ignoreEvent, kick: async () => {} });
  assert.equal((await handlers.decide(new Request("https://shop.example", { method: "POST" }), id())).status, 403);
});

test("all unspent balances expire into refund regardless of the earlier buying/replacement choice", async () => {
  const { creditPlan } = await import("../returns/credit");
  const { choiceAt } = await import("../returns/window");
  const owner = id(), creditId = id(); let due = Date.now() + 60000;
  const tx = { returnCredit: { findMany: async ({ where }: { where: { userId: string; refundDueAt: { gt: Date } } }) => {
    assert.equal(where.userId, owner);
    return due > where.refundDueAt.gt.getTime() ? [{ id: creditId, balance: 500 }] : [];
  } } } as unknown as Prisma.TransactionClient;
  assert.equal((await creditPlan(tx, owner, 500)).applied, 500);
  due = 0;
  for (const choice of ["BANK_REFUND", "CREDIT", "REPLACEMENT"]) {
    await assert.rejects(creditPlan(tx, owner, 500), /No spendable/);
    assert.equal(choiceAt({ choice, refundDueAt: new Date(0) }).choice, "BANK_REFUND");
  }
});

test("only admin-approved partial quantities create money and start a fresh approval-based clock", async () => {
  const h = decisionFixture(), approvedAt = new Date("2026-10-29T15:00:00Z");
  assert.equal(h.credit(), null); // An existing/open complaint has no spendable balance or refund timer.
  await decideDispute(h.tx, h.dispute.id, id(), decisionSchema.parse({
    decision: "APPROVE", responsibility: "STORE", note: "Only one of the two fruit units was spoiled",
    approvedItems: [{ orderItemId: h.order.items[0].id, quantity: 1 }],
  }), ignoreEvent, approvedAt);
  assert.equal(h.credit()!.approvedAmount, 300);
  assert.equal(h.credit()!.deliveryRefund, 0);
  assert.equal((h.credit()!.refundDueAt as Date).getTime(), approvedAt.getTime() + 1200000);
  assert.deepEqual((h.dispute as unknown as { approvedItems: unknown }).approvedItems, [{ orderItemId: h.order.items[0].id, quantity: 1 }]);
});
test("approving outside the disputed quantities is rejected before creating credit", async () => {
  const h = decisionFixture();
  await assert.rejects(decideDispute(h.tx, h.dispute.id, id(), decisionSchema.parse({ decision: "APPROVE", responsibility: "STORE", note: "Review of reported goods", approvedItems: [{ orderItemId: h.order.items[0].id, quantity: 3 }] }), ignoreEvent), /within/);
  assert.equal(h.credit(), null); assert.equal(h.dispute.status, "OPEN");
});

test("home/shop summary exposes only approved spendable money, then only the unused refund remainder", async () => {
  const owner = id(); let grant: { balance: number; locked: number; deadline: Date } | null = null;
  const db = {
    returnCredit: {
      aggregate: async ({ where }: { where: { userId: string; refundDueAt: { gt?: Date; lte?: Date } } }) => {
        assert.equal(where.userId, owner);
        const qualifies = grant && (where.refundDueAt.gt ? grant.deadline > where.refundDueAt.gt : grant.deadline <= where.refundDueAt.lte!);
        return { _sum: { balance: qualifies ? grant!.balance : null, locked: qualifies ? grant!.locked : null } };
      },
      findFirst: async () => grant && grant.balance > 0 && grant.deadline > new Date() ? { refundDueAt: grant.deadline } : null,
    }, dispute: { findMany: async () => [] },
  } as unknown as PrismaClient;
  const handlers = returnHandlers({ db, currentUser: async () => ({ id: owner, role: "CUSTOMER", name: null, email: null, phone: null, image: null, isActive: true }), readBody: r => r.json() });
  let result = await (await handlers.balance()).json();
  assert.equal(result.available, 0); assert.equal(result.pendingRefund, 0); // Complaint alone creates no card amount.
  grant = { balance: 300, locked: 0, deadline: new Date(Date.now() + 60000) };
  result = await (await handlers.balance()).json(); assert.equal(result.available, 300); assert.equal(result.pendingRefund, 0);
  grant.balance = 120; grant.deadline = new Date(0);
  result = await (await handlers.balance()).json(); assert.equal(result.available, 0); assert.equal(result.pendingRefund, 120);
  grant.balance = 0; grant.locked = 120;
  result = await (await handlers.balance()).json(); assert.equal(result.pendingRefund, 120);
  grant.locked = 0;
  result = await (await handlers.balance()).json(); assert.equal(result.pendingRefund, 0);
});
