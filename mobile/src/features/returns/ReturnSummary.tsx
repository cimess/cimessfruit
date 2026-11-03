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
  return (
    <View className="mt-3 rounded-2xl bg-white p-4">
      <Text className="font-bold">Return {credit.id.slice(0, 8)}</Text>
      <Text>
        Remaining balance {formatNaira((pending ? 0 : credit.balance) / 100)} · reserved {formatNaira((credit.reserved ?? 0) / 100)} · used {formatNaira((credit.spent ?? 0) / 100)}
      </Text>
      <Text>
        Locked {formatNaira((credit.locked ?? 0) / 100)} · refunded {formatNaira((credit.refunded ?? 0) / 100)}
      </Text>
      <ResolutionChoice key={`${credit.id}:${serverTime}`} credit={credit} serverTime={serverTime} refresh={refresh} />
      {pending ? (
        <Text className="mt-2 text-amber-800 font-semibold">Your refund is locked for a manual transfer and cannot be spent.</Text>
      ) : credit.choice === "BANK_REFUND" && (credit.balance ?? 0) + (credit.reserved ?? 0) > 0 ? (
        <View className="mt-3">
          <Text className="font-semibold text-gray-800">Refund bank details</Text>
          <TextInput
            accessibilityLabel="Refund bank"
            placeholder="Bank name (e.g. GTBank, Kuda)"
            value={bank}
            onChangeText={setBank}
            editable={!busy}
            className="my-1 rounded-xl border border-gray-300 bg-gray-50 p-3"
          />
          <TextInput
            accessibilityLabel="Refund account number"
            placeholder="10-digit account number"
            keyboardType="number-pad"
            maxLength={10}
            value={accountNumber}
            onChangeText={setNumber}
            editable={!busy}
            className="my-1 rounded-xl border border-gray-300 bg-gray-50 p-3 font-mono"
          />
          <TextInput
            accessibilityLabel="Refund account name"
            placeholder="Full name on account"
            value={accountName}
            onChangeText={setName}
            editable={!busy}
            className="my-1 rounded-xl border border-gray-300 bg-gray-50 p-3"
          />
          <Pressable
            disabled={busy}
            onPress={() => void save()}
            style={{
              marginTop: 8,
              backgroundColor: busy ? "#9CA3AF" : "#047857",
              paddingVertical: 14,
              paddingHorizontal: 16,
              borderRadius: 12,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ color: "#FFFFFF", fontWeight: "700", fontSize: 15, textAlign: "center" }}>
              {busy ? "Saving details…" : credit.bankDetails ? "Update Refund Bank Details" : "Save Refund Bank Details"}
            </Text>
          </Pressable>
        </View>
      ) : null}
      {!!error && <Text accessibilityRole="alert" className="mt-1 text-red-600 font-semibold">{error}</Text>}
    </View>
  );
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
