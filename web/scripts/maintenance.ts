import { cleanupCredentials } from "../features/maintenance/credentials";
import { credentialStores } from "../features/maintenance/credential-stores";
import { writeEvent } from "../server/notifications/events";
import { kickNotifications } from "../server/notifications/publisher";
import "dotenv/config";
import { dataCache, closeRedis } from "../server/cache/redis";
import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { expireReservations, reservationBatchSize } from "../services/order-maintenance";
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, options: "-c timezone=UTC" }) });
async function main() {
  let count = 0, batch;
  do { batch = await expireReservations(db, new Date(), dataCache, writeEvent); count += batch; } while (batch === reservationBatchSize);
  await kickNotifications(db);
  let credentials;
  do { credentials = await cleanupCredentials(credentialStores(db)); } while (credentials.moreMayRemain);
  console.log(`Expired ${count} unpaid reservations; removed expired credentials and rate limits.`);
}
main().catch(() => { console.error("Maintenance failed; retry required."); process.exitCode = 1; }).finally(async () => { closeRedis(); await db.$disconnect(); });
