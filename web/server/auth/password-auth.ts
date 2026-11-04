import "server-only";
import { normalizeIdentity } from "../../validation/auth-validation";
export { loginSchema, signupSchema } from "../../validation/auth-validation";
import { prisma } from "@/server/database/prisma";
import { hashSecret } from "@/server/auth/mobile-session";

export const json = (body: unknown, status = 200) => Response.json(body, {
  status, headers: { "Cache-Control": "no-store" },
});

// Shared database counter: limits survive restarts and multiple server instances.
export async function allowAuthAttempt(identity: string) {
  const window = Math.floor(Date.now() / (15 * 60 * 1000));
  const result = await prisma.authRateLimit.upsert({
    where: { key: hashSecret(`${window}:${normalizeIdentity(identity)}`) },
    create: { key: hashSecret(`${window}:${normalizeIdentity(identity)}`), expires: new Date((window + 1) * 15 * 60 * 1000) },
    update: { attempts: { increment: 1 } },
  });
  return result.attempts <= 10;
}

export async function readBody(request: Request) {
  if (!request.headers.get("content-type")?.startsWith("application/json")) return null;
  // Read a bounded stream rather than trusting Content-Length.
  const reader = request.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 8192) { await reader.cancel(); return null; }
    chunks.push(value);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { return null; }
}
