import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { mobileUser } from "@/server/auth/mobile-session";
import { auth } from "@/auth";
import { activeUser, type UserRole } from "@/domain/session-user";

// Auth.js already loads the user with the session; no second profile lookup.
export const getCurrentUser = cache(async () => {
  const requestHeaders = await headers();
  // A malformed or expired bearer must never fall back to a browser cookie.
  if (requestHeaders.has("authorization")) return mobileUser(requestHeaders);
  return activeUser((await auth())?.user);
});

// Keep authorization beside protected data, even when Proxy also checks it.
export async function requireUser(role?: UserRole) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");
  if (role && user.role !== role) throw new Error("Forbidden");
  return user;
}
