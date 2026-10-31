import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Pressable, ScrollView, Text } from "react-native";
import policies from "@/features/legal/policies.json";
export default function PolicyPage() {
  const { policy } = useLocalSearchParams<{ policy: string }>();
  const router = useRouter();
  const content = Object.hasOwn(policies, policy ?? "") ? policies[policy as keyof typeof policies] : null;
  return <ScrollView className="flex-1 bg-white p-5" contentContainerStyle={{ paddingBottom: 60 }}>
    <Stack.Screen options={{ title: content?.title ?? "Policy" }} />
    <Text className="mb-5 text-2xl font-bold">{content?.title ?? "Policy not found"}</Text>
    {content?.sections.map(section => <Text key={section.title} className="mb-5 leading-6"><Text className="font-bold">{section.title}{"\n"}</Text>{section.text}</Text>)}
    <Pressable onPress={() => router.push("/delete-account")}><Text className="py-4 font-bold text-green-700">Delete my account</Text></Pressable>
  </ScrollView>;
}
