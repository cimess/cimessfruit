"use client";
import { useEffect, useState } from "react";
import type { CartLine } from "@/lib/store-cart";
import type { BasketReview } from "@/services/checkout-eligibility";
export function useBasketReview(items: CartLine[]) {
  const payload = JSON.stringify({ items: items.map(({ productId, optionId, quantity }) => ({ productId, optionId, quantity })) });
  const [result, setResult] = useState<{ payload: string; review?: BasketReview; error?: string; signIn?: boolean } | null>(null);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!JSON.parse(payload).items.length) return;
    const controller = new AbortController();
    async function load() {
      setResult(null);
      try {
        const response = await fetch("/api/checkout/review", { method: "POST", headers: { "Content-Type": "application/json" }, body: payload, cache: "no-store", signal: controller.signal });
        if (!response.headers.get("content-type")?.includes("application/json")) {
          if (!controller.signal.aborted) setResult({ payload, error: `Availability service returned an unexpected response (HTTP ${response.status}). Please retry.` });
          return;
        }
        const data = await response.json();
        if (controller.signal.aborted) return;
        if (!response.ok) { setResult({ payload, signIn: response.status === 401, error: response.status === 401 ? "Sign in to check availability and continue." : data.error ?? "Unable to check availability." }); return; }
        setResult({ payload, review: data });
      } catch { if (!controller.signal.aborted) setResult({ payload, error: "Unable to check availability. Please retry." }); }
    }
    void load();
    const refresh = () => { setResult(null); setRevision((value) => value + 1); };
    window.addEventListener("focus", refresh);
    const timer = window.setInterval(refresh, 30000);
    return () => { controller.abort(); window.removeEventListener("focus", refresh); window.clearInterval(timer); };
  }, [payload, revision]);
  const current = result?.payload === payload ? result : null;
  return { review: current?.review, error: current?.error, signIn: current?.signIn, checking: items.length > 0 && !current,
    refresh: () => { setResult(null); setRevision((value) => value + 1); } };
}
