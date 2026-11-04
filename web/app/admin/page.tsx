import { Suspense } from "react";
import { getCurrentUser } from "@/server/auth/current-user";
import ProductManager from "./product-manager";
async function Products() { const user = await getCurrentUser(); return user ? <ProductManager owner={user.id} /> : null; }
export default function AdminPage() { return <Suspense fallback={<p>Loading products…</p>}><Products /></Suspense>; }
