import { saveDeliveryZone } from "@/services/delivery-zones";
import { Prisma } from "@/generated/prisma/client";
import { getCurrentUser } from "@/server/auth/current-user";
import { prisma } from "@/server/database/prisma";
import { json, readBody } from "@/server/auth/password-auth";
import { deliveryZoneSchema } from "@/validation/delivery-zone-validation";
export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") return json({ error: "Administrator access required." }, 403);
  return json({ zones: await prisma.deliveryZone.findMany({ orderBy: [{ name: "asc" }, { id: "asc" }] }) });
}
export async function PUT(request: Request) {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") return json({ error: "Administrator access required." }, 403);
  const parsed = deliveryZoneSchema.safeParse(await readBody(request));
  if (!parsed.success) return json({ error: "Check the zone name, fee, delivery times and boundary points." }, 400);
  const data = { ...parsed.data, boundary: parsed.data.boundary ?? Prisma.DbNull };
  const zone = await saveDeliveryZone(data);
  return json({ zone });
}
