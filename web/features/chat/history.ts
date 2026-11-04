import { z } from "zod";
const cursorSchema = z.strictObject({
  conversationId: z.uuid(),
  id: z.uuid(),
  createdAt: z.iso.datetime({ offset: true }),
});
export const messageBatchSize = 20;
export function messageWindow(conversationId: string, encoded?: string | null) {
  let boundary: z.infer<typeof cursorSchema> | undefined;
  if (encoded) {
    try {
      boundary = cursorSchema.parse(
        JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")),
      );
    } catch {
      throw Error("Invalid message cursor");
    }
    if (boundary.conversationId !== conversationId)
      throw Error("Message cursor belongs to another conversation");
  }
  return {
    take: messageBatchSize + 1,
    orderBy: [{ createdAt: "desc" as const }, { id: "desc" as const }],
    ...(boundary
      ? {
          where: {
            OR: [
              { createdAt: { lt: new Date(boundary.createdAt) } },
              {
                createdAt: new Date(boundary.createdAt),
                id: { lt: boundary.id },
              },
            ],
          },
        }
      : {}),
  };
}
export function messagePage<
  T extends { id: string; messages: { id: string; createdAt: Date }[] },
>(conversation: T | null) {
  if (!conversation) return null;
  const selected = conversation.messages.slice(0, messageBatchSize),
    last = selected.at(-1);
  return {
    ...conversation,
    messages: [...selected].reverse(),
    nextMessageCursor:
      conversation.messages.length > messageBatchSize && last
        ? Buffer.from(
            JSON.stringify({
              conversationId: conversation.id,
              id: last.id,
              createdAt: last.createdAt.toISOString(),
            }),
          ).toString("base64url")
        : null,
  };
}
