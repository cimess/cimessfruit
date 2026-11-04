import dotenv from "dotenv";
import pg from "@/node_modules/@types/pg";
import { performance } from "node:perf_hooks";
import { normalizeIdentity } from "../validation/auth-validation";

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
    const { rows } = await client.query<{ email: string }>(
      'SELECT email FROM "User" WHERE email IS NOT NULL',
    );
    const identities = new Map<string, number>();
    let noncanonical = 0;
    for (const { email } of rows) {
      const canonical = normalizeIdentity(email);
      if (email !== canonical) noncanonical++;
      identities.set(canonical, (identities.get(canonical) ?? 0) + 1);
    }
    const audit = {
      emailCount: rows.length,
      noncanonical,
      collisionGroups: [...identities.values()].filter((count) => count > 1)
        .length,
    };
    const sample = rows[0]?.email ?? "benchmark@example.invalid";
    const queries = {
      previous: 'SELECT id FROM "User" WHERE email ILIKE $1 LIMIT 1',
      current: 'SELECT id FROM "User" WHERE email = $1 LIMIT 1',
    };
    await client.query(queries.previous, [sample]);
    await client.query(queries.current, [sample]);
    const samples = { previous: [] as number[], current: [] as number[] };
    for (let i = 0; i < 30; i++) {
      const modes: (keyof typeof queries)[] =
        i % 2 ? ["current", "previous"] : ["previous", "current"];
      for (const mode of modes) {
        const start = performance.now();
        await client.query(queries[mode], [sample]);
        samples[mode].push(performance.now() - start);
      }
    }
    const summary = (values: number[]) => {
      const sorted = [...values].sort((a, b) => a - b);
      return {
        samples: sorted.length,
        p50Ms: +sorted[15].toFixed(3),
        p95Ms: +sorted[28].toFixed(3),
      };
    };
    const plans: Record<string, unknown> = {};
    for (const mode of ["previous", "current"] as const) {
      const result = await client.query(
        `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${queries[mode]}`,
        [sample],
      );
      const plan = result.rows[0]["QUERY PLAN"][0];
      // Allowlist plan metadata; expressions can contain private email values.
      const nodes: unknown[] = [];
      function visit(node: Record<string, unknown>) {
        nodes.push({
          type: node["Node Type"],
          relation: node["Relation Name"],
          index: node["Index Name"],
          actualRows: node["Actual Rows"],
        });
        for (const child of (node.Plans ?? []) as Record<string, unknown>[])
          visit(child);
      }
      visit(plan.Plan);
      plans[mode] = { executionMs: plan["Execution Time"], nodes };
    }
    const indexes =
      await client.query(`SELECT indexname, indexdef FROM pg_indexes
      WHERE schemaname = current_schema() AND tablename = 'User' AND indexdef LIKE '%(email)%'`);
    await client.query("ROLLBACK");
    console.log(
      JSON.stringify(
        {
          scope:
            "Local read-only warm SQL round trips; excludes bcrypt/auth/HTTP/cloud costs",
          audit,
          matchedSample: rows.length > 0,
          previous: summary(samples.previous),
          current: summary(samples.current),
          indexes: indexes.rows,
          plans,
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
    "Local email benchmark failed:",
    error.code ?? "Check local PostgreSQL configuration",
  );
  process.exitCode = 1;
});
