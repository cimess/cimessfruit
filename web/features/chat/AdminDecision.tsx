"use client";
import { money } from "@/app/store/catalogue";
import { useRef, useState } from "react";
import type { DisputeView } from "./types";

export default function AdminDecision({
  dispute,
  refresh,
}: {
  dispute: DisputeView;
  refresh: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);

  // If already resolved, display full resolution summary
  if (dispute.status !== "OPEN") {
    const bank = dispute.credit?.bankDetails;
    const transfers = dispute.credit?.transfers ?? [];
    const pendingTransfer = transfers.find(t => t.state === "PENDING");
    const completedTransfer = transfers.find(t => t.state === "COMPLETED");

    return (
      <div style={{
        marginTop: 18,
        marginBottom: 24,
        padding: 22,
        borderRadius: 16,
        backgroundColor: dispute.status === "APPROVED" ? "#f0fdf4" : "#fef2f2",
        border: `1px solid ${dispute.status === "APPROVED" ? "#bbf7d0" : "#fecaca"}`,
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <span style={{
            display: "inline-block",
            padding: "4px 12px",
            borderRadius: 20,
            fontSize: "0.85rem",
            fontWeight: 800,
            backgroundColor: dispute.status === "APPROVED" ? "#16a34a" : "#dc2626",
            color: "#ffffff",
          }}>
            {dispute.status === "APPROVED" ? "✓ DISPUTE RESOLVED / REFUND APPROVED" : "✕ DISPUTE REJECTED"}
          </span>
          <span style={{ fontSize: "0.85rem", color: "#6b7280", fontWeight: 600 }}>
            Fault: <strong>{dispute.responsibility ?? "Store"}</strong>
          </span>
        </div>

        <div style={{ fontSize: "0.95rem", lineHeight: 1.6, color: "#1f2937" }}>
          <p style={{ margin: "4px 0" }}>
            <strong>Resolution Note:</strong> {dispute.decisionNote || "No note recorded."}
          </p>
          <p style={{ margin: "4px 0" }}>
            <strong>Approved Items:</strong>{" "}
            {dispute.approvedItems?.length
              ? dispute.approvedItems
                  .map(item => {
                    const line = dispute.order?.items.find(l => l.id === item.orderItemId);
                    return `${item.quantity}× ${line?.name ?? item.orderItemId.slice(0, 8)} (${line?.optionLabel ?? ""})`;
                  })
                  .join(", ")
              : "None"}
          </p>
          <p style={{ margin: "4px 0" }}>
            <strong>Resolution Payout:</strong>{" "}
            <span style={{
              fontWeight: 700,
              color: dispute.credit?.choice === "CREDIT" || dispute.requestedChoice === "CREDIT" ? "#15803d" : "#0369a1"
            }}>
              {dispute.credit?.choice === "CREDIT" || dispute.requestedChoice === "CREDIT"
                ? "🎁 Credited to Customer Store Balance (Ready to Buy Again)"
                : dispute.credit?.choice === "BANK_REFUND" || dispute.requestedChoice === "BANK_REFUND"
                ? "🏦 Cash Refund to Bank Account"
                : "🔄 Fruit Replacement Order"}
            </span>
            {dispute.credit?.balance ? ` (${money(dispute.credit.balance)} active balance)` : ""}
          </p>

          {/* BANK DETAILS & REFUND ACTION PANEL */}
          {(dispute.credit?.choice === "BANK_REFUND" || dispute.requestedChoice === "BANK_REFUND" || bank || transfers.length > 0) && (
            <div style={{
              marginTop: 16,
              padding: 16,
              borderRadius: 12,
              backgroundColor: "#ffffff",
              border: "1px solid #e2e8f0",
              boxShadow: "0 2px 6px rgba(0,0,0,0.04)",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <strong style={{ fontSize: "0.95rem", color: "#0f172a", display: "flex", alignItems: "center", gap: 6 }}>
                  🏦 Customer Bank Refund Account
                </strong>
                {completedTransfer ? (
                  <span style={{ backgroundColor: "#dcfce7", color: "#15803d", fontSize: "0.8rem", padding: "3px 10px", borderRadius: 12, fontWeight: 700 }}>
                    ✓ Already Refunded (Ref: {completedTransfer.reference || "Completed"})
                  </span>
                ) : pendingTransfer ? (
                  <span style={{ backgroundColor: "#fef3c7", color: "#92400e", fontSize: "0.8rem", padding: "3px 10px", borderRadius: 12, fontWeight: 700 }}>
                    ⏳ Transfer Locked / In Progress
                  </span>
                ) : (
                  <span style={{ backgroundColor: "#f1f5f9", color: "#475569", fontSize: "0.8rem", padding: "3px 10px", borderRadius: 12, fontWeight: 600 }}>
                    Awaiting Payout
                  </span>
                )}
              </div>

              {bank ? (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 12, backgroundColor: "#f8fafc", padding: 12, borderRadius: 8 }}>
                  <div>
                    <span style={{ fontSize: "0.75rem", color: "#64748b", textTransform: "uppercase", fontWeight: 700 }}>Bank Name</span>
                    <p style={{ margin: "2px 0 0", fontWeight: 700, color: "#1e293b" }}>{bank.bank}</p>
                  </div>
                  <div>
                    <span style={{ fontSize: "0.75rem", color: "#64748b", textTransform: "uppercase", fontWeight: 700 }}>Account Number</span>
                    <p style={{ margin: "2px 0 0", fontWeight: 700, color: "#1e293b", fontFamily: "monospace", fontSize: "1.05rem" }}>{bank.accountNumber}</p>
                  </div>
                  <div>
                    <span style={{ fontSize: "0.75rem", color: "#64748b", textTransform: "uppercase", fontWeight: 700 }}>Account Name</span>
                    <p style={{ margin: "2px 0 0", fontWeight: 700, color: "#1e293b" }}>{bank.accountName}</p>
                  </div>
                </div>
              ) : (
                <p style={{ margin: "6px 0 12px", color: "#64748b", fontStyle: "italic", fontSize: "0.9rem" }}>
                  The customer has not yet saved their 10-digit bank account number. They can submit it anytime from their dispute or order page.
                </p>
              )}

              {/* ADMIN REFUND ACTION BUTTONS */}
              {dispute.credit && !completedTransfer && (
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginTop: 8 }}>
                  {!pendingTransfer ? (
                    <button
                      type="button"
                      className="button"
                      disabled={busy || !bank || (dispute.credit.balance ?? 0) <= 0}
                      onClick={async () => {
                        if (!dispute.credit) return;
                        if (!window.confirm(`Start bank transfer of ${money(dispute.credit.balance)} to ${bank?.accountName}? This locks the balance from checkout spending.`)) return;
                        setBusy(true); setError("");
                        try {
                          const res = await fetch(`/api/admin/returns/${dispute.credit.id}/transfer`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ action: "transfer", key: crypto.randomUUID() }),
                          });
                          const data = await res.json();
                          if (!res.ok) throw Error(data.error ?? "Failed to initiate transfer.");
                          refresh();
                        } catch (e) {
                          setError(e instanceof Error ? e.message : "Unable to initiate transfer");
                        } finally {
                          setBusy(false);
                        }
                      }}
                      style={{ backgroundColor: "#0284c7", color: "#ffffff", fontWeight: 700, padding: "8px 16px", borderRadius: 8, border: "none" }}
                    >
                      {busy ? "Locking..." : `🔒 Lock Balance & Start Transfer (${money(dispute.credit.balance)})`}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="button"
                      disabled={busy}
                      onClick={async () => {
                        if (!dispute.credit || !pendingTransfer) return;
                        const ref = window.prompt("Enter transfer reference / payment receipt ID for this refund payout:", `TRF-${dispute.id.slice(0, 8).toUpperCase()}`);
                        if (!ref || !ref.trim()) return;
                        setBusy(true); setError("");
                        try {
                          const res = await fetch(`/api/admin/returns/${dispute.credit.id}/transfer`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ action: "confirm", transferId: pendingTransfer.id, reference: ref.trim() }),
                          });
                          const data = await res.json();
                          if (!res.ok) throw Error(data.error ?? "Failed to mark as refunded.");
                          refresh();
                        } catch (e) {
                          setError(e instanceof Error ? e.message : "Unable to confirm transfer");
                        } finally {
                          setBusy(false);
                        }
                      }}
                      style={{ backgroundColor: "#16a34a", color: "#ffffff", fontWeight: 700, padding: "8px 16px", borderRadius: 8, border: "none" }}
                    >
                      {busy ? "Confirming..." : "✓ Mark as Already Refunded to Customer"}
                    </button>
                  )}
                  {error && <span style={{ color: "#dc2626", fontSize: "0.85rem", fontWeight: 600 }}>{error}</span>}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        if (lock.current) return;
        const form = new FormData(event.currentTarget);
        const decision = form.get("decision");
        const resolutionChoice = form.get("resolutionChoice");
        const delivery = form.get("delivery");

        const promptMsg =
          decision === "APPROVE"
            ? resolutionChoice === "CREDIT"
              ? "Approve this dispute and credit the customer's balance immediately so they can reuse it to buy other fruits?"
              : "Approve this dispute for bank refund payout?"
            : "Reject this customer dispute?";

        if (!window.confirm(promptMsg)) return;

        lock.current = true;
        setBusy(true);
        setError("");

        try {
          const response = await fetch(`/api/admin/disputes/${dispute.id}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              decision,
              choiceOverride: resolutionChoice,
              ...(decision === "APPROVE"
                ? {
                    approvedItems: dispute.items
                      .map((item) => ({
                        orderItemId: item.orderItemId,
                        quantity: Number(form.get(`approved-${item.orderItemId}`)),
                      }))
                      .filter((item) => item.quantity > 0),
                  }
                : {}),
              responsibility: form.get("responsibility"),
              note: form.get("note"),
              ...(delivery === "auto" ? {} : { deliveryOverride: delivery === "include" }),
              ...(form.get("override") ? { overrideReason: form.get("override") } : {}),
            }),
          });
          const data = await response.json();
          if (!response.ok) throw Error(data.error ?? "Failed to save decision.");
          refresh();
        } catch (err) {
          setError(err instanceof Error ? err.message : "Unable to record dispute decision.");
        } finally {
          lock.current = false;
          setBusy(false);
        }
      }}
      style={{
        marginTop: 20,
        marginBottom: 26,
        padding: 24,
        borderRadius: 20,
        backgroundColor: "#ffffff",
        border: "1px solid #e5e7eb",
        boxShadow: "0 4px 16px rgba(0, 0, 0, 0.05)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div>
          <span style={{
            fontSize: "0.75rem",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            fontWeight: 800,
            color: "#dc2626",
            backgroundColor: "#fef2f2",
            padding: "4px 10px",
            borderRadius: 12,
          }}>
            Action Required · Open Dispute
          </span>
          <h3 style={{ margin: "8px 0 0", fontSize: "1.25rem", fontWeight: 800 }}>
            Resolve Customer Dispute
          </h3>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: "0.85rem", color: "#6b7280" }}>Reported Issue:</div>
          <strong style={{ color: "#111827", textTransform: "capitalize" }}>
            {dispute.reason.replaceAll("_", " ").toLowerCase()}
          </strong>
        </div>
      </div>

      <div style={{
        padding: "14px 18px",
        borderRadius: 14,
        backgroundColor: "#f9fafb",
        border: "1px solid #f3f4f6",
        marginBottom: 20,
      }}>
        <div style={{ fontSize: "0.88rem", color: "#374151" }}>
          <strong>Customer’s Requested Solution:</strong>{" "}
          <span style={{ fontWeight: 700, color: "#15803d" }}>
            {dispute.requestedChoice === "CREDIT"
              ? "Store Credit Balance (to buy other fruits)"
              : dispute.requestedChoice === "BANK_REFUND"
              ? "Bank Refund"
              : "Replacement"}
          </span>
        </div>
      </div>

      <h4 style={{ margin: "16px 0 10px", fontSize: "0.95rem", fontWeight: 800, color: "#111827" }}>
        1. Select Affected Fruit Lines to Compensate
      </h4>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
        {dispute.items.map((item) => {
          const line = dispute.order?.items.find((l) => l.id === item.orderItemId);
          return (
            <div
              key={item.orderItemId}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "12px 16px",
                borderRadius: 12,
                backgroundColor: "#f9fafb",
                border: "1px solid #e5e7eb",
              }}
            >
              <div>
                <strong style={{ fontSize: "0.95rem", color: "#111827" }}>
                  {line?.name ?? item.orderItemId.slice(0, 8)}
                </strong>
                <div style={{ fontSize: "0.82rem", color: "#6b7280", marginTop: 2 }}>
                  {line?.optionLabel ?? "Standard"} · Unit Price: {money(line?.unitPrice ?? 0)} · Max
                  Claimed: {item.quantity}
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <label style={{ fontSize: "0.85rem", fontWeight: 600, color: "#4b5563", margin: 0 }}>
                  Approve Qty:
                </label>
                <input
                  name={`approved-${item.orderItemId}`}
                  type="number"
                  min="0"
                  max={item.quantity}
                  defaultValue={item.quantity}
                  disabled={busy}
                  style={{
                    width: 70,
                    padding: "6px 10px",
                    borderRadius: 8,
                    border: "1px solid #d1d5db",
                    fontWeight: 700,
                    textAlign: "center",
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      <h4 style={{ margin: "16px 0 10px", fontSize: "0.95rem", fontWeight: 800, color: "#111827" }}>
        2. Resolution Payout & Action
      </h4>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14, marginBottom: 18 }}>
        <div>
          <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 700, marginBottom: 6, color: "#374151" }}>
            Action / Decision
          </label>
          <select
            name="decision"
            defaultValue="APPROVE"
            disabled={busy}
            style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid #d1d5db", backgroundColor: "white", fontWeight: 700 }}
          >
            <option value="APPROVE">✓ Approve Resolution & Payout</option>
            <option value="REJECT">✕ Decline / Reject Dispute</option>
          </select>
        </div>

        <div>
          <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 700, marginBottom: 6, color: "#374151" }}>
            Refund Destination
          </label>
          <select
            name="resolutionChoice"
            defaultValue="CREDIT"
            disabled={busy}
            style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid #16a34a", backgroundColor: "#f0fdf4", fontWeight: 700, color: "#15803d" }}
          >
            <option value="CREDIT">🎁 Refund to Store Credit (Customer Can Buy Again)</option>
            <option value="BANK_REFUND">🏦 Cash Refund (Direct to Bank)</option>
            <option value="REPLACEMENT">🔄 Dispatch Fruit Replacement</option>
          </select>
        </div>

        <div>
          <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 700, marginBottom: 6, color: "#374151" }}>
            Fault / Responsibility
          </label>
          <select
            name="responsibility"
            defaultValue="STORE"
            required
            disabled={busy}
            style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid #d1d5db", backgroundColor: "white" }}
          >
            <option value="STORE">Store / Packaging Issue</option>
            <option value="RIDER">Delivery Rider / Transit Issue</option>
            <option value="CUSTOMER">Customer Issue</option>
            <option value="UNDETERMINED">Undetermined</option>
          </select>
        </div>
      </div>

      <div style={{ marginBottom: 18 }}>
        <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 700, marginBottom: 6, color: "#374151" }}>
          Delivery Fee Handling
        </label>
        <select
          name="delivery"
          defaultValue="auto"
          disabled={busy}
          style={{ width: "100%", padding: "9px 12px", borderRadius: 10, border: "1px solid #d1d5db", backgroundColor: "white" }}
        >
          <option value="auto">Automatic (Refund delivery if whole order is compensated)</option>
          <option value="include">Include Delivery Fee in Credit Refund</option>
          <option value="exclude">Exclude Delivery Fee</option>
        </select>
      </div>

      <div style={{ marginBottom: 18 }}>
        <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 700, marginBottom: 6, color: "#374151" }}>
          Resolution Explanation (visible in customer chat & notification)
        </label>
        <textarea
          name="note"
          required
          minLength={5}
          maxLength={1000}
          disabled={busy}
          placeholder="Explain what was verified (e.g. 'We verified the damaged fruit in your photos and have credited your store balance with the full amount so you can order fresh stock anytime.')"
          rows={3}
          style={{
            width: "100%",
            padding: 12,
            borderRadius: 12,
            border: "1px solid #d1d5db",
            fontSize: "0.9rem",
            fontFamily: "inherit",
          }}
        />
      </div>

      {error && (
        <div style={{ padding: "10px 16px", borderRadius: 10, backgroundColor: "#fef2f2", color: "#dc2626", marginBottom: 16, fontSize: "0.9rem", fontWeight: 600 }}>
          {error}
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
        <button
          type="submit"
          className="button button-primary"
          disabled={busy}
          style={{
            padding: "12px 24px",
            fontSize: "0.95rem",
            fontWeight: 800,
            borderRadius: 12,
            backgroundColor: "#128a3a",
            color: "white",
            cursor: busy ? "not-allowed" : "pointer",
          }}
        >
          {busy ? "Processing Decision…" : "Save Decision & Apply Refund"}
        </button>
      </div>
    </form>
  );
}
