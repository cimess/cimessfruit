import assert from "node:assert/strict";
import test from "node:test";
import { attachDatabasePool } from "@vercel/functions";
import { readDatabasePoolConfig } from "../server/database/pool-config";
import { createRuntimeDatabase } from "../server/database/runtime-client";
import { databaseUnavailable, databaseUnavailableResponse } from "../server/database/failures";
import { createProductHandlers } from "../controllers/product-handlers";
import { createCheckoutHandlers } from "../controllers/checkout-handlers";
import { createInboxHandler } from "../controllers/conversation-inbox";
import type { PrismaClient } from "../generated/prisma/client";

test("database configuration has finite defaults and rejects malformed/disabled limits", () => {
  assert.deepEqual(readDatabasePoolConfig({}), {
    max: 3, connectionTimeoutMillis: 5000, idleTimeoutMillis: 5000,
    statementTimeoutMillis: 10000, queryTimeoutMillis: 12000, transactionTimeoutMillis: 5000,
  });
  for (const value of ["0", "-1", "3.5", "abc", "101", "Infinity"]) {
    assert.throws(() => readDatabasePoolConfig({ DB_POOL_MAX: value }), /Invalid DB_POOL_MAX/);
  }
  assert.throws(() => readDatabasePoolConfig({ DB_CONNECTION_TIMEOUT_MS: "0" }), /DB_CONNECTION_TIMEOUT_MS/);
  assert.throws(() => readDatabasePoolConfig({ DB_QUERY_TIMEOUT_MS: "10000" }), /must exceed/);
  assert.equal(readDatabasePoolConfig({ DB_POOL_MAX: " 5 " }).max, 5);
});

test("catalogue, admin order and inbox handlers surface temporary database failures as 503", async () => {
  const timeout = { code: "P2010", meta: { driverAdapterError: { cause: { originalCode: "57014" } } } };
  const db = {
    product: { findMany: async () => { throw timeout; } },
    order: { findMany: async () => { throw timeout; } },
    conversation: { findMany: async () => { throw timeout; } },
  } as unknown as PrismaClient;
  const currentUser = async () => ({ id: "test-admin", role: "ADMIN" as const, name: null, email: null, phone: null, image: null, isActive: true });
  const readBody = async () => null;
  const products = createProductHandlers({ db, currentUser, readBody });
  const orders = createCheckoutHandlers({ db, currentUser, readBody });
  const inbox = createInboxHandler({ db, currentUser });
  for (const response of await Promise.all([
    products.list(new Request("http://localhost/api/products")),
    orders.listAdmin(new Request("http://localhost/api/admin/orders")),
    inbox(new Request("http://localhost/api/admin/support")),
  ])) assert.equal(response.status, 503);
});

test("nested timeout errors get private 503 responses without hiding validation or conflicts", async () => {
  for (const error of [
    { code: "P1001" },
    { code: "P2010", meta: { driverAdapterError: { cause: { originalCode: "57014" } } } },
    Error("timeout exceeded when trying to connect"),
    Error("Query read timeout"),
  ]) assert.equal(databaseUnavailable(error), true);
  for (const error of [{ code: "P2002" }, { code: "P2034" }, { code: "P2025" }, Error("Validation failed")]) {
    assert.equal(databaseUnavailable(error), false);
  }
  const response = databaseUnavailableResponse();
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("Retry-After"), "1");
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  assert.equal("details" in await response.json(), false);
});

test("runtime owns one pool, attaches lifecycle handling once and redacts idle errors", async () => {
  let attachments = 0, warnings = 0;
  const db = createRuntimeDatabase({
    env: { DATABASE_URL: "postgresql://unused:private-password@localhost/unused" },
    attachPool: pool => { attachments++; attachDatabasePool(pool); },
    onPoolError: () => { warnings++; },
  });
  try {
    assert.equal(attachments, 1);
    assert.equal(db.pool.listenerCount("release"), 1);
    assert.deepEqual(db.status(), { max: 3, total: 0, idle: 0, waiting: 0 });
    assert.equal(db.pool.options.query_timeout, 12000);
    assert.equal(db.pool.options.statement_timeout, undefined);
    assert.equal(db.pool.options.options, "-c timezone=UTC");
    assert.equal(db.pool.options.idleTimeoutMillis, 5000);
    db.pool.emit("error", Error("private driver credentials"));
    assert.equal(warnings, 1);
  } finally { await db.pool.end(); }
});
