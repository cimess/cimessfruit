import { getOrder, updateOrder } from "@/controllers/checkout-handlers";
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) { return getOrder((await context.params).id); }
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) { return updateOrder(request, (await context.params).id); }
