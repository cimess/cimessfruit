"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { money } from "@/app/store/catalogue";
type Summary = { available: number; pendingRefund: number; expiresAt: string | null; serverTime: string };
export default function CreditBanner() {
  const [summary, setSummary] = useState<Summary | null>(null), [error, setError] = useState(false), [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined, pending = false, loaded = 0;
    async function load() {
      if (pending || controller.signal.aborted) return; pending = true;
      try {
        const response = await fetch("/api/returns/balance", { cache: "no-store", signal: controller.signal });
        if (response.status === 401) { setSummary(null); return; }
        const data = await response.json(); if (!response.ok) throw Error("Unable to load credit");
        if (!controller.signal.aborted) {
          setSummary(data); setError(false); loaded = Date.now();
          clearTimeout(timer);
          if (data.expiresAt) timer = setTimeout(() => void load(), Math.max(0, Date.parse(data.expiresAt) - Date.parse(data.serverTime)) + 150);
        }
      } catch { if (!controller.signal.aborted) setError(true); }
      finally { pending = false; }
    }
    const focus = () => { if (Date.now() - loaded > 15000) void load(); };
    void load(); window.addEventListener("focus", focus); window.addEventListener("cimessfruit:orders", load);
    return () => { controller.abort(); clearTimeout(timer); window.removeEventListener("focus", focus); window.removeEventListener("cimessfruit:orders", load); };
  }, [revision]);
  if (!summary || (!summary.available && !summary.pendingRefund)) return null;
  return <aside className="notice" style={{ margin: "16px auto", padding: 20, maxWidth: 1100 }} aria-label="Approved return balance">
    {error ? <p>Your return balance needs a refresh before shopping.</p> : <>{summary.available > 0 && <><strong>{money(summary.available)} approved — buy again</strong><p>Use this approved amount at checkout within your 20-minute window. Any unused money goes to a bank refund afterward.</p><Link className="button" href="/shop">Shop with approved credit</Link></>}{summary.pendingRefund > 0 && <p><strong>{money(summary.pendingRefund)} awaiting manual refund.</strong> This amount is no longer spendable.</p>}</>}
    <Link className="text-link" href="/orders">View orders / refund details</Link><button className="text-link" onClick={() => setRevision(value => value + 1)}>Refresh balance</button>
  </aside>;
}
