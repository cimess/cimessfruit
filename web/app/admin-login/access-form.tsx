"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
export default function AdminAccessForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const authorizationKey = new FormData(event.currentTarget).get("authorizationKey");
    setPending(true); setError("");
    try {
      const response = await fetch("/api/account/admin-access", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ authorizationKey }) });
      const data = await response.json();
      if (!response.ok) throw Error(data.error ?? "Unable to activate access.");
      router.replace(data.alreadyAdmin ? "/admin" : "/login?intent=admin&adminActivated=1"); router.refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to activate access."); }
    finally { setPending(false); }
  }
  return <form onSubmit={submit}><div className="field"><label htmlFor="authorization-key">Authorization key</label><input id="authorization-key" name="authorizationKey" type="password" autoComplete="off" required maxLength={512} disabled={pending} placeholder="Enter the key from your store owner" /></div>{error && <p className="form-error" role="alert">{error}</p>}<button className="button button-primary" disabled={pending}>{pending ? "Checking authorization…" : "Activate admin access"}</button><p className="field-hint">Activation gives this account permission to manage products. You’ll sign in again after activation.</p></form>;
}
