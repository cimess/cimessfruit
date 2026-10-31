import { Image } from "expo-image";
import { ActivityIndicator, Text, View } from "react-native";

import { useLoadingStore } from "@/features/ui/loadingStore";

export default function LoadingOverlay() {
  const isVisible = useLoadingStore((state) => state.isVisible);
  const message = useLoadingStore((state) => state.message);

  if (!isVisible) {
    return null;
  }

  return (
    <View className="absolute inset-0 z-50 items-center justify-center bg-black/20 px-8">
      <View className="items-center rounded-[28px] bg-white px-7 py-6">
        <View className="h-16 w-16 items-center justify-center overflow-hidden rounded-[22px] bg-[#FAFBF7]">
          <Image
            source={require("@/assets/logo/logo-ui.webp")}
            contentFit="contain"
            style={{ width: 54, height: 54 }}
          />
        </View>
        <ActivityIndicator className="mt-4" color="#128A3A" />
        <Text className="mt-3 text-center text-sm font-extrabold text-[#033035]">
          {message}
        </Text>
      </View>
    </View>
  );
}
