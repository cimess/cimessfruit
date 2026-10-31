import { useEffect, useState } from "react";
import { AppState } from "react-native";
import { fetch } from "expo/fetch";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/features/auth/store";
import { apiOrigin, apiRequest, getSessionSnapshot } from "@/lib/api";
import { orderPolling, orderReads } from "@/features/order/store";
import { consumeEvents, waitForRetry } from "./protocol";
export default function Realtime() {
  const owner = useAuthStore((state) => state.user?.id),
    query = useQueryClient();
  const [active, setActive] = useState(AppState.currentState === "active");
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) =>
      setActive(state === "active"),
    );
    return () => subscription.remove();
  }, []);
  useEffect(() => {
    if (!owner || !active || process.env.EXPO_PUBLIC_SSE_ENABLED !== "true")
      return;
    const lifetime = new AbortController();
    let connection: AbortController | undefined,
      debounce: ReturnType<typeof setTimeout> | undefined;
    const pendingKinds = new Set<string>();
    function reconcile(kind: string) {
      if (lifetime.signal.aborted) return;
      if (kind === "ready" || kind === "order.changed") {
        orderReads.invalidate();
        orderPolling.refreshSubscribed();
        void query.invalidateQueries({
          queryKey: ["approved-return-balance", owner],
        });
      }
      if (kind === "ready" || kind === "catalogue.changed") {
        void query.cancelQueries({ queryKey: ["product-browse"] }).then(() => {
          if (!lifetime.signal.aborted)
            return query.invalidateQueries({ queryKey: ["product-browse"] });
        });
      }
    }
    void (async () => {
      let failures = 0;
      while (!lifetime.signal.aborted) {
        connection = new AbortController();
        const current = connection;
        let watchdog = setTimeout(() => current.abort(), 10000);
        try {
          const snapshot = await getSessionSnapshot();
          if (
            !snapshot.session ||
            (snapshot.session.user as { id?: string }).id !== owner ||
            lifetime.signal.aborted
          )
            break;
          const response = await fetch(`${apiOrigin()}/api/events`, {
            headers: {
              Authorization: `Bearer ${snapshot.session.token}`,
              Accept: "text/event-stream",
            },
            credentials: "omit",
            signal: current.signal,
          });
          if (response.status === 401) await apiRequest("/api/me", { signal: current.signal });
          await consumeEvents(
            response,
            (event) => {
              clearTimeout(watchdog);
              watchdog = setTimeout(() => current.abort(), 45000);
              if (event === "heartbeat") return;
              if (event === "ready") {
                failures = 0;
                orderPolling.setStreaming(true);
                reconcile("ready");
                return;
              }
              pendingKinds.add(event);
              if (debounce) clearTimeout(debounce);
              debounce = setTimeout(() => {
                for (const kind of pendingKinds) reconcile(kind);
                pendingKinds.clear();
              }, 200);
            },
            current.signal,
          );
        } catch {
          /* Existing deduplicated polling remains the fallback. */
        } finally {
          clearTimeout(watchdog);
          orderPolling.setStreaming(false);
        }
        if (!lifetime.signal.aborted)
          await waitForRetry(
            Math.min(30000, 1000 * 2 ** Math.min(failures++, 5)) *
              (0.5 + Math.random()),
            lifetime.signal,
          );
      }
    })();
    return () => {
      lifetime.abort();
      connection?.abort();
      if (debounce) clearTimeout(debounce);
      orderPolling.setStreaming(false);
    };
  }, [owner, active, query]);
  return null;
}
