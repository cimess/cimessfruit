import { flushChanges } from "../../features/realtime/publication";
import type { Prisma, PrismaClient } from "../../generated/prisma/client";
import { enabled } from "./events";
import { publishBatch, publishRecovery } from "./transport";

export const recoveryBatchSize = 20;
export type RecoveryCursor = { createdAt: string; id: string };
export type RecoveryTransport = {
  send: (ids: string[]) => Promise<void>;
  schedule: (after?: RecoveryCursor, delay?: number) => Promise<void>;
};
const transport: RecoveryTransport = { send: publishBatch, schedule: publishRecovery };

// One database page + one QStash batch. Further pages run in fresh signed invocations.
export async function recoverNotifications(db: PrismaClient, delivery = transport, after?: RecoveryCursor) {
  const cutoff = new Date(Date.now() - 15 * 60000);
  const eligible: Prisma.NotificationEventWhereInput = {
    completedAt: null,
    OR: [{ publishedAt: null }, { publishedAt: { lt: cutoff } }],
  };
  const events = await db.notificationEvent.findMany({
    where: { AND: [eligible, ...(after ? [{ OR: [
      { createdAt: { gt: new Date(after.createdAt) } },
      { createdAt: new Date(after.createdAt), id: { gt: after.id } },
    ] }] : [])] },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: recoveryBatchSize + 1, select: { id: true, createdAt: true },
  });
  const page = events.slice(0, recoveryBatchSize);
  if (!page.length) return { published: 0, more: false };
  const stamp = new Date();
  // Returning actual claimed IDs avoids duplicate publication by overlapping recovery scans.
  const claimed = await db.notificationEvent.updateManyAndReturn({
    where: { AND: [eligible, { id: { in: page.map(event => event.id) } }] },
    data: { publishedAt: stamp }, select: { id: true },
  });
  if (claimed.length) {
    try { await delivery.send(claimed.map(event => event.id)); }
    catch (error) {
      // Batch HTTP timeout/partial acceptance may have queued some jobs already.
      // Requeue safely: per-event worker leases and per-device state handle duplicates.
      await db.notificationEvent.updateMany({
        where: { id: { in: claimed.map(event => event.id) }, completedAt: null, publishedAt: stamp },
        data: { publishedAt: null },
      });
      throw error;
    }
  }
  const more = events.length > recoveryBatchSize;
  if (more) {
    const last = page.at(-1)!;
    await delivery.schedule({ createdAt: last.createdAt.toISOString(), id: last.id }, 1);
  }
  return { published: claimed.length, more };
}

// Awaited after commit. Publishing failure never turns a successful checkout into an error.
export async function kickNotifications(db: PrismaClient, delivery = transport) {
  await flushChanges(db);
  if (!enabled()) return;
  try { await recoverNotifications(db, delivery); }
  catch {
    // If only batch publishing failed, let QStash retry a recovery job independently.
    // If QStash is entirely unavailable, DB records remain for a later trigger/daily cleanup.
    try { await delivery.schedule(undefined, 60); }
    catch { console.error("Notification publishing deferred; outbox recovery required"); }
  }
}
