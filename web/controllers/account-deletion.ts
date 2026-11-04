import { createHash, randomBytes, randomInt } from "node:crypto";
import { z } from "zod";
import { type PrismaClient } from "../generated/prisma/client";
import { emailSchema } from "../validation/auth-validation";
const digest = (token: string) => createHash("sha256").update(token).digest("hex");
const verificationDigest = (email: string, code: string) => digest(`disabling-otp:${email}:${code}`);
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
class DeletionBlocked extends Error { }
class InvalidDeletion extends Error { }
type DeletionDependencies = {
  db: PrismaClient; readBody: (r: Request) => Promise<unknown>; allowAttempt: (key: string) => Promise<boolean>;
  origin: () => string; send: (email: string, subject: string, text: string) => Promise<void>;
};

// Load production resources only for live calls; tests supply dependencies directly.
async function deletionDependencies(input?: DeletionDependencies) {
  if (!input) {
    const { prisma } = await import("../server/database/prisma");
    const { readBody, allowAuthAttempt } = await import("../server/auth/password-auth");
    const { emailOrigin, sendEmail } = await import("../server/email/transactional-email");
    input = { db: prisma, readBody, allowAttempt: allowAuthAttempt, origin: emailOrigin, send: sendEmail };
  }
  const { db, readBody, allowAttempt, origin, send } = input;
  return { db, readBody, allowAttempt, origin, send };
}

export async function requestAccountDeletion(request: Request, dependencies?: DeletionDependencies) {
  const deps = await deletionDependencies(dependencies);
  const { db, readBody, allowAttempt, origin, send } = deps;
  try {
    const parsed = z.strictObject({ email: emailSchema }).safeParse(await readBody(request));
    if (!parsed.success) return json({ error: "Enter your account email address." }, 400);
    const { email } = parsed.data;
    if (!await allowAttempt(`delete-request:${email}`)) return json({ error: "Too many requests. Try again in 15 minutes." }, 429);
    const base = origin();
    const user = await db.user.findUnique({ where: { email } });
    if (user?.isActive) {
      // Generate both a 6-digit OTP and a secure link token
      const otp = randomInt(0, 1_000_000).toString().padStart(6, "0");
      const token = randomBytes(32).toString("hex");
      const expires = new Date(Date.now() + 15 * 60 * 1000); // 15 mins

      // Clean up old disabling tokens for this user
      await db.verificationToken.deleteMany({ where: { identifier: { startsWith: `disabling:${user.id}:` } } });

      // Store OTP
      await db.verificationToken.create({
        data: { identifier: `disabling:${user.id}:${email}:otp`, token: verificationDigest(email, otp), expires },
      });

      // Store token for direct link
      await db.verificationToken.create({
        data: { identifier: `disabling:${user.id}:${email}:link`, token: digest(token), expires },
      });

      const url = new URL("/account-deletion", base);
      url.hash = new URLSearchParams({ token, email }).toString();

      try {
        await send(
          email,
          "Confirm disabling your CimessFruit account",
          `You requested to disable your account.\n\nYour 6-digit confirmation code is: ${otp}\n\nEnter this code on the website within 15 minutes to confirm disabling your account.\n\nAlternatively, you can open this link directly: ${url.href}\n\nYour account stays active until you confirm. Your orders and financial history are preserved. You can reactivate anytime. If this was not you, ignore this email.`
        );
      } catch {
        await db.verificationToken.deleteMany({ where: { identifier: { startsWith: `disabling:${user.id}:` } } });
        console.error("Account disabling email delivery failed");
      }
    }
    return json({ message: "If this account exists, a 6-digit verification code and confirmation link have been sent to your email." });
  } catch (error) {
    console.error("Account disabling request failed", error instanceof Error ? error.name : "UnknownError");
    return json({ error: "Account disabling email is unavailable. Please try again later or contact support." }, 503);
  }
}

export async function completeAccountDeletion(request: Request, dependencies?: DeletionDependencies) {
  const deps = await deletionDependencies(dependencies);
  const { db, readBody, allowAttempt } = deps;
  try {
    const body = await readBody(request);
    const parsed = z.strictObject({
      code: z.string().optional(),
      token: z.string().optional(),
      email: emailSchema.optional(),
      confirmation: z.literal("DISABLE"),
    }).safeParse(body);

    if (!parsed.success || (!parsed.data.code && !parsed.data.token)) {
      return json({ error: "Enter the 6-digit code from your email and type DISABLE to confirm." }, 400);
    }

    const { code, token, email: submittedEmail } = parsed.data;
    const isOtp = Boolean(code && /^[0-9]{6}$/.test(code));

    if (isOtp && !submittedEmail) {
      return json({ error: "Enter your account email along with the code." }, 400);
    }

    const tokenHash = isOtp
      ? verificationDigest(submittedEmail!, code!)
      : digest(token!);

    if (!await allowAttempt(`delete-complete:${tokenHash}`)) {
      return json({ error: "Too many attempts. Try again later." }, 429);
    }

    await db.$transaction(async (tx) => {
      const record = await tx.verificationToken.findUnique({ where: { token: tokenHash } });
      if (!record || record.expires <= new Date() || !record.identifier.startsWith("disabling:")) {
        throw new InvalidDeletion();
      }

      const [, userId, emailPart] = record.identifier.split(":");
      const email = isOtp ? submittedEmail! : emailPart;

      const user = await tx.user.findFirst({ where: { id: userId, email, isActive: true } });
      if (!user) throw new InvalidDeletion();

      if (user.role === "ADMIN" && (await tx.user.count({ where: { role: "ADMIN", isActive: true, id: { not: userId } } })) === 0) {
        throw new DeletionBlocked("Transfer store administration to another admin before disabling this account.");
      }

      await tx.user.update({ where: { id: userId }, data: { isActive: false, selfDisabledAt: new Date() } });
      await tx.session.deleteMany({ where: { userId } });
      await tx.mobileAuthGrant.deleteMany({ where: { userId } });
      await tx.verificationToken.deleteMany({
        where: {
          OR: [
            { identifier: { startsWith: `disabling:${userId}:` } },
            { identifier: { startsWith: `recovery:reset:${userId}:` } },
            { identifier: { startsWith: `recovery:verify:${userId}:` } },
            { identifier: { startsWith: `recovery:reactivate:${userId}:` } },
            { identifier: { startsWith: `deletion:${userId}:` } },
            { identifier: email },
          ],
        },
      });
    }, { isolationLevel: "Serializable" });

    return json({
      message: "Your account is now disabled and all sessions have been signed out. Your profile and order history remain preserved. You can reactivate anytime from the sign-in page.",
    });
  } catch (error) {
    if (error instanceof DeletionBlocked) return json({ error: error.message }, 409);
    if (error instanceof InvalidDeletion) return json({ error: "Invalid or expired verification code / link. Please request a new one." }, 400);
    console.error("Account disabling failed");
    return json({ error: "Disabling could not be completed. Please try again." }, 503);
  }
}

// Compatibility adapter for callers that inject dependencies (including tests).
export function createDeletionHandlers(dependencies: DeletionDependencies) {
  return {
    request: (request: Request) => requestAccountDeletion(request, dependencies),
    complete: (request: Request) => completeAccountDeletion(request, dependencies),
  };
}
