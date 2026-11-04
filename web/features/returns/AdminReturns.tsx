"use client";
import { useEffect, useRef, useState } from "react";
import { money } from "@/app/store/catalogue";
import type { ReturnView } from "./types";
export default function AdminReturns({ orderId, onChange }: { orderId: string; onChange?: () => void }) {
  const [open, setOpen] = useState(false), [view, setView] = useState<ReturnView | null>(null);
  const [error, setError] = useState(""), [busy, setBusy] = useState(false), [revision, setRevision] = useState(0);
  const [now, setNow] = useState(Date.now), [offset, setOffset] = useState(0);
  const lock = useRef(false), approval = useRef({ body: "", key: "" }), transferKeys = useRef<Record<string, string>>({});
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    void fetch(`/api/admin/returns/orders/${orderId}`, { cache: "no-store", signal: controller.signal }).then(async response => {
      const data = await response.json(); if (!response.ok) throw Error(data.error);
      if (!controller.signal.aborted) { setView(data); setOffset(Date.parse(data.serverTime) - Date.now()); }
    }).catch(error => { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "Unable to load returns"); });
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [open, orderId, revision]);
  async function post(url: string, body: unknown) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError("");
    try {
      const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json(); if (!response.ok) throw Error(data.error ?? "Unable to save return/refund");
      setRevision(value => value + 1); onChange?.(); return data;
    } catch (error) { setError(error instanceof Error ? error.message : "Unable to save return/refund"); }
    finally { lock.current = false; setBusy(false); }
  }
  return <section style={{ marginTop: 16 }}><button className="button" onClick={() => setOpen(value => !value)}>{open ? "Hide returns / refunds" : "Manage returns / refunds"}</button>
    {open && <div>{error && <p role="alert" className="form-error">{error}</p>}{!view ? <p>Loading return details…</p> : <>
      <form onSubmit={event => {
        event.preventDefault(); const form = new FormData(event.currentTarget);
        const body = { reason: form.get("reason"), refundDelivery: form.get("delivery") === "on", items: view.order.items.map(item => ({ orderItemId: item.id, quantity: Number(form.get(`qty-${item.id}`)), restock: form.get(`restock-${item.id}`) === "on" })).filter(item => item.quantity > 0) };
        const serialized = JSON.stringify(body); if (approval.current.body !== serialized) approval.current = { body: serialized, key: crypto.randomUUID() };
        if (!window.confirm("Approve this return and create customer credit? Only restock fruit you have inspected.")) return;
        void post(`/api/admin/returns/orders/${orderId}`, { ...body, key: approval.current.key });
      }}><h3>Approve received return</h3><p>Prices come from the paid order. Delivery fees are excluded unless selected. Returned fruit is not restocked by default.</p>
        {view.order.items.map(item => { const remaining = item.quantity - item.returnedItems.reduce((sum, value) => sum + value.quantity, 0); return <div key={item.id} className="field"><label>{item.name} · {item.optionLabel} · {money(item.unitPrice)} · {remaining} returnable<input name={`qty-${item.id}`} type="number" min="0" max={remaining} defaultValue="0" disabled={busy || !remaining} /></label><label><input type="checkbox" name={`restock-${item.id}`} disabled={busy || !remaining} /> Restock: inspected and safe to sell</label></div>; })}
        <label><input name="delivery" type="checkbox" disabled={busy} /> Also refund the remaining delivery fee</label><div className="field"><label>Return reason<textarea name="reason" minLength={3} maxLength={500} required disabled={busy} /></label></div>
        <button className="button" disabled={busy}>Approve return and credit</button></form>
      {view.credits.map(credit => { const pending = credit.transfers.find(transfer => transfer.state === "PENDING"); const remaining = Math.max(0, Date.parse(credit.refundDueAt) - (now + offset)); return <article key={credit.id} className="order-history-card" style={{ marginTop: 16 }}>
        <h3>Return {credit.id.slice(0, 8)}</h3><p>Approved {money(credit.approvedAmount)} · available {money(pending ? 0 : credit.balance)} · reserved for orders {money(credit.reserved)} · used {money(credit.spent)} · locked {money(credit.locked)} · refunded {money(credit.refunded)} · choice {remaining ? credit.choice === "CREDIT" ? "BUY AGAIN" : credit.choice.replaceAll("_", " ") : "BANK REFUND"}</p>
        <p>{remaining ? `Transfer available in ${Math.ceil(remaining / 60000)} minute(s). Buy again is the default during this window. Unused money goes to refund afterward.` : "Refund due. Buy again is the default during this window. Unused money goes to refund afterward."}</p>
        {pending ? <><p><strong>Locked transfer: {money(pending.amount)}</strong></p><p>{pending.bankDetails.bank} · {pending.bankDetails.accountNumber} · {pending.bankDetails.accountName}</p><p>Send exactly this amount using your bank. This screen does not initiate a bank transfer. Do not send again if the bank result is uncertain.</p>
          <form onSubmit={event => { event.preventDefault(); const reference = String(new FormData(event.currentTarget).get("reference")); if (window.confirm("Confirm the bank transfer succeeded for this exact locked amount?")) void post(`/api/admin/returns/${credit.id}/transfer`, { action: "confirm", transferId: pending.id, reference }); }}><label>Bank transfer reference<input name="reference" required minLength={3} maxLength={120} disabled={busy} /></label><button className="button" disabled={busy}>Confirm transferred</button></form>
          <button className="button" disabled={busy} onClick={() => { const reason = window.prompt("Only unlock after checking that NO money was sent. Enter the reason:"); if (reason && reason.trim().length >= 5) void post(`/api/admin/returns/${credit.id}/transfer`, { action: "unlock", transferId: pending.id, reason }); }}>Cancel lock — no money sent</button>
        </> : <><p>{credit.bankDetails ? `${credit.bankDetails.bank} · ${credit.bankDetails.accountNumber} · ${credit.bankDetails.accountName}` : "Awaiting customer refund bank details."}</p><button className="button button-primary" disabled={busy || remaining > 0 || credit.balance <= 0 || !credit.bankDetails} onClick={() => {
          if (!window.confirm("Lock the currently available remainder for manual transfer? It will no longer be spendable.")) return;
          transferKeys.current[credit.id] ??= crypto.randomUUID();
          void post(`/api/admin/returns/${credit.id}/transfer`, { action: "transfer", key: transferKeys.current[credit.id] }).then(data => { if (data) delete transferKeys.current[credit.id]; });
        }}>Transfer — lock remainder</button></>}
        {credit.transfers.filter(transfer => transfer.state !== "PENDING").map(transfer => <p key={transfer.id}>{transfer.state}: {money(transfer.amount)} {transfer.reference ?? ""}</p>)}
      </article>; })}
      <button className="text-link" disabled={busy} onClick={() => setRevision(value => value + 1)}>Refresh return balances</button>
    </>}</div>}
  </section>;
}
