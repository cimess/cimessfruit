"use client";
import StoreShell from "../store/store-shell";
export default function CustomerError({ reset }: { reset: () => void }) {
  return <StoreShell><section className="empty-state" role="alert"><h1>We couldn’t load this page.</h1><p>Your account data is temporarily unavailable. Please try again.</p><button className="button button-primary" onClick={reset}>Try again</button></section></StoreShell>;
}
