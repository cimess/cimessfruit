import { listOrders } from "@/controllers/checkout-handlers";
export async function GET() { return listOrders(); }
