import { compare, hash } from "bcryptjs";
import type { PrismaClient } from "../generated/prisma/client";
import type { SessionUser } from "../domain/session-user";
import { activeUser } from "../domain/session-user";
import { setPasswordSchema } from "../validation/auth-validation";

class PasswordConflict extends Error {}
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
export function createPasswordHandler({ db, currentUser, readBody, allowAttempt }: {
  db: Pick<PrismaClient, "user" | "$transaction">;
  currentUser: () => Promise<SessionUser | null>;
  readBody: (request: Request) => Promise<unknown>;
  allowAttempt: (identity: string) => Promise<boolean>;
}) {
  return async (request: Request) => {
    try {
      const session = activeUser(await currentUser());
      if (!session) return json({ error: "Please sign in before setting a password." }, 401);
      if (!await allowAttempt(`password-change:${session.id}`)) return json({ error: "Too many attempts. Try again in 15 minutes." }, 429);
      const parsed = setPasswordSchema.safeParse(await readBody(request));
      if (!parsed.success) return json({ error: "Use matching passwords of 12–72 characters (maximum 72 UTF-8 bytes)." }, 400);
      const user = await db.user.findUnique({ where: { id: session.id }, select: { id: true, passwordHash: true, isActive: true, accounts: { select: { provider: true } } } });
      if (!user?.isActive) return json({ error: "Please sign in again." }, 401);
      if (!user.passwordHash && !user.accounts.some((account) => account.provider === "google")) return json({ error: "Complete Google authentication before setting your first password." }, 403);
      // A signed-in passwordless user can set their first password. Replacing an
      // existing password always requires the current password.
      if (user.passwordHash && (!parsed.data.currentPassword || !await compare(parsed.data.currentPassword, user.passwordHash))) {
        return json({ error: "Your current password is incorrect." }, 400);
      }
      const passwordHash = await hash(parsed.data.password, 12);
      await db.$transaction(async (tx) => {
        const updated = await tx.user.updateMany({
          where: { id: user.id, isActive: true, passwordHash: user.passwordHash },
          data: { passwordHash },
        });
        if (updated.count !== 1) throw new PasswordConflict();
        // Existing credentials changed: revoke browser and mobile sessions.
        // First-time setup preserves the authenticated Google handoff session.
        if (user.passwordHash) await tx.session.deleteMany({ where: { userId: user.id } });
      });
      return json({ success: true, signInRequired: !!user.passwordHash });
    } catch (error) {
      if (error instanceof PasswordConflict) return json({ error: "Your account changed. Refresh and try again." }, 409);
      console.error("Password update failed");
      return json({ error: "Unable to save your password. Please try again." }, 500);
    }
  };
}
