import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { apiRequest } from "@/lib/api";
import type { CreditChoice, Choice } from "./types";
export default function ResolutionChoice({ credit, serverTime, refresh }: { credit: CreditChoice; serverTime: string; refresh: () => void }) {
  const [now, setNow] = useState(Date.now), [offset] = useState(() => Date.parse(serverTime) - Date.now());
  const [error, setError] = useState(""), [busy, setBusy] = useState(false); const lock = useRef(false);
  useFocusEffect(useCallback(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []));
  const remaining = Math.max(0, Date.parse(credit.refundDueAt) - now - offset);
  const startedOpen = useRef(remaining > 0);
  useEffect(() => { if (remaining === 0 && startedOpen.current) { startedOpen.current = false; refresh(); } }, [remaining, refresh]);
  async function choose(choice: Choice) {
    if (lock.current) return; lock.current = true; setBusy(true); setError("");
    try { await apiRequest(`/api/returns/${credit.id}/choice`, { method: "PATCH", body: JSON.stringify({ choice }) }); refresh(); }
    catch (error) { setError(error instanceof Error ? error.message : "Unable to save choice"); }
    finally { lock.current = false; setBusy(false); }
  }
  return <View className="my-3 rounded-2xl bg-green-50 p-4"><Text className="font-bold">Resolution: {(remaining ? credit.choice === "CREDIT" ? "Buy again" : credit.choice.replaceAll("_", " ") : "BANK REFUND")}</Text><Text>{remaining ? `${Math.ceil(remaining / 1000)} seconds to buy again or place a replacement.` : "The buying window is closed. Any unspent balance is due for refund."} Buy again is the default; unused money is refunded after 20 minutes.</Text><View className="mt-2 gap-2">{(["BANK_REFUND", "CREDIT", "REPLACEMENT"] as Choice[]).map(choice => <Pressable key={choice} disabled={busy || !remaining || credit.locked > 0 || credit.choice === choice} onPress={() => void choose(choice)}><Text className={`rounded-xl p-2 font-bold ${credit.choice === choice ? "bg-green-200" : "bg-white"}`}>{choice === "BANK_REFUND" ? "Bank refund" : choice === "CREDIT" ? "Buy again" : "Replacement"}</Text></Pressable>)}</View>{!!error && <Text accessibilityRole="alert">{error}</Text>}<Text className="mt-2 text-xs">Use approved credit or place a replacement within 20 minutes; any unused balance then goes to refund. Save bank details on your source order for a bank refund.</Text></View>;
}
