import dotenv from "dotenv";
import { performance } from "node:perf_hooks";
import { writeFile } from "node:fs/promises";
import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";
import { createRuntimeDatabase } from "../server/database/runtime-client";
import { createProductHandlers } from "../controllers/product-handlers";
import { listAdminOrders } from "../services/admin-order-list";
import { readConversationInbox } from "../services/conversation-inbox";
import { createDeliveryZoneService } from "../services/delivery-zones";

dotenv.config({ quiet: true });

async function main() {
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) throw Error("Local database required");
  const runtime = createRuntimeDatabase({ attachPool: () => {} });
  // Read-only startup flag is confined to this benchmark's connection pool.
  runtime.pool.options.options += " -c default_transaction_read_only=on";
  const oldPool = new pg.Pool({
    connectionString: url.toString(), max: runtime.config.max,
    connectionTimeoutMillis: 5000, options: "-c timezone=UTC -c default_transaction_read_only=on",
  });
  const previous = new PrismaClient({ adapter: new PrismaPg(oldPool, { disposeExternalPool: true }) });
  const results = [];
  try {
    for (const [mode, prisma] of [["previous-adapter", previous], ["bounded-adapter", runtime.prisma]] as const) {
      const products = createProductHandlers({ db: prisma, currentUser: async () => null, readBody: async () => null });
      const zones = createDeliveryZoneService(prisma);
      const reads = [
        async () => {
          const response = await products.list(new Request("http://localhost/api/products?limit=20"));
          if (!response.ok) throw Error("Product read failed");
          await response.json();
        },
        () => listAdminOrders(prisma, 20),
        () => readConversationInbox(prisma, 20),
        () => zones.available("name"),
      ];
      for (const read of reads) await read();
      for (const concurrency of [1, 8, 16]) {
        let next = 0, errors = 0;
        const durations: number[] = [];
        const start = performance.now();
        await Promise.all(Array.from({ length: concurrency }, async () => {
          while (next < 64) {
            const index = next++, began = performance.now();
            try { await reads[index % reads.length](); } catch { errors++; }
            durations.push(performance.now() - began);
          }
        }));
        durations.sort((a, b) => a - b);
        results.push({ mode, concurrency, operations: durations.length, errors,
          p50Ms: +durations[31].toFixed(2), p95Ms: +durations[60].toFixed(2),
          elapsedMs: +(performance.now() - start).toFixed(2),
        });
      }
    }
    const report = { date: new Date().toISOString(),
      scope: "Local warm mixed read-only workloads; equal per-pool limits; lifecycle suspension not simulated",
      config: runtime.config, results, finalRuntimeStatus: runtime.status(),
    };
    if (process.argv[2]) await writeFile(process.argv[2], JSON.stringify(report, null, 2) + "\n");
    console.log(JSON.stringify(report, null, 2));
  } finally { await previous.$disconnect(); await runtime.prisma.$disconnect(); }
}

main().catch(error => {
  console.error("Runtime pool verification failed:", error.code ?? "Check local configuration");
  process.exitCode = 1;
});
