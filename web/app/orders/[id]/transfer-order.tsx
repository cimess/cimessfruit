"use client";
import CustomerReturns from "@/features/returns/CustomerReturns";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { money } from "../../store/catalogue";
import { paymentLabels, manualPaymentAccount } from "@/validation/checkout-validation";
type Order = { id: string; total: number; creditApplied?: number; payment: { providerReference: string; amount: number }; deliveryFee: number; status: string; paymentStatus: string; estimatedDeliveryTime: string; deliveryAddress: { streetOrClose: string; houseNumber: string; phoneNumber: string }; items: { id: string; name: string; optionLabel: string; quantity: number; subtotal: number }[] };
export default function TransferOrder({ id }: { id: string }) {
  const [order, setOrder] = useState<Order | null>(null);
  const [account, setAccount] = useState<typeof manualPaymentAccount | null>(null);
  const [eligibility, setEligibility] = useState<{ eligible: boolean; issues: string[] } | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const lock = useRef(false);
  const router = useRouter();
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setError(""); setAccount(null); setEligibility(null);
      try {
        const response = await fetch(`/api/orders/${id}`, { cache: "no-store", signal: controller.signal });
        if (response.status === 401) { router.replace("/login"); return; }
        const data = await response.json();
        if (!response.ok) throw Error(data.error ?? "Unable to load your order.");
        setOrder(data.order); setAccount(data.account); setEligibility(data.eligibility);
      } catch (err) { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "Unable to load your order."); }
    }
    void load();
    const refresh = () => { if (!lock.current) { setAccount(null); setEligibility(null); setRevision((value) => value + 1); } };
    const timer = process.env.NEXT_PUBLIC_SSE_ENABLED === "true" ? undefined : window.setInterval(refresh, 30000);
    window.addEventListener("cimessfruit:orders", refresh);
    window.addEventListener("focus", refresh);
    return () => { controller.abort(); window.clearInterval(timer); window.removeEventListener("focus", refresh); window.removeEventListener("cimessfruit:orders", refresh); };
  }, [id, router, revision]);
  async function act(action: "reported" | "cancel") {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError("");
    try {
      const response = await fetch(`/api/orders/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
      const data = await response.json();
      if (!response.ok) throw Error(data.error ?? "Please try again.");
      setOrder(data.order); setAccount(data.account); setEligibility(data.eligibility);
      setNotice(action === "reported" ? "Transfer reported. The store will verify your payment." : "Order cancelled.");
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to update order."); }
    finally { lock.current = false; setBusy(false); }
  }
  return <><div className="store-page-heading"><p className="eyebrow">YOUR ORDER</p><h1>{order?.paymentStatus === "SUCCESS" ? "Payment verified." : order?.paymentStatus === "REVIEW_REQUIRED" ? "Awaiting verification." : order?.status === "CANCELLED" ? "Order cancelled." : eligibility?.eligible ? "Transfer payment." : eligibility ? "Payment is blocked." : "Checking payment requirements."}</h1><p>Order {id.slice(0, 8).toUpperCase()}</p></div>
    {error && <p className="form-error" role="alert">{error}</p>}{notice && <p role="status" className="notice">{notice}</p>}
    {order && <CustomerReturns orderId={id} />}
    {!order ? <button className="button" onClick={() => setRevision((value) => value + 1)}>Reload order</button> : <div className="bag-layout">
      <div className="checkout-address"><h2>{paymentLabels[order.paymentStatus]}</h2>
        {order.paymentStatus === "PENDING" && order.status === "PENDING" && account && eligibility?.eligible ? <><p>Transfer within 24 hours of placing your order. Send the exact amount below, then tap “I have paid”. Your payment will be checked by the store.</p><dl className="transfer-details"><dt>Bank</dt><dd>{account.bank}</dd><dt>Account number</dt><dd>{account.accountNumber}</dd><dt>Account name</dt><dd>{account.accountName}</dd><dt>Amount</dt><dd>{money(order.payment.amount)}</dd><dt>Transfer reference</dt><dd>{order.payment.providerReference}</dd></dl><button className="button" onClick={async () => { try { await navigator.clipboard.writeText(account.accountNumber); setNotice("Account number copied."); } catch { setError("Couldn’t copy. Select the account number above to copy it."); } }}>Copy account number</button><div className="checkout-actions"><button className="button button-primary" disabled={busy} onClick={() => void act("reported")}>{busy ? "Saving…" : "I have paid"}</button><button className="button" disabled={busy} onClick={() => { if (window.confirm("Cancel this unpaid order and release its items? Only cancel if you have not transferred money.")) void act("cancel"); }}>Cancel unpaid order</button></div></>  : order.status === "PENDING" && order.paymentStatus === "PENDING" ? <div>
          {!eligibility ? <p role="status">Checking order availability before showing payment details…</p> : <><h3>Payment is blocked</h3>{eligibility.issues.map((issue) => <p role="alert" className="form-error" key={issue}>{issue}</p>)}<p>Do not send a transfer for this order. Cancel it and update your bag, or contact the store.</p>
          <button className="button" disabled={busy} onClick={() => { if (window.confirm("Cancel this order? Only cancel if you have not transferred money.")) void act("cancel"); }}>Cancel unpaid order</button>
          <p>If you already transferred before availability changed, report it for review.</p><button className="button" disabled={busy} onClick={() => void act("reported")}>I already transferred — report for review</button></>}
        </div> : <p>{order.paymentStatus === "REVIEW_REQUIRED" ? "Your transfer has been reported. Please do not pay again. The store will confirm receipt before preparing your delivery." : order.paymentStatus === "SUCCESS" ? order.payment.amount === 0 ? "This order was paid using return credit." : "The store has confirmed your payment." : order.status !== "CANCELLED" ? "This order uses a different payment method. Contact the store for payment instructions." : "This order is cancelled. If you already sent money, contact the store with your order reference."}</p>}
        <button className="text-link" disabled={busy} onClick={() => setRevision((value) => value + 1)}>Refresh payment status</button>
      </div><aside className="bag-summary"><h2>Order summary</h2>{order.items.map((item) => <div key={item.id}><span>{item.quantity} × {item.name} · {item.optionLabel}</span><strong>{money(item.subtotal)}</strong></div>)}<div><span>Delivery</span><strong>{money(order.deliveryFee)}</strong></div><div><span>Total</span><strong>{money(order.total)}</strong></div><p>Return credit applied: {money(order.creditApplied ?? 0)} · bank payment: {money(order.payment.amount)}</p><p>{order.deliveryAddress.houseNumber}, {order.deliveryAddress.streetOrClose}, Abesan Estate<br />{order.deliveryAddress.phoneNumber}</p><p>Estimated delivery: {order.estimatedDeliveryTime} after payment verification.</p><Link href="/orders" className="button">All orders</Link></aside></div>}
  </>;
}
