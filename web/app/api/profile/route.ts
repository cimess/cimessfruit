import { getCurrentUser } from "@/server/auth/current-user";
import { prisma } from "@/server/database/prisma";
import { json, readBody } from "@/server/auth/password-auth";
import { z } from "zod";
import { deliveryAddressSchema } from "@/validation/checkout-validation";
import { addressCoverageError } from "@/domain/delivery-geometry";
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return json({ error: "Unauthorized" }, 401);
  const profile = await prisma.user.findUnique({ where: { id: user.id }, select: {
    id: true, name: true, email: true, emailVerified: true, phone: true, deliveryAddress: true, notificationsEnabled: true, freeShipping: true,
  } });
  return json({ profile });
}

const profileSchema = z.strictObject({
  name: z.string().trim().min(2).max(100).optional(),
  phone: z.string().regex(/^\+?[0-9]{8,15}$/).nullable().optional(),
  notificationsEnabled: z.boolean().optional(),
  deliveryAddress: deliveryAddressSchema.optional(),
});
export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  if (!user) return json({ error: "Unauthorized" }, 401);
  const parsed = profileSchema.safeParse(await readBody(request));
  if (!parsed.success) return json({ error: "Enter a valid name and phone number." }, 400);
  if (parsed.data.deliveryAddress) {
    const zone = await prisma.deliveryZone.findUnique({ where: { id: parsed.data.deliveryAddress.zoneId } });
    const error = addressCoverageError(parsed.data.deliveryAddress, zone);
    if (error) return json({ error }, 400);
  }
  try {
    const profile = await prisma.user.update({ where: { id: user.id, isActive: true }, data: parsed.data,
      select: { id: true, name: true, email: true, emailVerified: true, phone: true, notificationsEnabled: true, freeShipping: true, deliveryAddress: true },
    });
    return json({ profile });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") return json({ error: "This phone number is already in use." }, 409);
    return json({ error: "Unable to update your profile." }, 500);
  }
}
