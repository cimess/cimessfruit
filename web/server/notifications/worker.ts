import { randomUUID } from "node:crypto";
import type { PrismaClient, NotificationEvent, PushInstallation, User, Session } from "../../generated/prisma/client";
import type { PushTransport, ExpoResult } from "./transport";

const batchSize = 20;
type Installation = PushInstallation & { user: User; session: Session };
export function eligible(installation: Installation | null, event: Pick<NotificationEvent, "kind" | "userId" | "createdAt">, ios: boolean, now = new Date()) {
  return !!installation && installation.user.isActive && installation.session.expires > now &&
    installation.session.userId === installation.userId && installation.createdAt <= event.createdAt &&
    (installation.platform === "android" || ios && installation.platform === "ios") &&
    (event.kind === "order" ? installation.userId === event.userId && installation.user.notificationsEnabled : installation.user.catalogueNotificationsEnabled);
}
export function permanentError(result: ExpoResult) {
  return ["DeviceNotRegistered", "MessageTooBig", "MismatchSenderId", "InvalidCredentials"].includes(result.details?.error ?? "");
}

// One bounded step. QStash invokes the next step; no persistent process/timer required.
export async function processNotification(db: PrismaClient, eventId: string, transport: PushTransport, ios = false) {
  const leaseId = randomUUID();
  const now = new Date();
  const claimed = await db.notificationEvent.updateMany({ where: {
    id: eventId, completedAt: null, OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }],
  }, data: { leaseId, leaseUntil: new Date(now.getTime() + 120000) } });
  if (!claimed.count) {
    const existing = await db.notificationEvent.findUnique({ where: { id: eventId }, select: { completedAt: true } });
    if (existing && !existing.completedAt) throw Error("Notification already processing");
    return { pending: false, delay: 0 };
  }
  try {
    const event = await db.notificationEvent.findUniqueOrThrow({ where: { id: eventId } });
    if (event.expiresAt <= now) {
      await db.notificationEvent.update({ where: { id: eventId }, data: { completedAt: now } });
      return { pending: false, delay: 0 };
    }
    if (!event.fanoutDone) {
      // Only installations existing when the event occurred; no notifications to future signups.
      const installations = await db.pushInstallation.findMany({ where: {
        ...(event.cursor ? { id: { gt: event.cursor } } : {}), createdAt: { lte: event.createdAt },
        ...(event.userId ? { userId: event.userId } : {}),
        platform: { in: ios ? ["android", "ios"] : ["android"] },
        user: { isActive: true, ...(event.kind === "order" ? { notificationsEnabled: true } : { catalogueNotificationsEnabled: true }) },
        session: { expires: { gt: now } },
      }, orderBy: { id: "asc" }, take: batchSize });
      // Cursor and deliveries advance atomically. Duplicate webhook attempts cannot lose a page.
      await db.$transaction(async tx => {
        if (installations.length) await tx.notificationDelivery.createMany({ data: installations.map(i => ({
          eventId, installationId: i.id, userId: i.userId, sessionId: i.sessionId, token: i.token,
        })), skipDuplicates: true });
        await tx.notificationEvent.update({ where: { id: eventId }, data: {
          cursor: installations.at(-1)?.id ?? event.cursor, fanoutDone: installations.length < batchSize,
        } });
      });
    }
    // Reconcile provider receipts first. Missing receipts are retried on a delayed invocation.
    const waiting = await db.notificationDelivery.findMany({ where: { eventId, state: "RECEIPT" }, orderBy: { id: "asc" }, take: batchSize });
    if (waiting.length) {
      const receipts = await transport.receipts(waiting.map(d => d.ticket!));
      for (const delivery of waiting) {
        const receipt = receipts[delivery.ticket!];
        if (!receipt) {
          await db.notificationDelivery.update({ where: { id: delivery.id }, data: {
            receiptChecks: { increment: 1 }, ...(delivery.receiptChecks >= 14 ? { state: "FAILED", error: "ReceiptUnavailable" } : {}),
          } });
          continue;
        }
        const state = receipt.status === "ok" ? "DONE" : permanentError(receipt) || delivery.attempts >= 8 ? "FAILED" : "PENDING";
        await db.notificationDelivery.update({ where: { id: delivery.id }, data: { state, error: receipt.details?.error ?? null } });
        if (receipt.details?.error === "DeviceNotRegistered") await db.pushInstallation.deleteMany({ where: {
          id: delivery.installationId, token: delivery.token, userId: delivery.userId, sessionId: delivery.sessionId,
        } });
      }
    }
    const pending = await db.notificationDelivery.findMany({ where: { eventId, state: "PENDING" }, orderBy: { id: "asc" }, take: batchSize });
    const sendable = [];
    for (const delivery of pending) {
      const installation = await db.pushInstallation.findUnique({ where: { id: delivery.installationId }, include: { user: true, session: true } });
      if (!eligible(installation, event, ios) || installation!.userId !== delivery.userId ||
          installation!.sessionId !== delivery.sessionId || installation!.token !== delivery.token || delivery.attempts >= 8) {
        await db.notificationDelivery.update({ where: { id: delivery.id }, data: { state: delivery.attempts >= 8 ? "FAILED" : "SKIPPED" } });
      } else sendable.push(delivery);
    }
    if (sendable.length) {
      // Increment before network I/O: a timeout may mean Expo accepted a request. At-least-once delivery.
      await db.notificationDelivery.updateMany({ where: { id: { in: sendable.map(d => d.id) } }, data: { attempts: { increment: 1 } } });
      const results = await transport.send(sendable.map(delivery => ({
        to: delivery.token, title: event.title, body: event.body, sound: "default", channelId: "updates",
        data: { eventId, kind: event.kind, entityId: event.entityId },
        ttl: Math.max(1, Math.floor((event.expiresAt.getTime() - Date.now()) / 1000)),
      })));
      if (results.length !== sendable.length) throw Error("Incomplete Expo response");
      let retry = false;
      for (const [index, result] of results.entries()) {
        const delivery = sendable[index];
        if (result.status === "ok" && !result.id) throw Error("Missing Expo ticket");
        const permanent = permanentError(result);
        await db.notificationDelivery.update({ where: { id: delivery.id }, data: {
          state: result.status === "ok" ? "RECEIPT" : permanent ? "FAILED" : "PENDING",
          ticket: result.id ?? null, receiptChecks: 0, error: result.details?.error ?? null,
        } });
        if (result.details?.error === "DeviceNotRegistered") await db.pushInstallation.deleteMany({ where: {
          id: delivery.installationId, token: delivery.token, userId: delivery.userId, sessionId: delivery.sessionId,
        } });
        if (result.status === "error" && !permanent) retry = true;
      }
      if (retry) throw Error("Temporary Expo failure");
    }
    const current = await db.notificationEvent.findUniqueOrThrow({ where: { id: eventId } });
    const outstanding = await db.notificationDelivery.count({ where: { eventId, state: { in: ["PENDING", "RECEIPT"] } } });
    const pendingWork = !current.fanoutDone || outstanding > 0;
    if (!pendingWork) await db.notificationEvent.update({ where: { id: eventId }, data: { completedAt: new Date() } });
    return { pending: pendingWork, delay: current.fanoutDone ? 60 : 1 };
  } finally {
    await db.notificationEvent.updateMany({ where: { id: eventId, leaseId }, data: { leaseId: null, leaseUntil: null } });
  }
}
