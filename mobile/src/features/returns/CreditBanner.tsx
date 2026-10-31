import { useCallback, useEffect, useState } from "react";
import { AppState, Pressable, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/features/auth/store";
import { apiRequest } from "@/lib/api";
import { formatNaira } from "@/lib/currency";
type Summary = { available: number; pendingRefund: number; expiresAt: string | null; serverTime: string };
export default function CreditBanner() {
  const owner = useAuthStore(state => state.user?.id), router = useRouter(), client = useQueryClient();
  const [focused, setFocused] = useState(false), [active, setActive] = useState(AppState.currentState === "active");
  useFocusEffect(useCallback(() => { setFocused(true); return () => setFocused(false); }, []));
  useEffect(() => { const listener = AppState.addEventListener("change", state => setActive(state === "active")); return () => listener.remove(); }, []);
  const key = ["approved-return-balance", owner] as const;
  const ready = !!owner && focused && active;
  const query = useQuery({ queryKey: key, enabled: ready, staleTime: 0, retry: 1, queryFn: ({ signal }) => apiRequest<Summary>("/api/returns/balance", { signal }) });
  useEffect(() => { if (!ready) void client.cancelQueries({ queryKey: ["approved-return-balance", owner], exact: true }); }, [ready, owner, client]);
  useEffect(() => {
    if (!ready || !query.data?.expiresAt) return;
    const delay = Date.parse(query.data.expiresAt) - Date.parse(query.data.serverTime) - (Date.now() - query.dataUpdatedAt);
    const timer = setTimeout(() => { void client.invalidateQueries({ queryKey: ["approved-return-balance", owner], exact: true }); }, Math.max(0, delay) + 150);
    return () => clearTimeout(timer);
  }, [ready, query.data, query.dataUpdatedAt, client, owner]);
  const summary = query.data;
  if (!summary || (!summary.available && !summary.pendingRefund)) return null;
  return <View accessibilityLabel="Approved return balance" className="mx-4 my-3 rounded-2xl border border-green-200 bg-green-50 p-4">
    {query.isFetching ? <Text>Checking your approved return balance…</Text> : query.isError ? <Text>Your approved balance needs a refresh before shopping.</Text> : <>{summary.available > 0 && <><Text className="text-lg font-extrabold text-green-900">{formatNaira(summary.available / 100)} approved — buy again</Text><Text className="mt-1 text-sm">Use it at checkout within 20 minutes of approval. Any unused money goes to a bank refund afterward.</Text><Pressable onPress={() => router.push("/shop")}><Text className="py-2 font-bold text-green-800">Shop with approved credit</Text></Pressable></>}{summary.pendingRefund > 0 && <Text className="mt-2 font-bold">{formatNaira(summary.pendingRefund / 100)} awaiting manual refund — no longer spendable.</Text>}</>}
    <View className="flex-row gap-4"><Pressable onPress={() => router.push("/orders")}><Text className="py-2 font-bold">View refund details</Text></Pressable><Pressable disabled={query.isFetching} onPress={() => void query.refetch()}><Text className="py-2 font-bold">Refresh balance</Text></Pressable></View>
  </View>;
}
