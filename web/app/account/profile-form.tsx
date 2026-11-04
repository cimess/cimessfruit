"use client";
import VerifyEmail from "./verify-email";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
export default function ProfileForm({ freeShipping, name, phone, notificationsEnabled, email, emailVerified }: { freeShipping: number; email: string; emailVerified: boolean; name: string | null; phone: string | null; notificationsEnabled: boolean }) {
  const router = useRouter();
  const [pending,setPending] = useState(false);
  const [error,setError] = useState("");
  const [saved,setSaved] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);setError("");setSaved(false);
    try {
      const response = await fetch("/api/profile", { method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({ name:form.get("name"),phone:form.get("phone") || null,notificationsEnabled:form.get("notifications") === "on" }) });
      const result = await response.json();
      if (!response.ok) throw Error(result.error ?? "Unable to update your account.");
      setSaved(true); router.refresh();
    } catch(err) { setError(err instanceof Error ? err.message : "Unable to save changes."); }
    finally {setPending(false);}
  }
  return <form onSubmit={submit}><div className="field"><span>Free deliveries remaining</span><p><strong>{freeShipping}</strong> · Select free shipping at checkout to use one per order.</p></div><div className="field"><span>Email</span><p>{email}</p><strong style={{ color: emailVerified ? "#128A3A" : "#92400e" }}>{emailVerified ? "Verified" : "Unverified"}</strong>{!emailVerified && <VerifyEmail />}</div><div className="field"><label htmlFor="profile-name">Name</label><input id="profile-name" name="name" defaultValue={name ?? ""} autoComplete="name" required minLength={2} maxLength={100} disabled={pending} /></div><div className="field"><label htmlFor="profile-phone">Phone number</label><input id="profile-phone" name="phone" type="tel" autoComplete="tel" defaultValue={phone ?? ""} pattern="\+?[0-9]{8,15}" disabled={pending} /></div><label className="availability-toggle"><input name="notifications" type="checkbox" defaultChecked={notificationsEnabled} disabled={pending} /><span>Save my preference for order updates</span></label>{error && <p className="form-error" role="alert">{error}</p>}{saved && <p className="notice" role="status">Your account details are saved.</p>}<button className="button button-primary" disabled={pending}>{pending ? "Saving…" : "Save details"}</button></form>;
}
