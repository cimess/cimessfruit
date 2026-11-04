import { settleCredit } from "../features/returns/credit";
import { ignoreEvent, orderEvent, type WriteEvent } from "../server/notifications/events";
import { noCache, type DataCache } from "../server/cache/json-cache";
import type { PrismaClient } from "../generated/prisma/client";
export const reservationBatchSize = 20;
export const reservationLifetime = 24 * 60 * 60 * 1000;
export function reservationExpired(createdAt: Date, now = new Date()) { return createdAt.getTime() + reservationLifetime <= now.getTime(); }
export async function expireReservations(db: PrismaClient, now = new Date(), cache: DataCache = noCache, notify: WriteEvent = ignoreEvent) {
  const count = await db.$transaction(async tx => {
    const orders = await tx.order.findMany({ where: { status: "PENDING", paymentStatus: "PENDING", createdAt: { lte: new Date(now.getTime() - reservationLifetime) }, payment: { provider: "manual_transfer", status: "PENDING" } }, include: { items: true }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: reservationBatchSize });
    for (const order of orders) {
      if (order.creditApplied) await settleCredit(tx, order.id, "release");
      const event = orderEvent(order, "expire");
      if (event) await notify(tx, event);
      await tx.order.update({ where: { id: order.id }, data: { status: "CANCELLED", deliveryStatus: "CANCELLED", paymentStatus: "FAILED", payment: { update: { status: "FAILED", verifiedResponse: { reason: "reservation_expired" } } } } });
      for (const item of order.items) await tx.productOption.update({ where: { id: item.productOptionId }, data: { stock: { increment: item.quantity } } });
    }
    return orders.length;
  }, { isolationLevel: "Serializable" });
  if (count) await cache.invalidate("products");
  return count;
}
