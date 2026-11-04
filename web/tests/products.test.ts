import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "../generated/prisma/client";
import type { SessionUser } from "../domain/session-user";
import { createProductHandlers } from "../controllers/product-handlers";
import { createProductSchema, updateProductSchema } from "../validation/product-validation";

const id = "c1a10276-792a-4430-88a7-9988af339b7f";
const admin: SessionUser = { id, name: "Admin", email: null, image: null, phone: null, role: "ADMIN", isActive: true };
const input = { name: "Apple", category: "FRUIT", options: [{ size: "SMALL", label: "One apple", price: 150000, stock: 5 }] };
const request = (body: unknown) => new Request("https://fruit.example/api/products", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
});

test("product validation rejects unsafe money, stock, duplicate sizes and mass assignment", () => {
  assert.equal(createProductSchema.safeParse(input).success, true);
  for (const price of [0, -1, 1.5, 2147483648, "1500"]) {
    assert.equal(createProductSchema.safeParse({ ...input, options: [{ ...input.options[0], price }] }).success, false);
  }
  for (const stock of [-1, 0.1, 2147483648]) {
    assert.equal(createProductSchema.safeParse({ ...input, options: [{ ...input.options[0], stock }] }).success, false);
  }
  for (const invalid of [
    { ...input, id }, { ...input, name: " " }, { ...input, options: [] },
    { ...input, options: [input.options[0], input.options[0]] },
    { ...input, options: [{ ...input.options[0], productId: id }] },
    { ...input, imageUrl: "javascript:alert(1)" },
    { ...input, imageUrl: "https://user:password@example.com/image.png" },
  ]) assert.equal(createProductSchema.safeParse(invalid).success, false);
  assert.equal(updateProductSchema.safeParse({}).success, false);
  assert.deepEqual(updateProductSchema.parse({ isAvailable: false }), { isAvailable: false });
});

test("handlers enforce admin access independently of Proxy before reading bodies or data", async () => {
  for (const [user, status] of [[null, 401], [{ ...admin, role: "CUSTOMER" }, 403], [{ ...admin, isActive: false }, 401]] as const) {
    const handlers = createProductHandlers({
      db: {} as Pick<PrismaClient, "product">,
      currentUser: async () => user,
      readBody: async () => { throw Error("Must not read body"); },
    });
    for (const response of await Promise.all([
      handlers.create(request(input)), handlers.update(request(input), id), handlers.remove(id),
      handlers.list(new Request("https://fruit.example/api/admin/products"), true), handlers.detail(id, true),
    ])) assert.equal(response.status, status);
  }
});

test("public filters cannot expose unavailable products and pagination is bounded", async () => {
  const calls: unknown[] = [];
  const handlers = createProductHandlers({
    db: { product: { findMany: async (args: unknown) => { calls.push(args); return []; } } } as unknown as Pick<PrismaClient, "product">,
    currentUser: async () => admin,
    readBody: async () => null,
  });
  const response = await handlers.list(new Request("https://fruit.example/api/products?limit=5&category=FRUIT&search=apple"));
  assert.deepEqual(await response.json(), { items: [], nextCursor: null, total: 0, limit: 5 });
  const query = calls[0] as { where: { AND: unknown[] }; skip?: number };
  assert.deepEqual(query.where.AND.slice(0, 3), [
    { isAvailable: true }, { options: { some: {} } }, { category: "FRUIT" },
  ]);
  assert.equal(query.skip, undefined);
  for (const filter of ["isAvailable=false", "limit=101", "page=1", "pagination=cursor", "category=OTHER", "limit=1&limit=2"]) {
    assert.equal((await handlers.list(new Request(`https://fruit.example/api/products?${filter}`))).status, 400);
  }
  assert.equal(calls.length, 1);
  await handlers.list(new Request("https://fruit.example/api/admin/products"), true);
  assert.deepEqual((calls[1] as { where: { AND: unknown[] } }).where.AND, []);
});

test("missing products return 404 and invalid IDs never reach the database", async () => {
  let calls = 0;
  const handlers = createProductHandlers({
    db: { product: {
      findFirst: async () => { calls++; return null; },
      update: async () => { calls++; throw { code: "P2025" }; },
    } } as unknown as Pick<PrismaClient, "product">,
    currentUser: async () => admin, readBody: async (req) => req.json(),
  });
  assert.equal((await handlers.detail("invalid")).status, 400);
  assert.equal((await handlers.update(request({ name: "New" }), "invalid")).status, 400);
  assert.equal((await handlers.remove("invalid")).status, 400);
  assert.equal(calls, 0);
  assert.equal((await handlers.detail(id)).status, 404);
  assert.equal((await handlers.update(request({ name: "New" }), id)).status, 404);
  assert.equal((await handlers.remove(id)).status, 404);
});

test("photo metadata cannot be supplied manually or changed by stock-only edits", async () => {
  assert.equal(updateProductSchema.safeParse({ imageUrl: "https://photos.test/unverified" }).success, false);
  assert.equal(updateProductSchema.safeParse({ imageUploadedAt: "2026-01-01T00:00:00Z" }).success, false);
  const writes: Record<string, unknown>[] = [];
  const handlers = createProductHandlers({ db: { product: {
    findFirst: async () => ({ imageUrl: "https://photos.test/current" }),
    update: async ({ data }: { data: Record<string, unknown> }) => { writes.push(data); return data; },
  } } as unknown as Pick<PrismaClient, "product">, currentUser: async () => admin, readBody: r => r.json() });
  assert.equal((await handlers.update(request({ name: "Fresh apples" }), id)).status, 200);
  assert.equal(Object.hasOwn(writes[0], "imageUploadedAt"), false);
  assert.equal(Object.hasOwn(writes[0], "imageUrl"), false);
});

test("fixed fruit images stay independent of current stock URLs", async () => {
  const { fixedProductImage } = await import("../lib/product-images");
  assert.equal(fixedProductImage({ name: "Fresh green apples" }), "/store/greenApple.webp");
  assert.equal(fixedProductImage({ name: "Pineapple" }), "/store/pineapple.webp");
  assert.equal(fixedProductImage({ name: "Special", productType: "pinkApple" }), "/store/pinkApple.webp");
  assert.equal(createProductSchema.safeParse({ ...input, productType: "invalid" }).success, false);
  assert.equal(updateProductSchema.safeParse({ imageUploadedAt: "not a date" }).success, false);
});

test("managed product photos reject pasted URLs and client timestamps; replay does not create another product", async () => {
  let creates = 0, photoWrites = 0; const savedTime = new Date("2026-10-01T12:00:00Z");
  const record = { id, name: "Apple", imageUrl: null as string | null, imageUploadedAt: null as Date | null, isAvailable: true, options: [{ size: "SMALL", stock: 5 }] };
  let savedId: string | null = null;
  const db = { product: { create: async () => { creates++; return { ...record }; }, update: async ({ data }: { data: object }) => Object.assign(record, data), findUniqueOrThrow: async () => record } } as unknown as Pick<PrismaClient, "product">;
  const handlers = createProductHandlers({ db, currentUser: async () => admin, readBody: r => r.json(),
    photo: async () => { photoWrites++; return { imageUrl: "https://photos.test/server-key", imageUploadedAt: savedTime }; },
    receipt: async (_tx, _owner, _key, _scope, _payload, entityId) => { if (entityId) savedId = entityId; return savedId; },
  });
  assert.equal((await handlers.create(request({ ...input, imageUrl: "https://unverified.test/image" }))).status, 400);
  assert.equal((await handlers.create(request({ ...input, imageUploadedAt: "2026-01-01T00:00:00Z" }))).status, 400);
  const body = { ...input, uploadId: id, submissionKey: id };
  assert.equal((await handlers.create(request(body))).status, 201);
  assert.equal(record.imageUploadedAt, savedTime);
  assert.equal((await handlers.create(request(body))).status, 201);
  assert.equal(creates, 1); assert.equal(photoWrites, 1);
});
