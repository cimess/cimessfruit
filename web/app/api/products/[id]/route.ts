import { conditionalCatalogue } from "@/features/realtime/conditional";
import { connection } from "next/server";
import { getProduct, updateProduct, deleteProduct } from "@/controllers/product-handlers";

export async function GET(request: Request, context: RouteContext<"/api/products/[id]">) {
  await connection();
  return conditionalCatalogue(request, await getProduct((await context.params).id));
}
export async function PATCH(request: Request, context: RouteContext<"/api/products/[id]">) {
  return updateProduct(request, (await context.params).id);
}
export async function DELETE(_request: Request, context: RouteContext<"/api/products/[id]">) {
  return deleteProduct((await context.params).id);
}
