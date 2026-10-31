export type NotificationPayload = { eventId: string; kind: "order" | "catalogue"; entityId: string };
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export function notificationPayload(value: unknown): NotificationPayload | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Record<string, unknown>;
  if (typeof data.eventId !== "string" || !uuid.test(data.eventId) || typeof data.entityId !== "string" || !uuid.test(data.entityId) || !["order", "catalogue"].includes(String(data.kind))) return null;
  return { eventId: data.eventId, entityId: data.entityId, kind: data.kind as NotificationPayload["kind"] };
}
