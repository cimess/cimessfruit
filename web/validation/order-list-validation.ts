import { z } from "zod";

export const adminOrderQuerySchema = z.strictObject({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().min(1).max(1000).optional(),
});

export const orderCursorSchema = z.strictObject({
  id: z.uuid(),
  createdAt: z.iso.datetime({ offset: true }),
});
