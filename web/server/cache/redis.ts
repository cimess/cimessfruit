// Server runtime + maintenance CLI only. Never import into a client component.
import Redis from "ioredis";
import { createJsonCache, type CacheStore } from "./json-cache";

let client: Redis | undefined;
let connecting: Promise<void> | undefined;
let retryAfter = 0;
let lastWarning = 0;
function warn() {
  if (Date.now() - lastWarning > 30_000) {
    lastWarning = Date.now();
    console.warn("Redis cache unavailable; using PostgreSQL. Check Redis connectivity/configuration.");
  }
}
async function deadline<T>(operation: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([operation, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("Cache timeout")), 300);
    })]);
  } finally { if (timer) clearTimeout(timer); }
}
async function run<T>(operation: (redis: Redis) => Promise<T>): Promise<T> {
  if (Date.now() < retryAfter) throw new Error("Cache cooling down");
  try {
    if (!client) {
      const url = new URL(process.env.REDIS_URL!);
      if (!["redis:", "rediss:"].includes(url.protocol)) throw new Error("Invalid Redis protocol");
      if (process.env.NODE_ENV === "production" && url.protocol !== "rediss:") throw new Error("Redis TLS required in production");
      client = new Redis(url.toString(), {
        lazyConnect: true, enableOfflineQueue: false, maxRetriesPerRequest: 0,
        retryStrategy: () => null, autoResendUnfulfilledCommands: false,
        connectTimeout: 250, commandTimeout: 250, enableReadyCheck: false,
      });
      client.on("error", warn); // Never log URLs, credentials or raw connection errors.
    }
    const active = client;
    if (active.status !== "ready") {
      connecting ??= deadline(active.connect()).finally(() => { connecting = undefined; });
      await connecting;
    }
    return await deadline(operation(active));
  } catch (error) {
    retryAfter = Date.now() + 10_000;
    client?.disconnect();
    client = undefined;
    warn();
    throw error;
  }
}
const store: CacheStore = {
  get: key => run(redis => redis.get(key)),
  set: (key, value, ttlSeconds, onlyIfMissing) => run(async redis => {
    const result = onlyIfMissing ? await redis.set(key, value, "NX")
      : ttlSeconds !== undefined ? await redis.set(key, value, "EX", ttlSeconds)
      : await redis.set(key, value);
    return result === "OK";
  }),
};
const prefix = process.env.REDIS_CACHE_PREFIX?.trim() || `cimessfruit:${process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development"}`;
export const dataCache = createJsonCache(process.env.REDIS_URL?.trim() ? store : null, prefix, warn);
export function closeRedis() { client?.disconnect(); client = undefined; }
