import { getCheckoutSettings, createCheckout } from "@/controllers/checkout-handlers";
export const GET = () => getCheckoutSettings();
export const POST = (request: Request) => createCheckout(request);
