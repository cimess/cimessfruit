"use client";
import { useEffect, useState } from "react";
type Zone = { id: string; name: string; area: string; state: string; deliveryFee: number; estimatedMinutesMin: number; estimatedMinutesMax: number; isAvailable: boolean; boundary: { latitude: number; longitude: number }[] | null };
const empty: Zone = { id: "", name: "", area: "", state: "Lagos", deliveryFee: 50000, estimatedMinutesMin: 30, estimatedMinutesMax: 60, isAvailable: false, boundary: null };
export default function DeliveryZones() {
  const [zones, setZones] = useState<Zone[]>([]); const [draft, setDraft] = useState<Zone>(empty); const [points, setPoints] = useState(""); const [error, setError] = useState(""); const [busy, setBusy] = useState(false); const [saved, setSaved] = useState(false);
  async function load() { try { const response = await fetch("/api/admin/delivery-zones"); const data = await response.json(); if (!response.ok) throw Error(data.error); setZones(data.zones); } catch (err) { setError(err instanceof Error ? err.message : "Unable to load zones."); } }
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/admin/delivery-zones", { signal: controller.signal }).then(async response => {
      const data = await response.json(); if (!response.ok) throw Error(data.error); if (!controller.signal.aborted) setZones(data.zones);
    }).catch(err => { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "Unable to load zones."); });
    return () => controller.abort();
  }, []);
  function choose(zone: Zone) { setDraft(zone); setPoints(zone.boundary?.map(point => `${point.latitude}, ${point.longitude}`).join("\n") ?? ""); setSaved(false); setError(""); }
  async function save() {
    if (busy) return; setBusy(true); setSaved(false); setError("");
    try {
      const boundary = points.trim() ? points.trim().split("\n").map(line => { const values = line.split(",").map(value => Number(value.trim())); if (values.length !== 2 || !values.every(Number.isFinite)) throw Error("Each boundary point needs latitude, longitude."); return { latitude: values[0], longitude: values[1] }; }) : null;
      const response = await fetch("/api/admin/delivery-zones", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...draft, boundary }) }); const data = await response.json(); if (!response.ok) throw Error(data.error); await load(); setDraft(data.zone); setSaved(true);
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to save zone."); } finally { setBusy(false); }
  }
  return <><h1>Delivery zones</h1><p>Customers can select active zones immediately. Set the actual delivery boundary to enable map pins. The existing Abesan zone keeps its original ID for saved addresses.</p><div className="checkout-actions">{zones.map(zone => <button className="button" key={zone.id} onClick={() => choose(zone)}>{zone.name} · {zone.isAvailable ? "Active" : "Inactive"}</button>)}<button className="button" onClick={() => choose(empty)}>Add zone</button><button className="button" onClick={() => void load()}>Refresh</button></div><form className="order-history-card" onSubmit={event => { event.preventDefault(); void save(); }}>{(["id", "name", "area", "state"] as const).map(key => <label key={key}>{key === "id" ? "Zone ID (permanent)" : key}<input required value={draft[key]} disabled={key === "id" && zones.some(zone => zone.id === draft.id)} onChange={event => setDraft({ ...draft, [key]: event.target.value })} /></label>)}<label>Delivery fee (₦)<input type="number" min="0" step="0.01" value={draft.deliveryFee / 100} onChange={event => setDraft({ ...draft, deliveryFee: Math.round(Number(event.target.value) * 100) })} /></label>{(["estimatedMinutesMin", "estimatedMinutesMax"] as const).map(key => <label key={key}>{key === "estimatedMinutesMin" ? "Minimum minutes" : "Maximum minutes"}<input type="number" min="1" max="1440" value={draft[key]} onChange={event => setDraft({ ...draft, [key]: Number(event.target.value) })} /></label>)}<label><input type="checkbox" checked={draft.isAvailable} onChange={event => setDraft({ ...draft, isAvailable: event.target.checked })} /> Accept deliveries in this zone</label><label>Coverage boundary points<textarea rows={10} value={points} onChange={event => setPoints(event.target.value)} placeholder="Latitude, longitude — one boundary point per line" /></label><p>List at least three points around the edge in order. Leave blank to offer street addresses only until the boundary is confirmed.</p>{error && <p role="alert">{error}</p>}{saved && <p role="status">Zone saved.</p>}<button className="button button-primary" disabled={busy}>{busy ? "Saving…" : "Save zone"}</button></form></>;
}
