import { handleOrderReturns } from "@/features/returns/handlers";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) { return handleOrderReturns(request, (await context.params).id, true); }
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) { return handleOrderReturns(request, (await context.params).id, true); }
