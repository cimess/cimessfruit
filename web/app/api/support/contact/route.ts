import { NextResponse } from "next/server";
import { prisma } from "@/server/database/prisma";

const DEFAULT_WHATSAPP_NUMBER = "+2349065440424";

export async function GET() {
  try {
    const configuredEnv = process.env.SUPPORT_WHATSAPP_NUMBER?.trim();
    if (configuredEnv) {
      return NextResponse.json({ phone: configuredEnv });
    }

    // Try finding the active admin with a phone number in the DB
    const adminWithPhone = await prisma.user.findFirst({
      where: {
        role: "ADMIN",
        isActive: true,
        phone: { not: null },
      },
      select: { phone: true },
      orderBy: { createdAt: "asc" },
    });

    const phone = adminWithPhone?.phone?.trim() || DEFAULT_WHATSAPP_NUMBER;
    return NextResponse.json({ phone });
  } catch {
    return NextResponse.json({ phone: DEFAULT_WHATSAPP_NUMBER });
  }
}
