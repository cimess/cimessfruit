import { z } from "zod";
import { boundarySchema } from "../domain/delivery-geometry";
export const deliveryZoneSchema = z.strictObject({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,99}$/), name: z.string().trim().min(2).max(100), area: z.string().trim().min(1).max(100), state: z.string().trim().min(1).max(100),
  deliveryFee: z.number().int().min(0).max(100000000), estimatedMinutesMin: z.number().int().min(1).max(1440), estimatedMinutesMax: z.number().int().min(1).max(1440), isAvailable: z.boolean(), boundary: boundarySchema.nullable(),
}).refine(zone => zone.estimatedMinutesMax >= zone.estimatedMinutesMin, "Maximum delivery time must be at least the minimum.");
