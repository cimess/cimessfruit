import { useQuery } from "@tanstack/react-query";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import * as Linking from "expo-linking";
import { useState } from "react";
import { ActivityIndicator, FlatList, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { fetchPolicy, isPolicyId, policyNames } from "@/features/legal/service";

export default function PolicyPage() {
  const { policy } = useLocalSearchParams<{ policy: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [linkError, setLinkError] = useState<string | null>(null);
  const valid = isPolicyId(policy);
  const query = useQuery({
    queryKey: ["legal-policy", policy],
    queryFn: ({ signal }) => {
      if (!isPolicyId(policy)) throw new Error("Policy not found");
      return fetchPolicy(policy, signal);
    },
    enabled: valid,
    staleTime: 0,
    retry: 1,
  });
  const content = query.data;
  const title = content?.title ?? (valid ? policyNames[policy] : "Policy not found");
  const openLink = async (url: string) => {
    setLinkError(null);
    try { await Linking.openURL(url); }
    catch { setLinkError("This link could not be opened. You can copy the address below."); }
  };

  return (
    <View className="flex-1 bg-white">
      <Stack.Screen options={{ title: "Legal information", headerShown: true }} />
      <FlatList
        key={policy}
        data={content?.sections ?? []}
        keyExtractor={section => section.id}
        contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40 }}
        initialNumToRender={4}
        refreshing={valid && query.isFetching && !!content}
        onRefresh={valid ? () => { void query.refetch(); } : undefined}
        ListHeaderComponent={
          <View>
            <Text className="mb-2 text-xs font-bold uppercase text-green-700">CimessFruit · CimessInvest</Text>
            <Text accessibilityRole="header" className="mb-4 text-3xl font-bold text-gray-950">{title}</Text>
            <View className="mb-5 flex-row flex-wrap gap-2">
              {Object.entries(policyNames).map(([id, label]) => (
                <Pressable key={id} accessibilityRole="link" accessibilityState={{ selected: id === policy }}
                  onPress={() => { if (id !== policy) router.replace({ pathname: "/policies/[policy]", params: { policy: id } }); }}
                  className={`rounded-xl px-3 py-3 ${id === policy ? "bg-green-100" : "bg-gray-100"}`}>
                  <Text className="text-sm font-semibold text-gray-800">{label}</Text>
                </Pressable>
              ))}
            </View>
            {content && <>
              <Text selectable className="mb-3 text-xs text-gray-500">Revised {content.updatedAt} · Version {content.version}</Text>
              <Text selectable className="mb-6 text-base leading-7 text-gray-700">{content.summary}</Text>
            </>}
            {!valid && <Text className="mb-5 text-gray-700">Choose a policy above to read the store’s legal information.</Text>}
            {valid && !content && query.isPending && <View className="items-center py-8">
              <ActivityIndicator accessibilityLabel="Loading policy" color="#15803d" />
              <Text className="mt-3 text-gray-600">Loading the latest policy…</Text>
            </View>}
            {valid && query.isError && <View accessibilityLiveRegion="polite" className="mb-6 rounded-xl bg-amber-50 p-4">
              <Text className="leading-6 text-amber-900">{content
                ? "We could not refresh this policy. You are reading the previously loaded version shown above."
                : "We could not load this policy. Check your connection and try again, or contact us for a copy."}</Text>
              <Pressable accessibilityRole="button" disabled={query.isFetching} onPress={() => { void query.refetch(); }} className="py-3">
                <Text className="font-bold text-green-800">{query.isFetching ? "Retrying…" : "Try again"}</Text>
              </Pressable>
            </View>}
          </View>
        }
        renderItem={({ item }) => (
          <View className="mb-7">
            <Text accessibilityRole="header" className="mb-3 text-xl font-bold text-gray-950">{item.title}</Text>
            {item.paragraphs.map((paragraph, index) => <Text key={index} selectable className="mb-3 text-base leading-7 text-gray-700">{paragraph}</Text>)}
          </View>
        )}
        ListFooterComponent={
          <View className="mt-5 border-t border-gray-200 pt-5">
            <Text accessibilityRole="header" className="mb-3 text-lg font-bold">Contact CimessInvest</Text>
            {[
              { label: "cimessinvest@gmail.com", url: "mailto:cimessinvest@gmail.com" },
              { label: "+234 808 927 3565", url: "tel:+2348089273565" },
              ...(content?.links ?? []),
            ].map(link => <View key={link.url} className="mb-2">
              <Pressable accessibilityRole="link" onPress={() => { void openLink(link.url); }} className="py-3">
                <Text className="font-semibold text-green-800">{link.label}</Text>
              </Pressable>
              <Text selectable className="text-xs text-gray-500">{link.url}</Text>
            </View>)}
            {linkError && <Text accessibilityLiveRegion="polite" className="my-3 text-red-700">{linkError}</Text>}
            <Pressable accessibilityRole="link" onPress={() => router.push("/delete-account")} className="py-4">
              <Text className="font-bold text-green-800">Disable my account</Text>
            </Pressable>
            <Text className="text-sm leading-6 text-gray-600">Disabling stops account access. For a personal-data erasure request, contact us separately.</Text>
          </View>
        }
      />
    </View>
  );
}
