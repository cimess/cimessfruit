import { openEvidence } from "../uploads/openEvidence";
import { useDeviceDraft, type LocalImage } from "../uploads/drafts";
import ImageUpload from "../uploads/ImageUpload";
import { useCallback, useEffect, useRef, useState } from "react";
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import {
  ActivityIndicator,
  AppState,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Crypto from "expo-crypto";
import BottomNavigation from "@/app/component/navBar";
import { useAuthStore } from "@/features/auth/store";
import { apiRequest } from "@/lib/api";
import type { Choice, Conversation, OrderOption } from "./types";
import ResolutionChoice from "./ResolutionChoice";
import {
  openWhatsAppSupport,
  fetchSupportPhone,
  DEFAULT_SUPPORT_PHONE,
} from "./whatsapp";

const reasons = [
  "STORE_CANCELLED",
  "WRONG_ORDER",
  "WRONG_ITEMS",
  "SPOILT",
  "MISSING_ITEMS",
  "DAMAGED",
  "CHANGE_OF_MIND",
  "FAILED_DELIVERY",
  "WRONG_ADDRESS",
  "OTHER",
] as const;

type SupportTab = "WHATSAPP" | "DISPUTE";

export default function ChatScreen() {
  const params = useLocalSearchParams<{
    tab?: string;
    orderId?: string;
    productId?: string;
    productName?: string;
  }>();
  const owner = useAuthStore(state => state.user?.id);
  const [activeTab, setActiveTab] = useState<SupportTab>(
    params.tab === "DISPUTE" ? "DISPUTE" : "WHATSAPP"
  );
  const [disputeThreadId, setDisputeThreadId] = useState<string | null>(null);

  return (
    <SupportSession
      key={`${owner}:${activeTab}:${disputeThreadId ?? "root"}`}
      activeTab={activeTab}
      setActiveTab={setActiveTab}
      disputeThreadId={disputeThreadId}
      setDisputeThreadId={setDisputeThreadId}
    />
  );
}

function SupportSession({
  activeTab,
  setActiveTab,
  disputeThreadId,
  setDisputeThreadId,
}: {
  activeTab: SupportTab;
  setActiveTab: (tab: SupportTab) => void;
  disputeThreadId: string | null;
  setDisputeThreadId: (id: string | null) => void;
}) {
  const params = useLocalSearchParams<{
    tab?: string;
    orderId?: string;
    productId?: string;
    productName?: string;
  }>();
  const userId = useAuthStore(state => state.user?.id);
  const insets = useSafeAreaInsets();
  const router = useRouter();

  // WhatsApp Tab state
  const [supportPhone, setSupportPhone] = useState<string>(DEFAULT_SUPPORT_PHONE);
  const [loadingPhone, setLoadingPhone] = useState(false);

  // Dispute Tab state
  const [thread, setThread] = useState<Conversation | null>(null);
  const [threads, setThreads] = useState<Conversation[]>([]);
  const [orders, setOrders] = useState<OrderOption[]>([]);
  const [orderId, setOrderId] = useState(params.orderId ?? "");
  const [body, setBody] = useState("");
  const [evidence, setEvidence] = useState("");
  const [reason, setReason] = useState<string>("WRONG_ITEMS");
  const [choice, setChoice] = useState<Choice>("CREDIT");
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [serverTime, setServerTime] = useState("");
  const [nextInboxCursor, setNextInboxCursor] = useState<string | null>(null);
  const olderController = useRef<AbortController | null>(null);

  // Device draft for disputes
  const scope = `dispute:${disputeThreadId ?? params.orderId ?? "new"}`;
  const draft = useDeviceDraft(userId ?? "signed-out", `chat:${scope}`, {
    kind: "DISPUTE" as const,
    threadId: disputeThreadId,
    orderId,
    subject: "Order Dispute",
    body,
    evidence,
    reason,
    choice,
    quantities,
    images: [{}, {}, {}] as LocalImage[],
    key: "",
    serialized: "",
  });
  const lock = useRef(false);
  const pending = useRef({ body: "", key: "" });
  const [uploadBusy, setUploadBusy] = useState(false);
  const hydrated = useRef(false);
  const skipSave = useRef(true);

  // Fetch support phone for WhatsApp tab
  useEffect(() => {
    let active = true;
    void (async () => {
      setLoadingPhone(true);
      const phone = await fetchSupportPhone();
      if (active) {
        setSupportPhone(phone);
        setLoadingPhone(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // Hydrate draft
  useEffect(() => {
    if (!draft.ready || hydrated.current) return;
    hydrated.current = true;
    const value = draft.value;
    setOrderId(value.orderId);
    setBody(value.body);
    setEvidence(value.evidence);
    setReason(value.reason);
    setChoice(value.choice);
    setQuantities(value.quantities);
    pending.current = { key: value.key, body: value.serialized };
  }, [draft.ready, draft.value]);

  useEffect(() => {
    if (!draft.ready || !hydrated.current) return;
    if (skipSave.current) {
      skipSave.current = false;
      return;
    }
    draft.update(prev => ({
      ...prev,
      kind: "DISPUTE",
      threadId: disputeThreadId,
      orderId,
      body,
      evidence,
      reason,
      choice,
      quantities,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- persist the form fields; draft.value also changes for upload metadata.
  }, [disputeThreadId, orderId, body, evidence, reason, choice, quantities, draft.ready, draft.update]);

  // Load disputes
  useFocusEffect(
    useCallback(() => {
      if (activeTab !== "DISPUTE") return;
      const controller = new AbortController();
      async function load() {
        if (AppState.currentState !== "active") return;
        try {
          const result = await apiRequest<{
            conversation: Conversation;
            conversations: Conversation[];
            serverTime?: string;
            nextCursor?: string | null;
          }>(
            disputeThreadId ? `/api/support/${disputeThreadId}` : `/api/support?kind=DISPUTE`,
            { signal: controller.signal }
          );
          if (controller.signal.aborted) return;
          if (disputeThreadId) {
            setThread(result.conversation);
            setServerTime(result.serverTime ?? new Date().toISOString());
          } else {
            setThreads(result.conversations || []);
            setNextInboxCursor(result.nextCursor ?? null);
          }
          if (!disputeThreadId) {
            const ordersRes = await apiRequest<{ orders: OrderOption[] }>("/api/orders", {
              signal: controller.signal,
            });
            if (!controller.signal.aborted) {
              setOrders(ordersRes.orders.filter(order => order.paymentStatus === "SUCCESS"));
            }
          }
          setError("");
        } catch (err) {
          if (!controller.signal.aborted) {
            setError(err instanceof Error ? err.message : "Unable to load dispute cases");
          }
        }
      }
      void load();
      const listener = AppState.addEventListener("change", state => {
        if (state === "active") setRevision(val => val + 1);
        else {
          controller.abort();
          olderController.current?.abort();
        }
      });
      return () => {
        controller.abort();
        olderController.current?.abort();
        listener.remove();
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps -- revision refreshes this focused HTTP request; userId prevents cross-account reuse.
    }, [activeTab, disputeThreadId, revision, userId])
  );

  async function moreDisputeThreads() {
    if (!nextInboxCursor || busy) return;
    setBusy(true);
    olderController.current = new AbortController();
    try {
      const result = await apiRequest<{
        conversations: Conversation[];
        nextCursor: string | null;
      }>(`/api/support?kind=DISPUTE&cursor=${encodeURIComponent(nextInboxCursor)}`, {
        signal: olderController.current.signal,
      });
      setThreads(prev => [
        ...new Map([...prev, ...result.conversations].map(item => [item.id, item])).values(),
      ]);
      setNextInboxCursor(result.nextCursor);
    } catch {
      setError("Unable to load older disputes");
    } finally {
      setBusy(false);
    }
  }

  async function olderMessages() {
    if (!disputeThreadId || !thread?.nextMessageCursor || busy) return;
    setBusy(true);
    setError("");
    olderController.current = new AbortController();
    try {
      const data = await apiRequest<{ conversation: Conversation }>(
        `/api/support/${disputeThreadId}?before=${encodeURIComponent(thread.nextMessageCursor)}`,
        { signal: olderController.current!.signal }
      );
      setThread(prev =>
        prev
          ? {
              ...prev,
              nextMessageCursor: data.conversation.nextMessageCursor,
              messages: [
                ...new Map(
                  [...data.conversation.messages, ...prev.messages].map(msg => [msg.id, msg])
                ).values(),
              ],
            }
          : prev
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load older messages");
    } finally {
      setBusy(false);
    }
  }

  async function sendDisputeMessage() {
    if (lock.current || uploadBusy || !draft.ready) return;
    if (!orderId && !disputeThreadId) {
      setError("Please select a paid order to dispute.");
      return;
    }
    if (draft.value.images.some(img => img.uri && !img.id)) {
      setError("You selected an evidence photo but haven't uploaded it. Please tap 'Upload Selected Photo' above first.");
      return;
    }
    if (!body.trim()) {
      setError("Please describe the issue with your fruit order.");
      return;
    }
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const uploadIds = draft.value.images.flatMap(img => (img.id ? [img.id] : []));
      let path = disputeThreadId ? `/api/support/${disputeThreadId}` : "/api/disputes";
      let payload: unknown;

      if (!disputeThreadId) {
        const value = {
          uploadIds,
          orderId,
          reason,
          requestedChoice: choice,
          body,
          evidenceUrls: evidence.split(/\s+/).filter(Boolean),
          items:
            orders
              .find(order => order.id === orderId)
              ?.items.map(item => ({
                orderItemId: item.id,
                quantity: Number(quantities[item.id] ?? 0),
              }))
              .filter(item => item.quantity > 0) ?? [],
        };
        const serialized = JSON.stringify(value);
        if (pending.current.body !== serialized) {
          pending.current = { body: serialized, key: Crypto.randomUUID() };
        }
        payload = { ...value, key: pending.current.key };
      } else {
        payload = {
          body,
          uploadIds,
          evidenceUrls: evidence.split(/\s+/).filter(Boolean),
        };
        const serialized = JSON.stringify(payload);
        if (pending.current.body !== serialized) {
          pending.current = { body: serialized, key: Crypto.randomUUID() };
        }
        payload = { ...(payload as object), key: pending.current.key };
      }

      draft.update(prev => ({
        ...prev,
        key: pending.current.key,
        serialized: pending.current.body,
      }));
      draft.flush();

      const result = await apiRequest<{
        conversation?: Conversation;
        dispute?: { conversationId: string };
      }>(path, { method: "POST", body: JSON.stringify(payload) });

      if (result.dispute) {
        setDisputeThreadId(result.dispute.conversationId);
      } else if (result.conversation) {
        setDisputeThreadId(result.conversation.id);
        setThread(result.conversation);
      }
      draft.clear();
      setBody("");
      setEvidence("");
      setRevision(val => val + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to send dispute details");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      className="flex-1 bg-[#FAFBF7]"
    >
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingTop: insets.top + 16,
          paddingHorizontal: 18,
          paddingBottom: insets.bottom + 125,
        }}
      >
        {/* Header Title */}
        <View className="mb-4 flex-row items-center justify-between">
          <View>
            <Text className="text-3xl font-extrabold text-gray-950">Customer Support</Text>
            <Text className="text-xs font-semibold text-gray-500">
              Live fruit photos, negotiations, and dispute reviews
            </Text>
          </View>
        </View>

        {/* Switcher Navigation Buttons */}
        <View className="mb-5 flex-row rounded-2xl bg-gray-200/80 p-1.5">
          <Pressable
            disabled={busy}
            onPress={() => setActiveTab("WHATSAPP")}
            className={`flex-1 flex-row items-center justify-center rounded-xl py-3 ${
              activeTab === "WHATSAPP" ? "bg-[#128A3A] shadow-sm" : ""
            }`}
          >
            <Ionicons
              name="logo-whatsapp"
              size={18}
              color={activeTab === "WHATSAPP" ? "#FFFFFF" : "#4B5563"}
            />
            <Text
              className={`ml-2 text-sm font-extrabold ${
                activeTab === "WHATSAPP" ? "text-white" : "text-gray-700"
              }`}
            >
              Chat on WhatsApp
            </Text>
          </Pressable>

          <Pressable
            disabled={busy}
            onPress={() => {
              setActiveTab("DISPUTE");
              setDisputeThreadId(null);
              setThread(null);
            }}
            className={`flex-1 flex-row items-center justify-center rounded-xl py-3 ${
              activeTab === "DISPUTE" ? "bg-[#128A3A] shadow-sm" : ""
            }`}
          >
            <Ionicons
              name="shield-outline"
              size={18}
              color={activeTab === "DISPUTE" ? "#FFFFFF" : "#4B5563"}
            />
            <Text
              className={`ml-2 text-sm font-extrabold ${
                activeTab === "DISPUTE" ? "text-white" : "text-gray-700"
              }`}
            >
              Log Dispute
            </Text>
          </Pressable>
        </View>

        {/* ============================================================== */}
        {/* TAB 1: WHATSAPP DIRECT CHAT                                    */}
        {/* ============================================================== */}
        {activeTab === "WHATSAPP" && (
          <View>
            {/* Live Fruits & Negotiation Hero Card */}
            <View className="overflow-hidden rounded-3xl border border-emerald-100 bg-white p-6 shadow-sm">
              <View className="mb-4 flex-row items-center">
                <View className="h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100">
                  <Ionicons name="chatbubbles" size={26} color="#128A3A" />
                </View>
                <View className="ml-3 flex-1">
                  <Text className="text-xl font-extrabold text-gray-900">
                    Live Chat & Fruit Photos
                  </Text>
                  <Text className="text-xs font-semibold text-emerald-800">
                    Direct WhatsApp with Store Admin
                  </Text>
                </View>
              </View>

              <Text className="text-sm leading-5 text-gray-600">
                Connect directly with our team on WhatsApp to check live photos and videos of today's
                Fruits, negotiate prices, or ask about custom fruit boxes and smoothies.
              </Text>

              {/* Quick Topic Action Badges */}
              <View className="my-5 rounded-2xl bg-[#F0FDF4] p-4">
                <Text className="mb-2 text-xs font-extrabold uppercase tracking-wider text-emerald-800">
                  Common WhatsApp Inquiries
                </Text>
                <Pressable
                  onPress={() =>
                    void openWhatsAppSupport({
                      message:
                        "Hello CimessFruit! Can you send me live photos of the fresh fruits currently in stock?",
                    })
                  }
                  className="my-1.5 flex-row items-center rounded-xl bg-white p-3 border border-emerald-200"
                >
                  <Ionicons name="images-outline" size={18} color="#128A3A" />
                  <Text className="ml-2.5 flex-1 text-xs font-bold text-gray-800">
                    Request live photos of today's fruits 📸
                  </Text>
                  <Ionicons name="chevron-forward" size={16} color="#9CA3AF" />
                </Pressable>

                <Pressable
                  onPress={() =>
                    void openWhatsAppSupport({
                      message:
                        "Hello CimessFruit! I would like to negotiate price for a bulk fruit order.",
                    })
                  }
                  className="my-1.5 flex-row items-center rounded-xl bg-white p-3 border border-emerald-200"
                >
                  <Ionicons name="pricetag-outline" size={18} color="#128A3A" />
                  <Text className="ml-2.5 flex-1 text-xs font-bold text-gray-800">
                    Price negotiation & bulk inquiries 🏷️
                  </Text>
                  <Ionicons name="chevron-forward" size={16} color="#9CA3AF" />
                </Pressable>

                <Pressable
                  onPress={() =>
                    void openWhatsAppSupport({
                      message:
                        "Hello CimessFruit! I need an update on my delivery status.",
                    })
                  }
                  className="my-1.5 flex-row items-center rounded-xl bg-white p-3 border border-emerald-200"
                >
                  <Ionicons name="bicycle-outline" size={18} color="#128A3A" />
                  <Text className="ml-2.5 flex-1 text-xs font-bold text-gray-800">
                    Delivery assistance & general questions 💬
                  </Text>
                  <Ionicons name="chevron-forward" size={16} color="#9CA3AF" />
                </Pressable>
              </View>

              {/* Primary Direct WhatsApp Button */}
              <Pressable
                onPress={() => void openWhatsAppSupport()}
                className="flex-row items-center justify-center rounded-2xl bg-[#25D366] px-5 py-4 shadow-md active:opacity-90"
              >
                <Ionicons name="logo-whatsapp" size={24} color="#FFFFFF" />
                <Text className="ml-3 text-base font-extrabold text-white">
                  Send us a message on WhatsApp
                </Text>
              </Pressable>
            </View>

           
          </View>
        )}

        {/* ============================================================== */}
        {/* TAB 2: ORDER DISPUTES & RESOLUTION REVIEW                      */}
        {/* ============================================================== */}
        {activeTab === "DISPUTE" && (
          <View>
            {!!error && (
              <View className="mb-4 rounded-xl bg-red-50 p-3 border border-red-200">
                <Text className="text-xs font-bold text-red-700" accessibilityRole="alert">
                  {error}
                </Text>
              </View>
            )}

            {/* Thread Details View (Inside a Specific Dispute) */}
            {disputeThreadId ? (
              <View>
                <Pressable
                  disabled={busy || uploadBusy}
                  onPress={() => {
                    setDisputeThreadId(null);
                    setThread(null);
                  }}
                  className="mb-4 flex-row items-center py-2"
                >
                  <Ionicons name="arrow-back" size={20} color="#128A3A" />
                  <Text className="ml-2 font-bold text-[#128A3A]">Back to disputes list</Text>
                </Pressable>

                {thread ? (
                  <View className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
                    <Text className="text-xl font-extrabold text-gray-900">{thread.subject}</Text>

                    {thread.dispute && (
                      <View className="my-3 rounded-2xl bg-amber-50 p-4 border border-amber-200">
                        <Text className="text-xs font-extrabold text-amber-900 uppercase">
                          Status: {thread.dispute.status}
                        </Text>
                        <Text className="mt-1 text-sm font-semibold text-gray-800">
                          Reason: {thread.dispute.reason.replaceAll("_", " ")}
                        </Text>
                        {!!thread.dispute.decisionNote && (
                          <Text className="mt-2 text-xs text-gray-700">
                            Admin Note: {thread.dispute.decisionNote}
                          </Text>
                        )}
                        {thread.dispute.credit && (
                          <View className="mt-3">
                            <ResolutionChoice
                              key={`${thread.dispute.credit.id}:${serverTime}`}
                              credit={thread.dispute.credit}
                              serverTime={serverTime}
                              refresh={() => setRevision(val => val + 1)}
                            />
                          </View>
                        )}
                      </View>
                    )}

                    {thread.orderId && (
                      <Pressable
                        onPress={() =>
                          router.push({
                            pathname: "/order/[id]",
                            params: { id: thread.orderId! },
                          })
                        }
                        className="my-2 flex-row items-center py-2"
                      >
                        <Ionicons name="receipt-outline" size={18} color="#128A3A" />
                        <Text className="ml-2 font-bold text-green-800">
                          View related order / bank refund details
                        </Text>
                      </Pressable>
                    )}

                    {thread.nextMessageCursor && (
                      <Pressable disabled={busy} onPress={() => void olderMessages()}>
                        <Text className="py-3 font-bold text-green-800">
                          Load older messages
                        </Text>
                      </Pressable>
                    )}

                    {/* Dispute Messages */}
                    <View className="my-3 border-t border-gray-100 pt-3">
                      {thread.messages.map(message => (
                        <View
                          key={message.id}
                          className={`my-2 rounded-2xl p-4 ${
                            message.fromAdmin
                              ? "mr-4 bg-emerald-50 border border-emerald-100"
                              : "ml-4 bg-gray-50 border border-gray-200"
                          }`}
                        >
                          <Text className="text-xs font-bold text-gray-600">
                            {message.fromAdmin ? "CimessFruit Admin" : "You"}
                          </Text>
                          <Text className="my-2 text-sm text-gray-900">{message.body}</Text>
                          {message.evidenceUrls?.map(url => (
                            <Pressable
                              key={url}
                              onPress={() => {
                                if (url.startsWith("https://")) {
                                  void openEvidence(url).catch(() =>
                                    setError("Unable to open evidence link")
                                  );
                                }
                              }}
                            >
                              <Text className="py-1 text-xs font-bold text-green-800 underline">
                                📎 View attached evidence
                              </Text>
                            </Pressable>
                          ))}
                          <Text className="text-[10px] text-gray-400">
                            {new Date(message.createdAt).toLocaleString()}
                          </Text>
                        </View>
                      ))}
                    </View>

                    {/* Reply to Dispute */}
                    <View className="mt-4 border-t border-gray-100 pt-4">
                      <Text className="mb-2 text-sm font-bold text-gray-900">Reply to Admin</Text>
                      <TextInput
                        accessibilityLabel="Dispute Reply Message"
                        multiline
                        placeholder="Write additional details for the store admin..."
                        maxLength={2000}
                        value={body}
                        onChangeText={setBody}
                        className="min-h-24 rounded-2xl border border-gray-300 bg-white p-3.5 text-sm text-gray-900"
                      />
                      <Pressable
                        disabled={busy || !body.trim()}
                        onPress={() => void sendDisputeMessage()}
                        className={`mt-3 rounded-2xl p-4 ${
                          busy || !body.trim() ? "bg-gray-300" : "bg-[#128A3A]"
                        }`}
                      >
                        <Text className="text-center font-bold text-white">
                          {busy ? "Sending..." : "Send Reply"}
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                ) : (
                  <ActivityIndicator size="large" color="#128A3A" />
                )}
              </View>
            ) : (
              /* Dispute Filing & Past Cases List */
              <View>
                {/* Past Disputes */}
                {threads.length > 0 && (
                  <View className="mb-6">
                    <Text className="mb-3 text-base font-extrabold text-gray-900">
                      Your Logged Disputes
                    </Text>
                    {threads.map(item => (
                      <Pressable
                        key={item.id}
                        disabled={busy}
                        onPress={() => {
                          setDisputeThreadId(item.id);
                          setThread(null);
                        }}
                        className="my-1.5 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm"
                      >
                        <View className="flex-row items-center justify-between">
                          <Text className="font-extrabold text-gray-900">{item.subject}</Text>
                          <Ionicons name="chevron-forward" size={16} color="#9CA3AF" />
                        </View>
                        <Text numberOfLines={2} className="mt-1 text-xs text-gray-500">
                          {item.messages[0]?.body || "No message preview"}
                        </Text>
                      </Pressable>
                    ))}
                    {nextInboxCursor && (
                      <Pressable disabled={busy} onPress={() => void moreDisputeThreads()}>
                        <Text className="py-2 text-center text-xs font-bold text-green-800">
                          Load more dispute records
                        </Text>
                      </Pressable>
                    )}
                  </View>
                )}

                {/* Open New Dispute Form */}
                <View className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
                  <Text className="text-xl font-extrabold text-gray-900">Log a New Dispute</Text>
                  <Text className="mt-1 text-xs text-gray-500">
                    File a claim for damaged, missing, or spoilt items for admin resolution.
                  </Text>

                  {/* 1. Select Paid Order */}
                  <Text className="mt-5 text-sm font-extrabold text-gray-900">
                    1. Select paid order
                  </Text>
                  {orders.length === 0 ? (
                    <Text className="my-2 text-xs italic text-gray-500">
                      No paid orders found to dispute.
                    </Text>
                  ) : (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} className="my-2">
                      <View className="flex-row gap-2">
                        {orders.map(order => (
                          <Pressable
                            key={order.id}
                            onPress={() => setOrderId(order.id)}
                            className={`rounded-xl px-4 py-3 border ${
                              orderId === order.id
                                ? "border-emerald-600 bg-emerald-50"
                                : "border-gray-200 bg-gray-50"
                            }`}
                          >
                            <Text
                              className={`text-xs font-bold ${
                                orderId === order.id ? "text-emerald-800" : "text-gray-700"
                              }`}
                            >
                              Order #{order.id.slice(0, 8)}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                    </ScrollView>
                  )}

                  {/* 2. Choose Reason */}
                  <Text className="mt-4 text-sm font-extrabold text-gray-900">2. Issue Reason</Text>
                  <View className="my-2 flex-row flex-wrap gap-1.5">
                    {reasons.map(val => (
                      <Pressable
                        key={val}
                        onPress={() => setReason(val)}
                        className={`rounded-xl px-3 py-2 border ${
                          reason === val
                            ? "border-emerald-600 bg-emerald-50"
                            : "border-gray-200 bg-gray-50"
                        }`}
                      >
                        <Text
                          className={`text-xs font-bold ${
                            reason === val ? "text-emerald-800" : "text-gray-700"
                          }`}
                        >
                          {val.replaceAll("_", " ")}
                        </Text>
                      </Pressable>
                    ))}
                  </View>

                  {/* 3. Disputed Item Quantities */}
                  {orderId && (
                    <View className="mt-4">
                      <Text className="text-sm font-extrabold text-gray-900">
                        3. Affected items & quantities
                      </Text>
                      {orders
                        .find(order => order.id === orderId)
                        ?.items.map(item => (
                          <View
                            key={item.id}
                            className="my-2 rounded-2xl border border-gray-200 bg-gray-50/70 p-3"
                          >
                            <Text className="text-xs font-bold text-gray-800">
                              {item.name} · {item.optionLabel} (Ordered: {item.quantity})
                            </Text>
                            <TextInput
                              accessibilityLabel={`Disputed quantity for ${item.name}`}
                              placeholder="Quantity affected (0 to exclude)"
                              keyboardType="number-pad"
                              value={quantities[item.id] ?? ""}
                              onChangeText={val =>
                                setQuantities(prev => ({ ...prev, [item.id]: val }))
                              }
                              className="mt-2 rounded-xl border border-gray-300 bg-white p-2.5 text-xs text-gray-900"
                            />
                          </View>
                        ))}
                    </View>
                  )}

                  {/* 4. Requested Resolution */}
                  <Text className="mt-4 text-sm font-extrabold text-gray-900">
                    4. Requested resolution
                  </Text>
                  <View className="my-2 flex-row flex-wrap gap-2">
                    {(["CREDIT", "BANK_REFUND", "REPLACEMENT"] as Choice[]).map(val => (
                      <Pressable
                        key={val}
                        onPress={() => setChoice(val)}
                        className={`rounded-xl px-3.5 py-2.5 border ${
                          choice === val
                            ? "border-emerald-600 bg-emerald-50"
                            : "border-gray-200 bg-gray-50"
                        }`}
                      >
                        <Text
                          className={`text-xs font-bold ${
                            choice === val ? "text-emerald-800" : "text-gray-700"
                          }`}
                        >
                          {val === "CREDIT" ? "Buy again (Store Credit)" : val.replaceAll("_", " ")}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                  <Text className="text-[11px] text-gray-500">
                    After store approval, you have 20 minutes to choose or update between credit,
                    refund or replacement.
                  </Text>

                  {/* 5. Message & Evidence */}
                  <Text className="mt-5 text-sm font-extrabold text-gray-900">
                    5. Description & Evidence
                  </Text>
                  <TextInput
                    accessibilityLabel="Dispute Explanation"
                    multiline
                    placeholder="Describe what went wrong with your fruit order in detail..."
                    maxLength={2000}
                    value={body}
                    onChangeText={setBody}
                    className="my-2 min-h-24 rounded-2xl border border-gray-300 bg-white p-3.5 text-xs text-gray-900"
                  />
                  <TextInput
                    accessibilityLabel="Evidence links"
                    multiline
                    placeholder="Optional: Paste HTTPS link to video or photo evidence"
                    maxLength={4500}
                    value={evidence}
                    onChangeText={setEvidence}
                    className="my-1.5 rounded-xl border border-gray-300 bg-white p-3 text-xs text-gray-900"
                  />

                  {/* Photo uploads */}
                  <View className="my-3">
                    <Text className="mb-2 text-xs font-bold text-gray-700">Attach Photos</Text>
                    {draft.value.images.map((image, index) => (
                      <ImageUpload
                        disabled={busy || uploadBusy || !draft.ready}
                        slot={`${scope}:${index}`}
                        key={index}
                        owner={userId ?? "signed-out"}
                        value={image}
                        onBusy={setUploadBusy}
                        onChange={val => {
                          draft.update(prev => ({
                            ...prev,
                            images: prev.images.map((item, i) => (i === index ? val : item)),
                          }));
                          draft.flush();
                        }}
                      />
                    ))}
                  </View>

                  {/* Submit Button */}
                  <Pressable
                    disabled={busy || uploadBusy || !draft.ready}
                    onPress={() => void sendDisputeMessage()}
                    className={`mt-4 flex-row items-center justify-center rounded-2xl p-4 shadow-sm ${
                      busy ? "bg-emerald-800" : "bg-[#128A3A] active:opacity-90"
                    }`}
                  >
                    <Ionicons name="paper-plane-outline" size={20} color="#FFFFFF" />
                    <Text className="ml-2 text-center font-extrabold text-white">
                      {busy ? "Submitting Dispute..." : "Submit Dispute to Admin"}
                    </Text>
                  </Pressable>

                  {/* Helper/Warning text below button */}
                  {draft.value.images.some(img => img.uri && !img.id) && (
                    <Text className="mt-2 text-center text-xs font-bold text-amber-700">
                      ⚠️ Remember to tap "Upload Selected Photo" above before submitting!
                    </Text>
                  )}
                </View>
              </View>
            )}
          </View>
        )}
      </ScrollView>
      <BottomNavigation />
    </KeyboardAvoidingView>
  );
}
