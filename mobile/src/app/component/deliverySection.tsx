import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { Pressable, Text, View } from "react-native";

export type DeliverySectionData = {
  eyebrow?: string;
  title?: string;
  description?: string;
  buttonText?: string;
  image?: string | number;
};

type DeliverySectionProps = {
  data?: DeliverySectionData;
  onPress?: (data: DeliverySectionData) => void;
};

const defaultData: DeliverySectionData = {
  eyebrow: "FRESHNESS, DELIVERED",
  title: "Freshness at your doorstep.",
  description:
    "From our fruit stand to your door, we prepare your order with care and deliver it fresh.",
  buttonText: "Shop Now",
  image: require("@/assets/images/delivery.webp"),
};

export default function DeliverySection({
  data = defaultData,
  onPress,
}: DeliverySectionProps) {
  const imageSource =
    typeof data.image === "string"
      ? { uri: data.image }
      : data.image;

  return (
    <View className="mt-8 overflow-hidden rounded-[32px] bg-[#128A3A]">
      {/* Image */}
      {data.image && (
        <View className="relative h-[210px] w-full">
          <Image
            source={imageSource}
            style={{ width: "100%", height: "100%" }}
            contentFit="cover"
          />

          {/* Image overlay */}
          <View className="absolute inset-0 bg-[#128A3A]/45" />

          {/* Delivery icon */}
          <View className="absolute right-5 top-5 h-12 w-12 items-center justify-center rounded-full bg-[#FACC15]">
            <Ionicons
              name="bicycle-outline"
              size={23}
              color="#033035"
            />
          </View>
        </View>
      )}

      {/* Content */}
      <View className="px-5 pb-6 pt-6">
        {data.eyebrow && (
          <Text className="text-xs font-extrabold tracking-[2px] text-[#FACC15]">
            {data.eyebrow}
          </Text>
        )}

        {data.title && (
          <Text className="mt-2 text-[28px] font-extrabold leading-9 text-white">
            {data.title}
          </Text>
        )}

        {data.description && (
          <Text className="mt-3 max-w-[340px] text-[15px] leading-6 text-white/70">
            {data.description}
          </Text>
        )}

        {/* CTA */}
        <Pressable
          onPress={() => onPress?.(data)}
          className="mt-5 flex-row items-center self-start rounded-2xl bg-white px-5 py-3.5"
        >
          <Text className="mr-3 text-sm font-extrabold text-[#128A3A]">
            {data.buttonText ?? "Shop Now"}
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
