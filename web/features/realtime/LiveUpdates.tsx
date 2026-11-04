"use client";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { consumeEvents, waitForRetry } from "./protocol";
export default function LiveUpdates({ owner }: { owner: string }) {
  const path = usePathname(),
    router = useRouter();
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_SSE_ENABLED !== "true") return;
    let active: AbortController | null = null,
      debounce: ReturnType<typeof setTimeout> | undefined;
    const lifetime = new AbortController();
    const pending = new Set<string>();
    const notify = (kind = "ready") => {
      pending.add(kind);
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => {
        if (pending.has("ready") || pending.has("catalogue.changed"))
          window.dispatchEvent(new Event("cimessfruit:catalogue"));
        if (pending.has("ready") || pending.has("order.changed")) {
          window.dispatchEvent(new Event("cimessfruit:orders"));
          if (path === "/orders") router.refresh();
        }
        pending.clear();
      }, 200);
    };
    const run = async () => {
      let failures = 0;
      while (!lifetime.signal.aborted) {
        if (document.visibilityState !== "visible") {
          await waitForRetry(1000, lifetime.signal);
          continue;
        }
        active = new AbortController();
        const controller = active;
        let watchdog = setTimeout(() => controller.abort(), 10000);
        try {
          const response = await fetch("/api/events", {
            credentials: "same-origin",
            cache: "no-store",
            headers: { Accept: "text/event-stream" },
            signal: controller.signal,
          });
          await consumeEvents(
            response,
            (event) => {
              clearTimeout(watchdog);
              watchdog = setTimeout(() => controller.abort(), 45000);
              if (event !== "heartbeat") {
                failures = 0;
                notify(event);
              }
            },
            controller.signal,
          );
        } catch {
          /* Focus/manual refresh remains available. */
        } finally {
          clearTimeout(watchdog);
        }
        await waitForRetry(
          Math.min(30000, 1000 * 2 ** Math.min(failures++, 5)) *
            (0.5 + Math.random()),
          lifetime.signal,
        );
      }
    };
    const visibility = () => {
      if (document.visibilityState !== "visible") active?.abort();
      else notify();
    };
    document.addEventListener("visibilitychange", visibility);
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") notify();
    }, 60000);
    void run();
    return () => {
      lifetime.abort();
      active?.abort();
      if (debounce) clearTimeout(debounce);
      clearInterval(timer);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [owner, path, router]);
  return null;
}
