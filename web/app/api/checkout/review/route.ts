import { reviewCheckout } from "@/controllers/checkout-handlers";
export const POST = (request: Request) => reviewCheckout(request);
