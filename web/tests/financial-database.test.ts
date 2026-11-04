import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";
import { approveReturn, transferCredit } from "../features/returns/service";
import { applyCredit } from "../features/returns/credit";
import { createDispute, decideDispute } from "../features/chat/service";
import { disputeSchema, decisionSchema } from "../features/chat/validation";
import { attachUploads } from "../features/uploads/service";
import { cleanupUploads } from "../features/uploads/handlers";
const enabled = !!process.env.TEST_DATABASE_URL;
const serial = { isolationLevel: "Serializable" as const };
const notify = async () => {};
async function fixture(
  run: (
    db: PrismaClient,
    data: Awaited<ReturnType<typeof seed>>,
  ) => Promise<void>,
) {
  const db = new PrismaClient({
    adapter: new PrismaPg({
      connectionString: process.env.TEST_DATABASE_URL!,
      max: 4,
    }),
  });
  const data = await seed(db);
  try {
    await run(db, data);
  } finally {
    const orders = { id: { in: [data.order.id, data.replacement.id] } };
    await db.dispute.deleteMany({ where: { userId: data.user.id } });
    await db.conversation.deleteMany({ where: { userId: data.user.id } });
    await db.creditAllocation.deleteMany({ where: { order: orders } });
    await db.refundTransfer.deleteMany({
      where: { credit: { orderId: data.order.id } },
    });
    await db.returnedItem.deleteMany({
      where: { credit: { orderId: data.order.id } },
    });
    await db.returnCredit.deleteMany({ where: { orderId: data.order.id } });
    await db.payment.deleteMany({ where: { order: orders } });
    await db.orderItem.deleteMany({ where: { order: orders } });
    await db.order.deleteMany({ where: orders });
    await db.productOption.deleteMany({
      where: { productId: data.product.id },
    });
    await db.product.delete({ where: { id: data.product.id } });
    await db.uploadAsset.deleteMany({ where: { userId: data.user.id } });
    await db.user.delete({ where: { id: data.user.id } });
    await db.deliveryZone.delete({ where: { id: data.zone.id } });
    await db.$disconnect();
  }
}
async function seed(db: PrismaClient) {
  const user = await db.user.create({
    data: { email: `${randomUUID()}@fixture.test` },
  });
  const zone = await db.deliveryZone.create({
    data: {
      id: randomUUID(),
      name: "Fixture",
      area: "Fixture",
      state: "Lagos",
      deliveryFee: 0,
      estimatedMinutesMin: 10,
      estimatedMinutesMax: 20,
    },
  });
  const product = await db.product.create({
    data: {
      name: "Fixture fruit",
      category: "FRUIT",
      options: {
        create: { size: "SMALL", label: "Fruit", price: 100, stock: 10 },
      },
    },
    include: { options: true },
  });
  const fields = {
    userId: user.id,
    deliveryZoneId: zone.id,
    deliveryAddress: {},
    deliveryFee: 0,
    itemSubtotal: 200,
    total: 200,
    estimatedDeliveryTime: "20 min",
    requestHash: "fixture",
  };
  const order = await db.order.create({
    data: {
      ...fields,
      status: "DELIVERED",
      paymentStatus: "SUCCESS",
      deliveryStatus: "DELIVERED",
      idempotencyKey: randomUUID(),
      items: {
        create: {
          productOptionId: product.options[0].id,
          name: product.name,
          optionLabel: "Fruit",
          optionDetail: "",
          quantity: 2,
          unitPrice: 100,
          subtotal: 200,
        },
      },
    },
    include: { items: true },
  });
  const replacement = await db.order.create({
    data: { ...fields, idempotencyKey: randomUUID() },
  });
  return { user, zone, product, order, replacement };
}
function approval(data: Awaited<ReturnType<typeof seed>>, quantity = 2) {
  return {
    key: randomUUID(),
    reason: "Inspected returned fruit",
    refundDelivery: false,
    items: [{ orderItemId: data.order.items[0].id, quantity, restock: false }],
  };
}

test(
  "PostgreSQL: dispute creation grants no money; partial approval starts the exact 20-minute window",
  { skip: !enabled },
  async () =>
    fixture(async (db, data) => {
      const dispute = await db.$transaction(
        (tx) =>
          createDispute(
            tx,
            data.user.id,
            disputeSchema.parse({
              key: randomUUID(),
              orderId: data.order.id,
              reason: "WRONG_ITEMS",
              body: "One fruit was incorrect",
              items: [{ orderItemId: data.order.items[0].id, quantity: 2 }],
            }),
          ),
        serial,
      );
      assert.equal(
        await db.returnCredit.count({ where: { orderId: data.order.id } }),
        0,
      );
      const now = new Date();
      await db.$transaction(
        (tx) =>
          decideDispute(
            tx,
            dispute.id,
            data.user.id,
            decisionSchema.parse({
              decision: "APPROVE",
              responsibility: "STORE",
              note: "One incorrect fruit approved",
              approvedItems: [
                { orderItemId: data.order.items[0].id, quantity: 1 },
              ],
            }),
            notify,
            now,
          ),
        serial,
      );
      const credit = await db.returnCredit.findFirstOrThrow({
        where: { orderId: data.order.id },
      });
      assert.equal(credit.balance, 100);
      assert.equal(credit.choice, "CREDIT");
      assert.equal(credit.refundDueAt.getTime(), now.getTime() + 20 * 60000);
      assert.deepEqual(
        (await db.dispute.findUniqueOrThrow({ where: { id: dispute.id } }))
          .approvedItems,
        [{ orderItemId: data.order.items[0].id, quantity: 1 }],
      );
    }),
);

test(
  "PostgreSQL: simultaneous full-return approvals cannot refund the same quantity twice",
  { skip: !enabled },
  async () =>
    fixture(async (db, data) => {
      const result = await Promise.allSettled(
        [1, 2].map(() =>
          db.$transaction(
            (tx) =>
              approveReturn(
                tx,
                data.order.id,
                approval(data),
                data.user.id,
                notify,
              ),
            serial,
          ),
        ),
      );
      assert.equal(
        result.filter((value) => value.status === "fulfilled").length,
        1,
      );
      assert.equal(
        await db.returnCredit.count({ where: { orderId: data.order.id } }),
        1,
      );
      assert.equal(
        (
          await db.returnedItem.aggregate({
            where: { orderItemId: data.order.items[0].id },
            _sum: { quantity: true },
          })
        )._sum.quantity,
        2,
      );
    }),
);

test(
  "PostgreSQL: concurrent transfer locks conserve money, prevent spending and require a unique confirmation",
  { skip: !enabled },
  async () =>
    fixture(async (db, data) => {
      const past = new Date(Date.now() - 21 * 60000);
      const credit = await db.$transaction(
        (tx) =>
          approveReturn(
            tx,
            data.order.id,
            approval(data),
            data.user.id,
            notify,
            past,
          ),
        serial,
      );
      await db.returnCredit.update({
        where: { id: credit.id },
        data: {
          bankDetails: {
            bank: "Fixture bank",
            accountNumber: "0123456789",
            accountName: "Fixture customer",
          },
        },
      });
      const results = await Promise.allSettled(
        [1, 2].map(() =>
          db.$transaction(
            (tx) =>
              transferCredit(
                tx,
                credit.id,
                { action: "transfer", key: randomUUID() },
                data.user.id,
                notify,
              ),
            serial,
          ),
        ),
      );
      assert.ok(results.some((value) => value.status === "fulfilled"));
      const locked = await db.returnCredit.findUniqueOrThrow({
        where: { id: credit.id },
      });
      assert.equal(locked.balance, 0);
      assert.equal(locked.locked, 200);
      assert.equal(
        await db.refundTransfer.count({
          where: { creditId: credit.id, state: "PENDING" },
        }),
        1,
      );
      await assert.rejects(
        db.$transaction(
          (tx) =>
            applyCredit(
              tx,
              data.user.id,
              data.replacement.id,
              [{ creditId: credit.id, amount: 100 }],
              true,
            ),
          serial,
        ),
      );
      const transfer = await db.refundTransfer.findFirstOrThrow({
        where: { creditId: credit.id },
      });
      await db.$transaction(
        (tx) =>
          transferCredit(
            tx,
            credit.id,
            {
              action: "confirm",
              transferId: transfer.id,
              reference: randomUUID(),
            },
            data.user.id,
            notify,
          ),
        serial,
      );
      const settled = await db.returnCredit.findUniqueOrThrow({
        where: { id: credit.id },
      });
      assert.equal(settled.refunded, 200);
      assert.equal(settled.locked, 0);
      await assert.rejects(
        db.returnCredit.update({
          where: { id: credit.id },
          data: { balance: 1 },
        }),
      );
      await assert.rejects(
        db.$transaction(
          (tx) =>
            transferCredit(
              tx,
              credit.id,
              {
                action: "unlock",
                transferId: transfer.id,
                reason: "Must not unlock a paid transfer",
              },
              data.user.id,
              notify,
            ),
          serial,
        ),
      );
    }),
);

test(
  "PostgreSQL: upload attachment rolls back with its transaction and cleanup never deletes attached evidence",
  { skip: !enabled },
  async () =>
    fixture(async (db, data) => {
      const id = randomUUID();
      await db.uploadAsset.create({
        data: {
          id,
          userId: data.user.id,
          purpose: "EVIDENCE",
          objectKey: `fixture/${id}`,
          url: `https://fixture.test/api/uploads/${id}/content`,
          contentType: "image/png",
          size: 12,
          state: "READY",
          uploadedAt: new Date(),
          expiresAt: new Date(Date.now() + 60000),
        },
      });
      await assert.rejects(
        db.$transaction(async (tx) => {
          await attachUploads(
            tx,
            data.user.id,
            [id],
            "EVIDENCE",
            "message:fixture",
          );
          throw Error("Message save failed");
        }, serial),
      );
      assert.equal(
        (await db.uploadAsset.findUniqueOrThrow({ where: { id } })).state,
        "READY",
      );
      await db.$transaction(
        (tx) =>
          attachUploads(tx, data.user.id, [id], "EVIDENCE", "message:fixture"),
        serial,
      );
      await db.uploadAsset.update({
        where: { id },
        data: { expiresAt: new Date(0) },
      });
      let deleted = 0;
      await cleanupUploads(db, {
        url: () => "",
        put: async () => {},
        get: async () => ({ bytes: new Uint8Array(), type: "image/png" }),
        remove: async () => {
          deleted++;
        },
      });
      assert.equal(deleted, 0);
      await assert.rejects(
        db.$transaction(
          (tx) =>
            attachUploads(
              tx,
              data.user.id,
              [id],
              "EVIDENCE",
              "message:another",
            ),
          serial,
        ),
      );
    }),
);
test(
  "PostgreSQL: message history reaches beyond 500 records without duplicates",
  { skip: !enabled },
  async () =>
    fixture(async (db, data) => {
      const { messagePage, messageWindow } =
        await import("../features/chat/history");
      const thread = await db.conversation.create({
        data: { userId: data.user.id, subject: "Long fixture conversation" },
      });
      await db.conversationMessage.createMany({
        data: Array.from({ length: 501 }, () => ({
          conversationId: thread.id,
          body: "Fixture history",
          createdAt: new Date("2026-10-29T10:00:00Z"),
        })),
      });
      const ids = new Set<string>();
      let cursor: string | null = null,
        pages = 0;
      do {
        const result: {
          messages: { id: string }[];
          nextMessageCursor: string | null;
        } = messagePage(
          await db.conversation.findUniqueOrThrow({
            where: { id: thread.id },
            include: { messages: messageWindow(thread.id, cursor) },
          }),
        )!;
        result.messages.forEach((message) => {
          assert.ok(!ids.has(message.id));
          ids.add(message.id);
        });
        cursor = result.nextMessageCursor;
        pages++;
      } while (cursor);
      assert.equal(ids.size, 501);
      assert.equal(pages, 26);
    }),
);
test(
  "PostgreSQL: realtime hints commit atomically and failed publishing retains the outbox",
  { skip: !enabled },
  async () =>
    fixture(async (db, data) => {
      const { recordChange, flushChanges } =
        await import("../features/realtime/publication");
      const old = process.env.SSE_ENABLED;
      process.env.SSE_ENABLED = "true";
      try {
        const event = {
          kind: "order",
          userId: data.user.id,
          entityId: data.order.id,
        };
        await assert.rejects(
          db.$transaction(async (tx) => {
            await recordChange(tx, event);
            throw Error("Rollback");
          }, serial),
        );
        assert.equal(await db.realtimeSignal.count(), 0);
        await db.$transaction((tx) => recordChange(tx, event), serial);
        const bus = {
          subscribe: async () => () => {},
          publish: async () => {
            throw Error("Redis offline");
          },
        };
        await flushChanges(db, bus);
        assert.equal(await db.realtimeSignal.count(), 1);
        let published = 0;
        await flushChanges(db, {
          ...bus,
          publish: async () => {
            published++;
          },
        });
        assert.equal(published, 1);
        assert.equal(await db.realtimeSignal.count(), 0);
      } finally {
        if (old === undefined) delete process.env.SSE_ENABLED;
        else process.env.SSE_ENABLED = old;
        await db.realtimeSignal.deleteMany({ where: { userId: data.user.id } });
      }
    }),
);
test("PostgreSQL: expiry racing a payment report never restores stock for a protected payment", { skip: !enabled }, async () => fixture(async (db, data) => {
  const { expireReservations } = await import("../services/order-maintenance");
  const { createCheckoutHandlers } = await import("../controllers/checkout-handlers");
  await db.order.update({ where: { id: data.replacement.id }, data: { createdAt: new Date(Date.now() - 25 * 3600000), items: { create: { productOptionId: data.product.options[0].id, name: "Reserved fruit", optionLabel: "Two", optionDetail: "", quantity: 2, unitPrice: 100, subtotal: 200 } }, payment: { create: { amount: 200, provider: "manual_transfer", providerReference: randomUUID() } } } });
  await db.productOption.update({ where: { id: data.product.options[0].id }, data: { stock: 8 } });
  const handlers = createCheckoutHandlers({ db, currentUser: async () => ({ id: data.user.id, role: "CUSTOMER", isActive: true, name: null, email: null, image: null, phone: null }), readBody: request => request.json() });
  await Promise.allSettled([expireReservations(db), handlers.action(new Request("https://fixture.test/api/orders", { method: "POST", body: JSON.stringify({ action: "reported" }) }), data.replacement.id)]);
  const result = await db.order.findUniqueOrThrow({ where: { id: data.replacement.id } });
  const stock = (await db.productOption.findUniqueOrThrow({ where: { id: data.product.options[0].id } })).stock;
  if (result.status === "CANCELLED") { assert.equal(result.paymentStatus, "FAILED"); assert.equal(stock, 10); }
  else { assert.equal(result.paymentStatus, "REVIEW_REQUIRED"); assert.equal(stock, 8); }
  assert.equal(await expireReservations(db), 0);
}));
test("PostgreSQL: an in-flight credit debit and a later transfer lock cannot spend/refund the same money", { skip: !enabled }, async () => fixture(async (db, data) => {
  const credit = await db.$transaction(tx => approveReturn(tx, data.order.id, approval(data), data.user.id, notify), serial);
  await db.returnCredit.update({ where: { id: credit.id }, data: { bankDetails: { bank: "Fixture", accountNumber: "0123456789", accountName: "Fixture customer" } } });
  let debited!: () => void, release!: () => void;
  const started = new Promise<void>(resolve => { debited = resolve; }), proceed = new Promise<void>(resolve => { release = resolve; });
  const spend = db.$transaction(async tx => { await applyCredit(tx, data.user.id, data.replacement.id, [{ creditId: credit.id, amount: 100 }], true); debited(); await proceed; }, serial);
  await Promise.race([started, spend]);
  // Inject the transfer's later clock to model crossing the deadline without a 20-minute test wait.
  const later = new Date(credit.refundDueAt.getTime() + 1);
  const transfer = db.$transaction(tx => transferCredit(tx, credit.id, { action: "transfer", key: randomUUID() }, data.user.id, notify, later), serial);
  release(); await spend; await Promise.allSettled([transfer]);
  await db.$transaction(tx => transferCredit(tx, credit.id, { action: "transfer", key: randomUUID() }, data.user.id, notify, later), serial);
  const final = await db.returnCredit.findUniqueOrThrow({ where: { id: credit.id } });
  assert.equal(final.spent, 100); assert.equal(final.locked, 100); assert.equal(final.balance, 0); assert.equal(final.approvedAmount, final.spent + final.locked);
}));
