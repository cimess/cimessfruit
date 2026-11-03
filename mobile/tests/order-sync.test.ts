/// <reference types="node" />
import assert from "node:assert/strict";
import test from "node:test";
import { ORDER_LIST, ORDER_STALE_MS, OrderSubscriptions, OrderReadCoordinator } from "../src/features/order/readCoordinator";
import { mergeOrders } from "../src/features/order/mergeOrders";
import type { Order } from "../src/features/order/types";

function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: Error) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
const flush = () => new Promise<void>(resolve => setImmediate(resolve));
type Row = { id: string; status: string };

function fixture() {
  let now = 0;
  const data = new Map<string, Row>();
  const states = new Map<string, { loading: boolean; error: string | null }>();
  const requests: { key: string; signal: AbortSignal; result: ReturnType<typeof deferred<{ owner: string; orders: Row[] }>> }[] = [];
  const reads = new OrderReadCoordinator<Row>({
    now: () => now,
    load: (key, signal) => {
      const result = deferred<{ owner: string; orders: Row[] }>();
      requests.push({ key, signal, result });
      return result.promise;
    },
    commit: async (_owner, apply) => apply(),
    apply: orders => { for (const order of orders) data.set(order.id, order); },
    state: (key, loading, error) => states.set(key, {
      loading, error: error === undefined ? states.get(key)?.error ?? null : error,
    }),
  });
  return { reads, requests, data, states, time: (value: number) => { now = value; } };
}

test("overlapping automatic/manual list refreshes share one request and stale reads revalidate", async () => {
  const f = fixture();
  const first = f.reads.refresh(), manual = f.reads.refresh(ORDER_LIST, true);
  assert.equal(first, manual);
  await flush();
  assert.equal(f.requests.length, 1);
  f.requests[0].result.resolve({ owner: "owner", orders: [{ id: "one", status: "pending" }] });
  await first;
  f.time(ORDER_STALE_MS - 1);
  await f.reads.refresh();
  assert.equal(f.requests.length, 1);
  f.time(ORDER_STALE_MS);
  const stale = f.reads.refresh();
  await flush();
  assert.equal(f.requests.length, 2);
  f.requests[1].result.resolve({ owner: "owner", orders: [] });
  await stale;
  assert.equal(f.states.get(ORDER_LIST)?.loading, false);
});

test("a slow older list response cannot overwrite a newer detail response", async () => {
  const f = fixture();
  const list = f.reads.refresh(), detail = f.reads.refresh("one");
  await flush();
  f.requests[1].result.resolve({ owner: "owner", orders: [{ id: "one", status: "paid" }] });
  await detail;
  f.requests[0].result.resolve({ owner: "owner", orders: [{ id: "one", status: "pending" }] });
  await list;
  assert.equal(f.data.get("one")?.status, "paid");
});

test("reset aborts old requests and late completions cannot delete/overwrite a new request", async () => {
  const f = fixture();
  const old = f.reads.refresh();
  await flush();
  f.reads.reset(); f.data.clear();
  assert.equal(f.requests[0].signal.aborted, true);
  const fresh = f.reads.refresh();
  await flush();
  f.requests[0].result.resolve({ owner: "old-owner", orders: [{ id: "private", status: "pending" }] });
  await old;
  assert.equal(f.reads.refresh(ORDER_LIST, true), fresh);
  f.requests[1].result.resolve({ owner: "new-owner", orders: [{ id: "new", status: "paid" }] });
  await fresh;
  assert.deepEqual([...f.data.keys()], ["new"]);
});

test("reset during an asynchronous auth commit still prevents private cache writes", async () => {
  const gate = deferred<void>();
  let applied = false;
  const reads = new OrderReadCoordinator<Row>({
    load: async () => ({ owner: "old", orders: [{ id: "private", status: "paid" }] }),
    commit: async (_owner, apply) => { await gate.promise; apply(); },
    apply: () => { applied = true; }, state: () => {},
  });
  const pending = reads.refresh();
  await flush();
  reads.reset(); gate.resolve();
  await pending;
  assert.equal(applied, false);
});

test("failed refresh retains cached data, clears busy state and permits immediate retry", async () => {
  const f = fixture();
  const first = f.reads.refresh(); await flush();
  f.requests[0].result.resolve({ owner: "owner", orders: [{ id: "one", status: "pending" }] }); await first;
  const failure = f.reads.refresh(ORDER_LIST, true); await flush();
  f.requests[1].result.reject(Error("Offline")); await failure;
  assert.deepEqual(f.states.get(ORDER_LIST), { loading: false, error: "Offline" });
  assert.equal(f.data.size, 1);
  const retry = f.reads.refresh(); await flush();
  f.requests[2].result.resolve({ owner: "owner", orders: [{ id: "one", status: "paid" }] }); await retry;
  assert.equal(f.states.get(ORDER_LIST)?.error, null);
  assert.equal(f.data.get("one")?.status, "paid");
});

test("mutation invalidation prevents old reads or errors undoing a successful mutation", async () => {
  const f = fixture();
  const old = f.reads.refresh("one"); await flush();
  f.reads.invalidate(); f.data.set("one", { id: "one", status: "paid" });
  f.requests[0].result.reject(Error("Late error")); await old;
  assert.equal(f.data.get("one")?.status, "paid");
  assert.equal(f.states.get("one")?.error, null);
  f.reads.markFresh("one");
  await f.reads.refresh("one");
  assert.equal(f.requests.length, 1, "authoritative mutation data avoids an immediate duplicate detail read");
});

class Clock {
  now = 0;
  private next = 0;
  tasks = new Map<number, { time: number; run: () => void }>();
  schedule = ((run: () => void, ms: number) => {
    const id = ++this.next;
    this.tasks.set(id, { time: this.now + ms, run });
    return id;
  }) as unknown as typeof setTimeout;
  unschedule = ((id: number) => { this.tasks.delete(id); }) as unknown as typeof clearTimeout;
  async advance(ms: number) {
    const end = this.now + ms;
    while (true) {
      const next = [...this.tasks.entries()].filter(([, value]) => value.time <= end).sort((a, b) => a[1].time - b[1].time)[0];
      if (!next) break;
      this.now = next[1].time; this.tasks.delete(next[0]); next[1].run(); await flush();
    }
    this.now = end; await flush();
  }
}

test("idle subscribers never poll; changes refresh once and hidden consumers stop", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const calls: string[] = [];
  const subscriptions = new OrderSubscriptions({
    refresh: async key => { calls.push(key); }, cancel: () => {}, pause: () => {},
  });
  subscriptions.setActive(true);
  const notifications = subscriptions.subscribe(ORDER_LIST), screen = subscriptions.subscribe(ORDER_LIST);
  assert.equal(calls.length, 1);
  t.mock.timers.tick(10 * 60_000);
  assert.equal(calls.length, 1, "ten idle minutes must not trigger reads");
  subscriptions.refreshSubscribed();
  assert.equal(calls.length, 2, "one change refreshes shared subscribers once");
  screen(); notifications();
  subscriptions.refreshSubscribed();
  assert.equal(calls.length, 2);
});

test("background/logout abort in-flight work, stop timers and foreground resumes stale work", async () => {
  const f = fixture(), clock = new Clock();
  const poller = new OrderSubscriptions({ refresh: (key, force) => f.reads.refresh(key, force),
    cancel: key => f.reads.cancel(key), pause: () => f.reads.pause(),
  });
  const unwatch = poller.subscribe(ORDER_LIST);
  await flush(); assert.equal(f.requests.length, 0); // Logged out/inactive.
  poller.setActive(true); await flush();
  poller.setActive(false);
  assert.equal(f.requests[0].signal.aborted, true);
  await clock.advance(60_000);
  assert.equal(f.requests.length, 1);
  f.requests[0].result.resolve({ owner: "owner", orders: [{ id: "late", status: "paid" }] }); await flush();
  assert.equal(f.data.size, 0);
  f.time(60_000); poller.setActive(true); await flush();
  assert.equal(f.requests.length, 2);
  f.requests[1].result.resolve({ owner: "owner", orders: [] }); await flush();
  unwatch(); poller.setActive(false);
  assert.equal(clock.tasks.size, 0);
});

test("slow requests never overlap and detail unsubscribe does not cancel the shared list", async () => {
  const f = fixture(), clock = new Clock();
  const poller = new OrderSubscriptions({ refresh: (key, force) => f.reads.refresh(key, force),
    cancel: key => f.reads.cancel(key), pause: () => f.reads.pause(),
  });
  poller.setActive(true);
  const list = poller.subscribe(ORDER_LIST), detail = poller.subscribe("one");
  await flush(); await clock.advance(30_000);
  assert.equal(f.requests.length, 2); // Two distinct endpoints, each still pending.
  detail();
  assert.equal(f.requests[0].signal.aborted, false);
  assert.equal(f.requests[1].signal.aborted, true);
  f.requests[0].result.resolve({ owner: "owner", orders: [] });
  f.requests[1].result.resolve({ owner: "owner", orders: [] }); await flush();
  list(); poller.setActive(false);
});

function order(changes: Partial<Order> = {}): Order {
  return { id: "one", status: "pending", paymentStatus: "pending", createdAt: "2026-10-28T00:00:00Z",
    updatedAt: "2026-10-28T00:00:00Z", estimatedDeliveryTime: "Soon", items: [],
    deliveryAddress: { zoneId: "zone", streetOrClose: "Street", houseNumber: "1", phoneNumber: "08012345678", flatOrBlock: "", landmark: "", note: "" },
    deliveryFee: 5, itemSubtotal: 10, smoothieFee: 0, total: 15, ...changes };
}

test("list merges preserve unchanged payment detail and invalidate it on status/data changes", () => {
  const detailed = order({ account: { bank: "Bank", accountName: "Store", accountNumber: "123" }, eligibility: { eligible: true, issues: [] } });
  const current = { one: detailed };
  const unchanged = mergeOrders(current, [order()]).one;
  assert.deepEqual(unchanged.account, detailed.account);
  assert.deepEqual(unchanged.eligibility, detailed.eligibility);
  assert.equal(mergeOrders(current, [order({ status: "paid", paymentStatus: "payment_verified" })]).one.account, undefined);
  assert.equal(mergeOrders(current, [order({ updatedAt: "2026-10-28T00:01:00Z" })]).one.eligibility, undefined);
  assert.equal(mergeOrders(current, [order({ account: null, eligibility: { eligible: false, issues: ["Expired"] } })]).one.account, null);
});
test("background subscribers ignore change hints until foregrounded", () => {
  let calls = 0;
  const subscriptions = new OrderSubscriptions({ refresh: async () => { calls++; }, cancel: () => {}, pause: () => {} });
  const unwatch = subscriptions.subscribe(ORDER_LIST);
  subscriptions.refreshSubscribed(); assert.equal(calls, 0);
  subscriptions.setActive(true); assert.equal(calls, 1);
  subscriptions.setActive(false);
  subscriptions.refreshSubscribed(); assert.equal(calls, 1);
  subscriptions.setActive(true); assert.equal(calls, 2);
  unwatch(); subscriptions.setActive(false);
});
