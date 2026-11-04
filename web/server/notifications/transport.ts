import type { RecoveryCursor } from "./publisher";
import { Receiver } from "@upstash/qstash";
import { enabled } from "./events";

export function workerUrl() {
  const origin = new URL(process.env.NOTIFICATIONS_ORIGIN ?? "");
  if (origin.protocol !== "https:" || origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash) throw Error("Invalid notification origin");
  return `${origin.origin}/api/notifications/worker`;
}
async function publishJob(job: { eventId: string } | { type: "recover"; after?: RecoveryCursor }, delay = 0) {
  if (!enabled()) return;
  const token = process.env.QSTASH_TOKEN;
  if (!token) throw Error("QStash not configured");
  const base = process.env.QSTASH_URL || "https://qstash.upstash.io";
  const response = await fetch(`${base.replace(/\/$/, "")}/v2/publish/${encodeURIComponent(workerUrl())}`, {
    method: "POST", signal: AbortSignal.timeout(8000),
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json",
      "Upstash-Retries": "3", "Upstash-Timeout": "30s", "Upstash-Delay": `${delay}s` },
    body: JSON.stringify(job),
  });
  if (!response.ok) throw Error("QStash publish failed");
  const result = await response.json();
  if (!result || typeof result.messageId !== "string") throw Error("QStash publication not acknowledged");
}
export function publish(id: string, delay = 0) { return publishJob({ eventId: id }, delay); }
export function publishRecovery(after?: RecoveryCursor, delay = 0) { return publishJob({ type: "recover", ...(after ? { after } : {}) }, delay); }

// QStash accepts independent jobs in one HTTP call; per-item errors must not count as success.
export async function publishBatch(ids: string[]) {
  if (!enabled() || !ids.length) return;
  if (ids.length > 20) throw Error("Notification publication batch too large");
  const token = process.env.QSTASH_TOKEN;
  if (!token) throw Error("QStash not configured");
  const destination = workerUrl();
  const base = process.env.QSTASH_URL || "https://qstash.upstash.io";
  const response = await fetch(`${base.replace(/\/$/, "")}/v2/batch`, {
    method: "POST", signal: AbortSignal.timeout(8000),
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(ids.map(eventId => ({ destination, body: JSON.stringify({ eventId }),
      headers: { "Content-Type": "application/json", "Upstash-Retries": "3", "Upstash-Timeout": "30s" },
    }))),
  });
  if (!response.ok) throw Error("QStash batch publish failed");
  const result: unknown = await response.json();
  if (!Array.isArray(result) || result.length !== ids.length || result.some(item =>
    !item || typeof item.messageId !== "string" || item.error)) throw Error("QStash batch partially rejected");
}
export async function verifySignature(body: string, signature: string) {
  const currentSigningKey = process.env.QSTASH_CURRENT_SIGNING_KEY;
  const nextSigningKey = process.env.QSTASH_NEXT_SIGNING_KEY;
  if (!currentSigningKey || !nextSigningKey) return false;
  try { return await new Receiver({ currentSigningKey, nextSigningKey }).verify({ body, signature, url: workerUrl() }); }
  catch { return false; }
}
export type ExpoResult = { status: "ok" | "error"; id?: string; details?: { error?: string } };
export type PushMessage = { to: string; title: string; body: string; data: { eventId: string; kind: string; entityId: string }; sound: "default"; channelId: string; ttl: number };
export type PushTransport = { send: (messages: PushMessage[]) => Promise<ExpoResult[]>; receipts: (tickets: string[]) => Promise<Record<string, ExpoResult>> };
async function expo(path: string, body: unknown) {
  const token = process.env.EXPO_ACCESS_TOKEN;
  const response = await fetch(`https://exp.host/--/api/v2/push/${path}`, {
    method: "POST", signal: AbortSignal.timeout(8000),
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw Error("Expo unavailable");
  const result = await response.json();
  if (!result.data || result.errors?.length) throw Error("Expo rejected request");
  return result.data;
}
export const expoTransport: PushTransport = {
  send: messages => expo("send", messages),
  receipts: ids => expo("getReceipts", { ids }),
};
