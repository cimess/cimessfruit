import assert from "node:assert/strict";
import test from "node:test";
import type { Prisma, PrismaClient } from "../generated/prisma/client";
import type { SessionUser } from "../domain/session-user";
import { uploadHandlers, cleanupUploads, validCron } from "../features/uploads/handlers";
import { attachUploads, productPhoto, submission } from "../features/uploads/service";
import type { ObjectStorage } from "../features/uploads/storage";
const owner = "00000000-0000-4000-8000-000000000001";
const id = "00000000-0000-4000-8000-000000000002";
const admin: SessionUser = { id: owner, name: null, email: null, image: null, phone: null, role: "ADMIN", isActive: true };
function request(type = "image/png", bytes = new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,0])) { const form = new FormData(); form.set("file", new File([bytes], "image.png", { type })); return new Request("https://shop.test/api/admin/images", { method: "POST", body: form }); }
const store = (): ObjectStorage => ({ url: (id, key, purpose) => purpose === "PRODUCT" ? `https://photos.test/${key}` : `https://shop.test/api/uploads/${id}/content`, put: async () => {}, remove: async () => {}, get: async () => ({ bytes: new Uint8Array([1]), type: "image/png" }) });
function fakeAssets() {
  const records: Record<string, unknown>[] = [];
  const uploadAsset = {
    create: async ({ data }: { data: Record<string, unknown> }) => { const value = { state: "UPLOADING", uploadedAt: null, ...data }; records.push(value); return value; },
    update: async ({ where, data }: { where: { id: string }; data: object }) => { const row = records.find(row => row.id === where.id)!; Object.assign(row, data); return row; },
  };
  return { records, db: { uploadAsset } as unknown as PrismaClient };
}
test("upload authorization and validation run before any Cloudflare PUT", async () => {
  let calls = 0; const storage = { ...store(), put: async () => { calls++; } };
  for (const account of [null, { ...admin, role: "CUSTOMER" as const }, admin]) {
    const { db } = fakeAssets(); const handlers = uploadHandlers({ db, currentUser: async () => account, allowAttempt: async () => true, storage: () => storage });
    assert.equal((await handlers.upload(request("image/png", new Uint8Array([1,2,3])), "PRODUCT")).status, account === admin ? 400 : account ? 403 : 401);
  }
  assert.equal(calls, 0);
});
test("only a successful Cloudflare PUT produces a URL and server timestamp; failures retain cleanup records", async () => {
  for (const succeeds of [false, true]) {
    const { records, db } = fakeAssets();
    const handlers = uploadHandlers({ db, currentUser: async () => admin, allowAttempt: async () => true, storage: () => ({ ...store(), put: async () => { assert.equal(records[0].state, "UPLOADING"); if (!succeeds) throw Error("network disconnected"); } }) });
    const before = Date.now(); const result = await handlers.upload(request(), "PRODUCT"), body = await result.json();
    assert.equal(result.status, succeeds ? 201 : 503); assert.equal(records.length, 1);
    if (succeeds) { assert.equal(records[0].state, "READY"); assert.ok(Date.parse(body.imageUploadedAt) >= before); assert.ok(body.imageUrl.startsWith("https://photos.test/product/")); assert.ok(body.id); }
    else { assert.equal(records[0].state, "UPLOADING"); assert.equal(body.imageUrl, undefined); }
  }
});
test("evidence accepts signed-in customers but remains inaccessible to other customers and to admins before submission", async () => {
  const row = { id, userId: owner, purpose: "EVIDENCE", state: "READY", expiresAt: new Date(Date.now() + 10000), objectKey: "private/key" };
  const db = { uploadAsset: { findUnique: async () => row } } as unknown as PrismaClient;
  for (const account of [{ ...admin, role: "CUSTOMER" as const }, { ...admin, id, role: "CUSTOMER" as const }, { ...admin, id }]) {
    const handler = uploadHandlers({ db, currentUser: async () => account, allowAttempt: async () => true, storage: store });
    assert.equal((await handler.content(id)).status, account.id === owner ? 200 : 404);
  }
  row.state = "ATTACHED";
  const handler = uploadHandlers({ db, currentUser: async () => ({ ...admin, id }), allowAttempt: async () => true, storage: store });
  assert.equal((await handler.content(id)).status, 200);
});
test("attachment rejects expired, wrong-owner and incomplete uploads before any changes", async () => {
  const valid = { id, userId: owner, state: "READY", purpose: "PRODUCT", expiresAt: new Date(Date.now()+10000), uploadedAt: new Date(), attachedTo: null };
  for (const files of [[], [{ ...valid, uploadedAt: null }], [{ ...valid, expiresAt: new Date(0) }]]) {
    let changed = false;
    const tx = { uploadAsset: { findMany: async () => files, updateMany: async () => { changed = true; return { count: 1 }; } } } as unknown as Prisma.TransactionClient;
    await assert.rejects(attachUploads(tx, owner, [id], "PRODUCT", "product:test")); assert.equal(changed, false);
  }
});
test("product replacement attaches only server metadata and archives its previous published photo", async () => {
  const uploadedAt = new Date(); const updates: object[] = [];
  const tx = { uploadAsset: { findMany: async () => [{ id, state: "READY", attachedTo: null, uploadedAt, expiresAt: new Date(Date.now()+10000), url: "https://photos.test/new" }], updateMany: async (args: object) => { updates.push(args); return { count: 1 }; } } } as unknown as Prisma.TransactionClient;
  assert.deepEqual(await productPhoto(tx, owner, id, "product-id", "https://photos.test/old"), { imageUrl: "https://photos.test/new", imageUploadedAt: uploadedAt });
  assert.equal(updates.length, 2); assert.equal((updates[1] as { data: { state: string } }).data.state, "ARCHIVED");
});
test("cleanup resumes persisted pending work, isolates provider errors and leaves attached/archived assets alone", async () => {
  const rows = ["first", "second"].map(id => ({ id, state: "READY", expiresAt: new Date(0), leaseUntil: null as Date | null, retryAt: null as Date | null, objectKey: id, purpose: "PRODUCT" }));
  const db = { uploadAsset: {
    findFirst: async () => rows.find(row => row.state !== "DELETED" && !row.retryAt && !row.leaseUntil) ?? null,
    updateMany: async ({ where, data }: { where: { id: string }; data: object }) => { Object.assign(rows.find(row => row.id === where.id)!, data); return { count: 1 }; },
  } } as unknown as PrismaClient;
  let fail = true;
  const storage = { ...store(), remove: async (key: string) => { if (key === "second" && fail) throw Error("temporary failure"); } };
  const first = await cleanupUploads(db, storage); assert.equal(first.deleted, 1); assert.equal(first.failed, 1); assert.equal(rows[1].state, "DELETE_PENDING");
  fail = false; rows[1].retryAt = null;
  assert.equal((await cleanupUploads(db, storage)).deleted, 1); assert.equal(rows[1].state, "DELETED");
});
test("submission keys detect account, scope and payload reuse; cron requires a strong matching secret", async () => {
  const original = await submission({ submissionReceipt: { findUnique: async () => null } } as unknown as Prisma.TransactionClient, id, owner, "product:new", { name: "apple" });
  const receipt = { userId: owner, scope: "product:new", hash: original.hash, entityId: id };
  const tx = { submissionReceipt: { findUnique: async () => receipt } } as unknown as Prisma.TransactionClient;
  assert.equal((await submission(tx, id, owner, "product:new", { name: "apple" })).existing?.entityId, id);
  await assert.rejects(submission(tx, id, owner, "product:new", { name: "banana" }));
  await assert.rejects(submission(tx, id, id, "product:new", { name: "apple" }));
  const secret = "long-enough-cron-secret";
  assert.equal(validCron(new Request("https://shop.test", { headers: { Authorization: `Bearer ${secret}` } }), secret), true);
  assert.equal(validCron(new Request("https://shop.test"), secret), false);
});
test("a crash after Cloudflare deletion leaves a recoverable lease; retry safely repeats deletion", async () => {
  const row = { id, state: "READY", expiresAt: new Date(0), leaseUntil: null as Date | null, objectKey: "file", purpose: "PRODUCT" };
  let interrupt = true, calls = 0;
  const db = { uploadAsset: {
    findFirst: async () => row.state !== "DELETED" && !row.leaseUntil ? row : null,
    updateMany: async ({ data }: { data: { state?: string; leaseUntil?: Date | null } }) => {
      if (interrupt && (data.state === "DELETED" || data.leaseUntil === null)) throw Error("database disconnected");
      Object.assign(row, data); return { count: 1 };
    },
  } } as unknown as PrismaClient;
  const storage = { ...store(), remove: async () => { calls++; } };
  await assert.rejects(cleanupUploads(db, storage)); assert.equal(row.state, "DELETE_PENDING"); assert.ok(row.leaseUntil);
  interrupt = false; row.leaseUntil = null; // next daily invocation after the lease expires
  assert.equal((await cleanupUploads(db, storage)).deleted, 1); assert.equal(calls, 2);
});
test("explicit batch arrivals can announce stock without a photo; photo-only edits do not announce a new batch", async () => {
  const { productEvent } = await import("../server/notifications/events");
  const before = { id, name: "Pineapple", isAvailable: true, options: [{ size: "SMALL", stock: 5 }] };
  assert.equal(productEvent(before, { ...before }), null);
  assert.equal(productEvent(before, { ...before, batchArrivedAt: new Date() })?.title, "New batch in the shop");
});
