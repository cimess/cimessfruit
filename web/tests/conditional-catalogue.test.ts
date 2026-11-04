import test from "node:test";
import assert from "node:assert/strict";
import { conditionalCatalogue } from "../features/realtime/conditional";
test("unchanged public catalogue returns a bodyless 304 and changes invalidate its ETag", async () => {
  const first = await conditionalCatalogue(new Request("https://test/api/products"), Response.json({ items: [{ stock: 2 }] }));
  const etag = first.headers.get("etag")!;
  const request = new Request("https://test/api/products", { headers: { "If-None-Match": etag } });
  const same = await conditionalCatalogue(request, Response.json({ items: [{ stock: 2 }] })); assert.equal(same.status, 304); assert.equal(await same.text(), "");
  const changed = await conditionalCatalogue(request, Response.json({ items: [{ stock: 1 }] })); assert.equal(changed.status, 200); assert.notEqual(changed.headers.get("etag"), etag);
  const unavailable = await conditionalCatalogue(request, Response.json({ error: "Unavailable" }, { status: 503 })); assert.equal(unavailable.headers.get("etag"), null);
});
