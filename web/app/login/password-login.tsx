"use client";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export default function PasswordLogin({ destination = "/account" }: { destination?: "/account" | "/admin-login" | "/checkout" }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [show, setShow] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true); setError("");
    try {
      const response = await fetch("/api/mobile/login", {
        method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emailOrPhone: form.get("email"), password: form.get("password") }),
      });
      const data = await response.json();
      if (!response.ok) throw Error(response.status === 401 ? "Email or password is incorrect. If you joined with Google, sign in with Google first and set a CimessFruit password in your account." : data.error ?? "Unable to sign in.");
      // Refresh server-rendered account/role information after the HttpOnly cookie is set.
      router.replace(destination); router.refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to sign in. Please try again."); }
    finally { setPending(false); }
  }
  return <form onSubmit={submit} className="password-login">
    <div className="field"><label htmlFor="login-email">Email address</label><input id="login-email" name="email" type="email" autoComplete="username" placeholder="you@example.com" maxLength={254} required disabled={pending} /></div>
    <div className="field"><label htmlFor="login-password">CimessFruit password</label><div className="password-input"><input id="login-password" name="password" type={show ? "text" : "password"} autoComplete="current-password" maxLength={72} required disabled={pending} /><button type="button" aria-label={show ? "Hide password" : "Show password"} aria-pressed={show} onClick={() => setShow(!show)}>{show ? "Hide" : "Show"}</button></div></div>
    {error && <p className="form-error" role="alert">{error}</p>}
    <button type="submit" className="button button-primary password-submit" disabled={pending}>{pending ? "Signing in…" : "Sign in with password"}</button>
  <p><Link href="/recover#kind=reactivate">Reactivate a disabled account</Link></p></form>;
}
