import { useEffect, useState } from "react";
import { Stack, useRouter } from "expo-router";
import { Pressable, ScrollView, Text, TextInput } from "react-native";
import { useUserStore } from "@/features/user/store";
export default function EditProfile() {
  const router = useRouter();
  const { profile, loadProfile, updateProfile, isSaving } = useUserStore();
  const [name, setName] = useState<string | null>(null); const [phone, setPhone] = useState<string | null>(null); const [error, setError] = useState("");
  useEffect(() => { void loadProfile(); }, [loadProfile]);
  const draftName = name ?? profile?.name ?? "";
  const draftPhone = phone ?? profile?.phoneNumber ?? "";
  async function save() { try { setError(""); await updateProfile({ name: draftName.trim(), phone: draftPhone.trim() || null }); router.back(); } catch (err) { setError(err instanceof Error ? err.message : "Unable to save profile."); } }
  return <ScrollView className="flex-1 bg-white p-5" keyboardShouldPersistTaps="handled"><Stack.Screen options={{ title: "Edit profile" }} /><Text>Name</Text><TextInput accessibilityLabel="Name" value={draftName} onChangeText={setName} className="my-3 rounded-xl border p-4" /><Text>Phone number</Text><TextInput accessibilityLabel="Phone number" keyboardType="phone-pad" value={draftPhone} onChangeText={setPhone} className="my-3 rounded-xl border p-4" /><Text>{profile?.email}</Text><Text className="my-3" accessibilityRole="alert">{error}</Text><Pressable disabled={isSaving || !profile} onPress={() => void save()} className="rounded-xl bg-green-700 p-4"><Text className="text-center font-bold text-white">{isSaving ? "Saving…" : "Save profile"}</Text></Pressable></ScrollView>;
}
