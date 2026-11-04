import { listAvailableDeliveryZones } from "@/services/delivery-zones";
import { json } from "@/server/auth/password-auth";
export async function GET() {
  const zones = await listAvailableDeliveryZones("name");
  return json({ zones });
}
