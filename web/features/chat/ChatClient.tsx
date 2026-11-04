"use client";
import { useEffect, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useDeviceDraft, type LocalImage } from "../uploads/browser-drafts";
import BrowserUpload from "../uploads/BrowserUpload";
import { reasons } from "./validation";
import type { Conversation, OrderOption } from "./types";
import ResolutionChoice from "./ResolutionChoice";
type View = { kind: "CHAT" | "DISPUTE"; threadId: string | null };
export default function ChatClient({ owner }: { owner: string }) {
  const params = useSearchParams();
  const [view, navigate] = useState<View>({ kind: params.get("tab") === "DISPUTE" ? "DISPUTE" : "CHAT", threadId: null });
  const scope = `${view.kind}:${view.threadId ?? params.get("orderId") ?? params.get("productId") ?? "new"}`;
  return <ChatSession key={`${owner}:${scope}`} owner={owner} scope={scope} view={view} navigate={navigate} />;
}
function ChatSession({ owner, scope, view, navigate }: { owner: string; scope: string; view: View; navigate: (view: View) => void }) {
  const params = useSearchParams(), router = useRouter();
  const kind = view.kind;
  const setKind = (kind: View["kind"]) => navigate({ kind, threadId: null });
  const [threads, setThreads] = useState<Conversation[]>([]), [thread, setThread] = useState<Conversation | null>(null), [threadId] = useState<string | null>(view.threadId);
  const setThreadId = (threadId: string | null) => navigate({ kind, threadId });
  const [orders, setOrders] = useState<OrderOption[]>([]), [orderId, setOrderId] = useState(params.get("orderId") ?? "");
  const [body, setBody] = useState(""), [error, setError] = useState(""), [busy, setBusy] = useState(false), [revision, setRevision] = useState(0), [serverTime, setServerTime] = useState("");
  const [nextInboxCursor, setNextInboxCursor] = useState<string | null>(null);
  const [supportPhone, setSupportPhone] = useState("+2349065440424");
  useEffect(() => {
    fetch("/api/support/contact", { cache: "no-store" })
      .then(res => res.json())
      .then(data => { if (data.phone) setSupportPhone(data.phone); })
      .catch(() => {});
  }, []);
  const olderController = useRef<AbortController | null>(null);
  useEffect(() => () => olderController.current?.abort(), []);
  const formRef = useRef<HTMLFormElement>(null);
  const draft = useDeviceDraft<{ fields: Record<string, string>; kind: "CHAT" | "DISPUTE"; threadId: string | null; orderId: string; images: LocalImage[]; key: string; serialized: string }>(`${owner}:chat:${scope}`, { fields: {}, kind, threadId: null, orderId, images: [{}, {}, {}], key: "", serialized: "" });
  const [uploadBusy, setUploadBusy] = useState(false);
  const restored = useRef(false);
  const lock = useRef(false), pending = useRef({ body: "", key: "" });
  useEffect(() => {
    if (!draft.ready || restored.current) return;
    restored.current = true; setOrderId(draft.value.orderId); setBody(draft.value.fields.message ?? "");
    pending.current = { key: draft.value.key, body: draft.value.serialized };
  }, [draft.ready, draft.value]);
  useEffect(() => {
    if (!draft.ready || !formRef.current) return;
    for (const [name, value] of Object.entries(draft.value.fields)) { const field = formRef.current.elements.namedItem(name); if (field instanceof HTMLInputElement || field instanceof HTMLSelectElement || field instanceof HTMLTextAreaElement) { if (name !== "message") field.value = value; } }
  }, [draft.ready, draft.value.fields, orders, kind, threadId]); // restore fields mounted after orders load
  function persist() {
    if (!draft.ready || !formRef.current) return;
    const fields = Object.fromEntries([...new FormData(formRef.current)].filter((entry): entry is [string, string] => typeof entry[1] === "string"));
    draft.update(previous => ({ ...previous, fields, kind, threadId, orderId: fields.orderId ?? orderId }));
  }
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      const response = await fetch(threadId ? `/api/support/${threadId}` : `/api/support?kind=${kind}`, { cache: "no-store", signal: controller.signal });
      if (response.status === 401) { router.replace("/login"); return; }
      const data = await response.json(); if (!response.ok) throw Error(data.error);
      if (controller.signal.aborted) return;
      if (threadId) { setThread(data.conversation); setServerTime(data.serverTime ?? new Date().toISOString()); }
      else { setThreads(data.conversations); setNextInboxCursor(data.nextCursor); }
      setError("");
      if (kind === "DISPUTE" && !threadId) {
        const result = await fetch("/api/orders", { signal: controller.signal, cache: "no-store" }); const value = await result.json(); if (!result.ok) throw Error(value.error);
        if (!controller.signal.aborted) setOrders(value.orders.filter((order: OrderOption) => order.paymentStatus === "SUCCESS"));
      }
    })().catch(error => { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "Unable to load chat"); });
    return () => controller.abort();
  }, [kind, threadId, revision, router]);
  useEffect(() => { const refresh = () => setRevision(value => value + 1); window.addEventListener("cimessfruit:orders", refresh); return () => window.removeEventListener("cimessfruit:orders", refresh); }, []);
  async function moreThreads() {
    if (!nextInboxCursor || busy) return; setBusy(true); olderController.current = new AbortController();
    try { const response = await fetch(`/api/support?kind=${kind}&cursor=${encodeURIComponent(nextInboxCursor)}`, { cache: "no-store", signal: olderController.current.signal }); const data = await response.json(); if (!response.ok) throw Error(data.error); setThreads(previous => [...new Map([...previous, ...data.conversations].map((item: Conversation) => [item.id, item])).values()]); setNextInboxCursor(data.nextCursor); } catch { setError("Unable to load older conversations"); } finally { setBusy(false); }
  }
  async function older() {
    if (!threadId || !thread?.nextMessageCursor || busy) return;
    setBusy(true); setError(""); olderController.current = new AbortController();
    try { const response = await fetch(`/api/support/${threadId}?before=${encodeURIComponent(thread.nextMessageCursor)}`, { cache: "no-store", signal: olderController.current!.signal }); const data = await response.json(); if (!response.ok) throw Error(data.error);
      setThread(previous => previous ? { ...previous, nextMessageCursor: data.conversation.nextMessageCursor, messages: [...new Map([...data.conversation.messages, ...previous.messages].map((message: Conversation["messages"][number]) => [message.id, message])).values()] } : previous);
    } catch (error) { setError(error instanceof Error ? error.message : "Unable to load older messages"); } finally { setBusy(false); }
  }
  async function send(form: HTMLFormElement) {
    if (lock.current || !draft.ready || uploadBusy || draft.value.images.some(image => image.file)) return;
    const fields = new FormData(form), evidenceUrls = String(fields.get("evidence") ?? "").split(/\s+/).filter(Boolean);
    let path = threadId ? `/api/support/${threadId}` : "/api/support";
    const uploadIds = draft.value.images.flatMap(image => image.id ? [image.id] : []);
    let payload: unknown = { body, evidenceUrls, uploadIds };
    if (!threadId && kind === "CHAT") payload = { body, evidenceUrls, uploadIds, subject: fields.get("subject"), ...(params.get("productId") ? { productId: params.get("productId") } : {}) };
    if (!threadId && kind === "DISPUTE") {
      path = "/api/disputes";
      const selected = orders.find(order => order.id === orderId);
      const value = { body, evidenceUrls, uploadIds, orderId, reason: fields.get("reason"), requestedChoice: fields.get("choice"), items: selected?.items.map(item => ({ orderItemId: item.id, quantity: Number(fields.get(`qty-${item.id}`)) })).filter(item => item.quantity > 0) ?? [] };
      const serialized = JSON.stringify(value); if (pending.current.body !== serialized) pending.current = { body: serialized, key: crypto.randomUUID() };
      payload = { ...value, key: pending.current.key };
    }
    const serialized = JSON.stringify(payload);
    if (kind !== "DISPUTE" || threadId) { if (pending.current.body !== serialized) pending.current = { body: serialized, key: crypto.randomUUID() }; payload = { ...(payload as object), key: pending.current.key }; }
    draft.update(previous => ({ ...previous, key: pending.current.key, serialized: pending.current.body }));
    lock.current = true; setBusy(true); setError("");
    try { await draft.flush(); const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }); const data = await response.json(); if (!response.ok) throw Error(data.error);
      await draft.clear();
      setBody(""); if (data.dispute) setThreadId(data.dispute.conversationId); else { setThreadId(data.conversation.id); setThread(data.conversation); } setRevision(value => value + 1); form.reset();
    } catch (error) { setError(error instanceof Error ? error.message : "Unable to send message"); }
    finally { lock.current = false; setBusy(false); }
  }
  const cleanDigits = supportPhone.replace(/[^0-9]/g, "");
  const waNumber = cleanDigits.startsWith("234") ? cleanDigits : cleanDigits.startsWith("0") ? `234${cleanDigits.slice(1)}` : cleanDigits || "2349065440424";
  const whatsappUrl = `https://wa.me/${waNumber}?text=${encodeURIComponent(
    thread?.orderId
      ? `Hello CimessFruit! I have a question regarding my order #${thread.orderId.slice(0, 8)}.`
      : "Hello CimessFruit Support! I would like assistance with my order/dispute."
  )}`;

  return <section className="store-section"><h1>Chat & Customer Support</h1>
    <div className="checkout-actions" style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
      {(["CHAT", "DISPUTE"] as const).map(tab => <button className="button" aria-pressed={kind === tab} disabled={busy || uploadBusy || !draft.ready} key={tab} onClick={() => { setKind(tab); }}>{tab === "CHAT" ? "💬 Chat" : "⚖️ Disputes"}</button>)}
      <a
        href={whatsappUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="button"
        style={{
          backgroundColor: "#25D366",
          color: "#ffffff",
          fontWeight: 700,
          textDecoration: "none",
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          border: "none",
        }}
      >
        <span>📱</span> Chat with Admin on WhatsApp
      </a>
      <button className="button" disabled={busy || uploadBusy || !draft.ready} onClick={() => setRevision(value => value + 1)}>↻ Refresh</button>
    </div>{error && <p role="alert">{error}</p>}
    {threadId ? <><button className="text-link" disabled={busy || uploadBusy || !draft.ready} onClick={() => { setThreadId(null); }}>← Back to conversations</button>{thread ? <><h2>{thread.subject}</h2>{thread.dispute && <><p>Status: <strong>{thread.dispute.status}</strong> · {thread.dispute.reason.replaceAll("_", " ")}</p><p>{thread.dispute.decisionNote}</p>{thread.dispute.credit && <ResolutionChoice key={`${thread.dispute.credit.id}:${serverTime}`} credit={thread.dispute.credit} serverTime={serverTime} refresh={() => setRevision(value => value + 1)} />}<div style={{ margin: "12px 0", display: "flex", gap: 12, flexWrap: "wrap" }}><a href={`/orders/${thread.orderId}`} className="button">💳 View order & refund bank details</a><a href={whatsappUrl} target="_blank" rel="noopener noreferrer" className="button" style={{ backgroundColor: "#25D366", color: "#fff" }}>📱 Discuss on WhatsApp</a></div></>}{thread.nextMessageCursor && <button type="button" className="button" disabled={busy} onClick={() => void older()}>Load older messages</button>}{thread.messages.map(message => <article className="order-history-card" key={message.id} style={{ marginLeft: message.fromAdmin ? 0 : "10%", marginRight: message.fromAdmin ? "10%" : 0 }}><strong>{message.fromAdmin ? "Store" : "You"}</strong><p style={{ whiteSpace: "pre-wrap" }}>{message.body}</p>{message.evidenceUrls?.map(url => <p key={url}><a href={url} target="_blank" rel="noreferrer">Evidence link</a></p>)}<small>{new Date(message.createdAt).toLocaleString()}</small></article>)}</> : <p>Loading conversation…</p>}</> : <>{threads.map(item => <article className="order-history-card" key={item.id}><button className="text-link" disabled={busy || uploadBusy || !draft.ready} onClick={() => { setThreadId(item.id); }}>{item.subject}</button><p>{item.messages[0]?.body}</p></article>)}{nextInboxCursor && <button type="button" className="button" disabled={busy} onClick={() => void moreThreads()}>Load more conversations</button>}<h2>{kind === "CHAT" ? "New chat" : "Open a dispute"}</h2></>}
    <form ref={formRef} onChange={persist} onSubmit={event => { event.preventDefault(); void send(event.currentTarget); }}><fieldset disabled={busy || uploadBusy || !draft.ready}>{!threadId && (kind === "CHAT" ? <label>Subject<input name="subject" required minLength={3} maxLength={160} defaultValue={params.get("subject") ?? ""} /></label> : <><label>Paid order<select name="orderId" required value={orderId} onChange={event => setOrderId(event.target.value)}><option value="">Select order</option>{orders.map(order => <option key={order.id} value={order.id}>{order.id.slice(0, 8)}</option>)}</select></label><label>Issue<select name="reason">{reasons.map(reason => <option key={reason} value={reason}>{reason.replaceAll("_", " ")}</option>)}</select></label>{orders.find(order => order.id === orderId)?.items.map(item => <label key={item.id}>{item.name} · {item.optionLabel} (up to {item.quantity})<input name={`qty-${item.id}`} type="number" min="0" max={item.quantity} defaultValue="0" /></label>)}<label>Requested resolution<select name="choice" defaultValue="CREDIT"><option value="BANK_REFUND">Bank refund</option><option value="CREDIT">Buy again</option><option value="REPLACEMENT">Replacement</option></select></label><p>The 20-minute choice window starts only after approval. You can change your choice during it; buy again is the default; any unused amount is refunded afterward.</p></>)}<label>Message<textarea name="message" required value={body} onChange={event => setBody(event.target.value)} maxLength={2000} /></label><label>Evidence links (optional; up to three HTTPS URLs)<textarea name="evidence" maxLength={4500} /></label>{draft.value.images.map((image, index) => <BrowserUpload key={index} purpose="EVIDENCE" value={image} onBusy={setUploadBusy} onChange={value => { draft.update(previous => ({ ...previous, images: previous.images.map((item, i) => i === index ? value : item) })); void draft.flush(); }} />)}{draft.storageError && <p role="alert">{draft.storageError}</p>}<button className="button button-primary" disabled={busy || uploadBusy || !draft.ready || draft.value.images.some(image => image.file) || !body.trim()}>{busy ? "Sending…" : "Send"}</button></fieldset></form>
  </section>;
}
