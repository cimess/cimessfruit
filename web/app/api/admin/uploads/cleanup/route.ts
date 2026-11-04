import { getCurrentUser } from "@/server/auth/current-user";
import { cleanupUploads } from "@/features/uploads/handlers";
import { r2Storage } from "@/features/uploads/storage";
import { prisma } from "@/server/database/prisma";
export const maxDuration = 60;
export async function POST() {
  const user = await getCurrentUser();
  if (!user?.isActive || user.role !== "ADMIN") return Response.json({ error: "Administrator access required" }, { status: 403 });
  try { return Response.json(await cleanupUploads(prisma, r2Storage()), { headers: { "Cache-Control": "no-store" } }); }
  catch { return Response.json({ error: "Cleanup interrupted. Pending files remain queued." }, { status: 503 }); }
}
