import assert from "node:assert/strict";
import test from "node:test";
import { mobileCallback } from "../lib/mobile-callback";

const expo = "exp://192.168.0.197:8081/--/auth/callback";
test("native callback works without development configuration", () => {
  assert.equal(mobileCallback(undefined, false), "cimessfruit://auth/callback");
  assert.equal(mobileCallback("cimessfruit://auth/callback", false), "cimessfruit://auth/callback");
});
test("Expo callback requires exact configuration and development mode", () => {
  assert.equal(mobileCallback(expo, true, expo), expo);
  assert.equal(mobileCallback(expo, false, expo), null);
  assert.equal(mobileCallback(expo, true), null);
  assert.equal(mobileCallback(expo.replace("8081", "8082"), true, expo), null);
});
test("rejects arbitrary destinations and malformed callback configuration", () => {
  for (const value of ["https://evil.example", "javascript:alert(1)", `${expo}?code=forged`, `${expo}#fragment`,
    "exp://user:password@192.168.0.197:8081/--/auth/callback", "exp://192.168.0.197:8081/wrong", "invalid"]) {
    assert.equal(mobileCallback(value, true, value), null);
  }
  assert.equal(mobileCallback([expo], true, expo), null);
});
