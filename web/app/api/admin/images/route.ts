import { uploadImage } from "@/features/uploads/handlers";
export const maxDuration = 60;
export const POST = (request: Request) => uploadImage(request, "PRODUCT");
