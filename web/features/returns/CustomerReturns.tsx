"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import ResolutionChoice from "../chat/ResolutionChoice";
import { money } from "@/app/store/catalogue";
import type { ReturnView } from "./types";
export default function CustomerReturns({ orderId }: { orderId: string }) {
  const [view, setView] = useState<ReturnView | null>(null), [error, setError] = useState(""), [busy, setBusy] = useState(false), [revision, setRevision] = useState(0);
  const lock = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/returns/orders/${orderId}`, { cache: "no-store", signal: controller.signal }).then(async response => {
      const data = await response.json(); if (!response.ok) throw Error(data.error); if (!controller.signal.aborted) setView(data);
    }).catch(error => { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "Unable to load return credit"); });
    return () => controller.abort();
  }, [orderId, revision]);
  return <section className="checkout-address" style={{ marginTop: 24, padding: 20, borderRadius: 16, backgroundColor: "#f8fafc", border: "1px solid #e2e8f0" }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
      <h2 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 800 }}>Returns & Refund Payouts</h2>
      <Link href={`/chat?tab=DISPUTE&orderId=${orderId}`} className="text-link" style={{ fontWeight: 600 }}>💬 Chat with Store</Link>
    </div>
    {error && <p role="alert" className="form-error">{error}</p>}
    {!view ? <p>Loading return status…</p> : !view.credits.length ? <p style={{ color: "#64748b" }}>Contact the store to arrange a return. Approved refunds and credit balances will appear here.</p> : view.credits.map(credit => {
      const pending = credit.transfers.some(t => t.state === "PENDING");
      const completed = credit.transfers.find(t => t.state === "COMPLETED");
      const hasBank = Boolean(credit.bankDetails);

      return <article key={credit.id} style={{ marginBottom: 20, padding: 18, borderRadius: 14, backgroundColor: "#ffffff", border: "1px solid #cbd5e1" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
          <strong style={{ fontSize: "1rem", color: "#1e293b" }}>Refund #{credit.id.slice(0, 8).toUpperCase()}</strong>
          <span style={{ fontSize: "0.85rem", fontWeight: 700, padding: "3px 10px", borderRadius: 12, backgroundColor: completed ? "#dcfce7" : pending ? "#fef3c7" : "#e0f2fe", color: completed ? "#15803d" : pending ? "#92400e" : "#0369a1" }}>
            {completed ? "✓ Refund Sent by Store" : pending ? "⏳ Transfer in Progress" : "Active Balance"}
          </span>
        </div>

        <p style={{ margin: "4px 0 12px", color: "#475569", fontSize: "0.9rem" }}>
          Remaining: <strong>{money(pending ? 0 : credit.balance)}</strong> · Reserved: {money(credit.reserved)} · Refunded: <strong>{money(credit.refunded)}</strong>
        </p>

        <ResolutionChoice key={`${credit.id}:${view.serverTime}`} credit={credit} serverTime={view.serverTime} refresh={() => setRevision(value => value + 1)} />

        {/* BANK ACCOUNT COLLECTION FORM */}
        {(!pending || !hasBank) && (credit.choice === "BANK_REFUND" || credit.balance > 0) && (
          <div style={{ marginTop: 16, padding: 16, borderRadius: 12, backgroundColor: "#f1f5f9", border: "1px solid #cbd5e1" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: "1.1rem" }}>🏦</span>
              <strong style={{ fontSize: "0.95rem", color: "#0f172a" }}>Your Bank Account for Refund Payout</strong>
            </div>
            <p style={{ margin: "0 0 12px", fontSize: "0.85rem", color: "#64748b" }}>
              Please provide your Nigerian bank account details so our accounting team can transfer your approved refund.
            </p>

            <form onSubmit={async event => {
              event.preventDefault(); if (lock.current) return; lock.current = true; setBusy(true); setError("");
              const body = Object.fromEntries(new FormData(event.currentTarget));
              try {
                const response = await fetch(`/api/returns/${credit.id}/bank`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
                const data = await response.json();
                if (!response.ok) throw Error(data.error);
                setRevision(value => value + 1);
              } catch (error) { setError(error instanceof Error ? error.message : "Unable to save bank details"); }
              finally { lock.current = false; setBusy(false); }
            }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10, marginBottom: 12 }}>
                <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600 }}>
                  Bank Name
                  <input name="bank" defaultValue={credit.bankDetails?.bank ?? ""} placeholder="e.g. GTBank, Kuda, Access Bank" required minLength={2} maxLength={100} style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px solid #cbd5e1", marginTop: 4 }} />
                </label>
                <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600 }}>
                  10-Digit Account Number
                  <input name="accountNumber" defaultValue={credit.bankDetails?.accountNumber ?? ""} placeholder="0123456789" required pattern="[0-9]{10}" inputMode="numeric" maxLength={10} style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px solid #cbd5e1", marginTop: 4, fontFamily: "monospace" }} />
                </label>
                <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600 }}>
                  Account Name
                  <input name="accountName" defaultValue={credit.bankDetails?.accountName ?? ""} placeholder="Full Name on Account" required minLength={2} maxLength={120} style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px solid #cbd5e1", marginTop: 4 }} />
                </label>
              </div>
              <button
                type="submit"
                className="button"
                disabled={busy}
                style={{
                  width: "100%",
                  marginTop: 6,
                  padding: "13px 20px",
                  borderRadius: 12,
                  fontSize: "0.95rem",
                  fontWeight: 800,
                  letterSpacing: "0.02em",
                  color: "#ffffff",
                  background: busy
                    ? "#94a3b8"
                    : "linear-gradient(135deg, #16a34a 0%, #15803d 100%)",
                  boxShadow: busy
                    ? "none"
                    : "0 4px 14px rgba(22, 163, 74, 0.35)",
                  border: "none",
                  cursor: busy ? "not-allowed" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  transition: "all 0.2s ease-in-out",
                }}
              >
                <span>{busy ? "⏳" : hasBank ? "🔄" : "💾"}</span>
                {busy ? "Saving details…" : hasBank ? "Update Refund Bank Details" : "Save Refund Bank Details"}
              </button>
            </form>
          </div>
        )}

        {/* PERSISTENT PROMPT: HAVE YOU RECEIVED THE MONEY? */}
        {completed && (
          <div style={{ marginTop: 16, padding: 16, borderRadius: 12, backgroundColor: "#f0fdf4", border: "2px solid #86efac", boxShadow: "0 2px 8px rgba(22, 163, 74, 0.08)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: "1.2rem" }}>💰</span>
              <strong style={{ fontSize: "1rem", color: "#166534" }}>The Store Sent Your Refund ({money(completed.amount)})</strong>
            </div>
            <p style={{ margin: "0 0 10px", fontSize: "0.9rem", color: "#14532d" }}>
              Reference / Receipt ID: <code>{completed.reference || "Completed"}</code>
            </p>
            <p style={{ margin: "0 0 12px", fontSize: "0.88rem", color: "#15803d", fontWeight: 600 }}>
              Did you receive the money into your bank account?
            </p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button
                type="button"
                className="button"
                onClick={() => {
                  alert("Thank you for confirming receipt of your refund! Your case is fully resolved.");
                }}
                style={{ backgroundColor: "#16a34a", color: "#ffffff", fontWeight: 800, padding: "8px 16px", borderRadius: 8, border: "none" }}
              >
                ✓ Yes, I Received the Money
              </button>
              <Link
                href={`/chat?tab=DISPUTE&orderId=${orderId}`}
                className="button"
                style={{ backgroundColor: "#ffffff", color: "#dc2626", border: "1px solid #fca5a5", fontWeight: 600, padding: "8px 16px", borderRadius: 8 }}
              >
                Not yet received / Contact support
              </Link>
            </div>
          </div>
        )}

        {pending && !completed && (
          <p style={{ marginTop: 12, color: "#92400e", fontSize: "0.9rem", fontWeight: 600 }}>
            ⏳ Your transfer amount is locked. The store admin is sending the money to your bank details.
          </p>
        )}
      </article>;
    })}
    <button className="text-link" disabled={busy} onClick={() => setRevision(value => value + 1)}>↻ Refresh status</button>
  </section>;
}
