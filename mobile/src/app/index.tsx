import CreditBanner from "@/features/returns/CreditBanner";
import { Text, TextInput, View,ScrollView,  NativeScrollEvent,
  NativeSyntheticEvent, } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import OffersCarousel from "./component/promotionaCouracel";
import FruitCategories from "./component/fruitCard";
import SmoothieSection from "./component/smoohieCard";
import DeliverySection from "./component/deliverySection";
import Footer from "./component/footer";
import { useState,useRef } from "react";
import BottomNavigation from "./component/navBar";
import { useRouter } from "expo-router";

export default function Index() {

   const router = useRouter();
   const [showNavigation, setShowNavigation] = useState(true);

  const scrollTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleScroll = (
    _event: NativeSyntheticEvent<NativeScrollEvent>
  ) => {
    setShowNavigation(false);

    if (scrollTimeout.current) {
      clearTimeout(scrollTimeout.current);
    }

    scrollTimeout.current = setTimeout(() => {
      setShowNavigation(true);
    }, 100);
  };

  const goToShop = () => {
    router.push("/shop");
  };

  return (
     <View className="flex-1">
    <ScrollView className="flex-1 bg-[#FAFBF7]"
    showsVerticalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        contentContainerStyle={{
          paddingBottom: 50,
        }}
    >

      {/* ================= HEADER ================= */}
      <View className="rounded-b-[32px] bg-[#128A3A] px-5 pb-7 pt-10">

        {/* Brand */}
        <View className="items-center">

          {/* Logo mark */}
          <View className="mb-3 h-[86px] w-[86px] items-center justify-center overflow-hidden rounded-[28px] bg-white/95">
            <Image
              source={require("@/assets/logo/logo.png")}
              contentFit="contain"
              style={{ width: 78, height: 78 }}
            />
          </View>

          <Text className="text-4xl font-extrabold tracking-tight text-white">
            Cimess
            <Text className="text-[#FACC15]">Fruit</Text>
          </Text>

          <Text className="mt-1 text-sm font-medium text-white/60">
            Fresh fruits. Delivered fresh.
          </Text>

        </View>

        {/* Search */}
        <View className="mt-7 h-14 flex-row items-center rounded-2xl bg-white px-4 shadow-lg">

          <Ionicons
            name="search-outline"
            size={23}
            color="#128A3A"
          />

          <TextInput
            placeholder="What fruit are you looking for?"
            placeholderTextColor="#9CA3AF"
            className="ml-3 flex-1 text-[15px] text-gray-900"
            returnKeyType="search"
            onFocus={goToShop}
            onSubmitEditing={goToShop}
          />


        </View>

      </View>


      <CreditBanner />
      {/* ================= CONTENT ================= */}
      <View className="flex-1 ">

        {/* Offers */}
        <View className="mt-5 mx-2">
          <OffersCarousel onSeeAll={goToShop} onShopNow={goToShop} />
        </View>

        {/* Fruits */}
        <View className="my-2 mx-2">
          <FruitCategories onSeeAll={goToShop} onViewOptions={goToShop} />
        </View>

        {/* Smoothies */}
        <View className="my-2">
          <SmoothieSection onPress={goToShop} />
        </View>

        {/* Delivery */}
        <View className="my-2 mx-2">
          <DeliverySection onPress={goToShop} />
        </View>

        <Footer />
       

      </View>

    </ScrollView>
    <BottomNavigation visible={showNavigation}/>
    </View>
  );
}
