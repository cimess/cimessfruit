import { useCallback, useEffect, useState } from "react";
import { AppState, Linking, Modal, Platform, Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuthStore } from "@/features/auth/store";
import { useToastStore } from "@/features/ui/toastStore";
import { pushSupported, syncPushRegistration } from "./client";

export default function NotificationPermissionModal() {
  const insets = useSafeAreaInsets();
  const user = useAuthStore((state) => state.user);
  const [isVisible, setIsVisible] = useState(false);
  const [hasPromptedSystem, setHasPromptedSystem] = useState(false);

  const checkAndPrompt = useCallback(async () => {
    if (!user || !pushSupported()) return;

    try {
      const Notifications = await import("expo-notifications");
      const settings = await Notifications.getPermissionsAsync();

      if (settings.granted) {
        setIsVisible(false);
        await syncPushRegistration(false).catch(() => {});
        return;
      }

      // If the system prompt hasn't been shown yet and can ask again, ask natively first
      if (!hasPromptedSystem && settings.canAskAgain) {
        setHasPromptedSystem(true);
        const requested = await Notifications.requestPermissionsAsync();
        if (requested.granted) {
          setIsVisible(false);
          await syncPushRegistration(false).catch(() => {});
          useToastStore.getState().showToast("Order notifications enabled!", "success");
          return;
        }
      }

      // If still not granted, show our custom guidance modal
      setIsVisible(true);
    } catch (err) {
      console.warn("[PermissionModal] Check failed:", err);
    }
  }, [user, hasPromptedSystem]);

  // Check on mount / login
  useEffect(() => {
    if (user) {
      void checkAndPrompt();
    } else {
      setIsVisible(false);
      setHasPromptedSystem(false);
    }
  }, [user, checkAndPrompt]);

  // Re-check when user returns to app from device settings
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active" && user) {
        void checkAndPrompt();
      }
    });

    return () => subscription.remove();
  }, [user, checkAndPrompt]);

  const handleOpenSettings = async () => {
    try {
      await Linking.openSettings();
    } catch {
      useToastStore.getState().showToast("Please open phone Settings to allow notifications.", "info");
    }
  };

  const handleDismiss = () => {
    setIsVisible(false);
  };

  if (!isVisible) return null;

  return (
    <Modal
      visible={isVisible}
      transparent
      animationType="fade"
      onRequestClose={handleDismiss}
      statusBarTranslucent
    >
      <View className="flex-1 items-center justify-center bg-black/60 px-5">
        <View
          style={{ paddingBottom: Math.max(insets.bottom, 20) }}
          className="w-full max-w-sm rounded-[32px] bg-white p-6 shadow-2xl"
        >
          {/* Header Icon */}
          <View className="items-center">
            <View className="h-16 w-16 items-center justify-center rounded-full bg-[#EBF7EE]">
              <Ionicons name="notifications" size={32} color="#128A3A" />
            </View>
            <Text className="mt-4 text-center text-xl font-extrabold text-[#033035]">
              Enable Order Notifications
            </Text>
            <Text className="mt-2 text-center text-xs font-semibold leading-5 text-gray-500">
              Real-time push notifications are vital to track your fresh fruit orders, instant payment verification, and delivery alerts.
            </Text>
          </View>

          {/* Value Props / Guidance Box */}
          <View className="mt-5 rounded-2xl bg-[#FAFBF7] p-4">
            <View className="flex-row items-center mb-2.5">
              <Ionicons name="checkmark-circle" size={18} color="#128A3A" />
              <Text className="ml-2 text-xs font-bold text-[#033035]">
                Instant payment confirmation
              </Text>
            </View>
            <View className="flex-row items-center mb-2.5">
              <Ionicons name="cube-outline" size={18} color="#128A3A" />
              <Text className="ml-2 text-xs font-bold text-[#033035]">
                Live packing & dispatch updates
              </Text>
            </View>
            <View className="flex-row items-center">
              <Ionicons name="volume-medium-outline" size={18} color="#128A3A" />
              <Text className="ml-2 text-xs font-bold text-[#033035]">
                Driver arrival & sound chimes
              </Text>
            </View>
          </View>

          {/* Instructions */}
          <View className="mt-4 rounded-xl border border-gray-100 bg-gray-50/70 p-3">
            <Text className="text-[11px] font-bold text-gray-700">
              How to turn it on:
            </Text>
            <Text className="mt-1 text-[11px] leading-4 text-gray-500">
              1. Tap <Text className="font-bold text-[#128A3A]">Open Settings</Text> below.{"\n"}
              2. Select <Text className="font-bold text-gray-700">Notifications</Text>.{"\n"}
              3. Turn <Text className="font-bold text-gray-700">Allow Notifications</Text> to ON.
            </Text>
            <Text className="mt-2 text-[10px] italic text-gray-400">
              * Note: Location is optional (you can use your address), but order notifications are critical.
            </Text>
          </View>

          {/* Action Buttons */}
          <View className="mt-5 gap-2.5">
            <Pressable
              onPress={handleOpenSettings}
              className="w-full flex-row items-center justify-center rounded-2xl bg-[#128A3A] py-3.5 shadow-sm active:opacity-90"
            >
              <Ionicons name="settings-outline" size={18} color="#FFFFFF" />
              <Text className="ml-2 text-center text-sm font-extrabold text-white">
                Open Device Settings
              </Text>
            </Pressable>

            <Pressable
              onPress={handleDismiss}
              className="w-full rounded-2xl py-2.5 active:opacity-70"
            >
              <Text className="text-center text-xs font-bold text-gray-400">
                Continue without Notifications
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

