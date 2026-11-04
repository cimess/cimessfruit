"use client";
import { useEffect, useRef, useState } from "react";
import type { ShopProduct } from "./catalogue";
export default function CurrentPhoto({ product, onClose }: { product: ShopProduct; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [current, setCurrent] = useState<ShopProduct | null>(null);
  const [error, setError] = useState("");
  const [failed, setFailed] = useState(false);
  const [revision, setRevision] = useState(0);
  const [isFullPage, setIsFullPage] = useState(false);

  useEffect(() => { dialog.current?.showModal(); }, []);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setCurrent(null); setError(""); setFailed(false);
      try {
        const response = await fetch(`/api/products/${product.id}`, { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw Error("We couldn’t load the latest photo. Please try again.");
        const data = await response.json();
        if (!controller.signal.aborted) setCurrent(data.product);
      } catch (err) { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "Unable to load photo."); }
    }
    void load();
    return () => controller.abort();
  }, [product.id, revision]);

  return (
    <>
      <dialog
        ref={dialog}
        className="current-photo-dialog"
        aria-labelledby="current-photo-title"
        onCancel={(event) => { event.preventDefault(); onClose(); }}
      >
        <div className="dialog-header">
          <div>
            <p className="eyebrow">CURRENT STOCK PHOTO</p>
            <h2 id="current-photo-title">{product.name}</h2>
          </div>
          <button className="icon-button" aria-label="Close current photo" onClick={onClose}>×</button>
        </div>
        <div className="current-photo-body">
          {error ? (
            <p role="alert">{error}</p>
          ) : !current ? (
            <p role="status">Loading latest photo…</p>
          ) : !current.imageUrl ? (
            <p>No current photo has been uploaded yet. Check back soon.</p>
          ) : (
            <>
              {failed ? (
                <p role="alert">This photo is unavailable. Please try again later.</p>
              ) : (
                <div style={{ position: "relative" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    key={current.imageUrl + revision}
                    src={current.imageUrl}
                    alt={`Current stock of ${current.name}`}
                    onError={() => setFailed(true)}
                    onClick={() => setIsFullPage(true)}
                    style={{ cursor: "zoom-in" }}
                  />
                  <button
                    type="button"
                    onClick={() => setIsFullPage(true)}
                    className="button"
                    style={{
                      position: "absolute",
                      bottom: 12,
                      right: 12,
                      padding: "6px 14px",
                      fontSize: "0.82rem",
                      background: "rgba(255, 255, 255, 0.92)",
                      color: "#128a3a",
                      fontWeight: 700,
                      borderRadius: 20,
                      boxShadow: "0 4px 12px rgba(0,0,0,0.12)",
                    }}
                  >
                    🔍 View Fullscreen
                  </button>
                </div>
              )}
              <p>
                {current.imageUploadedAt ? (
                  <>
                    Last uploaded:{" "}
                    <time dateTime={current.imageUploadedAt}>
                      {new Intl.DateTimeFormat("en-NG", {
                        dateStyle: "medium",
                        timeStyle: "short",
                        timeZone: "Africa/Lagos",
                      }).format(new Date(current.imageUploadedAt))}{" "}
                      (Lagos time)
                    </time>
                  </>
                ) : (
                  "Upload time not provided."
                )}
              </p>
            </>
          )}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 8 }}>
            <button className="button" onClick={() => setRevision((value) => value + 1)}>
              Refresh photo
            </button>
            {current?.imageUrl && !failed && (
              <button
                className="button button-primary"
                onClick={() => setIsFullPage(true)}
              >
                Open Fullscreen
              </button>
            )}
          </div>
        </div>
      </dialog>

      {/* Full Page Zoom Modal */}
      {isFullPage && current?.imageUrl && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Full screen preview of ${product.name}`}
          onClick={() => setIsFullPage(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            backgroundColor: "rgba(0, 0, 0, 0.92)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            backdropFilter: "blur(6px)",
            cursor: "zoom-out",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: 20,
              left: 24,
              right: 24,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              color: "white",
              pointerEvents: "none",
            }}
          >
            <div>
              <h3 style={{ margin: 0, fontSize: "1.2rem", fontWeight: 800 }}>{product.name} — Live Stock</h3>
              <p style={{ margin: "4px 0 0", fontSize: "0.85rem", opacity: 0.8 }}>
                {current.imageUploadedAt
                  ? `Batch arrived: ${new Date(current.imageUploadedAt).toLocaleDateString()}`
                  : "Live batch"}
              </p>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsFullPage(false);
              }}
              style={{
                pointerEvents: "auto",
                background: "rgba(255, 255, 255, 0.2)",
                color: "#fff",
                border: "none",
                borderRadius: "50%",
                width: 44,
                height: 44,
                fontSize: 24,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
              aria-label="Close fullscreen"
            >
              ×
            </button>
          </div>

          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={current.imageUrl}
            alt={`Full screen view of ${product.name}`}
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: "96vw",
              maxHeight: "86vh",
              objectFit: "contain",
              borderRadius: 12,
              boxShadow: "0 12px 40px rgba(0, 0, 0, 0.5)",
              cursor: "default",
            }}
          />

          <span style={{ color: "rgba(255,255,255,0.7)", fontSize: "0.85rem", marginTop: 14 }}>
            Click anywhere outside or tap the &times; button to exit
          </span>
        </div>
      )}
    </>
  );
}
