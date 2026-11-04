"use client";
import AdminReturns from "@/features/returns/AdminReturns";
import { useEffect, useRef, useState } from "react";
import { money } from "../../store/catalogue";
import { paymentLabels } from "@/validation/checkout-validation";
type Order = { creditApplied?: number; id: string; status: string; paymentStatus: string; total: number; createdAt: string; deliveryAddress: { accountDeleted?: boolean; houseNumber: string; streetOrClose: string; zoneId: string; phoneNumber: string; flatOrBlock?: string; landmark?: string; note?: string; coordinates?: { latitude: number; longitude: number } }; payment: { providerReference: string; amount: number } | null; items: { id: string; name: string; optionLabel: string; quantity: number }[] };
export default function AdminOrders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const lock = useRef(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true); setError("");
      try {
        const params = new URLSearchParams({ limit: "20" });
        if (cursor) params.set("cursor", cursor);
        const response = await fetch(`/api/admin/orders?${params}`, { cache: "no-store", signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw Error(data.error ?? "Unable to load orders.");
        if (!controller.signal.aborted) {
          setOrders(previous => cursor
            ? [...new Map([...previous, ...data.orders].map((order: Order) => [order.id, order])).values()]
            : data.orders);
          setNextCursor(data.nextCursor);
        }
      } catch (err) { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "Unable to load orders."); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void load(); return () => controller.abort();
  }, [revision, cursor]);
  async function update(id: string, action: "verify" | "reject" | "process" | "dispatch" | "deliver") {
    if (lock.current) return;
    if (["verify", "reject"].includes(action) && !window.confirm(action === "verify" ? "Confirm you have checked the bank account and received this order’s exact payment?" : "Reject this transfer and cancel the order? Check the bank account first; this does not refund money.")) return;
    lock.current = true; setBusy(id); setError("");
    try {
      const response = await fetch(`/api/admin/orders/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
      const data = await response.json();
      if (!response.ok) throw Error(data.error ?? "Unable to update payment.");
      setOrders((values) => values.map((order) => order.id === id ? data.order : order));
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to update payment."); }
    finally { lock.current = false; setBusy(""); }
  }
  return <><div className="page-heading"><div><p className="eyebrow">TRANSFER PAYMENTS</p><h1>Orders & payments.</h1><p>Check your bank account before verifying a transfer. Newest orders first. Load more to see older orders.</p></div><button className="button" disabled={!!busy || loading} onClick={() => { setCursor(null); setNextCursor(null); setOrders([]); setRevision(value => value + 1); }}>Refresh</button></div>{error && <p role="alert" className="form-error">{error}</p>}{loading && !orders.length ? <p role="status">Loading orders…</p> : !orders.length ? <p>No transfer orders yet.</p> : <div className="order-list">{orders.map((order) => <article className="order-history-card" key={order.id}><header><strong>Order {order.id.slice(0, 8).toUpperCase()}</strong><strong>{money(order.total)}</strong></header><p>{paymentLabels[order.paymentStatus]} · {order.status.toLowerCase()}</p><p>Return credit: {money(order.creditApplied ?? 0)} · bank payment to verify: {money(order.payment?.amount ?? order.total)}</p><p className="transfer-reference">{order.payment?.providerReference ?? "Reference unavailable"}</p>{order.items.map((item) => <p key={item.id}>{item.quantity} × {item.name} · {item.optionLabel}</p>)}{order.deliveryAddress.accountDeleted ? <p>Customer account deleted. Delivery and contact details removed.</p> : <p>{order.deliveryAddress.houseNumber}, {order.deliveryAddress.streetOrClose}, {order.deliveryAddress.zoneId} · {order.deliveryAddress.phoneNumber}</p>}{order.deliveryAddress.coordinates && <a target="_blank" rel="noreferrer" href={`https://www.google.com/maps/search/?api=1&query=${order.deliveryAddress.coordinates.latitude},${order.deliveryAddress.coordinates.longitude}`}>Open delivery pin</a>}<p>{order.deliveryAddress.flatOrBlock} {order.deliveryAddress.landmark} {order.deliveryAddress.note}</p>{order.paymentStatus === "REVIEW_REQUIRED" && order.status === "PENDING" && <div className="checkout-actions"><button className="button button-primary" disabled={!!busy} onClick={() => void update(order.id, "verify")}>{busy === order.id ? "Saving…" : "Verify payment received"}</button><button className="button" disabled={!!busy} onClick={() => void update(order.id, "reject")}>Reject & cancel</button></div>}{order.paymentStatus === "SUCCESS" && ["PAID", "PROCESSING", "DISPATCHED"].includes(order.status) && <button className="button button-primary" disabled={!!busy} onClick={() => void update(order.id, order.status === "PAID" ? "process" : order.status === "PROCESSING" ? "dispatch" : "deliver")}>{order.status === "PAID" ? "Start preparing" : order.status === "PROCESSING" ? "Mark dispatched" : "Mark delivered"}</button>}{order.paymentStatus === "SUCCESS" && <AdminReturns orderId={order.id} onChange={() => setRevision(value => value + 1)} />}</article>)}</div>}{nextCursor && <div className="catalogue-more"><button className="button" disabled={loading || !!busy} onClick={() => error ? setRevision(value => value + 1) : setCursor(nextCursor)}>{loading ? "Loading…" : error ? "Retry loading orders" : "Load more orders"}</button></div>}</>;
}
