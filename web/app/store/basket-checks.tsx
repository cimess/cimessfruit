"use client";
import Link from "next/link";
import type { useBasketReview } from "./use-basket-review";
export default function BasketChecks({ check }: { check: ReturnType<typeof useBasketReview> }) {
  return <div className="basket-checks" aria-live="polite"><h3>Checkout requirements</h3>
    {check.checking ? <p role="status">Checking current stock, prices and delivery…</p> : check.error ? <p role="alert">{check.error}</p> : check.review && <>
      {check.review.lines.map((line) => <p key={line.optionId} className={line.issue ? "form-error" : ""}>{line.issue ? "✕" : "✓"} {line.name} · {line.label}: {line.issue ?? "Available for your quantity"}</p>)}
      {check.review.issues.map((issue) => <p className="form-error" key={issue}>{issue}</p>)}
      {check.review.eligible && <p>✓ Stock, prices and delivery checked.</p>}
    </>}
    {check.signIn ? <Link className="button button-primary" href="/login?intent=checkout">Sign in to continue</Link> : <button type="button" className="text-link" disabled={check.checking} onClick={check.refresh}>Recheck availability</button>}
  </div>;
}
