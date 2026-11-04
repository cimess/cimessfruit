import { useAuthStore } from "@/features/auth/store";
import CreditChoice from "@/features/returns/CreditChoice";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { Image } from "expo-image";
import { Icon, Stack, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Animated,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useCartStore } from "@/features/cart/store";
import type { DeliveryAddressDraft } from "@/features/delivery/types";
import { useDeliveryZones, unavailableZone } from "@/features/delivery/zones";
import ZonePicker from "@/features/delivery/ZonePicker";
import DeliveryMap from "@/features/delivery/DeliveryMap";
import { buildOrderDraft } from "@/features/order/mapper";
import { useOrderPolling } from "@/features/order/useOrderPolling";
import { useOrderStore } from "@/features/order/store";
import { useToastStore } from "@/features/ui/toastStore";
import { useUserStore } from "@/features/user/store";
import { formatNaira } from "@/lib/currency";

const displayFont = Platform.select({
  ios: "AvenirNext-Heavy",
  android: "sans-serif-condensed",
  default: "system-ui",
});

const bodyFont = Platform.select({
  ios: "Avenir Next",
  android: "sans-serif",
  default: "system-ui",
});

export default function Checkout() {
  const creditOwner = useAuthStore((state) => state.user?.id);
  const [useFreeShipping, setUseFreeShipping] = useState(false);
  const [useReturnCredit, setUseReturnCredit] = useState(false);
  const [replacementId, setReplacementId] = useState("");
  const zoneState = useDeliveryZones();
  const settingsError = zoneState.error;
  const [mapVisible, setMapVisible] = useState(false);
  const [isPaymentVisible, setIsPaymentVisible] = useState(false);
  const [pendingOrderId, setPendingOrderId] = useState<string | null>(null);
  const pendingOrder = useOrderStore((state) =>
    pendingOrderId ? (state.orders[pendingOrderId] ?? null) : null,
  );
  const paymentError = useOrderStore((state) =>
    pendingOrderId ? state.readErrors[pendingOrderId] : null,
  );
  useOrderPolling({
    id: pendingOrderId ?? undefined,
    enabled: isPaymentVisible && !!pendingOrder?.account && !paymentError,
  });
  const manualPaymentAccount = pendingOrder?.account;
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [entry] = useState(() => new Animated.Value(0));
  const items = useCartStore((state) => state.items);
  const customSmoothieRequested = useCartStore(
    (state) => state.customSmoothieRequested,
  );
  const customSmoothiePrice = useCartStore(
    (state) => state.customSmoothiePrice,
  );
  const itemCount = useCartStore((state) => state.getTotalItems());
  const cartTotal = useCartStore((state) => state.getTotalAmount());
  const clearCart = useCartStore((state) => state.clear);
  const isPlacingOrder = useOrderStore((state) => state.isPlacingOrder);
  const placeOrder = useOrderStore((state) => state.placeOrder);
  const showToast = useToastStore((state) => state.showToast);
  const profile = useUserStore((state) => state.profile);
  const isLoadingProfile = useUserStore((state) => state.isLoadingProfile);
  const loadProfile = useUserStore((state) => state.refreshProfile);

  const [addressDraft, setAddress] = useState<DeliveryAddressDraft>({
    zoneId: "",
    streetOrClose: "",
    houseNumber: "",
    flatOrBlock: "",
    landmark: "",
    note: "",
    phoneNumber: "",
  });
  const [hasEditedAddress, setHasEditedAddress] = useState(false);
  const address =
    !hasEditedAddress && profile ? profile.deliveryAddress : addressDraft;

  const activeDeliveryZone =
    zoneState.zones.find((zone) => zone.id === address.zoneId) ??
    unavailableZone;

  const orderLines = useMemo(() => Object.values(items), [items]);
  const itemSubtotal = useMemo(
    () =>
      orderLines.reduce((total, item) => total + item.price * item.quantity, 0),
    [orderLines],
  );
  const smoothieFee = customSmoothieRequested ? customSmoothiePrice : 0;
  const applyFreeShipping =
    useFreeShipping &&
    !replacementId &&
    (profile?.freeShipping ?? 0) > 0 &&
    activeDeliveryZone.deliveryFee > 0;
  const deliveryFee = activeDeliveryZone.isAvailable
    ? replacementId || applyFreeShipping
      ? 0
      : activeDeliveryZone.deliveryFee
    : 0;
  const total = cartTotal + deliveryFee;
  const canPlaceOrder =
    itemCount > 0 &&
    activeDeliveryZone.isAvailable &&
    address.streetOrClose.trim().length > 0 &&
    address.houseNumber.trim().length > 0 &&
    address.phoneNumber.trim().length > 0;

  useEffect(() => {
    Animated.timing(entry, {
      toValue: 1,
      duration: 420,
      useNativeDriver: true,
    }).start();
  }, [entry]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const translateY = entry.interpolate({
    inputRange: [0, 1],
    outputRange: [18, 0],
  });

  const updateAddress = (key: keyof DeliveryAddressDraft, value: string) => {
    setHasEditedAddress(true);
    setAddress((current) => ({
      ...(!hasEditedAddress && profile ? profile.deliveryAddress : current),
      [key]: value,
      ...(key === "streetOrClose" || key === "houseNumber"
        ? { coordinates: undefined }
        : {}),
    }));
  };

  const handlePlaceOrder = async () => {
    if (isPlacingOrder) return;
    if (!canPlaceOrder) {
      Alert.alert(
        "Complete delivery details",
        "Add your street or close, house number, and phone number before placing the order.",
      );
      return;
    }

    try {
      const order = await placeOrder({
        ...buildOrderDraft({
          items,
          deliveryAddress: address,
          deliveryZone: activeDeliveryZone,
          customSmoothieRequested,
          customSmoothiePrice,
        }),
        useFreeShipping: applyFreeShipping,
        useReturnCredit,
        ...(replacementId ? { replacementDisputeId: replacementId } : {}),
      });
      void useUserStore.getState().refreshProfile();
      setPendingOrderId(order.id);
      if (order.paymentStatus === "payment_verified") {
        clearCart();
        showToast("Order paid using return credit.", "success");
        router.replace({ pathname: "/order/[id]", params: { id: order.id } });
        return;
      }
      if (!order.account || !order.eligibility?.eligible)
        throw new Error(
          order.eligibility?.issues.join(" ") || "Payment unavailable.",
        );
      setIsPaymentVisible(true);
    } catch (error) {
      Alert.alert(
        "Checkout unavailable",
        error instanceof Error ? error.message : "Please retry.",
      );
    }
  };

  const handlePaidConfirmation = async () => {
    if (isPlacingOrder) {
      return;
    }

    try {
      if (!pendingOrder) return;
      const order = await useOrderStore.getState().report(pendingOrder.id);

      clearCart();
      setIsPaymentVisible(false);
      showToast("Order created. Payment is awaiting verification.", "success");
      router.replace({
        pathname: "/order/[id]",
        params: { id: order.id },
      });
    } catch (error) {
      Alert.alert(
        "Transfer report not saved",
        error instanceof Error ? error.message : "Please try again.",
      );
    }
  };

  const copyAccountNumber = async () => {
    await Clipboard.setStringAsync(manualPaymentAccount?.accountNumber ?? "");
    showToast("Account number copied.", "success");
  };

  const handleUseMap = () => setMapVisible(true);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      className="flex-1 bg-[#FAFBF7]"
    >
      <Stack.Screen options={{ headerShown: false }} />
      {mapVisible && (
        <DeliveryMap
          zones={zoneState.zones}
          address={address}
          onClose={() => setMapVisible(false)}
          onSelect={(value) => {
            setHasEditedAddress(true);
            setAddress(value);
          }}
        />
      )}
      {settingsError ? (
        <Text accessibilityRole="alert">{settingsError}</Text>
      ) : null}
      {paymentError ? (
        <Text accessibilityRole="alert">
          Unable to refresh payment details. Please reopen payment to retry.
        </Text>
      ) : null}

      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingBottom: Math.max(insets.bottom + 34, 54),
        }}
      >
        <View
          className="overflow-hidden rounded-b-[34px] bg-[#128A3A] px-5 pb-6"
          style={{ paddingTop: insets.top + 16 }}
        >
          <View className="flex-row items-center justify-between">
            <Pressable
              onPress={() => router.back()}
              className="h-11 w-11 items-center justify-center rounded-full bg-white/10"
            >
              <Ionicons name="chevron-back" size={22} color="#FFFFFF" />
            </Pressable>

            <View className="rounded-full bg-[#FACC15] px-3 py-1.5">
              <Text className="text-xs font-extrabold text-[#033035]">
                CHECKOUT
              </Text>
            </View>
          </View>

          <Animated.View
            style={{
              opacity: entry,
              transform: [{ translateY }],
            }}
          >
            <Text
              className="mt-7 text-[38px] font-extrabold leading-[42px] text-white"
              style={{ fontFamily: displayFont }}
            >
              Delivery details
            </Text>
            <Text
              className="mt-3 max-w-[320px] text-[15px] leading-6 text-white/70"
              style={{ fontFamily: bodyFont }}
            >
              Confirm your delivery address and review the order before it goes
              to the store.
            </Text>
          </Animated.View>
        </View>

        <View className="px-[18px] pt-5">
          <View
            className="rounded-[28px] bg-white p-4"
            style={{
              shadowColor: "#062D2C",
              shadowOffset: { width: 0, height: 12 },
              shadowOpacity: 0.07,
              shadowRadius: 18,
              elevation: 3,
            }}
          >
            <View className="flex-row items-start">
              <View className="mr-3 h-12 w-12 items-center justify-center rounded-2xl bg-[#FACC15]">
                <Ionicons name="location" size={23} color="#033035" />
              </View>

              <View className="flex-1">
                <View className="flex-row items-center justify-between">
                  <Text className="text-lg font-extrabold text-gray-950">
                    {activeDeliveryZone.name}
                  </Text>

                  <View
                    className={`rounded-full px-2.5 py-1 ${
                      activeDeliveryZone.isAvailable
                        ? "bg-emerald-50"
                        : "bg-red-50"
                    }`}
                  >
                    <Text
                      className={`text-[10px] font-extrabold ${
                        activeDeliveryZone.isAvailable
                          ? "text-emerald-700"
                          : "text-red-700"
                      }`}
                    >
                      {activeDeliveryZone.isAvailable ? "ACTIVE" : "CLOSED"}
                    </Text>
                  </View>
                </View>

                <Text className="mt-1 text-sm font-bold text-gray-500">
                  {activeDeliveryZone.area}, {activeDeliveryZone.state}
                </Text>

                <Text className="mt-3 text-sm leading-5 text-gray-500">
                  {activeDeliveryZone.coverageNote}
                </Text>
              </View>
            </View>

            <View className="mt-4 flex-row gap-2">
              <ZoneMetric
                icon="cash-outline"
                label="Delivery fee"
                value={formatNaira(
                  applyFreeShipping ? 0 : activeDeliveryZone.deliveryFee,
                )}
              />
              <ZoneMetric
                icon="time-outline"
                label="ETA"
                value={activeDeliveryZone.estimatedTime}
              />
            </View>
          </View>

          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{
              checked: !!applyFreeShipping,
              disabled:
                isPlacingOrder ||
                !!replacementId ||
                !profile?.freeShipping ||
                !activeDeliveryZone.deliveryFee,
            }}
            disabled={
              isPlacingOrder ||
              !!replacementId ||
              !profile?.freeShipping ||
              !activeDeliveryZone.deliveryFee
            }
            onPress={() => setUseFreeShipping((value) => !value)}
            className="mt-5 flex-col rounded-2xl bg-white p-4"
          >
            {/* TOP: Free deliveries remaining */}
            {(profile?.freeShipping ?? 0) > 0 && (
              <View className="mb-3 flex-row items-center">
                <Ionicons name="bicycle-outline" size={16} color="#033035" />
                <Text className="ml-2 text-xs font-bold text-[#033035]">
                  {applyFreeShipping
                    ? (profile?.freeShipping ?? 0) - 1
                    : (profile?.freeShipping ?? 0)}{" "}
                  free deliveries remaining
                </Text>
              </View>
            )}

            {/* BOTTOM: Checkbox */}
            <View className="flex-row items-center">
              <Ionicons
                name={applyFreeShipping ? "checkbox" : "square-outline"}
                size={24}
                color="#128A3A"
              />

              <Text className="ml-3 flex-1 text-sm font-bold text-[#033035]">
                Use one free delivery
              </Text>
            </View>
          </Pressable>

          <View className="mt-5 rounded-[28px] bg-white p-4">
            <SectionTitle
              icon="map-outline"
              title="Address"
              subtitle={
                isLoadingProfile
                  ? "Loading your saved delivery details."
                  : "Edit only if you want this order delivered somewhere else."
              }
            />

            <ZonePicker
              {...zoneState}
              value={address.zoneId}
              onChange={(zoneId) => {
                setHasEditedAddress(true);
                setAddress({
                  ...address,
                  zoneId,
                  coordinates: undefined,
                  ...(address.coordinates
                    ? { streetOrClose: "", houseNumber: "" }
                    : {}),
                });
              }}
            />
            <Pressable
              onPress={handleUseMap}
              className="mt-4 flex-row items-center rounded-[22px] bg-[#128A3A] p-3.5"
            >
              <View className="mr-3 h-10 w-10 items-center justify-center rounded-2xl bg-[#FACC15]">
                <Ionicons name="navigate-outline" size={19} color="#033035" />
              </View>

              <View className="flex-1 pr-3">
                <Text className="text-sm font-extrabold text-white">
                  Use map location
                </Text>
                <Text className="mt-0.5 text-xs font-semibold leading-4 text-white/60">
                  Choose your exact entrance and check delivery coverage.
                </Text>
              </View>

              <Ionicons name="chevron-forward" size={18} color="#FFFFFF" />
            </Pressable>

            <View className="mt-4 gap-3">
              <CheckoutField
                label="Street / Close"
                placeholder={
                  profile?.deliveryAddress.streetOrClose ||
                  "e.g. 32 Road or 6th Avenue Close"
                }
                value={address.streetOrClose}
                onChangeText={(value) => updateAddress("streetOrClose", value)}
              />
              <CheckoutField
                label="House number"
                placeholder={
                  profile?.deliveryAddress.houseNumber || "e.g. House 15"
                }
                value={address.houseNumber}
                onChangeText={(value) => updateAddress("houseNumber", value)}
              />
              <CheckoutField
                label="Flat / Block"
                placeholder={
                  profile?.deliveryAddress.flatOrBlock || "e.g. Block B, Flat 2"
                }
                value={address.flatOrBlock}
                onChangeText={(value) => updateAddress("flatOrBlock", value)}
              />
              <CheckoutField
                label="Landmark"
                placeholder={
                  profile?.deliveryAddress.landmark ||
                  "e.g. Near the mini market"
                }
                value={address.landmark}
                onChangeText={(value) => updateAddress("landmark", value)}
              />
              <CheckoutField
                keyboardType="phone-pad"
                label="Phone number"
                placeholder={profile?.phoneNumber || "Phone for delivery call"}
                value={address.phoneNumber}
                onChangeText={(value) => updateAddress("phoneNumber", value)}
              />
              <CheckoutField
                multiline
                label="Delivery note"
                placeholder="Any extra direction for the delivery?"
                value={address.note}
                onChangeText={(value) => updateAddress("note", value)}
              />
            </View>
          </View>

          <View className="mt-5 rounded-[28px] bg-white p-4">
            <SectionTitle
              icon="receipt-outline"
              title="Order summary"
              subtitle={`${itemCount} ${
                itemCount === 1 ? "item" : "items"
              } selected`}
            />

            {orderLines.length === 0 ? (
              <View className="mt-5 items-center rounded-[24px] bg-[#FAFBF7] px-5 py-8">
                <Ionicons name="basket-outline" size={30} color="#033035" />
                <Text className="mt-3 text-center text-base font-extrabold text-gray-950">
                  Your basket is empty
                </Text>
                <Text className="mt-1 text-center text-sm leading-5 text-gray-500">
                  Add fruits or smoothies before setting delivery.
                </Text>
                <Pressable
                  onPress={() => router.push("/shop")}
                  className="mt-4 flex-row items-center rounded-2xl bg-[#128A3A] px-4 py-3"
                >
                  <Text className="mr-2 text-sm font-extrabold text-white">
                    Go to shop
                  </Text>
                  <Ionicons name="arrow-forward" size={15} color="#FACC15" />
                </Pressable>
              </View>
            ) : (
              <View className="mt-4 gap-3">
                {orderLines.map((item) => (
                  <View
                    key={item.lineId}
                    className="flex-row items-center rounded-[22px] bg-[#FAFBF7] p-2.5"
                  >
                    <View className="mr-3 h-14 w-14 items-center justify-center overflow-hidden rounded-2xl bg-white">
                      <Image
                        source={item.image}
                        contentFit="contain"
                        cachePolicy="memory-disk"
                        recyclingKey={`checkout-${item.lineId}`}
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
                        {item.optionLabel} · {item.optionDetail} · Qty{" "}
                        {item.quantity}
                      </Text>
                    </View>

                    <Text className="text-sm font-extrabold text-[#033035]">
                      {formatNaira(item.price * item.quantity)}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            <View className="mt-5 rounded-[24px] bg-[#128A3A] p-4">
              <SummaryRow label="Items" value={formatNaira(itemSubtotal)} />
              {customSmoothieRequested && (
                <SummaryRow
                  label="Custom smoothie blend"
                  value={formatNaira(smoothieFee)}
                />
              )}
              <SummaryRow label="Delivery" value={formatNaira(deliveryFee)} />

              <View className="my-3 h-px bg-white/10" />

              <View className="flex-row items-center justify-between">
                <Text className="text-sm font-bold text-white/60">Total</Text>
                <Text className="text-2xl font-extrabold text-white">
                  {formatNaira(total)}
                </Text>
              </View>
            </View>
          </View>

          <CreditChoice
            key={creditOwner ?? "guest"}
            selected={useReturnCredit}
            onChange={setUseReturnCredit}
            replacementId={replacementId}
            onReplacement={setReplacementId}
          />
          <Pressable
            disabled={!canPlaceOrder || isPlacingOrder}
            onPress={handlePlaceOrder}
            className={`mt-5 flex-row items-center justify-center rounded-[24px] px-5 py-4 ${
              canPlaceOrder && !isPlacingOrder
                ? "bg-[#128A3A]"
                : "bg-[#128A3A]/30"
            }`}
          >
            <Text className="mr-2 text-base font-extrabold text-white">
              {isPlacingOrder ? "Placing order..." : "Place delivery order"}
            </Text>
            <Ionicons name="arrow-forward" size={18} color="#FACC15" />
          </Pressable>
        </View>
      </ScrollView>

      <Modal
        animationType="fade"
        transparent
        visible={isPaymentVisible && !!pendingOrder?.account && !paymentError}
        onRequestClose={() => setIsPaymentVisible(false)}
      >
        <View className="flex-1 justify-end bg-black/45 px-4 pb-4">
          <View className="rounded-[30px] bg-white p-5">
            <View className="flex-row items-start justify-between">
              <View className="flex-1 pr-4">
                <Text className="text-xl font-extrabold text-gray-950">
                  Transfer payment
                </Text>
                <Text className="mt-1 text-sm font-semibold leading-5 text-gray-500">
                  Transfer within 24 hours. Send the remaining amount shown,
                  then tap paid to request payment verification for
                  verification.
                </Text>
              </View>

              <Pressable
                onPress={() => setIsPaymentVisible(false)}
                className="h-10 w-10 items-center justify-center rounded-full bg-[#FAFBF7]"
              >
                <Ionicons name="close" size={20} color="#033035" />
              </Pressable>
            </View>

            <View className="mt-5 rounded-[24px] bg-[#FAFBF7] p-4">
              <PaymentRow
                label="Bank"
                value={manualPaymentAccount?.bank ?? ""}
              />
              <PaymentRow
                label="Account number"
                value={manualPaymentAccount?.accountNumber ?? ""}
              />
              <PaymentRow
                label="Account name"
                value={manualPaymentAccount?.accountName ?? ""}
              />
              <View className="my-3 h-px bg-gray-200" />
              <PaymentRow
                label="Amount"
                value={formatNaira(
                  pendingOrder?.amountDue ?? pendingOrder?.total ?? 0,
                )}
                strong
              />
            </View>

            <Pressable
              onPress={copyAccountNumber}
              className="mt-3 flex-row items-center justify-center rounded-[20px] border border-emerald-100 bg-emerald-50 px-4 py-3"
            >
              <Ionicons name="copy-outline" size={17} color="#128A3A" />
              <Text className="ml-2 text-sm font-extrabold text-[#128A3A]">
                Copy account number
              </Text>
            </Pressable>

            <View className="mt-5 flex-row gap-3">
              <Pressable
                onPress={() => setIsPaymentVisible(false)}
                className="flex-1 items-center justify-center rounded-[22px] bg-[#FAFBF7] px-4 py-4"
              >
                <Text className="text-sm font-extrabold text-[#033035]">
                  Cancel
                </Text>
              </Pressable>

              <Pressable
                disabled={isPlacingOrder}
                onPress={handlePaidConfirmation}
                className={`flex-1 items-center justify-center rounded-[22px] px-4 py-4 ${
                  isPlacingOrder ? "bg-[#128A3A]/30" : "bg-[#128A3A]"
                }`}
              >
                <Text className="text-sm font-extrabold text-white">
                  {isPlacingOrder ? "Confirming..." : "I have paid"}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

function SectionTitle({
  icon,
  subtitle,
  title,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  subtitle: string;
  title: string;
}) {
  return (
    <View className="flex-row items-center">
      <View className="mr-3 h-10 w-10 items-center justify-center rounded-2xl bg-[#FAFBF7]">
        <Ionicons name={icon} size={19} color="#033035" />
      </View>

      <View className="flex-1">
        <Text className="text-base font-extrabold text-gray-950">{title}</Text>
        <Text className="mt-0.5 text-xs font-semibold text-gray-500">
          {subtitle}
        </Text>
      </View>
    </View>
  );
}

function ZoneMetric({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
}) {
  return (
    <View className="flex-1 rounded-[22px] bg-[#FAFBF7] p-3">
      <Ionicons name={icon} size={18} color="#033035" />
      <Text className="mt-2 text-[11px] font-bold text-gray-500">{label}</Text>
      <Text className="mt-0.5 text-sm font-extrabold text-[#033035]">
        {value}
      </Text>
    </View>
  );
}

function CheckoutField({
  keyboardType,
  label,
  multiline,
  onChangeText,
  placeholder,
  value,
}: {
  keyboardType?: "default" | "phone-pad";
  label: string;
  multiline?: boolean;
  onChangeText: (value: string) => void;
  placeholder: string;
  value: string;
}) {
  return (
    <View>
      <Text className="mb-2 text-xs font-extrabold uppercase text-gray-400">
        {label}
      </Text>
      <TextInput
        keyboardType={keyboardType}
        multiline={multiline}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#9CA3AF"
        textAlignVertical={multiline ? "top" : "center"}
        value={value}
        className={`rounded-[22px] bg-[#FAFBF7] px-4 text-[15px] font-semibold text-gray-950 ${
          multiline ? "min-h-[92px] py-3.5" : "h-[52px]"
        }`}
      />
    </View>
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

function PaymentRow({
  label,
  strong,
  value,
}: {
  label: string;
  strong?: boolean;
  value: string;
}) {
  return (
    <View className="mb-2 flex-row items-center justify-between">
      <Text className="text-sm font-bold text-gray-500">{label}</Text>
      <Text
        className={`text-right ${
          strong
            ? "text-xl font-extrabold text-[#033035]"
            : "text-sm font-extrabold text-gray-950"
        }`}
      >
        {value}
      </Text>
    </View>
  );
}
