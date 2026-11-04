import test from "node:test";
import assert from "node:assert/strict";
import { cleanupCredentials } from "../features/maintenance/credentials";
test("credential cleanup drains bounded batches fairly and preserves records refreshed after selection", async () => {
  const before = Date.now();
  const rows = Array.from({ length: 205 }, (_, i) => ({ id: String(i), expires: before - 1 }));
  let calls = 0;
  const result = await cleanupCredentials({ sessions: {
    find: async (cutoff, limit) => { assert.equal(limit, 200); return rows.filter(row => row.expires < cutoff.getTime()).slice(0, limit).map(row => row.id); },
    remove: async (ids, cutoff) => { if (!calls++) rows[0].expires = Date.now() + 60000; const selected = rows.filter(row => ids.includes(row.id) && row.expires < cutoff.getTime()); for (const row of selected) rows.splice(rows.indexOf(row), 1); return selected.length; },
  } });
  assert.equal(result.deleted.sessions, 204); assert.equal(result.moreMayRemain, false); assert.equal(rows.length, 1); assert.ok(rows[0].expires > before);
});
test("credential cleanup caps backlog and leaves unprocessed rows for another run", async () => {
  let calls = 0;
  const result = await cleanupCredentials({ tokens: { find: async () => Array.from({ length: 200 }, (_, i) => String(i)), remove: async ids => { calls++; return ids.length; } } });
  assert.equal(calls, 10); assert.equal(result.deleted.tokens, 2000); assert.equal(result.moreMayRemain, true);
});
