import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Platform, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useOrderStore } from "@/features/order/store";
import { formatNaira } from "@/lib/currency";

const displayFont = Platform.select({
  ios: "AvenirNext-Heavy",
  android: "sans-serif-condensed",
  default: "system-ui",
});

export default function OrderSuccess() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id?: string }>();
  const lastOrderId = useOrderStore((state) => state.lastOrderId);
  const orderId = params.id ?? lastOrderId;
  const order = useOrderStore((state) =>
    orderId ? state.orders[orderId] : undefined
  );

  return (
    <View
      className="flex-1 bg-[#FAFBF7] px-5"
      style={{ paddingTop: insets.top + 18, paddingBottom: insets.bottom + 20 }}
    >
      <Stack.Screen options={{ headerShown: false }} />

      <View className="flex-row justify-end">
        <Pressable
          onPress={() => router.replace("/shop")}
          className="h-11 w-11 items-center justify-center rounded-full bg-white"
        >
          <Ionicons name="close" size={22} color="#033035" />
        </Pressable>
      </View>

      <View className="flex-1 items-center justify-center">
        <View className="h-24 w-24 items-center justify-center rounded-full bg-[#128A3A]">
          <Ionicons name="checkmark" size={48} color="#FACC15" />
        </View>

        <Text
          className="mt-7 text-center text-[38px] font-extrabold leading-[42px] text-[#033035]"
          style={{ fontFamily: displayFont }}
        >
          Order placed
        </Text>
        <Text className="mt-3 max-w-[310px] text-center text-[15px] font-semibold leading-6 text-gray-500">
          Open your order to check payment and delivery status. Preparation starts after the store verifies payment.
        </Text>

        <View className="mt-8 w-full rounded-[28px] bg-white p-5">
          <SummaryItem label="Order ID" value={order?.id ?? "Pending"} />
          <SummaryItem
            label="Total"
            value={order ? formatNaira(order.total) : formatNaira(0)}
          />
          <SummaryItem
            label="Delivery ETA"
            value={order?.estimatedDeliveryTime ?? "30-60 mins"}
          />
          <SummaryItem label="Status" value="Pending" />
        </View>
      </View>

      <Pressable
        onPress={() =>
          orderId
            ? router.replace({ pathname: "/order/[id]", params: { id: orderId } })
            : router.replace("/shop")
        }
        className="flex-row items-center justify-center rounded-[24px] bg-[#128A3A] px-5 py-4"
      >
        <Text className="mr-2 text-base font-extrabold text-white">
          View order
        </Text>
        <Ionicons name="receipt-outline" size={18} color="#FACC15" />
      </Pressable>
    </View>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <View className="mb-3 flex-row items-center justify-between last:mb-0">
      <Text className="text-sm font-bold text-gray-500">{label}</Text>
      <Text className="text-sm font-extrabold text-[#033035]">{value}</Text>
    </View>
  );
}
