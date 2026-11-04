"use client";
export default function AdminError({ reset }: { reset: () => void }) { return <section className="empty-state"><h1>We couldn’t open your workspace</h1><p>Please try again in a moment.</p><button className="button button-primary" onClick={reset}>Try again</button></section>; }
