"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
export default function VerificationForm({ initialEmail = "" }: { initialEmail?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function submit(complete: boolean) {
    if (busy) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/recovery/${complete ? "complete" : "request"}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), kind: "verify", ...(complete ? { token: code } : {}) }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Please try again.");
      setMessage(data.message);
      if (complete) { setDone(true); router.refresh(); }
      else { setSent(true); setCode(""); }
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to reach the server. Please retry."); }
    finally { setBusy(false); }
  }
  return <>
    <p className="eyebrow">ACCOUNT SECURITY</p><h1>{done ? "Email verified" : "Verify your email"}</h1>
    {done ? <p>Your email is now verified.</p> : <>
      <p>{sent ? "Enter the six-digit code from your email. It expires in 10 minutes. Only the latest code works." : "We’ll email you a six-digit code to confirm this address belongs to you."}</p>
      <form className="profile-form" onSubmit={event => { event.preventDefault(); void submit(sent); }}>
        <label>Email address<input type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} readOnly={sent} disabled={busy} maxLength={254} required /></label>
        {sent && <label>Verification code<input autoFocus type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={event => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} disabled={busy} placeholder="000000" required style={{ fontSize: 28, letterSpacing: "0.3em" }} /></label>}
        <button className="button button-primary" disabled={busy || (sent && code.length !== 6)}>{busy ? "Please wait…" : sent ? "Verify email" : "Send verification code"}</button>
        {sent && <div><button type="button" className="button" disabled={busy} onClick={() => void submit(false)}>Resend code</button><button type="button" className="button" disabled={busy} onClick={() => { setSent(false); setCode(""); setMessage(""); }}>Change email</button></div>}
      </form>
    </>}
    {message && <p role="status">{message}</p>}
    <Link href="/account" className="text-link">Back to profile →</Link>
  </>;
}
