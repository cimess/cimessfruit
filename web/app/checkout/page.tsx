"use client";
import CheckoutCredit from "@/features/returns/CheckoutCredit";
import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import StoreShell from "../store/store-shell";
import { useBasketReview } from "../store/use-basket-review";
import BasketChecks from "../store/basket-checks";
import { useCart } from "../store/use-cart";
import { money } from "../store/catalogue";
import { deliveryAddressSchema } from "@/validation/checkout-validation";

type Settings = { zone: { name: string; isAvailable: boolean; deliveryFee: number; estimatedMinutesMin: number; estimatedMinutesMax: number } | null; profile: { freeShipping: number; phone: string | null; deliveryAddress: Record<string, string> | null } | null };
const fields = [
  ["streetOrClose", "Street or close", true], ["houseNumber", "House number", true],
  ["flatOrBlock", "Flat or block", false], ["landmark", "Landmark", false],
  ["phoneNumber", "Phone number", true], ["note", "Delivery note", false],
] as const;
export default function CheckoutPage() {
  const cart = useCart();
  const [useFreeShipping, setUseFreeShipping] = useState(false);
  const [useReturnCredit, setUseReturnCredit] = useState(false);
  const [replacementId, setReplacementId] = useState("");
  const check = useBasketReview(cart.items);
  const [addressValid, setAddressValid] = useState(false);
  const router = useRouter();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setError("");
      try {
        const response = await fetch("/api/checkout", { cache: "no-store", signal: controller.signal });
        if (response.status === 401) { router.replace("/login?intent=checkout"); return; }
        const data = await response.json();
        if (!response.ok) throw Error(data.error ?? "Unable to load checkout.");
        setSettings(data);
        setAddressValid(deliveryAddressSchema.safeParse({ ...data.profile?.deliveryAddress, zoneId: "abesan-estate", phoneNumber: data.profile?.deliveryAddress?.phoneNumber ?? data.profile?.phone ?? "" }).success);
      } catch (err) { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "Unable to load checkout."); }
    }
    void load(); return () => controller.abort();
  }, [router, revision]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current) return;
    setError("");
    if (!check.review?.eligible) { setError("Resolve the availability issues before continuing to payment."); return; }
    const form = new FormData(event.currentTarget);
    const address = deliveryAddressSchema.safeParse({ zoneId: "abesan-estate", ...Object.fromEntries(form) });
    if (!address.success) { setError("Add a valid street, house number and phone number (8–15 digits)."); return; }
    lock.current = true; setBusy(true);
    try {
      const payload = JSON.stringify({ items: cart.items.map(({ productId, optionId, quantity }) => ({ productId, optionId, quantity })), deliveryAddress: address.data, useFreeShipping: applyFreeShipping, useReturnCredit, ...(replacementId ? { replacementDisputeId: replacementId } : {}) });
      // Retain the exact request key across retries, refreshes and lost responses.
      let previous: { payload: string; key: string } | null = null;
      try { previous = JSON.parse(sessionStorage.getItem("cimessfruit.checkout") ?? "null"); } catch { /* Ignore an invalid saved checkout. */ }
      const key = previous?.payload === payload ? previous.key : crypto.randomUUID();
      sessionStorage.setItem("cimessfruit.checkout", JSON.stringify({ payload, key }));
      const response = await fetch("/api/checkout", { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": key }, body: payload });
      if (response.status === 401) { router.push("/login?intent=checkout"); return; }
      const data = await response.json();
      if (!response.ok) { check.refresh(); throw Error(data.error ?? "Unable to place order."); }
      try { sessionStorage.removeItem("cimessfruit.checkout"); cart.clear(); } catch { /* The saved order remains accessible even if browser storage is unavailable. */ }
      router.push(`/orders/${data.order.id}`);
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to place order. Please retry."); }
    finally { lock.current = false; setBusy(false); }
  }
  const zone = settings?.zone;
  const applyFreeShipping = useFreeShipping && !replacementId && (settings?.profile?.freeShipping ?? 0) > 0 && (zone?.deliveryFee ?? 0) > 0;
  const subtotal = check.review?.itemSubtotal;
  return <StoreShell><section className="store-page-heading"><p className="eyebrow">CHECKOUT</p><h1>Delivery details.</h1><p>Delivery within Abesan Estate. Pay by bank transfer.</p></section><section className="store-section">
    {error && <div role="alert" className="form-error">{error} {!settings && <button className="button" onClick={() => setRevision((value) => value + 1)}>Try again</button>}</div>}
    {!settings ? <p role="status">Loading checkout…</p> : !cart.items.length ? <div className="empty-state"><h2>Your bag is empty.</h2><Link href="/shop" className="button button-primary">Browse fruit</Link><p><Link href="/orders">View your orders</Link></p></div> :
    <form className="bag-layout checkout-layout" onSubmit={submit} onChange={(event) => setAddressValid(deliveryAddressSchema.safeParse({ zoneId: "abesan-estate", ...Object.fromEntries(new FormData(event.currentTarget)) }).success)}><fieldset className="checkout-address" disabled={busy}><h2>Your delivery address</h2><p>{zone?.name ?? "Abesan Estate"} · {zone ? `${zone.estimatedMinutesMin}–${zone.estimatedMinutesMax} mins` : "Delivery unavailable"}</p><p className="muted">Delivery is available inside Abesan Estate only.</p>{fields.map(([name, label, required]) => <div className="field" key={name}><label htmlFor={name}>{label}{!required && <span> optional</span>}</label><input id={name} name={name} required={required} type={name === "phoneNumber" ? "tel" : "text"} maxLength={name === "note" ? 500 : name === "phoneNumber" ? 16 : name === "houseNumber" || name === "flatOrBlock" ? 100 : 200} defaultValue={settings.profile?.deliveryAddress?.[name] ?? (name === "phoneNumber" ? settings.profile?.phone ?? "" : "")} /></div>)}</fieldset>
      <aside className="bag-summary"><h2>Your order</h2>{cart.items.map((item) => <div key={item.optionId}><span>{item.quantity} × {item.name}<small> · {item.label}</small></span><strong>{check.review?.lines.find((line) => line.optionId === item.optionId)?.issue ? "Unavailable" : money((check.review?.lines.find((line) => line.optionId === item.optionId)?.price ?? item.price) * item.quantity)}</strong></div>)}<div><span>Items</span><strong>{subtotal != null ? money(subtotal) : "Awaiting checks"}</strong></div><div><span>Delivery</span><strong>{zone ? money(replacementId || applyFreeShipping ? 0 : zone.deliveryFee) : "Unavailable"}</strong></div><div><span>Estimated total</span><strong>{check.review?.total != null ? money(check.review.total - (replacementId || applyFreeShipping ? zone?.deliveryFee ?? 0 : 0)) : "Unavailable"}</strong></div><p>We’ll confirm current prices and reserve your items before showing the exact transfer amount.</p><BasketChecks check={check} /><p>{addressValid ? "✓ Delivery address and phone complete." : "Complete your street, house number and valid phone number to proceed."}</p>{check.review?.eligible && addressValid && <p>Payment method: <strong>{useReturnCredit ? "Return credit, then transfer any remainder" : "Bank transfer"}</strong></p>}<label className="availability-toggle"><input type="checkbox" checked={!!applyFreeShipping} onChange={event => setUseFreeShipping(event.target.checked)} disabled={busy || !!replacementId || !(zone?.deliveryFee) || !(settings.profile?.freeShipping)} /><span>Use one free delivery ({settings.profile?.freeShipping ?? 0} remaining)</span></label><CheckoutCredit selected={useReturnCredit} onChange={setUseReturnCredit} replacementId={replacementId} onReplacement={setReplacementId} /><button className="button button-primary" disabled={busy || !zone?.isAvailable || !check.review?.eligible || !addressValid}>{busy ? "Preparing your order…" : useReturnCredit ? "Place order using credit" : "Continue to transfer"}</button><Link href="/cart" className="text-link">Back to bag</Link></aside>
    </form>}
  </section></StoreShell>;
}
