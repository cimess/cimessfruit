import assert from "node:assert/strict";
import test from "node:test";
import { existsSync } from "node:fs";
import { defaultCatalogue, existingCatalogueProduct } from "../lib/default-catalogue";
import { fixedProductImage } from "../lib/product-images";

test("every default fruit has a unique stable ID and a real bundled image", () => {
  assert.equal(new Set(defaultCatalogue.map((entry) => entry.id)).size, defaultCatalogue.length);
  for (const entry of defaultCatalogue) {
    assert.match(entry.id, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$/);
    assert.ok(existsSync(`public${fixedProductImage(entry)}`));
  }
  assert.equal(fixedProductImage({ name: "Grape" }), "/store/grapes.webp");
  assert.equal(fixedProductImage({ name: "Red apple" }), "/store/redApple.webp");
});

test("catalogue setup reuses existing types and legacy fruit names", () => {
  const entry = defaultCatalogue.find((item) => item.productType === "redApple")!;
  const product = { id: "existing", name: "Fresh red apples", category: "FRUIT", productType: null };
  assert.equal(existingCatalogueProduct([product], entry)?.id, "existing");
  assert.equal(existingCatalogueProduct([{ ...product, name: "Renamed", productType: "redApple" }], entry)?.id, "existing");
  assert.equal(existingCatalogueProduct([{ ...product, name: "Grapes" }], entry), undefined);
});
