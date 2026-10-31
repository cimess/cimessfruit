import { requestMetrics } from "@/features/diagnostics/requests";
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import { createApiClient } from "./api-client";
export { ApiError } from "./api-client";
export type { StoredSession } from "./api-client";

const SESSION_KEY = "cimessfruit.session";
const storageOptions = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
let storagePolicyApplied = false;

function requireNative() {
  if (Platform.OS !== "ios" && Platform.OS !== "android") {
    throw new Error("This authentication client supports the iOS and Android apps only.");
  }
}
export function apiOrigin() {
  requireNative();
  const configured = process.env.EXPO_PUBLIC_API_URL;
  if (!configured) throw new Error("Set EXPO_PUBLIC_API_URL to your API server URL.");
  let url: URL;
  try { url = new URL(configured); }
  catch { throw new Error("EXPO_PUBLIC_API_URL must be a full URL, including http:// or https://."); }
  if (url.protocol !== "https:" && !(__DEV__ && url.protocol === "http:")) throw new Error("The API must use HTTPS.");
  if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("EXPO_PUBLIC_API_URL must contain only an origin without credentials.");
  }
  return url.origin;
}

const client = createApiClient({
  observe: sample => { if (process.env.EXPO_PUBLIC_REQUEST_METRICS_ENABLED === "true") requestMetrics.observe(sample); },
  origin: apiOrigin,
  fetch: (url, options) => fetch(url, options),
  async read() {
    requireNative();
    const value = await SecureStore.getItemAsync(SESSION_KEY);
    // Apply the stricter policy to credentials saved by the previous version too.
    if (value && !storagePolicyApplied) {
      await SecureStore.setItemAsync(SESSION_KEY, value, storageOptions);
      storagePolicyApplied = true;
      return SecureStore.getItemAsync(SESSION_KEY);
    }
    return value;
  },
  async write(value) {
    requireNative();
    await SecureStore.setItemAsync(SESSION_KEY, value, storageOptions);
    storagePolicyApplied = true;
  },
  async remove() {
    requireNative();
    await SecureStore.deleteItemAsync(SESSION_KEY);
    requestMetrics.reset();
  },
});
export const { apiRequest, commitAuthenticatedUser, readStoredSession, getSessionSnapshot, updateStoredUser, saveSession, clearStoredSession, setUnauthorizedHandler } = client;
