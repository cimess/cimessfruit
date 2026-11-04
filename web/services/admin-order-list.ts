import type { Prisma, PrismaClient } from "../generated/prisma/client";

// Lists do not need payment verification payloads, user IDs or checkout hashes.
export const adminOrderSelect = {
  id: true,
  status: true,
  paymentStatus: true,
  total: true,
  creditApplied: true,
  createdAt: true,
  deliveryAddress: true,
  payment: { select: { providerReference: true, amount: true } },
  items: {
    select: { id: true, name: true, optionLabel: true, quantity: true },
    orderBy: { id: "asc" },
  },
} satisfies Prisma.OrderSelect;

export async function listAdminOrders(
  db: Pick<PrismaClient, "order">,
  limit: number,
  after?: { id: string; createdAt: string },
) {
  const where: Prisma.OrderWhereInput = {
    payment: { provider: { in: ["manual_transfer", "return_credit"] } },
    ...(after ? { OR: [
      { createdAt: { lt: new Date(after.createdAt) } },
      { createdAt: new Date(after.createdAt), id: { lt: after.id } },
    ] } : {}),
  };
  // One extra row tells the client whether another batch exists.
  const rows = await db.order.findMany({
    where,
    select: adminOrderSelect,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
  });
  const orders = rows.slice(0, limit);
  const last = orders.at(-1);
  const nextCursor = rows.length > limit && last
    ? Buffer.from(JSON.stringify({
        id: last.id, createdAt: last.createdAt.toISOString(),
      })).toString("base64url")
    : null;
  return { orders, nextCursor };
}
