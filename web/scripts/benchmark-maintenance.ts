import pg from "@/node_modules/@types/pg";
import { performance } from "node:perf_hooks";
async function main() {
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (
    process.env.LOCAL_VERIFICATION_DATABASE !== "1" ||
    url.hostname !== "127.0.0.1" ||
    url.pathname !== "/verification"
  )
    throw Error("Disposable local database required");
  const client = new pg.Client({ connectionString: url.toString() });
  try {
    await client.connect();
    await client.query("BEGIN READ ONLY");
    const prefixRow = await client.query<{ identifier: string }>(
      'SELECT identifier FROM "VerificationToken" LIMIT 1',
    );
    const prefix =
      (prefixRow.rows[0]?.identifier.split(":").slice(0, 3).join(":") ??
        "recovery:reset:missing") + ":%";
    const queries = {
      expiredReservations: `SELECT o.id FROM "Order" o WHERE o.status='PENDING' AND o."paymentStatus"='PENDING' AND o."createdAt" <= now() - interval '24 hours' AND EXISTS (SELECT 1 FROM "Payment" p WHERE p."orderId"=o.id AND p.provider='manual_transfer' AND p.status='PENDING') ORDER BY o."createdAt", o.id LIMIT 20`,
      expiredTokens: `SELECT token FROM "VerificationToken" WHERE expires < now() ORDER BY expires, token LIMIT 200`,
      prefixTokens: `SELECT token FROM "VerificationToken" WHERE identifier LIKE $1`,
      expiredSessions: `SELECT id FROM "Session" WHERE expires < now() ORDER BY expires, id LIMIT 200`,
    };
    const results: Record<string, unknown> = {};
    for (const [name, text] of Object.entries(queries)) {
      const query = { text, values: name === "prefixTokens" ? [prefix] : [] };
      const times: number[] = [];
      for (let i = 0; i < 30; i++) {
        const start = performance.now();
        await client.query(query);
        times.push(performance.now() - start);
      }
      times.sort((a, b) => a - b);
      const plan = await client.query({
        text: `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${text}`,
        values: query.values,
      });
      results[name] = {
        samples: times.length,
        p50Ms: times[15],
        p95Ms: times[28],
        plan: plan.rows[0]["QUERY PLAN"],
      };
    }
    await client.query("ROLLBACK");
    console.log(
      JSON.stringify(
        {
          syntheticOnly: true,
          scope:
            "Read-only local selection queries; no deletion or constrained/cloud simulation",
          results,
        },
        null,
        2,
      ),
    );
  } finally {
    await client.end();
  }
}
main().catch(() => {
  console.error("Local maintenance benchmark failed");
  process.exitCode = 1;
});
