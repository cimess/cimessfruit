import { chooseReturnResolution } from "@/features/returns/handlers";
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) { return chooseReturnResolution(request, (await context.params).id); }
