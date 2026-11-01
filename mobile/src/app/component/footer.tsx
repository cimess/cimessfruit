import { useRouter } from "expo-router";

import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { Alert, Linking, Pressable, Text, View } from "react-native";

export type FooterData = {
  brandName?: string;
  tagline?: string;

  location?: string;
  phone?: string;
  email?: string;

  tiktok?: string;

  links?: {
    shop?: string;
    smoothies?: string;
    about?: string;
    contact?: string;
    terms?: string;
    privacy?: string;
    refund?: string;
    delivery?: string;
  };
};

type FooterProps = {
  data?: FooterData;

  onShopPress?: () => void;
  onSmoothiesPress?: () => void;
  onAboutPress?: () => void;
  onContactPress?: () => void;

  onTermsPress?: () => void;
  onPrivacyPress?: () => void;
  onRefundPress?: () => void;
  onDeliveryPress?: () => void;

  onPhonePress?: () => void;
  onEmailPress?: () => void;
  onTikTokPress?: () => void;
};

const defaultData: FooterData = {
  brandName: "CimessFruit",
  tagline: "Fresh fruits. Freshly made.",

  location: "Abesan Estate, Mosan, Lagos",
  phone: "08089273565",
  email: "cimessthemanofvalor@gmail.com",

  tiktok: "cimessfruit",

  links: {
    shop: "Shop",
    smoothies: "Smoothies",
    about: "About Us",
    contact: "Contact",

    terms: "Terms & Conditions",
    privacy: "Privacy Policy",
    refund: "Refund Policy",
    delivery: "Delivery Policy",
  },
};

export default function Footer({
  data = defaultData,

  onShopPress,
  onSmoothiesPress,
  onAboutPress,
  onContactPress,

  onTermsPress,
  onPrivacyPress,
  onRefundPress,
  onDeliveryPress,

  onPhonePress,
  onEmailPress,
  onTikTokPress,
}: FooterProps) {
  const router = useRouter();
  const open = (url: string) => { void Linking.openURL(url).catch(() => Alert.alert("Unable to open link", "Please contact us using the phone number or email shown below.")); };
  const links = data.links ?? defaultData.links!;

  return (
    <View className="mt-10 overflow-hidden bg-[#128A3A]">

      {/* Main brand section */}
      <View className="px-6 pb-7 pt-8">

        {/* Brand */}
        <View className="flex-row items-center">
          <View className="h-12 w-12 items-center justify-center overflow-hidden rounded-2xl bg-white">
            <Image
              source={require("@/assets/logo/logo.png")}
              contentFit="contain"
              style={{ width: 44, height: 44 }}
            />
          </View>

          <View className="ml-3">
            <Text className="text-2xl font-extrabold text-white">
              Cimess
              <Text className="text-[#FACC15]">Fruit</Text>
            </Text>

            <Text className="mt-0.5 text-xs text-white/55">
              {data.tagline}
            </Text>
          </View>
        </View>

        {/* Contact information */}
        <View className="mt-7">

          {/* Location */}
          {data.location && (
            <View className="mb-4 flex-row items-start">
              <Ionicons
                name="location-outline"
                size={19}
                color="#FACC15"
              />

              <Text className="ml-3 flex-1 text-sm leading-5 text-white/70">
                {data.location}
              </Text>
            </View>
          )}

          {/* Phone */}
          {data.phone && (
            <Pressable
              onPress={onPhonePress ?? (() => open(`tel:${data.phone}`))}
              className="mb-4 flex-row items-center"
            >
              <Ionicons
                name="call-outline"
                size={18}
                color="#FACC15"
              />

              <Text className="ml-3 text-sm text-white/70">
                {data.phone}
              </Text>
            </Pressable>
          )}

          {/* Email */}
          {data.email && (
            <Pressable
              onPress={onEmailPress ?? (() => open(`mailto:${data.email}`))}
              className="flex-row items-center"
            >
              <Ionicons
                name="mail-outline"
                size={18}
                color="#FACC15"
              />

              <Text
                numberOfLines={1}
                className="ml-3 flex-1 text-sm text-white/70"
              >
                {data.email}
              </Text>
            </Pressable>
          )}
        </View>

        {/* Divider */}
        <View className="my-7 h-px bg-white/10" />

        {/* Navigation */}
        <View className="flex-row flex-wrap">

          <Pressable
            onPress={onShopPress ?? (() => router.push("/shop"))}
            className="mb-4 w-1/2"
          >
            <Text className="text-sm font-semibold text-white">
              {links.shop}
            </Text>
          </Pressable>

          <Pressable
            onPress={onSmoothiesPress ?? (() => router.push("/shop"))}
            className="mb-4 w-1/2"
          >
            <Text className="text-sm font-semibold text-white">
              {links.smoothies}
            </Text>
          </Pressable>

          <Pressable
            onPress={onAboutPress ?? (() => router.push("/policies/terms"))}
            className="mb-4 w-1/2"
          >
            <Text className="text-sm font-semibold text-white">
              {links.about}
            </Text>
          </Pressable>

          <Pressable
            onPress={onContactPress ?? (() => router.push("/chat"))}
            className="mb-4 w-1/2"
          >
            <Text className="text-sm font-semibold text-white">
              {links.contact}
            </Text>
          </Pressable>
        </View>

        {/* Social */}
        {data.tiktok && (
          <Pressable
            onPress={onTikTokPress ?? (() => open(`https://www.tiktok.com/@${data.tiktok}`))}
            className="mt-2 flex-row items-center self-start rounded-full border border-white/10 bg-white/5 px-4 py-2.5"
          >
            <Ionicons
              name="logo-tiktok"
              size={17}
              color="#FFFFFF"
            />

            <Text className="ml-2 text-sm font-semibold text-white">
              @{data.tiktok}
            </Text>
          </Pressable>
        )}
      </View>

      {/* Policies */}
      <View className="border-t border-white/10 px-6 py-6">

        <Text className="mb-4 text-xs font-bold uppercase tracking-wider text-white/40">
          Policies
        </Text>

        <View className="flex-row flex-wrap">

          <Pressable
            onPress={onTermsPress ?? (() => router.push("/policies/terms"))}
            className="mb-3 w-1/2"
          >
            <Text className="text-xs text-white/60">
              {links.terms}
            </Text>
          </Pressable>

          <Pressable
            onPress={onPrivacyPress ?? (() => router.push("/privacy"))}
            className="mb-3 w-1/2"
          >
            <Text className="text-xs text-white/60">
              {links.privacy}
            </Text>
          </Pressable>

          <Pressable
            onPress={onRefundPress ?? (() => router.push("/policies/refunds"))}
            className="mb-3 w-1/2"
          >
            <Text className="text-xs text-white/60">
              {links.refund}
            </Text>
          </Pressable>

          <Pressable
            onPress={onDeliveryPress ?? (() => router.push("/policies/delivery"))}
            className="mb-3 w-1/2"
          >
            <Text className="text-xs text-white/60">
              {links.delivery}
            </Text>
          </Pressable>
        </View>
      </View>

      {/* Copyright */}
      <View className="border-t border-white/10 px-6 py-5">
        <Text className="text-center text-xs text-white/40">
          © {new Date().getFullYear()} {data.brandName}. All rights reserved.
        </Text>
      </View>

    </View>
  );
}
