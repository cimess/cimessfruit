import assert from "node:assert/strict";
import test from "node:test";
import { reviewBasket } from "../services/checkout-eligibility";
const apple = { id: "apple-size", productId: "apple", stock: 3, price: 10000, label: "Small", product: { name: "Apple", isAvailable: true } };
const grape = { id: "grape-size", productId: "grape", stock: 0, price: 20000, label: "Small", product: { name: "Grapes", isAvailable: true } };
const items = [{ productId: "apple", optionId: "apple-size", quantity: 1 }, { productId: "grape", optionId: "grape-size", quantity: 1 }];
const zone = { isAvailable: true, deliveryFee: 50000 };
test("a mixed basket is blocked as a whole; unavailable items never contribute a payable total", () => {
  const result = reviewBasket(items, [apple, grape], zone);
  assert.equal(result.eligible, false);
  assert.equal(result.total, null);
  assert.equal(result.itemSubtotal, null);
  assert.equal(result.lines[0].issue, null);
  assert.match(result.lines[1].issue!, /sold out/);
});
test("missing, archived, mismatched, unpriced and insufficient-stock items block checkout", () => {
  for (const option of [undefined, { ...apple, product: { ...apple.product, isAvailable: false } }, { ...apple, productId: "other" }, { ...apple, price: 0 }, { ...apple, stock: 0 }]) {
    assert.equal(reviewBasket([items[0]], option ? [option] : [], zone).eligible, false);
  }
  assert.equal(reviewBasket([{ ...items[0], quantity: 4 }], [apple], zone).eligible, false);
});
test("only a fully eligible basket receives current server totals", () => {
  assert.equal(reviewBasket([items[0]], [apple], zone).total, 60000);
  assert.equal(reviewBasket([items[0]], [apple], { ...zone, isAvailable: false }).total, null);
  assert.equal(reviewBasket([items[0]], [apple], { ...zone, deliveryFee: -1 }).eligible, false);
  assert.equal(reviewBasket([], [], zone).eligible, false);
});
