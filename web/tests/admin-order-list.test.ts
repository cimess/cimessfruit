import assert from "node:assert/strict";
import test from "node:test";
import type { Prisma, PrismaClient } from "../generated/prisma/client";
import { createCheckoutHandlers } from "../controllers/checkout-handlers";
import { adminOrderSelect } from "../services/admin-order-list";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const rows = Array.from({ length: 45 }, (_, i) => ({
  id: id(45 - i), createdAt: new Date("2026-10-28T00:00:00.123Z"),
}));
function setup(role: "ADMIN" | "CUSTOMER" | null = "ADMIN") {
  const queries: Prisma.OrderFindManyArgs[] = [];
  const handlers = createCheckoutHandlers({
    db: { order: { findMany: async (args: Prisma.OrderFindManyArgs) => {
      queries.push(args);
      const boundary = args.where?.OR?.[1]?.id as { lt: string } | undefined;
      return rows.filter(row => !boundary || row.id < boundary.lt).slice(0, args.take ?? 100);
    } } } as unknown as PrismaClient,
    currentUser: async () => role ? {
      id: id(1), name: null, email: null, phone: null, image: null,
      role, isActive: true,
    } : null,
    readBody: async () => null,
  });
  const request = (params = "") => handlers.listAdmin(new Request(`https://fruit.example/api/admin/orders${params}`));
  return { request, queries };
}

test("admin orders page 20/20/5 deterministically without skipping tied timestamps", async () => {
  const { request, queries } = setup();
  const first = await (await request()).json();
  const second = await (await request(`?cursor=${first.nextCursor}`)).json();
  const third = await (await request(`?cursor=${second.nextCursor}`)).json();
  assert.deepEqual([first.orders.length, second.orders.length, third.orders.length], [20, 20, 5]);
  assert.equal(third.nextCursor, null);
  assert.equal(new Set([...first.orders, ...second.orders, ...third.orders].map(row => row.id)).size, 45);
  assert.deepEqual(queries[0], {
    where: { payment: { provider: { in: ["manual_transfer", "return_credit"] } } },
    select: adminOrderSelect,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 21,
  });
  assert.deepEqual(queries[1].where?.OR, [
    { createdAt: { lt: rows[19].createdAt } },
    { createdAt: rows[19].createdAt, id: { lt: rows[19].id } },
  ]);
  assert.deepEqual(adminOrderSelect.payment, { select: { providerReference: true, amount: true } });
  assert.equal("verifiedResponse" in adminOrderSelect, false);
});

test("order list rejects invalid parameters before reads and enforces admin access", async () => {
  const { request, queries } = setup();
  const badCursor = Buffer.from(JSON.stringify({ id: id(1), createdAt: "not-a-date" })).toString("base64url");
  for (const params of ["?page=1", "?limit=101", "?limit=0", "?limit=1&limit=2", "?cursor=bad", `?cursor=${badCursor}`]) {
    assert.equal((await request(params)).status, 400);
  }
  assert.equal(queries.length, 0);
  for (const [role, status] of [[null, 401], ["CUSTOMER", 403]] as const) {
    const denied = setup(role);
    assert.equal((await denied.request()).status, status);
    assert.equal(denied.queries.length, 0);
  }
});
