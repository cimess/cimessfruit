import type { NextRequest } from "next/server";
import { mobileUser } from "@/server/auth/mobile-session";
import { auth } from "@/auth";
import { guardRequest } from "@/server/auth/proxy-policy";

export async function proxy(request: NextRequest) {
  return guardRequest(request, async () => request.headers.has("authorization")
    ? { user: (await mobileUser(request.headers)) ?? undefined }
    : await auth());
}

export const config = {
  matcher: ["/((?!api/auth(?:/|$)|_next/static(?:/|$)|_next/image(?:/|$)|favicon\\.ico$|(?:next|globe|file|vercel|window)\\.svg$).*)"],
};
