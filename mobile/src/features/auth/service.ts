import { clearDeviceDrafts } from "../uploads/drafts";
import { Platform } from "react-native";
import { z } from "zod";
import type { AuthUser, LoginDraft, SignupDraft } from "@/features/auth/types";
import { ApiError, apiRequest, clearStoredSession, getSessionSnapshot, updateStoredUser, saveSession } from "@/lib/api";


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

export async function loginWithGoogleIdToken(idToken: string): Promise<AuthUser> {
    if (Platform.OS === "ios") throw new Error("Pls use your CimessFruit account and password to login.");

  const data = await apiRequest("/api/google", {
    method: "POST",
    body: JSON.stringify({ idToken }),
  }, false);

  return acceptSession(data);
}
