"use client";
/* eslint-disable @next/next/no-img-element -- device-selected previews have no public image URL. */
import { useEffect, useState } from "react";
import type { LocalImage } from "./browser-drafts";
export default function BrowserUpload({
  value,
  onChange,
  purpose,
  onBusy,
}: {
  value: LocalImage;
  onChange: (value: LocalImage) => void;
  purpose: "PRODUCT" | "EVIDENCE";
  onBusy?: (busy: boolean) => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [preview, setPreview] = useState("");
  useEffect(() => {
    if (!value.file) return;
    const url = URL.createObjectURL(value.file);
    queueMicrotask(() => setPreview(url));
    return () => URL.revokeObjectURL(url);
  }, [value.file]);
  useEffect(() => {
    if (value.id)
      void fetch(`/api/uploads/${value.id}`, { method: "PATCH" })
        .then((response) => {
          if (!response.ok)
            setError(
              "This upload is unavailable. Remove it or choose and upload another image.",
            );
        })
        .catch(() =>
          setError(
            "Unable to check this upload. You can retry when connected.",
          ),
        );
  }, [value.id]);
  async function remove() {
    if (busy) return;
    setBusy(true);
    onBusy?.(true);
    try {
      if (value.id) {
        const response = await fetch(`/api/uploads/${value.id}`, {
          method: "DELETE",
        });
        if (!response.ok && response.status !== 409)
          throw Error("Unable to remove upload. Try again.");
      }
      onChange({});
    } finally {
      setBusy(false);
      onBusy?.(false);
    }
  }
  async function upload() {
    if (!value.file || busy) return;
    setBusy(true);
    onBusy?.(true);
    setError("");
    try {
      const form = new FormData();
      form.set("file", value.file);
      const response = await fetch(
        purpose === "PRODUCT" ? "/api/admin/images" : "/api/uploads/evidence",
        { method: "POST", body: form },
      );
      const result = await response.json();
      if (!response.ok) throw Error(result.error ?? "Upload failed");
      onChange({ ...result });
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Upload failed. Retry when connected.",
      );
    } finally {
      setBusy(false);
      onBusy?.(false);
    }
  }
  return (
    <div className="field">
      <label>
        Choose {purpose === "PRODUCT" ? "live preview" : "evidence image"}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={busy}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (!file) return;
            if (file.size > 4 * 1024 * 1024) {
              setError("Choose an image up to 4 MB.");
              return;
            }
            const old = value.id;
            onChange({ file });
            setError("");
            if (old)
              void fetch(`/api/uploads/${old}`, { method: "DELETE" }).catch(
                () => {},
              );
          }}
        />
      </label>
      {value.file && (
        <>
          <p>{value.file.name}</p>
          {preview && (
            <img
              src={preview}
              alt="Selected image preview"
              style={{ maxWidth: 240, maxHeight: 180 }}
            />
          )}
          <button
            type="button"
            className="button"
            disabled={busy}
            onClick={() => void upload()}
          >
            {busy ? "Uploading…" : "Upload image"}
          </button>
        </>
      )}
      {value.imageUrl && (
        <>
          <p style={{ overflowWrap: "anywhere" }}>{value.imageUrl}</p>
          <p>
            Uploaded:{" "}
            {value.imageUploadedAt
              ? new Date(value.imageUploadedAt).toLocaleString()
              : "—"}
          </p>
        </>
      )}
      {(value.file || value.id) && (
        <button
          type="button"
          className="button"
          disabled={busy}
          onClick={() =>
            void remove().catch((error) => setError(error.message))
          }
        >
          Remove
        </button>
      )}
      <small>
        JPEG, PNG or WebP, up to 4 MB. Saved to this device until you submit.
      </small>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
