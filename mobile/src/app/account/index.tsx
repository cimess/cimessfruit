import NotificationSettings from "@/features/notifications/NotificationSettings";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useRouter, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import BottomNavigation from "@/app/component/navBar";
import { useAuthStore } from "@/features/auth/store";
import type { DeliveryAddressDraft } from "@/features/delivery/types";
import { useDeliveryZones } from "@/features/delivery/zones";
import ZonePicker from "@/features/delivery/ZonePicker";
import DeliveryMap from "@/features/delivery/DeliveryMap";
import { useToastStore } from "@/features/ui/toastStore";
import { useUserStore } from "@/features/user/store";

const displayFont = Platform.select({
  ios: "AvenirNext-Heavy",
  android: "sans-serif-condensed",
  default: "system-ui",
});

export default function Account() {
  const router = useRouter();
  const zoneState = useDeliveryZones();
  const [mapVisible, setMapVisible] = useState(false);
  const isSaving = useUserStore(state => state.isSaving);
  const profileError = useUserStore(state => state.error);
  const insets = useSafeAreaInsets();
  const profile = useUserStore((state) => state.profile);
  const isLoadingProfile = useUserStore((state) => state.isLoadingProfile);
  const loadProfile = useUserStore((state) => state.loadProfile);
  const updateDeliveryAddress = useUserStore(
    (state) => state.updateDeliveryAddress
  );
  const setNotificationsEnabled = useUserStore(
    (state) => state.setNotificationsEnabled
  );
  const logout = useAuthStore((state) => state.logout);
  const showToast = useToastStore((state) => state.showToast);
  const [isAddressModalVisible, setIsAddressModalVisible] = useState(false);
  const [addressDraft, setAddressDraft] = useState<DeliveryAddressDraft>({
    zoneId: "",
    streetOrClose: "",
    houseNumber: "",
    flatOrBlock: "",
    landmark: "",
    note: "",
    phoneNumber: "",
  });

  useFocusEffect(useCallback(() => {
    void loadProfile();
  }, [loadProfile]));

  const openAddressModal = () => {
    if (profile) {
      setAddressDraft(profile.deliveryAddress);
    }

    setIsAddressModalVisible(true);
  };

  const updateAddressDraft = (key: keyof DeliveryAddressDraft, value: string) => {
    setAddressDraft((current) => ({
      ...current,
      [key]: value,
      ...(key === "streetOrClose" || key === "houseNumber" ? { coordinates: undefined } : {}),
    }));
  };

  const saveAddress = async () => {
    if (isSaving) return;
    if (
      addressDraft.streetOrClose.trim().length === 0 ||
      addressDraft.houseNumber.trim().length === 0 ||
      addressDraft.phoneNumber.trim().length === 0
    ) {
      showToast("Street, house number, and phone are required.", "error");
      return;
    }

    try {
    await updateDeliveryAddress({
      ...addressDraft,
      streetOrClose: addressDraft.streetOrClose.trim(),
      houseNumber: addressDraft.houseNumber.trim(),
      flatOrBlock: addressDraft.flatOrBlock.trim(),
      landmark: addressDraft.landmark.trim(),
      note: addressDraft.note.trim(),
      phoneNumber: addressDraft.phoneNumber.trim(),
    });
    setIsAddressModalVisible(false);
    showToast("Saved delivery address.", "success");
    } catch (error) { showToast(error instanceof Error ? error.message : "Unable to save address.", "error"); }
  };

  const handleNotificationsChange = async (enabled: boolean) => {
    try { await setNotificationsEnabled(enabled); showToast("Notification preference saved.", "success"); }
    catch (error) { showToast(error instanceof Error ? error.message : "Unable to save preference.", "error"); }
  };

  const handleSignOut = async () => {
    try {
      await logout();
      showToast("Signed out.", "success");
      router.replace("/login");
    } catch {
      showToast("Could not sign out. Try again.", "error");
    }
  };

  return (
    <View className="flex-1 bg-[#FAFBF7]">
      <Stack.Screen options={{ headerShown: false }} />
      <Pressable onPress={() => router.push("/recover")}><Text className="p-4 font-bold">Password recovery & email verification</Text></Pressable>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 112 }}
      >
        <View
          className="rounded-b-[34px] bg-[#128A3A] px-5 pb-7"
          style={{ paddingTop: insets.top + 16 }}
        >
          <Text
            className="mt-6 text-[38px] font-extrabold leading-[42px] text-white"
            style={{ fontFamily: displayFont }}
          >
            Account
          </Text>
          <Text className="mt-3 max-w-[320px] text-[15px] font-semibold leading-6 text-white/65">
            Manage your delivery details, payment info, and store preferences.
          </Text>
        </View>

        <View className="px-[18px] pt-5">
          <View className="rounded-[28px] bg-white p-4">
            <View className="flex-row items-center">
              <View className="mr-4 h-16 w-16 items-center justify-center rounded-full bg-[#128A3A]">
                <Text className="text-2xl font-extrabold text-[#FACC15]">
                  {(profile?.name ?? "C").slice(0, 1)}
                </Text>
              </View>

              <View className="flex-1">
                <Text className="text-xl font-extrabold text-gray-950">
                  {isLoadingProfile ? "Loading..." : profile?.name ?? "Guest"}
                </Text>
                <Text className="mt-1 text-sm font-bold text-gray-500">
                  {profile?.phoneNumber ?? "Add phone number"}
                </Text>
                <Text className="mt-0.5 text-sm font-bold text-gray-400">
                  {profile?.email ?? "Add email address"}
                </Text>
              </View>
            </View>

            <Pressable
              onPress={() => router.push("/account/edit")}
              className="mt-4 flex-row items-center justify-center rounded-[22px] bg-[#FAFBF7] px-4 py-3"
            >
              <Ionicons name="create-outline" size={18} color="#033035" />
              <Text className="ml-2 text-sm font-extrabold text-[#033035]">
                Edit profile
              </Text>
            </Pressable>
            {profile && !profile.emailVerified && <Pressable accessibilityRole="button" onPress={() => router.push("/verify-email")} className="mt-2 items-center rounded-[22px] bg-green-50 px-4 py-3"><Text className="font-bold text-green-700">Verify email</Text></Pressable>}
          </View>

          <SettingsSection title="Delivery">
            <SettingsRow
              icon="location-outline"
              label="Saved address"
              value={
                profile
                  ? `${profile.deliveryAddress.houseNumber}, ${profile.deliveryAddress.streetOrClose}`
                  : "No address saved"
              }
              onPress={openAddressModal}
            />
            <SettingsRow
              icon="call-outline"
              label="Phone number"
              value={profile?.deliveryAddress.phoneNumber ?? "No phone number saved"}
              onPress={openAddressModal}
            />
            <SettingsRow
              icon="map-outline"
              label="Delivery zone"
              value={zoneState.zones.find(zone => zone.id === profile?.deliveryAddress.zoneId)?.name ?? "Select delivery zone"}
              onPress={openAddressModal}
            />
          </SettingsSection>

          <SettingsSection title="Preferences">
            <View className="flex-row items-center rounded-[22px] bg-[#FAFBF7] px-4 py-3">
              <View className="mr-3 h-10 w-10 items-center justify-center rounded-2xl bg-white">
                <Ionicons name="notifications-outline" size={19} color="#033035" />
              </View>
              <View className="flex-1">
                <Text className="text-sm font-extrabold text-gray-950">
                  Order notifications
                </Text>
                <Text className="mt-0.5 text-xs font-bold text-gray-500">
                  Payment and delivery updates; push requires device permission
                </Text>
              </View>
              <Switch
                disabled={isSaving || !profile}
                value={profile?.notificationsEnabled ?? false}
                onValueChange={handleNotificationsChange}
                trackColor={{ false: "#D1D5DB", true: "#BBF7D0" }}
                thumbColor={
                  profile?.notificationsEnabled ? "#059669" : "#F9FAFB"
                }
              />
            </View>
            <NotificationSettings key={profile?.id ?? "guest"} />
          </SettingsSection>

          <SettingsSection title="Help">
            <SettingsRow
              icon="help-circle-outline"
              label="Chat & disputes"
              value="Get help with an order"
              onPress={() => router.push("/chat")}
            />
            <SettingsRow
              icon="shield-checkmark-outline"
              label="Privacy"
              value="Data and account safety"
              onPress={() => router.push("/privacy")}
            />
          </SettingsSection>

          <Pressable
            onPress={handleSignOut}
            className="mt-5 flex-row items-center justify-center rounded-[24px] bg-white px-5 py-4"
          >
            <Ionicons name="log-out-outline" size={19} color="#B91C1C" />
            <Text className="ml-2 text-base font-extrabold text-red-700">
              Sign out
            </Text>
          </Pressable>
            <Pressable onPress={() => router.push("/delete-account")}><Text className="py-4 font-bold text-red-700">Disable my account</Text></Pressable>
        </View>
      </ScrollView>

      <Modal
        animationType="fade"
        transparent
        visible={isAddressModalVisible}
        onRequestClose={() => setIsAddressModalVisible(false)}
      >
        <View className="flex-1 justify-end bg-black/45 px-4 pb-4">
          <View className="rounded-[30px] bg-white p-5">
            <View className="flex-row items-start justify-between">
              <View className="flex-1 pr-4">
                <Text className="text-xl font-extrabold text-gray-950">
                  Delivery address
                </Text>
                <Text className="mt-1 text-sm font-semibold leading-5 text-gray-500">
                  This becomes your checkout default. You can still edit it per
                  order.
                </Text>
              </View>
              <Pressable
                onPress={() => setIsAddressModalVisible(false)}
                className="h-10 w-10 items-center justify-center rounded-full bg-[#FAFBF7]"
              >
                <Ionicons name="close" size={20} color="#033035" />
              </Pressable>
            </View>

            {mapVisible ? <DeliveryMap zones={zoneState.zones} address={addressDraft} onClose={() => setMapVisible(false)} onSelect={setAddressDraft} /> : null}
            <ScrollView style={{ maxHeight: 440 }} keyboardShouldPersistTaps="handled">
            <ZonePicker {...zoneState} value={addressDraft.zoneId} onChange={zoneId => setAddressDraft(current => ({ ...current, zoneId, coordinates: undefined, ...(addressDraft.coordinates ? { streetOrClose: "", houseNumber: "" } : {}) }))} />
            <Pressable
              onPress={() => setMapVisible(true)}
              className="mt-2 flex-row items-center rounded-[20px] bg-[#128A3A] p-3.5"
            >
              <View className="mr-3 h-10 w-10 items-center justify-center rounded-2xl bg-[#FACC15]">
                <Ionicons name="navigate-outline" size={19} color="#033035" />
              </View>
              <View className="flex-1 pr-2">
                <Text className="text-sm font-extrabold text-white">
                  Pin precise location on map
                </Text>
                <Text className="mt-0.5 text-xs font-semibold leading-4 text-white/60">
                  Select your exact entrance across Wider Abesan.
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#FFFFFF" />
            </Pressable>
            <View className="mt-5 gap-3">
              <AccountField
                label="Street / Close"
                onChangeText={(value) =>
                  updateAddressDraft("streetOrClose", value)
                }
                placeholder="e.g. 32 Road"
                value={addressDraft.streetOrClose}
              />
              <AccountField
                label="House number"
                onChangeText={(value) => updateAddressDraft("houseNumber", value)}
                placeholder="e.g. House 15"
                value={addressDraft.houseNumber}
              />
              <AccountField
                label="Flat / Block"
                onChangeText={(value) => updateAddressDraft("flatOrBlock", value)}
                placeholder="e.g. Block B, Flat 2"
                value={addressDraft.flatOrBlock}
              />
              <AccountField
                label="Landmark"
                onChangeText={(value) => updateAddressDraft("landmark", value)}
                placeholder="e.g. Near the mini market"
                value={addressDraft.landmark}
              />
              <AccountField
                keyboardType="phone-pad"
                label="Phone number"
                onChangeText={(value) => updateAddressDraft("phoneNumber", value)}
                placeholder="080..."
                value={addressDraft.phoneNumber}
              />
            </View>

            </ScrollView>
            <Pressable
              disabled={isSaving}
              onPress={() => void saveAddress()}
              className="mt-5 flex-row items-center justify-center rounded-[22px] bg-[#128A3A] px-4 py-4"
            >
              <Text className="mr-2 text-sm font-extrabold text-white">
                Save address
              </Text>
              <Ionicons name="checkmark" size={18} color="#FACC15" />
            </Pressable>
          </View>
        </View>
      </Modal>

      {profileError && <Text accessibilityRole="alert">{profileError}</Text>}
      {__DEV__ && process.env.EXPO_PUBLIC_REQUEST_METRICS_ENABLED === "true" && <Pressable onPress={() => router.push("/diagnostics")}><Text>Request diagnostics</Text></Pressable>}<BottomNavigation />
    </View>
  );
}

function SettingsSection({
  children,
  title,
}: {
  children: React.ReactNode;
  title: string;
}) {
  return (
    <View className="mt-5 rounded-[28px] bg-white p-4">
      <Text className="mb-3 text-base font-extrabold text-gray-950">
        {title}
      </Text>
      <View className="gap-3">{children}</View>
    </View>
  );
}

function SettingsRow({
  icon,
  label,
  onPress,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  value: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center rounded-[22px] bg-[#FAFBF7] px-4 py-3"
    >
      <View className="mr-3 h-10 w-10 items-center justify-center rounded-2xl bg-white">
        <Ionicons name={icon} size={19} color="#033035" />
      </View>
      <View className="flex-1 pr-3">
        <Text className="text-sm font-extrabold text-gray-950">{label}</Text>
        <Text className="mt-0.5 text-xs font-bold text-gray-500">{value}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
    </Pressable>
  );
}

function AccountField({
  keyboardType,
  label,
  onChangeText,
  placeholder,
  value,
}: {
  keyboardType?: "default" | "phone-pad";
  label: string;
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
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#9CA3AF"
        value={value}
        className="h-[52px] rounded-[22px] bg-[#FAFBF7] px-4 text-[15px] font-semibold text-gray-950"
      />
    </View>
  );
}
