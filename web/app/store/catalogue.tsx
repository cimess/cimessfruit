"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { fixedProductImage } from "@/lib/product-images";
import CurrentPhoto from "./current-photo";
import { useCart } from "./use-cart";
export type ShopOption = { id: string; size: string; label: string; detail: string; price: number; stock: number };
export type ShopProduct = { id: string; name: string; description: string; category: string; productType?: string | null; batchArrivedAt?: string | null; imageUploadedAt?: string | null; imageUrl: string | null; options: ShopOption[] };
export const money = (kobo: number) => new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN" }).format(kobo / 100);
const names: Record<string, string> = { FRUIT: "Fruit", PLANTAIN: "Plantain", SMOOTHIE: "Smoothies" };
export function ShopPhoto({ src, name, category = "FRUIT" }: { src: string | null; name: string; category?: string }) {
  const [failed, setFailed] = useState(false);
  // eslint-disable-next-line @next/next/no-img-element
  return src && !failed ? <img src={src} alt={name} loading="lazy" onError={() => setFailed(true)} /> : <div className={`shop-photo-placeholder placeholder-${category.toLowerCase()}`}><span aria-hidden="true">✳</span><small>{names[category] ?? "CimessFruit"}</small></div>;
}
export function ShopCard({ product }: { product: ShopProduct }) {
  const { add } = useCart();
  const adding = useRef(false);
  const [checking, setChecking] = useState(false);
  const [viewPhoto, setViewPhoto] = useState(false);
  const fixedImage = fixedProductImage(product);
  const [selected, setSelected] = useState(product.options.find((option) => option.stock > 0)?.id ?? product.options[0]?.id ?? "");
  const [message, setMessage] = useState("");
  const option = product.options.find((item) => item.id === selected);
  return <article className="shop-card"><button className="shop-card-photo photo-trigger" aria-label={`View current photo of ${product.name}`} onClick={() => setViewPhoto(true)}><ShopPhoto src={fixedImage} name={product.name} category={product.category} /><span className="shop-category-badge">{names[product.category]}</span><span className="photo-hint">View current photo ↗</span></button>{viewPhoto && <CurrentPhoto product={product} onClose={() => setViewPhoto(false)} />}<div className="shop-card-content"><h3>{product.name}</h3>{product.batchArrivedAt && <small>Batch added: {new Date(product.batchArrivedAt).toLocaleString("en-NG", { timeZone: "Africa/Lagos" })}</small>}<p>{product.description || "A fresh addition to your everyday."}</p>{product.options.length > 0 ? <label className="shop-size-label">Choose a size<select value={selected} onChange={(event) => { setSelected(event.target.value); setMessage(""); }}>{product.options.map((item) => <option key={item.id} value={item.id}>{item.label}{item.detail ? ` · ${item.detail}` : ""}{item.stock === 0 ? " · Sold out" : ""}</option>)}</select></label> : <p className="shop-size-label">Sizes and prices coming soon.</p>}<div className="shop-buy-row"><strong>{option ? money(option.price) : "Unavailable"}</strong><button disabled={checking || !option || option.stock <= 0} aria-label={`Add ${product.name} to bag`} onClick={async () => {
    if (!option || adding.current) return;
    adding.current = true; setChecking(true); setMessage("");
    try {
      const response = await fetch(`/api/products/${product.id}`, { cache: "no-store" });
      if (!response.ok) throw Error(response.status === 404 ? "This fruit is no longer available." : "Unable to check availability. Please retry.");
      const { product: current } = await response.json() as { product: ShopProduct & { isAvailable: boolean } };
      const currentOption = current.options.find((item) => item.id === option.id);
      if (!current.isAvailable || !currentOption || currentOption.stock <= 0 || currentOption.price <= 0) throw Error("This fruit or size is currently unavailable.");
      const added = add({ productId: current.id, optionId: currentOption.id, name: current.name, label: currentOption.label, imageUrl: fixedProductImage(current), price: currentOption.price, stock: currentOption.stock, quantity: 1 });
      setMessage(added ? "Added to your bag" : "Bag or available stock limit reached");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to add this fruit."); }
    finally { adding.current = false; setChecking(false); }
  }}>{checking ? "Checking…" : !option ? "Coming soon" : option.stock ? "+ Add" : "Sold out"}</button></div><div className="shop-card-message" role="status">{message}</div></div></article>;
}
export default function Catalogue({ featured = false, initialCategory = "" }: { featured?: boolean; initialCategory?: string }) {
  const [category, setCategory] = useState(initialCategory);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [cursor, setCursor] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [items, setItems] = useState<ShopProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const limit = featured ? 4 : 20;
  const resetList = () => {
    setItems([]);
    setCursor(null);
    setNextCursor(null);
    setTotal(0);
    setRevision(value => value + 1);
  };
  useEffect(() => { const refresh = () => { setItems([]); setCursor(null); setNextCursor(null); setRevision(value => value + 1); }; window.addEventListener("cimessfruit:catalogue", refresh); return () => window.removeEventListener("cimessfruit:catalogue", refresh); }, []);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true); setError("");
      try {
        const params = new URLSearchParams({ limit: String(limit) });
        if (cursor) params.set("cursor", cursor);
        if (category) params.set("category", category);
        if (search) params.set("search", search);
        const response = await fetch(`/api/products?${params}`, { signal: controller.signal, cache: "no-store" });
        if (!response.ok) throw Error("We couldn’t load the collection. Please try again.");
        const data = await response.json();
        if (!controller.signal.aborted) {
          setItems(previous => cursor
            ? [...new Map([...previous, ...data.items].map((item: ShopProduct) => [item.id, item])).values()]
            : data.items);
          setNextCursor(data.nextCursor);
          setTotal(data.total);
        }
      } catch (err) { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "Unable to load products."); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void load(); return () => controller.abort();
  }, [limit, cursor, category, search, revision]);
  return <>{!featured && <div className="shop-filters"><div className="category-tabs">{[["", "Everything"], ...Object.entries(names)].map(([key, label]) => <button key={key} className={category === key ? "selected" : ""} aria-pressed={category === key} onClick={() => { setCategory(key); resetList(); }}>{label}</button>)}</div><form className="search-form" onSubmit={(event) => { event.preventDefault(); setSearch(query.trim()); resetList(); }}><input aria-label="Search products" placeholder="Find your favourites…" maxLength={100} value={query} onChange={(event) => setQuery(event.target.value)} /><button aria-label="Search">⌕</button></form></div>}{search && <p className="search-summary">Results for “{search}” <button onClick={() => { setSearch(""); setQuery(""); resetList(); }}>Clear ×</button></p>}{loading && !items.length ? <div className="store-product-grid" role="status" aria-label="Loading products">{[1,2,3,4].map((item) => <div key={item} className="skeleton-card"><div /><span /><span /></div>)}</div> : error && !items.length ? <div className="empty-state" role="alert"><h2>A little pause in the harvest</h2><p>{error}</p><button className="button" onClick={() => setRevision((value) => value + 1)}>Try again</button></div> : !items.length ? <div className="empty-state"><span className="empty-symbol">✳</span><h2>{search || category ? "No matches just yet" : "Fresh things are on their way"}</h2><p>{search || category ? "Try another search or category." : "Our store team is preparing the collection. Check back soon."}</p></div> : <div className="store-product-grid">{items.map((product) => <ShopCard product={product} key={product.id} />)}</div>}{featured ? <div className="browse-all"><Link href="/shop" className="text-link">Explore the whole collection →</Link></div> : <div className="catalogue-more"><span>{items.length} of {total} products</span><div>{error && items.length > 0 && <span role="alert">{error}</span>}{(nextCursor || error) && <button className="button" disabled={loading} onClick={() => error ? setRevision(value => value + 1) : setCursor(nextCursor)}>{loading ? "Loading…" : error ? "Try again" : "Load more"}</button>}</div></div>}</>;
}
