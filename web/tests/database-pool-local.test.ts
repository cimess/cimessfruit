import assert from "node:assert/strict";
import test from "node:test";
import { performance } from "node:perf_hooks";
import dotenv from "dotenv";
import { attachDatabasePool } from "@vercel/functions";
import { createRuntimeDatabase } from "../server/database/runtime-client";
import { databaseUnavailable } from "../server/database/failures";

// Explicit opt-in: these tests access local PostgreSQL but never business tables.
const enabled = process.env.LOCAL_POOL_TESTS === "1";
if (enabled) {
  dotenv.config({ quiet: true });
  const host = new URL(process.env.DATABASE_URL ?? "").hostname;
  if (!["localhost", "127.0.0.1", "[::1]"].includes(host)) throw Error("Local PostgreSQL required");
}

function database(overrides: Record<string, string> = {}) {
  return createRuntimeDatabase({
    env: {
      ...process.env, DB_POOL_MAX: "1", DB_CONNECTION_TIMEOUT_MS: "200",
      DB_IDLE_TIMEOUT_MS: "5000", DB_STATEMENT_TIMEOUT_MS: "100",
      DB_QUERY_TIMEOUT_MS: "1000", DB_TRANSACTION_TIMEOUT_MS: "5000", ...overrides,
    },
    attachPool: attachDatabasePool,
  });
}

test("bounded adapter cancels SQL on the server and the same pool can read again", { skip: !enabled }, async () => {
  const db = database();
  try {
    const start = performance.now();
    await assert.rejects(db.prisma.$queryRaw`SELECT pg_sleep(0.5)`, error => {
      // Prisma raw-query errors preserve PostgreSQL's query-canceled code.
      const meta = (error as { meta?: { driverAdapterError?: { cause?: { originalCode?: string } } } }).meta;
      assert.equal(meta?.driverAdapterError?.cause?.originalCode, "57014");
      assert.equal(databaseUnavailable(error), true);
      return true;
    });
    assert.ok(performance.now() - start < 3000);
    const rows = await db.prisma.$queryRaw<{ n: number }[]>`SELECT 1::int n`;
    assert.equal(rows[0].n, 1);
    assert.equal(db.status().waiting, 0);
    assert.equal(db.status().idle, 1);
  } finally { await db.prisma.$disconnect(); }
});

test("ordinary and interactive/batch transactions commit or roll back without leaking SET LOCAL", { skip: !enabled }, async () => {
  const db = database({ DB_STATEMENT_TIMEOUT_MS: "1000", DB_QUERY_TIMEOUT_MS: "2000" });
  try {
    // Temporary fixture exists only on this pool's sole PostgreSQL session.
    const before = (await db.pool.query("SHOW statement_timeout")).rows[0].statement_timeout;
    await db.pool.query("CREATE TEMP TABLE pool_transaction_probe(value integer) ON COMMIT PRESERVE ROWS");
    await db.prisma.$executeRaw`INSERT INTO pool_transaction_probe VALUES (1)`;
    await assert.rejects(db.prisma.$transaction(async tx => {
      const isolation = await tx.$queryRaw<{ level: string }[]>`SELECT current_setting('transaction_isolation') level`;
      assert.equal(isolation[0].level, "serializable");
      await tx.$executeRaw`INSERT INTO pool_transaction_probe VALUES (2)`;
      throw Error("intentional rollback");
    }, { isolationLevel: "Serializable" }), /intentional rollback/);
    await db.prisma.$transaction([
      db.prisma.$executeRaw`INSERT INTO pool_transaction_probe VALUES (3)`,
      db.prisma.$executeRaw`INSERT INTO pool_transaction_probe VALUES (4)`,
    ]);
    const rows = await db.prisma.$queryRaw<{ value: number }[]>`SELECT value FROM pool_transaction_probe ORDER BY value`;
    assert.deepEqual(rows.map(row => row.value), [1, 3, 4]);
    assert.equal((await db.pool.query("SHOW statement_timeout")).rows[0].statement_timeout, before);
    assert.equal(db.status().total, 1);
  } finally { await db.prisma.$disconnect(); }
});

test("interactive SQL timeout rolls back temporary writes and keeps the pool usable", { skip: !enabled }, async () => {
  const db = database();
  try {
    await db.pool.query("CREATE TEMP TABLE pool_timeout_probe(value integer)");
    await assert.rejects(db.prisma.$transaction(async tx => {
      await tx.$executeRaw`INSERT INTO pool_timeout_probe VALUES (1)`;
      await tx.$queryRaw`SELECT pg_sleep(0.5)`;
    }));
    const rows = await db.prisma.$queryRaw<{ n: number }[]>`SELECT count(*)::int n FROM pool_timeout_probe`;
    assert.equal(rows[0].n, 0);
    assert.equal(db.status().idle, 1);
  } finally { await db.prisma.$disconnect(); }
});

test("full-pool acquisition is bounded and recovers after a slot is released", { skip: !enabled }, async () => {
  const db = database();
  const held = await db.pool.connect();
  let released = false;
  try {
    const start = performance.now();
    await assert.rejects(db.prisma.$queryRaw`SELECT 1`);
    assert.ok(performance.now() - start < 3000);
    held.release();
    released = true;
    assert.equal((await db.prisma.$queryRaw<{ n: number }[]>`SELECT 1::int n`)[0].n, 1);
    assert.equal(db.status().waiting, 0);
  } finally {
    if (!released) held.release();
    await db.prisma.$disconnect();
  }
});

test("driver deadline destroys a stalled ordinary pool connection and reconnects", { skip: !enabled }, async () => {
  const db = database({ DB_QUERY_TIMEOUT_MS: "250" });
  try {
    await assert.rejects(db.pool.query("SELECT pg_sleep(0.5)"), /Query read timeout/);
    assert.equal((await db.prisma.$queryRaw<{ n: number }[]>`SELECT 1::int n`)[0].n, 1);
  } finally { await db.prisma.$disconnect(); }
});

test("idle clients retire and a later read reconnects", { skip: !enabled }, async () => {
  const db = database({ DB_IDLE_TIMEOUT_MS: "100" });
  try {
    await db.prisma.$queryRaw`SELECT 1`;
    await new Promise(resolve => setTimeout(resolve, 250));
    assert.equal(db.status().total, 0);
    await db.prisma.$queryRaw`SELECT 1`;
    assert.equal(db.status().idle, 1);
  } finally { await db.prisma.$disconnect(); }
});
