import assert from "node:assert/strict";
import test from "node:test";
import { retryDelay } from "../src/features/realtime/protocol";

test("short-lived streams back off and retry jitter stays bounded", () => {
  assert.deepEqual([0, 1, 2, 3, 4, 10].map(n => retryDelay(n, 0)), [5000, 10000, 20000, 40000, 60000, 60000]);
  assert.equal(retryDelay(10, 1), 72000);
});
