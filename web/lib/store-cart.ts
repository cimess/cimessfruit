import { z } from "zod";
export const cartLineSchema = z.object({
  productId: z.uuid(), optionId: z.uuid(), name: z.string().max(150), label: z.string().max(100),
  imageUrl: z.string().nullable(), price: z.number().int().positive().max(2147483647),
  stock: z.number().int().nonnegative(), quantity: z.number().int().min(1).max(99),
});
export type CartLine = z.infer<typeof cartLineSchema>;
export function readCart(value: string | null): CartLine[] {
  if (!value) return [];
  try { const result = z.array(cartLineSchema).max(100).safeParse(JSON.parse(value)); return result.success ? result.data : []; }
  catch { return []; }
}
export function addCartLine(lines: CartLine[], incoming: CartLine): CartLine[] {
  if (incoming.stock <= 0) return lines;
  const existing = lines.find((line) => line.optionId === incoming.optionId);
  const next = { ...incoming, quantity: Math.min(99, incoming.stock, (existing?.quantity ?? 0) + incoming.quantity) };
  if (existing) return lines.map((line) => line.optionId === incoming.optionId ? next : line);
  return lines.length >= 100 ? lines : [...lines, next];
}
