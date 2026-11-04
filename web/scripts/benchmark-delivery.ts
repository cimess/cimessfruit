import dotenv from "dotenv";
import pg from "@/node_modules/@types/pg";
import { performance } from "node:perf_hooks";

dotenv.config({ quiet: true });

async function main() {
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
    throw Error("LOCAL_DATABASE_REQUIRED");
  const client = new pg.Client({
    connectionString: url.toString(),
    connectionTimeoutMillis: 5000,
  });
  try {
    await client.connect();
    await client.query("BEGIN READ ONLY");
    const { rows: zones } = await client.query<{
      id: string;
      isAvailable: boolean;
      boundary: unknown;
    }>('SELECT id, "isAvailable", boundary FROM "DeliveryZone"');
    const queries = {
      checkoutById: {
        text: 'SELECT * FROM "DeliveryZone" WHERE id = $1',
        values: [zones[0]?.id ?? "__benchmark_missing__"],
      },
      availableByName: {
        text: 'SELECT * FROM "DeliveryZone" WHERE "isAvailable" = true ORDER BY name ASC',
        values: [],
      },
      availableById: {
        text: 'SELECT * FROM "DeliveryZone" WHERE "isAvailable" = true ORDER BY id ASC',
        values: [],
      },
      adminByName: {
        text: 'SELECT * FROM "DeliveryZone" ORDER BY name ASC',
        values: [],
      },
      availableByNameAndId: {
        text: 'SELECT * FROM "DeliveryZone" WHERE "isAvailable" = true ORDER BY name ASC, id ASC',
        values: [],
      },
    };
    const keys = Object.keys(queries) as (keyof typeof queries)[];
    const timings = new Map<string, number[]>();
    for (const key of keys) {
      await client.query(queries[key]);
      timings.set(key, []);
    }
    for (let sample = 0; sample < 30; sample++) {
      for (let offset = 0; offset < keys.length; offset++) {
        const key = keys[(sample + offset) % keys.length];
        const start = performance.now();
        await client.query(queries[key]);
        timings.get(key)!.push(performance.now() - start);
      }
    }
    const results: Record<string, unknown> = {};
    for (const key of keys) {
      const sorted = timings.get(key)!.sort((a, b) => a - b);
      const query = queries[key];
      const explain = await client.query({
        ...query,
        text: `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${query.text}`,
      });
      const plan = explain.rows[0]["QUERY PLAN"][0];
      const nodes: unknown[] = [];
      function visit(node: Record<string, unknown>) {
        nodes.push({
          type: node["Node Type"],
          index: node["Index Name"],
          actualRows: node["Actual Rows"],
          sortMemoryKb: node["Sort Space Used"],
          sharedHits: node["Shared Hit Blocks"],
          sharedReads: node["Shared Read Blocks"],
        });
        for (const child of (node.Plans ?? []) as Record<string, unknown>[])
          visit(child);
      }
      visit(plan.Plan);
      results[key] = {
        samples: sorted.length,
        p50Ms: +sorted[15].toFixed(3),
        p95Ms: +sorted[28].toFixed(3),
        executionMs: plan["Execution Time"],
        nodes,
      };
    }
    const indexes = await client.query(
      `SELECT tablename, indexname, indexdef FROM pg_indexes
      WHERE schemaname = current_schema() AND tablename = ANY($1::text[])
      ORDER BY tablename, indexname`,
      [
        [
          "DeliveryZone",
          "ProductOption",
          "Account",
          "Session",
          "VerificationToken",
          "MobileAuthGrant",
          "AuthRateLimit",
        ],
      ],
    );
    await client.query("ROLLBACK");
    console.log(
      JSON.stringify(
        {
          scope:
            "Local read-only warm SQL round trips; excludes Redis, polygon evaluation, auth/HTTP/cloud costs",
          counts: {
            zones: zones.length,
            available: zones.filter((zone) => zone.isAvailable).length,
            withBoundary: zones.filter((zone) => zone.boundary !== null).length,
          },
          queries: results,
          indexes: indexes.rows,
        },
        null,
        2,
      ),
    );
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(
    "Local delivery benchmark failed:",
    error.code ?? "Check local PostgreSQL configuration",
  );
  process.exitCode = 1;
});
