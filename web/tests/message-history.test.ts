import test from "node:test";
import assert from "node:assert/strict";
import { messageWindow, messagePage } from "../features/chat/history";
const conversationId = "00000000-0000-4000-8000-000000000001";
test("message cursor binds the conversation and retains a timestamp/id boundary after deletion", () => {
  const date = new Date("2026-10-29T10:00:00Z");
  const messages = Array.from({ length: 21 }, (_, i) => ({ id: `00000000-0000-4000-8000-${String(100 - i).padStart(12, "0")}`, createdAt: date }));
  const page = messagePage({ id: conversationId, messages })!;
  assert.equal(page.messages.length, 20); assert.ok(page.nextMessageCursor); assert.equal(page.messages[0].id, messages[19].id);
  const selection = messageWindow(conversationId, page.nextMessageCursor); assert.equal(selection.take, 21); assert.deepEqual(selection.where?.OR[1], { createdAt: date, id: { lt: messages[19].id } });
  assert.throws(() => messageWindow("00000000-0000-4000-8000-000000000002", page.nextMessageCursor)); assert.throws(() => messageWindow(conversationId, "invalid"));
});
