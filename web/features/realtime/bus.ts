import Redis from "ioredis";
export type Change = {
  kind: "order.changed" | "catalogue.changed";
  userId?: string;
  entityId?: string;
};
export interface ChangeBus {
  publish(change: Change): Promise<void>;
  subscribe(
    listener: (change: Change) => void,
    failed: () => void,
  ): Promise<() => void>;
}
export const realtimeEnabled = () => process.env.SSE_ENABLED === "true";
export function redisBus(url: string, prefix: string): ChangeBus {
  const target = new URL(url);
  if (
    !["redis:", "rediss:"].includes(target.protocol) ||
    (process.env.NODE_ENV === "production" && target.protocol !== "rediss:")
  )
    throw Error("Valid TLS Redis URL required");
  const options = {
    lazyConnect: true,
    connectTimeout: 2000,
    commandTimeout: 2000,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 0,
    retryStrategy: () => null,
    enableReadyCheck: false,
  };
  let subscriber: Redis | null = null,
    connecting: Promise<void> | null = null;
  const channel = `${prefix}:realtime:v1`,
    listeners = new Map<(change: Change) => void, () => void>();
  function fail() {
    const callbacks = [...listeners.values()];
    listeners.clear();
    subscriber?.disconnect();
    subscriber = null;
    connecting = null;
    callbacks.forEach((callback) => callback());
  }
  async function connectSubscriber() {
    if (connecting) return connecting;
    if (subscriber?.status === "ready") return;
    connecting = (async () => {
      const connection = new Redis(url, options);
      subscriber = connection;
      connection.on("error", () => {
        if (subscriber === connection) fail();
      });
      connection.on("end", () => {
        if (subscriber === connection) fail();
      });
      connection.on("message", (_channel, value) => {
        if (value.length > 1024) return;
        try {
          const change = JSON.parse(value) as Change;
          if (!["order.changed", "catalogue.changed"].includes(change.kind))
            return;
          for (const listener of listeners.keys()) listener(change);
        } catch {
          /* Ignore malformed messages, never forward arbitrary content. */
        }
      });
      await connection.connect();
      await connection.subscribe(channel);
    })().finally(() => {
      connecting = null;
    });
    return connecting;
  }
  return {
    async publish(change) {
      const connection = new Redis(url, options);
      connection.on("error", () => {});
      try {
        await connection.connect();
        await connection.publish(channel, JSON.stringify(change));
      } catch {
        throw Error("Realtime publish unavailable");
      } finally {
        connection.disconnect();
      }
    },
    async subscribe(listener, failed) {
      if (listeners.size >= 100) throw Error("Stream capacity reached");
      listeners.set(listener, failed);
      try {
        await connectSubscriber();
      } catch {
        listeners.delete(listener);
        throw Error("Realtime subscription unavailable");
      }
      return () => {
        listeners.delete(listener);
        if (!listeners.size) {
          const connection = subscriber;
          subscriber = null;
          connection?.removeAllListeners();
          connection?.disconnect();
        }
      };
    },
  };
}
let shared: ChangeBus | undefined;
export function changeBus() {
  if (!process.env.REDIS_URL) throw Error("Realtime Redis is not configured");
  return (shared ??= redisBus(
    process.env.REDIS_URL,
    process.env.REDIS_CACHE_PREFIX || "cimessfruit:development",
  ));
}
