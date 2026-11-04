"use client";
import VerificationForm from "../verify-email/verification-form";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
export default function Recover() {
  const initialized = useRef(false);
  const [token, setToken] = useState("");
  const [kind, setKind] = useState("reset");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    const values = new URLSearchParams(window.location.hash.slice(1));
    // Read browser-only fragment once after hydration.
    setToken(values.get("token") ?? ""); setKind(["verify", "reactivate"].includes(values.get("kind") ?? "") ? values.get("kind")! : "reset");
    window.history.replaceState(null, "", window.location.pathname);
  }, []);
  if (kind === "verify") return <main className="store-section" style={{ maxWidth: 480, margin: "auto" }}><VerificationForm /><Link href="/recover" onClick={() => setKind("reset")}>Password recovery</Link></main>;
  return <main className="store-section"><h1>{kind === "reset" ? "Reset your password" : kind === "reactivate" ? "Reactivate your account" : "Verify your email"}</h1><form className="profile-form" onSubmit={async event => {
    event.preventDefault(); if (busy) return; setBusy(true); setMessage("");
    const form = new FormData(event.currentTarget);
    try {
      const password = String(form.get("password") ?? "");
      if (token && kind === "reset" && password !== form.get("confirm")) throw Error("Passwords do not match.");
      const body = token ? { token, kind, ...(kind === "reset" ? { password } : {}) } : { email: form.get("email"), kind };
      const response = await fetch(`/api/recovery/${token ? "complete" : "request"}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json(); if (!response.ok) throw Error(data.error); setMessage(data.message);
      if (token) setToken("");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Please try again."); } finally { setBusy(false); }
  }}>{!token && <><label>Action<select value={kind} onChange={e => setKind(e.target.value)}><option value="reset">Reset password</option><option value="verify">Verify email</option><option value="reactivate">Reactivate account</option></select></label><label>Email<input name="email" type="email" autoComplete="email" required /></label></>}{token && kind === "reset" && <><label>New password<input name="password" type="password" autoComplete="new-password" minLength={12} maxLength={72} required /></label><label>Confirm password<input name="confirm" type="password" autoComplete="new-password" minLength={12} maxLength={72} required /></label></>}<button className="button button-primary" disabled={busy}>{busy ? "Please wait…" : token ? "Confirm" : "Send email"}</button><p role="status">{message}</p></form><Link href="/login">Back to sign in</Link></main>;
}
