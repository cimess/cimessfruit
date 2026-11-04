import { flushChanges } from "@/features/realtime/publication";
import { enabled } from "@/server/notifications/events";
import { publishRecovery } from "@/server/notifications/transport";
import { writeEvent } from "@/server/notifications/events";
import { createMaintenanceHandler } from "@/controllers/maintenance-handler";
import { prisma } from "@/server/database/prisma";
import { dataCache } from "@/server/cache/redis";

export const maxDuration = 60;
export const GET = createMaintenanceHandler({ db: prisma, cache: dataCache, notify: writeEvent, kick: async () => {
  await flushChanges(prisma);
  if (!enabled()) return;
  try { await publishRecovery(); } catch { console.error("Expiry notification dispatch deferred to daily recovery"); }
}, secret: () => process.env.CRON_SECRET });
