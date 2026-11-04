import { updateOrder } from "@/controllers/checkout-handlers";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) { return updateOrder(request, (await context.params).id, true); }
