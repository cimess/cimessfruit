import { useCallback, useState } from "react";
import { Pressable, Switch, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { apiRequest } from "@/lib/api";
import { pushSupported, syncPushRegistration } from "./client";

export default function NotificationSettings() {
  const [catalogue, setCatalogue] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useFocusEffect(useCallback(() => {
    let active = true;
    if (pushSupported()) void apiRequest<{ catalogueEnabled: boolean }>("/api/notifications/preferences")
      .then(value => { if (active) setCatalogue(value.catalogueEnabled); })
      .catch(() => { if (active) setMessage("Push setup is not active yet."); });
    return () => { active = false; };
  }, []));
  if (!pushSupported()) return <Text className="mt-3 text-xs text-gray-500">Remote push is inactive in this build. Android testing requires a configured development/release build; iOS activation is deferred.</Text>;
  const enable = async () => {
    if (busy) return;
    setBusy(true); setMessage("");
    try { await syncPushRegistration(true); setMessage("Device notifications enabled. Your account preferences still apply."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Unable to enable notifications."); }
    finally { setBusy(false); }
  };
  const change = async (value: boolean) => {
    if (busy) return;
    setBusy(true); setMessage("");
    try {
      if (value) await syncPushRegistration(true);
      await apiRequest("/api/notifications/preferences", { method: "PATCH", body: JSON.stringify({ catalogueEnabled: value }) });
      setCatalogue(value);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to save preference."); }
    finally { setBusy(false); }
  };
  return <View className="mt-3 rounded-2xl bg-[#FAFBF7] p-4">
    <View className="flex-row items-center"><View className="flex-1"><Text className="font-bold">Product and restock alerts</Text><Text className="text-xs text-gray-500">New arrivals and stock additions. Optional.</Text></View><Switch disabled={busy} value={catalogue} onValueChange={value => void change(value)} /></View>
    <Pressable disabled={busy} onPress={() => void enable()} className="mt-3"><Text className="font-bold text-green-800">{busy ? "Saving…" : "Enable device notifications"}</Text></Pressable>
    {!!message && <Text accessibilityRole="alert" className="mt-2 text-xs text-gray-600">{message}</Text>}
  </View>;
}
