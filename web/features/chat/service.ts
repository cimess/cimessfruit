import { attachUploads } from "../uploads/service";
import { createHash } from "node:crypto";
import type { Prisma } from "../../generated/prisma/client";
import type { z } from "zod";
import { disputeSchema, decisionSchema } from "./validation";
import { refundPolicy } from "./policy";
import { approveReturn } from "../returns/service";
import { ReturnError } from "../returns/validation";
import type { WriteEvent } from "../../server/notifications/events";

export async function createDispute(tx: Prisma.TransactionClient, userId: string, input: z.infer<typeof disputeSchema>) {
  const canonical = { ...input, items: [...input.items].sort((a, b) => a.orderItemId.localeCompare(b.orderItemId)) };
  const requestHash = createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
  const existing = await tx.dispute.findUnique({ where: { key: input.key }, select: { id: true, requestHash: true, userId: true, conversationId: true } });
  if (existing) {
    if (existing.userId !== userId || existing.requestHash !== requestHash) throw new ReturnError("Dispute reference belongs to different details.");
    return existing;
  }
  const order = await tx.order.findFirst({ where: { id: input.orderId, userId }, select: { id: true, paymentStatus: true, items: { select: { id: true, quantity: true } } } });
  if (!order) throw new ReturnError("Order not found.", 404);
  if (order.paymentStatus !== "SUCCESS") throw new ReturnError("Use Chat for unpaid orders. Disputes resolve paid orders.");
  if (input.items.some(line => !order.items.some(item => item.id === line.orderItemId && item.quantity >= line.quantity))) throw new ReturnError("Disputed items must belong to this order and stay within ordered quantities.");
  const open = await tx.dispute.findFirst({ where: { orderId: order.id, status: "OPEN" } });
  if (open) throw new ReturnError("This order already has an open dispute. Continue its message thread.");
  const files = await attachUploads(tx, userId, input.uploadIds ?? [], "EVIDENCE", `dispute:${input.key}`);
  if (files.length + input.evidenceUrls.length > 3) throw new ReturnError("Use up to three evidence images or links.");
  const conversation = await tx.conversation.create({ data: {
    kind: "DISPUTE", userId, orderId: order.id, subject: `Dispute: ${input.reason.replaceAll("_", " ")} · ${order.id.slice(0, 8)}`,
    messages: { create: { body: input.body, evidenceUrls: [...input.evidenceUrls, ...files.map(file => file.url)] } },
  } });
  return tx.dispute.create({ data: { key: input.key, requestHash, userId, orderId: order.id, conversationId: conversation.id,
    reason: input.reason, items: canonical.items, requestedChoice: input.requestedChoice,
  } });
}

export async function decideDispute(tx: Prisma.TransactionClient, disputeId: string, adminId: string, input: z.infer<typeof decisionSchema>, notify: WriteEvent, now = new Date()) {
  const dispute = await tx.dispute.findUnique({ where: { id: disputeId }, include: { order: { include: { items: true } } } });
  if (!dispute) throw new ReturnError("Dispute not found.", 404);
  if (dispute.status !== "OPEN") throw new ReturnError("This dispute has already been decided. Refresh its thread.");
  let creditId: string | null = null;
  let approvedItems: { orderItemId: string; quantity: number }[] | null = null;
  if (input.decision === "APPROVE") {
    const requestedItems = dispute.items as { orderItemId: string; quantity: number }[];
    const items = input.approvedItems ?? requestedItems;
    if (items.some(line => !requestedItems.some(requested => requested.orderItemId === line.orderItemId && requested.quantity >= line.quantity))) throw new ReturnError("Approved quantities must be within the customer’s disputed items.");
    approvedItems = items;
    const wholeOrder = dispute.order.items.every(item => items.some(line => line.orderItemId === item.id && line.quantity === item.quantity));
    if (["STORE_CANCELLED", "WRONG_ORDER"].includes(dispute.reason) && !wholeOrder && !input.overrideReason) throw new ReturnError("Explain why only part of this whole-order issue is approved.");
    const policy = refundPolicy(dispute.reason, input.responsibility, wholeOrder, input.deliveryOverride, input.overrideReason);
    const credit = await approveReturn(tx, dispute.orderId, {
      key: dispute.id, reason: `${dispute.reason}: ${input.note}${input.overrideReason ? ` Override: ${input.overrideReason}` : ""}`.slice(0, 500),
      refundDelivery: policy.refundDelivery && dispute.order.deliveryFee > 0,
      items: items.map(line => ({ ...line, restock: false })),
    }, adminId, notify, now, "DISPUTE");
    const effectiveChoice = input.choiceOverride ?? dispute.requestedChoice;
    await tx.returnCredit.update({ where: { id: credit.id }, data: { choice: effectiveChoice } });
    creditId = credit.id;
  }
  const changed = await tx.dispute.updateMany({ where: { id: dispute.id, status: "OPEN" }, data: {
    status: input.decision === "APPROVE" ? "APPROVED" : "REJECTED", creditId, ...(approvedItems ? { approvedItems } : {}), responsibility: input.responsibility,
    decisionNote: `${input.note}${input.overrideReason ? ` Override: ${input.overrideReason}` : ""}`, decidedBy: adminId, decidedAt: now,
  } });
  if (changed.count !== 1) throw new ReturnError("Dispute changed. Please retry.");
  await tx.conversation.update({ where: { id: dispute.conversationId }, data: {
    updatedAt: now, messages: { create: { fromAdmin: true,
      body: `${input.decision === "APPROVE" ? "Resolution approved for the selected items. Buy again within 20 minutes; any unused approved balance goes to a bank refund afterward." : "Resolution declined."} ${input.note}`,
    } },
  } });
  await notify(tx, { key: `dispute:${dispute.id}:decision`, kind: "order", entityId: dispute.orderId, userId: dispute.userId,
    title: "Dispute update", body: input.decision === "APPROVE" ? "Your dispute resolution was approved. Open Chat to review your 20-minute choice window." : "The store reviewed your dispute. Open Chat for its decision and explanation.",
  });
  return { creditId };
}
