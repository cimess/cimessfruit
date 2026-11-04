"use client";
import { useCallback, useEffect, useRef, useState } from "react";
let generation = 0;
const database = "cimessfruit-device-drafts";
function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(database, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("drafts");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
let tail: Promise<unknown> = Promise.resolve();
function serial<T>(operation: () => Promise<T>): Promise<T> {
  const next = tail.then(operation);
  tail = next.catch(() => {});
  return next;
}
export function draftStore<T>(
  key: string,
  operation: "read" | "write" | "delete",
  value?: T,
): Promise<T | undefined> {
  return serial(async () => {
    const db = await open();
    try {
      return await new Promise<T | undefined>((resolve, reject) => {
        const tx = db.transaction("drafts", "readwrite"),
          store = tx.objectStore("drafts");
        const request =
          operation === "read"
            ? store.get(key)
            : operation === "write"
              ? store.put({ value, touched: Date.now() }, key)
              : store.delete(key);
        let result: T | undefined;
        request.onsuccess = () => {
          if (operation === "read") {
            const saved = request.result;
            if (saved && saved.touched > Date.now() - 7 * 86400000)
              result = saved.value;
            else if (saved) store.delete(key);
          }
        };
        tx.oncomplete = () => resolve(result);
        tx.onerror = () => reject(tx.error);
      });
    } finally {
      db.close();
    }
  });
}
function clearDraftDatabase() {
  return serial(async () => {
    const db = await open();
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction("drafts", "readwrite");
        tx.objectStore("drafts").clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } finally {
      db.close();
    }
  });
}
export function clearDeviceDrafts() {
  generation++;
  if (
    typeof BroadcastChannel !== "undefined" &&
    typeof window !== "undefined"
  ) {
    const channel = new BroadcastChannel("cimessfruit-draft-lifecycle");
    channel.postMessage("clear");
    channel.close();
  }
  return clearDraftDatabase();
}
export function useDeviceDraft<T>(key: string, initial: T) {
  const ownerGeneration = useRef(generation);
  const seed = useRef(initial),
    current = useRef(initial),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null),
    dirty = useRef(false);
  const [value, setValue] = useState(initial),
    [ready, setReady] = useState(false),
    [storageError, setStorageError] = useState("");
  const flush = useCallback(async () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (ownerGeneration.current !== generation) {
      dirty.current = false;
      return;
    }
    if (dirty.current) {
      dirty.current = false;
      try {
        await draftStore(key, "write", current.current);
      } catch {
        dirty.current = true;
        setStorageError("Unable to save this draft on your device.");
      }
    }
    await tail;
  }, [key]);
  useEffect(() => {
    let active = true;
    void draftStore<T>(key, "read")
      .then((saved) => {
        if (active) {
          current.current = saved ?? seed.current;
          setValue(current.current);
          setReady(true);
        }
      })
      .catch(() => {
        if (active) {
          setStorageError(
            "Device storage is unavailable. Keep this page open until you save.",
          );
          setReady(true);
        }
      });
    const channel =
      typeof BroadcastChannel !== "undefined"
        ? new BroadcastChannel("cimessfruit-draft-lifecycle")
        : null;
    if (channel)
      channel.onmessage = (event) => {
        if (event.data !== "clear") return;
        generation++;
        dirty.current = false;
        if (timer.current) {
          clearTimeout(timer.current);
          timer.current = null;
        }
        // Serialize clearing after this tab's already-queued writes too.
        void clearDraftDatabase().catch(() => {});
        setReady(false);
        setStorageError(
          "Signed out in another tab. Reopen this page after signing in.",
        );
      };
    const persist = () => {
      void flush();
    };
    window.addEventListener("pagehide", persist);
    document.addEventListener("visibilitychange", persist);
    return () => {
      active = false;
      channel?.close();
      window.removeEventListener("pagehide", persist);
      document.removeEventListener("visibilitychange", persist);
      void flush();
    };
  }, [key, flush]);
  const update = useCallback(
    (next: T | ((previous: T) => T)) => {
      if (ownerGeneration.current !== generation) return;
      const result =
        typeof next === "function"
          ? (next as (p: T) => T)(current.current)
          : next;
      current.current = result;
      setValue(result);
      dirty.current = true;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        void flush();
      }, 250);
    },
    [flush],
  );
  const clear = useCallback(async () => {
    dirty.current = false;
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    await draftStore(key, "delete").catch(() =>
      setStorageError("Saved, but unable to remove the device draft."),
    );
  }, [key]);
  return { value, update, ready, clear, flush, storageError };
}
export type LocalImage = {
  file?: File;
  id?: string;
  imageUrl?: string;
  imageUploadedAt?: string;
  expiresAt?: string;
};
