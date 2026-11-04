import { conversationDetail } from "@/controllers/support";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) { return conversationDetail((await context.params).id, undefined, true, request); }
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) { return conversationDetail((await context.params).id, request, true); }
