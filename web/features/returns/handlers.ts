import { recordCreditChange } from "../realtime/publication";
import { choiceAt } from "./window";
import { choiceSchema } from "../chat/validation";
import { spendableChoice } from "./credit";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import type { PrismaClient } from "../../generated/prisma/client";
import { activeUser, type SessionUser } from "../../domain/session-user";
import { ignoreEvent, type WriteEvent } from "../../server/notifications/events";
import { noCache, type DataCache } from "../../server/cache/json-cache";
import { databaseUnavailable, databaseUnavailableResponse } from "../../server/database/failures";
import { approvalSchema, bankSchema, ReturnError, transferSchema } from "./validation";
import { approveReturn, transferCredit } from "./service";
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
type ReturnDependencies = {
  db: PrismaClient; currentUser: () => Promise<SessionUser | null>; readBody: (r: Request) => Promise<unknown>;
  allowAttempt?: (key: string) => Promise<boolean>;
  notify?: WriteEvent; kick?: () => Promise<void>; cache?: DataCache;
};

// Load production resources only for live calls; tests supply dependencies directly.
async function returnDependencies(input?: ReturnDependencies) {
  if (!input) {
    const { prisma } = await import("../../server/database/prisma");
    const { getCurrentUser } = await import("../../server/auth/current-user");
    const { readBody, allowAuthAttempt } = await import("../../server/auth/password-auth");
    const { dataCache } = await import("../../server/cache/redis");
    const { writeEvent } = await import("../../server/notifications/events");
    const { kickNotifications } = await import("../../server/notifications/publisher");
    input = { db: prisma, currentUser: getCurrentUser, readBody, allowAttempt: allowAuthAttempt, cache: dataCache, notify: writeEvent, kick: () => kickNotifications(prisma) };
  }
  const { db, currentUser, readBody, notify = ignoreEvent, kick = async () => { }, allowAttempt = async () => true, cache = noCache } = input;
  return { db, currentUser, readBody, notify, kick, allowAttempt, cache };
}

async function user(deps: Awaited<ReturnType<typeof returnDependencies>>, admin = false) {
  const { currentUser } = deps;
  const account = activeUser(await currentUser());
  if (!account) throw new ReturnError("Please sign in.", 401);
  if (admin && account.role !== "ADMIN") throw new ReturnError("Administrator access required.", 403);
  return account;
}

async function safe(run: () => Promise<Response>) {
  try { return await run(); } catch (error) {
    unstable_rethrow(error);
    if (error instanceof ReturnError) return json({ error: error.message }, error.status);
    if (databaseUnavailable(error)) return databaseUnavailableResponse();
    const code = error && typeof error === "object" && "code" in error ? error.code : "";
    if (code === "P2034" || code === "P2002") return json({ error: "This return or transfer changed. Refresh before retrying." }, 409);
    console.error("Return/refund request failed", code);
    return json({ error: "Unable to process this return or refund." }, 500);
  }
}

export async function getReturnBalance(dependencies?: ReturnDependencies) {
  const deps = await returnDependencies(dependencies);
  const { db } = deps;
  return safe(async () => {
    const account = await user(deps);
    const now = new Date();
    const value = await db.returnCredit.aggregate({ where: { userId: account.id, ...spendableChoice(now), transfers: { none: { state: "PENDING" } } }, _sum: { balance: true } });
    const replacements = await db.dispute.findMany({
      where: {
        userId: account.id, status: "APPROVED", replacementOrderId: null, responsibility: { in: ["STORE", "RIDER"] },
        credit: { choice: "REPLACEMENT", refundDueAt: { gt: now }, balance: { gt: 0 }, transfers: { none: { state: "PENDING" } } },
      }, select: { id: true, orderId: true }, take: 50, orderBy: { createdAt: "asc" }
    });
    const refunds = await db.returnCredit.aggregate({ where: { userId: account.id, refundDueAt: { lte: now } }, _sum: { balance: true, locked: true } });
    const next = await db.returnCredit.findFirst({ where: { userId: account.id, ...spendableChoice(now), balance: { gt: 0 }, transfers: { none: { state: "PENDING" } } }, orderBy: { refundDueAt: "asc" }, select: { refundDueAt: true } });
    return json({ available: value._sum.balance ?? 0, pendingRefund: (refunds._sum.balance ?? 0) + (refunds._sum.locked ?? 0), expiresAt: next?.refundDueAt ?? null, serverTime: now.toISOString(), replacements });
  });
}

export async function handleOrderReturns(request: Request, orderId: string, admin = false, dependencies?: ReturnDependencies) {
  const deps = await returnDependencies(dependencies);
  const { db, readBody, notify, kick, cache } = deps;
  return safe(async () => {
    const account = await user(deps, admin);
    if (!z.uuid().safeParse(orderId).success) return json({ error: "Invalid order" }, 400);
    const order = await db.order.findFirst({
      where: { id: orderId, ...(!admin ? { userId: account.id } : {}) },
      select: {
        id: true, deliveryFee: true, status: true, paymentStatus: true, items: {
          select: {
            id: true, name: true, optionLabel: true, quantity: true, unitPrice: true, returnedItems: { select: { quantity: true } },
          }
        }
      },
    });
    if (!order) return json({ error: "Order not found" }, 404);
    if (request.method === "POST") {
      if (!admin) return json({ error: "Administrator access required" }, 403);
      const parsed = approvalSchema.safeParse(await readBody(request));
      if (!parsed.success) return json({ error: "Check returned quantities and the return reason." }, 400);
      const credit = await db.$transaction(tx => approveReturn(tx, orderId, parsed.data, account.id, notify), { isolationLevel: "Serializable" });
      await kick();
      if (parsed.data.items.some(item => item.restock)) await cache.invalidate("products");
      return json({ credit }, 201);
    }
    const credits = await db.returnCredit.findMany({
      where: { orderId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include: { items: true, transfers: { orderBy: { createdAt: "desc" } } },
    });
    return json({ order, credits: credits.map(credit => choiceAt(credit)), serverTime: new Date().toISOString() });
  });
}

export async function chooseReturnResolution(request: Request, creditId: string, dependencies?: ReturnDependencies) {
  const deps = await returnDependencies(dependencies);
  const { db, readBody, kick, allowAttempt } = deps;
  return safe(async () => {
    const account = await user(deps);
    if (!z.uuid().safeParse(creditId).success) return json({ error: "Invalid credit" }, 400);
    if (!await allowAttempt(`resolution-choice:${account.id}`)) return json({ error: "Too many changes. Try again later." }, 429);
    const parsed = choiceSchema.safeParse(await readBody(request));
    if (!parsed.success) return json({ error: "Choose replacement, credit or bank refund." }, 400);
    await db.$transaction(async tx => {
      const changed = await tx.returnCredit.updateMany({
        where: {
          id: creditId, userId: account.id, refundDueAt: { gt: new Date() }, transfers: { none: { state: "PENDING" } },
        }, data: { choice: parsed.data.choice }
      });
      if (changed.count !== 1) throw new ReturnError("The 20-minute buying window is closed or this credit is unavailable. Any unspent balance is now due for refund.");
      await recordCreditChange(tx, creditId, account.id);
      const dispute = await tx.dispute.findUnique({ where: { creditId } });
      if (dispute) await tx.conversation.update({ where: { id: dispute.conversationId }, data: { updatedAt: new Date(), messages: { create: { body: `Resolution choice updated: ${parsed.data.choice.replaceAll("_", " ")}.` } } } });
    }, { isolationLevel: "Serializable" });
    await kick();
    return json({ ok: true, choice: parsed.data.choice });
  });
}

export async function saveReturnBankDetails(request: Request, creditId: string, dependencies?: ReturnDependencies) {
  const deps = await returnDependencies(dependencies);
  const { db, readBody, kick } = deps;
  return safe(async () => {
    const account = await user(deps);
    if (!z.uuid().safeParse(creditId).success) return json({ error: "Invalid credit" }, 400);
    const parsed = bankSchema.safeParse(await readBody(request));
    if (!parsed.success) return json({ error: "Enter bank, 10-digit account number and account name." }, 400);
    await db.$transaction(async tx => {
      const changed = await tx.returnCredit.updateMany({ where: { id: creditId, userId: account.id, transfers: { none: { state: "PENDING" } } }, data: { bankDetails: parsed.data } });
      if (changed.count !== 1) throw new ReturnError("Credit not found or its transfer is already locked.");
      await recordCreditChange(tx, creditId, account.id);
    }, { isolationLevel: "Serializable" });
    await kick();
    return json({ ok: true });
  });
}

export async function transferReturnCredit(request: Request, creditId: string, dependencies?: ReturnDependencies) {
  const deps = await returnDependencies(dependencies);
  const { db, readBody, notify, kick } = deps;
  return safe(async () => {
    const account = await user(deps, true);
    if (!z.uuid().safeParse(creditId).success) return json({ error: "Invalid credit" }, 400);
    const parsed = transferSchema.safeParse(await readBody(request));
    if (!parsed.success) return json({ error: "Check the transfer action and reference." }, 400);
    const transfer = await db.$transaction(tx => transferCredit(tx, creditId, parsed.data, account.id, notify), { isolationLevel: "Serializable" });
    await kick();
    return json({ transfer });
  });
}

// Compatibility adapter for callers that inject dependencies (including tests).
export function returnHandlers(dependencies: ReturnDependencies) {
  return {
    balance: () => getReturnBalance(dependencies),
    order: (request: Request, orderId: string, admin = false) => handleOrderReturns(request, orderId, admin, dependencies),
    choice: (request: Request, creditId: string) => chooseReturnResolution(request, creditId, dependencies),
    bank: (request: Request, creditId: string) => saveReturnBankDetails(request, creditId, dependencies),
    transfer: (request: Request, creditId: string) => transferReturnCredit(request, creditId, dependencies),
  };
}
