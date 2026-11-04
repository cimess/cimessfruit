import { randomBytes, randomInt, createHash } from "node:crypto";
import { hash } from "bcryptjs";
import { z } from "zod";
import type { PrismaClient } from "../generated/prisma/client";
import { emailSchema, passwordSchema } from "../validation/auth-validation";
const digest = (token: string) => createHash("sha256").update(token).digest("hex");
const verificationDigest = (email: string, code: string) => digest(`email-verification:${email}:${code}`);
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
const kindSchema = z.enum(["reset", "verify", "reactivate"]);
type RecoveryDependencies = {
  db: PrismaClient; readBody: (r: Request) => Promise<unknown>; allowAttempt: (id: string) => Promise<boolean>;
  send: (email: string, subject: string, text: string) => Promise<void>; origin: () => string;
};

// Load production resources only for live calls; tests supply dependencies directly.
async function recoveryDependencies(input?: RecoveryDependencies) {
  if (!input) {
    const { prisma } = await import("../server/database/prisma");
    const { readBody, allowAuthAttempt } = await import("../server/auth/password-auth");
    const { emailOrigin, sendEmail } = await import("../server/email/transactional-email");
    input = { db: prisma, readBody, allowAttempt: allowAuthAttempt, origin: emailOrigin, send: sendEmail };
  }
  const { db, readBody, allowAttempt, send, origin } = input;
  return { db, readBody, allowAttempt, send, origin };
}

export async function requestRecovery(request: Request, dependencies?: RecoveryDependencies) {
  const deps = await recoveryDependencies(dependencies);
  const { db, readBody, allowAttempt, send, origin } = deps;
  try {
    const parsed = z.strictObject({ email: emailSchema, kind: kindSchema }).safeParse(await readBody(request));
    if (!parsed.success) return json({ error: "Enter a valid email address." }, 400);
    const { email, kind } = parsed.data;
    if (!await allowAttempt(`recovery:${email}`)) return json({ error: "Too many attempts. Try again in 15 minutes." }, 429);
    // Validate configuration independently of whether the account exists.
    const base = origin();
    const user = await db.user.findUnique({ where: { email } });
    if (user && (kind === "reactivate" ? !user.isActive && !!user.selfDisabledAt : user.isActive && (kind === "reset" ? !!user.passwordHash : !user.emailVerified))) {
      const token = kind === "verify" ? randomInt(0, 1_000_000).toString().padStart(6, "0") : randomBytes(32).toString("hex");
      const identifier = `recovery:${kind}:${user.id}:${email}`;
      const tokenHash = kind === "verify" ? verificationDigest(email, token) : digest(token);
      const expires = new Date(Date.now() + (kind === "verify" ? 10 : 30) * 60 * 1000);
      if (kind === "verify") {
        await db.$transaction(async tx => {
          await tx.verificationToken.deleteMany({ where: { identifier } });
          await tx.verificationToken.create({ data: { identifier, token: tokenHash, expires } });
        }, { isolationLevel: "Serializable" });
      } else {
        await db.verificationToken.create({ data: { identifier, token: tokenHash, expires } });
      }
      const url = new URL("/recover", base);
      // Fragment keeps credentials out of HTTP access logs and referrers.
      url.hash = new URLSearchParams({ token, kind }).toString();
      try { await send(email, kind === "reset" ? "Reset your CimessFruit password" : kind === "reactivate" ? "Reactivate your CimessFruit account" : "Verify your CimessFruit email", kind === "verify" ? `Your CimessFruit email verification code is ${token}.\nEnter this 6-digit code in the app or website within 10 minutes. Only your latest code works. Do not share this code. If you did not request it, ignore this email.` : `Open this link within 30 minutes: ${url.href}\nIf you did not request this, ignore this email.`); }
      catch { await db.verificationToken.deleteMany({ where: { token: tokenHash } }); console.error("Recovery email delivery failed"); throw "Recovery email delivery failed"; }
    }
    return json({ message: kind === "verify" ? "If this email needs verification, a 6-digit code will arrive shortly. It expires in 10 minutes." : "If this account is eligible, an email will arrive shortly. Google-only accounts should use Google sign-in." });
  } catch (error) { console.error("Recovery request failed", error instanceof Error ? error.name : "UnknownError"); return json({ error: "Email recovery is currently unavailable. Please try again later." }, 503); }
}

export async function completeRecovery(request: Request, dependencies?: RecoveryDependencies) {
  const deps = await recoveryDependencies(dependencies);
  const { db, readBody, allowAttempt } = deps;
  try {
    const parsed = z.strictObject({ token: z.string(), kind: kindSchema, email: emailSchema.optional(), password: passwordSchema.optional() }).safeParse(await readBody(request));
    if (!parsed.success || (parsed.data.kind === "verify" ? !parsed.data.email || !/^[0-9]{6}$/.test(parsed.data.token) : !/^[a-f0-9]{64}$/.test(parsed.data.token)) || (parsed.data.kind === "reset" && !parsed.data.password)) return json({ error: "Enter a valid code and email, or use your recovery link. Passwords must be 12–72 characters." }, 400);
    const { token, kind, password, email: submittedEmail } = parsed.data;
    const tokenHash = kind === "verify" ? verificationDigest(submittedEmail!, token) : digest(token);
    if (!await allowAttempt(kind === "verify" ? `verify-complete:${submittedEmail}` : `recovery-complete:${tokenHash}`)) return json({ error: "Too many attempts." }, 429);
    const passwordHash = kind === "reset" ? await hash(password!, 12) : undefined;
    await db.$transaction(async tx => {
      const record = await tx.verificationToken.findUnique({ where: { token: tokenHash } });
      if (!record || record.expires <= new Date() || !record.identifier.startsWith(`recovery:${kind}:`)) throw new Error("Invalid token");
      const [, , userId, ...parts] = record.identifier.split(":");
      const email = parts.join(":");
      if (kind === "verify" && email !== submittedEmail) throw new Error("Invalid email");
      const updated = await tx.user.updateMany({ where: { id: userId, email, ...(kind === "reactivate" ? { isActive: false, selfDisabledAt: { not: null } } : { isActive: true }) }, data: kind === "reset" ? { passwordHash } : kind === "reactivate" ? { isActive: true, selfDisabledAt: null, emailVerified: new Date() } : { emailVerified: new Date() } });
      if (updated.count !== 1) throw new Error("Invalid account");
      await tx.verificationToken.delete({ where: { token: tokenHash } });
      await tx.verificationToken.deleteMany({ where: { identifier: record.identifier } });
      if (kind === "reset" || kind === "reactivate") {
        await tx.session.deleteMany({ where: { userId } });
        await tx.mobileAuthGrant.deleteMany({ where: { userId } });
      }
    }, { isolationLevel: "Serializable" });
    return json({ message: kind === "reset" ? "Password updated. Sign in again on your devices." : kind === "reactivate" ? "Account reactivated. Sign in to access your existing account and history." : "Email verified." });
  } catch { return json({ error: "This code or link is invalid, expired, or already used. Request a new one." }, 400); }
}

// Compatibility adapter for callers that inject dependencies (including tests).
export function createRecoveryHandlers(dependencies: RecoveryDependencies) {
  return {
    request: (request: Request) => requestRecovery(request, dependencies),
    complete: (request: Request) => completeRecovery(request, dependencies),
  };
}
