"use client";
import RetryCleanup from "@/features/uploads/RetryCleanup";
import { useDeviceDraft, type LocalImage } from "@/features/uploads/browser-drafts";
import BrowserUpload from "@/features/uploads/BrowserUpload";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createProductSchema } from "@/validation/product-validation";
import { fixedProductImage, productTypes } from "@/lib/product-images";
import { nairaToKobo } from "@/lib/product-form";

type Category = "FRUIT" | "PLANTAIN" | "SMOOTHIE";
type Size = "SMALL" | "MEDIUM" | "BIG";
type Option = { id: string; size: Size; label: string; detail: string; price: number; stock: number };
type Product = { id: string; name: string; description: string; category: Category; productType?: string | null; imageUploadedAt?: string | null; imageUrl: string | null; isAvailable: boolean; options: Option[] };
const names = { FRUIT: "Fruit", PLANTAIN: "Plantain", SMOOTHIE: "Smoothie" };
const sizes: Size[] = ["SMALL", "MEDIUM", "BIG"];
const money = (value: number) => new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 2 }).format(value / 100);
const batchSize = 20;
class SessionExpiredError extends Error {}
async function api(path: string, options?: RequestInit) {
  const response = await fetch(path, { ...options, credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json", ...options?.headers } });
  if (response.status === 401) throw new SessionExpiredError("Your session has expired. Please sign in again.");
  if (response.status === 204) return null;
  let body;
  try { body = await response.json(); }
  catch { throw Error("The server is temporarily unavailable. Please try again."); }
  if (!response.ok) throw Error(response.status === 403 ? "You need an active administrator account to do this." : body.error ?? "Something went wrong. Please try again.");
  return body;
}
function useAdminApi() {
  const router = useRouter();
  return useCallback(async (path: string, options?: RequestInit) => {
    try { return await api(path, options); }
    catch (error) { if (error instanceof SessionExpiredError) router.replace("/login"); throw error; }
  }, [router]);
}
function ProductImage({ product }: { product: Pick<Product, "imageUrl" | "category" | "name" | "productType"> }) {
  const [failed, setFailed] = useState(false);
  const src = fixedProductImage(product);
  return <div className={`product-image image-${product.category.toLowerCase()}`}>
    {src && !failed ? /* User-managed external image URLs don't need a Next.js host allowlist. */
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt={product.name} loading="lazy" onError={() => setFailed(true)} /> : <span aria-hidden="true">{product.category === "FRUIT" ? "◒" : product.category === "PLANTAIN" ? "☽" : "▱"}</span>}
  </div>;
}
export default function ProductManager({ owner }: { owner: string }) {
  const request = useAdminApi();
  const [products, setProducts] = useState<Product[]>([]);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [cursor, setCursor] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editor, setEditor] = useState<Product | "new" | null>(null);
  const [archive, setArchive] = useState<Product | null>(null);
  const resetList = () => {
    setProducts([]);
    setCursor(null);
    setNextCursor(null);
    setTotal(0);
    setRevision(value => value + 1);
  };
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true); setError("");
      try {
        const params = new URLSearchParams({ limit: String(batchSize) });
        if (cursor) params.set("cursor", cursor);
        if (search) params.set("search", search);
        if (category) params.set("category", category);
        const data = await request(`/api/admin/products?${params}`, { signal: controller.signal });
        if (!controller.signal.aborted) {
          setProducts(previous => cursor
            ? [...new Map([...previous, ...data.items].map((item: Product) => [item.id, item])).values()]
            : data.items);
          setNextCursor(data.nextCursor);
          setTotal(data.total);
        }
      } catch (err) { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "Unable to load products."); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void load();
    return () => controller.abort();
  }, [search, category, cursor, revision, request]);
  const saved = (message: string) => { setEditor(null); setArchive(null); setNotice(message); resetList(); };
  const active = products.filter((product) => product.isAvailable).length;
  const low = products.flatMap((product) => product.options).filter((option) => option.stock <= 5).length;
  return <>
    <div className="page-heading"><div><p className="eyebrow">YOUR FRESH COLLECTION</p><h1>Product catalogue<span>.</span></h1><p className="page-description">A home for everything fresh. Manage your products, prices and stock.</p></div><button className="button button-primary" onClick={() => setEditor("new")}><span aria-hidden="true">＋</span> Add product</button></div>
    <div className="stats-grid" aria-label="Loaded product summary"><div className="stat-card"><span className="stat-icon">▦</span><div><p>Loaded products</p><strong>{loading || error ? "—" : products.length.toString().padStart(2, "0")}</strong></div><span className="stat-detail">Your collection</span></div><div className="stat-card"><span className="stat-icon green">↗</span><div><p>Available products loaded</p><strong>{loading || error ? "—" : active.toString().padStart(2, "0")}</strong></div><span className="stat-detail">Ready to shop</span></div><div className="stat-card"><span className="stat-icon orange">◷</span><div><p>Low-stock options loaded</p><strong>{loading || error ? "—" : low.toString().padStart(2, "0")}</strong></div><span className="stat-detail">5 or fewer left</span></div></div>
    {notice && <div className="notice" role="status">✓ {notice}<button aria-label="Dismiss notification" onClick={() => setNotice("")}>×</button></div>}
    <section className="catalogue-panel" aria-label="Product list"><div className="catalogue-toolbar"><div className="category-tabs" aria-label="Filter by category">{[["", "All products"], ...Object.entries(names)].map(([value, label]) => <button key={value} aria-pressed={category === value} className={category === value ? "selected" : ""} onClick={() => { setCategory(value); resetList(); }}>{label}</button>)}</div><form className="search-form" onSubmit={(event) => { event.preventDefault(); setSearch(query.trim()); resetList(); }}><span aria-hidden="true">⌕</span><input aria-label="Search products" placeholder="Search products…" value={query} maxLength={100} onChange={(event) => setQuery(event.target.value)} /><button type="submit" aria-label="Submit search">↵</button></form></div>
      {search && <div className="search-summary">Results for “{search}” <button onClick={() => { setSearch(""); setQuery(""); resetList(); }}>Clear search ×</button></div>}
      {loading && !products.length ? <div className="loading-grid" role="status" aria-label="Loading products">{[1, 2, 3, 4, 5, 6].map((item) => <div className="skeleton-card" key={item}><div /><span /><span /></div>)}</div> : error && !products.length ? <div className="empty-state" role="alert"><span className="empty-symbol">!</span><h2>Couldn’t load your products</h2><p>{error}</p><button className="button button-primary" onClick={() => setRevision((value) => value + 1)}>Try again</button></div> : !products.length ? <div className="empty-state"><span className="empty-symbol">✳</span><h2>{search || category ? "Nothing here just yet" : "Your fresh start begins here"}</h2><p>{search || category ? "Try another category or search term." : "Add your first product and bring your catalogue to life."}</p>{!search && !category && <button className="button button-primary" onClick={() => setEditor("new")}>＋ Add your first product</button>}</div> : <div className="product-grid">{products.map((product) => <article className="product-card" key={product.id}><div className="product-visual"><ProductImage key={product.imageUrl} product={product} /><span className={`status-pill ${product.isAvailable ? "available" : "archived"}`}><span />{product.isAvailable ? "Available" : "Archived"}</span><span className="category-tag">{names[product.category]}</span></div><div className="product-card-body"><div className="product-title-row"><h2>{product.name}</h2><span className="option-count">{product.options.length} {product.options.length === 1 ? "size" : "sizes"}</span></div><p className="product-description">{product.description || "No description added yet."}</p><div className="product-price-row"><div><small>FROM</small><strong>{product.options.length ? money(Math.min(...product.options.map((option) => option.price))) : "No price"}</strong></div><span className={product.options.some((option) => option.stock <= 5) ? "stock-count low-stock" : "stock-count"}>{product.options.reduce((sum, option) => sum + option.stock, 0)} in stock</span></div><div className="product-actions"><button onClick={() => setEditor(product)}>Edit product <span aria-hidden="true">↗</span></button>{product.isAvailable ? <button className="archive-button" aria-label={`Archive ${product.name}`} onClick={() => setArchive(product)}>Archive</button> : <span className="muted">Edit to restore</span>}</div></div></article>)}</div>}
      <div className="catalogue-more"><span>{products.length} of {total} products</span><div>{error && products.length > 0 && <span role="alert">{error}</span>}{(nextCursor || error) && <button className="button button-small" disabled={loading} onClick={() => error ? setRevision(value => value + 1) : setCursor(nextCursor)}>{loading ? "Loading…" : error ? "Try again" : "Load more"}</button>}</div></div>
    </section>
    <RetryCleanup />
    {editor && <ProductEditor owner={owner} key={editor === "new" ? "new" : editor.id} product={editor === "new" ? null : editor} onClose={() => setEditor(null)} onSaved={saved} />}
    {archive && <ArchiveDialog product={archive} onClose={() => setArchive(null)} onSaved={saved} />}
  </>;
}
function ProductEditor({ owner, product, onClose, onSaved }: { owner: string; product: Product | null; onClose: () => void; onSaved: (message: string) => void }) {
  const request = useAdminApi();
  const dialog = useRef<HTMLDialogElement>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [enabled, setEnabled] = useState<Size[]>(product?.options.length ? product.options.map((option) => option.size) : ["SMALL"]);
  const formRef = useRef<HTMLFormElement>(null), savingRef = useRef(false);
  const draft = useDeviceDraft<{ fields: Record<string, string>; enabled: Size[]; image: LocalImage; removePhoto: boolean; submissionKey: string; submitted?: boolean; payload?: unknown }>(`${owner}:product:${product?.id ?? "new"}`, { fields: {}, enabled: product?.options.map(o => o.size) ?? ["SMALL"], image: {}, removePhoto: false, submissionKey: "" });
  const restored = useRef(false);
  useEffect(() => {
    if (!draft.ready || restored.current || !formRef.current) return;
    restored.current = true;
    setEnabled(draft.value.enabled);
  }, [draft.ready, draft.value.enabled]);
  useEffect(() => {
    if (!draft.ready || !formRef.current) return;
    for (const [name, value] of Object.entries(draft.value.fields)) { const field = formRef.current.elements.namedItem(name); if (field instanceof HTMLInputElement && field.type === "checkbox") field.checked = value === "on"; else if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement || field instanceof HTMLSelectElement) field.value = value; }
  }, [draft.ready, draft.value.fields, enabled]);
  function persist() {
    if (!draft.ready || !formRef.current) return;
    const fields = Object.fromEntries([...new FormData(formRef.current)].filter((entry): entry is [string, string] => typeof entry[1] === "string"));
    if (!fields.isAvailable) fields.isAvailable = "off";
    draft.update(previous => ({ ...previous, fields, submissionKey: crypto.randomUUID(), submitted: false }));
  }
  const [error, setError] = useState("");
  useEffect(() => { dialog.current?.showModal(); }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingRef.current || saving || uploading || !draft.ready || draft.value.image.file) return;
    savingRef.current = true; setSaving(true);
    const form = new FormData(event.currentTarget);
    setError("");
    try {
      const payload = draft.value.submitted && draft.value.payload ? createProductSchema.parse(draft.value.payload) : createProductSchema.parse({ newBatch: form.get("newBatch") === "on", name: form.get("name"), description: form.get("description"), category: form.get("category"), productType: form.get("productType") || null, uploadId: draft.value.image.id ?? (draft.value.removePhoto ? null : undefined), isAvailable: form.get("isAvailable") === "on", options: enabled.map((size) => ({ size, label: form.get(`${size}-label`), detail: form.get(`${size}-detail`), price: nairaToKobo(String(form.get(`${size}-price`))), stock: Number(form.get(`${size}-stock`)) })) });
      const submissionKey = draft.value.submissionKey || crypto.randomUUID();
      const complete = { ...payload, submissionKey };
      draft.update(previous => ({ ...previous, submissionKey, submitted: true, payload }));
      await draft.flush();
      setSaving(true);
      await request(product ? `/api/admin/products/${product.id}` : "/api/admin/products", { method: product ? "PATCH" : "POST", body: JSON.stringify(complete) });
      await draft.clear();
      onSaved(product ? "Product updated. Your catalogue is up to date." : "Product added to your catalogue.");
    } catch (err) { setError(err instanceof Error ? ("issues" in err ? "Check your fields. Add at least one size, a valid price, and a valid HTTPS image URL." : err.message) : "Unable to save product."); }
    finally { savingRef.current = false; setSaving(false); }
  }
  return <dialog ref={dialog} className="editor-dialog" onCancel={(event) => { event.preventDefault(); if (!saving && !uploading) onClose(); }} aria-labelledby="editor-title"><form ref={formRef} onChange={persist} onSubmit={submit}><div className="dialog-header"><div><p className="eyebrow">THE DETAILS MAKE IT FRESH</p><h2 id="editor-title">{product ? "Edit product" : "Add a product"}</h2></div><button type="button" className="icon-button" aria-label="Close editor" disabled={saving || uploading} onClick={onClose}>×</button></div><fieldset disabled={saving || uploading || !draft.ready} className="editor-fields"><div className="field"><label htmlFor="product-name">Product name</label><input id="product-name" name="name" defaultValue={product?.name} placeholder="e.g. Fresh red apples" required maxLength={150} autoFocus /></div><div className="field-row"><div className="field"><label htmlFor="product-category">Category</label><select id="product-category" name="category" defaultValue={product?.category ?? "FRUIT"}>{Object.entries(names).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select></div><label className="availability-toggle"><input type="checkbox" name="isAvailable" defaultChecked={product?.isAvailable ?? true} /><span>Available to customers<small>Turn off to archive this product</small></span></label></div><div className="field"><label htmlFor="product-description">Description <span>optional</span></label><textarea id="product-description" name="description" rows={3} maxLength={2000} defaultValue={product?.description} placeholder="Tell customers what makes this product special." /></div><div className="field"><label htmlFor="product-type">Fixed product image</label><select id="product-type" name="productType" defaultValue={product?.productType ?? ""}><option value="">Match from product name</option>{Object.entries(productTypes).map(([key, [label]]) => <option value={key} key={key}>{label}</option>)}</select><small>This image stays on the product card.</small></div><label><input type="checkbox" name="newBatch" />A new batch arrived now (records arrival time when saved)</label><BrowserUpload purpose="PRODUCT" value={draft.value.image} onBusy={setUploading} onChange={image => { draft.update(previous => ({ ...previous, image, removePhoto: true, submissionKey: crypto.randomUUID(), submitted: false })); void draft.flush(); }} />{product?.imageUrl && !draft.value.image.id && <><p style={{ overflowWrap: "anywhere" }}>Published photo: {product.imageUrl}</p><label><input type="checkbox" checked={draft.value.removePhoto} onChange={event => draft.update(previous => ({ ...previous, removePhoto: event.target.checked, submissionKey: crypto.randomUUID(), submitted: false }))} />Remove published live photo when saving</label></>}<div className="options-heading"><h3>Sizes & pricing</h3><p>Prices in naira (₦). Stock is counted for each size.</p></div>{sizes.map((size) => { const existing = product?.options.find((option) => option.size === size); const selected = enabled.includes(size); return <section key={size} className={`option-editor ${selected ? "enabled" : ""}`}><label className="option-selector"><input type="checkbox" checked={selected} disabled={!!existing} onChange={(event) => { const next = event.target.checked ? [...enabled, size] : enabled.filter(value => value !== size); setEnabled(next); draft.update(previous => ({ ...previous, enabled: next, submissionKey: crypto.randomUUID(), submitted: false })); }} />{size[0] + size.slice(1).toLowerCase()}<span>{existing ? "Existing size" : "Include this size"}</span></label>{selected && <div className="option-fields"><div className="field"><label htmlFor={`${size}-label`}>Label</label><input id={`${size}-label`} name={`${size}-label`} required maxLength={100} defaultValue={existing?.label ?? size[0] + size.slice(1).toLowerCase()} /></div><div className="field"><label htmlFor={`${size}-price`}>Price (₦)</label><input id={`${size}-price`} name={`${size}-price`} type="number" min="0.01" max="21474836.47" step="0.01" required defaultValue={existing ? (existing.price / 100).toFixed(2) : ""} placeholder="0.00" /></div><div className="field"><label htmlFor={`${size}-stock`}>Stock</label><input id={`${size}-stock`} name={`${size}-stock`} type="number" min="0" max="2147483647" step="1" required defaultValue={existing?.stock ?? 0} /></div><div className="field option-detail"><label htmlFor={`${size}-detail`}>Size details <span>optional</span></label><input id={`${size}-detail`} name={`${size}-detail`} maxLength={500} defaultValue={existing?.detail ?? ""} placeholder="e.g. A basket of six" /></div></div>}</section>; })}<p className="field-hint">Existing sizes stay linked to order history. Set their stock to 0 to stop selling them.</p></fieldset>{draft.storageError && <p role="alert">{draft.storageError}</p>}{error && <p className="form-error" role="alert">{error}</p>}<div className="dialog-footer"><button type="button" className="button" disabled={saving || uploading} onClick={onClose}>Cancel</button><button className="button button-primary" type="submit" disabled={saving || uploading || !draft.ready || !!draft.value.image.file}>{saving ? "Saving product…" : product ? "Save changes" : "Create product"}</button></div></form></dialog>;
}
function ArchiveDialog({ product, onClose, onSaved }: { product: Product; onClose: () => void; onSaved: (message: string) => void }) {
  const request = useAdminApi();
  const dialog = useRef<HTMLDialogElement>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { dialog.current?.showModal(); }, []);
  return <dialog ref={dialog} className="confirm-dialog" aria-labelledby="archive-title" onCancel={(event) => { event.preventDefault(); if (!saving) onClose(); }}><span className="empty-symbol">↙</span><h2 id="archive-title">Archive {product.name}?</h2><p>Customers won’t see this product. Its stock and order history stay safe, and you can restore it from the editor at any time.</p>{error && <p className="form-error" role="alert">{error}</p>}<div className="dialog-footer"><button className="button" disabled={saving} onClick={onClose}>Keep product</button><button className="button button-danger" disabled={saving} onClick={async () => { setSaving(true); setError(""); try { await request(`/api/admin/products/${product.id}`, { method: "DELETE" }); onSaved("Product archived. You can restore it from the editor."); } catch (err) { setError(err instanceof Error ? err.message : "Unable to archive product."); } finally { setSaving(false); } }}>{saving ? "Archiving…" : "Archive product"}</button></div></dialog>;
}
