import ReturnSummary from "@/features/returns/ReturnSummary";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Alert, Platform, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
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
