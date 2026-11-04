import test from "node:test";
import assert from "node:assert/strict";
import { configuredEmailOrigin } from "../server/email/email-origin";
test("email links support a configured LAN development server but require HTTPS in production", () => {
  assert.equal(configuredEmailOrigin("http://192.168.1.5:3001", false), "http://192.168.1.5:3001");
  assert.equal(configuredEmailOrigin("https://shop.example", true), "https://shop.example");
  assert.throws(() => configuredEmailOrigin("http://192.168.1.5:3001", true));
  assert.throws(() => configuredEmailOrigin("javascript:alert(1)", false));
  assert.throws(() => configuredEmailOrigin("https://user:password@shop.example", true));
});
