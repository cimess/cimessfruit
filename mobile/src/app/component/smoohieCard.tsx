import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { Pressable, Text, View } from "react-native";

export type SmoothieSectionData = {
  eyebrow?: string;
  title?: string;
  description?: string;
  buttonText?: string;
  image: string | number;
  badge?: string;
};

type SmoothieSectionProps = {
  data?: SmoothieSectionData;
  onPress?: (data: SmoothieSectionData) => void;
};

const defaultData: SmoothieSectionData = {
  eyebrow: "FRESHLY BLENDED",
  title: "Your fruit.\nYour smoothie.",
  description:
    "Pick your favourite fruits and we'll blend them fresh for you, right here.",
  buttonText: "Create a smoothie",
  badge: "Blended fresh",
  image: require("@/assets/images/thumbs/smoothie1.webp"),
};

export default function SmoothieSection({
  data = defaultData,
  onPress,
}: SmoothieSectionProps) {
  return (
    <View className="mt-8 overflow-hidden bg-[#128A3A]">
      {/* Image area */}
      <View className="relative h-[250px] w-full">
        <Image
          source={
            typeof data.image === "string"
              ? { uri: data.image }
              : data.image
          }
          style={{ width: "100%", height: "100%" }}
          contentFit="contain"
          className="h-full w-full"
        />

        {/* Image overlay */}
        <View className="absolute inset-0 bg-black/35" />

        {/* Top badge */}
        {data.badge && (
          <View className="absolute left-5 top-5 flex-row items-center rounded-full bg-white/95 px-3.5 py-2">
            <View className="mr-2 h-2 w-2 rounded-full bg-[#FACC15]" />

            <Text className="text-xs font-bold text-[#128A3A]">
              {data.badge}
            </Text>
          </View>
        )}

        {/* Small decorative circle */}
        <View className="absolute bottom-5 right-5 h-12 w-12 items-center justify-center rounded-full bg-[#FACC15]">
          <Ionicons
            name="nutrition-outline"
            size={23}
            color="#033035"
          />
        </View>
      </View>

      {/* Content */}
      <View className="px-5 pb-6 pt-5">
        {data.eyebrow && (
          <Text className="text-xs font-extrabold tracking-[2px] text-[#FACC15]">
            {data.eyebrow}
          </Text>
        )}

        {data.title && (
          <Text className="mt-2 text-[30px] font-extrabold leading-9 text-white">
            {data.title}
          </Text>
        )}

        {data.description && (
          <Text className="mt-3 max-w-[330px] text-[15px] leading-6 text-white/70">
            {data.description}
          </Text>
        )}

        {/* CTA */}
        <Pressable
          onPress={() => onPress?.(data)}
          className="mt-5 flex-row items-center self-start rounded-2xl bg-white px-5 py-3.5"
        >
          <Text className="mr-3 text-sm font-extrabold text-[#128A3A]">
            {data.buttonText ?? "Create a smoothie"}
          </Text>

          <View className="h-7 w-7 items-center justify-center rounded-full bg-[#FACC15]">
            <Ionicons
              name="arrow-forward"
              size={15}
              color="#033035"
            />
          </View>
        </Pressable>
      </View>
    </View>
  );
}
