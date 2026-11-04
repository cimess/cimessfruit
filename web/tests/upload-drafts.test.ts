import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";
import { draftStore, clearDeviceDrafts } from "../features/uploads/browser-drafts";
test("device drafts preserve selected image bytes, isolate accounts/scopes and serialize final deletion", async () => {
  const file = new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" });
  const draft = { fields: { name: "Pineapple", price: "1500" }, image: { file }, submissionKey: "stable-reference" };
  await draftStore("owner-a:product:new", "write", draft);
  assert.equal(await draftStore("owner-b:product:new", "read"), undefined);
  assert.equal(await draftStore("owner-a:chat:DISPUTE:new", "read"), undefined);
  const restored = await draftStore<typeof draft>("owner-a:product:new", "read");
  assert.equal(restored?.fields.price, "1500");
  assert.deepEqual(new Uint8Array(await restored!.image.file.arrayBuffer()), new Uint8Array([1, 2, 3]));
  const write = draftStore("owner-a:product:new", "write", draft);
  const remove = draftStore("owner-a:product:new", "delete");
  await Promise.all([write, remove]);
  assert.equal(await draftStore("owner-a:product:new", "read"), undefined);
  await draftStore("owner-a:chat:DISPUTE:new", "write", { body: "Private evidence" });
  await clearDeviceDrafts();
  assert.equal(await draftStore("owner-a:chat:DISPUTE:new", "read"), undefined);
});
test("expired local drafts are discarded instead of restoring stale image references", async () => {
  const realNow = Date.now;
  await draftStore("expired", "write", { image: { id: "old" } });
  try { Date.now = () => realNow() + 8 * 86400000; assert.equal(await draftStore("expired", "read"), undefined); }
  finally { Date.now = realNow; }
  assert.equal(await draftStore("expired", "read"), undefined);
});
