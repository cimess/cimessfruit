import * as Crypto from "expo-crypto";
import { apiRequest, apiOrigin, readStoredSession } from "@/lib/api";
import type { Order, OrderDraft } from "./types";
type ServerOrder = { usedFreeShipping?: boolean; creditApplied?: number; payment?: { amount: number }; id: string; status: string; paymentStatus: string; createdAt: string; updatedAt: string; estimatedDeliveryTime: string; deliveryAddress: OrderDraft["deliveryAddress"]; deliveryFee: number; itemSubtotal: number; total: number; items: { id: string; productOptionId: string; name: string; optionLabel: string; optionDetail: string; quantity: number; unitPrice: number; subtotal: number; imageUrl: string | null }[] };
type Result = { order: ServerOrder; account?: Order["account"]; eligibility?: Order["eligibility"] };
function mapOrder(result: Result): Order {
  const o = result.order;
  return { ...o, creditApplied: (o.creditApplied ?? 0) / 100, amountDue: (o.payment?.amount ?? (o.total - (o.creditApplied ?? 0))) / 100, account: result.account, eligibility: result.eligibility, status: o.status.toLowerCase() as Order["status"], paymentStatus: o.paymentStatus === "SUCCESS" ? "payment_verified" : o.paymentStatus === "FAILED" ? "rejected" : o.paymentStatus === "REVIEW_REQUIRED" ? "review_required" : "pending", smoothieFee: 0,
    deliveryFee: o.deliveryFee / 100, itemSubtotal: o.itemSubtotal / 100, total: o.total / 100,
    items: o.items.map(i => ({ ...i, lineId: i.id, productId: "", optionId: i.productOptionId, unitPrice: i.unitPrice / 100, subtotal: i.subtotal / 100, image: i.imageUrl ? { uri: new URL(i.imageUrl, apiOrigin()).href } : require("@/assets/images/thumbs/banana.webp") })) };
}
let pending: { body: string; key: string; owner: string } | undefined;
export async function createOrder(draft: OrderDraft): Promise<Order> {
  if (draft.smoothieFee) throw new Error("Custom blending is currently unavailable. Remove it before checkout.");
  const body = JSON.stringify({ items: draft.items.map(i => ({ productId: i.productId, optionId: i.optionId, quantity: i.quantity })), deliveryAddress: draft.deliveryAddress, useFreeShipping: draft.useFreeShipping ?? false, useReturnCredit: draft.useReturnCredit ?? false, ...(draft.replacementDisputeId ? { replacementDisputeId: draft.replacementDisputeId } : {}) });
  const owner = (await readStoredSession())?.token;
  if (!owner) throw new Error("Please sign in.");
  if (pending?.body !== body || pending.owner !== owner) pending = { body, owner, key: Crypto.randomUUID() };
  return mapOrder(await apiRequest<Result>("/api/checkout", { method: "POST", headers: { "Idempotency-Key": pending.key }, body }));
}
export async function fetchOrders(signal?: AbortSignal) { return (await apiRequest<{orders: ServerOrder[]}>("/api/orders", { signal })).orders.map(order => mapOrder({ order })); }
export async function fetchOrder(id: string, signal?: AbortSignal) { return mapOrder(await apiRequest<Result>(`/api/orders/${encodeURIComponent(id)}`, { signal })); }
export async function reportPayment(id: string) {
  const result = mapOrder(await apiRequest<Result>(`/api/orders/${id}`, { method: "POST", body: JSON.stringify({ action: "reported" }) }));
  pending = undefined;
  return result;
}
export async function confirmDelivery(id: string) {
  return mapOrder(await apiRequest<Result>(`/api/orders/${id}`, { method: "POST", body: JSON.stringify({ action: "confirm_delivery" }) }));
}
export async function reportIssue(id: string, disputeReason: string, disputeCategory: string) {
  return mapOrder(await apiRequest<Result>(`/api/orders/${id}`, { method: "POST", body: JSON.stringify({ action: "dispute", disputeReason, disputeCategory }) }));
}
