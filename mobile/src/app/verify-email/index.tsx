import { useState } from "react";
import { Stack, useRouter } from "expo-router";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput } from "react-native";
import { apiRequest } from "@/lib/api";
import { useUserStore } from "@/features/user/store";
import { useAuthStore } from "@/features/auth/store";
export default function VerifyEmail() {
  const router = useRouter();
  const profile = useUserStore(state => state.profile);
  const user = useAuthStore(state => state.user);
  const loadProfile = useUserStore(state => state.refreshProfile);
  const [email, setEmail] = useState(profile?.email ?? user?.email ?? "");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function submit(complete: boolean) {
    if (busy) return;
    setBusy(true); setMessage("");
    try {
      const result = await apiRequest<{ message: string }>(`/api/recovery/${complete ? "complete" : "request"}`, {
        method: "POST", body: JSON.stringify({ email: email.trim(), kind: "verify", ...(complete ? { token: code } : {}) }),
      }, false);
      setMessage(result.message);
      if (complete) { setDone(true); if (user) void loadProfile(); }
      else { setSent(true); setCode(""); }
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to reach the server. Please retry."); }
    finally { setBusy(false); }
  }
  return <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
    <ScrollView className="flex-1 bg-white" contentContainerStyle={{ padding: 24, gap: 16 }} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: "Verify email" }} />
      <Text className="text-sm font-bold text-green-700">ACCOUNT SECURITY</Text>
      <Text className="text-3xl font-bold text-gray-950">{done ? "Email verified" : "Verify your email"}</Text>
      {done ? <Text>Your email is now verified.</Text> : <>
        <Text className="text-base text-gray-600">{sent ? "Enter the six-digit code from your email. It expires in 10 minutes. Only the latest code works." : "We’ll email you a six-digit code to confirm this address belongs to you."}</Text>
        <Text>Email address</Text>
        <TextInput accessibilityLabel="Email address" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" editable={!sent && !busy} maxLength={254} className="rounded-xl border border-gray-300 p-4" />
        {sent && <><Text>Verification code</Text><TextInput autoFocus accessibilityLabel="Six-digit verification code" value={code} onChangeText={value => setCode(value.replace(/\D/g, "").slice(0, 6))} keyboardType="number-pad" autoComplete="one-time-code" textContentType="oneTimeCode" maxLength={6} editable={!busy} placeholder="000000" className="rounded-xl border border-gray-300 p-4 text-center text-3xl" style={{ letterSpacing: 8 }} /></>}
        <Pressable accessibilityRole="button" disabled={busy || !email.trim() || (sent && code.length !== 6)} onPress={() => void submit(sent)} className="rounded-xl bg-green-700 p-4" style={{ opacity: busy || !email.trim() || (sent && code.length !== 6) ? 0.5 : 1 }}><Text className="text-center font-bold text-white">{busy ? "Please wait…" : sent ? "Verify email" : "Send verification code"}</Text></Pressable>
        {sent && <><Pressable accessibilityRole="button" disabled={busy} onPress={() => void submit(false)}><Text className="p-3 text-center font-bold text-green-700">Resend code</Text></Pressable><Pressable accessibilityRole="button" disabled={busy} onPress={() => { setSent(false); setCode(""); setMessage(""); }}><Text className="p-3 text-center text-gray-600">Change email</Text></Pressable></>}
      </>}
      {!!message && <Text accessibilityRole="alert">{message}</Text>}
      <Pressable accessibilityRole="button" onPress={() => router.back()}><Text className="p-3 text-center font-bold text-green-700">Back</Text></Pressable>
    </ScrollView>
  </KeyboardAvoidingView>;
}
