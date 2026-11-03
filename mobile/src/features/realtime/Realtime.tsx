import { useEffect, useState } from "react";
import { AppState } from "react-native";
import { fetch } from "expo/fetch";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/features/auth/store";
import { apiOrigin, apiRequest, getSessionSnapshot } from "@/lib/api";
import { orderSubscriptions, orderReads } from "@/features/order/store";
import { consumeEvents, retryDelay, waitForRetry } from "./protocol";
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
        orderSubscriptions.refreshSubscribed();
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
        let retryAfterMs = 0;
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
          const retryAfter = Number(response.headers.get("retry-after"));
          if (Number.isFinite(retryAfter) && retryAfter > 0) retryAfterMs = Math.min(retryAfter * 1000, 300000);
          if (response.status === 401) await apiRequest("/api/me", { signal: current.signal });
          await consumeEvents(
            response,
            (event) => {
              clearTimeout(watchdog);
              watchdog = setTimeout(() => current.abort(), 45000);
              if (event === "heartbeat") { failures = 0; return; }
              if (event === "ready") {
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
          /* Keep cached data; screen entry and manual refresh remain available. */
        } finally {
          clearTimeout(watchdog);
        }
        if (!lifetime.signal.aborted)
          await waitForRetry(
            Math.max(retryDelay(failures++), retryAfterMs),
            lifetime.signal,
          );
      }
    })();
    return () => {
      lifetime.abort();
      connection?.abort();
      if (debounce) clearTimeout(debounce);
    };
  }, [owner, active, query]);
  return null;
}
