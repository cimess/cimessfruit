import { transferReturnCredit } from "@/features/returns/handlers";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) { return transferReturnCredit(request, (await context.params).id); }
