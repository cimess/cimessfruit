import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/server/database/prisma";
import { bearerToken, mobileSessionKey } from "@/server/auth/mobile-session";
import { getCurrentUser } from "@/server/auth/current-user";
import { json } from "@/server/auth/password-auth";

export async function POST(request: NextRequest) {
  if (!await getCurrentUser()) return json({ error: "Unauthorized" }, 401);
  const token = bearerToken(request.headers);
  const response = NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  if (token) {
    await prisma.session.deleteMany({ where: { sessionToken: mobileSessionKey(token) } });
  } else {
    for (const name of ["authjs.session-token", "__Secure-authjs.session-token"]) {
      const cookie = request.cookies.get(name);
      if (cookie) await prisma.session.deleteMany({ where: { sessionToken: cookie.value } });
      response.cookies.set(name, "", { maxAge: 0, path: "/", httpOnly: true, secure: name.startsWith("__Secure-"), sameSite: "lax" });
    }
  }
  return response;
}
