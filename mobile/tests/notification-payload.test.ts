import assert from "node:assert/strict";
import test from "node:test";
import { notificationPayload } from "../src/features/notifications/payload";
test("push navigation accepts identifiers and rejects arbitrary URLs/malformed events", () => {
  const event = { eventId: "00000000-0000-4000-8000-000000000001", entityId: "00000000-0000-4000-8000-000000000002", kind: "order" };
  assert.deepEqual(notificationPayload(event), event);
  for (const invalid of [null, { ...event, kind: "url", url: "https://bad.example" }, { ...event, entityId: "../../account" }, { ...event, eventId: "bad" }]) assert.equal(notificationPayload(invalid), null);
});
