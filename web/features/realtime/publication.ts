import type { Prisma, PrismaClient } from "../../generated/prisma/client";
import { changeBus, realtimeEnabled, type ChangeBus } from "./bus";
export async function recordChange(
  tx: Prisma.TransactionClient,
  input: { kind: string; userId?: string | null; entityId: string },
) {
  if (!realtimeEnabled()) return;
  await tx.realtimeSignal.create({
    data: {
      kind: input.kind === "catalogue" ? "catalogue.changed" : "order.changed",
      userId: input.userId ?? null,
      entityId: input.entityId,
    },
  });
}
// Only called after commit. Repeated publications are harmless invalidation hints.
export async function flushChanges(db: PrismaClient, bus?: ChangeBus) {
  if (!realtimeEnabled()) return;
  try {
    const pending = await db.realtimeSignal.findMany({
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: 20,
    });
    if (!pending.length) return;
    const transport = bus ?? changeBus();
    const groups = new Map<string, typeof pending>();
    for (const event of pending) {
      const key = `${event.kind}:${event.userId ?? ""}`;
      groups.set(key, [...(groups.get(key) ?? []), event]);
    }
    const published: string[] = [],
      deadline = Date.now() + 1500;
    for (const events of groups.values()) {
      if (Date.now() >= deadline) break;
      const event = events[0];
      await transport.publish({
        kind: event.kind as "order.changed" | "catalogue.changed",
        ...(event.userId ? { userId: event.userId } : {}),
      });
      published.push(...events.map((event) => event.id));
    }
    if (published.length)
      await db.realtimeSignal.deleteMany({ where: { id: { in: published } } });
  } catch {
    /* Retain committed rows for next mutation/daily recovery; clients reconcile periodically. */
  }
}
export async function recordCreditChange(tx: Prisma.TransactionClient, creditId: string, userId: string) {
  if (!realtimeEnabled()) return;
  const credit = await tx.returnCredit.findFirst({ where: { id: creditId, userId }, select: { orderId: true } });
  if (credit) await recordChange(tx, { kind: "order", userId, entityId: credit.orderId });
}
