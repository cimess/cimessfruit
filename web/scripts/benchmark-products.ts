import dotenv from "dotenv";
import { performance } from "node:perf_hooks";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";
import { createProductHandlers } from "../controllers/product-handlers";
async function main() {
  dotenv.config({ quiet: true });
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname))
    throw Error("Local database required");
  const db = new PrismaClient({
    adapter: new PrismaPg({ connectionString: url.toString(), max: 1 }),
  });
  try {
    const handlers = createProductHandlers({
      db,
      currentUser: async () => null,
      readBody: async () => null,
    });
    const cases: Record<string, unknown> = {};
    for (const [name, filters] of Object.entries({
      newest: "sort=newest",
      price: "sort=price-asc",
      search: "search=Pineapple&sort=newest",
    })) {
      const times: number[] = [];
      let bytes = 0,
        count = 0;
      for (let i = 0; i < 16; i++) {
        const start = performance.now();
        const response = await handlers.list(
          new Request(`http://localhost/api/products?limit=20&${filters}`),
        );
        const body = await response.text();
        if (!response.ok) throw Error("Browse failed");
        if (i) times.push(performance.now() - start);
        bytes = Buffer.byteLength(body);
        count = JSON.parse(body).items.length;
      }
      times.sort((a, b) => a - b);
      cases[name] = {
        samples: times.length,
        p50Ms: times[Math.floor(times.length / 2)],
        p95Ms: times[Math.ceil(times.length * 0.95) - 1],
        responseBytes: bytes,
        returned: count,
      };
    }
    const plans = await db.$queryRaw<
      { "QUERY PLAN": string }[]
    >`EXPLAIN (ANALYZE, BUFFERS) SELECT id FROM "Product" WHERE "isAvailable" = true AND (name ILIKE '%Pineapple%' OR description ILIKE '%Pineapple%')`;
    console.log(
      JSON.stringify(
        {
          scope:
            "Local uncached API-handler/database path; no HTTP/auth/TLS/provider or constrained-resource simulation",
          products: await db.product.count(),
          cases,
          searchPlan: plans.map((row) => row["QUERY PLAN"]),
          note: "Current API sorts matching rows in memory; cursor limits response bytes, not database matches. No trigram/index change applied.",
        },
        null,
        2,
      ),
    );
  } finally {
    await db.$disconnect();
  }
}
main().catch(() => {
  console.error("Local disposable benchmark failed");
  process.exitCode = 1;
});
