import type { Prisma } from "../../generated/prisma/client";
import { ReturnError } from "./validation";

export function spendableChoice(now = new Date()): Prisma.ReturnCreditWhereInput {
  return { refundDueAt: { gt: now } };
}

export async function creditPlan(tx: Prisma.TransactionClient, userId: string, total: number, preferredCreditId?: string) {
  const credits = await tx.returnCredit.findMany({ where: {
    userId, ...spendableChoice(), balance: { gt: 0 }, transfers: { none: { state: "PENDING" } },
  }, select: { id: true, balance: true }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: 101 });
  if (preferredCreditId) {
    if (!credits.some(credit => credit.id === preferredCreditId)) throw new ReturnError("Replacement credit is no longer available.");
    credits.sort((a, b) => Number(b.id === preferredCreditId) - Number(a.id === preferredCreditId));
  }
  let remaining = total;
  const plan: { creditId: string; amount: number }[] = [];
  for (const credit of credits.slice(0, 100)) {
    const amount = Math.min(remaining, credit.balance);
    if (amount > 0) plan.push({ creditId: credit.id, amount });
    remaining -= amount;
    if (!remaining) break;
  }
  if (remaining && credits.length > 100) throw new ReturnError("Too many separate return credits. Contact the store before checkout.");
  if (!plan.length) throw new ReturnError("No spendable return credit remains. Refresh checkout; a refund may have been locked for transfer.");
  return { plan, applied: total - remaining, due: remaining };
}
export async function applyCredit(tx: Prisma.TransactionClient, userId: string, orderId: string, plan: { creditId: string; amount: number }[], paid: boolean) {
  for (const line of plan) {
    const changed = await tx.returnCredit.updateMany({ where: {
      id: line.creditId, userId, ...spendableChoice(), balance: { gte: line.amount }, transfers: { none: { state: "PENDING" } },
    }, data: { balance: { decrement: line.amount }, ...(paid ? { spent: { increment: line.amount } } : { reserved: { increment: line.amount } }) } });
    if (changed.count !== 1) throw new ReturnError("Your return credit changed or was locked for transfer. Refresh checkout.");
    await tx.creditAllocation.create({ data: { creditId: line.creditId, orderId, amount: line.amount, state: paid ? "SPENT" : "RESERVED" } });
  }
}
export async function settleCredit(tx: Prisma.TransactionClient, orderId: string, action: "spend" | "release") {
  const allocations = await tx.creditAllocation.findMany({ where: { orderId, state: "RESERVED" } });
  for (const allocation of allocations) {
    const claimed = await tx.creditAllocation.updateMany({ where: { id: allocation.id, state: "RESERVED" }, data: { state: action === "spend" ? "SPENT" : "RELEASED" } });
    if (!claimed.count) throw new ReturnError("Credit allocation changed. Retry.");
    const changed = await tx.returnCredit.updateMany({ where: { id: allocation.creditId, reserved: { gte: allocation.amount } }, data: {
      reserved: { decrement: allocation.amount }, ...(action === "spend" ? { spent: { increment: allocation.amount } } : { balance: { increment: allocation.amount } }),
    } });
    if (changed.count !== 1) throw new ReturnError("Credit balance requires review.");
  }
  if (action === "release") await tx.dispute.updateMany({ where: { replacementOrderId: orderId }, data: { replacementOrderId: null } });
}
