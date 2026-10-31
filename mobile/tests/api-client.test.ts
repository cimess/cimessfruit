/// <reference types="node" />
import assert from "node:assert/strict";
import test from "node:test";
import { ApiError, createApiClient, createSerialQueue, type StoredSession } from "../src/lib/api-client";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
function fixture() {
  let value: string | null = null;
  let time = Date.now();
  let notifications = 0;
  let handler: typeof fetch = async () => Response.json({ ok: true });
  const calls: RequestInit[] = [];
  const client = createApiClient({
    read: async () => value,
    write: async (next) => { value = next; },
    remove: async () => { value = null; },
    origin: () => "https://fruit.example", now: () => time,
    fetch: async (url, options) => { calls.push(options ?? {}); return handler(url, options); },
  });
  client.setUnauthorizedHandler(() => { notifications++; });
  const session = (id: string): StoredSession => ({ token: `mobile_${id.repeat(64)}`, expires: new Date(time + 10000).toISOString(), user: { id } });
  return { client, calls, session, raw: () => value, notifications: () => notifications,
    setRaw: (raw: string) => { value = raw; }, advance: () => { time += 20000; },
    respond: (next: typeof fetch) => { handler = next; } };
}
const status = (expected: number) => (error: unknown) => error instanceof ApiError && error.status === expected;

test("protected requests without a credential fail locally and notify the UI", async () => {
  const f = fixture();
  await assert.rejects(f.client.apiRequest("/api/me"), status(401));
  assert.equal(f.calls.length, 0);
  assert.equal(f.notifications(), 1);
});
test("expired and corrupt storage is removed", async () => {
  for (const raw of ["bad json", "null", JSON.stringify({ token: "forged" })]) {
    const f = fixture(); f.setRaw(raw);
    assert.equal(await f.client.readStoredSession(), null);
    assert.equal(f.raw(), null);
    assert.equal(f.notifications(), 1);
  }
  const f = fixture(); await f.client.saveSession(f.session("a")); f.advance();
  assert.equal(await f.client.readStoredSession(), null);
  assert.equal(f.raw(), null);
});
test("an old 401 cannot delete a newer login", async () => {
  const f = fixture(); const started = deferred<void>(); const response = deferred<Response>();
  await f.client.saveSession(f.session("a"));
  f.respond(async () => { started.resolve(); return response.promise; });
  const request = f.client.apiRequest("/api/me");
  await started.promise;
  await f.client.saveSession(f.session("b"));
  response.resolve(Response.json({ error: "Unauthorized" }, { status: 401 }));
  await assert.rejects(request, status(409));
  assert.equal((await f.client.readStoredSession())?.token, f.session("b").token);
  assert.equal(f.notifications(), 0);
});
test("expiry while a request runs remains unauthorized, not a false session-switch error", async () => {
  const f = fixture(); await f.client.saveSession(f.session("a"));
  f.respond(async () => { f.advance(); return new Response(null, { status: 401 }); });
  await assert.rejects(f.client.apiRequest("/api/me"), status(401));
  assert.equal(f.raw(), null);
  assert.equal(f.notifications(), 1);
});
test("a profile refresh cannot write one account's user into another credential", async () => {
  const f = fixture(); await f.client.saveSession(f.session("a"));
  const snapshot = await f.client.getSessionSnapshot();
  await f.client.saveSession(f.session("b"));
  await assert.rejects(f.client.updateStoredUser(snapshot, { id: "a" }), status(409));
  assert.deepEqual((await f.client.readStoredSession())?.user, { id: "b" });
});
test("an invalidated login cannot commit authenticated UI state", async () => {
  const f = fixture(); await f.client.saveSession(f.session("a"));
  await f.client.clearStoredSession();
  let committed = false;
  await assert.rejects(f.client.commitAuthenticatedUser("a", () => { committed = true; }), status(401));
  assert.equal(committed, false);
});
test("full auth operations execute in order, including UI commits, after failures too", async () => {
  const queue = createSerialQueue(); const gate = deferred<void>(); const events: string[] = [];
  const login = queue(async () => { events.push("login:start"); await gate.promise; events.push("login:commit"); });
  const logout = queue(async () => { events.push("logout:commit"); });
  gate.resolve(); await Promise.all([login, logout]);
  assert.deepEqual(events, ["login:start", "login:commit", "logout:commit"]);
  await assert.rejects(queue(async () => { throw Error("cancelled"); }));
  await queue(async () => { events.push("next"); });
  assert.equal(events.at(-1), "next");
});
test("JSON and FormData requests omit cookies and own the Authorization header", async () => {
  const f = fixture(); await f.client.saveSession(f.session("a"));
  const form = new FormData(); form.append("file", "image-placeholder");
  await f.client.apiRequest("/api/upload", { method: "POST", body: form, headers: { Cookie: "fake=1", Authorization: "Bearer forged" } });
  const options = f.calls[0]; const headers = new Headers(options.headers);
  assert.equal(options.body, form);
  assert.equal(headers.has("content-type"), false);
  assert.equal(headers.has("cookie"), false);
  assert.equal(headers.get("authorization"), `Bearer ${f.session("a").token}`);
  assert.equal(options.credentials, "omit");
  await f.client.apiRequest("/api/mobile/login", { method: "POST", body: "{}" }, false);
  assert.equal(new Headers(f.calls[1].headers).get("content-type"), "application/json");
  assert.equal(new Headers(f.calls[1].headers).has("authorization"), false);
});
test("invalid successful JSON is rejected while 204 is explicitly empty", async () => {
  const f = fixture();
  for (const text of ["<html>error</html>", ""]) {
    f.respond(async () => new Response(text));
    await assert.rejects(f.client.apiRequest("/api/public", {}, false), status(502));
  }
  f.respond(async () => new Response(null, { status: 204 }));
  assert.equal(await f.client.apiRequest("/api/public", {}, false), null);
});
test("storage unavailable while locked does not erase a session", async () => {
  let removed = false;
  const client = createApiClient({ origin: () => "https://fruit.example", fetch,
    read: async () => { throw Error("Device locked"); }, write: async () => {}, remove: async () => { removed = true; } });
  await assert.rejects(client.readStoredSession(), /Device locked/);
  assert.equal(removed, false);
});
test("a stale successful response cannot publish data after a new login", async () => {
  const f = fixture(); const started = deferred<void>(); const response = deferred<Response>();
  await f.client.saveSession(f.session("a"));
  f.respond(async () => { started.resolve(); return response.promise; });
  const request = f.client.apiRequest("/api/me");
  await started.promise;
  await f.client.saveSession(f.session("b"));
  response.resolve(Response.json({ user: { id: "a" } }));
  await assert.rejects(request, status(409));
  assert.deepEqual((await f.client.readStoredSession())?.user, { id: "b" });
});
test("locally expired requests notify once and are never sent", async () => {
  const f = fixture(); await f.client.saveSession(f.session("a")); f.advance();
  await assert.rejects(f.client.apiRequest("/api/me"), status(401));
  assert.equal(f.notifications(), 1);
  assert.equal(f.calls.length, 0);
});
test("only public catalogue GETs reuse conditional responses; private requests remain uncached", async () => {
  const f = fixture(); let calls = 0;
  f.respond(async (_url, options) => { calls++; if (calls === 1) return Response.json({ items: [{ name: "Pineapple" }] }, { headers: { ETag: '"v1"' } }); assert.equal(new Headers(options?.headers).get("If-None-Match"), '"v1"'); return new Response(null, { status: 304 }); });
  const first = await f.client.apiRequest<{ items: { name: string }[] }>("/api/products?limit=20", {}, false); first.items[0].name = "Locally changed";
  const second = await f.client.apiRequest<{ items: { name: string }[] }>("/api/products?limit=20", {}, false); assert.equal(second.items[0].name, "Pineapple");
  await f.client.saveSession(f.session("a")); f.respond(async (_url, options) => { assert.equal(new Headers(options?.headers).has("If-None-Match"), false); return Response.json({ orders: [] }, { headers: { ETag: '"private"' } }); });
  await f.client.apiRequest("/api/orders"); await f.client.apiRequest("/api/orders");
});
