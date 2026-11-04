"use client";
import { useMemo, useSyncExternalStore } from "react";
import { readCart, addCartLine, type CartLine } from "@/lib/store-cart";
const key = "cimessfruit.web-cart";
function subscribe(callback: () => void) {
  window.addEventListener("storage", callback); window.addEventListener("cimess-cart", callback);
  return () => { window.removeEventListener("storage", callback); window.removeEventListener("cimess-cart", callback); };
}
function snapshot() { try { return localStorage.getItem(key); } catch { return null; } }
function write(lines: CartLine[]) {
  localStorage.setItem(key, JSON.stringify(lines)); window.dispatchEvent(new Event("cimess-cart"));
}
export function useCart() {
  const stored = useSyncExternalStore(subscribe, snapshot, () => null);
  const items = useMemo(() => readCart(stored), [stored]);
  return { items, count: items.reduce((sum, line) => sum + line.quantity, 0),
    add: (line: CartLine) => {
      const previous = readCart(snapshot());
      const next = addCartLine(previous, line);
      write(next);
      return (next.find(item => item.optionId === line.optionId)?.quantity ?? 0) > (previous.find(item => item.optionId === line.optionId)?.quantity ?? 0);
    },
    change: (optionId: string, quantity: number) => write(readCart(snapshot()).flatMap((line) => line.optionId !== optionId ? [line] : quantity <= 0 || line.stock <= 0 ? [] : [{ ...line, quantity: Math.min(99, line.stock, quantity) }])),
    clear: () => write([]),
  };
}
