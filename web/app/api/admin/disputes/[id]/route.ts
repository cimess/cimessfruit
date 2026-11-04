import { decideDisputeHandler } from "@/features/chat/handlers";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) { return decideDisputeHandler(request, (await context.params).id); }
