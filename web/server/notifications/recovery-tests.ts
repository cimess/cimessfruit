import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "../../generated/prisma/client";
import { kickNotifications, recoverNotifications, recoveryBatchSize, type RecoveryCursor, type RecoveryTransport } from "./publisher";
import { publishBatch } from "./transport";

function backlog(size: number) {
  const events = Array.from({ length: size }, (_, i) => ({ id: `${String(i).padStart(8, "0")}-0000-4000-8000-000000000000`, createdAt: new Date("2026-10-29T10:00:00Z"), completedAt: null, publishedAt: null as Date | null }));
  const db = { notificationEvent: {
    findMany: async ({ where, take }: { where: { AND: { OR?: { createdAt?: Date; id?: { gt: string } }[] }[] }; take: number }) => {
      assert.equal(take, recoveryBatchSize + 1);
      const cursor = where.AND[1]?.OR?.[1]?.id?.gt;
      return events.filter(event => !event.completedAt && (!event.publishedAt || event.publishedAt.getTime() < Date.now() - 900000) && (!cursor || event.id > cursor)).slice(0, take).map(event => ({ id: event.id, createdAt: event.createdAt }));
    },
    updateManyAndReturn: async ({ where, data }: { where: { AND: [unknown, { id: { in: string[] } }] }; data: { publishedAt: Date } }) => {
      const claimed = events.filter(event => where.AND[1].id.in.includes(event.id) && (!event.publishedAt || event.publishedAt.getTime() < Date.now() - 900000));
      claimed.forEach(event => { event.publishedAt = data.publishedAt; });
      return claimed.map(event => ({ id: event.id }));
    },
    updateMany: async ({ where }: { where: { id: { in: string[] }; publishedAt: Date } }) => {
      events.filter(event => where.id.in.includes(event.id) && event.publishedAt?.getTime() === where.publishedAt.getTime()).forEach(event => { event.publishedAt = null; });
      return { count: 0 };
    },
  } } as unknown as PrismaClient;
  const sent: string[][] = [], queued: (RecoveryCursor | undefined)[] = [];
  const transport: RecoveryTransport = {
    send: async ids => { assert.ok(ids.length <= 20); sent.push(ids); },
    schedule: async after => { queued.push(after); },
  };
  return { db, events, sent, queued, transport };
}

test("recovery drains 65 events through successive bounded pages, including tied timestamps", async () => {
  const h = backlog(65);
  await recoverNotifications(h.db, h.transport);
  while (h.queued.length) await recoverNotifications(h.db, h.transport, h.queued.shift());
  assert.deepEqual(h.sent.map(batch => batch.length), [20, 20, 20, 5]);
  assert.equal(new Set(h.sent.flat()).size, 65);
  assert.ok(h.events.every(event => event.publishedAt));
});
test("overlapping recovery scans claim each event once", async () => {
  const h = backlog(20);
  await Promise.all([recoverNotifications(h.db, h.transport), recoverNotifications(h.db, h.transport)]);
  assert.equal(h.sent.flat().length, 20);
});
test("partial or timed-out publication resets claims and preserves the entire page for retry", async () => {
  const h = backlog(25);
  const failed = { ...h.transport, send: async () => { throw Error("partial batch failure"); } };
  await assert.rejects(recoverNotifications(h.db, failed));
  assert.ok(h.events.every(event => event.publishedAt === null));
  await recoverNotifications(h.db, h.transport);
  while (h.queued.length) await recoverNotifications(h.db, h.transport, h.queued.shift());
  assert.equal(h.sent.flat().length, 25);
});
test("continuation failure keeps accepted publications and a retry recovers the remaining events", async () => {
  const h = backlog(25);
  await assert.rejects(recoverNotifications(h.db, { ...h.transport, schedule: async () => { throw Error("offline"); } }));
  assert.equal(h.events.filter(event => event.publishedAt).length, 20);
  await recoverNotifications(h.db, h.transport);
  assert.equal(h.sent.flat().length, 25);
});
test("post-commit failure schedules delayed recovery without failing the business request", async () => {
  const h = backlog(25), old = process.env.NOTIFICATIONS_ENABLED;
  try {
    process.env.NOTIFICATIONS_ENABLED = "true";
    let delay = 0;
    await kickNotifications(h.db, { send: async () => { throw Error("offline"); }, schedule: async (after, seconds) => { assert.equal(after, undefined); delay = seconds!; } });
    assert.equal(delay, 60);
    assert.ok(h.events.every(event => event.publishedAt === null));
  } finally { if (old === undefined) delete process.env.NOTIFICATIONS_ENABLED; else process.env.NOTIFICATIONS_ENABLED = old; }
});
test("QStash batch uses one HTTP request and rejects HTTP-200 partial failures", async () => {
  const oldFetch = globalThis.fetch;
  const names = ["NOTIFICATIONS_ENABLED", "NOTIFICATIONS_ORIGIN", "QSTASH_TOKEN", "QSTASH_URL"];
  const old = names.map(name => process.env[name]);
  try {
    process.env.NOTIFICATIONS_ENABLED = "true"; process.env.NOTIFICATIONS_ORIGIN = "https://shop.example";
    process.env.QSTASH_TOKEN = "test"; process.env.QSTASH_URL = "https://qstash.upstash.io";
    let calls = 0, partial = false;
    globalThis.fetch = async (url, options) => {
      calls++; assert.equal(String(url), "https://qstash.upstash.io/v2/batch");
      const body = JSON.parse(options!.body as string);
      assert.equal(body.length, 2);
      assert.equal(body[0].destination, "https://shop.example/api/notifications/worker");
      return Response.json(partial ? [{ messageId: "one" }, { error: "rate limited" }] : [{ messageId: "one" }, { messageId: "two" }]);
    };
    await publishBatch(["one", "two"]); assert.equal(calls, 1);
    partial = true; await assert.rejects(publishBatch(["one", "two"]), /partially rejected/);
  } finally {
    globalThis.fetch = oldFetch;
    names.forEach((name, i) => { if (old[i] === undefined) delete process.env[name]; else process.env[name] = old[i]; });
  }
});
