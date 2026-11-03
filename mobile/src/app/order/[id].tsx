import { useState } from "react";
import ReturnSummary from "@/features/returns/ReturnSummary";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Alert, Modal, Platform, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  getOrderStatusStyle,
  getPaymentStatusStyle,
} from "@/features/order/statusStyles";
import { useOrderStore } from "@/features/order/store";
import { useOrderPolling } from "@/features/order/useOrderPolling";
import type { OrderStatus } from "@/features/order/types";
import { formatNaira } from "@/lib/currency";

const statusSteps: OrderStatus[] = [
  "pending",
  "paid",
  "processing",
  "dispatched",
  "delivered",
];

const paymentSteps = ["pending", "review_required", "payment_verified"] as const;

const displayFont = Platform.select({
  ios: "AvenirNext-Heavy",
  android: "sans-serif-condensed",
  default: "system-ui",
});

export default function OrderDetails() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { refresh, refreshing, error } = useOrderPolling({ id, enabled: !!id });
  const order = useOrderStore((state) => state.orders[id]);

  const [disputeModalVisible, setDisputeModalVisible] = useState(false);
  const [disputeCategory, setDisputeCategory] = useState("SPOILT");
  const [disputeReason, setDisputeReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!order) {
    return (
      <View
        className="flex-1 bg-[#FAFBF7] px-5"
        style={{ paddingTop: insets.top + 18 }}
      >
        <Stack.Screen options={{ headerShown: false }} />
      {error ? <Text accessibilityRole="alert">{error}</Text> : null}
        <Pressable
          onPress={() => router.replace("/shop")}
          className="h-11 w-11 items-center justify-center rounded-full bg-white"
        >
          <Ionicons name="chevron-back" size={22} color="#033035" />
        </Pressable>
        <View className="flex-1 items-center justify-center">
          <Ionicons name="receipt-outline" size={42} color="#033035" />
          <Text className="mt-4 text-xl font-extrabold text-gray-950">
            {refreshing ? "Loading order…" : "Order unavailable"}
          </Text>
          <Text className="mt-2 text-center text-sm font-semibold leading-5 text-gray-500">
            {error ?? "Tap Retry to load this order."}
          </Text>
          <Pressable onPress={refresh} disabled={refreshing}><Text className="p-4 font-bold text-green-700">Retry</Text></Pressable>
        </View>
      </View>
    );
  }

  const activeStepIndex = statusSteps.indexOf(order.status);
  const activePaymentStepIndex = paymentSteps.indexOf(order.paymentStatus as typeof paymentSteps[number]);

  return (
    <ScrollView
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
      className="flex-1 bg-[#FAFBF7]"
      contentContainerStyle={{
        paddingBottom: insets.bottom + 30,
      }}
      showsVerticalScrollIndicator={false}
    >
      <Stack.Screen options={{ headerShown: false }} />
      {error ? <Text accessibilityRole="alert">{error}</Text> : null}

      <View
        className="rounded-b-[34px] bg-[#128A3A] px-5 pb-7"
        style={{ paddingTop: insets.top + 16 }}
      >
        <Pressable
          onPress={() => router.replace("/orders")}
          className="h-11 w-11 items-center justify-center rounded-full bg-white/10"
        >
          <Ionicons name="chevron-back" size={22} color="#FFFFFF" />
        </Pressable>

        <Text
          className="mt-7 text-[38px] font-extrabold leading-[42px] text-white"
          style={{ fontFamily: displayFont }}
        >
          Your order
        </Text>
        <Text className="mt-2 text-sm font-bold text-white/60">
          {order.id} · {formatNaira(order.total)}{order.status === "returned" ? " · Returned" : ""}
        </Text>
      </View>

      <View className="px-[18px] pt-5">
        <ReturnSummary orderId={id} />
        <Text>Return credit applied: {formatNaira(order.creditApplied ?? 0)} · bank payment: {formatNaira(order.amountDue ?? order.total)}</Text>
        <View className="rounded-[28px] bg-white p-4">
          <Text className="text-base font-extrabold text-gray-950">
            Payment
          </Text>
          <Text className="mt-1 text-xs font-semibold leading-5 text-gray-500">
            {order.amountDue === 0 ? "Payment covered by return credit." : "The store verifies payment after confirming the bank transfer arrived."}
          </Text>
          <View className="mt-4 gap-3">
            {paymentSteps.map((step, index) => {
              const isDone = activePaymentStepIndex >= index;
              const stepStyle = getPaymentStatusStyle(step);

              return (
                <View key={step} className="flex-row items-center">
                  <View
                    className="mr-3 h-9 w-9 items-center justify-center rounded-full border"
                    style={{
                      backgroundColor: isDone
                        ? stepStyle.backgroundColor
                        : "#FAFBF7",
                      borderColor: isDone ? stepStyle.borderColor : "#E5E7EB",
                    }}
                  >
                    <Ionicons
                      name={isDone ? "checkmark" : "ellipse-outline"}
                      size={17}
                      color={isDone ? stepStyle.iconColor : "#9CA3AF"}
                    />
                  </View>
                  <Text
                    className="text-sm font-extrabold capitalize"
                    style={{ color: isDone ? stepStyle.color : "#9CA3AF" }}
                  >
                    {step.replace("_", " ")}
                  </Text>
                </View>
              );
            })}
          </View>

          {order.account && order.eligibility?.eligible && (
            <View className="mt-5 rounded-[22px] bg-[#FAFBF7] p-4">
              <Text className="text-xs font-extrabold uppercase text-gray-400">
                Transfer exactly {formatNaira(order.amountDue ?? order.total)}
              </Text>
              <Text className="mt-2 text-sm font-extrabold text-gray-950">
                {order.account?.bank ?? ""} ·{" "}
                {order.account?.accountNumber ?? ""}
              </Text>
              <Text className="mt-1 text-sm font-bold text-gray-500">
                {order.account?.accountName ?? ""}
              </Text>
            </View>
          )}
        </View>

        {order.status === "pending" && order.paymentStatus === "pending" && <Pressable onPress={async () => { try { await useOrderStore.getState().report(order.id); } catch (error) { Alert.alert("Unable to report transfer", error instanceof Error ? error.message : "Please retry."); } }}><Text className="p-4 font-bold">I have paid — request verification</Text></Pressable>}
        {order.status === "pending" && order.eligibility?.issues.map(issue => <Text key={issue}>{issue}</Text>)}
        <View className="mt-5 rounded-[28px] bg-white p-4">
          <Text className="text-base font-extrabold text-gray-950">
            Delivery status
          </Text>
          <View className="mt-4 gap-3">
            {statusSteps.map((step, index) => {
              const isDone = activeStepIndex >= index;
              const stepStyle = getOrderStatusStyle(step);

              return (
                <View key={step} className="flex-row items-center">
                  <View
                    className="mr-3 h-9 w-9 items-center justify-center rounded-full border"
                    style={{
                      backgroundColor: isDone
                        ? stepStyle.backgroundColor
                        : "#FAFBF7",
                      borderColor: isDone ? stepStyle.borderColor : "#E5E7EB",
                    }}
                  >
                    <Ionicons
                      name={isDone ? "checkmark" : "ellipse-outline"}
                      size={17}
                      color={isDone ? stepStyle.iconColor : "#9CA3AF"}
                    />
                  </View>
                  <Text
                    className="text-sm font-extrabold capitalize"
                    style={{ color: isDone ? stepStyle.color : "#9CA3AF" }}
                  >
                    {step}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>

        <View className="mt-5 rounded-[28px] bg-white p-4">
          <Text className="text-base font-extrabold text-gray-950">
            Items
          </Text>
          <View className="mt-4 gap-3">
            {order.items.map((item) => (
              <View
                key={item.lineId}
                className="flex-row items-center rounded-[22px] bg-[#FAFBF7] p-2.5"
              >
                <View className="mr-3 h-14 w-14 items-center justify-center overflow-hidden rounded-2xl bg-white">
                  <Image
                    source={item.image}
                    contentFit="contain"
                    cachePolicy="memory-disk"
                    style={{ width: "86%", height: "86%" }}
                  />
                </View>
                <View className="flex-1">
                  <Text
                    numberOfLines={1}
                    className="text-sm font-extrabold text-gray-950"
                  >
                    {item.name}
                  </Text>
                  <Text className="mt-0.5 text-xs font-bold text-gray-500">
                    {item.optionLabel} · Qty {item.quantity}
                  </Text>
                </View>
                <Text className="text-sm font-extrabold text-[#033035]">
                  {formatNaira(item.subtotal)}
                </Text>
              </View>
            ))}
          </View>
        </View>

        <View className="mt-5 rounded-[28px] bg-white p-4">
          <Text className="text-base font-extrabold text-gray-950">
            Delivery
          </Text>
          <Text className="mt-3 text-sm font-bold leading-6 text-gray-500">
            {order.deliveryAddress.houseNumber},{" "}
            {order.deliveryAddress.streetOrClose}
            {order.deliveryAddress.flatOrBlock
              ? `, ${order.deliveryAddress.flatOrBlock}`
              : ""}
          </Text>
          <Text className="mt-1 text-sm font-bold text-gray-500">
            Phone: {order.deliveryAddress.phoneNumber}
          </Text>
        </View>

        <Pressable onPress={() => router.push({ pathname: "/chat", params: { orderId: order.id } })}><Text className="p-4 font-bold text-green-700">Get help with this order</Text></Pressable>
        <View className="mt-5 rounded-[28px] bg-[#128A3A] p-4">
          <SummaryRow label="Items" value={formatNaira(order.itemSubtotal)} />
          {order.smoothieFee > 0 && (
            <SummaryRow
              label="Custom smoothie blend"
              value={formatNaira(order.smoothieFee)}
            />
          )}
          <SummaryRow
            label="Delivery"
            value={formatNaira(order.deliveryFee)}
          />
          <View className="my-3 h-px bg-white/10" />
          <View className="flex-row items-center justify-between">
            <Text className="text-sm font-bold text-white/60">Total</Text>
            <Text className="text-2xl font-extrabold text-white">
              {formatNaira(order.total)}
            </Text>
          </View>
        </View>

        {order.status === "dispatched" && (
          <View className="mt-4 gap-3">
            <Text className="text-center text-xs font-semibold text-gray-500">
              Has your package arrived? Please verify your delivery below.
            </Text>
            <View className="flex-row gap-3">
              <Pressable
                disabled={submitting}
                onPress={() => {
                  Alert.alert(
                    "Confirm Delivery",
                    "Are you sure you have received your order in good condition?",
                    [
                      { text: "Not yet", style: "cancel" },
                      {
                        text: "Yes, I Received It",
                        onPress: async () => {
                          try {
                            setSubmitting(true);
                            await useOrderStore.getState().confirmDelivery(order.id);
                            Alert.alert("Success", "Delivery confirmed! Thank you.");
                          } catch (err) {
                            Alert.alert("Error", err instanceof Error ? err.message : "Failed to confirm delivery.");
                          } finally {
                            setSubmitting(false);
                          }
                        },
                      },
                    ]
                  );
                }}
                className="flex-1 flex-row items-center justify-center rounded-2xl py-3.5 px-4 shadow-sm"
                style={{ backgroundColor: submitting ? "#34D399" : "#128A3A" }}
              >
                <Ionicons name="checkmark-circle-outline" size={20} color="#FFFFFF" />
                <Text className="ml-2 font-bold text-white text-base">Accept Order</Text>
              </Pressable>

              <Pressable
                disabled={submitting}
                onPress={() => setDisputeModalVisible(true)}
                className="flex-1 flex-row items-center justify-center rounded-2xl border border-red-200 bg-red-50 py-3.5 px-4 active:bg-red-100"
              >
                <Ionicons name="close-circle-outline" size={20} color="#DC2626" />
                <Text className="ml-2 font-bold text-red-600 text-base">Reject Order</Text>
              </Pressable>
            </View>
          </View>
        )}

        {order.status === "resolved" && (
          <View className="mt-4 rounded-2xl bg-amber-50 p-4 border border-amber-200">
            <View className="flex-row items-center gap-2">
              <Ionicons name="alert-circle" size={20} color="#D97706" />
              <Text className="font-extrabold text-amber-900 text-sm">Dispute / Issue Reported</Text>
            </View>
            <Text className="mt-1 text-xs text-amber-800 font-medium">
              You reported an issue with this order. Our admin team has received it and is reviewing the dispute.
            </Text>
            <Pressable
              onPress={() => router.push({ pathname: "/chat", params: { orderId: order.id } })}
              className="mt-3 flex-row items-center"
            >
              <Text className="font-bold text-green-700 text-xs">View Dispute Chat & Support →</Text>
            </Pressable>
          </View>
        )}

        <Modal
          visible={disputeModalVisible}
          animationType="slide"
          transparent={true}
          onRequestClose={() => setDisputeModalVisible(false)}
        >
          <View className="flex-1 justify-end bg-black/50">
            <View className="rounded-t-[32px] bg-white p-6 pb-10">
              <View className="flex-row items-center justify-between pb-3">
                <Text className="text-lg font-extrabold text-gray-900">Report an Issue / Reject</Text>
                <Pressable onPress={() => setDisputeModalVisible(false)} className="p-1">
                  <Ionicons name="close" size={24} color="#6B7280" />
                </Pressable>
              </View>

              <Text className="text-xs font-semibold text-gray-500 mb-4">
                What went wrong with your order? Our support and admin team will investigate immediately.
              </Text>

              <Text className="text-xs font-bold text-gray-700 mb-2">Category</Text>
              <View className="flex-row flex-wrap gap-2 mb-4">
                {[
                  { key: "SPOILT", label: "Spoilt / Damaged Fruit" },
                  { key: "MISSING_ITEMS", label: "Missing Items" },
                  { key: "WRONG_ITEMS", label: "Wrong Items" },
                  { key: "OTHER", label: "Other Problem" },
                ].map((cat) => (
                  <Pressable
                    key={cat.key}
                    onPress={() => setDisputeCategory(cat.key)}
                    className={`rounded-full px-3.5 py-1.5 border ${
                      disputeCategory === cat.key
                        ? "border-[#128A3A] bg-[#E8F5EC]"
                        : "border-gray-200 bg-gray-50"
                    }`}
                  >
                    <Text
                      className={`text-xs font-bold ${
                        disputeCategory === cat.key ? "text-[#128A3A]" : "text-gray-600"
                      }`}
                    >
                      {cat.label}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Text className="text-xs font-bold text-gray-700 mb-2">Details</Text>
              <TextInput
                value={disputeReason}
                onChangeText={setDisputeReason}
                placeholder="Describe what happened (e.g. damaged fruits, order missing...)"
                multiline
                numberOfLines={3}
                className="rounded-2xl border border-gray-200 bg-gray-50 p-3 text-sm text-gray-900 mb-5"
                textAlignVertical="top"
              />

              <View className="flex-row gap-3">
                <Pressable
                  onPress={() => setDisputeModalVisible(false)}
                  className="flex-1 items-center justify-center rounded-2xl border border-gray-200 py-3.5"
                >
                  <Text className="font-bold text-gray-700">Cancel</Text>
                </Pressable>
                <Pressable
                  disabled={submitting || disputeReason.trim().length < 3}
                  onPress={async () => {
                    try {
                      setSubmitting(true);
                      await useOrderStore.getState().reportIssue(order.id, disputeReason, disputeCategory);
                      setDisputeModalVisible(false);
                      Alert.alert(
                        "Dispute Submitted",
                        "Your complaint has been submitted. The admin has been notified and will resolve or credit you.",
                        [
                          {
                            text: "Open Support Chat",
                            onPress: () => router.push({ pathname: "/chat", params: { orderId: order.id } }),
                          },
                          { text: "Done", style: "cancel" },
                        ]
                      );
                    } catch (err) {
                      Alert.alert("Submission Failed", err instanceof Error ? err.message : "Could not submit issue.");
                    } finally {
                      setSubmitting(false);
                    }
                  }}
                  className={`flex-1 items-center justify-center rounded-2xl py-3.5 ${
                    submitting || disputeReason.trim().length < 3
                      ? "bg-red-300"
                      : "bg-red-600 active:bg-red-700"
                  }`}
                >
                  <Text className="font-bold text-white">Submit Report</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      </View>
    </ScrollView>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="mb-2 flex-row items-center justify-between">
      <Text className="text-sm font-bold text-white/60">{label}</Text>
      <Text className="text-sm font-extrabold text-white">{value}</Text>
    </View>
  );
}
