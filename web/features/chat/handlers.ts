import { UploadError } from "../uploads/service";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import type { PrismaClient } from "../../generated/prisma/client";
import { activeUser, type SessionUser } from "../../domain/session-user";
import { ReturnError } from "../returns/validation";
import type { WriteEvent } from "../../server/notifications/events";
import { databaseUnavailable, databaseUnavailableResponse } from "../../server/database/failures";
import { disputeSchema, decisionSchema } from "./validation";
import { createDispute, decideDispute } from "./service";
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
type DisputeDependencies = {
  db: PrismaClient; currentUser: () => Promise<SessionUser | null>; readBody: (r: Request) => Promise<unknown>;
  allowAttempt: (key: string) => Promise<boolean>; notify: WriteEvent; kick: () => Promise<void>;
};

// Load production resources only for live calls; tests supply dependencies directly.
async function disputeDependencies(input?: DisputeDependencies) {
  if (!input) {
    const { prisma } = await import("../../server/database/prisma");
    const { getCurrentUser } = await import("../../server/auth/current-user");
    const { readBody, allowAuthAttempt } = await import("../../server/auth/password-auth");
    const { writeEvent } = await import("../../server/notifications/events");
    const { kickNotifications } = await import("../../server/notifications/publisher");
    input = { db: prisma, currentUser: getCurrentUser, readBody, allowAttempt: allowAuthAttempt, notify: writeEvent, kick: () => kickNotifications(prisma) };
  }
  const { db, currentUser, readBody, allowAttempt, notify, kick } = input;
  return { db, currentUser, readBody, allowAttempt, notify, kick };
}

async function user(deps: Awaited<ReturnType<typeof disputeDependencies>>, admin = false) {
  const { currentUser } = deps;
  const value = activeUser(await currentUser());
  if (!value) throw new ReturnError("Please sign in.", 401);
  if (admin && value.role !== "ADMIN") throw new ReturnError("Administrator access required.", 403);
  return value;
}

async function safe(run: () => Promise<Response>) {
  try { return await run(); } catch (error) {
    unstable_rethrow(error);
    if (error instanceof ReturnError || error instanceof UploadError) return json({ error: error.message }, error.status);
    if (databaseUnavailable(error)) return databaseUnavailableResponse();
    const code = error && typeof error === "object" && "code" in error ? error.code : "";
    if (code === "P2034" || code === "P2002") return json({ error: "This dispute changed or already has an open case. Refresh the inbox before retrying." }, 409);
    return json({ error: "Unable to process this dispute." }, 500);
  }
}

export async function createDisputeHandler(request: Request, dependencies?: DisputeDependencies) {
  const deps = await disputeDependencies(dependencies);
  const { db, readBody, allowAttempt } = deps;
  return safe(async () => {
    const account = await user(deps); const parsed = disputeSchema.safeParse(await readBody(request));
    if (!parsed.success) return json({ error: "Select your order, affected quantities, issue and message. Evidence links must use HTTPS." }, 400);
    if (!await allowAttempt(`dispute:new:${account.id}`)) return json({ error: "Too many requests. Try again later." }, 429);
    const dispute = await db.$transaction(tx => createDispute(tx, account.id, parsed.data), { isolationLevel: "Serializable" });
    return json({ dispute }, 201);
  });
}

export async function decideDisputeHandler(request: Request, id: string, dependencies?: DisputeDependencies) {
  const deps = await disputeDependencies(dependencies);
  const { db, readBody, notify, kick } = deps;
  return safe(async () => {
    const account = await user(deps, true);
    if (!z.uuid().safeParse(id).success) return json({ error: "Invalid dispute" }, 400);
    const parsed = decisionSchema.safeParse(await readBody(request));
    if (!parsed.success) return json({ error: "Select a decision, responsibility and explanation." }, 400);
    const result = await db.$transaction(tx => decideDispute(tx, id, account.id, parsed.data, notify), { isolationLevel: "Serializable" });
    await kick(); return json({ ok: true, ...result });
  });
}

// Compatibility adapter for callers that inject dependencies (including tests).
export function disputeHandlers(dependencies: DisputeDependencies) {
  return {
    create: (request: Request) => createDisputeHandler(request, dependencies),
    decide: (request: Request, id: string) => decideDisputeHandler(request, id, dependencies),
  };
}
