"use client";

import { useState, useTransition } from "react";

export default function ContinueForm({ action, label }: {
  action: () => Promise<string>;
  label: string;
}) {
  const [pending, startTransition] = useTransition();
  const [destination, setDestination] = useState<string>();
  const [error, setError] = useState<string>();
  return <form onSubmit={(event) => {
    event.preventDefault();
    setError(undefined);
    setDestination(undefined);
    startTransition(async () => {
      try {
        const url = await action();
        setDestination(url);
        // Deep links must be handed to the browser, not the Next.js router.
        window.location.assign(url);
      } catch {
        setError("Unable to continue sign-in. Please try again.");
      }
    });
  }}>
    <button disabled={pending} className="rounded bg-green-700 px-5 py-3 text-white disabled:opacity-50" type="submit">
      {pending ? "Preparing sign-in…" : label}
    </button>
    {error && <p role="alert" className="mt-4">{error}</p>}
    {destination && <p className="mt-4">
      If you were not redirected, <a className="underline" href={destination}>open the app or continue sign-in</a>.
      If the code expires, press Continue again.
    </p>}
  </form>;
}
