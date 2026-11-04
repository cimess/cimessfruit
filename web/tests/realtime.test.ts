import test from "node:test";
import assert from "node:assert/strict";
import { streamHandler } from "../features/realtime/stream";
import { eventParser } from "../features/realtime/protocol";
import { eventParser as nativeParser } from "../../mobile/src/features/realtime/protocol";
import {
  redisBus,
  type Change,
  type ChangeBus,
} from "../features/realtime/bus";
const owner = "owner-a";
function bus() {
  const listeners = new Set<(change: Change) => void>();
  return {
    listeners,
    value: {
      subscribe: async (listener: (change: Change) => void) => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
      publish: async (event: Change) => {
        listeners.forEach((listener) => listener(event));
      },
    } satisfies ChangeBus,
  };
}
test("web/native SSE parsers handle fragmented frames and reject unbounded frames", () => {
  for (const factory of [eventParser, nativeParser]) {
    const events: string[] = [];
    const parse = factory((event) => events.push(event));
    for (const chunk of [
      "event: ready\r",
      '\ndata: {"reconcile":true}\r',
      "\n\r",
      "\n",
      "event: order.changed\ndata: {}\n\n",
    ])
      parse(chunk);
    assert.deepEqual(events, ["ready", "order.changed"]);
    assert.throws(() => parse("x".repeat(17000)));
  }
});
test("stream requires authentication, establishes ready and filters private owners", async () => {
  const transport = bus();
  const disabled = streamHandler({
    enabled: () => false,
    account: async () => null,
    bus: () => transport.value,
  });
  assert.equal(
    (await disabled(new Request("https://test/api/events"))).status,
    503,
  );
  const guest = streamHandler({
    enabled: () => true,
    account: async () => null,
    bus: () => transport.value,
  });
  assert.equal(
    (await guest(new Request("https://test/api/events"))).status,
    401,
  );
  const handler = streamHandler({
    enabled: () => true,
    account: async () => ({ id: owner, role: "CUSTOMER" }),
    bus: () => transport.value,
  });
  const response = await handler(new Request("https://test/api/events")),
    reader = response.body!.getReader();
  assert.match(
    new TextDecoder().decode((await reader.read()).value),
    /event: ready/,
  );
  const next = reader.read();
  await transport.value.publish({ kind: "order.changed", userId: "other" });
  assert.equal(
    await Promise.race([
      next.then(() => "leak"),
      new Promise((resolve) => setTimeout(() => resolve("waiting"), 15)),
    ]),
    "waiting",
  );
  await transport.value.publish({ kind: "order.changed", userId: owner });
  assert.match(new TextDecoder().decode((await next).value), /order.changed/);
  await reader.cancel();
  assert.equal(transport.listeners.size, 0);
});
test("stream rotates and closes when a session is revoked, releasing listeners", async () => {
  const transport = bus();
  let valid = true;
  const handler = streamHandler({
    enabled: () => true,
    account: async () => (valid ? { id: owner, role: "CUSTOMER" } : null),
    bus: () => transport.value,
    heartbeatMs: 10,
    durationMs: 50,
  });
  const first = (
    await handler(new Request("https://test/api/events"))
  ).body!.getReader();
  await first.read();
  valid = false;
  assert.equal((await first.read()).done, true);
  assert.equal(transport.listeners.size, 0);
  valid = true;
  const rotated = (
    await streamHandler({
      enabled: () => true,
      account: async () => ({ id: owner, role: "CUSTOMER" }),
      bus: () => transport.value,
      heartbeatMs: 100,
      durationMs: 20,
    })(new Request("https://test/api/events"))
  ).body!.getReader();
  await rotated.read();
  assert.equal((await rotated.read()).done, true);
  assert.equal(transport.listeners.size, 0);
});
test(
  "independent Redis bus instances deliver committed hints across instances",
  { skip: !process.env.TEST_REDIS_URL },
  async () => {
    const prefix = `verify:${crypto.randomUUID()}`,
      subscriber = redisBus(process.env.TEST_REDIS_URL!, prefix),
      publisher = redisBus(process.env.TEST_REDIS_URL!, prefix);
    let resolve!: (value: Change) => void;
    const received = new Promise<Change>((done) => {
      resolve = done;
    });
    const unsubscribe = await subscriber.subscribe(resolve, () => {});
    try {
      await publisher.publish({ kind: "order.changed", userId: owner });
      const event = await Promise.race([
        received,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(Error("No cross-instance event")), 2500),
        ),
      ]);
      assert.equal(event.userId, owner);
    } finally {
      unsubscribe();
    }
  },
);
test("stream limits owner connections and bounds slow-consumer buffering", async () => {
  const transport = bus(),
    handler = streamHandler({
      enabled: () => true,
      account: async () => ({ id: owner, role: "CUSTOMER" }),
      bus: () => transport.value,
    });
  const first = await handler(new Request("https://test/api/events")),
    second = await handler(new Request("https://test/api/events"));
  assert.equal(
    (await handler(new Request("https://test/api/events"))).status,
    429,
  );
  for (let i = 0; i < 20; i++)
    await transport.value.publish({ kind: "catalogue.changed" });
  assert.equal(transport.listeners.size, 0);
  await first.body!.cancel();
  await second.body!.cancel();
});


test("failed subscriptions return 503 with backoff and release connection slots", async () => {
  const handler = streamHandler({
    enabled: () => true,
    account: async () => ({ id: owner, role: "CUSTOMER" }),
    bus: () => { throw Error("Redis not configured"); },
  });
  for (let i = 0; i < 3; i++) {
    const response = await handler(new Request("https://test/api/events"));
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("retry-after"), "60");
  }
});

test("subscription rejection returns 503 rather than an empty 200 stream", async () => {
  const handler = streamHandler({
    enabled: () => true,
    account: async () => ({ id: owner, role: "CUSTOMER" }),
    bus: () => ({ publish: async () => {}, subscribe: async () => { throw Error("Unavailable"); } }),
  });
  assert.equal((await handler(new Request("https://test/api/events"))).status, 503);
});
