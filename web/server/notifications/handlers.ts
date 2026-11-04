import { recoverNotifications } from "./publisher";
import { z } from "zod";
import type { PrismaClient } from "../../generated/prisma/client";
import { bearerToken, mobileSessionKey } from "../auth/auth-secrets";
import { enabled, iosEnabled } from "./events";
import { verifySignature, expoTransport, publish } from "./transport";
import { processNotification } from "./worker";

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
const registration = z.strictObject({
  installationId: z.uuid(), token: z.string().regex(/^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$/).max(256),
  platform: z.enum(["android", "ios"]),
});
type NotificationDependencies = { db: PrismaClient; readBody: (r: Request) => Promise<unknown> };

// Load production resources only for live calls; tests supply dependencies directly.
async function notificationDependencies(input?: NotificationDependencies) {
  if (!input) {
    const { prisma } = await import("../database/prisma");
    const { readBody } = await import("../auth/password-auth");
    input = { db: prisma, readBody: readBody };
  }
  const { db, readBody } = input;
  return { db, readBody };
}

async function session(deps: Awaited<ReturnType<typeof notificationDependencies>>, request: Request) {
  const { db } = deps;
  const token = bearerToken(request.headers);
  if (!token) return null;
  const value = await db.session.findUnique({ where: { sessionToken: mobileSessionKey(token) }, include: { user: true } });
  return value && value.expires > new Date() && value.user.isActive ? value : null;
}

export async function notificationPreferences(request: Request, dependencies?: NotificationDependencies) {
  const deps = await notificationDependencies(dependencies);
  const { db, readBody } = deps;

  if (!enabled()) return json({ error: "Push notifications are not active" }, 503);
  const owner = await session(deps, request);
  if (!owner) return json({ error: "Unauthorized" }, 401);
  if (request.method === "GET") return json({ catalogueEnabled: owner.user.catalogueNotificationsEnabled });
  const parsed = z.strictObject({ catalogueEnabled: z.boolean() }).safeParse(await readBody(request));
  if (!parsed.success) return json({ error: "Invalid preference" }, 400);
  await db.user.update({ where: { id: owner.userId, isActive: true }, data: { catalogueNotificationsEnabled: parsed.data.catalogueEnabled } });
  return json(parsed.data);
}

export async function registerDevice(request: Request, dependencies?: NotificationDependencies) {
  const deps = await notificationDependencies(dependencies);
  const { db, readBody } = deps;

  if (!enabled()) return json({ error: "Push notifications are not active" }, 503);
  const owner = await session(deps, request);
  if (!owner) return json({ error: "Unauthorized" }, 401);
  const parsed = registration.safeParse(await readBody(request));
  if (!parsed.success) return json({ error: "Invalid push registration" }, 400);
  if (parsed.data.platform === "ios" && !iosEnabled()) return json({ error: "iOS push activation is deferred" }, 409);
  const { installationId, token, platform } = parsed.data;
  await db.$transaction(async tx => {
    // Refreshes/reinstalls must not retain deliveries for a previous owner/session/token.
    const old = await tx.pushInstallation.findUnique({ where: { id: installationId } });
    if (old && (old.userId !== owner.userId || old.sessionId !== owner.id || old.token !== token)) {
      await tx.pushInstallation.delete({ where: { id: installationId } });
    }
    await tx.pushInstallation.deleteMany({ where: { token, id: { not: installationId } } });
    await tx.pushInstallation.upsert({
      where: { id: installationId },
      create: { id: installationId, token, platform, userId: owner.userId, sessionId: owner.id },
      update: { token, platform, userId: owner.userId, sessionId: owner.id },
    });
  }, { isolationLevel: "Serializable" });
  return json({ ok: true });
}

export async function unregisterDevice(request: Request, dependencies?: NotificationDependencies) {
  const deps = await notificationDependencies(dependencies);
  const { db, readBody } = deps;

  if (!enabled()) return json({ ok: true });
  const owner = await session(deps, request);
  if (!owner) return json({ error: "Unauthorized" }, 401);
  const parsed = z.strictObject({ installationId: z.uuid() }).safeParse(await readBody(request));
  if (!parsed.success) return json({ error: "Invalid installation" }, 400);
  await db.pushInstallation.deleteMany({ where: { id: parsed.data.installationId, userId: owner.userId, sessionId: owner.id } });
  return json({ ok: true });
}

export async function notificationWorker(request: Request, dependencies?: NotificationDependencies) {
  const deps = await notificationDependencies(dependencies);
  const { db } = deps;

  if (!enabled()) return json({ error: "Notifications disabled" }, 503);
  try {
    if (Number(request.headers.get("content-length")) > 2048) return json({ error: "Body too large" }, 413);
    const reader = request.body?.getReader();
    if (!reader) return json({ error: "Missing body" }, 400);
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 2048) { await reader.cancel(); return json({ error: "Body too large" }, 413); }
      chunks.push(value);
    }
    const body = Buffer.concat(chunks).toString("utf8");
    if (!await verifySignature(body, request.headers.get("upstash-signature") ?? "")) return json({ error: "Invalid signature" }, 401);
    const parsed = z.union([
      z.strictObject({ eventId: z.uuid() }),
      z.strictObject({ type: z.literal("recover"), after: z.strictObject({ createdAt: z.iso.datetime(), id: z.uuid() }).optional() }),
    ]).safeParse(JSON.parse(body));
    if (!parsed.success) return json({ error: "Invalid event" }, 400);
    if ("type" in parsed.data) {
      const result = await recoverNotifications(db, undefined, parsed.data.after);
      return json({ ok: true, ...result });
    }
    const result = await processNotification(db, parsed.data.eventId, expoTransport, iosEnabled());
    if (result.pending) await publish(parsed.data.eventId, result.delay);
    return json({ ok: true, pending: result.pending });
  } catch {
    return Response.json({ error: "Notification processing deferred" }, {
      status: 503, headers: { "Cache-Control": "private, no-store", "Retry-After": "60" },
    });
  }
}

// Compatibility adapter for callers that inject dependencies (including tests).
export function notificationHandlers(db: PrismaClient, readBody: (r: Request) => Promise<unknown>) {
  const dependencies = { db, readBody };
  return {
    preferences: (request: Request) => notificationPreferences(request, dependencies),
    register: (request: Request) => registerDevice(request, dependencies),
    unregister: (request: Request) => unregisterDevice(request, dependencies),
    worker: (request: Request) => notificationWorker(request, dependencies),
  };
}
