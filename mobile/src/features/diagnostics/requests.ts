export type RequestSample = {
  path: string;
  method: string;
  status: number;
  payloadBytes: number | null;
  durationMs: number;
};
const staticSegments = new Set([
  "",
  "api",
  "admin",
  "mobile",
  "auth",
  "login",
  "signup",
  "logout",
  "exchange",
  "me",
  "products",
  "orders",
  "checkout",
  "review",
  "settings",
  "payment",
  "action",
  "support",
  "disputes",
  "returns",
  "balance",
  "choice",
  "bank",
  "transfers",
  "notifications",
  "installations",
  "preferences",
  "delivery-zones",
  "resolve",
  "recovery",
  "request",
  "complete",
  "account",
  "account-deletion",
  "password",
  "uploads",
  "evidence",
  "content",
  "images",
]);
export function createRequestMetrics() {
  let startedAt = Date.now();
  const routes = new Map<
    string,
    {
      requests: number;
      errors: number;
      payloadBytes: number;
      unknownPayloads: number;
      durations: number[];
    }
  >();
  return {
    observe(sample: RequestSample) {
      const route = `${sample.method} ${sample.path
        .split("?")[0]
        .split("/")
        .map((part) => (staticSegments.has(part) ? part : ":id"))
        .join("/")}`;
      if (!routes.has(route) && routes.size >= 64) return;
      const row = routes.get(route) ?? {
        requests: 0,
        errors: 0,
        payloadBytes: 0,
        unknownPayloads: 0,
        durations: [],
      };
      row.requests++;
      if (sample.status === 0 || sample.status >= 400) row.errors++;
      if (sample.payloadBytes === null) row.unknownPayloads++;
      else row.payloadBytes += sample.payloadBytes;
      row.durations.push(Math.max(0, sample.durationMs));
      if (row.durations.length > 100) row.durations.shift();
      routes.set(route, row);
    },
    snapshot() {
      return {
        startedAt: new Date(startedAt).toISOString(),
        elapsedSeconds: Math.round((Date.now() - startedAt) / 1000),
        byteScope:
          "Decoded JSON payload bytes; excludes request bodies, compression, TLS, images, and SSE stream bytes",
        routes: [...routes].map(([route, row]) => {
          const times = [...row.durations].sort((a, b) => a - b);
          return {
            route,
            requests: row.requests,
            errors: row.errors,
            payloadBytes: row.payloadBytes,
            unknownPayloads: row.unknownPayloads,
            p50Ms: times[Math.floor(times.length / 2)] ?? 0,
            p95Ms: times[Math.ceil(times.length * 0.95) - 1] ?? 0,
          };
        }),
      };
    },
    reset() {
      routes.clear();
      startedAt = Date.now();
    },
  };
}
export const requestMetrics = createRequestMetrics();
