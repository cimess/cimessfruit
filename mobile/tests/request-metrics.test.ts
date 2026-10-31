import test from "node:test";
import assert from "node:assert/strict";
import { createRequestMetrics } from "../src/features/diagnostics/requests";
test("request metrics aggregate without retaining query values, IDs, credentials or response bodies", () => {
  const metrics = createRequestMetrics();
  metrics.observe({ path: "/api/orders/00000000-0000-4000-8000-000000000001?secret=hidden", method: "GET", status: 200, payloadBytes: 120, durationMs: 10 });
  metrics.observe({ path: "/api/orders/00000000-0000-4000-8000-000000000002", method: "GET", status: 503, payloadBytes: null, durationMs: 20 });
  const report = metrics.snapshot(); assert.equal(report.routes.length, 1); assert.equal(report.routes[0].route, "GET /api/orders/:id"); assert.equal(report.routes[0].requests, 2); assert.equal(report.routes[0].payloadBytes, 120); assert.equal(report.routes[0].unknownPayloads, 1); assert.equal(report.routes[0].errors, 1); assert.ok(!JSON.stringify(report).includes("hidden"));
  metrics.reset(); assert.equal(metrics.snapshot().routes.length, 0);
});
