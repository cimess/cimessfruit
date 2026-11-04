import { listAvailableDeliveryZones } from "@/services/delivery-zones";
import { json, readBody } from "@/server/auth/password-auth";
import { getCurrentUser } from "@/server/auth/current-user";
import { coordinateSchema, boundarySchema, containsPoint } from "@/domain/delivery-geometry";
export async function POST(request: Request) {
  if (!await getCurrentUser()) return json({ error: "Unauthorized" }, 401);
  const parsed = coordinateSchema.safeParse(await readBody(request));
  if (!parsed.success) return json({ error: "Choose a valid location." }, 400);
  const zones = await listAvailableDeliveryZones("id");
  const matches = zones.filter(zone => { const boundary = boundarySchema.safeParse(zone.boundary); return boundary.success && containsPoint(parsed.data, boundary.data); });
  return json({ zones: matches });
}
