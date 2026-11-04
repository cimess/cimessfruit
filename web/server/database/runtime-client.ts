import pg from "pg";
import { PrismaClient } from "../../generated/prisma/client";
import { BoundedPrismaPg } from "./bounded-adapter";
import { readDatabasePoolConfig } from "./pool-config";

export function createRuntimeDatabase({ env = process.env, attachPool, onPoolError }: {
  env?: Record<string, string | undefined>;
  attachPool: (pool: pg.Pool) => void;
  onPoolError?: () => void;
}) {
  const config = readDatabasePoolConfig(env);
  const pool = new pg.Pool({
    connectionString: env.DATABASE_URL,
    max: config.max,
    connectionTimeoutMillis: config.connectionTimeoutMillis,
    idleTimeoutMillis: config.idleTimeoutMillis,
    query_timeout: config.queryTimeoutMillis,
    // Do not put statement_timeout in startup parameters: Neon pooling rejects it.
    options: "-c timezone=UTC",
  });
  pool.on("error", () => {
    // Do not log driver errors, query parameters or credentials.
    if (onPoolError) onPoolError();
    else console.warn("Idle database connection lost; the pool will reconnect when needed.");
  });
  attachPool(pool);
  const adapter = new BoundedPrismaPg(pool, config.statementTimeoutMillis);
  const prisma = new PrismaClient({
    adapter,
    transactionOptions: {
      maxWait: config.connectionTimeoutMillis,
      timeout: config.transactionTimeoutMillis,
    },
  });
  return {
    prisma, pool, config,
    // Safe operational counters; do not expose connection options/credentials.
    status: () => ({ max: config.max, total: pool.totalCount, idle: pool.idleCount, waiting: pool.waitingCount }),
  };
}
