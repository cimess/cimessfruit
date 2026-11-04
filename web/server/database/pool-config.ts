export type DatabasePoolConfig = {
  max: number;
  connectionTimeoutMillis: number;
  idleTimeoutMillis: number;
  statementTimeoutMillis: number;
  queryTimeoutMillis: number;
  transactionTimeoutMillis: number;
};

// Reject invalid limits at startup; errors never include a connection URL.
export function readDatabasePoolConfig(env: Record<string, string | undefined> = process.env): DatabasePoolConfig {
  function integer(name: string, fallback: number, min: number, max: number) {
    const raw = env[name]?.trim();
    if (!raw) return fallback;
    if (!/^\d+$/.test(raw)) throw Error(`Invalid ${name}: expected a whole number`);
    const value = Number(raw);
    if (!Number.isSafeInteger(value) || value < min || value > max) {
      throw Error(`Invalid ${name}: expected ${min}–${max}`);
    }
    return value;
  }
  const config = {
    max: integer("DB_POOL_MAX", 3, 1, 100),
    connectionTimeoutMillis: integer("DB_CONNECTION_TIMEOUT_MS", 5000, 100, 60000),
    idleTimeoutMillis: integer("DB_IDLE_TIMEOUT_MS", 5000, 100, 60000),
    statementTimeoutMillis: integer("DB_STATEMENT_TIMEOUT_MS", 10000, 100, 60000),
    queryTimeoutMillis: integer("DB_QUERY_TIMEOUT_MS", 12000, 200, 90000),
    transactionTimeoutMillis: integer("DB_TRANSACTION_TIMEOUT_MS", 5000, 100, 60000),
  };
  if (config.queryTimeoutMillis <= config.statementTimeoutMillis) {
    throw Error("DB_QUERY_TIMEOUT_MS must exceed DB_STATEMENT_TIMEOUT_MS");
  }
  return config;
}
