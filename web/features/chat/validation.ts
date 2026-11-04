import { z } from "zod";
export const choices = ["BANK_REFUND", "CREDIT", "REPLACEMENT"] as const;
export const choiceSchema = z.strictObject({ choice: z.enum(choices) });
export const reasons = ["STORE_CANCELLED", "WRONG_ORDER", "WRONG_ITEMS", "SPOILT", "MISSING_ITEMS", "DAMAGED", "CHANGE_OF_MIND", "FAILED_DELIVERY", "WRONG_ADDRESS", "OTHER"] as const;
export const evidenceSchema = z.array(z.url().max(1500).refine(value => {
  const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password && !url.pathname.startsWith("/api/uploads/");
}, "Evidence links must use HTTPS without credentials")).max(3).default([]);
export const disputeSchema = z.strictObject({
  uploadIds: z.array(z.uuid()).max(3).default([]),
  key: z.uuid(), orderId: z.uuid(), reason: z.enum(reasons), body: z.string().trim().min(3).max(2000),
  requestedChoice: z.enum(choices).default("CREDIT"), evidenceUrls: evidenceSchema,
  items: z.array(z.strictObject({ orderItemId: z.uuid(), quantity: z.number().int().min(1).max(99) })).min(1).max(50),
}).refine(value => new Set(value.items.map(item => item.orderItemId)).size === value.items.length, "Duplicate items");
export const decisionSchema = z.strictObject({
  decision: z.enum(["APPROVE", "REJECT"]), responsibility: z.enum(["STORE", "RIDER", "CUSTOMER", "UNDETERMINED"]),
  choiceOverride: z.enum(choices).optional(),
  approvedItems: z.array(z.strictObject({ orderItemId: z.uuid(), quantity: z.number().int().min(1).max(99) })).min(1).max(50).refine(items => new Set(items.map(item => item.orderItemId)).size === items.length, "Duplicate approved items").optional(),
  note: z.string().trim().min(5).max(1000), deliveryOverride: z.boolean().optional(), overrideReason: z.string().trim().min(5).max(500).optional(),
});
