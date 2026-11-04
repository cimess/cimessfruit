import { Suspense } from "react";
import StoreShell from "../../store/store-shell";
import TransferOrder from "./transfer-order";
type Props = { params: Promise<{ id: string }> };
export default function OrderPage({ params }: Props) {
  return <Suspense fallback={<p>Loading order…</p>}><StoreShell><section className="store-section"><Suspense fallback={<p>Loading order…</p>}><OrderContent params={params} /></Suspense></section></StoreShell></Suspense>;
}
async function OrderContent({ params }: Props) {
  const { id } = await params;
  return <TransferOrder id={id} />;
}
