import assert from "node:assert/strict";
import test from "node:test";
import { nairaToKobo } from "../lib/product-form";

test("admin prices convert naira to exact integer kobo", () => {
  for (const [input, expected] of [["1500", 150000], ["0.01", 1], ["1.1", 110], ["19.99", 1999], [" 42.50 ", 4250], ["21474836.47", 2147483647]] as const) {
    assert.equal(nairaToKobo(input), expected);
  }
});
test("admin price entry rejects rounding, overflow and invalid inputs", () => {
  for (const input of ["0", "-1", "1.001", "1e3", "1,000", "", "NaN", "Infinity", "21474836.48", "9007199254740991"]) {
    assert.throws(() => nairaToKobo(input));
  }
});
