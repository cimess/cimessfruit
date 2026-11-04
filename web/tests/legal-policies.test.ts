import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import policies from "../lib/legal/policies.json";
import { GET } from "../app/api/policies/[policy]/route";
import { guardRequest } from "../server/auth/proxy-policy";

const request = new Request("https://fruit.example/api/policies/terms");

test("policy API serves complete versioned documents from the website source", async () => {
  for (const [id, content] of Object.entries(policies)) {
    const response = await GET(request, { params: Promise.resolve({ policy: id }) });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    assert.deepEqual(await response.json(), { policy: { id, ...content } });
    assert.equal(new Set(content.sections.map(section => section.id)).size, content.sections.length);
    assert.ok(content.sections.every(section => section.paragraphs.length > 0));
  }
});

test("unknown and inherited policy names return 404, never object properties", async () => {
  for (const policy of ["unknown", "__proto__", "constructor", "toString", "Terms"]) {
    const response = await GET(request, { params: Promise.resolve({ policy }) });
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: "Policy not found" });
  }
});

test("legal reads work during authentication outages and strip spoofed identity headers", async () => {
  for (const path of ["/api/policies/terms", "/api/policies/privacy", "/privacy", "/terms", "/refunds", "/delivery"]) {
    for (const method of ["GET", "HEAD"]) {
      const response = await guardRequest(new NextRequest(`https://fruit.example${path}`, {
        method, headers: { "x-user-id": "forged", "x-user-role": "ADMIN", "x-auth-mode": "authenticated" },
      }), async () => { throw new Error("Legal access must not need a session"); });
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("x-middleware-next"), "1");
      assert.equal(response.headers.get("x-middleware-request-x-user-id"), null);
      assert.equal(response.headers.get("x-middleware-request-x-user-role"), null);
      assert.equal(response.headers.get("x-middleware-request-x-auth-mode"), "guest");
    }
  }
});

test("public policy access does not make nearby routes or writes public", async () => {
  for (const path of ["/api/policies-admin", "/api/me"]) {
    assert.equal((await guardRequest(new NextRequest(`https://fruit.example${path}`), async () => null)).status, 401);
  }
  const response = await guardRequest(new NextRequest("https://fruit.example/api/policies/terms", {
    method: "POST", headers: { origin: "https://fruit.example" },
  }), async () => null);
  assert.equal(response.status, 401);
});
