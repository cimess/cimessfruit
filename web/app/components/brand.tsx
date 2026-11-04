export function Brand({ light = false, studio = true }: { light?: boolean; studio?: boolean }) {
  return <span className={`brand${light ? " brand-light" : ""}`}><span className="brand-mark" aria-hidden="true"><svg viewBox="0 0 32 32" fill="none"><path d="M16 14C7 3 1 15 7 24c4 6 14 6 18-1 5-9-2-18-9-9Z" fill="currentColor"/><path d="M16 12c-1-7 5-10 10-8-1 6-5 9-10 8Z" fill="currentColor"/></svg></span><span>Cimess<span className="brand-fruit">Fruit</span><small>{studio ? "THE ADMIN STUDIO" : "FRESH FRUIT. EVERY DAY."}</small></span></span>;
}
