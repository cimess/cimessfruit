import { compare, hash } from "bcryptjs";
import type { PrismaClient } from "../generated/prisma/client";
import { safeUserSelect, type SessionUser } from "../domain/session-user";
import { loginSchema } from "../validation/auth-validation";

const dummyHash = hash("not-a-user-password", 12);
const json = (error: string, status: number) => Response.json({ error }, {
  status, headers: { "Cache-Control": "no-store" },
});

export function createPasswordLogin({ db, readBody, allowAttempt, respond }: {
  db: Pick<PrismaClient, "user">;
  readBody: (request: Request) => Promise<unknown>;
  allowAttempt: (identity: string) => Promise<boolean>;
  respond: (user: SessionUser, request: Request) => Promise<Response>;
}) {
  return async (request: Request) => {
    const parsed = loginSchema.safeParse(await readBody(request));
    if (!parsed.success) return json("Invalid login details", 400);
    const identity = parsed.data.emailOrPhone;
    if (!await allowAttempt(identity)) return json("Too many attempts. Try again in 15 minutes.", 429);
    const user = await db.user.findUnique({
      where: identity.includes("@") ? { email: identity } : { phone: identity },
      select: { ...safeUserSelect, passwordHash: true, selfDisabledAt: true },
    });
    const valid = await compare(parsed.data.password, user?.passwordHash ?? await dummyHash);
    if (!valid || !user?.passwordHash) return json("Invalid login details", 401);
    if (!user.isActive) return json(user.selfDisabledAt ? "This account is disabled. Choose Reactivate account to receive a secure email link." : "Invalid login details", user.selfDisabledAt ? 403 : 401);
    const { passwordHash: _passwordHash, selfDisabledAt: _selfDisabledAt, ...profile } = user;
    void _selfDisabledAt;
    void _passwordHash;
    return respond(profile, request);
  };
}
