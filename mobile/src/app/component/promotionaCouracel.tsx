import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useState } from "react";
import {
  Dimensions,
  Pressable,
  Text,
  View,
} from "react-native";
import { Carousel } from "react-native-reanimated-carousel";

const { width } = Dimensions.get("window");

const CARD_WIDTH = width - 32;
const CARD_HEIGHT = 190;

type Offer = {
  id: string;
  title?: string;
  subtitle?: string;
  discount?: string;
  image: string | number;
  buttonText?: string;
};

type OffersProps = {
  offers?: Offer[];
  title?: string;
  onSeeAll?: () => void;
  onShopNow?: (offer: Offer) => void;
};

const defaultOffers: Offer[] = [
  {
    id: "1",
    title: "Exclusive Offer",
    subtitle: "Fresh fruits delivered straight to your door.",
    discount: "30%",
    image: require("@/assets/images/hero1.webp"),
  },
  {
    id: "2",
    title: "Weekend Offer",
    subtitle: "Stock up on your favorite fruits.",
    discount: "25%",
    image: require("@/assets/images/hero1.webp"),
  },
  {
    id: "3",
    title: "Fresh Pick",
    subtitle: "Fresh and carefully selected for you.",
    discount: "20%",
    image: require("@/assets/images/hero1.webp"),
  },
  {
    id: "4",
    title: "Special Deal",
    subtitle: "More fruits. More value.",
    discount: "15%",
    image: require("@/assets/images/hero1.webp"),
  },
];

export default function OffersCarousel({
  offers = defaultOffers,
  title = "Exclusive Offers",
  onSeeAll,
  onShopNow,
}: OffersProps) {
  const [activeIndex, setActiveIndex] = useState(0);

  return (
    <View className="mt-6">

      {/* Header */}
      <View className="mb-3 flex-row items-center justify-between px-1">
        <Text className="text-xl font-bold text-gray-900">
          {title}
        </Text>

        <Pressable
          onPress={onSeeAll}
          className="flex-row items-center"
        >
          <Text className="mr-1 text-sm font-semibold text-[#128A3A]">
            View all
          </Text>

          <Ionicons
            name="chevron-forward"
            size={15}
            color="#128A3A"
          />
        </Pressable>
      </View>

      {/* Carousel */}
      <Carousel
        loop
        style={{
          width: CARD_WIDTH,
          height: CARD_HEIGHT,
        }}
        data={offers}
        autoplay
        autoplayInterval={5000}

        /*
         * This is the important part.
         *
         * 1500ms = 1.5 seconds for the card
         * to smoothly travel to the next position.
         *
         * The default animation is much quicker,
         * so this gives the carousel a slower,
         * more premium feel.
         */
        animation={{
          type: "timing",
          duration: 1500,
        }}

        onSnapToItem={(index) => {
          setActiveIndex(index);
        }}

        renderItem={({ item }) => {
          const imageSource =
            typeof item.image === "string"
              ? { uri: item.image }
              : item.image;

          return (
            <Pressable
              onPress={() => onShopNow?.(item)}
              className="relative overflow-hidden rounded-3xl"
              style={{
                width: CARD_WIDTH,
                height: CARD_HEIGHT,
              }}
            >

              {/* Background image */}
              <Image
                source={imageSource}
                contentFit="cover"
                style={{
                  position: "absolute",
                  width: "100%",
                  height: "100%",
                }}
              />

              {/* Dark overlay */}
              <View className="absolute inset-0 bg-black/40" />

              {/* Content */}
              <View className="flex-1 justify-between p-5">

                {/* Discount */}
                {item.discount && (
                  <View className="self-start rounded-full bg-white px-3 py-1.5">
                    <Text className="text-xs font-extrabold text-[#128A3A]">
                      {item.discount} OFF
                    </Text>
                  </View>
                )}

                {/* Bottom content */}
                <View className="flex-row items-end justify-between">

                  <View className="flex-1 pr-3">

                    {item.title && (
                      <Text className="text-2xl font-extrabold text-white">
                        {item.title}
                      </Text>
                    )}

                    {item.subtitle && (
                      <Text className="mt-1 text-sm leading-5 text-white/90">
                        {item.subtitle}
                      </Text>
                    )}

                  </View>

                  {/* Shop button */}
                  <Pressable
                    onPress={() => onShopNow?.(item)}
                    className="flex-row items-center rounded-full bg-white px-4 py-2.5"
                  >
                    <Text className="mr-2 text-sm font-bold text-[#128A3A]">
                      {item.buttonText ?? "Shop Now"}
                    </Text>

                    <Ionicons
                      name="arrow-forward"
                      size={15}
                      color="#128A3A"
                    />
                  </Pressable>

                </View>
              </View>
            </Pressable>
          );
        }}
      />

      {/* Pagination */}
      <View className="mt-3 flex-row justify-center">
        {offers.slice(0, 4).map((offer, index) => (
          <View
            key={offer.id}
            className={`mx-1 h-1.5 rounded-full ${
              activeIndex === index
                ? "w-6 bg-[#128A3A]"
                : "w-1.5 bg-gray-300"
            }`}
          />
        ))}
      </View>

    </View>
  );
}
