import { Ionicons } from "@expo/vector-icons";
import { FlatList, Pressable, Text, View } from "react-native";
import { Image } from "expo-image";

export type FruitProduct = {
  id: string;
  name: string;
  image: string | number;

  // Optional descriptive information
  variant?: string;
};

type FruitProductsProps = {
  fruits?: FruitProduct[];
  title?: string;
  subtitle?: string;
  showSeeAll?: boolean;

  // Called when the customer wants to view
  // the available sizes/options for a product.
  onViewOptions?: (fruit: FruitProduct) => void;

  // Called when "View all" is pressed.
  onSeeAll?: () => void;
};

const defaultFruits: FruitProduct[] = [
  {
    id: "banana",
    name: "Banana",
    variant: "Fresh",
    image:
      require("@/assets/images/thumbs/banana.webp"),
  },
  {
    id: "pink-lady",
    name: "Pink Lady",
    variant: "Apple",
    image:
      require("@/assets/images/thumbs/pinkApple.webp"),
  },
  {
    id: "roja",
    name: "Roja Apple",
    variant: "Apple",
    image:
      require("@/assets/images/thumbs/redApple.webp"),
  },
  {
    id: "green-apple",
    name: "Green Apple",
    variant: "Apple",
    image:
      require("@/assets/images/thumbs/greenApple.webp"),
  },
  {
    id: "apple-pear",
    name: "Apple Pear",
    variant: "Apple",
    image:
      require("@/assets/images/thumbs/pears.webp"),
  },
  {
    id: "red-apple",
    name: "Red Apple",
    variant: "Apple",
    image:
      require("@/assets/images/thumbs/redApple.webp"),
  },
  {
    id: "grapes",
    name: "Grapes",
    variant: "Fresh",
    image:
      require("@/assets/images/thumbs/grapes.webp"),
  },
  {
    id: "pawpaw",
    name: "Pawpaw",
    variant: "Fresh",
    image:
      require("@/assets/images/thumbs/pawpaw.webp"),
  },
  {
    id: "watermelon",
    name: "Watermelon",
    variant: "Fresh",
    image:
      require("@/assets/images/thumbs/watermelon.webp"),
  },
  {
    id: "coconut",
    name: "Coconut",
    variant: "Fresh",
    image:
      require("@/assets/images/thumbs/coconut.webp"),
  },
  {
    id: "tangerine",
    name: "Tangerine",
    variant: "Fresh",
    image:
      require("@/assets/images/thumbs/tangrin.webp"),
  },
  {
    id: "lemon",
    name: "Lemon",
    variant: "Fresh",
    image:
      require("@/assets/images/thumbs/lemon.webp"),
  },
  {
    id: "pineapple",
    name: "Pineapple",
    variant: "Fresh",
    image:
      require("@/assets/images/thumbs/pineapple.webp"),
  },
  {
    id: "plantain",
    name: "Plantain",
    variant: "Fresh",
    image:
      require("@/assets/images/thumbs/plantain.webp"),
  },
];

export default function FruitProducts({
  fruits = defaultFruits,
  title = "Fresh Fruits",
  subtitle = "Pick something fresh",
  showSeeAll = true,
  onViewOptions,
  onSeeAll,
}: FruitProductsProps) {
  const renderFruit = ({ item: fruit }: { item: FruitProduct }) => (
    <Pressable
      onPress={() => onViewOptions?.(fruit)}
      className="w-[165px] overflow-hidden rounded-3xl bg-white"
    >
      <View className="relative h-[155px] w-full bg-gray-100">
        <Image
          source={
            typeof fruit.image === "string"
              ? { uri: fruit.image }
              : fruit.image
          }
          style={{ width: "100%", height: "100%" }}
          contentFit="cover"
          cachePolicy="memory-disk"
          recyclingKey={fruit.id}
        />

        <View className="absolute right-3 top-3 h-9 w-9 items-center justify-center rounded-full bg-white shadow-lg">
          <Ionicons name="arrow-forward" size={18} color="#128A3A" />
        </View>
      </View>

      <View className="p-3">
        <Text
          numberOfLines={1}
          className="text-base font-bold text-gray-900"
        >
          {fruit.name}
        </Text>

        {fruit.variant && (
          <Text numberOfLines={1} className="mt-1 text-xs text-gray-500">
            {fruit.variant}
          </Text>
        )}

        <View className="mt-3 flex-row items-center justify-between">
          <Text className="text-xs font-semibold text-[#128A3A]">
            View options
          </Text>

          <Ionicons name="chevron-forward" size={15} color="#128A3A" />
        </View>
      </View>
    </Pressable>
  );

  return (
    <View className="mt-7">

      {/* Header */}
      <View className="mb-4 flex-row items-end justify-between px-1">
        <View>
          <Text className="text-xl font-bold text-gray-900">
            {title}
          </Text>

          <Text className="mt-1 text-sm text-gray-500">
            {subtitle}
          </Text>
        </View>

        {showSeeAll && (
          <Pressable
            onPress={onSeeAll}
            className="flex-row items-center"
          >
            <Text className="mr-1 font-semibold text-[#128A3A]">
              View all
            </Text>

            <Ionicons
              name="chevron-forward"
              size={16}
              color="#128A3A"
            />
          </Pressable>
        )}
      </View>

      {/* Horizontal product shelf */}
      <FlatList
        data={fruits}
        horizontal
        keyExtractor={(fruit) => fruit.id}
        renderItem={renderFruit}
        ItemSeparatorComponent={() => <View className="w-3.5" />}
        showsHorizontalScrollIndicator={false}
        initialNumToRender={4}
        maxToRenderPerBatch={4}
        updateCellsBatchingPeriod={50}
        windowSize={3}
        removeClippedSubviews
        getItemLayout={(_data, index) => ({
          length: 179,
          offset: 179 * index,
          index,
        })}
        contentContainerStyle={{
          paddingHorizontal: 4,
          paddingRight: 20,
        }}
      />
    </View>
  );
}
