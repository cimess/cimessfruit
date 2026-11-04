"use client";
import { useState } from "react";
export default function RetryCleanup() {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  async function run() {
    if (busy) return;
    setBusy(true);
    try {
      const response = await fetch("/api/admin/uploads/cleanup", {
        method: "POST",
      });
      const result = await response.json();
      if (!response.ok) throw Error(result.error);
      setMessage(
        `Cleaned ${result.deleted} expired uploads; ${result.failed} failed. Pending files remain queued.`,
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Cleanup unavailable",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      <button
        type="button"
        className="button"
        disabled={busy}
        onClick={() => void run()}
      >
        {busy ? "Cleaning expired uploads…" : "Retry expired-upload cleanup"}
      </button>
      <p role="status">{message}</p>
    </div>
  );
}
