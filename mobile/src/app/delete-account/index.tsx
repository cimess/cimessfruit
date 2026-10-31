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
      const result = await apiRequest<{ message: string }>("/api/account-deletion/request", { method: "POST", body: JSON.stringify({ email: email.trim() }) }, false);
      setMessage(result.message);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to request deletion."); }
    finally { setBusy(false); }
  }
  return <ScrollView className="flex-1 bg-white p-5" keyboardShouldPersistTaps="handled"><Stack.Screen options={{ title: "Delete account" }} />
    <Text className="mb-4 text-xl font-bold">Delete your CimessFruit account</Text>
    <Text className="mb-4">We will email you a confirmation link. Nothing is deleted until you open the link and confirm. Deletion cannot be undone.</Text>
    <Text className="mb-4">Your profile, saved delivery details and coordinates, sign-in credentials, sessions and support messages will be removed. Sales records remain without your account link or delivery details. Resolve active orders and payment reviews first.</Text>
    <TextInput accessibilityLabel="Account email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" maxLength={254} placeholder="Account email" className="mb-4 rounded-xl border p-4" />
    <Pressable disabled={busy || !email.trim()} onPress={() => void requestDeletion()}><Text className="py-4 font-bold text-red-700">{busy ? "Sending…" : "Email my deletion confirmation link"}</Text></Pressable>
    <Text accessibilityRole="alert">{message}</Text>
    <Pressable onPress={() => void Linking.openURL("mailto:cimessthemanofvalor@gmail.com?subject=Account%20deletion%20help").catch(() => setMessage("Email cimessthemanofvalor@gmail.com for account deletion help."))}><Text className="py-4 text-green-700">Cannot access your email? Contact support</Text></Pressable>
  </ScrollView>;
}
