import type { Prisma, PrismaClient } from "../generated/prisma/client";

export const inboxSelect = {
  kind: true,
  id: true, subject: true, orderId: true, productId: true, updatedAt: true,
  messages: {
    select: { id: true, body: true, fromAdmin: true, createdAt: true },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 1,
  },
} satisfies Prisma.ConversationSelect;

export async function readConversationInbox(
  db: Pick<PrismaClient, "conversation">,
  limit: number,
  after?: { id: string; updatedAt: string },
  kind?: "CHAT" | "DISPUTE",
  userId?: string,
) {
  const conversations = await db.conversation.findMany({
    where: after ? { ...(userId ? { userId } : {}), ...(kind ? { kind } : {}), OR: [
      { updatedAt: { lt: new Date(after.updatedAt) } },
      { updatedAt: new Date(after.updatedAt), id: { lt: after.id } },
    ] } : { ...(userId ? { userId } : {}), ...(kind ? { kind } : {}) },
    select: inboxSelect,
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take: limit + 1,
  });
  const items = conversations.slice(0, limit);
  const last = items.at(-1);
  return {
    conversations: items,
    nextCursor: conversations.length > limit && last
      ? Buffer.from(JSON.stringify({ id: last.id, updatedAt: last.updatedAt.toISOString() })).toString("base64url")
      : null,
  };
}
