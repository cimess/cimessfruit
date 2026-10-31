import CurrentPhoto from "@/features/shop/CurrentPhoto";
import CreditBanner from "@/features/returns/CreditBanner";
import { useProductBrowse } from "@/features/shop/useProductBrowse";
import { openWhatsAppSupport } from "@/features/chat/whatsapp";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { Stack, useRouter } from "expo-router";
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  FlatList,
  Keyboard,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import BottomNavigation from "@/app/component/navBar";
import { useCartStore } from "@/features/cart/store";
import { shopOperations } from "@/features/shop/catalog";
import type {
  FruitFilterKey,
  ProductCategory,
  ProductOption,
  ShopProduct,
  SortKey,
} from "@/features/shop/types";
import { formatNaira } from "@/lib/currency";

type FilterItem = {
  id: ProductCategory;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
};

type FruitFilterItem = {
  id: FruitFilterKey;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
};

type SortItem = {
  id: SortKey;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
};

type SmoothieBlendState = {
  visible: boolean;
  available: boolean;
  title: string;
  description: string;
  price: number;
};

const filters: FilterItem[] = [
  { id: "fruit", label: "Fruit", icon: "nutrition-outline" },
  { id: "plantain", label: "Plantain", icon: "leaf-outline" },
  { id: "smoothie", label: "Smoothie", icon: "color-fill-outline" },
];

const fruitFilters: FruitFilterItem[] = [
  { id: "all", label: "All fruit", icon: "grid-outline" },
  { id: "grapes", label: "Grapes", icon: "radio-button-on-outline" },
  { id: "tangerine", label: "Tangerine", icon: "sunny-outline" },
  { id: "pineapple", label: "Pineapple", icon: "sparkles-outline" },
  { id: "apple", label: "Apple", icon: "ellipse-outline" },
];

const sorts: SortItem[] = [
  { id: "newest", label: "Newest", icon: "time-outline" },
  { id: "price-asc", label: "Low price", icon: "arrow-down-outline" },
  { id: "price-desc", label: "High price", icon: "arrow-up-outline" },
  { id: "name", label: "A-Z", icon: "text-outline" },
];

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

function getStartingOption(product: ShopProduct) {
  return product.options.reduce((lowest, option) =>
    option.price < lowest.price ? option : lowest
  );
}

function getOptionSummary(product: ShopProduct) {
  return product.options
    .map((option) =>
      product.measureType === "weight"
        ? `${option.label} ${option.detail}`
        : option.label
    )
    .join(" • ");
}

export default function Shop() {

  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [query, setQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<ProductCategory>("fruit");
  const [activeFruitFilter, setActiveFruitFilter] =
    useState<FruitFilterKey>("all");
  const [sortKey, setSortKey] = useState<SortKey>("newest");
  const [showNavigation, setShowNavigation] = useState(true);
  const [selectedProduct, setSelectedProduct] = useState<ShopProduct | null>(
    null
  );
  const [isCartVisible, setIsCartVisible] = useState(false);
  const scrollTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const productList = useRef<FlatList<ShopProduct>>(null);

  useEffect(() => {
    productList.current?.scrollToOffset({ offset: 0, animated: false });
  }, [activeFilter, activeFruitFilter, sortKey, query]);

  const cartItems = useCartStore((state) => state.items);
  const customSmoothieRequested = useCartStore(
    (state) => state.customSmoothieRequested
  );
  const customSmoothiePrice = useCartStore(
    (state) => state.customSmoothiePrice
  );
  const addSelection = useCartStore((state) => state.addSelection);
  const setCustomSmoothieRequested = useCartStore(
    (state) => state.setCustomSmoothieRequested
  );
  const totalItems = useCartStore((state) => state.getTotalItems());
  const totalAmount = useCartStore((state) => state.getTotalAmount());

  const cardGap = 12;
  const horizontalPadding = 18;
  const cardWidth = Math.floor((width - horizontalPadding * 2 - cardGap) / 2);

  const productQuantities = useMemo(() => {
    return Object.values(cartItems).reduce<Record<string, number>>(
      (totals, item) => {
        totals[item.productId] = (totals[item.productId] ?? 0) + item.quantity;
        return totals;
      },
      {}
    );
  }, [cartItems]);

  const smoothieBlendState = useMemo<SmoothieBlendState>(() => {
    const selectedItems = Object.values(cartItems);
    const canBlendSelection =
      selectedItems.length > 0 &&
      selectedItems.every(
        (item) => item.category === "fruit" && item.canBeBlended
      );

    if (!canBlendSelection) {
      return {
        visible: false,
        available: false,
        title: "",
        description: "",
        price: 0,
      };
    }

    if (!shopOperations.smoothieBlenderAvailable) {
      return {
        visible: true,
        available: false,
        title: "Smoothie bar is closed",
        description:
          "Sorry, we are not accepting smoothie orders right now.",
        price: shopOperations.customSmoothiePrice,
      };
    }

    return {
      visible: true,
      available: true,
      title: "Blend My Fruit Mix",
      description: `Turn these fruits into your own fresh custom smoothie for ${formatNaira(
        shopOperations.customSmoothiePrice
      )}.`,
      price: shopOperations.customSmoothiePrice,
    };
  }, [cartItems]);

  const needsTallCartBar = totalItems > 0 && smoothieBlendState.visible;

  const browse = useProductBrowse({
    category: activeFilter,
    search: query,
    sort: sortKey,
    fruitFilter: activeFilter === "fruit" ? activeFruitFilter : "all",
  });

  const catalogError = browse.error;

  useEffect(() => {
    return () => {
      if (scrollTimeout.current) {
        clearTimeout(scrollTimeout.current);
      }
    };
  }, []);

  useEffect(() => {
    if (
      customSmoothieRequested &&
      (!smoothieBlendState.visible || !smoothieBlendState.available)
    ) {
      setCustomSmoothieRequested(false);
    }
  }, [
    customSmoothieRequested,
    setCustomSmoothieRequested,
    smoothieBlendState.available,
    smoothieBlendState.visible,
  ]);

  const handleScroll = (_event: NativeSyntheticEvent<NativeScrollEvent>) => {
    setShowNavigation(false);

    if (scrollTimeout.current) {
      clearTimeout(scrollTimeout.current);
    }

    scrollTimeout.current = setTimeout(() => {
      setShowNavigation(true);
    }, 180);
  };

  const closeProductSheet = useCallback(() => {
    setSelectedProduct(null);
  }, []);

  const handleAddSelection = useCallback(
    (product: ShopProduct, option: ProductOption, quantity: number) => {
      setSelectedProduct(null);

      requestAnimationFrame(() => {
        addSelection(product, option, quantity);
      });
    },
    [addSelection]
  );

  const handleOpenProduct = useCallback((product: ShopProduct) => {
    setSelectedProduct(product);
  }, []);

  const handleChangeFilter = useCallback((filter: ProductCategory) => {
    setActiveFilter(filter);

    if (filter !== "fruit") {
      setActiveFruitFilter("all");
    }
  }, []);

  const handleCheckout = useCallback(() => {
    setIsCartVisible(false);
    router.push("/checkout");
  }, [router]);

  const handleViewCart = useCallback(() => {
    setIsCartVisible(true);
  }, []);

  const handleCloseCart = useCallback(() => {
    setIsCartVisible(false);
  }, []);

  const handleNegotiate = useCallback((product: ShopProduct) => {
    setSelectedProduct(null);
    void openWhatsAppSupport({ productName: product.name });
  }, []);

  const handleBlendFruitMix = useCallback(
    (blendState: SmoothieBlendState) => {
      if (!blendState.available) {
        Alert.alert(blendState.title, blendState.description);
        return;
      }

      setCustomSmoothieRequested(true, blendState.price);
      Alert.alert(
        "Custom smoothie selected",
        `Nice choice. ${formatNaira(
          blendState.price
        )} has been added as the blending fee.`
      );
    },
    [setCustomSmoothieRequested]
  );

  const renderProduct = useCallback(
    ({ item, index }: { item: ShopProduct; index: number }) => (
      <MemoProductCard
        index={index}
        onNegotiateProduct={handleNegotiate}
        onOpenProduct={handleOpenProduct}
        product={item}
        quantity={productQuantities[item.id] ?? 0}
        width={cardWidth}
      />
    ),
    [cardWidth, handleNegotiate, handleOpenProduct, productQuantities]
  );

  return (
    <View className="flex-1 bg-[#FAFBF7]">
      <Stack.Screen options={{ headerShown: false }} />
      {catalogError ? <Text accessibilityRole="alert">{catalogError}</Text> : null}

      <FlatList
        ref={productList}
        data={browse.products}
        keyExtractor={(item) => item.id}
        numColumns={2}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        initialNumToRender={6}
        maxToRenderPerBatch={4}
        updateCellsBatchingPeriod={50}
        windowSize={5}
        removeClippedSubviews
        onScroll={handleScroll}
        scrollEventThrottle={16}
        columnWrapperStyle={{
          gap: cardGap,
          paddingHorizontal: horizontalPadding,
        }}
        contentContainerStyle={{
          paddingBottom: needsTallCartBar
            ? Math.max(insets.bottom + 282, 318)
            : Math.max(insets.bottom + 190, 226),
          gap: 14,
        }}
        ListHeaderComponent={
          <ShopHeader
            activeFilter={activeFilter}
            activeFruitFilter={activeFruitFilter}
            onChangeFilter={handleChangeFilter}
            onChangeFruitFilter={setActiveFruitFilter}
            onChangeQuery={setQuery}
            onChangeSort={setSortKey}
            query={query}
            resultCount={browse.total}
            sortKey={sortKey}
            topInset={insets.top}
          />
        }
        ListEmptyComponent={
          browse.loading ? (
            <ActivityIndicator style={{ padding: 24 }} />
          ) : catalogError ? undefined : (
            <EmptyState query={query} />
          )
        }
        renderItem={renderProduct}
        onEndReached={browse.loadMore}
        onEndReachedThreshold={0.4}
        refreshing={browse.fetching && !browse.loadingMore}
        onRefresh={browse.refresh}
        ListFooterComponent={
          browse.loadingMore ? (
            <ActivityIndicator style={{ padding: 20 }} />
          ) : catalogError ? (
            <Pressable onPress={browse.retry} style={{ padding: 20 }}>
              <Text>Could not load products. Tap to retry.</Text>
            </Pressable>
          ) : undefined
        }
      />

      <CartBar
        bottomInset={insets.bottom}
        customSmoothiePrice={customSmoothiePrice}
        customSmoothieRequested={customSmoothieRequested}
        onCheckout={handleCheckout}
        onBlendFruitMix={handleBlendFruitMix}
        onViewCart={handleViewCart}
        smoothieBlendState={smoothieBlendState}
        totalAmount={totalAmount}
        totalItems={totalItems}
      />

      <BottomNavigation visible={showNavigation && totalItems === 0} />

      <ProductOptionSheet
        bottomInset={insets.bottom}
        product={selectedProduct}
        smoothieBlenderAvailable={shopOperations.smoothieBlenderAvailable}
        visible={selectedProduct !== null}
        onClose={closeProductSheet}
        onNegotiate={handleNegotiate}
        onAdd={handleAddSelection}
      />

      <CartSheet
        bottomInset={insets.bottom}
        onCheckout={handleCheckout}
        onClose={handleCloseCart}
        visible={isCartVisible}
      />
    </View>
  );
}

function ShopHeader({
  activeFilter,
  activeFruitFilter,
  onChangeFilter,
  onChangeFruitFilter,
  onChangeQuery,
  onChangeSort,
  query,
  resultCount,
  sortKey,
  topInset,
}: {
  activeFilter: ProductCategory;
  activeFruitFilter: FruitFilterKey;
  onChangeFilter: (filter: ProductCategory) => void;
  onChangeFruitFilter: (filter: FruitFilterKey) => void;
  onChangeQuery: (query: string) => void;
  onChangeSort: (sort: SortKey) => void;
  query: string;
  resultCount: number;
  sortKey: SortKey;
  topInset: number;
}) {
  return (
    <View>
      <View
        className="overflow-hidden rounded-b-[34px] bg-[#128A3A] px-5 pb-6"
        style={{ paddingTop: topInset + 18 }}
      >
        <View className="flex-row items-start justify-between">
          <View className="flex-1 pr-4">
            <View className="mb-4 flex-row items-center self-start rounded-full bg-white/10 px-3 py-1.5">
              <View className="mr-2 h-2 w-2 rounded-full bg-[#FACC15]" />
              <Text className="text-xs font-extrabold text-white/80">
                MARKET OPEN
              </Text>
            </View>

            <Text
              className="text-[40px] font-extrabold leading-[43px] text-white"
              style={{ fontFamily: displayFont }}
            >
              Fresh picks{"\n"}for today
            </Text>

            <Text
              className="mt-3 max-w-[300px] text-[15px] leading-6 text-white/70"
              style={{ fontFamily: bodyFont }}
            >
              Browse hand-selected fruits, build your basket, and keep checkout
              ready.
            </Text>
          </View>

          <View className="items-center rounded-full bg-[#FACC15] px-3 py-3">
            <Ionicons name="storefront" size={24} color="#033035" />
          </View>
        </View>

        <View className="mt-6 flex-row items-center rounded-[24px] bg-white px-4 py-2.5">
          <Ionicons name="search-outline" size={22} color="#033035" />

          <TextInput
            value={query}
            maxLength={100}
            onChangeText={onChangeQuery}
            placeholder="Search fruit, plantain, smoothie..."
            placeholderTextColor="#8C948D"
            returnKeyType="search"
            onSubmitEditing={Keyboard.dismiss}
            className="ml-3 flex-1 text-[15px] text-gray-950"
            style={{ fontFamily: bodyFont }}
          />

          {query.length > 0 && (
            <Pressable
              onPress={() => onChangeQuery("")}
              className="h-8 w-8 items-center justify-center rounded-full bg-gray-100"
            >
              <Ionicons name="close" size={17} color="#033035" />
            </Pressable>
          )}
        </View>
      </View>

      <CreditBanner />
      <View className="px-[18px] pt-5">
        <View className="mb-3 flex-row items-center justify-between">
          <Text
            className="text-xl font-extrabold text-gray-950"
            style={{ fontFamily: displayFont }}
          >
            Shop
          </Text>

          <Text className="text-sm font-bold text-gray-500">
            {resultCount} items
          </Text>
        </View>

        <FlatList
          data={filters}
          keyExtractor={(item) => item.id}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 10, paddingRight: 20 }}
          renderItem={({ item }) => {
            const isActive = activeFilter === item.id;

            return (
              <Pressable
                onPress={() => onChangeFilter(item.id)}
                className={`flex-row items-center rounded-2xl border px-4 py-3 ${
                  isActive
                    ? "border-[#128A3A] bg-[#128A3A]"
                    : "border-black/5 bg-white"
                }`}
              >
                <Ionicons
                  name={item.icon}
                  size={17}
                  color={isActive ? "#FACC15" : "#033035"}
                />
                <Text
                  className={`ml-2 text-sm font-extrabold ${
                    isActive ? "text-white" : "text-gray-800"
                  }`}
                >
                  {item.label}
                </Text>
              </Pressable>
            );
          }}
        />

        {activeFilter === "fruit" && (
          <View className="mt-4">
            <View className="mb-2 flex-row items-center justify-between px-1">
              <Text className="text-xs font-extrabold uppercase text-gray-400">
                Fruit filter
              </Text>
              <Text className="text-xs font-bold text-gray-400">
                Grapes, tangerine, pineapple & apple
              </Text>
            </View>

            <FlatList
              data={fruitFilters}
              keyExtractor={(item) => item.id}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8, paddingRight: 20 }}
              renderItem={({ item }) => {
                const isActive = activeFruitFilter === item.id;

                return (
                  <Pressable
                    onPress={() => onChangeFruitFilter(item.id)}
                    className={`flex-row items-center rounded-2xl px-3 py-2.5 ${
                      isActive ? "bg-[#FACC15]" : "bg-white"
                    }`}
                  >
                    <Ionicons
                      name={item.icon}
                      size={15}
                      color="#033035"
                    />
                    <Text className="ml-1.5 text-xs font-extrabold text-[#033035]">
                      {item.label}
                    </Text>
                  </Pressable>
                );
              }}
            />
          </View>
        )}

        <View className="mt-4 rounded-[26px] bg-white p-3">
          <View className="mb-2 flex-row items-center justify-between px-1">
            <Text className="text-xs font-extrabold uppercase text-gray-400">
              Sort style
            </Text>
            <Ionicons name="options-outline" size={18} color="#033035" />
          </View>

          <View className="flex-row flex-wrap gap-2">
            {sorts.map((item) => {
              const isActive = sortKey === item.id;

              return (
                <Pressable
                  key={item.id}
                  onPress={() => onChangeSort(item.id)}
                  className={`flex-row items-center rounded-2xl px-3 py-2 ${
                    isActive ? "bg-[#FACC15]" : "bg-[#FAFBF7]"
                  }`}
                >
                  <Ionicons name={item.icon} size={14} color="#033035" />
                  <Text className="ml-1.5 text-xs font-extrabold text-[#033035]">
                    {item.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>
    </View>
  );
}

const ProductCard = memo(function ProductCard({
  index,
  onNegotiateProduct,
  onOpenProduct,
  product,
  quantity,
  width,
}: {
  index: number;
  onNegotiateProduct: (product: ShopProduct) => void;
  onOpenProduct: (product: ShopProduct) => void;
  product: ShopProduct;
  quantity: number;
  width: number;
}) {
  const [entry] = useState(() => new Animated.Value(0));
  const isSoldOut =
    product.stock <= 0 || product.bundleOffer?.isAvailable === false;
  const startingOption = getStartingOption(product);
  const optionSummary = getOptionSummary(product);
  const bundleOffer = product.bundleOffer;
  const smoothieRecipe = product.smoothieRecipe;

  useEffect(() => {
    entry.setValue(0);

    Animated.timing(entry, {
      toValue: 1,
      duration: 420,
      delay: Math.min(index, 8) * 55,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [entry, index, product.id]);

  const translateY = entry.interpolate({
    inputRange: [0, 1],
    outputRange: [18, 0],
  });

  const scale = entry.interpolate({
    inputRange: [0, 1],
    outputRange: [0.96, 1],
  });

  return (
    <Animated.View
      style={{
        opacity: entry,
        transform: [{ translateY }, { scale }],
        width,
      }}
    >
      <Pressable
        onPress={() => onOpenProduct(product)}
        className="overflow-hidden rounded-[28px] bg-white"
        style={({ pressed }) => [
          {
            minHeight:
              bundleOffer && smoothieRecipe
                ? 450
                : bundleOffer || smoothieRecipe
                  ? product.canNegotiate
                    ? 432
                    : 392
                  : product.canNegotiate
                    ? 356
                    : 316,
            opacity: isSoldOut ? 0.72 : 1,
            shadowColor: "#062D2C",
            shadowOffset: { width: 0, height: 12 },
            shadowOpacity: 0.08,
            shadowRadius: 18,
            elevation: 4,
            transform: [{ scale: pressed ? 0.985 : 1 }],
          },
        ]}
      >
        <View
          className="relative m-2 h-[136px] items-center justify-center overflow-hidden rounded-[24px]"
          style={{ backgroundColor: product.accent }}
        >
          <Image
            source={product.image}
            contentFit="contain"
            cachePolicy="memory-disk"
            recyclingKey={product.id}
            style={{ width: "88%", height: "88%" }}
          />

          {product.badge && (
            <View className="absolute left-2 top-2 rounded-full bg-white/95 px-2.5 py-1.5">
              <Text className="text-[10px] font-extrabold text-[#033035]">
                {product.badge}
              </Text>
            </View>
          )}

          {bundleOffer && (
            <View
              className={`absolute right-2 top-2 rounded-full px-2.5 py-1.5 ${
                bundleOffer.isAvailable ? "bg-emerald-50" : "bg-red-50"
              }`}
            >
              <Text
                className={`text-[10px] font-extrabold ${
                  bundleOffer.isAvailable ? "text-emerald-700" : "text-red-700"
                }`}
              >
                {bundleOffer.isAvailable ? "Available" : "Unavailable"}
              </Text>
            </View>
          )}

          <View className="absolute bottom-2 right-2 flex-row items-center rounded-full bg-[#128A3A] px-2.5 py-1.5">
            <Ionicons name="star" size={11} color="#FACC15" />
            <Text className="ml-1 text-[10px] font-extrabold text-white">
              {product.rating.toFixed(1)}
            </Text>
          </View>

          {product.category === "fruit" && product.canBeBlended && (
            <View className="absolute bottom-2 left-2 flex-row items-center rounded-full bg-white/95 px-2.5 py-1.5">
              <Ionicons name="color-fill-outline" size={11} color="#033035" />
              <Text className="ml-1 text-[10px] font-extrabold text-[#033035]">
                Smoothie-ready
              </Text>
            </View>
          )}
        </View>

        <View className="px-3 pb-3 pt-1">
          <Text
            numberOfLines={1}
            className="text-[16px] font-extrabold text-gray-950"
            style={{ fontFamily: displayFont }}
          >
            {product.name}
          </Text>
          {product.batchArrivedAt && <Text className="text-xs text-gray-500">Batch added: {new Date(product.batchArrivedAt).toLocaleString()}</Text>}
          <CurrentPhoto id={product.id} name={product.name} />

          <Text
            numberOfLines={1}
            className="mt-1 text-xs font-medium text-gray-500"
            style={{ fontFamily: bodyFont }}
          >
            {product.subtitle}
          </Text>

          {bundleOffer && (
            <View className="mt-3 rounded-2xl bg-[#FFF6D9] px-2.5 py-2">
              <View className="flex-row items-center justify-between">
                <Text
                  numberOfLines={1}
                  className="flex-1 pr-2 text-[11px] font-extrabold text-[#033035]"
                >
                  {bundleOffer.name}
                </Text>
                <View className="rounded-full bg-emerald-100 px-1.5 py-0.5">
                  <Text className="text-[10px] font-extrabold text-emerald-800">
                    {bundleOffer.discountPercent}% off
                  </Text>
                </View>
              </View>
              <Text
                numberOfLines={1}
                className="mt-1 text-[10px] font-bold text-gray-500"
              >
                {bundleOffer.sizeLabel} · {bundleOffer.tag}
              </Text>
            </View>
          )}

          {smoothieRecipe && (
            <View className="mt-3 rounded-2xl bg-[#EAF7F0] px-2.5 py-2">
              <View className="flex-row items-center justify-between">
                <Text
                  numberOfLines={1}
                  className="flex-1 pr-1 text-[11px] font-extrabold text-[#033035]"
                >
                  {smoothieRecipe.name}
                </Text>
                <Text className="text-[10px] font-bold text-[#033035]/60">
                  {smoothieRecipe.sizeLabel}
                </Text>
              </View>
              <Text
                numberOfLines={1}
                className="mt-1 text-[10px] font-bold text-emerald-800"
              >
                Blended: {smoothieRecipe.fruits.join(", ")}
              </Text>
            </View>
          )}

          <View className="mt-3 rounded-2xl bg-[#FAFBF7] px-2.5 py-2">
            <Text className="text-[10px] font-extrabold uppercase text-gray-400">
              {product.measureType === "weight" ? "Weight" : "Size"}
            </Text>
            <Text
              numberOfLines={1}
              className="mt-1 text-[11px] font-extrabold text-[#033035]"
            >
              {optionSummary}
            </Text>
          </View>

          <View className="mt-3 flex-row items-end justify-between">
            <View className="flex-1">
              {bundleOffer ? (
                <View>
                  <View className="flex-row items-baseline gap-1.5">
                    <Text className="text-[17px] font-extrabold text-[#033035]">
                      {formatNaira(bundleOffer.price)}
                    </Text>
                    <Text
                      className="text-xs font-semibold text-gray-400"
                      style={{ textDecorationLine: "line-through" }}
                    >
                      {formatNaira(bundleOffer.compareAtPrice)}
                    </Text>
                  </View>
                  <Text className="text-[10px] font-bold text-emerald-700">
                    Bundle price ({bundleOffer.discountPercent}% discount)
                  </Text>
                </View>
              ) : (
                <View>
                  <Text className="text-[17px] font-extrabold text-[#033035]">
                    From {formatNaira(startingOption.price)}
                  </Text>
                  <Text className="text-[11px] font-semibold text-gray-400">
                    {startingOption.label} · {startingOption.detail}
                  </Text>
                </View>
              )}
            </View>
          </View>

          <View className="mt-3 flex-row items-center justify-between">
            <View className="flex-row items-center">
              <View
                className={`mr-1.5 h-2 w-2 rounded-full ${
                  isSoldOut
                    ? "bg-red-500"
                    : product.stock > 6
                      ? "bg-emerald-500"
                      : "bg-amber-400"
                }`}
              />
              <Text className="text-[11px] font-bold text-gray-500">
                {isSoldOut
                  ? "Unavailable"
                  : product.stock > 6
                    ? "In stock"
                    : `${product.stock} left`}
              </Text>
            </View>

            <View className="flex-row items-center rounded-2xl bg-[#FACC15] px-3 py-2">
              {quantity > 0 && (
                <View className="mr-2 h-5 min-w-5 items-center justify-center rounded-full bg-[#128A3A] px-1">
                  <Text className="text-[10px] font-extrabold text-white">
                    {quantity}
                  </Text>
                </View>
              )}
              <Text className="mr-1.5 text-xs font-extrabold text-[#033035]">
                {isSoldOut ? "Unavailable" : "Choose"}
              </Text>
              <Ionicons
                name={isSoldOut ? "close-circle" : "chevron-forward"}
                size={14}
                color="#033035"
              />
            </View>
          </View>

          {product.canNegotiate && (
            <Pressable
              onPress={(event) => {
                event.stopPropagation();
                onNegotiateProduct(product);
              }}
              className="mt-3 flex-row items-center justify-center rounded-2xl border border-[#128A3A]/10 bg-[#128A3A]/5 px-3 py-2.5"
            >
              <Ionicons
                name="chatbubble-ellipses-outline"
                size={15}
                color="#033035"
              />
              <Text className="ml-2 text-xs font-extrabold text-[#033035]">
                Chat / negotiate
              </Text>
            </Pressable>
          )}
        </View>
      </Pressable>
    </Animated.View>
  );
});

const MemoProductCard = ProductCard;

function ProductOptionSheet({
  bottomInset,
  onAdd,
  onClose,
  onNegotiate,
  product,
  smoothieBlenderAvailable,
  visible,
}: {
  bottomInset: number;
  onAdd: (
    product: ShopProduct,
    option: ProductOption,
    quantity: number
  ) => void;
  onClose: () => void;
  onNegotiate: (product: ShopProduct) => void;
  product: ShopProduct | null;
  smoothieBlenderAvailable: boolean;
  visible: boolean;
}) {
  const [selectedOptionId, setSelectedOptionId] =
    useState<ProductOption["id"]>("medium");
  const [quantity, setQuantity] = useState(1);
  const [isAdding, setIsAdding] = useState(false);
  const [slide] = useState(() => new Animated.Value(0));

  const selectedOption = useMemo(() => {
    if (!product) {
      return null;
    }

    return (
      product.options.find((option) => option.id === selectedOptionId) ??
      product.options[0]
    );
  }, [product, selectedOptionId]);

  useEffect(() => {
    if (!product) {
      return;
    }

    const defaultOption =
      product.options.find((option) => option.id === "medium") ??
      product.options[0];

    // Synchronize selection when the external product selection changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedOptionId(defaultOption.id);
    setQuantity(1);
    setIsAdding(false);
  }, [product]);

  useEffect(() => {
    Animated.spring(slide, {
      toValue: visible ? 1 : 0,
      useNativeDriver: true,
      damping: 20,
      stiffness: 180,
      mass: 0.9,
    }).start();
  }, [slide, visible]);

  if (!product || !selectedOption) {
    return null;
  }

  const translateY = slide.interpolate({
    inputRange: [0, 1],
    outputRange: [44, 0],
  });

  const total = selectedOption.price * quantity;
  const optionMode = product.measureType === "weight" ? "Weight" : "Size";
  const bundleOffer = product.bundleOffer;
  const smoothieRecipe = product.smoothieRecipe;
  const smoothieUnavailable =
    product.category === "smoothie" && !smoothieBlenderAvailable;
  const stockUnavailable = (selectedOption.stock ?? product.stock) <= 0;
  const bundleUnavailable = bundleOffer?.isAvailable === false;
  const productUnavailable =
    smoothieUnavailable || stockUnavailable || bundleUnavailable;

  return (
    <Modal
      animationType="fade"
      transparent
      visible={visible}
      onRequestClose={onClose}
    >
      <View className="flex-1 justify-end">
        <Pressable
          className="absolute inset-0 bg-black/45"
          onPress={onClose}
        />

        <Animated.View
          className="overflow-hidden rounded-t-[34px] bg-[#FAFBF7]"
          style={{
            maxHeight: "92%",
            paddingBottom: Math.max(bottomInset, 14),
            transform: [{ translateY }],
          }}
        >
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 0 }}
          >
            <View className="px-5 pb-5 pt-4">
            <View className="mb-4 flex-row items-center justify-between">
              <View>
                <Text
                  className="text-2xl font-extrabold text-gray-950"
                  style={{ fontFamily: displayFont }}
                >
                  {product.name}
                </Text>
                <Text className="mt-1 text-sm font-semibold text-gray-500">
                  {product.subtitle}
                </Text>

                {product.canNegotiate && (
                  <View className="mt-2 flex-row items-center self-start rounded-full bg-[#FACC15]/30 px-3 py-1">
                    <Ionicons
                      name="checkmark-circle"
                      size={13}
                      color="#033035"
                    />
                    <Text className="ml-1.5 text-[11px] font-extrabold text-[#033035]">
                      Negotiable
                    </Text>
                  </View>
                )}

                {product.category === "fruit" && product.canBeBlended && (
                  <View className="mt-2 flex-row items-center self-start rounded-full bg-[#128A3A]/10 px-3 py-1">
                    <Ionicons
                      name="color-fill-outline"
                      size={13}
                      color="#033035"
                    />
                    <Text className="ml-1.5 text-[11px] font-extrabold text-[#033035]">
                      Can blend into smoothie
                    </Text>
                  </View>
                )}

                {bundleOffer && (
                  <View className="mt-2 flex-row items-center self-start rounded-full bg-[#FACC15]/35 px-3 py-1">
                    <Ionicons
                      name="pricetag-outline"
                      size={13}
                      color="#033035"
                    />
                    <Text className="ml-1.5 text-[11px] font-extrabold text-[#033035]">
                      {bundleOffer.discountPercent}% bundle discount
                    </Text>
                  </View>
                )}

                {smoothieRecipe && (
                  <View className="mt-2 flex-row items-center self-start rounded-full bg-[#128A3A]/10 px-3 py-1">
                    <Ionicons
                      name="leaf-outline"
                      size={13}
                      color="#033035"
                    />
                    <Text className="ml-1.5 text-[11px] font-extrabold text-[#033035]">
                      {smoothieRecipe.blendNote}
                    </Text>
                  </View>
                )}
              </View>

              <Pressable
                onPress={onClose}
                className="h-10 w-10 items-center justify-center rounded-full bg-white"
              >
                <Ionicons name="close" size={20} color="#033035" />
              </Pressable>
            </View>

            {smoothieUnavailable && (
              <View className="mt-4 flex-row rounded-[22px] bg-red-50 px-4 py-3.5">
                <Ionicons
                  name="alert-circle-outline"
                  size={19}
                  color="#B42318"
                />
                <Text className="ml-2 flex-1 text-sm font-bold leading-5 text-red-700">
                  Sorry, the smoothie blender is unavailable. We are not
                  accepting smoothie orders right now.
                </Text>
              </View>
            )}

            {stockUnavailable && !smoothieUnavailable && (
              <View className="mt-4 flex-row rounded-[22px] bg-red-50 px-4 py-3.5">
                <Ionicons
                  name="alert-circle-outline"
                  size={19}
                  color="#B42318"
                />
                <Text className="ml-2 flex-1 text-sm font-bold leading-5 text-red-700">
                  This item is out of stock right now.
                </Text>
              </View>
            )}

            {bundleUnavailable && !stockUnavailable && !smoothieUnavailable && (
              <View className="mt-4 flex-row rounded-[22px] bg-red-50 px-4 py-3.5">
                <Ionicons
                  name="alert-circle-outline"
                  size={19}
                  color="#B42318"
                />
                <Text className="ml-2 flex-1 text-sm font-bold leading-5 text-red-700">
                  {bundleOffer?.tag
                    ? `This bundle is currently unavailable: ${bundleOffer.tag}.`
                    : "This bundle is not available right now."}
                </Text>
              </View>
            )}

            <View className="flex-row rounded-[30px] bg-white p-3">
              <View
                className="h-[150px] w-[132px] items-center justify-center rounded-[24px]"
                style={{ backgroundColor: product.accent }}
              >
                <Image
                  source={selectedOption.image}
                  contentFit="contain"
                  cachePolicy="memory-disk"
                  recyclingKey={`${product.id}-${selectedOption.id}`}
                  style={{ width: "90%", height: "90%" }}
                />
              </View>

              <View className="flex-1 pl-4">
                <View className="self-start rounded-full bg-[#128A3A] px-3 py-1.5">
                  <Text className="text-[11px] font-extrabold text-white">
                    {optionMode}
                  </Text>
                </View>

                <Text
                  className="mt-3 text-[28px] font-extrabold text-[#033035]"
                  style={{ fontFamily: displayFont }}
                >
                  {formatNaira(selectedOption.price)}
                </Text>

                <Text className="mt-1 text-sm font-bold text-gray-500">
                  {selectedOption.label} · {selectedOption.detail}
                </Text>

                <View className="mt-4 flex-row items-center self-start rounded-full bg-[#FAFBF7] p-1">
                  <Pressable
                    onPress={() => setQuantity((current) => Math.max(1, current - 1))}
                    className="h-9 w-9 items-center justify-center rounded-full bg-white"
                  >
                    <Ionicons name="remove" size={17} color="#033035" />
                  </Pressable>

                  <Text className="min-w-10 text-center text-base font-extrabold text-[#033035]">
                    {quantity}
                  </Text>

                  <Pressable
                    onPress={() =>
                      setQuantity((current) => Math.min(selectedOption.stock ?? product.stock, current + 1))
                    }
                    className="h-9 w-9 items-center justify-center rounded-full bg-[#FACC15]"
                  >
                    <Ionicons name="add" size={17} color="#033035" />
                  </Pressable>
                </View>
              </View>
            </View>

            {bundleOffer && (
              <View className="mt-4 rounded-[26px] bg-[#FFF6D9] p-4">
                <View className="flex-row items-start justify-between">
                  <View className="flex-1 pr-3">
                    <Text className="text-base font-extrabold text-[#033035]">
                      {bundleOffer.name}
                    </Text>
                    <Text className="mt-1 text-sm font-bold text-[#033035]/65">
                      {bundleOffer.sizeLabel}
                    </Text>
                  </View>

                  <View
                    className={`rounded-full px-2.5 py-1 ${
                      bundleOffer.isAvailable ? "bg-emerald-50" : "bg-red-50"
                    }`}
                  >
                    <Text
                      className={`text-[10px] font-extrabold ${
                        bundleOffer.isAvailable
                          ? "text-emerald-700"
                          : "text-red-700"
                      }`}
                    >
                      {bundleOffer.isAvailable ? "Available" : "Unavailable"}
                    </Text>
                  </View>
                </View>

                <View className="mt-3 flex-row flex-wrap gap-2">
                  {bundleOffer.fruits.map((fruit) => (
                    <View
                      key={fruit}
                      className="rounded-full bg-white/75 px-3 py-1.5"
                    >
                      <Text className="text-[11px] font-extrabold text-[#033035]">
                        {fruit}
                      </Text>
                    </View>
                  ))}
                </View>

                <View className="mt-4 flex-row items-end justify-between">
                  <View>
                    <Text className="text-[11px] font-extrabold uppercase text-[#033035]/45">
                      Bundle price
                    </Text>
                    <View className="mt-1 flex-row items-center">
                      <Text className="text-xl font-extrabold text-[#033035]">
                        {formatNaira(bundleOffer.price)}
                      </Text>
                      <Text
                        className="ml-2 text-xs font-bold text-[#033035]/45"
                        style={{ textDecorationLine: "line-through" }}
                      >
                        {formatNaira(bundleOffer.compareAtPrice)}
                      </Text>
                    </View>
                  </View>

                  <View className="rounded-full bg-[#128A3A] px-3 py-1.5">
                    <Text className="text-xs font-extrabold text-[#FACC15]">
                      Save {bundleOffer.discountPercent}%
                    </Text>
                  </View>
                </View>
              </View>
            )}

            {smoothieRecipe && (
              <View className="mt-4 rounded-[26px] bg-[#EAF7F0] p-4">
                <View className="flex-row items-start">
                  <View className="mr-3 h-10 w-10 items-center justify-center rounded-2xl bg-[#128A3A]">
                    <Ionicons
                      name="color-fill-outline"
                      size={19}
                      color="#FACC15"
                    />
                  </View>

                  <View className="flex-1">
                    <Text className="text-base font-extrabold text-[#033035]">
                      {smoothieRecipe.name}
                    </Text>
                    <Text className="mt-1 text-sm font-bold text-[#033035]/65">
                      {smoothieRecipe.sizeLabel}
                    </Text>
                  </View>
                </View>

                <View className="mt-3 flex-row flex-wrap gap-2">
                  {smoothieRecipe.fruits.map((fruit) => (
                    <View
                      key={fruit}
                      className="rounded-full bg-white px-3 py-1.5"
                    >
                      <Text className="text-[11px] font-extrabold text-[#033035]">
                        {fruit}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {product.canNegotiate && (
              <Pressable
                onPress={() => onNegotiate(product)}
                className="mt-4 flex-row items-center justify-center rounded-[22px] border border-[#128A3A]/10 bg-white px-4 py-3.5"
              >
                <Ionicons
                  name="chatbubble-ellipses-outline"
                  size={18}
                  color="#033035"
                />
                <Text className="ml-2 text-sm font-extrabold text-[#033035]">
                  Chat / negotiate price
                </Text>
              </Pressable>
            )}

            <View className="mt-5">
              <Text className="mb-3 text-xs font-extrabold uppercase text-gray-400">
                Choose {optionMode.toLowerCase()}
              </Text>

              <View className="flex-row gap-2">
                {product.options.map((option) => {
                  const isActive = selectedOption.id === option.id;

                  return (
                    <Pressable
                      key={option.id}
                      onPress={() => setSelectedOptionId(option.id)}
                      className={`flex-1 rounded-[22px] border p-3 ${
                        isActive
                          ? "border-[#128A3A] bg-[#128A3A]"
                          : "border-black/5 bg-white"
                      }`}
                    >
                      <Text
                        className={`text-sm font-extrabold ${
                          isActive ? "text-white" : "text-gray-950"
                        }`}
                      >
                        {option.label}
                      </Text>

                      <Text
                        className={`mt-1 text-xs font-bold ${
                          isActive ? "text-white/65" : "text-gray-500"
                        }`}
                      >
                        {option.detail}
                      </Text>

                      <Text
                        className={`mt-3 text-sm font-extrabold ${
                          isActive ? "text-[#FACC15]" : "text-[#033035]"
                        }`}
                      >
                        {formatNaira(option.price)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View className="mt-5 flex-row items-center rounded-[26px] bg-[#128A3A] p-3">
              <View className="flex-1">
                <Text className="text-xs font-bold text-white/55">
                  Total price
                </Text>
                <Text className="text-xl font-extrabold text-white">
                  {formatNaira(total)}
                </Text>
              </View>

              <Pressable
                disabled={isAdding || productUnavailable}
                onPress={() => {
                  setIsAdding(true);
                  onAdd(product, selectedOption, quantity);
                }}
                className={`flex-row items-center rounded-2xl px-5 py-3.5 ${
                  isAdding || productUnavailable
                    ? "bg-white/35"
                    : "bg-[#FACC15]"
                }`}
              >
                <Ionicons
                  name={
                    productUnavailable
                      ? "close-circle"
                      : isAdding
                        ? "checkmark-circle"
                        : "basket"
                  }
                  size={18}
                  color="#033035"
                />
                <Text className="ml-2 text-sm font-extrabold text-[#033035]">
                  {smoothieUnavailable
                    ? "Unavailable"
                    : stockUnavailable
                      ? "Out"
                    : bundleUnavailable
                      ? "Unavailable"
                    : isAdding
                      ? "Added"
                      : "Add"}
                </Text>
              </Pressable>
            </View>
            </View>
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

function CartBar({
  bottomInset,
  customSmoothiePrice,
  customSmoothieRequested,
  onBlendFruitMix,
  onCheckout,
  onViewCart,
  smoothieBlendState,
  totalAmount,
  totalItems,
}: {
  bottomInset: number;
  customSmoothiePrice: number;
  customSmoothieRequested: boolean;
  onBlendFruitMix: (blendState: SmoothieBlendState) => void;
  onCheckout: () => void;
  onViewCart: () => void;
  smoothieBlendState: SmoothieBlendState;
  totalAmount: number;
  totalItems: number;
}) {
  const [slide] = useState(() => new Animated.Value(totalItems > 0 ? 1 : 0));
  const activeBlendPrice =
    customSmoothieRequested && customSmoothiePrice > 0
      ? customSmoothiePrice
      : smoothieBlendState.price;
  const blendTitle = customSmoothieRequested
    ? "Custom Smoothie Selected"
    : smoothieBlendState.title;
  const blendDescription = customSmoothieRequested
    ? `We will blend these fruits into one fresh smoothie. Fee: ${formatNaira(
        activeBlendPrice
      )}.`
    : smoothieBlendState.description;

  useEffect(() => {
    Animated.spring(slide, {
      toValue: totalItems > 0 ? 1 : 0,
      useNativeDriver: true,
      damping: 18,
      stiffness: 180,
      mass: 0.8,
    }).start();
  }, [slide, totalItems]);

  const translateY = slide.interpolate({
    inputRange: [0, 1],
    outputRange: [smoothieBlendState.visible ? 238 : 166, 0],
  });

  return (
    <Animated.View
      pointerEvents={totalItems > 0 ? "auto" : "none"}
      style={{
        position: "absolute",
        left: 14,
        right: 14,
        bottom: Math.max(bottomInset, 12) + 6,
        opacity: slide,
        transform: [{ translateY }],
      }}
    >
      <View
        className="rounded-[28px] bg-[#128A3A] p-3"
        style={{
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 12 },
          shadowOpacity: 0.22,
          shadowRadius: 22,
          elevation: 12,
        }}
      >
        {smoothieBlendState.visible && (
          <Pressable
            onPress={() => onBlendFruitMix(smoothieBlendState)}
            className={`mb-3 flex-row items-center rounded-2xl px-3 py-3 ${
              smoothieBlendState.available ? "bg-[#FACC15]" : "bg-white/10"
            }`}
          >
            <View
              className={`mr-3 h-9 w-9 items-center justify-center rounded-full ${
                smoothieBlendState.available ? "bg-[#128A3A]" : "bg-red-500/20"
              }`}
            >
              <Ionicons
                name={
                  customSmoothieRequested
                    ? "checkmark-circle"
                    : smoothieBlendState.available
                    ? "color-fill-outline"
                    : "alert-circle-outline"
                }
                size={18}
                color={smoothieBlendState.available ? "#FACC15" : "#FCA5A5"}
              />
            </View>

            <View className="flex-1 pr-2">
              <Text
                numberOfLines={1}
                className={`text-sm font-extrabold ${
                  smoothieBlendState.available ? "text-[#033035]" : "text-white"
                }`}
              >
                {blendTitle}
              </Text>
              <Text
                numberOfLines={2}
                className={`mt-0.5 text-xs font-semibold leading-4 ${
                  smoothieBlendState.available
                    ? "text-[#033035]/70"
                    : "text-white/60"
                }`}
              >
                {blendDescription}
              </Text>
            </View>

            <Ionicons
              name={
                smoothieBlendState.available
                  ? "chevron-forward"
                  : "information-circle-outline"
              }
              size={18}
              color={smoothieBlendState.available ? "#033035" : "#FFFFFF"}
            />
            {smoothieBlendState.available && (
              <View className="ml-2 rounded-full bg-[#128A3A]/10 px-2.5 py-1">
                <Text className="text-xs font-extrabold text-[#033035]">
                  {formatNaira(activeBlendPrice)}
                </Text>
              </View>
            )}
          </Pressable>
        )}

        <View className="flex-row items-center">
          <View className="mr-3 h-12 w-12 items-center justify-center rounded-2xl bg-[#FACC15]">
            <Ionicons name="basket" size={24} color="#033035" />
          </View>

          <View className="flex-1">
            <Text className="text-xs font-bold text-white/55">
              {totalItems} {totalItems === 1 ? "item" : "items"} in basket
            </Text>
            <Text className="text-lg font-extrabold text-white">
              {formatNaira(totalAmount)}
            </Text>
          </View>
        </View>

        <View className="mt-3 flex-row gap-2">
          <Pressable
            onPress={onViewCart}
            className="flex-1 flex-row items-center justify-center rounded-2xl border border-white/10 bg-white/10 px-4 py-3"
          >
            <Ionicons name="list-outline" size={17} color="#FFFFFF" />
            <Text className="ml-2 text-sm font-extrabold text-white">
              View cart
            </Text>
          </Pressable>

          <Pressable
            onPress={onCheckout}
            className="flex-1 flex-row items-center justify-center rounded-2xl bg-white px-4 py-3"
          >
            <Text className="mr-2 text-sm font-extrabold text-[#033035]">
              Checkout
            </Text>
            <Ionicons name="arrow-forward" size={16} color="#033035" />
          </Pressable>
        </View>
      </View>
    </Animated.View>
  );
}

function CartSheet({
  bottomInset,
  onCheckout,
  onClose,
  visible,
}: {
  bottomInset: number;
  onCheckout: () => void;
  onClose: () => void;
  visible: boolean;
}) {
  const cartItems = useCartStore((state) => state.items);
  const customSmoothieRequested = useCartStore(
    (state) => state.customSmoothieRequested
  );
  const customSmoothiePrice = useCartStore(
    (state) => state.customSmoothiePrice
  );
  const decrement = useCartStore((state) => state.decrement);
  const increment = useCartStore((state) => state.increment);
  const removeItem = useCartStore((state) => state.removeItem);
  const clear = useCartStore((state) => state.clear);
  const setCustomSmoothieRequested = useCartStore(
    (state) => state.setCustomSmoothieRequested
  );
  const totalItems = useCartStore((state) => state.getTotalItems());
  const totalAmount = useCartStore((state) => state.getTotalAmount());
  const cartLines = useMemo(() => Object.values(cartItems), [cartItems]);
  const smoothieFee = customSmoothieRequested ? customSmoothiePrice : 0;
  const itemSubtotal = totalAmount - smoothieFee;
  const [slide] = useState(() => new Animated.Value(0));

  useEffect(() => {
    Animated.spring(slide, {
      toValue: visible ? 1 : 0,
      useNativeDriver: true,
      damping: 20,
      stiffness: 180,
      mass: 0.9,
    }).start();
  }, [slide, visible]);

  const translateY = slide.interpolate({
    inputRange: [0, 1],
    outputRange: [48, 0],
  });

  return (
    <Modal
      animationType="fade"
      transparent
      visible={visible}
      onRequestClose={onClose}
    >
      <View className="flex-1 justify-end">
        <Pressable className="absolute inset-0 bg-black/45" onPress={onClose} />

        <Animated.View
          className="overflow-hidden rounded-t-[34px] bg-[#FAFBF7]"
          style={{
            maxHeight: "86%",
            paddingBottom: Math.max(bottomInset, 14),
            transform: [{ translateY }],
          }}
        >
          <View className="px-5 pb-5 pt-4">
            <View className="mb-4 flex-row items-center justify-between">
              <View>
                <Text
                  className="text-2xl font-extrabold text-gray-950"
                  style={{ fontFamily: displayFont }}
                >
                  Your cart
                </Text>
                <Text className="mt-1 text-sm font-semibold text-gray-500">
                  {totalItems} {totalItems === 1 ? "item" : "items"} selected
                </Text>
              </View>

              <View className="flex-row items-center">
                {cartLines.length > 0 && (
                  <Pressable
                    onPress={clear}
                    className="mr-2 h-10 w-10 items-center justify-center rounded-full bg-red-50"
                  >
                    <Ionicons
                      name="trash-outline"
                      size={18}
                      color="#B42318"
                    />
                  </Pressable>
                )}

                <Pressable
                  onPress={onClose}
                  className="h-10 w-10 items-center justify-center rounded-full bg-white"
                >
                  <Ionicons name="close" size={20} color="#033035" />
                </Pressable>
              </View>
            </View>

            {cartLines.length === 0 ? (
              <View className="items-center rounded-[28px] bg-white px-6 py-10">
                <View className="mb-4 h-16 w-16 items-center justify-center rounded-full bg-[#FAFBF7]">
                  <Ionicons name="basket-outline" size={28} color="#033035" />
                </View>
                <Text className="text-center text-lg font-extrabold text-gray-950">
                  Cart is empty
                </Text>
                <Text className="mt-2 text-center text-sm leading-6 text-gray-500">
                  Add something fresh, then come back here to adjust it.
                </Text>
              </View>
            ) : (
              <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ gap: 12, paddingBottom: 8 }}
              >
                {cartLines.map((item) => (
                  <View
                    key={item.lineId}
                    className="rounded-[26px] bg-white p-3"
                  >
                    <View className="flex-row items-center">
                      <View className="mr-3 h-16 w-16 items-center justify-center overflow-hidden rounded-[22px] bg-[#FAFBF7]">
                        <Image
                          source={item.image}
                          contentFit="contain"
                          cachePolicy="memory-disk"
                          recyclingKey={`cart-${item.lineId}`}
                          style={{ width: "86%", height: "86%" }}
                        />
                      </View>

                      <View className="flex-1 pr-2">
                        <Text
                          numberOfLines={1}
                          className="text-base font-extrabold text-gray-950"
                        >
                          {item.name}
                        </Text>
                        <Text className="mt-1 text-xs font-bold text-gray-500">
                          {item.optionLabel} · {item.optionDetail}
                        </Text>
                        <Text className="mt-2 text-sm font-extrabold text-[#033035]">
                          {formatNaira(item.price * item.quantity)}
                        </Text>
                      </View>

                      <Pressable
                        onPress={() => removeItem(item.lineId)}
                        className="h-9 w-9 items-center justify-center rounded-full bg-red-50"
                      >
                        <Ionicons
                          name="trash-outline"
                          size={17}
                          color="#B42318"
                        />
                      </Pressable>
                    </View>

                    <View className="mt-3 flex-row items-center justify-between rounded-[22px] bg-[#FAFBF7] p-2">
                      <Text className="ml-2 text-xs font-bold text-gray-500">
                        Quantity
                      </Text>

                      <View className="flex-row items-center">
                        <Pressable
                          onPress={() => decrement(item.lineId)}
                          className="h-9 w-9 items-center justify-center rounded-full bg-white"
                        >
                          <Ionicons name="remove" size={17} color="#033035" />
                        </Pressable>

                        <Text className="min-w-10 text-center text-base font-extrabold text-[#033035]">
                          {item.quantity}
                        </Text>

                        <Pressable
                          onPress={() => increment(item.lineId)}
                          className="h-9 w-9 items-center justify-center rounded-full bg-[#FACC15]"
                        >
                          <Ionicons name="add" size={17} color="#033035" />
                        </Pressable>
                      </View>
                    </View>
                  </View>
                ))}

                {customSmoothieRequested && (
                  <View className="flex-row items-center rounded-[26px] bg-[#FACC15] p-3">
                    <View className="mr-3 h-12 w-12 items-center justify-center rounded-2xl bg-[#128A3A]">
                      <Ionicons
                        name="color-fill-outline"
                        size={21}
                        color="#FACC15"
                      />
                    </View>

                    <View className="flex-1">
                      <Text className="text-sm font-extrabold text-[#033035]">
                        Custom smoothie blend
                      </Text>
                      <Text className="mt-0.5 text-xs font-bold text-[#033035]/65">
                        Blend fee · {formatNaira(customSmoothiePrice)}
                      </Text>
                    </View>

                    <Pressable
                      onPress={() => setCustomSmoothieRequested(false)}
                      className="h-9 w-9 items-center justify-center rounded-full bg-white/80"
                    >
                      <Ionicons name="close" size={17} color="#033035" />
                    </Pressable>
                  </View>
                )}
              </ScrollView>
            )}

            <View className="mt-5 rounded-[26px] bg-[#128A3A] p-3">
              <View className="flex-row items-center justify-between">
                <Text className="text-sm font-bold text-white/55">
                  Items
                </Text>
                <Text className="text-sm font-extrabold text-white">
                  {formatNaira(itemSubtotal)}
                </Text>
              </View>

              {customSmoothieRequested && (
                <View className="mt-2 flex-row items-center justify-between">
                  <Text className="text-sm font-bold text-white/55">
                    Smoothie blend
                  </Text>
                  <Text className="text-sm font-extrabold text-white">
                    {formatNaira(smoothieFee)}
                  </Text>
                </View>
              )}

              <View className="my-3 h-px bg-white/10" />

              <View className="flex-row items-center justify-between">
                <Text className="text-sm font-bold text-white/55">
                  Basket total
                </Text>
                <Text className="text-xl font-extrabold text-white">
                  {formatNaira(totalAmount)}
                </Text>
              </View>

              <Pressable
                disabled={cartLines.length === 0}
                onPress={onCheckout}
                className={`mt-4 flex-row items-center justify-center rounded-2xl px-4 py-3.5 ${
                  cartLines.length === 0 ? "bg-white/25" : "bg-white"
                }`}
              >
                <Text className="mr-2 text-sm font-extrabold text-[#033035]">
                  Continue to checkout
                </Text>
                <Ionicons name="arrow-forward" size={16} color="#033035" />
              </Pressable>
            </View>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

function EmptyState({ query }: { query: string }) {
  return (
    <View className="mx-[18px] mt-8 items-center rounded-[28px] bg-white px-6 py-10">
      <View className="mb-4 h-16 w-16 items-center justify-center rounded-full bg-[#FAFBF7]">
        <Ionicons name="search" size={28} color="#033035" />
      </View>

      <Text className="text-center text-lg font-extrabold text-gray-950">
        No fruit found
      </Text>

      <Text className="mt-2 text-center text-sm leading-6 text-gray-500">
        {query
          ? `Try a simpler search for "${query}".`
          : "Try a different filter to see more fresh picks."}
      </Text>
    </View>
  );
}
