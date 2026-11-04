"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { CreditChoice, Choice } from "./types";
function formatRemainingTime(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes.toString().padStart(2, "0")}m ${seconds.toString().padStart(2, "0")}s`;
  }
  return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
}

export default function ResolutionChoice({ credit, serverTime, refresh }: { credit: CreditChoice; serverTime: string; refresh: () => void }) {
  const [now, setNow] = useState(Date.now), [error, setError] = useState(""), [busy, setBusy] = useState(false); const lock = useRef(false);
  const [offset] = useState(() => Date.parse(serverTime) - Date.now());
  const current = now + offset;
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const remaining = Math.max(0, Date.parse(credit.refundDueAt) - current);
  const startedOpen = useRef(remaining > 0);
  useEffect(() => { if (remaining === 0 && startedOpen.current) { startedOpen.current = false; refresh(); } }, [remaining, refresh]);
  async function choose(choice: Choice) {
    if (lock.current) return; lock.current = true; setBusy(true); setError("");
    try { const response = await fetch(`/api/returns/${credit.id}/choice`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ choice }) }); const data = await response.json(); if (!response.ok) throw Error(data.error); refresh(); }
    catch (error) { setError(error instanceof Error ? error.message : "Unable to save choice"); }
    finally { lock.current = false; setBusy(false); }
  }
  return <section className="order-history-card"><h3>Choose your resolution</h3><p>{remaining ? `⏳ ${formatRemainingTime(remaining)} remaining to buy again or place a replacement.` : "The buying window is closed. Any unspent balance is due for a bank refund."} Buy again is the default; unused money is refunded after 20 minutes.</p><p>Current choice: <strong>{(remaining ? credit.choice === "CREDIT" ? "Buy again" : credit.choice.replaceAll("_", " ") : "BANK REFUND")}</strong></p><div className="checkout-actions">{(["BANK_REFUND", "CREDIT", "REPLACEMENT"] as Choice[]).map(choice => <button type="button" className="button" key={choice} disabled={busy || !remaining || credit.locked > 0 || choice === credit.choice} onClick={() => void choose(choice)}>{choice === "BANK_REFUND" ? "Bank refund" : choice === "CREDIT" ? "Buy again" : "Replacement"}</button>)}</div>{error && <p role="alert">{error}</p>}<p>{(!remaining || credit.choice === "BANK_REFUND") ? "After 20 minutes, the remaining balance is reserved for a manual bank refund. Save your bank details on the source order; Transfer locks the exact amount." : "Use the approved amount at checkout within 20 minutes. A replacement still needs an order; any unused balance then goes to refund."}</p><Link href="/checkout">Open checkout</Link></section>;
}
