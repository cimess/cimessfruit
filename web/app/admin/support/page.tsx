"use client";
import { useEffect, useRef, useState } from "react";
import AdminDecision from "@/features/chat/AdminDecision";
import type { DisputeView } from "@/features/chat/types";

type Conversation = {
  nextMessageCursor?: string | null;
  kind: "CHAT" | "DISPUTE";
  dispute?: DisputeView | null;
  id: string;
  subject: string;
  orderId: string | null;
  productId: string | null;
  createdAt?: string;
  updatedAt?: string;
  messages: {
    id: string;
    body: string;
    fromAdmin: boolean;
    createdAt: string;
    evidenceUrls?: string[] | null;
  }[];
};

export default function SupportInbox() {
  const [kind, setKind] = useState<"CHAT" | "DISPUTE">("DISPUTE");
  const [evidence, setEvidence] = useState("");
  const [items, setItems] = useState<Conversation[]>([]);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [thread, setThread] = useState<Conversation | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const sending = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({ limit: "25", kind });
        if (cursor) params.set("cursor", cursor);
        const path = threadId ? `/api/admin/support/${threadId}` : `/api/admin/support?${params}`;
        const response = await fetch(path, { signal: controller.signal, cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw Error(data.error ?? "Unable to load messages.");
        if (controller.signal.aborted) return;
        if (threadId) {
          setThread(data.conversation);
        } else {
          setItems((previous) =>
            cursor
              ? [...new Map([...previous, ...data.conversations].map((item: Conversation) => [item.id, item])).values()]
              : data.conversations,
          );
          setNextCursor(data.nextCursor);
        }
      } catch (err) {
        if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "Unable to load inbox.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [threadId, cursor, revision, kind]);

  function resetInbox() {
    setThreadId(null);
    setThread(null);
    setBody("");
    setItems([]);
    setCursor(null);
    setNextCursor(null);
    setRevision((value) => value + 1);
  }

  async function older() {
    if (!threadId || !thread?.nextMessageCursor || busy) return;
    setBusy(true);
    try {
      const response = await fetch(
        `/api/admin/support/${threadId}?before=${encodeURIComponent(thread.nextMessageCursor)}`,
        { cache: "no-store" },
      );
      const data = await response.json();
      if (!response.ok) throw Error(data.error);
      setThread((previous) =>
        previous
          ? {
              ...previous,
              nextMessageCursor: data.conversation.nextMessageCursor,
              messages: [
                ...new Map(
                  [...data.conversation.messages, ...previous.messages].map((message) => [message.id, message]),
                ).values(),
              ],
            }
          : previous,
      );
    } catch {
      setError("Unable to load older messages");
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    if (!threadId || !body.trim() || sending.current || loading) return;
    sending.current = true;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/support/${threadId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body, evidenceUrls: evidence.split(/\s+/).filter(Boolean) }),
      });
      const data = await response.json();
      if (!response.ok) throw Error(data.error ?? "Unable to send reply.");
      setThread(data.conversation);
      setBody("");
      setEvidence("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to send reply.");
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }

  // Collect all evidence photos from all messages in current thread
  const allEvidence = thread
    ? [
        ...(thread.messages.flatMap((m) => m.evidenceUrls ?? [])),
      ].filter(Boolean)
    : [];

  return (
    <div style={{ maxWidth: 1040, margin: "0 auto", padding: "16px 20px" }}>
      {/* Page Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16, marginBottom: 20 }}>
        <div>
          <span style={{ fontSize: "0.8rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em", color: "#16a34a" }}>
            Customer Service & Claims Desk
          </span>
          <h1 style={{ margin: "4px 0 0", fontSize: "1.9rem", fontWeight: 800, color: "#111827" }}>
            {kind === "DISPUTE" ? "Order Disputes & Resolution" : "General Support Chat"}
          </h1>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div style={{ display: "inline-flex", background: "#f3f4f6", padding: 4, borderRadius: 12 }}>
            <button
              className="button"
              type="button"
              onClick={() => { setKind("DISPUTE"); resetInbox(); }}
              style={{
                borderRadius: 8,
                padding: "8px 16px",
                fontWeight: 700,
                fontSize: "0.88rem",
                backgroundColor: kind === "DISPUTE" ? "#ffffff" : "transparent",
                color: kind === "DISPUTE" ? "#111827" : "#6b7280",
                boxShadow: kind === "DISPUTE" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                border: "none",
                cursor: "pointer",
              }}
            >
              ⚠️ Disputes & Refunds
            </button>
            <button
              className="button"
              type="button"
              onClick={() => { setKind("CHAT"); resetInbox(); }}
              style={{
                borderRadius: 8,
                padding: "8px 16px",
                fontWeight: 700,
                fontSize: "0.88rem",
                backgroundColor: kind === "CHAT" ? "#ffffff" : "transparent",
                color: kind === "CHAT" ? "#111827" : "#6b7280",
                boxShadow: kind === "CHAT" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                border: "none",
                cursor: "pointer",
              }}
            >
              💬 General Messages
            </button>
          </div>

          <button
            className="button"
            type="button"
            disabled={busy || loading}
            onClick={() => (threadId ? setRevision((v) => v + 1) : resetInbox())}
            style={{ borderRadius: 10, padding: "8px 14px", fontWeight: 700 }}
          >
            ↻ Refresh
          </button>
        </div>
      </div>

      {error && (
        <div style={{ padding: 14, borderRadius: 12, backgroundColor: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca", marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>{error}</span>
          <button className="button" style={{ padding: "4px 12px" }} onClick={() => setRevision((v) => v + 1)}>
            Retry
          </button>
        </div>
      )}

      {/* VIEW A: DETAIL / RESOLUTION THREAD */}
      {threadId ? (
        <div>
          <button
            type="button"
            className="button"
            disabled={busy}
            onClick={resetInbox}
            style={{ marginBottom: 16, display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 700 }}
          >
            ← Back to all cases
          </button>

          {loading ? (
            <div style={{ padding: 40, textAlign: "center", color: "#6b7280" }}>Loading case details…</div>
          ) : thread ? (
            <>
              {/* Header Box */}
              <div style={{ backgroundColor: "#ffffff", padding: 22, borderRadius: 18, border: "1px solid #e5e7eb", marginBottom: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
                  <div>
                    <span style={{ fontSize: "0.75rem", fontWeight: 800, padding: "3px 8px", borderRadius: 6, backgroundColor: thread.kind === "DISPUTE" ? "#fef3c7" : "#e0f2fe", color: thread.kind === "DISPUTE" ? "#92400e" : "#0369a1" }}>
                      {thread.kind} CASE
                    </span>
                    <h2 style={{ margin: "8px 0 4px", fontSize: "1.4rem", fontWeight: 800 }}>
                      {thread.subject}
                    </h2>
                    <div style={{ fontSize: "0.85rem", color: "#6b7280" }}>
                      Case Reference: <code style={{ backgroundColor: "#f3f4f6", padding: "2px 6px", borderRadius: 4 }}>{thread.id}</code>
                    </div>
                  </div>

                  {thread.orderId && (
                    <div style={{ padding: "10px 14px", borderRadius: 12, backgroundColor: "#f9fafb", border: "1px solid #e5e7eb", fontSize: "0.85rem" }}>
                      <span style={{ color: "#6b7280", display: "block" }}>Linked Order:</span>
                      <strong style={{ color: "#111827" }}>{thread.orderId}</strong>
                    </div>
                  )}
                </div>

                {/* EVIDENCE GALLERY (Prominent Display) */}
                {allEvidence.length > 0 && (
                  <div style={{ marginTop: 20, paddingTop: 18, borderTop: "1px solid #f3f4f6" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                      <span style={{ fontSize: "1rem" }}>📷</span>
                      <strong style={{ fontSize: "0.95rem", color: "#111827" }}>
                        Customer Uploaded Evidence ({allEvidence.length})
                      </strong>
                      <span style={{ fontSize: "0.8rem", color: "#6b7280" }}>— Click any photo to zoom</span>
                    </div>

                    <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
                      {allEvidence.map((url, idx) => (
                        <div
                          key={idx}
                          onClick={() => setPreviewImage(url)}
                          style={{
                            width: 140,
                            height: 120,
                            borderRadius: 12,
                            overflow: "hidden",
                            border: "2px solid #e5e7eb",
                            backgroundColor: "#f9fafb",
                            cursor: "zoom-in",
                            position: "relative",
                            boxShadow: "0 2px 6px rgba(0,0,0,0.06)",
                          }}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={url}
                            alt={`Evidence ${idx + 1}`}
                            style={{ width: "100%", height: "100%", objectFit: "cover" }}
                            onError={(e) => {
                              // If image fails to render direct thumbnail, keep clickable link
                              (e.target as HTMLElement).style.display = "none";
                            }}
                          />
                          <div style={{
                            position: "absolute",
                            bottom: 0,
                            left: 0,
                            right: 0,
                            backgroundColor: "rgba(0,0,0,0.6)",
                            color: "white",
                            fontSize: "0.7rem",
                            padding: "3px 6px",
                            textAlign: "center",
                            fontWeight: 700,
                          }}>
                            Photo #{idx + 1}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* ACTION TAB: ADMIN DECISION FORM (Prominently resolved or actioned) */}
              {thread.dispute && (
                <AdminDecision dispute={thread.dispute} refresh={() => setRevision((v) => v + 1)} />
              )}

              {/* MESSAGE TIMELINE */}
              <div style={{ backgroundColor: "#ffffff", padding: 22, borderRadius: 18, border: "1px solid #e5e7eb", marginBottom: 20 }}>
                <h3 style={{ margin: "0 0 16px", fontSize: "1.1rem", fontWeight: 800 }}>Conversation History</h3>

                {thread.nextMessageCursor && (
                  <button
                    type="button"
                    className="button"
                    disabled={busy}
                    onClick={() => void older()}
                    style={{ marginBottom: 14, width: "100%" }}
                  >
                    Load older messages
                  </button>
                )}

                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  {thread.messages.map((message) => {
                    const isAdmin = message.fromAdmin;
                    return (
                      <div
                        key={message.id}
                        style={{
                          padding: "16px 18px",
                          borderRadius: 14,
                          backgroundColor: isAdmin ? "#f0fdf4" : "#f9fafb",
                          border: `1px solid ${isAdmin ? "#bbf7d0" : "#e5e7eb"}`,
                          marginLeft: isAdmin ? 40 : 0,
                          marginRight: isAdmin ? 0 : 40,
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                          <strong style={{ fontSize: "0.9rem", color: isAdmin ? "#15803d" : "#111827" }}>
                            {isAdmin ? "🛡️ Store Support (Admin)" : "👤 Customer"}
                          </strong>
                          <span style={{ fontSize: "0.78rem", color: "#9ca3af" }}>
                            {new Date(message.createdAt).toLocaleString()}
                          </span>
                        </div>

                        <p style={{ margin: 0, fontSize: "0.92rem", lineHeight: 1.5, whiteSpace: "pre-wrap", color: "#374151" }}>
                          {message.body}
                        </p>

                        {/* Inline evidence thumbnails for this specific message */}
                        {message.evidenceUrls && message.evidenceUrls.length > 0 && (
                          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                            {message.evidenceUrls.map((url, i) => (
                              <button
                                key={i}
                                type="button"
                                onClick={() => setPreviewImage(url)}
                                style={{
                                  border: "1px solid #d1d5db",
                                  borderRadius: 8,
                                  background: "#ffffff",
                                  padding: "4px 10px",
                                  fontSize: "0.8rem",
                                  color: "#2563eb",
                                  fontWeight: 600,
                                  cursor: "pointer",
                                }}
                              >
                                🖼️ View Attachment {i + 1}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Reply Form */}
                <div style={{ marginTop: 22, paddingTop: 18, borderTop: "1px solid #f3f4f6" }}>
                  <label style={{ display: "block", fontSize: "0.9rem", fontWeight: 700, marginBottom: 8, color: "#111827" }}>
                    Send Message to Customer
                  </label>
                  <textarea
                    disabled={busy}
                    value={body}
                    maxLength={2000}
                    onChange={(e) => setBody(e.target.value)}
                    placeholder="Type your reply here…"
                    rows={3}
                    style={{
                      width: "100%",
                      padding: 12,
                      borderRadius: 12,
                      border: "1px solid #d1d5db",
                      fontSize: "0.9rem",
                      fontFamily: "inherit",
                      marginBottom: 10,
                    }}
                  />
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                    <span style={{ fontSize: "0.78rem", color: "#9ca3af" }}>{body.length} / 2000 characters</span>
                    <button
                      type="button"
                      className="button button-primary"
                      disabled={busy || !body.trim()}
                      onClick={() => void send()}
                      style={{ padding: "10px 22px", borderRadius: 10, fontWeight: 700 }}
                    >
                      {busy ? "Sending…" : "Send Message"}
                    </button>
                  </div>
                </div>
              </div>
            </>
          ) : null}
        </div>
      ) : (
        /* VIEW B: DISPUTE & SUPPORT LOG INBOX */
        <div>
          {loading && !items.length ? (
            <div style={{ padding: 40, textAlign: "center", color: "#6b7280" }}>Loading conversations…</div>
          ) : items.length ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {items.map((item) => {
                const dispute = item.dispute;
                const isDispute = item.kind === "DISPUTE";
                const isOpen = dispute?.status === "OPEN";

                return (
                  <div
                    key={item.id}
                    onClick={() => {
                      setThreadId(item.id);
                      setThread(null);
                      setBody("");
                    }}
                    style={{
                      backgroundColor: "#ffffff",
                      borderRadius: 16,
                      border: `1px solid ${isOpen ? "#fcd34d" : "#e5e7eb"}`,
                      padding: 18,
                      cursor: "pointer",
                      boxShadow: isOpen ? "0 2px 8px rgba(245, 158, 11, 0.15)" : "0 1px 3px rgba(0,0,0,0.05)",
                      transition: "all 0.15s ease",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        {isDispute ? (
                          <span style={{
                            padding: "3px 8px",
                            borderRadius: 8,
                            fontSize: "0.75rem",
                            fontWeight: 800,
                            backgroundColor: isOpen ? "#fef3c7" : dispute?.status === "APPROVED" ? "#dcfce7" : "#fee2e2",
                            color: isOpen ? "#92400e" : dispute?.status === "APPROVED" ? "#15803d" : "#b91c1c",
                          }}>
                            {isOpen ? "⚠️ ACTION REQUIRED" : `✓ ${dispute?.status}`}
                          </span>
                        ) : (
                          <span style={{
                            padding: "3px 8px",
                            borderRadius: 8,
                            fontSize: "0.75rem",
                            fontWeight: 800,
                            backgroundColor: "#e0f2fe",
                            color: "#0369a1",
                          }}>
                            💬 INQUIRY
                          </span>
                        )}
                        <strong style={{ fontSize: "1.05rem", color: "#111827" }}>{item.subject}</strong>
                      </div>
                      <span style={{ fontSize: "0.8rem", color: "#9ca3af" }}>
                        {item.updatedAt ? new Date(item.updatedAt).toLocaleDateString() : ""}
                      </span>
                    </div>

                    <p style={{ margin: "6px 0 10px", fontSize: "0.9rem", color: "#4b5563", lineHeight: 1.4 }}>
                      {item.messages[0]?.body || "No message body"}
                    </p>

                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.82rem", color: "#6b7280" }}>
                      <span>
                        {item.orderId ? `Order: ${item.orderId.slice(0, 8)}…` : "General request"}
                        {item.messages[0]?.evidenceUrls?.length ? ` · 📷 ${item.messages[0].evidenceUrls.length} photos` : ""}
                      </span>
                      <span style={{ fontWeight: 700, color: "#16a34a" }}>
                        Open Case & Actions →
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : !error ? (
            <div style={{ padding: 60, textAlign: "center", backgroundColor: "#ffffff", borderRadius: 18, border: "1px dashed #d1d5db" }}>
              <div style={{ fontSize: "2rem", marginBottom: 8 }}>🌱</div>
              <h3 style={{ margin: "0 0 6px", fontSize: "1.1rem", fontWeight: 700 }}>No conversations in this tab</h3>
              <p style={{ margin: 0, fontSize: "0.9rem", color: "#6b7280" }}>
                All customer disputes and messages are up to date!
              </p>
            </div>
          ) : null}

          {nextCursor && (
            <div style={{ marginTop: 20, textAlign: "center" }}>
              <button
                type="button"
                className="button"
                disabled={busy || loading}
                onClick={() => (error ? setRevision((v) => v + 1) : setCursor(nextCursor))}
              >
                {loading ? "Loading…" : "Load More Cases"}
              </button>
            </div>
          )}
        </div>
      )}

      {/* FULLSCREEN EVIDENCE PREVIEW MODAL */}
      {previewImage && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setPreviewImage(null)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            backgroundColor: "rgba(0,0,0,0.88)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
            cursor: "zoom-out",
          }}
        >
          <div style={{ position: "relative", maxWidth: "90vw", maxHeight: "90vh" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewImage}
              alt="Evidence preview"
              onClick={(e) => e.stopPropagation()}
              style={{
                maxWidth: "100%",
                maxHeight: "85vh",
                objectFit: "contain",
                borderRadius: 14,
                boxShadow: "0 20px 40px rgba(0,0,0,0.5)",
              }}
            />
            <div style={{ marginTop: 12, textAlign: "center" }}>
              <a
                href={previewImage}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                style={{
                  color: "#ffffff",
                  fontSize: "0.85rem",
                  textDecoration: "underline",
                  marginRight: 16,
                }}
              >
                Open in new tab ↗
              </a>
              <button
                type="button"
                onClick={() => setPreviewImage(null)}
                style={{
                  background: "rgba(255,255,255,0.2)",
                  color: "white",
                  border: "none",
                  borderRadius: 20,
                  padding: "4px 16px",
                  fontSize: "0.85rem",
                  cursor: "pointer",
                }}
              >
                Close Preview (Esc)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
