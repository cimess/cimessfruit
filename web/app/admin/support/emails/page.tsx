"use client";
import { useEffect, useState } from "react";

type Summary = { id: string; from: string; subject: string; status: string; receivedAt: string };
type Email = Summary & { body: string; attachments: { id: string; filename?: string }[]; replies: { id: string; body: string; state: string }[] };
async function api(path: string, options?: RequestInit) {
  const response = await fetch(`/api/admin/support/emails${path}`, { ...options, cache: "no-store", headers: { "Content-Type": "application/json" } });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Unable to load support emails.");
  return data;
}
export default function SupportEmailPage() {
  const [status, setStatus] = useState("OPEN");
  const [emails, setEmails] = useState<Summary[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [email, setEmail] = useState<Email | null>(null);
  const [recipient, setRecipient] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [attempt, setAttempt] = useState<{ key: string; body: string } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    api(`?status=${status}`).then(data => { if (active) { setEmails(data.emails); setCursor(data.nextCursor); } })
      .catch(e => { if (active) setError(e.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [status, revision]);
  useEffect(() => {
    if (!selected) return;
    let active = true;
    api(`/${selected}`).then(data => { if (active) { setEmail(data.email); setRecipient(data.recipient); } })
      .catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [selected, revision]);
  async function more() {
    setBusy(true); setError("");
    try { const data = await api(`?status=${status}&before=${encodeURIComponent(cursor!)}`); setEmails(old => [...old, ...data.emails]); setCursor(data.nextCursor); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function update(reply: boolean) {
    if (!email) return;
    setBusy(true); setError("");
    const payload = reply ? attempt ?? { key: crypto.randomUUID(), body: draft.trim() } : { status: email.status === "OPEN" ? "CLOSED" : "OPEN" };
    if (reply) setAttempt(payload as { key: string; body: string });
    try {
      await api(`/${email.id}`, { method: reply ? "POST" : "PATCH", body: JSON.stringify(payload) });
      if (reply) { setDraft(""); setAttempt(null); }
      setRevision(v => v + 1);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <section style={{ maxWidth: 900, margin: "0 auto" }}>
    <h1>Support email</h1><p className="muted">Read customer emails and reply from your support inbox.</p>
    {error && <p role="alert">{error}</p>}
    {selected ? <>
      <button className="button" disabled={busy} onClick={() => { setSelected(null); setEmail(null); setDraft(""); setAttempt(null); setError(""); }}>Back to inbox</button>
      {!email ? <p role="status">Loading email…</p> : <article>
        <h2>{email.subject || "(No subject)"}</h2><p>From: {email.from}</p><p>{new Date(email.receivedAt).toLocaleString()} · {email.status.toLowerCase()}</p>
        <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{email.body}</p>
        {email.attachments.length > 0 && <p>Attachments (view in Resend): {email.attachments.map(a => a.filename || "Unnamed attachment").join(", ")}</p>}
        <button className="button" disabled={busy} onClick={() => update(false)}>{email.status === "OPEN" ? "Close request" : "Reopen request"}</button>
        <h3>Replies</h3>{email.replies.length === 0 && <p>No replies yet.</p>}
        {email.replies.map(reply => <div key={reply.id} style={{ borderLeft: "3px solid #65946b", paddingLeft: 16 }}><small>{reply.state === "SENT" ? "Sent" : "Sending not confirmed"}</small><p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{reply.body}</p></div>)}
        <form onSubmit={e => { e.preventDefault(); void update(true); }}>
          <label htmlFor="support-reply">Reply to {recipient || "unavailable address"}</label>
          <textarea id="support-reply" value={draft} onChange={e => setDraft(e.target.value)} maxLength={10000} required disabled={busy || !!attempt || !recipient} rows={7} style={{ display: "block", width: "100%", margin: "12px 0", padding: 12 }} />
          {attempt && <p>Your reply is saved for a safe retry. Retry the same message if sending failed.</p>}
          <button className="button button-primary" disabled={busy || !recipient || !draft.trim()}>{busy ? "Working…" : attempt ? "Retry reply" : "Send reply"}</button>
        </form>
      </article>}
    </> : <>
      <label htmlFor="email-status">Show </label><select id="email-status" value={status} disabled={busy} onChange={e => { setLoading(true); setError(""); setStatus(e.target.value); }}><option value="OPEN">Open</option><option value="CLOSED">Closed</option><option value="ALL">All emails</option></select>
      <button className="button" disabled={busy} onClick={() => { setLoading(true); setError(""); setRevision(v => v + 1); }}>Refresh</button>
      {loading ? <p role="status">Loading inbox…</p> : emails.length === 0 ? <p>No emails in this inbox.</p> : <ul style={{ listStyle: "none", padding: 0 }}>{emails.map(item => <li key={item.id} style={{ borderBottom: "1px solid #ddd", padding: "16px 0" }}><button className="button" disabled={busy} onClick={() => { setSelected(item.id); setError(""); }}>{item.subject || "(No subject)"}</button><p>{item.from} · {new Date(item.receivedAt).toLocaleString()} · {item.status.toLowerCase()}</p></li>)}</ul>}
      {!loading && cursor && <button className="button" disabled={busy} onClick={more}>Load more</button>}
    </>}
  </section>;
}
