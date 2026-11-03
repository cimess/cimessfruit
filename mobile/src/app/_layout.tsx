import Realtime from "@/features/realtime/Realtime";
import PushNotifications from "@/features/notifications/PushNotifications";
import { Stack, usePathname, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import "./global.css";
import { StatusBar } from "expo-status-bar";

import OrderNotifications from "@/features/order/OrderNotifications";
import LoadingOverlay from "@/app/component/ui/LoadingOverlay";
import ToastHost from "@/app/component/ui/ToastHost";
import { useAuthStore } from "@/features/auth/store";
import { useLoadingStore } from "@/features/ui/loadingStore";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const authRoutes = ["/login", "/signup", "/auth/callback"];

export default function RootLayout() {
  const [queryClient] = useState(() => new QueryClient());
  const pathname = usePathname();
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const hasCheckedSession = useAuthStore((state) => state.hasCheckedSession);
  const isCheckingSession = useAuthStore((state) => state.isCheckingSession);
  const checkSession = useAuthStore((state) => state.checkSession);
  const showLoading = useLoadingStore((state) => state.showLoading);
  const hideLoading = useLoadingStore((state) => state.hideLoading);

  useEffect(() => {
    checkSession();
  }, [checkSession]);

  useEffect(() => {
    if (isCheckingSession) {
      showLoading("Checking session...");
      return;
    }

    hideLoading();
  }, [hideLoading, isCheckingSession, showLoading]);

  useEffect(() => {
    if (!hasCheckedSession || isCheckingSession) {
      return;
    }

    if (["/recover", "/verify-email", "/privacy", "/delete-account"].includes(pathname) || pathname.startsWith("/policies/")) return;

    const isAuthRoute = authRoutes.some((route) => pathname.startsWith(route));

    if (!user && !isAuthRoute) {
      router.replace("/login");
      return;
    }

    if (user && isAuthRoute) {
      router.replace("/");
    }
  }, [hasCheckedSession, isCheckingSession, pathname, router, user]);

  return (

    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <SafeAreaProvider>
          <Stack>
            <Stack.Screen name="index" options={{ headerShown: false }} />
          </Stack>
          <StatusBar style={"light"} />
          <LoadingOverlay />
          <ToastHost />
          <OrderNotifications />
          <PushNotifications />
          <Realtime />
        </SafeAreaProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
