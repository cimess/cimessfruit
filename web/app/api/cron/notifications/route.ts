import { validCron } from "@/features/uploads/handlers";
import { kickNotifications } from "@/server/notifications/publisher";
import { prisma } from "@/server/database/prisma";
export const maxDuration = 60;
export async function GET(request: Request) {
  if (!validCron(request, process.env.CRON_SECRET)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  await kickNotifications(prisma);
  return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
