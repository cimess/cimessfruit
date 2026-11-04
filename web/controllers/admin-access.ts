import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { PrismaClient } from "../generated/prisma/client";
import { activeUser, type SessionUser } from "../domain/session-user";

export function matchesAdminKey(supplied: string, configured: string | undefined) {
  if (!configured || configured.length < 32) return false;
  return timingSafeEqual(createHash("sha256").update(supplied).digest(), createHash("sha256").update(configured).digest());
}
const schema = z.strictObject({ authorizationKey: z.string().min(1).max(512) });
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
export function createAdminAccessHandler({ db, currentUser, readBody, allowAttempt, key }: {
  db: Pick<PrismaClient, "$transaction">;
  currentUser: () => Promise<SessionUser | null>;
  readBody: (request: Request) => Promise<unknown>;
  allowAttempt: (identity: string) => Promise<boolean>;
  key: () => string | undefined;
}) {
  return async (request: Request) => {
    try {
      const user = activeUser(await currentUser());
      if (!user) return json({ error: "Sign in before activating admin access." }, 401);
      if (user.role === "ADMIN") return json({ alreadyAdmin: true });
      if (!await allowAttempt(`admin-access:${user.id}`)) return json({ error: "Too many attempts. Try again in 15 minutes." }, 429);
      const configured = key();
      if (!configured || configured.length < 32) return json({ error: "Admin activation is not configured. Contact the store owner." }, 503);
      const parsed = schema.safeParse(await readBody(request));
      if (!parsed.success || !matchesAdminKey(parsed.data.authorizationKey, configured)) return json({ error: "Invalid authorization key." }, 403);
      const changed = await db.$transaction(async (tx) => {
        const result = await tx.user.updateMany({ where: { id: user.id, isActive: true, role: "CUSTOMER" }, data: { role: "ADMIN" } });
        if (result.count === 1) await tx.session.deleteMany({ where: { userId: user.id } });
        return result.count;
      });
      if (changed !== 1) return json({ error: "Your account changed. Sign in again." }, 409);
      return json({ success: true, signInRequired: true });
    } catch {
      return json({ error: "Unable to activate admin access. Try again." }, 500);
    }
  };
}
