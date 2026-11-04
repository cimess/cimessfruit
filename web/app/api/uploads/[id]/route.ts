import { deleteUpload, renewUpload } from "@/features/uploads/handlers";
type Context = { params: Promise<{ id: string }> };
export const DELETE = async (_request: Request, context: Context) => deleteUpload((await context.params).id);
export const PATCH = async (_request: Request, context: Context) => renewUpload((await context.params).id);
