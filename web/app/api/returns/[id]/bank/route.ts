import { saveReturnBankDetails } from "@/features/returns/handlers";
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) { return saveReturnBankDetails(request, (await context.params).id); }
