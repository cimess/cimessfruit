import { listAdminOrdersHandler } from "@/controllers/checkout-handlers";
export const GET = (request: Request) => listAdminOrdersHandler(request);
