import { Platform } from "react-native";
import Constants, { ExecutionEnvironment } from "expo-constants";
import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";
import { apiRequest, getSessionSnapshot } from "@/lib/api";

export function pushSupported() {
  return process.env.EXPO_PUBLIC_PUSH_ENABLED === "true" && Constants.executionEnvironment !== ExecutionEnvironment.StoreClient &&
    (Platform.OS === "android" || Platform.OS === "ios" && process.env.EXPO_PUBLIC_IOS_PUSH_ENABLED === "true");
}
let installation: Promise<string> | undefined;
function installationId() {
  return installation ??= (async () => {
    const key = "cimessfruit.push-installation";
    const existing = await SecureStore.getItemAsync(key);
    if (existing) return existing;
    const id = Crypto.randomUUID();
    await SecureStore.setItemAsync(key, id);
    return id;
  })().catch(error => { installation = undefined; throw error; });
}
export async function syncPushRegistration(requestPermission = false) {
  if (!pushSupported()) {
    if (requestPermission) throw Error("Push needs an enabled Android development/release build. iOS activation is deferred.");
    return;
  }
  const snapshot = await getSessionSnapshot();
  if (!snapshot.session) return;
  // Import only after the Expo Go/platform gate; avoid unavailable native module initialization.
  const Notifications = await import("expo-notifications");
  if (Platform.OS === "android") await Notifications.setNotificationChannelAsync("updates", {
    name: "Shop and order updates", importance: Notifications.AndroidImportance.DEFAULT,
  });
  let permission = await Notifications.getPermissionsAsync();
  if (!permission.granted && requestPermission && permission.canAskAgain) permission = await Notifications.requestPermissionsAsync();
  const id = await installationId();
  if (!permission.granted) {
    await apiRequest("/api/notifications/devices", { method: "DELETE", body: JSON.stringify({ installationId: id }) });
    if (requestPermission) throw Error("Notifications are disabled. You can allow them in your phone settings.");
    return;
  }
  const projectId = Constants.easConfig?.projectId ?? Constants.expoConfig?.extra?.eas?.projectId;
  if (!projectId) throw Error("Configure your EAS project ID before enabling push.");
  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  const current = await getSessionSnapshot();
  if (current.version !== snapshot.version || current.session?.token !== snapshot.session.token) return;
  await apiRequest("/api/notifications/devices", { method: "POST", body: JSON.stringify({ installationId: id, token, platform: Platform.OS }) });
}
