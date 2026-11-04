import assert from "node:assert/strict";
import test from "node:test";
import { addressCoverageError, boundarySchema, containsPoint, coordinateSchema } from "../domain/delivery-geometry";
import { deliveryZoneSchema } from "../validation/delivery-zone-validation";
import { checkoutSchema } from "../validation/checkout-validation";
const square = [{ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 2 }, { latitude: 2, longitude: 2 }, { latitude: 2, longitude: 0 }];
test("map coverage includes edges and rejects points outside active zones", () => {
  for (const point of [{ latitude: 1, longitude: 1 }, { latitude: 0, longitude: 1 }, { latitude: 0, longitude: 0 }]) assert.equal(containsPoint(point, square), true);
  assert.equal(containsPoint({ latitude: 3, longitude: 1 }, square), false);
  assert.equal(containsPoint({ latitude: 1, longitude: -1 }, square), false);
  assert.equal(containsPoint({ latitude: 1, longitude: 1 }, [...square].reverse()), true);
});
test("unconfigured, inactive, unknown and mismatched map zones fail closed", () => {
  const address = { coordinates: { latitude: 1, longitude: 1 } };
  assert.equal(addressCoverageError(address, { isAvailable: true, boundary: square }), null);
  assert.match(addressCoverageError(address, null)!, /not active/);
  assert.match(addressCoverageError(address, { isAvailable: false, boundary: square })!, /not active/);
  assert.match(addressCoverageError(address, { isAvailable: true, boundary: null })!, /not configured/);
  assert.match(addressCoverageError({ coordinates: { latitude: 3, longitude: 3 } }, { isAvailable: true, boundary: square })!, /outside/);
  assert.equal(addressCoverageError({}, { isAvailable: true }), null, "manual addresses remain supported");
});
test("coordinates and zone fees cannot accept malformed or out of range values", () => {
  for (const value of [{ latitude: 91, longitude: 0 }, { latitude: 0, longitude: 181 }, { latitude: NaN, longitude: 0 }, { latitude: "1", longitude: 0 }]) assert.equal(coordinateSchema.safeParse(value).success, false);
  assert.equal(boundarySchema.safeParse(square.slice(0, 2)).success, false);
  const zone = { id: "new-zone", name: "New zone", area: "Area", state: "Lagos", deliveryFee: 50000, estimatedMinutesMin: 30, estimatedMinutesMax: 60, isAvailable: true, boundary: square };
  assert.equal(deliveryZoneSchema.safeParse(zone).success, true);
  for (const change of [{ deliveryFee: -1 }, { deliveryFee: 1.5 }, { estimatedMinutesMax: 20 }]) assert.equal(deliveryZoneSchema.safeParse({ ...zone, ...change }).success, false);
});
test("checkout accepts future zone IDs and preserves pin coordinates for server validation", () => {
  const input = { items: [{ productId: "11111111-1111-4111-8111-111111111111", optionId: "22222222-2222-4222-8222-222222222222", quantity: 1 }], deliveryAddress: { zoneId: "future-zone", houseNumber: "Pinned entrance", streetOrClose: "Map location", phoneNumber: "08012345678", coordinates: { latitude: 1, longitude: 1 } } };
  assert.deepEqual(checkoutSchema.parse(input).deliveryAddress.coordinates, input.deliveryAddress.coordinates);
});
