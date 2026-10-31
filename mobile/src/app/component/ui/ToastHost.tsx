import { Ionicons } from "@expo/vector-icons";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useToastStore } from "@/features/ui/toastStore";

const toastStyle = {
  success: {
    accentColor: "#10B981",
    backgroundColor: "#ECFDF5",
    color: "#065F46",
    icon: "checkmark-circle" as const,
    iconColor: "#059669",
    title: "Success",
  },
  info: {
    accentColor: "#3B82F6",
    backgroundColor: "#EFF6FF",
    color: "#1E40AF",
    icon: "information-circle" as const,
    iconColor: "#2563EB",
    title: "Heads up",
  },
  error: {
    accentColor: "#EF4444",
    backgroundColor: "#FEF2F2",
    color: "#991B1B",
    icon: "alert-circle" as const,
    iconColor: "#DC2626",
    title: "Needs attention",
  },
};

export default function ToastHost() {
  const insets = useSafeAreaInsets();
  const isVisible = useToastStore((state) => state.isVisible);
  const message = useToastStore((state) => state.message);
  const kind = useToastStore((state) => state.kind);
  const hideToast = useToastStore((state) => state.hideToast);

  if (!isVisible) {
    return null;
  }

  const style = toastStyle[kind];

  return (
    <View
      pointerEvents="box-none"
      className="absolute left-4 right-4 z-50"
      style={{ top: insets.top + 12 }}
    >
      <Pressable
        onPress={hideToast}
        className="overflow-hidden rounded-[24px] border border-black/5 bg-white"
        style={{
          shadowColor: "#033035",
          shadowOffset: { width: 0, height: 12 },
          shadowOpacity: 0.16,
          shadowRadius: 22,
          elevation: 12,
        }}
      >
        <View
          className="h-1.5 w-full"
          style={{ backgroundColor: style.accentColor }}
        />
        <View className="flex-row items-center px-4 py-3.5">
          <View
            className="mr-3 h-11 w-11 items-center justify-center rounded-2xl"
            style={{ backgroundColor: style.backgroundColor }}
          >
            <Ionicons name={style.icon} size={22} color={style.iconColor} />
          </View>
          <View className="flex-1 pr-2">
            <Text className="text-sm font-extrabold text-gray-950">
              {style.title}
            </Text>
            <Text
              numberOfLines={2}
              className="mt-0.5 text-sm font-bold leading-5"
              style={{ color: style.color }}
            >
              {message}
            </Text>
          </View>
          <Ionicons name="close" size={18} color="#9CA3AF" />
        </View>
      </Pressable>
    </View>
  );
}
