import { z } from "zod";
import { coordinateSchema } from "../domain/delivery-geometry";
export const deliveryAddressSchema = z.strictObject({
  zoneId: z.string().trim().min(1).max(100),
  coordinates: coordinateSchema.optional(),
  streetOrClose: z.string().trim().min(1).max(200),
  houseNumber: z.string().trim().min(1).max(100),
  flatOrBlock: z.string().trim().max(100).default(""),
  landmark: z.string().trim().max(200).default(""),
  note: z.string().trim().max(500).default(""),
  phoneNumber: z.string().trim().regex(/^\+?[0-9]{8,15}$/),
});
export const basketSchema = z.strictObject({
  items: z.array(z.strictObject({ productId: z.uuid(), optionId: z.uuid(), quantity: z.number().int().min(1).max(99) })).min(1).max(50)
    .refine((items) => new Set(items.map((item) => item.optionId)).size === items.length, "Duplicate sizes"),
});
export const basketReviewSchema = basketSchema.extend({ zoneId: z.string().min(1).max(100).optional() });
export const checkoutSchema = basketSchema.extend({ deliveryAddress: deliveryAddressSchema, useReturnCredit: z.boolean().default(false), replacementDisputeId: z.uuid().optional() });
export const checkoutKeySchema = z.string().regex(/^[a-zA-Z0-9_-]{8,128}$/);
export const manualPaymentAccount = { bank: "Moniepoint", accountNumber: "6645847720", accountName: "Aimuan Enterprise" } as const;
export const paymentLabels: Record<string, string> = {
  PENDING: "Awaiting transfer", REVIEW_REQUIRED: "Transfer reported · awaiting verification",
  SUCCESS: "Payment verified", FAILED: "Payment rejected",
};
