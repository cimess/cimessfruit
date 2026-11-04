"use client";
import { useEffect, useState } from "react";
import { money } from "@/app/store/catalogue";
export default function CheckoutCredit({ selected, onChange, replacementId, onReplacement }: { selected: boolean; onChange: (value: boolean) => void; replacementId: string; onReplacement: (value: string) => void }) {
  const [replacements, setReplacements] = useState<{ id: string; orderId: string }[]>([]);
  const [balance, setBalance] = useState<number | null>(null), [error, setError] = useState(""), [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/returns/balance", { cache: "no-store", signal: controller.signal }).then(async response => {
      const data = await response.json(); if (!response.ok) throw Error(data.error); if (!controller.signal.aborted) { setBalance(data.available); setReplacements(data.replacements ?? []); setError(""); }
    }).catch(error => { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "Unable to load credit"); });
    return () => controller.abort();
  }, [revision]);
  return <div><p>Available return credit: {balance === null ? "checking…" : money(balance)}</p><label><input type="checkbox" checked={selected} disabled={!selected && (!balance || !!error)} onChange={event => { onChange(event.target.checked); if (!event.target.checked) onReplacement(""); }} /> Use return credit toward this order; transfer only any remaining amount.</label><label>Approved replacement delivery<select value={replacementId} onChange={event => { onReplacement(event.target.value); if (event.target.value) onChange(true); }}><option value="">No replacement benefit</option>{replacements.map(item => <option key={item.id} value={item.id}>Order {item.orderId.slice(0, 8)} — delivery waived once</option>)}</select></label>{error && <p role="alert">{error}</p>}<button type="button" className="text-link" onClick={() => setRevision(value => value + 1)}>Refresh credit balance</button></div>;
}
