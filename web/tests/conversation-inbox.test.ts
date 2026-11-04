import assert from "node:assert/strict";
import test from "node:test";
import type { Prisma, PrismaClient } from "../generated/prisma/client";
import { createInboxHandler } from "../controllers/conversation-inbox";
import { inboxSelect } from "../services/conversation-inbox";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const fixture = () => Array.from({ length: 45 }, (_, i) => ({
  id: id(45 - i), updatedAt: new Date("2026-10-28T01:02:03.123Z"), messages: [],
}));

function setup(role: "ADMIN" | "CUSTOMER" | null = "ADMIN", rows = fixture(), isActive = true) {
  const queries: Prisma.ConversationFindManyArgs[] = [];
  const handler = createInboxHandler({
    db: { conversation: { findMany: async (args: Prisma.ConversationFindManyArgs) => {
      queries.push(args);
      const boundary = args.where?.OR?.[1]?.id as { lt: string } | undefined;
      return rows.filter(row => !boundary || row.id < boundary.lt).slice(0, args.take ?? 100);
    } } } as unknown as Pick<PrismaClient, "conversation">,
    currentUser: async () => role ? {
      id: id(1), name: null, email: null, phone: null, image: null, role, isActive,
    } : null,
  });
  const request = (query = "") => handler(new Request(`https://fruit.example/api/admin/support${query}`));
  return { request, queries };
}

test("inbox returns 20/20/5 using updatedAt and ID boundaries with a single latest message", async () => {
  const { request, queries } = setup();
  const first = await (await request()).json();
  const second = await (await request(`?cursor=${first.nextCursor}`)).json();
  const third = await (await request(`?cursor=${second.nextCursor}`)).json();
  assert.deepEqual([first.conversations.length, second.conversations.length, third.conversations.length], [20, 20, 5]);
  assert.equal(third.nextCursor, null);
  assert.equal(new Set([...first.conversations, ...second.conversations, ...third.conversations].map(row => row.id)).size, 45);
  assert.deepEqual(queries[0], {
    where: {}, select: inboxSelect,
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }], take: 21,
  });
  assert.deepEqual(queries[1].where?.OR, [
    { updatedAt: { lt: fixture()[19].updatedAt } },
    { updatedAt: fixture()[19].updatedAt, id: { lt: fixture()[19].id } },
  ]);
  assert.equal(inboxSelect.messages.take, 1);
  assert.deepEqual(inboxSelect.messages.orderBy, [{ createdAt: "desc" }, { id: "desc" }]);
  assert.equal("userId" in inboxSelect, false);
});

test("invalid inbox inputs and unauthorized users cannot read messages", async () => {
  const { request, queries } = setup();
  const invalidDate = Buffer.from(JSON.stringify({ id: id(1), updatedAt: "invalid" })).toString("base64url");
  for (const query of ["?page=1", "?limit=101", "?limit=0", "?limit=2&limit=2", "?cursor=bad", `?cursor=${invalidDate}`]) {
    assert.equal((await request(query)).status, 400);
  }
  assert.equal(queries.length, 0);
  for (const [role, active, status] of [[null, true, 401], ["CUSTOMER", true, 403], ["ADMIN", false, 401]] as const) {
    const denied = setup(role, fixture(), active);
    assert.equal((await denied.request()).status, status);
    assert.equal(denied.queries.length, 0);
  }
});

test("inbox continuation survives boundary deletion, stops at the end and stays private", async () => {
  const rows = fixture();
  const { request } = setup("ADMIN", rows);
  const firstResponse = await request();
  assert.equal(firstResponse.headers.get("Cache-Control"), "private, no-store");
  const first = await firstResponse.json();
  rows.splice(19, 1);
  const second = await (await request(`?cursor=${first.nextCursor}`)).json();
  assert.equal(second.conversations[0].id, id(25));
  const empty = await (await setup("ADMIN", []).request()).json();
  assert.deepEqual(empty, { conversations: [], nextCursor: null });
});

test("inbox database errors return a retryable private error response", async () => {
  const handler = createInboxHandler({
    db: { conversation: { findMany: async () => { throw Error("private connection detail"); } } } as unknown as Pick<PrismaClient, "conversation">,
    currentUser: async () => ({ id: id(1), role: "ADMIN", name: null, email: null, phone: null, image: null, isActive: true }),
  });
  const response = await handler(new Request("https://fruit.example/api/admin/support"));
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: "Unable to load inbox. Please retry." });
});
