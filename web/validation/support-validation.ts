import { evidenceSchema } from "../features/chat/validation";
import { z } from "zod";
export const newConversationSchema = z.strictObject({ subject: z.string().trim().min(3).max(160), body: z.string().trim().min(1).max(2000), productId: z.uuid().optional(), orderId: z.uuid().optional(), evidenceUrls: evidenceSchema, uploadIds: z.array(z.uuid()).max(3).default([]), key: z.uuid().optional() }).refine(value => !value.uploadIds.length || !!value.key, "A save reference is required with uploads");
export const messageSchema = z.strictObject({ body: z.string().trim().min(1).max(2000), evidenceUrls: evidenceSchema, uploadIds: z.array(z.uuid()).max(3).default([]), key: z.uuid().optional() }).refine(value => !value.uploadIds.length || !!value.key, "A save reference is required with uploads");

export const inboxQuerySchema = z.strictObject({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  kind: z.enum(["CHAT", "DISPUTE"]).optional(),
  cursor: z.string().min(1).max(1000).optional(),
});
export const inboxCursorSchema = z.strictObject({
  id: z.uuid(),
  updatedAt: z.iso.datetime({ offset: true }),
});
