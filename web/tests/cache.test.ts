import assert from "node:assert/strict";
import test from "node:test";
import { createJsonCache, type CacheStore } from "../server/cache/json-cache";
import { createProductHandlers } from "../controllers/product-handlers";
import { createDeliveryZoneService } from "../services/delivery-zones";
import type { PrismaClient } from "../generated/prisma/client";

function memoryStore() {
  let now = 0;
  const entries = new Map<string, { value: string; expires: number }>();
  const store: CacheStore = {
    async get(key) {
      const entry = entries.get(key);
      if (!entry || entry.expires <= now) { entries.delete(key); return null; }
      return entry.value;
    },
    async set(key, value, ttl, nx) {
      if (nx && await store.get(key) !== null) return false;
      entries.set(key, { value, expires: ttl === undefined ? Infinity : now + ttl * 1000 });
      return true;
    },
  };
  return { store, entries, advance: (ms: number) => { now += ms; } };
}

test("cache reuses reads, expires data, isolates scopes and invalidates all list variants", async () => {
  const { store, advance } = memoryStore();
  const cache = createJsonCache(store, "test");
  let reads = 0;
  const load = async () => ({ reads: ++reads });
  assert.deepEqual(await cache.remember("products", "list:1", 30, load), { reads: 1 });
  assert.deepEqual(await cache.remember("products", "list:1", 30, load), { reads: 1 });
  await cache.remember("products", "list:2", 30, load);
  await cache.remember("delivery-zones", "list:1", 300, load);
  await cache.invalidate("products");
  assert.deepEqual(await cache.remember("products", "list:1", 30, load), { reads: 4 });
  assert.deepEqual(await cache.remember("products", "list:2", 30, load), { reads: 5 });
  assert.deepEqual(await cache.remember("delivery-zones", "list:1", 300, load), { reads: 3 });
  advance(30_001);
  assert.deepEqual(await cache.remember("products", "list:1", 30, load), { reads: 6 });
});

test("disabled, unavailable and corrupt caches fall back; database failures are not swallowed", async () => {
  const broken: CacheStore = { get: async () => { throw Error("offline"); }, set: async () => { throw Error("offline"); } };
  for (const store of [null, broken]) {
    const cache = createJsonCache(store, "test");
    assert.equal(await cache.remember("products", "key", 30, async () => "database"), "database");
    await cache.invalidate("products");
    await assert.rejects(cache.remember("products", "key", 30, async () => { throw Error("database failed"); }), /database failed/);
  }
  const { store, entries } = memoryStore();
  const cache = createJsonCache(store, "test");
  await cache.remember("products", "key", 30, async () => "old");
  for (const [key, entry] of entries) if (!key.endsWith(":generation")) entry.value = "{broken";
  assert.equal(await cache.remember("products", "key", 30, async () => "fresh"), "fresh");
});

test("cache write failures do not lose successful database reads", async () => {
  const cache = createJsonCache({ get: async key => key.endsWith(":generation") ? "version" : null, set: async () => { throw Error("full"); } }, "test");
  assert.equal(await cache.remember("products", "key", 30, async () => 42), 42);
});

test("an in-flight old read cannot repopulate the active generation after invalidation", async () => {
  const { store } = memoryStore();
  const cache = createJsonCache(store, "test");
  let release!: (value: string) => void;
  let started!: () => void;
  const ready = new Promise<void>(resolve => { started = resolve; });
  const stale = cache.remember("products", "key", 30, () => { started(); return new Promise<string>(resolve => { release = resolve; }); });
  await ready;
  await cache.invalidate("products");
  release("old");
  assert.equal(await stale, "old");
  assert.equal(await cache.remember("products", "key", 30, async () => "new"), "new");
});

test("metadata eviction does not resurrect old values and prefixes isolate environments", async () => {
  const { store, entries } = memoryStore();
  const cache = createJsonCache(store, "one");
  await cache.remember("products", "key", 30, async () => "old");
  entries.delete("one:v1:products:generation");
  assert.equal(await cache.remember("products", "key", 30, async () => "new"), "new");
  assert.equal(await createJsonCache(store, "two").remember("products", "key", 30, async () => "other"), "other");
});

test("matching misses coalesce locally; failed loads can retry; null and oversized values are not cached", async () => {
  const { store } = memoryStore();
  const cache = createJsonCache(store, "test");
  await cache.invalidate("products");
  let reads = 0;
  const load = async () => { reads++; await new Promise(resolve => setTimeout(resolve, 5)); return "data"; };
  await Promise.all(Array.from({ length: 10 }, () => cache.remember("products", "key", 30, load)));
  assert.equal(reads, 1);
  await assert.rejects(cache.remember("products", "failed", 30, async () => { throw Error("db"); }));
  assert.equal(await cache.remember("products", "failed", 30, async () => "retry"), "retry");
  for (const value of [null, "x".repeat(256 * 1024 + 1)]) {
    let calls = 0;
    const loader = async () => { calls++; return value; };
    await cache.remember("products", "uncached", 30, loader);
    await cache.remember("products", "uncached", 30, loader);
    assert.equal(calls, 2);
  }
});

const id = "c1a10276-792a-4430-88a7-9988af339b7f";
const admin = { id, name: "Admin", email: null, image: null, phone: null, role: "ADMIN" as const, isActive: true };
const request = (body: unknown) => new Request("https://fruit.example/api/products", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

test("product handlers cache public data, separate filters, bypass admin/search and invalidate mutations", async () => {
  const { store } = memoryStore();
  const cache = createJsonCache(store, "test");
  let reads = 0;
  let name = "Apple";
  const db = { product: {
    findMany: async () => { reads++; return [{ id, name, createdAt: new Date("2026-10-28"), options: [{ price: 100 }] }]; },
    findFirst: async () => { reads++; return { id, name }; },
    create: async () => ({ id, name }),
    update: async ({ data }: { data: { name?: string } }) => { name = data.name ?? name; return { id, name }; },
  } } as unknown as Pick<PrismaClient, "product">;
  const handlers = createProductHandlers({ db, cache, currentUser: async () => admin, readBody: req => req.json() });
  const list = (query = "", adminView = false) => handlers.list(new Request(`https://fruit.example/api/products${query}`), adminView);
  await list(); await list(); assert.equal(reads, 1);
  await list("?limit=20&sort=name"); assert.equal(reads, 1);
  await list("?category=FRUIT"); assert.equal(reads, 2);
  await list("", true); await list("", true); assert.equal(reads, 4);
  await list("?search=apple"); await list("?search=apple"); assert.equal(reads, 6);
  await handlers.detail(id); await handlers.detail(id); assert.equal(reads, 7);
  await handlers.detail(id, true); assert.equal(reads, 8);
  const updated = await handlers.update(request({ name: "Pear" }), id);
  assert.equal(updated.status, 200);
  const detail = await handlers.detail(id);
  assert.equal((await detail.json()).product.name, "Pear");
  await list(); assert.equal(reads, 11);
  assert.equal((await handlers.create(request({ name: "New", category: "FRUIT", options: [{ size: "SMALL", label: "Small", price: 100, stock: 1 }] }))).status, 201);
  await list(); assert.equal(reads, 12);
  assert.equal((await handlers.remove(id)).status, 204);
  await list(); assert.equal(reads, 13);
});

test("warm cache never bypasses admin authorization or invalid query validation", async () => {
  const { store } = memoryStore();
  const cache = createJsonCache(store, "test");
  await cache.remember("products", `detail:${id}`, 30, async () => ({ id }));
  const handlers = createProductHandlers({ db: {} as Pick<PrismaClient, "product">, cache, currentUser: async () => null, readBody: async () => null });
  assert.equal((await handlers.detail(id, true)).status, 401);
  assert.equal((await handlers.detail("invalid")).status, 400);
  assert.equal((await handlers.list(new Request("https://fruit.example/api/products?limit=999"))).status, 400);
});

test("delivery-zone dataset respects ordering variants and changes after zone invalidation", async () => {
  const { store } = memoryStore();
  const cache = createJsonCache(store, "test");
  let reads = 0;
  const queries: unknown[] = [];
  const db = { deliveryZone: { findMany: async (query: unknown) => { queries.push(query); reads++; return [{ id: "zone", deliveryFee: reads }]; } } } as unknown as Pick<PrismaClient, "deliveryZone">;
  const zones = createDeliveryZoneService(db, cache);
  await zones.available("name"); await zones.available("name"); assert.equal(reads, 1);
  await zones.available("id"); assert.equal(reads, 2);
  assert.deepEqual(queries, [
    { where: { isAvailable: true }, orderBy: [{ name: "asc" }, { id: "asc" }] },
    { where: { isAvailable: true }, orderBy: [{ id: "asc" }] },
  ]);
  await cache.invalidate("delivery-zones");
  await zones.available("name"); await zones.available("id"); assert.equal(reads, 4);
});

test("zone writes invalidate only after the database succeeds", async () => {
  const { store } = memoryStore();
  const cache = createJsonCache(store, "test");
  let fee = 100, fail = false;
  const db = { deliveryZone: {
    findMany: async () => [{ id: "zone", deliveryFee: fee }],
    upsert: async () => { if (fail) throw Error("database failure"); fee = 200; return { id: "zone", deliveryFee: fee }; },
  } } as unknown as Pick<PrismaClient, "deliveryZone">;
  const zones = createDeliveryZoneService(db, cache);
  const data = { id: "zone", name: "Zone", area: "Area", state: "State", deliveryFee: 200, estimatedMinutesMin: 10, estimatedMinutesMax: 20 };
  assert.equal((await zones.available("name"))[0].deliveryFee, 100);
  await zones.save(data);
  assert.equal((await zones.available("name"))[0].deliveryFee, 200);
  fail = true;
  await assert.rejects(zones.save(data), /database failure/);
});
