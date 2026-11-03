import { useEffect } from "react";
import { AppState } from "react-native";
import { useAuthStore } from "@/features/auth/store";
import { useUserStore } from "@/features/user/store";
import { useToastStore } from "@/features/ui/toastStore";
import { orderSubscriptions, useOrderStore } from "./store";
import { ORDER_LIST } from "./readCoordinator";

export default function OrderNotifications() {
  const userId = useAuthStore(state => state.user?.id);
  const enabled = useUserStore(state => state.profile?.notificationsEnabled);
  const loadProfile = useUserStore(state => state.loadProfile);
  useEffect(() => { if (userId) void loadProfile(); }, [userId, loadProfile]);

  // One lifecycle owner for all list/detail/payment-sheet subscribers.
  useEffect(() => {
    const update = () => orderSubscriptions.setActive(!!userId && AppState.currentState === "active");
    update();
    const listener = AppState.addEventListener("change", update);
    return () => { listener.remove(); orderSubscriptions.setActive(false); };
  }, [userId]);

  useEffect(() => {
    if (!userId || !enabled) return;
    const snapshot = () => new Map(Object.values(useOrderStore.getState().orders)
      .map(order => [order.id, `${order.status}:${order.paymentStatus}`]));
    let previous = snapshot();
    const unsubscribe = useOrderStore.subscribe((state, before) => {
      if (state.orders === before.orders) return;
      const next = snapshot();
      if (AppState.currentState === "active" && useAuthStore.getState().user?.id === userId) {
        for (const order of Object.values(state.orders)) {
          if (previous.has(order.id) && previous.get(order.id) !== next.get(order.id)) {
            useToastStore.getState().showToast(`Order ${order.id.slice(0, 8)}: ${order.status.replaceAll("_", " ")} · ${order.paymentStatus.replaceAll("_", " ")}`, "info");
          }
        }
      }
      previous = next;
    });
    const unwatch = orderSubscriptions.subscribe(ORDER_LIST);
    return () => { unwatch(); unsubscribe(); };
  }, [userId, enabled]);
  return null;
}
