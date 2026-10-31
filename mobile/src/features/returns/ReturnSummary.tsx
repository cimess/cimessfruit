import ResolutionChoice from "@/features/chat/ResolutionChoice";
import { useCallback, useRef, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { apiRequest } from "@/lib/api";
import { formatNaira } from "@/lib/currency";
import type { ReturnCredit } from "./types";
function Credit({ credit, serverTime, refresh }: { credit: ReturnCredit; serverTime: string; refresh: () => void }) {
  const [bank, setBank] = useState(credit.bankDetails?.bank ?? ""), [accountNumber, setNumber] = useState(credit.bankDetails?.accountNumber ?? ""), [accountName, setName] = useState(credit.bankDetails?.accountName ?? "");
  const [busy, setBusy] = useState(false), [error, setError] = useState(""); const lock = useRef(false);
  const pending = credit.transfers.some(transfer => transfer.state === "PENDING");
  async function save() {
    if (lock.current) return; lock.current = true; setBusy(true); setError("");
    try { await apiRequest(`/api/returns/${credit.id}/bank`, { method: "PATCH", body: JSON.stringify({ bank, accountNumber, accountName }) }); refresh(); }
    catch (error) { setError(error instanceof Error ? error.message : "Unable to save bank details"); }
    finally { lock.current = false; setBusy(false); }
  }
  return <View className="mt-3 rounded-2xl bg-white p-4"><Text className="font-bold">Return {credit.id.slice(0, 8)}</Text><Text>Remaining balance {formatNaira((pending ? 0 : credit.balance) / 100)} · reserved {formatNaira(credit.reserved / 100)} · used {formatNaira(credit.spent / 100)}</Text><Text>Locked {formatNaira(credit.locked / 100)} · refunded {formatNaira(credit.refunded / 100)}</Text><ResolutionChoice key={`${credit.id}:${serverTime}`} credit={credit} serverTime={serverTime} refresh={refresh} />
    {pending ? <Text className="mt-2">Your refund is locked for a manual transfer and cannot be spent.</Text> : credit.choice === "BANK_REFUND" && credit.balance + credit.reserved > 0 ? <View className="mt-3"><Text>Refund bank details</Text><TextInput accessibilityLabel="Refund bank" placeholder="Bank" value={bank} onChangeText={setBank} editable={!busy} className="my-1 rounded-xl border border-gray-300 p-3" /><TextInput accessibilityLabel="Refund account number" placeholder="10-digit account number" keyboardType="number-pad" maxLength={10} value={accountNumber} onChangeText={setNumber} editable={!busy} className="my-1 rounded-xl border border-gray-300 p-3" /><TextInput accessibilityLabel="Refund account name" placeholder="Account name" value={accountName} onChangeText={setName} editable={!busy} className="my-1 rounded-xl border border-gray-300 p-3" /><Pressable disabled={busy} onPress={() => void save()}><Text className="p-2 font-bold text-green-800">{busy ? "Saving…" : "Save refund bank details"}</Text></Pressable></View> : null}
    {!!error && <Text accessibilityRole="alert">{error}</Text>}
  </View>;
}
export default function ReturnSummary({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [serverTime, setServerTime] = useState("");
  const [credits, setCredits] = useState<ReturnCredit[]>([]), [error, setError] = useState(""), [revision, setRevision] = useState(0);
  useFocusEffect(useCallback(() => {
    const controller = new AbortController();
    void apiRequest<{ credits: ReturnCredit[]; serverTime: string }>(`/api/returns/orders/${encodeURIComponent(orderId)}`, { signal: controller.signal }).then(value => { if (!controller.signal.aborted) { setCredits(value.credits); setServerTime(value.serverTime); setError(""); } }).catch(error => { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "Unable to load returns"); });
    return () => controller.abort();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- revision intentionally triggers manual refresh.
  }, [orderId, revision]));
  return <View className="mt-4"><Text className="text-lg font-bold">Returns and refunds</Text><Pressable onPress={() => router.push({ pathname: "/chat", params: { tab: "DISPUTE", orderId } })}><Text className="py-2 font-bold text-green-800">Chat / report an issue</Text></Pressable>{!!error && <Text accessibilityRole="alert">{error}</Text>}{!credits.length && <Text>Contact the store to arrange a return. Credit appears after approval.</Text>}{credits.map(credit => <Credit key={credit.id} credit={credit} serverTime={serverTime} refresh={() => setRevision(value => value + 1)} />)}<Pressable onPress={() => setRevision(value => value + 1)}><Text className="p-2 font-bold text-green-800">Refresh return credit</Text></Pressable></View>;
}
