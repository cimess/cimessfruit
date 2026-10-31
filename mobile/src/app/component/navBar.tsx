import { Ionicons } from "@expo/vector-icons";
import { usePathname, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  Animated,
  Pressable,
  Text,
  View,
} from "react-native";

import { useCartStore } from "@/features/cart/store";
import { useLoadingStore } from "@/features/ui/loadingStore";

type NavItem = {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  activeIcon: keyof typeof Ionicons.glyphMap;
  route: string;
};

const navItems: NavItem[] = [
  {
    label: "Home",
    icon: "home-outline",
    activeIcon: "home",
    route: "/",
  },
  {
    label: "Shop",
    icon: "storefront-outline",
    activeIcon: "storefront",
    route: "/shop",
  },
  {
    label: "Orders",
    icon: "receipt-outline",
    activeIcon: "receipt",
    route: "/orders",
  },
  { label: "Support", icon: "chatbubbles-outline", activeIcon: "chatbubbles", route: "/chat" },
  {
    label: "Account",
    icon: "person-outline",
    activeIcon: "person",
    route: "/account",
  },
];

type BottomNavigationProps = {
  visible?: boolean;
};

export default function BottomNavigation({
  visible = true,
}: BottomNavigationProps) {
  const pathname = usePathname();
  const router = useRouter();
  const totalItems = useCartStore((state) => state.getTotalItems());
  const flashLoading = useLoadingStore((state) => state.flashLoading);

  const [translateY] = useState(() => new Animated.Value(0));

  useEffect(() => {
    Animated.spring(translateY, {
      toValue: visible ? 0 : 120,
      useNativeDriver: true,
      damping: 18,
      stiffness: 180,
      mass: 0.8,
    }).start();
  }, [visible, translateY]);

  return (
    <Animated.View
      pointerEvents={visible ? "auto" : "none"}
      style={{
        position: "absolute",
        left: 12,
        right: 12,
        bottom: 12,
        transform: [{ translateY }],
      }}
    >
      <View
        className="flex-row items-center justify-between rounded-[28px] border border-emerald-100 bg-white px-3 py-3"
        style={{
          shadowColor: "#128A3A",
          shadowOffset: {
            width: 0,
            height: 8,
          },
          shadowOpacity: 0.18,
          shadowRadius: 18,
          elevation: 10,
        }}
      >
        {navItems.map((item) => {
          const isActive =
            item.route === "/"
              ? pathname === "/"
              : pathname.startsWith(item.route);

          return (
            <Pressable
              key={item.route}
              onPress={() => {
                if (isActive) {
                  return;
                }

                flashLoading(`Opening ${item.label}...`, 360);
                router.push(item.route as any);
              }}
              className="flex-1 items-center"
            >
              <View
                className={`items-center justify-center rounded-2xl px-2 py-2 ${
                  isActive ? "bg-emerald-100" : ""
                }`}
              >
                <Ionicons
                  name={
                    isActive
                      ? item.activeIcon
                      : item.icon
                  }
                  size={22}
                  color={
                    isActive
                      ? "#128A3A"
                      : "#9CA3AF"
                  }
                />

                {item.route === "/shop" && totalItems > 0 && (
                  <View className="absolute right-2 top-1 min-w-5 items-center justify-center rounded-full bg-[#FACC15] px-1.5 py-0.5">
                    <Text className="text-[10px] font-extrabold text-[#033035]">
                      {totalItems > 99 ? "99+" : totalItems}
                    </Text>
                  </View>
                )}

                <Text
                  className={`mt-1 text-[10px] font-bold ${
                    isActive
                      ? "text-[#128A3A]"
                      : "text-gray-400"
                  }`}
                >
                  {item.label}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </Animated.View>
  );
}
