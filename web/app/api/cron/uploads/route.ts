import { cleanupUploads, validCron } from "@/features/uploads/handlers";
import { prisma } from "@/server/database/prisma";
import { r2Storage } from "@/features/uploads/storage";
export const maxDuration = 60;
export async function GET(request: Request) {
  if (!validCron(request, process.env.CRON_SECRET)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try { return Response.json(await cleanupUploads(prisma, r2Storage()), { headers: { "Cache-Control": "no-store" } }); }
  catch { return Response.json({ error: "Cleanup interrupted; pending records will retry." }, { status: 503 }); }
}
