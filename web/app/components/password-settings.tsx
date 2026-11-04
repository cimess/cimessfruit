"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export default function PasswordSettings({ hasPassword, email }: { hasPassword: boolean; email: string | null }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const password = String(form.get("password"));
    setError(""); setSuccess(false);
    if (password !== form.get("confirmPassword")) { setError("The passwords don’t match."); return; }
    if (new TextEncoder().encode(password).length > 72) { setError("Your password must be at most 72 UTF-8 bytes. Try fewer characters."); return; }
    setPending(true);
    try {
      const response = await fetch("/api/account/password", {
        method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, confirmPassword: form.get("confirmPassword"), ...(hasPassword ? { currentPassword: form.get("currentPassword") } : {}) }),
      });
      if (response.status === 401) { router.replace("/login"); router.refresh(); return; }
      const result = await response.json();
      if (!response.ok) throw Error(result.error ?? "Unable to save your password.");
      formElement.reset();
      if (result.signInRequired) { router.replace("/login?passwordChanged=1"); router.refresh(); return; }
      setSuccess(true); router.refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to save your password."); }
    finally { setPending(false); }
  }
  return <section className="password-settings" aria-labelledby="password-heading">
    <h2 id="password-heading">{hasPassword ? "Change your password" : "Set up password sign-in"}</h2>
    <p>{hasPassword ? "Update the password you use for CimessFruit." : "Google doesn’t share your password. Create a separate CimessFruit password so you can sign in without Google."}</p>
    {email && <p className="password-email">Sign-in email: <strong>{email}</strong></p>}
    {success ? <p className="notice" role="status">Your password is ready. You can now use your email and password on web or mobile.</p> : <form onSubmit={submit}>
      {hasPassword && <div className="field"><label htmlFor="current-password">Current password</label><input id="current-password" name="currentPassword" type="password" autoComplete="current-password" required maxLength={72} disabled={pending} /></div>}
      <div className="field"><label htmlFor="new-password">{hasPassword ? "New password" : "CimessFruit password"}</label><input id="new-password" name="password" type="password" autoComplete="new-password" required minLength={12} maxLength={72} disabled={pending} /><small>12–72 characters; maximum 72 UTF-8 bytes. Use a password unique to CimessFruit.</small></div>
      <div className="field"><label htmlFor="confirm-password">Confirm password</label><input id="confirm-password" name="confirmPassword" type="password" autoComplete="new-password" required minLength={12} maxLength={72} disabled={pending} /></div>
      {hasPassword && <p className="field-hint">Changing your password signs you out on all devices. Sign in again with your new password.</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <button type="submit" className="button button-primary" disabled={pending}>{pending ? "Saving password…" : hasPassword ? "Change password" : "Set password"}</button>
    </form>}
  </section>;
}
