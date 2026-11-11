import { useToastStore } from "@/features/ui/toastStore";
import { useOrderStore } from "@/features/order/store";
import { useEffect } from "react";
import { AppState } from "react-native";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/features/auth/store";
import { pushSupported, syncPushRegistration } from "./client";
import { notificationPayload } from "./payload";

export default function PushNotifications() {
  const userId = useAuthStore(state => state.user?.id);
  const router = useRouter();
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!userId || !pushSupported()) return;
    let stopped = false;
    const cleanups: (() => void)[] = [];
    const sync = () => { if (AppState.currentState === "active") void syncPushRegistration(true).catch(() => { /* Retry on foreground; explicit enable surfaces errors. */ }); };
    sync();
    const appState = AppState.addEventListener("change", sync);
    cleanups.push(() => appState.remove());
    void import("expo-notifications").then(Notifications => {
      if (stopped) return;
      const seen = new Set<string>();
      const receivedEvents = new Set<string>();
      const open = (response: import("expo-notifications").NotificationResponse | null) => {
        if (!response || stopped || useAuthStore.getState().user?.id !== userId) return;
        const data = notificationPayload(response.notification.request.content.data);
        if (!data || seen.has(data.eventId)) return;
        seen.add(data.eventId);
        if (data.kind === "order") router.push({ pathname: "/order/[id]", params: { id: data.entityId } });
        else { void queryClient.invalidateQueries({ queryKey: ["product-browse"] }); router.push("/shop"); }
        Notifications.clearLastNotificationResponse();
      };
      // Foreground order toasts already come from the shared order store; don't duplicate banners.
      Notifications.setNotificationHandler({ handleNotification: async () => ({
        shouldShowBanner: false, shouldShowList: false, shouldPlaySound: false, shouldSetBadge: false,
      }) });
      const responses = Notifications.addNotificationResponseReceivedListener(open);
      const tokens = Notifications.addPushTokenListener(sync);
      const received = Notifications.addNotificationReceivedListener(notification => {
        if (stopped || useAuthStore.getState().user?.id !== userId) return;
        const data = notificationPayload(notification.request.content.data);
        if (!data || receivedEvents.has(data.eventId)) return;
        receivedEvents.add(data.eventId);
        if (receivedEvents.size > 200) receivedEvents.delete(receivedEvents.values().next().value!);
        if (data.kind === "order") {
          if (["Return and refund update", "Dispute update"].includes(notification.request.content.title ?? "")) {
            useToastStore.getState().showToast((notification.request.content.body ?? "Return or refund updated.").slice(0, 240), "info");
            void queryClient.invalidateQueries({ queryKey: ["approved-return-balance", userId], exact: true });
          }
          void useOrderStore.getState().refresh(undefined, true).catch(() => {});
          void useOrderStore.getState().refresh(data.entityId, true).catch(() => {});
        }
        if (data?.kind === "catalogue") {
          void queryClient.invalidateQueries({ queryKey: ["product-browse"] });
          useToastStore.getState().showToast("The shop has new availability. Open Shop to check stock.", "info");
        }
      });
      open(Notifications.getLastNotificationResponse());
      cleanups.push(() => { responses.remove(); tokens.remove(); received.remove(); Notifications.setNotificationHandler(null); });
    }).catch(() => { /* Native credentials/build setup remains independently configurable. */ });
    return () => { stopped = true; cleanups.forEach(cleanup => cleanup()); };
  }, [userId, router, queryClient]);
  return null;
}
