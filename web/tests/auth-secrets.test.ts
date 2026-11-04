import test from "node:test";
import assert from "node:assert/strict";
import { bearerToken, hashSecret, mobileSessionKey } from "../server/auth/auth-secrets";

test("only correctly formed native bearer credentials are accepted", () => {
  const token = `mobile_${"a".repeat(64)}`;
  assert.equal(bearerToken(new Headers({ authorization: `Bearer ${token}` })), token);
  for (const input of ["Basic password", "Bearer forged", `Bearer ${token} extra`, `Bearer ${"a".repeat(64)}`]) {
    assert.equal(bearerToken(new Headers({ authorization: input })), null);
  }
  assert.equal(bearerToken(new Headers({ cookie: `authjs.session-token=${token}` })), null);
});
test("native credentials use a one-way, domain-separated database key", () => {
  assert.equal(hashSecret("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  const token = `mobile_${"b".repeat(64)}`;
  assert.equal(mobileSessionKey(token), `mobile-hash:${hashSecret(token)}`);
  assert.notEqual(mobileSessionKey(token), token);
});
