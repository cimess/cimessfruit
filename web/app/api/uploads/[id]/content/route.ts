import { getUploadContent } from "@/features/uploads/handlers";
export const GET = async (_request: Request, context: { params: Promise<{ id: string }> }) => getUploadContent((await context.params).id);
