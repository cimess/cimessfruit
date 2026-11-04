"use client";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
export default function SignupForm({ admin = false, checkout = false }: { admin?: boolean; checkout?: boolean }) {
  const router = useRouter();
  const [pending,setPending] = useState(false);
  const [error,setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password"));
    setError("");
    if (password !== form.get("confirmPassword")) { setError("Your passwords don’t match."); return; }
    if (new TextEncoder().encode(password).length > 72) { setError("Use a password of at most 72 UTF-8 bytes."); return; }
    setPending(true);
    try {
      const response = await fetch("/api/mobile/signup", { method:"POST", credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({ name:form.get("name"),email:form.get("email"),phoneNumber:form.get("phone"),password }) });
      const result = await response.json();
      if (!response.ok) throw Error(result.error ?? "Unable to create your account.");
      router.replace(admin ? "/admin-login" : checkout ? "/checkout" : "/account"); router.refresh();
    } catch(err) { setError(err instanceof Error ? err.message : "Unable to create your account."); }
    finally { setPending(false); }
  }
  return <form onSubmit={submit}><fieldset className="signup-fields" disabled={pending}><div className="field"><label htmlFor="signup-name">Your name</label><input id="signup-name" name="name" autoComplete="name" required minLength={2} maxLength={100} /></div><div className="field"><label htmlFor="signup-email">Email address</label><input id="signup-email" name="email" type="email" autoComplete="email" required maxLength={254} /></div><div className="field"><label htmlFor="signup-phone">Phone number</label><input id="signup-phone" name="phone" type="tel" autoComplete="tel" required pattern="\+?[0-9]{8,15}" placeholder="08012345678" /></div><div className="field"><label htmlFor="signup-password">Password</label><input id="signup-password" name="password" type="password" autoComplete="new-password" minLength={12} maxLength={72} required /><small>12–72 characters; maximum 72 UTF-8 bytes.</small></div><div className="field"><label htmlFor="signup-confirm">Confirm password</label><input id="signup-confirm" name="confirmPassword" type="password" autoComplete="new-password" minLength={12} maxLength={72} required /></div></fieldset>{error && <p className="form-error" role="alert">{error}</p>}<button className="button button-primary password-submit" disabled={pending}>{pending ? "Creating your account…" : "Create account"}</button><p><Link href="/recover#kind=reactivate">Reactivate a disabled account</Link></p></form>;
}
