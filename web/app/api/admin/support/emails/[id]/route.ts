import { getSupportEmail, updateSupportEmail, replySupportEmail } from "@/controllers/support-email";
type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, context: Context) { return getSupportEmail((await context.params).id); }
export async function PATCH(request: Request, context: Context) { return updateSupportEmail(request, (await context.params).id); }
export async function POST(request: Request, context: Context) { return replySupportEmail(request, (await context.params).id); }
