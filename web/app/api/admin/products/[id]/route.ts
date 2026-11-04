import { connection } from "next/server";
import { getProduct, updateProduct, deleteProduct } from "@/controllers/product-handlers";

export async function GET(_request: Request, context: RouteContext<"/api/admin/products/[id]">) {
  await connection();
  return getProduct((await context.params).id, true);
}
export async function PATCH(request: Request, context: RouteContext<"/api/admin/products/[id]">) {
  return updateProduct(request, (await context.params).id);
}
export async function DELETE(_request: Request, context: RouteContext<"/api/admin/products/[id]">) {
  return deleteProduct((await context.params).id);
}
