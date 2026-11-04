import dotenv from "dotenv";
import pg from "pg";
import os from "node:os";
import { readFile, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { compare, hash } from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";
import { createProductHandlers } from "../controllers/product-handlers";
import { listAdminOrders } from "../services/admin-order-list";
import { readConversationInbox } from "../services/conversation-inbox";
import { createDeliveryZoneService } from "../services/delivery-zones";

dotenv.config({ quiet: true });
const round = (value: number) => +value.toFixed(2);
const mib = (value: number) => round(value / 1024 ** 2);
function summary(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const percentile = (p: number) => round(sorted[Math.max(0, Math.ceil(sorted.length * p) - 1)] ?? 0);
  return { samples: sorted.length, p50Ms: percentile(.5), p95Ms: percentile(.95), p99Ms: percentile(.99) };
}
async function workers(count: number, concurrency: number, run: (index: number) => Promise<void>) {
  let next = 0;
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (next < count) await run(next++);
  }));
}

async function main() {
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) throw Error("LOCAL_DATABASE_REQUIRED");
  const common = {
    connectionString: url.toString(), connectionTimeoutMillis: 3000, idleTimeoutMillis: 1000,
    options: "-c timezone=UTC -c default_transaction_read_only=on -c statement_timeout=2000",
  };
  const observer = new pg.Client({
    ...common, options: "-c timezone=UTC -c default_transaction_read_only=on",
  });
  let baseline;
  await observer.connect();
  try {
    const settings = await observer.query(`SELECT name, setting, unit FROM pg_settings
      WHERE name = ANY($1::text[]) ORDER BY name`, [[
      "server_version", "max_connections", "superuser_reserved_connections", "reserved_connections",
      "shared_buffers", "work_mem", "maintenance_work_mem", "effective_cache_size",
      "statement_timeout", "idle_in_transaction_session_timeout", "lock_timeout",
      "default_transaction_read_only", "max_parallel_workers_per_gather",
    ]]);
    // Observe role/database timeout defaults without injecting a statement timeout.
    const roleDefaults = await observer.query(`SELECT name, reset_val, unit FROM pg_settings
      WHERE name IN ('statement_timeout', 'lock_timeout', 'idle_in_transaction_session_timeout') ORDER BY name`);
    const sessions = await observer.query(`SELECT COALESCE(state, 'not_visible') state, count(*)::int count
      FROM pg_stat_activity WHERE datname = current_database() GROUP BY state ORDER BY state`);
    const counts = await observer.query(`SELECT
      (SELECT count(*)::int FROM "Product") products,
      (SELECT count(*)::int FROM "ProductOption") options,
      (SELECT count(*)::int FROM "Order") orders,
      (SELECT count(*)::int FROM "OrderItem") order_items,
      (SELECT count(*)::int FROM "Payment") payments,
      (SELECT count(*)::int FROM "Conversation") conversations,
      (SELECT count(*)::int FROM "ConversationMessage") messages,
      (SELECT count(*)::int FROM "DeliveryZone") zones,
      pg_database_size(current_database())::text database_bytes`);
    const databaseStats = await observer.query(`SELECT numbackends, blks_read::text, blks_hit::text,
      temp_files::text, temp_bytes::text, deadlocks::text
      FROM pg_stat_database WHERE datname = current_database()`);
    let ownBackendAllocatedBytes: string | null = null;
    try {
      ownBackendAllocatedBytes = (await observer.query('SELECT sum(total_bytes)::text bytes FROM pg_backend_memory_contexts')).rows[0].bytes;
    } catch { /* Optional introspection can require extra privileges. */ }
    baseline = {
      settings: settings.rows, observerStartupDefaults: roleDefaults.rows,
      sessionsIncludingProbe: sessions.rows, counts: counts.rows[0], cumulativeStats: databaseStats.rows[0],
      ownBackendAllocatedBytes,
    };
  } finally { await observer.end(); }

  const poolRuns: unknown[] = [];
  for (const max of [1, 3, 5, 10]) {
    const pool = new pg.Pool({ ...common, max });
    const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
    let peakWaiting = 0;
    const sample = () => { peakWaiting = Math.max(peakWaiting, pool.waitingCount); };
    pool.on("acquire", sample);
    pool.on("error", () => {});
    const products = createProductHandlers({ db: prisma, currentUser: async () => null, readBody: async () => null });
    const zones = createDeliveryZoneService(prisma);
    const reads = [
      async () => {
        const response = await products.list(new Request("http://localhost/api/products?limit=20"));
        if (!response.ok) throw Error("PRODUCT_READ_FAILED");
        await response.json();
      },
      () => listAdminOrders(prisma, 20),
      () => readConversationInbox(prisma, 20),
      () => zones.available("name"),
    ];
    try {
      const clients = await Promise.all(Array.from({ length: max }, () => pool.connect()));
      clients.forEach(client => client.release());
      for (const read of reads) await read();
      for (const concurrency of [1, 4, 8, 16]) {
        const durations: number[] = [];
        const errors: Record<string, number> = {};
        peakWaiting = 0;
        const timer = setInterval(sample, 1);
        const cpu = process.cpuUsage();
        const start = performance.now();
        try {
          await workers(64, concurrency, async index => {
            sample();
            const began = performance.now();
            try { await reads[index % reads.length](); }
            catch (error) {
              const code = (error as { code?: string }).code ?? "READ_FAILED";
              errors[code] = (errors[code] ?? 0) + 1;
            } finally { durations.push(performance.now() - began); sample(); }
          });
        } finally { clearInterval(timer); }
        const elapsed = performance.now() - start;
        const usedCpu = process.cpuUsage(cpu);
        poolRuns.push({
          max, concurrency, ...summary(durations), elapsedMs: round(elapsed),
          completedPerSecondInThisBurst: round(64 * 1000 / elapsed), errors,
          sampledPeakWaiting: peakWaiting, connectionsAfter: pool.totalCount,
          idleAfter: pool.idleCount, probeCpuMs: round((usedCpu.user + usedCpu.system) / 1000),
          probeRssMiB: mib(process.memoryUsage().rss),
        });
      }
    } finally { await prisma.$disconnect(); await pool.end(); }
  }

  const queueDemonstration: unknown[] = [];
  for (const max of [1, 3, 5, 10]) {
    const pool = new pg.Pool({ ...common, max });
    try {
      const clients = await Promise.all(Array.from({ length: max }, () => pool.connect()));
      clients.forEach(client => client.release());
      const waits: number[] = [], totals: number[] = [];
      const start = performance.now();
      await workers(32, 16, async () => {
        const began = performance.now();
        const client = await pool.connect();
        waits.push(performance.now() - began);
        try { await client.query("SELECT pg_sleep(0.02)"); }
        finally { client.release(); totals.push(performance.now() - began); }
      });
      queueDemonstration.push({ max, concurrency: 16, operations: 32,
        artificialServiceMs: 20, elapsedMs: round(performance.now() - start),
        acquisition: summary(waits), total: summary(totals),
      });
    } finally { await pool.end(); }
  }

  const timeoutProbes: unknown[] = [];
  for (const connectionTimeoutMillis of [0, 100]) {
    const pool = new pg.Pool({ ...common, max: 1, connectionTimeoutMillis });
    try {
      const held = await pool.connect();
      const start = performance.now();
      const release = setTimeout(() => held.release(), 250);
      const result = await pool.connect().then(client => {
        client.release(); return "acquired_after_release";
      }, () => "acquisition_timeout");
      const outcomeElapsedMs = round(performance.now() - start);
      // Let the held client be released even when acquisition times out first.
      await new Promise(resolve => setTimeout(resolve, Math.max(0, 260 - (performance.now() - start))));
      clearTimeout(release);
      timeoutProbes.push({ connectionTimeoutMillis, result, heldMs: 250, outcomeElapsedMs });
    } finally { await pool.end(); }
  }
  for (const statement_timeout of [0, 100]) {
    const pool = new pg.Pool({ ...common, max: 1,
      options: `-c timezone=UTC -c default_transaction_read_only=on -c statement_timeout=${statement_timeout}`,
    });
    try {
      await pool.query("SELECT 1");
      const start = performance.now();
      const outcome = await pool.query("SELECT pg_sleep(0.25)").then(() => "completed", error => error.code ?? "QUERY_FAILED");
      timeoutProbes.push({ statementTimeoutMs: statement_timeout, querySleepMs: 250,
        outcome, elapsedMs: round(performance.now() - start) });
    } finally { await pool.end(); }
  }

  const password = "benchmark-only-not-a-user-password";
  const passwordHash = await hash(password, 12);
  const bcryptRuns: unknown[] = [];
  for (const concurrency of [1, 4, 8]) {
    const durations: number[] = [];
    const start = performance.now(), cpu = process.cpuUsage();
    await workers(8, concurrency, async () => {
      const began = performance.now();
      if (!await compare(password, passwordHash)) throw Error("BCRYPT_PROBE_FAILED");
      durations.push(performance.now() - began);
    });
    const cpuUsed = process.cpuUsage(cpu);
    bcryptRuns.push({ concurrency, ...summary(durations), elapsedMs: round(performance.now() - start),
      probeCpuMs: round((cpuUsed.user + cpuUsed.system) / 1000), cost: 12 });
  }

  const meminfo = await readFile("/proc/meminfo", "utf8");
  const memoryField = (name: string) => Number(meminfo.match(new RegExp(`^${name}:\\s+(\\d+)`, "m"))?.[1] ?? 0) * 1024;
  const defaults = new pg.Pool();
  const report = {
    measuredAtUtc: new Date().toISOString(),
    scope: "Local bounded read-only workload and synthetic queue/timeout probes; no CPU/RAM-constrained or deployed capacity claim",
    host: { logicalCpus: os.cpus().length, cpuModel: os.cpus()[0].model,
      totalRamMiB: mib(os.totalmem()), availableRamMiBAtEnd: mib(memoryField("MemAvailable")),
      swapTotalMiB: mib(memoryField("SwapTotal")), loadAverageAtEnd: os.loadavg() },
    currentDriverDefaults: { max: defaults.options.max, idleTimeoutMillis: defaults.options.idleTimeoutMillis,
      connectionTimeoutMillis: defaults.options.connectionTimeoutMillis ?? 0 },
    benchmarkSafety: { connectionTimeoutMillis: 3000, sessionStatementTimeoutMs: 2000, defaultReadOnly: true },
    baseline, poolRuns, queueDemonstration, timeoutProbes, bcryptRuns,
    probePeakRssMiB: round(process.resourceUsage().maxRSS / 1024),
  };
  await defaults.end();
  if (process.argv[2]) {
    await writeFile(process.argv[2], JSON.stringify(report, null, 2) + "\n");
    console.log(JSON.stringify({ saved: process.argv[2], poolRuns: poolRuns.length, timeoutProbes, bcryptRuns }, null, 2));
  } else console.log(JSON.stringify(report, null, 2));
}

main().catch(error => {
  console.error("Local pool benchmark failed:", error.code ?? "Check local PostgreSQL configuration");
  process.exitCode = 1;
});
