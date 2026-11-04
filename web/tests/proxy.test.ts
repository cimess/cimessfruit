import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { guardRequest } from "../server/auth/proxy-policy";
import type { SessionUser } from "../domain/session-user";

const user: SessionUser = { id: "123", name: "Customer", email: "a@example.com", image: null, phone: null, role: "CUSTOMER", isActive: true };
const request = (path: string, headers = {}) => new NextRequest(`https://fruit.example${path}`, { headers });

test("invalid session becomes guest and clears cookies, including chunks", async () => {
  const response = await guardRequest(request("/", { cookie: "authjs.session-token.0=forged", "x-user-role": "ADMIN" }), async () => null);
  assert.equal(response.headers.get("x-middleware-request-x-auth-mode"), "guest");
  assert.equal(response.headers.get("x-middleware-request-x-user-role"), null);
  assert.equal(response.cookies.get("authjs.session-token.0")?.value, "");
});
test("guests cannot access private pages or APIs", async () => {
  const page = await guardRequest(request("/account"), async () => null);
  assert.equal(page.headers.get("location"), "https://fruit.example/login");
  const api = await guardRequest(request("/api/me"), async () => null);
  assert.equal(api.status, 401);
});
test("disabled and unknown-role users are guests", async () => {
  for (const invalid of [{ ...user, isActive: false }, { ...user, role: "OWNER" }]) {
    assert.equal((await guardRequest(request("/api/me"), async () => ({ user: invalid as SessionUser }))).status, 401);
  }
});
test("RBAC denies customers and admits admins", async () => {
  assert.equal((await guardRequest(request("/api/admin/orders"), async () => ({ user }))).status, 403);
  assert.equal((await guardRequest(request("/admin"), async () => ({ user: { ...user, role: "ADMIN" } }))).headers.get("x-middleware-next"), "1");
});
test("customers are directed to admin activation, not a JSON error", async () => {
  const response = await guardRequest(request("/admin"), async () => ({ user }));
  assert.equal(response.headers.get("location"), "https://fruit.example/admin-login");
});
test("password setup requires authentication and rejects cross-origin browser requests", async () => {
  const req = new NextRequest("https://fruit.example/api/account/password", { method: "POST", headers: { origin: "https://fruit.example" } });
  assert.equal((await guardRequest(req, async () => null)).status, 401);
  assert.equal((await guardRequest(req, async () => ({ user }))).status, 200);
  const crossOrigin = new NextRequest("https://fruit.example/api/account/password", { method: "POST", headers: { origin: "https://evil.example" } });
  assert.equal((await guardRequest(crossOrigin, async () => ({ user }))).status, 403);
});
test("admin sign-in is public but activation requires a same-origin signed-in account", async () => {
  assert.equal((await guardRequest(request("/admin-login"), async () => null)).status, 200);
  const adminPage = await guardRequest(request("/admin"), async () => null);
  assert.equal(adminPage.headers.get("location"), "https://fruit.example/admin-login");
  const activation = new NextRequest("https://fruit.example/api/account/admin-access", { method: "POST", headers: { origin: "https://fruit.example" } });
  assert.equal((await guardRequest(activation, async () => null)).status, 401);
  assert.equal((await guardRequest(activation, async () => ({ user }))).status, 200);
  const crossOrigin = new NextRequest("https://fruit.example/api/account/admin-access", { method: "POST", headers: { origin: "https://evil.example" } });
  assert.equal((await guardRequest(crossOrigin, async () => ({ user }))).status, 403);
});
test("public reads allow guests; writes require same-origin and authentication", async () => {
  assert.equal((await guardRequest(request("/api/products"), async () => null)).status, 200);
  for (const origin of [undefined, "https://evil.example"]) {
    const req = new NextRequest("https://fruit.example/api/me", { method: "POST", headers: origin ? { origin } : {} });
    assert.equal((await guardRequest(req, async () => ({ user }))).status, 403);
  }
  const req = new NextRequest("https://fruit.example/api/me", { method: "POST", headers: { origin: "https://fruit.example" } });
  assert.equal((await guardRequest(req, async () => ({ user }))).status, 200);
});
test("unexpected auth errors fail closed", async () => {
  assert.equal((await guardRequest(request("/api/me"), async () => { throw Error("offline"); })).status, 503);
});
test("native bearer writes do not require a browser Origin; cookies cannot bypass CSRF", async () => {
  const req = new NextRequest("https://fruit.example/api/me", { method: "POST", headers: { authorization: "Bearer mobile_test" } });
  assert.equal((await guardRequest(req, async () => ({ user }))).status, 200);
  const forged = new NextRequest("https://fruit.example/api/me", { method: "POST", headers: { authorization: "Bearer mobile_test", cookie: "authjs.session-token=token" } });
  assert.equal((await guardRequest(forged, async () => ({ user }))).status, 403);
});
test("native login endpoints allow guests but reject cross-origin browser requests", async () => {
  const native = new NextRequest("https://fruit.example/api/mobile/login", { method: "POST" });
  assert.equal((await guardRequest(native, async () => null)).status, 200);
  const browser = new NextRequest("https://fruit.example/api/mobile/login", { method: "POST", headers: { origin: "https://evil.example" } });
  assert.equal((await guardRequest(browser, async () => null)).status, 403);
});
test("private responses disable shared caching", async () => {
  const result = await guardRequest(request("/api/me"), async () => ({ user }));
  assert.equal(result.headers.get("cache-control"), "private, no-store");
  assert.equal(result.headers.get("x-content-type-options"), "nosniff");
});
test("catalog changes require admin even outside the admin namespace", async () => {
  const req = new NextRequest("https://fruit.example/api/products/123", { method: "PATCH", headers: { origin: "https://fruit.example" } });
  assert.equal((await guardRequest(req, async () => ({ user }))).status, 403);
  assert.equal((await guardRequest(req, async () => ({ user: { ...user, role: "ADMIN" } }))).status, 200);
});

test("the deployed matcher covers private APIs including dotted paths", async () => {
  const { readFileSync } = await import("node:fs");
  const { unstable_doesMiddlewareMatch } = await import("next/experimental/testing/server");
  const source = readFileSync("proxy.ts", "utf8");
  const literal = source.match(/matcher: (\[.*\]),/)?.[1];
  assert.ok(literal);
  const config = { matcher: JSON.parse(literal) };
  for (const url of ["/account", "/admin/report.png", "/api/me", "/api/admin/report.svg", "/api/mobile/login"]) {
    assert.equal(unstable_doesMiddlewareMatch({ config, url }), true, url);
  }
  for (const url of ["/api/auth/session", "/api/auth/callback/google", "/_next/static/app.js", "/favicon.ico", "/next.svg"]) {
    assert.equal(unstable_doesMiddlewareMatch({ config, url }), false, url);
  }
});

test("same-origin LAN Server Actions survive Next.js localhost normalization", async () => {
  const req = new NextRequest("http://localhost:3000/mobile-auth", {
    method: "POST", headers: { host: "192.168.0.197:3000", origin: "http://192.168.0.197:3000", "sec-fetch-site": "same-origin" },
  });
  assert.equal((await guardRequest(req, async () => null)).status, 200);
});
test("LAN origin handling still rejects cross-site and spoofed forwarded hosts", async () => {
  const req = new NextRequest("http://localhost:3000/mobile-auth", {
    method: "POST", headers: { host: "192.168.0.197:3000", origin: "https://evil.example", "x-forwarded-host": "evil.example" },
  });
  assert.equal((await guardRequest(req, async () => null)).status, 403);
});

test("checkout sign-in preserves the checkout destination and payment writes reject cross-origin requests", async () => {
  const page = await guardRequest(request("/checkout"), async () => null);
  assert.equal(page.headers.get("location"), "https://fruit.example/login?intent=checkout");
  assert.equal((await guardRequest(request("/api/checkout"), async () => null)).status, 401);
  const forged = new NextRequest("https://fruit.example/api/orders/123", { method: "POST", headers: { origin: "https://evil.example" } });
  assert.equal((await guardRequest(forged, async () => ({ user }))).status, 403);
});

test("customers can resolve pins but cannot edit delivery zones or read the admin inbox", async () => {
  const resolve = new NextRequest("https://fruit.example/api/delivery-zones/resolve", { method: "POST", headers: { authorization: "Bearer mobile_test" } });
  assert.equal((await guardRequest(resolve, async () => ({ user }))).status, 200);
  assert.equal((await guardRequest(resolve, async () => null)).status, 401);
  for (const path of ["/api/admin/delivery-zones", "/api/admin/support"]) assert.equal((await guardRequest(request(path), async () => ({ user }))).status, 403);
});

test("public deletion requests still reject cross-origin writes and health avoids session dependencies", async () => {
  for (const path of ["/api/account-deletion/request", "/api/account-deletion/complete"]) {
    const native = new NextRequest(`https://fruit.example${path}`, { method: "POST" });
    assert.equal((await guardRequest(native, async () => null)).headers.get("x-middleware-next"), "1");
    const cross = new NextRequest(`https://fruit.example${path}`, { method: "POST", headers: { origin: "https://evil.example", "sec-fetch-site": "cross-site" } });
    assert.equal((await guardRequest(cross, async () => null)).status, 403);
  }
  assert.equal((await guardRequest(request("/api/health"), async () => { throw Error("session database down"); })).headers.get("x-middleware-next"), "1");
});

test("production writes use the canonical HTTPS origin behind Nginx TLS termination", async () => {
  const previousMode = process.env.NODE_ENV, previousOrigin = process.env.AUTH_URL;
  try {
    Object.assign(process.env, { NODE_ENV: "production", AUTH_URL: "https://fruit.example" });
    const req = new NextRequest("http://127.0.0.1:3001/api/account-deletion/request", { method: "POST", headers: { host: "fruit.example", origin: "https://fruit.example", "sec-fetch-site": "same-origin" } });
    assert.equal((await guardRequest(req, async () => null)).headers.get("x-middleware-next"), "1");
  } finally {
    if (previousMode === undefined) delete (process.env as Record<string, string | undefined>).NODE_ENV; else Object.assign(process.env, { NODE_ENV: previousMode });
    if (previousOrigin === undefined) delete process.env.AUTH_URL; else process.env.AUTH_URL = previousOrigin;
  }
});
