import { Suspense } from "react";
import StoreShell from "../store/store-shell";
import Catalogue from "../store/catalogue";
export default function ShopPage(props: PageProps<"/shop">) { return <StoreShell><section className="store-page-heading"><p className="eyebrow">FRESH FINDS. EVERY DAY.</p><h1>Goodness, by the basket.</h1><p>Pick your favourites, choose your size, and make it yours.</p></section><section className="store-section shop-page-section"><Suspense fallback={<p role="status">Opening the collection…</p>}><Shop searchParams={props.searchParams} /></Suspense></section></StoreShell>; }
async function Shop({ searchParams }: Pick<PageProps<"/shop">,"searchParams">) {
  const { category } = await searchParams;
  return <Catalogue key={String(category)} initialCategory={typeof category === "string" && ["FRUIT","PLANTAIN","SMOOTHIE"].includes(category) ? category : ""} />;
}
