import { z } from "zod";
import { prisma } from "@/server/database/prisma";
import { hashSecret, issueMobileSession, safeUserSelect } from "@/server/auth/mobile-session";
import { json, readBody } from "@/server/auth/password-auth";
const schema = z.object({ code: z.string().regex(/^[a-f0-9]{64}$/), verifier: z.string().regex(/^[a-f0-9]{64}$/) });

export async function POST(request: Request) {
  const parsed = schema.safeParse(await readBody(request));
  if (!parsed.success) return json({ error: "Invalid authorization code" }, 400);
  const codeHash = hashSecret(parsed.data.code);
  const challenge = hashSecret(parsed.data.verifier);
  const grant = await prisma.mobileAuthGrant.findUnique({ where: { codeHash } });
  if (!grant || grant.challenge !== challenge || grant.expires <= new Date()) return json({ error: "Invalid or expired authorization code" }, 401);
  // Conditional deletion makes redemption atomic, including concurrent requests.
  const consumed = await prisma.mobileAuthGrant.deleteMany({ where: { codeHash, challenge, expires: { gt: new Date() } } });
  if (consumed.count !== 1) return json({ error: "Authorization code already used" }, 401);
  const user = await prisma.user.findUnique({ where: { id: grant.userId }, select: safeUserSelect });
  if (!user?.isActive) return json({ error: "Unauthorized" }, 401);
  return json(await issueMobileSession(user));
}
