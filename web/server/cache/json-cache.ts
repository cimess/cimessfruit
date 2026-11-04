import { randomUUID, createHash } from "node:crypto";

export type CacheScope = "products" | "delivery-zones";
export interface CacheStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds?: number, onlyIfMissing?: boolean): Promise<boolean>;
}
export interface DataCache {
  remember<T>(scope: CacheScope, key: string, ttlSeconds: number, load: () => Promise<T>): Promise<T>;
  invalidate(scope: CacheScope): Promise<void>;
}
export const noCache: DataCache = {
  remember: (_scope, _key, _ttl, load) => load(),
  invalidate: async () => {},
};

// Cache-aside only: database failures propagate; cache failures do not fail requests.
export function createJsonCache(store: CacheStore | null, prefix: string, onError: () => void = () => {}): DataCache {
  if (!store) return noCache;
  const pending = new Map<string, Promise<unknown>>();
  const generationKey = (scope: CacheScope) => `${prefix}:v1:${scope}:generation`;
  async function generation(scope: CacheScope) {
    const key = generationKey(scope);
    const previous = await store!.get(key);
    if (previous) return previous;
    // Random generations prevent evicted metadata from resurrecting older entries.
    const candidate = randomUUID();
    if (await store!.set(key, candidate, undefined, true)) return candidate;
    const winner = await store!.get(key);
    if (!winner) throw new Error("Cache generation unavailable");
    return winner;
  }
  return {
    async remember<T>(scope: CacheScope, key: string, ttlSeconds: number, load: () => Promise<T>): Promise<T> {
      let entryKey: string;
      try {
        const version = await generation(scope);
        const digest = createHash("sha256").update(key).digest("hex");
        entryKey = `${prefix}:v1:${scope}:${version}:${digest}`;
        const raw = await store.get(entryKey);
        if (raw !== null) {
          try { return JSON.parse(raw) as T; } catch { onError(); }
        }
      } catch { onError(); return load(); }
      // Coalesce matching misses within this process, never across generations.
      const existing = pending.get(entryKey);
      if (existing) return existing as Promise<T>;
      const operation = (async () => {
        const value = await load();
        try {
          const serialized = JSON.stringify(value);
          // Avoid large payloads and negative detail caching on a small Redis VM.
          if (value !== null && serialized && Buffer.byteLength(serialized) <= 256 * 1024) {
            await store.set(entryKey, serialized, ttlSeconds);
          }
        } catch { onError(); }
        return value;
      })();
      pending.set(entryKey, operation);
      try { return await operation; } finally { pending.delete(entryKey); }
    },
    async invalidate(scope: CacheScope) {
      try {
        // In-flight reads can fill only their old generation; no KEYS/SCAN needed.
        await store.set(generationKey(scope), randomUUID());
      } catch { onError(); }
    },
  };
}
