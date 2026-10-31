import { AppState } from "react-native";
import { Directory, File, Paths } from "expo-file-system";
import { useCallback, useEffect, useRef, useState } from "react";
let generation = 0;
export type LocalImage = {
  uri?: string;
  name?: string;
  type?: string;
  id?: string;
  imageUrl?: string;
  imageUploadedAt?: string;
  expiresAt?: string;
};
export function draftDirectory(owner: string) {
  const dir = new Directory(Paths.document, "drafts", owner);
  dir.create({ intermediates: true, idempotent: true });
  return dir;
}
export function clearDeviceDrafts() {
  generation++;
  const dir = new Directory(Paths.document, "drafts");
  if (dir.exists) dir.delete();
}
function prune(owner: string) {
  const dir = draftDirectory(owner),
    referenced = new Set<string>();
  let unreadable = false;
  for (const entry of dir.list()) {
    if (
      !(entry instanceof File) ||
      !entry.name.endsWith(".json") ||
      entry.name === "picker.json"
    )
      continue;
    try {
      const saved = JSON.parse(entry.textSync());
      if (saved.touched <= Date.now() - 7 * 86400000) {
        entry.delete();
        continue;
      }
      for (const image of saved.value?.images ?? [])
        if (typeof image.uri === "string") referenced.add(image.uri);
    } catch {
      unreadable = true;
    }
  }
  if (unreadable) return;
  for (const entry of dir.list())
    if (
      entry instanceof File &&
      !entry.name.endsWith(".json") &&
      !referenced.has(entry.uri)
    )
      entry.delete();
}
export function useDeviceDraft<T>(owner: string, scope: string, initial: T) {
  const ownerGeneration = useRef(generation);
  const seed = useRef(initial),
    current = useRef(initial),
    dirty = useRef(false),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [value, setValue] = useState(initial),
    [ready, setReady] = useState(false),
    [storageError, setError] = useState("");
  const fileFor = useCallback(
    () => new File(draftDirectory(owner), `${encodeURIComponent(scope)}.json`),
    [owner, scope],
  );
  const flush = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (ownerGeneration.current !== generation) {
      dirty.current = false;
      return;
    }
    if (!dirty.current) return;
    try {
      const file = fileFor(),
        temporary = new File(file.uri + ".tmp");
      temporary.writeSync(
        JSON.stringify({ value: current.current, touched: Date.now() }),
      );
      temporary.moveSync(file, { overwrite: true });
      dirty.current = false;
    } catch {
      setError(
        "Device draft could not be saved. Keep this screen open until you send.",
      );
    }
  }, [fileFor]);
  useEffect(() => {
    try {
      prune(owner);
      const file = fileFor();
      if (file.exists) {
        const saved = JSON.parse(file.textSync());
        if (saved.touched > Date.now() - 7 * 86400000)
          current.current = saved.value;
        else file.delete();
      } else current.current = seed.current;
      setValue(current.current);
    } catch {
      setError("Unable to restore the device draft.");
    }
    setReady(true);
    const listener = AppState.addEventListener("change", (state) => {
      if (state !== "active") flush();
    });
    return () => {
      listener.remove();
      flush();
    };
  }, [fileFor, flush, owner]);
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
      timer.current = setTimeout(flush, 250);
    },
    [flush],
  );
  const clear = useCallback(() => {
    dirty.current = false;
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    try {
      const file = fileFor();
      if (file.exists) file.delete();
    } catch {
      setError("Saved, but device draft could not be removed.");
    }
  }, [fileFor]);
  return { value, update, clear, ready, flush, storageError };
}
