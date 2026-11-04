import assert from "node:assert/strict";
import test from "node:test";
import type { Prisma, PrismaClient } from "../generated/prisma/client";
import { createProductHandlers } from "../controllers/product-handlers";
import { createJsonCache } from "../server/cache/json-cache";

const fixture = () => Array.from({ length: 45 }, (_, index) => ({
  id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
  name: ["Red Apple", "Green Apple", "Pink Apple"][index % 3],
  description: "Fresh fruit",
  category: "FRUIT",
  productType: ["redApple", "greenApple", "pinkApple"][index % 3],
  createdAt: new Date("2026-10-28T00:00:00.123Z"),
  options: [{ price: (index + 1) * 100 }],
}));

function setup(rows = fixture(), cached = false) {
  const queries: Prisma.ProductFindManyArgs[] = [];
  const storage = new Map<string, string>();
  const handlers = createProductHandlers({
    db: { product: { findMany: async (args: Prisma.ProductFindManyArgs) => {
      queries.push(args);
      return rows;
    } } } as unknown as Pick<PrismaClient, "product">,
    currentUser: async () => ({
      id: fixture()[0].id, name: "Admin", email: null, image: null,
      phone: null, role: "ADMIN", isActive: true,
    }),
    readBody: async () => null,
    cache: cached ? createJsonCache({
      get: async key => storage.get(key) ?? null,
      set: async (key, value) => { storage.set(key, value); return true; },
    }, "browse-test", () => { throw Error("Cache failure"); }) : undefined,
  });
  const request = (extra: Record<string, string> = {}, adminView = false) => handlers.list(new Request(
    `https://fruit.example/api/products?${new URLSearchParams({
      category: "FRUIT", limit: "20", ...extra,
    })}`,
  ), adminView);
  return { request, queries };
}

test("cursor browsing returns 20/20/5 with tied timestamps and JSON-cached dates", async () => {
  const { request, queries } = setup(fixture(), true);
  const first = await (await request()).json();
  const second = await (await request({ cursor: first.nextCursor })).json();
  const third = await (await request({ cursor: second.nextCursor })).json();
  assert.deepEqual([first.items.length, second.items.length, third.items.length], [20, 20, 5]);
  assert.equal(first.total, 45);
  assert.equal(third.nextCursor, null);
  const ids = [...first.items, ...second.items, ...third.items].map(row => row.id);
  assert.equal(new Set(ids).size, 45);
  assert.equal(queries.length, 1);
  assert.deepEqual(ids, fixture().map(row => row.id).reverse());
});

test("name and starting-price orders apply before selecting a page", async () => {
  for (const sort of ["name", "price-asc", "price-desc"]) {
    const { request } = setup();
    const first = await (await request({ sort })).json();
    const second = await (await request({ sort, cursor: first.nextCursor })).json();
    const items = [...first.items, ...second.items];
    assert.equal(new Set(items.map(row => row.id)).size, 40);
    if (sort === "name") {
      assert.equal(items[0].name, "Green Apple");
      assert.equal(items[39].name, "Red Apple");
    } else {
      const prices = items.map(row => row.options[0].price);
      assert.deepEqual(prices, [...prices].sort((a, b) => sort === "price-asc" ? a - b : b - a));
    }
  }
});

test("search and apple filtering reach the database before pagination", async () => {
  const { request, queries } = setup();
  const response = await request({ search: "apple", fruitFilter: "apple" });
  assert.equal(response.status, 200);
  assert.deepEqual(queries[0].where, { AND: [
    { isAvailable: true }, { options: { some: {} } }, { category: "FRUIT" },
    { OR: [
      { name: { contains: "apple", mode: "insensitive" } },
      { description: { contains: "apple", mode: "insensitive" } },
    ] },
    { OR: [
      { productType: { in: ["redApple", "greenApple", "pinkApple"] } },
      { name: { equals: "apple", mode: "insensitive" } },
    ] },
  ] });
});

test("malformed, mismatched and mixed-pagination cursors are rejected", async () => {
  const { request, queries } = setup();
  const first = await (await request()).json();
  const invalid: Record<string, string>[] = [
    { cursor: "not-a-cursor" },
    { cursor: first.nextCursor, search: "different" },
    { cursor: first.nextCursor, sort: "name" },
    { page: "1" },
    { category: "SMOOTHIE", fruitFilter: "apple" },
    { pagination: "cursor", cursor: first.nextCursor },
    { cursor: first.nextCursor, limit: "101" },
  ];
  for (const extra of invalid) {
    assert.equal((await request(extra)).status, 400);
  }
  assert.equal(queries.length, 1);
});

test("a removed boundary product does not break continuation; empty results stop", async () => {
  const rows = fixture();
  const { request } = setup(rows);
  const first = await (await request()).json();
  const boundary = first.items.at(-1).id;
  rows.splice(rows.findIndex(row => row.id === boundary), 1);
  const second = await (await request({ cursor: first.nextCursor })).json();
  assert.equal(second.items.length, 20);
  assert.equal(second.items[0].id, fixture()[24].id);
  const empty = await (await setup([]).request()).json();
  assert.deepEqual(empty, { items: [], nextCursor: null, total: 0, limit: 20 });
});

test("admin uses the same cursor contract without public filters or caching", async () => {
  const rows = fixture();
  rows[0].options = [];
  const { request, queries } = setup(rows, true);
  const first = await (await request({}, true)).json();
  assert.equal(first.items.length, 20);
  assert.equal(first.total, 45);
  const second = await (await request({ cursor: first.nextCursor }, true)).json();
  assert.equal(second.items.length, 20);
  assert.equal(queries.length, 2);
  assert.deepEqual(queries[0].where, { AND: [{ category: "FRUIT" }] });
  assert.equal((await request({ cursor: first.nextCursor })).status, 400);
  const priceSorted = await request({ sort: "price-asc" }, true);
  assert.equal(priceSorted.status, 200);
  assert.equal((await priceSorted.json()).items[0].options.length, 0);
});
