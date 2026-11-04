import assert from "node:assert/strict";
import test from "node:test";
import { needsGooglePassword } from "../domain/google-password";
import { addCartLine, readCart, type CartLine } from "../lib/store-cart";
test("only Google-authenticated passwordless accounts need the extra password screen", () => {
  assert.equal(needsGooglePassword(null), false);
  assert.equal(needsGooglePassword({ passwordHash: "existing-password-hash", accounts: [] }), false);
  assert.equal(needsGooglePassword({ passwordHash: "existing-password-hash", accounts: [{ provider: "google" }] }), false);
  assert.equal(needsGooglePassword({ passwordHash: null, accounts: [] }), false);
  assert.equal(needsGooglePassword({ passwordHash: null, accounts: [{ provider: "google" }] }), true);
});
const line: CartLine = { productId: "c1a10276-792a-4430-88a7-9988af339b7f", optionId: "c1a10276-792a-4430-88a7-9988af339b7a", name: "Apple", label: "Small", price: 1999, stock: 3, quantity: 1, imageUrl: null };
test("bag merges matching sizes and caps quantities to stock", () => {
  const first = addCartLine([], line); assert.equal(first.length, 1);
  const next = addCartLine(first, { ...line, quantity: 8 });
  assert.equal(next.length, 1); assert.equal(next[0].quantity, 3);
  assert.equal(addCartLine([], { ...line, stock: 0 }).length, 0);
});
test("invalid browser storage is discarded", () => {
  assert.deepEqual(readCart("invalid"), []); assert.deepEqual(readCart(null), []);
  assert.deepEqual(readCart(JSON.stringify([{ ...line, quantity: -1 }])), []);
  assert.deepEqual(readCart(JSON.stringify([{ ...line, price: 0.5 }])), []);
  assert.deepEqual(readCart(JSON.stringify([line])), [line]);
});
