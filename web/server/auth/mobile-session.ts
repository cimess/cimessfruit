import "server-only";
import { randomBytes } from "node:crypto";
import { prisma } from "@/server/database/prisma";
import { activeUser, safeUserSelect, type SessionUser } from "@/domain/session-user";

import { bearerToken, mobileSessionKey } from "./auth-secrets";
export { hashSecret, bearerToken, mobileSessionKey } from "./auth-secrets";
export { safeUserSelect } from "@/domain/session-user";

export async function mobileUser(headers: Headers): Promise<SessionUser | null> {
  const token = bearerToken(headers);
  if (!token) return null;
  const session = await prisma.session.findUnique({
    where: { sessionToken: mobileSessionKey(token) },
    select: { expires: true, user: { select: safeUserSelect } },
  });
  if (!session || session.expires <= new Date()) return null;
  return activeUser(session.user);
}

export async function issueMobileSession(user: SessionUser) {
  if (!activeUser(user)) throw new Error("Unauthorized");
  const token = `mobile_${randomBytes(32).toString("hex")}`;
  const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await prisma.session.create({ data: { userId: user.id, sessionToken: mobileSessionKey(token), expires } });
  return { token, expires: expires.toISOString(), user };
}

// Browsers retain HttpOnly cookies; native apps receive a SecureStore credential.
export async function sessionResponse(user: SessionUser, request: Request, status = 200) {
  if (!request.headers.has("origin") && !request.headers.has("sec-fetch-site")) {
    return Response.json(await issueMobileSession(user), { status, headers: { "Cache-Control": "no-store" } });
  }
  const { NextResponse } = await import("next/server");
  const token = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await prisma.session.create({ data: { userId: user.id, sessionToken: token, expires } });
  const response = NextResponse.json({ user, expires: expires.toISOString() }, { status, headers: { "Cache-Control": "no-store" } });
  const secure = new URL(process.env.AUTH_URL ?? request.url).protocol === "https:";
  response.cookies.set(secure ? "__Secure-authjs.session-token" : "authjs.session-token", token, {
    httpOnly: true, secure, sameSite: "lax", path: "/", expires,
  });
  return response;
}
