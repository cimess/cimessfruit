import { conditionalCatalogue } from "@/features/realtime/conditional";
import { connection } from "next/server";
import { listProducts, createProduct } from "@/controllers/product-handlers";

export async function GET(request: Request) {
  await connection();
  return conditionalCatalogue(request, await listProducts(request));
}
export async function POST(request: Request) {
  return createProduct(request);
}
