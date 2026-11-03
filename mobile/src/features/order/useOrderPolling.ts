import { useCallback, useRef } from "react";
import { AppState } from "react-native";
import { useFocusEffect } from "expo-router";
import { useAuthStore } from "@/features/auth/store";
import { orderSubscriptions, useOrderStore } from "./store";
import { ORDER_LIST } from "./readCoordinator";

export function useOrderPolling({ id, enabled = true }: { id?: string; enabled?: boolean } = {}) {
  const userId = useAuthStore(state => state.user?.id);
  const focused = useRef(false);
  const key = id ?? ORDER_LIST;
  const refresh = useOrderStore(state => state.refresh);
  const refreshing = useOrderStore(state => state.refreshing[key] ?? false);
  const error = useOrderStore(state => state.readErrors[key] ?? null);
  useFocusEffect(useCallback(() => {
    focused.current = true;
    const unsubscribe = enabled && userId ? orderSubscriptions.subscribe(key) : undefined;
    return () => { focused.current = false; unsubscribe?.(); };
  }, [enabled, userId, key]));
  const manualRefresh = useCallback(() => {
    if (focused.current && enabled && userId && AppState.currentState === "active") {
      void refresh(id, true);
    }
  }, [enabled, userId, refresh, id]);
  return { refreshing, error, refresh: manualRefresh };
}
