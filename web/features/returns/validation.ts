import { z } from "zod";
export const bankSchema = z.strictObject({
  bank: z.string().trim().min(2).max(100),
  accountNumber: z.string().regex(/^\d{10}$/),
  accountName: z.string().trim().min(2).max(120),
});
export const approvalSchema = z.strictObject({
  key: z.uuid(), reason: z.string().trim().min(3).max(500), refundDelivery: z.boolean().default(false),
  items: z.array(z.strictObject({ orderItemId: z.uuid(), quantity: z.number().int().min(1).max(99), restock: z.boolean().default(false) })).max(50),
}).refine(value => value.items.length > 0 || value.refundDelivery, "Select returned items or a delivery refund")
  .refine(value => new Set(value.items.map(item => item.orderItemId)).size === value.items.length, "Duplicate return lines");
export const transferSchema = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("transfer"), key: z.uuid() }),
  z.strictObject({ action: z.literal("confirm"), transferId: z.uuid(), reference: z.string().trim().min(3).max(120) }),
  z.strictObject({ action: z.literal("unlock"), transferId: z.uuid(), reason: z.string().trim().min(5).max(500) }),
]);
export const refundWaitMs = 20 * 60 * 1000;
export class ReturnError extends Error { constructor(message: string, public status = 409) { super(message); } }
