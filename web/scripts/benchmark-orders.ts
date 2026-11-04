import dotenv from "dotenv";
import { performance } from "node:perf_hooks";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";
import { listAdminOrders } from "../services/admin-order-list";

dotenv.config({ quiet: true });

async function main() {
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) {
    throw new Error("LOCAL_DATABASE_REQUIRED");
  }
  const db = new PrismaClient({ adapter: new PrismaPg({
    connectionString: url.toString(), max: 1, connectionTimeoutMillis: 5000,
  }) });
  try {
    const report = await db.$transaction(async tx => {
      await tx.$executeRaw`SET TRANSACTION READ ONLY`;
      const counts = {
        orders: await tx.order.count(),
        payments: await tx.payment.count(),
        items: await tx.orderItem.count(),
      };
      const oldRead = () => tx.order.findMany({
        where: { payment: { provider: "manual_transfer" } },
        include: { items: true, payment: true },
        orderBy: { createdAt: "desc" }, take: 100,
      });
      const newRead = () => listAdminOrders(tx, 20);
      // Warm up both paths; alternate subsequent reads to reduce ordering bias.
      await oldRead(); await newRead();
      const oldTimes: number[] = [], newTimes: number[] = [];
      let oldBytes = 0, newBytes = 0;
      for (let index = 0; index < 30; index++) {
        for (const mode of index % 2 ? ["new", "old"] : ["old", "new"]) {
          const start = performance.now();
          if (mode === "old") {
            const orders = await oldRead();
            oldTimes.push(performance.now() - start);
            oldBytes = Buffer.byteLength(JSON.stringify({ orders }));
          } else {
            const data = await newRead();
            newTimes.push(performance.now() - start);
            newBytes = Buffer.byteLength(JSON.stringify(data));
          }
        }
      }
      const summarize = (times: number[], responseBytes: number) => {
        const sorted = [...times].sort((a, b) => a - b);
        return {
          samples: times.length,
          p50Ms: Number(sorted[Math.floor(sorted.length * .5)].toFixed(2)),
          p95Ms: Number(sorted[Math.ceil(sorted.length * .95) - 1].toFixed(2)),
          responseBytes,
        };
      };
      const indexes = await tx.$queryRaw<{ tablename: string; indexname: string; indexdef: string }[]>`
        SELECT tablename, indexname, indexdef FROM pg_indexes
        WHERE schemaname = current_schema()
          AND tablename IN ('Order', 'Payment', 'OrderItem')
        ORDER BY tablename, indexname`;
      const plan = await tx.$queryRaw<{ "QUERY PLAN": string }[]>`
        EXPLAIN (ANALYZE, BUFFERS)
        SELECT o.id, o."createdAt" FROM "Order" o
        WHERE EXISTS (SELECT 1 FROM "Payment" p
          WHERE p."orderId" = o.id AND p.provider = 'manual_transfer')
        ORDER BY o."createdAt" DESC, o.id DESC LIMIT 21`;
      return {
        scope: "Local read-only warm Prisma queries; excludes HTTP/auth/cache/network-to-cloud costs",
        counts,
        previous: summarize(oldTimes, oldBytes),
        current: summarize(newTimes, newBytes),
        indexes,
        parentQueryPlan: plan.map(row => row["QUERY PLAN"]),
      };
    }, { timeout: 30_000, isolationLevel: "RepeatableRead" });
    console.log(JSON.stringify(report, null, 2));
  } finally { await db.$disconnect(); }
}

main().catch(error => {
  // Avoid printing connection strings, SQL parameters or customer data.
  console.error("Local order benchmark failed:", error.code ?? "Check local PostgreSQL configuration");
  process.exitCode = 1;
});
