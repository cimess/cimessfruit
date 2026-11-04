import { createHash } from "node:crypto";
import type { Prisma } from "../../generated/prisma/client";
import type { WriteEvent } from "../../server/notifications/events";
import { approvalSchema, bankSchema, refundWaitMs, ReturnError, transferSchema } from "./validation";
import type { z } from "zod";

async function notice(tx: Prisma.TransactionClient, notify: WriteEvent, credit: { id: string; orderId: string; userId: string | null }, action: string, body: string) {
  if (credit.userId) await notify(tx, { key: `return:${credit.id}:${action}`, kind: "order", entityId: credit.orderId, userId: credit.userId, title: "Return and refund update", body });
}
export async function approveReturn(tx: Prisma.TransactionClient, orderId: string, input: z.infer<typeof approvalSchema>, adminId: string, notify: WriteEvent, now = new Date(), sourceKind: "RETURN" | "DISPUTE" = "RETURN") {
  const canonical = { ...input, items: [...input.items].sort((a, b) => a.orderItemId.localeCompare(b.orderItemId)) };
  const requestHash = createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
  const previous = await tx.returnCredit.findUnique({ where: { approvalKey: input.key } });
  if (previous) {
    if (previous.orderId !== orderId || previous.requestHash !== requestHash) throw new ReturnError("Return reference belongs to different details.");
    return previous;
  }
  const order = await tx.order.findUnique({ where: { id: orderId }, include: {
    items: { include: { returnedItems: { select: { quantity: true } } } }, returnCredits: { select: { approvedAmount: true, deliveryRefund: true } }, user: { select: { isActive: true } },
  } });
  if (!order?.userId || !order.user?.isActive || order.paymentStatus !== "SUCCESS" || !["PAID", "PROCESSING", "DISPATCHED", "DELIVERED", "RETURNED", "RESOLVED"].includes(order.status)) throw new ReturnError("Only a paid order linked to an active customer can receive return credit.");
  const returned = canonical.items.map(line => {
    const item = order.items.find(item => item.id === line.orderItemId);
    if (!item || line.quantity + item.returnedItems.reduce((sum, prior) => sum + prior.quantity, 0) > item.quantity) throw new ReturnError("Returned quantity exceeds the quantity still eligible for return.");
    return { item, line, amount: item.unitPrice * line.quantity };
  });
  const deliveryRefund = input.refundDelivery ? order.deliveryFee - order.returnCredits.reduce((sum, credit) => sum + credit.deliveryRefund, 0) : 0;
  if (input.refundDelivery && deliveryRefund <= 0) throw new ReturnError("Delivery has already been refunded or had no fee.");
  const amount = deliveryRefund + returned.reduce((sum, item) => sum + item.amount, 0);
  const approvedAlready = order.returnCredits.reduce((sum, credit) => sum + credit.approvedAmount, 0);
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount + approvedAlready > order.total) throw new ReturnError("Return amount exceeds the remaining paid order value.");
  const credit = await tx.returnCredit.create({ data: {
    orderId, userId: order.userId, approvalKey: input.key, requestHash, approvedBy: adminId, reason: input.reason,
    approvedAmount: amount, balance: amount, deliveryRefund, choice: "CREDIT", refundDueAt: new Date(now.getTime() + refundWaitMs),
    items: { create: returned.map(({ item, line, amount }) => ({ orderItemId: item.id, quantity: line.quantity, amount, restocked: line.restock })) },
  } });
  for (const { item, line } of returned) if (line.restock) await tx.productOption.update({ where: { id: item.productOptionId }, data: { stock: { increment: line.quantity } } });
  const fullReturn = order.items.every(item => item.returnedItems.reduce((sum, prior) => sum + prior.quantity, 0) + (canonical.items.find(line => line.orderItemId === item.id)?.quantity ?? 0) === item.quantity);
  if (fullReturn) await tx.order.update({ where: { id: orderId }, data: { status: sourceKind === "RETURN" ? "RETURNED" : "RESOLVED", ...(sourceKind === "RETURN" ? { deliveryStatus: "RETURNED" } : {}) } });
  await notice(tx, notify, credit, "approved", "Your return was approved. Buy again using the approved amount within 20 minutes. Any unspent balance then goes to the manual bank refund flow.");
  return credit;
}

export async function transferCredit(tx: Prisma.TransactionClient, creditId: string, input: z.infer<typeof transferSchema>, adminId: string, notify: WriteEvent, now = new Date()) {
  const credit = await tx.returnCredit.findUnique({ where: { id: creditId }, include: { transfers: { where: { state: "PENDING" } } } });
  if (!credit) throw new ReturnError("Return credit not found.", 404);
  if (input.action === "transfer") {
    const previous = await tx.refundTransfer.findUnique({ where: { key: input.key } });
    if (previous) {
      if (previous.creditId !== creditId) throw new ReturnError("Transfer reference belongs to another refund.");
      return previous;
    }
    if (credit.transfers[0]) return credit.transfers[0];
    if (now < credit.refundDueAt) throw new ReturnError("Wait until the 20-minute refund window has elapsed before starting a transfer.");
    if (!credit.userId || credit.balance <= 0) throw new ReturnError("No spendable remainder is available for transfer.");
    const bank = bankSchema.safeParse(credit.bankDetails);
    if (!bank.success) throw new ReturnError("The customer must save their refund bank details first.");
    const claimed = await tx.returnCredit.updateMany({ where: {
      id: creditId, balance: credit.balance, transfers: { none: { state: "PENDING" } },
    }, data: { balance: { decrement: credit.balance }, locked: { increment: credit.balance } } });
    if (claimed.count !== 1) throw new ReturnError("Credit changed during transfer preparation. Refresh and try again.");
    const transfer = await tx.refundTransfer.create({ data: { creditId, key: input.key, amount: credit.balance, bankDetails: bank.data, startedBy: adminId } });
    await notice(tx, notify, credit, `locked:${transfer.id}`, "The store has locked your remaining refund for a manual bank transfer. That amount can no longer be used at checkout.");
    return transfer;
  }
  const transfer = await tx.refundTransfer.findFirst({ where: { id: input.transferId, creditId } });
  if (!transfer) throw new ReturnError("Transfer not found.", 404);
  if (input.action === "confirm" && transfer.state === "COMPLETED") {
    if (transfer.reference !== input.reference) throw new ReturnError("This transfer was already confirmed with a different reference.");
    return transfer;
  }
  if (input.action === "unlock" && transfer.state === "CANCELLED") return transfer;
  if (transfer.state !== "PENDING") throw new ReturnError("This transfer can no longer be changed.");
  const claimed = await tx.refundTransfer.updateMany({ where: { id: transfer.id, state: "PENDING" }, data: input.action === "confirm" ? {
    state: "COMPLETED", reference: input.reference, completedBy: adminId, completedAt: now,
  } : { state: "CANCELLED", cancellationReason: input.reason, completedBy: adminId, completedAt: now } });
  if (claimed.count !== 1) throw new ReturnError("Transfer changed. Refresh before trying again.");
  const balanced = await tx.returnCredit.updateMany({ where: { id: creditId, locked: { gte: transfer.amount } }, data: {
    locked: { decrement: transfer.amount }, ...(input.action === "confirm" ? { refunded: { increment: transfer.amount } } : { balance: { increment: transfer.amount } }),
  } });
  if (balanced.count !== 1) throw new ReturnError("Refund balance requires review.");
  await notice(tx, notify, credit, `${input.action}:${transfer.id}`, input.action === "confirm" ? "The store has recorded your manual refund transfer as completed." : "The store cancelled the transfer before sending money. Your credit is available again.");
  return tx.refundTransfer.findUniqueOrThrow({ where: { id: transfer.id } });
}
