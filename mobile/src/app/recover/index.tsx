import { useState } from "react";
import { Stack } from "expo-router";
import { Pressable, Text, TextInput, View } from "react-native";
import { apiRequest } from "@/lib/api";
export default function Recovery() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function send(kind: "reset" | "verify") {
    if (busy) return;
    setBusy(true);
    try {
      const result = await apiRequest<{ message: string }>("/api/recovery/request", { method: "POST", body: JSON.stringify({ email: email.trim(), kind }) }, false);
      setMessage(result.message);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Please retry."); }
    finally { setBusy(false); }
  }
  return <View className="flex-1 bg-white p-6"><Stack.Screen options={{ title: "Account recovery" }} /><Text className="text-xl font-bold">Recover your account</Text><Text className="my-4">Enter your email. Open the secure link in your inbox to continue.</Text><TextInput accessibilityLabel="Email" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} className="border rounded-xl p-4" placeholder="Email address" /><Pressable disabled={busy} onPress={() => void send("reset")}><Text className="p-4 font-bold">Send password reset link</Text></Pressable><Pressable disabled={busy} onPress={() => void send("verify")}><Text className="p-4 font-bold">Send email verification link</Text></Pressable><Text accessibilityRole="alert">{message}</Text></View>;
}
