/// <reference types="node" />
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { isPolicyId, parsePolicyResponse } from "../src/features/legal/service";
import { createApiClient } from "../src/lib/api-client";

const policies = JSON.parse(readFileSync(new URL("../../api/lib/legal/policies.json", import.meta.url), "utf8"));

test("mobile reader accepts every complete document served by the API", () => {
  for (const [id, document] of Object.entries(policies)) {
    assert.ok(isPolicyId(id));
    const policy = { id, ...(document as object) };
    assert.deepEqual(parsePolicyResponse({ policy }, id), policy);
  }
});

test("reader rejects wrong documents, malformed sections and unsafe external links", () => {
  const policy = { id: "terms", ...policies.terms };
  assert.throws(() => parsePolicyResponse({ policy }, "privacy"));
  assert.throws(() => parsePolicyResponse({ policy: { ...policy, sections: [] } }, "terms"));
  assert.throws(() => parsePolicyResponse({ policy: { ...policy, sections: [policy.sections[0], policy.sections[0]] } }, "terms"));
  for (const url of ["javascript:alert(1)", "file:///tmp/private", "http://example.com"]) {
    assert.throws(() => parsePolicyResponse({ policy: { ...policy, links: [{ label: "Unsafe", url }] } }, "terms"));
  }
  for (const name of ["constructor", "__proto__", "", undefined, ["privacy"]]) assert.equal(isPolicyId(name), false);
});

test("public policy requests work without session storage or authentication headers", async () => {
  const client = createApiClient({
    origin: () => "https://fruit.example",
    read: async () => { throw new Error("Guest policies must not read credentials"); },
    write: async () => { throw new Error("Must not alter session"); },
    remove: async () => { throw new Error("Must not alter session"); },
    fetch: async (input, init) => {
      assert.equal(String(input), "https://fruit.example/api/policies/terms");
      const headers = new Headers(init?.headers);
      assert.equal(headers.has("authorization"), false);
      assert.equal(headers.has("cookie"), false);
      return Response.json({ policy: { id: "terms", ...policies.terms } });
    },
  });
  const result = await client.apiRequest("/api/policies/terms", {}, false);
  assert.equal(parsePolicyResponse(result, "terms").id, "terms");
});
