import { useState } from "react";
import { Stack } from "expo-router";
import { Linking, Pressable, ScrollView, Text, TextInput } from "react-native";
import { apiRequest } from "@/lib/api";
import { useAuthStore } from "@/features/auth/store";
export default function DeleteAccount() {
  const user = useAuthStore(state => state.user);
  const [email, setEmail] = useState(user?.email ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function requestDeletion() {
    if (busy) return; setBusy(true); setMessage("");
    try {
      const result = await apiRequest<{ message: string }>("/api/account-disabling/request", { method: "POST", body: JSON.stringify({ email: email.trim() }) }, false);
      setMessage(result.message);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to request disabling."); }
    finally { setBusy(false); }
  }
  return <ScrollView className="flex-1 bg-white p-5" keyboardShouldPersistTaps="handled"><Stack.Screen options={{ title: "Disable account" }} />
    <Text className="mb-4 text-xl font-bold">Disable your CimessFruit account</Text>
    <Text className="mb-4">We will email you a confirmation link. Your account stays active until you confirm. You can reactivate later using a secure email link.</Text>
    <Text className="mb-4">Sign-in will be disabled and all sessions ended. Your profile, orders, payments, refunds and support history remain linked to your account. Existing orders and financial obligations remain in place.</Text>
    <TextInput accessibilityLabel="Account email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" maxLength={254} placeholder="Account email" className="mb-4 rounded-xl border p-4" />
    <Pressable disabled={busy || !email.trim()} onPress={() => void requestDeletion()}><Text className="py-4 font-bold text-red-700">{busy ? "Sending…" : "Email my disabling confirmation link"}</Text></Pressable>
    <Text accessibilityRole="alert">{message}</Text>
    <Pressable onPress={() => void Linking.openURL("mailto:cimessthemanofvalor@gmail.com?subject=Account%20disabling%20help").catch(() => setMessage("Email cimessthemanofvalor@gmail.com for account disabling help."))}><Text className="py-4 text-green-700">Cannot access your email? Contact support</Text></Pressable>
  </ScrollView>;
}
