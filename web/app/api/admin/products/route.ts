import { connection } from "next/server";
import { listProducts, createProduct } from "@/controllers/product-handlers";

export async function GET(request: Request) {
  await connection();
  return listProducts(request, true);
}
export async function POST(request: Request) {
  return createProduct(request);
}
