import { z } from "zod";
export const coordinateSchema = z.strictObject({ latitude: z.number().finite().min(-90).max(90), longitude: z.number().finite().min(-180).max(180) });
export const boundarySchema = z.array(coordinateSchema).min(3).max(100);
export type Coordinate = z.infer<typeof coordinateSchema>;
// Ray casting, including points on polygon edges. Coordinates are lat/lng, not GeoJSON tuples.
export function containsPoint(point: Coordinate, polygon: Coordinate[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[j], b = polygon[i];
    const cross = (point.longitude - a.longitude) * (b.latitude - a.latitude) - (point.latitude - a.latitude) * (b.longitude - a.longitude);
    if (Math.abs(cross) < 1e-10 && point.longitude >= Math.min(a.longitude, b.longitude) && point.longitude <= Math.max(a.longitude, b.longitude) && point.latitude >= Math.min(a.latitude, b.latitude) && point.latitude <= Math.max(a.latitude, b.latitude)) return true;
    if ((a.latitude > point.latitude) !== (b.latitude > point.latitude) && point.longitude < (b.longitude - a.longitude) * (point.latitude - a.latitude) / (b.latitude - a.latitude) + a.longitude) inside = !inside;
  }
  return inside;
}
export function addressCoverageError(address: { coordinates?: Coordinate }, zone: { isAvailable: boolean; boundary?: unknown } | null): string | null {
  if (!zone?.isAvailable) return "This delivery zone is not active. Select an available zone.";
  if (!address.coordinates) return null; // Existing/manual addresses remain supported.
  const boundary = boundarySchema.safeParse(zone.boundary);
  if (!boundary.success) return "Map coverage is not configured for this zone yet. Use a street address or contact support.";
  return containsPoint(address.coordinates, boundary.data) ? null : "This pin is outside the selected delivery zone.";
}
