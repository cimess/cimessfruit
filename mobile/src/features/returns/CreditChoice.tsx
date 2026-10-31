import { useCallback, useState } from "react";
import { Pressable, Switch, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { apiRequest } from "@/lib/api";
import { formatNaira } from "@/lib/currency";
export default function CreditChoice({ selected, onChange, replacementId, onReplacement }: { selected: boolean; onChange: (value: boolean) => void; replacementId: string; onReplacement: (value: string) => void }) {
  const [replacements, setReplacements] = useState<{ id: string; orderId: string }[]>([]);
  const [balance, setBalance] = useState<number | null>(null), [error, setError] = useState(""), [revision, setRevision] = useState(0);
  useFocusEffect(useCallback(() => {
    const controller = new AbortController();
    void apiRequest<{ available: number; replacements: { id: string; orderId: string }[] }>("/api/returns/balance", { signal: controller.signal }).then(value => {
      if (!controller.signal.aborted) { setBalance(value.available); setReplacements(value.replacements); setError(""); }
    }).catch(error => { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "Unable to load credit"); });
    return () => controller.abort();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- revision intentionally triggers manual refresh.
  }, [revision]));
  return <View className="my-3 rounded-2xl bg-white p-4"><Text className="font-bold">Return credit: {balance === null ? "checking…" : formatNaira(balance / 100)}</Text><View className="flex-row items-center"><Text className="flex-1 text-sm">Use available credit; transfer only the remaining amount.</Text><Switch disabled={!selected && (!balance || !!error)} value={selected} onValueChange={value => { onChange(value); if (!value) onReplacement(""); }} /></View><Text className="mt-2 font-bold">Replacement delivery</Text><Pressable onPress={() => onReplacement("")}><Text className="py-2">{!replacementId ? "✓ " : ""}No replacement benefit</Text></Pressable>{replacements.map(item => <Pressable key={item.id} onPress={() => { onReplacement(item.id); onChange(true); }}><Text className="py-2">{replacementId === item.id ? "✓ " : ""}Order {item.orderId.slice(0, 8)} — delivery waived once</Text></Pressable>)}{!!error && <Text accessibilityRole="alert">{error}</Text>}<Pressable onPress={() => setRevision(value => value + 1)}><Text className="font-bold text-green-800">Refresh balance</Text></Pressable></View>;
}
