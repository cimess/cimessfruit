import { Ionicons } from "@expo/vector-icons";
import { Stack, useRouter } from "expo-router";
import { useMemo } from "react";
import { Platform, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import BottomNavigation from "@/app/component/navBar";
import {
  getOrderStatusStyle,
  getPaymentStatusStyle,
} from "@/features/order/statusStyles";
import { useOrderStore } from "@/features/order/store";
import { useOrderPolling } from "@/features/order/useOrderPolling";
import type { Order } from "@/features/order/types";
import { formatNaira } from "@/lib/currency";

const displayFont = Platform.select({
  ios: "AvenirNext-Heavy",
  android: "sans-serif-condensed",
  default: "system-ui",
});

export default function Orders() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { refresh, refreshing, error } = useOrderPolling();
  const ordersById = useOrderStore((state) => state.orders);
  const orderIds = useOrderStore(state => state.orderIds);
  const orders = useMemo(
    () =>
      orderIds.map(id => ordersById[id]).filter((order): order is Order => !!order).sort(
      (left, right) =>
        new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime() || right.id.localeCompare(left.id)
      ),
    [ordersById, orderIds]
  );

  return (
    <View className="flex-1 bg-[#FAFBF7]">
      <Stack.Screen options={{ headerShown: false }} />
      {error ? <Text accessibilityRole="alert">{error}</Text> : null}
      {error ? <Pressable onPress={refresh} disabled={refreshing}><Text className="p-3 font-bold text-green-700">Retry loading orders</Text></Pressable> : null}

      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingBottom: insets.bottom + 112,
        }}
      >
        <View
          className="rounded-b-[34px] bg-[#128A3A] px-5 pb-7"
          style={{ paddingTop: insets.top + 16 }}
        >
          <Text
            className="mt-6 text-[38px] font-extrabold leading-[42px] text-white"
            style={{ fontFamily: displayFont }}
          >
            Orders
          </Text>
          <Text className="mt-3 max-w-[320px] text-[15px] font-semibold leading-6 text-white/65">
            Track transfer confirmation, delivery progress, and past fruit
            orders.
          </Text>
        </View>

        <View className="px-[18px] pt-5">
          {orders.length === 0 ? (
            <View className="items-center rounded-[28px] bg-white px-5 py-10">
              <View className="h-16 w-16 items-center justify-center rounded-full bg-[#FAFBF7]">
                <Ionicons name="receipt-outline" size={32} color="#033035" />
              </View>
              <Text className="mt-4 text-center text-xl font-extrabold text-gray-950">
                {refreshing ? "Loading orders…" : error ? "Unable to load orders" : "No orders yet"}
              </Text>
              <Text className="mt-2 text-center text-sm font-semibold leading-5 text-gray-500">
                After you transfer and tap paid at checkout, your order will
                appear here.
              </Text>
              <Pressable
                onPress={() => router.push("/shop")}
                className="mt-5 flex-row items-center rounded-[22px] bg-[#128A3A] px-5 py-4"
              >
                <Text className="mr-2 text-sm font-extrabold text-white">
                  Start shopping
                </Text>
                <Ionicons name="storefront-outline" size={18} color="#FACC15" />
              </Pressable>
            </View>
          ) : (
            <View className="gap-4">
              {orders.map((order) => (
                <OrderCard
                  key={order.id}
                  order={order}
                  onPress={() =>
                    router.push({
                      pathname: "/order/[id]",
                      params: { id: order.id },
                    })
                  }
                />
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      <BottomNavigation />
    </View>
  );
}

function OrderCard({ order, onPress }: { order: Order; onPress: () => void }) {
  const paymentLabel =
    order.paymentStatus === "payment_verified"
      ? "Payment verified"
      : order.paymentStatus === "review_required"
        ? "Transfer reported, awaiting verification"
        : order.paymentStatus === "pending" ? "Awaiting transfer" : "Payment rejected";

  return (
    <Pressable onPress={onPress} className="rounded-[28px] bg-white p-4">
      <View className="flex-row items-start justify-between">
        <View>
          <Text className="text-lg font-extrabold text-gray-950">
            {order.id}
          </Text>
          <Text className="mt-1 text-xs font-bold text-gray-500">
            {new Date(order.createdAt).toLocaleDateString("en-NG", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </Text>
        </View>

        <Text className="text-lg font-extrabold text-[#033035]">
          {formatNaira(order.total)}
        </Text>
      </View>

      <View className="mt-4 flex-row gap-2">
        <StatusPill
          icon="card-outline"
          label={paymentLabel}
          style={getPaymentStatusStyle(order.paymentStatus)}
        />
        <StatusPill
          icon="cube-outline"
          label={order.status}
          style={getOrderStatusStyle(order.status)}
        />
      </View>

      <View className="mt-4 flex-row items-center justify-between rounded-[22px] bg-[#FAFBF7] px-4 py-3">
        <Text className="text-sm font-bold text-gray-500">
          {order.items.length} {order.items.length === 1 ? "item" : "items"} ·{" "}
          {order.estimatedDeliveryTime}
        </Text>
        <Ionicons name="chevron-forward" size={18} color="#033035" />
      </View>
    </Pressable>
  );
}

function StatusPill({
  icon,
  label,
  style,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  style: ReturnType<typeof getOrderStatusStyle>;
}) {
  return (
    <View
      className="flex-1 flex-row items-center rounded-[18px] border px-3 py-2"
      style={{
        backgroundColor: style.backgroundColor,
        borderColor: style.borderColor,
      }}
    >
      <Ionicons name={icon} size={15} color={style.iconColor} />
      <Text
        numberOfLines={1}
        className="ml-1.5 flex-1 text-xs font-extrabold capitalize"
        style={{ color: style.color }}
      >
        {label}
      </Text>
    </View>
  );
}
