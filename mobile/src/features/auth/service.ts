import { clearDeviceDrafts } from "../uploads/drafts";
import { Platform } from "react-native";
import * as Crypto from "expo-crypto";
import * as WebBrowser from "expo-web-browser";
import { z } from "zod";
import type { AuthUser, LoginDraft, SignupDraft } from "@/features/auth/types";
import { ApiError, apiOrigin, apiRequest, clearStoredSession, getSessionSnapshot, updateStoredUser, saveSession } from "@/lib/api";
import * as Linking from "expo-linking";


const userSchema = z.object({
  id: z.string(), name: z.string().nullable(), email: z.string().nullable(),
  phone: z.string().nullable(), image: z.string().nullable(),
  role: z.enum(["CUSTOMER", "ADMIN"]), isActive: z.literal(true),
});
function mapUser(data: unknown): AuthUser {
  const user = userSchema.parse(data);
  return { ...user, name: user.name ?? "", email: user.email ?? "", phoneNumber: user.phone ?? "" };
}
const sessionSchema = z.object({
  token: z.string().regex(/^mobile_[a-f0-9]{64}$/), expires: z.iso.datetime(), user: userSchema,
});
async function acceptSession(data: unknown): Promise<AuthUser> {
  const session = sessionSchema.parse(data);
  await saveSession(session);
  return mapUser(session.user);
}
export async function fetchCurrentSession(): Promise<AuthUser | null> {
  const snapshot = await getSessionSnapshot();
  if (!snapshot.session) return null;
  try {
    const { user } = await apiRequest<{ user: unknown }>("/api/me");
    const mapped = mapUser(user);
    await updateStoredUser(snapshot, user);
    return mapped;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  }
}
export async function loginUser(draft: LoginDraft): Promise<AuthUser> {
  return acceptSession(await apiRequest("/api/mobile/login", { method: "POST", body: JSON.stringify(draft) }, false));
}
export async function signupUser(draft: SignupDraft): Promise<AuthUser> {
  return acceptSession(await apiRequest("/api/mobile/signup", { method: "POST", body: JSON.stringify(draft) }, false));
}
export async function logoutUser(): Promise<void> {
  try {
    await apiRequest("/api/mobile/logout", { method: "POST" });
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401) throw error;
  }
  try { clearDeviceDrafts(); } finally { await clearStoredSession(); }
}
export async function loginWithGoogle(): Promise<AuthUser> {
  if (Platform.OS === "ios") throw new Error("Use your CimessFruit email and password on iPhone.");
  const origin = apiOrigin();
  const verifier = Array.from(await Crypto.getRandomBytesAsync(32), (byte) => byte.toString(16).padStart(2, "0")).join("");
  const challenge = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, verifier);
  
  // Dynamically create the callback URL (works for both Expo Go and production builds)
  const callback = Linking.createURL("auth/callback");
  
  const result = await WebBrowser.openAuthSessionAsync(
    `${origin}/mobile-auth?challenge=${challenge}&callback=${encodeURIComponent(callback)}`,
    callback
  );
  if (result.type !== "success") throw new Error("Google sign-in was cancelled.");
  
  const returned = new URL(result.url);
  const expected = new URL(callback);
  if (returned.protocol !== expected.protocol || returned.host !== expected.host || returned.pathname !== expected.pathname) {
    throw new Error("Invalid sign-in callback.");
  }
  // Extract state & code from query params
  if (returned.searchParams.get("state") !== challenge) {
    throw new Error("Invalid sign-in response.");
  }
  const code = returned.searchParams.get("code");
  if (!code || !/^[a-f0-9]{64}$/.test(code)) throw new Error("Missing sign-in code.");
try {
  const session = await apiRequest(
    "/api/mobile/exchange",
    {
      method: "POST",
      body: JSON.stringify({ code, verifier }),
    },
    false
  );

  return await acceptSession(session);
} catch (error) {
  if (error instanceof ApiError) {
    throw new Error(
      `Could not finish Google sign-in (HTTP ${error.status}). ${error.message}`
    );
  }

  throw error;
}
}
