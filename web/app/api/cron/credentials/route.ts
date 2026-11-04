import { validCron } from "@/features/uploads/handlers";
import { cleanupCredentials } from "@/features/maintenance/credentials";
import { credentialStores } from "@/features/maintenance/credential-stores";
import { prisma } from "@/server/database/prisma";
export const maxDuration = 60;
export async function GET(request: Request) {
  if (!validCron(request, process.env.CRON_SECRET)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try { return Response.json(await cleanupCredentials(credentialStores(prisma)), { headers: { "Cache-Control": "no-store" } }); }
  catch { return Response.json({ error: "Credential cleanup interrupted; remaining expired records will retry." }, { status: 503 }); }
}
