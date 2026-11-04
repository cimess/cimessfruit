import { addressCoverageError } from "@/domain/delivery-geometry";
import { hash } from "bcryptjs";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/database/prisma";
import { sessionResponse, safeUserSelect } from "@/server/auth/mobile-session";
import { allowAuthAttempt, json, readBody, signupSchema } from "@/server/auth/password-auth";

export async function POST(request: Request) {
  const parsed = signupSchema.safeParse(await readBody(request));
  if (!parsed.success) return json({ error: "Enter valid details and a password of 12–72 characters (maximum 72 UTF-8 bytes)." }, 400);
  const { name, email, phoneNumber, password, deliveryAddress } = parsed.data;
  if (!await allowAuthAttempt(email)) return json({ error: "Too many attempts. Try again in 15 minutes." }, 429);
  if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) {
    return json({ error: "This email is already registered. Sign in, or choose Reactivate account if you previously disabled it." }, 409);
  }
  if (deliveryAddress) {
    const zone = await prisma.deliveryZone.findUnique({ where: { id: deliveryAddress.zoneId } });
    const error = addressCoverageError(deliveryAddress, zone);
    if (error) return json({ error }, 400);
  }
  try {
    const user = await prisma.user.create({ data: {
      name, email, phone: phoneNumber, passwordHash: await hash(password, 12),
      deliveryAddress, role: "CUSTOMER",
    }, select: safeUserSelect });
    return sessionResponse(user, request, 201);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return json({ error: "Unable to register these details. Try signing in." }, 409);
    }
    throw error;
  }
}
