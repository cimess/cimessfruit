import { recordChange } from "../../features/realtime/publication";
import { randomUUID } from "node:crypto";
import type { Prisma } from "../../generated/prisma/client";

export type EventInput = {
  key: string;
  kind: "order" | "catalogue";
  entityId: string;
  userId?: string;
  title: string;
  body: string;
};
export type WriteEvent = (
  tx: Prisma.TransactionClient,
  event: EventInput,
) => Promise<void>;
export const ignoreEvent: WriteEvent = async () => {};
export const enabled = () => process.env.NOTIFICATIONS_ENABLED === "true";
export const iosEnabled = () => process.env.PUSH_IOS_ENABLED === "true";
export const writeEvent: WriteEvent = async (tx, event) => {
  await recordChange(tx, event);
  if (
    event.kind === "order" &&
    /:(placed|cancel|expire|reject|approved)$/.test(event.key)
  )
    await recordChange(tx, { ...event, kind: "catalogue", userId: null });
  if (!enabled()) return;
  if (event.kind === "order" && !event.userId)
    throw Error("Order notification requires an owner");
  await tx.notificationEvent.upsert({
    where: { key: event.key },
    update: {},
    create: {
      ...event,
      expiresAt: new Date(
        Date.now() + (event.kind === "catalogue" ? 24 : 72) * 3600000,
      ),
    },
  });
};

type ProductSnapshot = {
  batchArrivedAt?: Date | string | null;
  id: string;
  name: string;
  isAvailable: boolean;
  options: { size: string; stock: number }[];
};
export function productEvent(
  before: ProductSnapshot | null,
  after: ProductSnapshot,
): EventInput | null {
  if (!after.isAvailable || !after.options.some((option) => option.stock > 0))
    return null;
  const addedStock = after.options.some(
    (option) =>
      option.stock >
      (before?.options.find((old) => old.size === option.size)?.stock ?? 0),
  );
  const newBatch =
    !!after.batchArrivedAt &&
    String(after.batchArrivedAt) !== String(before?.batchArrivedAt);
  if (before?.isAvailable && !addedStock && !newBatch) return null;
  return {
    key: `catalogue:${after.id}:${randomUUID()}`,
    kind: "catalogue",
    entityId: after.id,
    title: newBatch
      ? "New batch in the shop"
      : !before
        ? "New in the shop"
        : "Available in the shop",
    body: `${after.name.slice(0, 100)} is available. Open the shop to check sizes and stock.`,
  };
}
const orderText: Record<string, string> = {
  placed: "Your order was received. Open it to review payment instructions.",
  reported: "Your payment report was received and is awaiting review.",
  verify: "Your payment has been verified.",
  reject:
    "Your payment review was declined. Open your order for its current status.",
  process: "Your order has been accepted and is being prepared.",
  dispatch: "Your order is out for delivery.",
  deliver: "Your order has been marked delivered.",
  cancel: "Your order has been cancelled.",
  expire: "Your unpaid order expired and its reservation was released.",
  confirm_delivery: "The customer has confirmed delivery of their order.",
  dispute: "The customer has reported an issue with their delivery. Open disputes to review.",
};
const adminActions = new Set(["confirm_delivery", "dispute"]);
export function orderEvent(
  order: { id: string; userId: string | null },
  action: string,
): EventInput | null {
  if (!orderText[action]) return null;
  if (adminActions.has(action)) {
    return {
      key: `order:${order.id}:${action}`,
      kind: "catalogue",
      entityId: order.id,
      title: "Order update",
      body: orderText[action],
    };
  }
  if (!order.userId) return null;
  return {
    key: `order:${order.id}:${action}`,
    kind: "order",
    userId: order.userId,
    entityId: order.id,
    title: "Order update",
    body: orderText[action],
  };
}

