# Bounded runtime database pool

Implemented 28 October 2026. This follows the [pre-change capacity report](CAPACITY_AND_POOL_REPORT.md). It changes the API application's Prisma runtime; migration, seed and maintenance CLI clients retain their existing independent configurations. Existing environment files, database roles and database-wide settings were not edited.

## Defaults and effects

| Server-only variable | Default | Effect |
| --- | ---: | --- |
| DB_POOL_MAX | 3 | Maximum clients in each independent runtime pool, not a deployment-wide cap |
| DB_CONNECTION_TIMEOUT_MS | 5000 | Driver wait for connection establishment/acquisition; also Prisma interactive maxWait |
| DB_IDLE_TIMEOUT_MS | 5000 | Retire unused clients after five idle seconds |
| DB_STATEMENT_TIMEOUT_MS | 10000 | PostgreSQL statement cancellation budget, applied with SET LOCAL |
| DB_QUERY_TIMEOUT_MS | 12000 | Driver response deadline as a fallback; must exceed SQL timeout |
| DB_TRANSACTION_TIMEOUT_MS | 5000 | Prisma interactive transaction duration, preserving the previous duration default |

Unset/blank variables use these defaults. Invalid, fractional, negative, zero or out-of-range limits fail configuration validation before a pool is created. The client deadline must be greater than the SQL budget. These are different scopes, not one guaranteed whole-request timeout: connection wait, statement execution, transaction expiry and rollback/network cleanup can contribute separately.

The interactive transaction acquisition default changes from Prisma's implicit two seconds to the configured connection budget (five seconds), while duration remains five seconds. Existing Serializable transaction choices remain unchanged. No automatic retry of writes was introduced; a lost response around commit still requires deliberate reconciliation/idempotency.

## Pool reuse and lifecycle

`server/database/runtime-client.ts` creates one pg Pool, passes it to Prisma and registers the lifecycle callback. The server entry point calls `attachDatabasePool` from `@vercel/functions` 3.10.4 once for a newly created pool. Development caches the pair on globalThis; warm production modules reuse their module instance. Each additional independently initialized module/process can still own another pool.

The helper registers pool release handling so Vercel can give idle connections time to retire before suspension. It is not a shared global connection cap or an active-transaction cancellation mechanism. Vercel suspension itself has not been reproduced locally. [Vercel pool lifecycle reference](https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package).

Idle connection errors have a listener with a generic warning; no connection URL/query parameters are logged by that listener. The internal status function returns only `{ max, total, idle, waiting }`; no public metrics endpoint was added. Prisma disconnect disposes this externally supplied pool, but the application never disconnects it at the end of each request.

Restart the local dev server after adopting these changes or changing DB_* variables. A previously loaded Prisma instance/pool can otherwise survive development reloads. Hosted changes require redeployment. This implementation does not edit real environment credentials or activate Neon/Upstash.

## Why SQL timeout is not a startup parameter

Neon's transaction pooler does not accept arbitrary PostgreSQL startup parameters, including statement_timeout. Setting the pg startup option directly would break that connection path. [Neon startup-parameter compatibility](https://neon.com/docs/connect/connection-errors).

The bounded Prisma adapter instead executes ordinary operations as:

```text
acquire connection → BEGIN → SET LOCAL statement_timeout → statement → COMMIT → release
```

An error triggers ROLLBACK and release. Existing Prisma interactive/batch transactions retain their connection and isolation; the adapter initializes SET LOCAL once at their start. Their later statements do not escape into separate transactions. Commit/rollback ownership is important: Prisma's pg transaction callbacks release the client, while its engine normally issues the SQL transaction commands. The adapter explicitly issues those commands only for the short transactions it creates itself.

SET LOCAL resets at transaction end, so a reused backend does not inherit this timeout. This behavior was tested against direct local PostgreSQL. Actual Neon/PgBouncer behavior remains in the deployment retest checklist. The previous UTC startup option is retained; unlike statement_timeout, timezone is among Neon's supported tracked startup parameters.

This policy covers runtime Prisma queryRaw/executeRaw operations and existing Prisma-managed transactions. The adapter's migration-script API is not used by this runtime policy; Prisma CLI migrations use their separate configuration. Direct use of the exposed raw pg Pool would bypass the server-side statement wrapper and should be limited to lifecycle/status/testing internals.

## Client fallback versus server cancellation

The pg query_timeout provides a second response deadline if a network/backend failure prevents delivery of the server's timeout result. It does not itself prove that SQL was canceled on a remote server. Normal Prisma queries have the transaction-local server limit as well. A failing raw pool query discards its client; a later request can reconnect. [node-postgres timeout options](https://node-postgres.com/apis/client).

Catalogue, admin order and inbox handlers recognize nested Prisma/driver timeout/availability errors and return a private 503 response with a short Retry-After header. Validation errors, missing records and ordinary concurrency conflicts retain their existing mappings. Other auth/proxy/recovery paths keep their existing error handling. Driver details and credentials are not returned to clients.

## Local verification

The regular suite passes **100 tests**, with **13 opt-in/database tests skipped**. Six of those skipped tests were then run explicitly against the configured local database and all six passed:

1. PostgreSQL canceled a short sleep with code 57014 and a subsequent query succeeded.
2. Ordinary, interactive and batch transactions committed/rolled back correctly against a session-temporary fixture.
3. A timed-out interactive transaction rolled back its temporary writes.
4. Saturated pool acquisition timed out and recovered after a slot was released.
5. The client fallback discarded a stalled raw-pool connection and reconnected.
6. Idle clients retired and a later query reconnected.

Temporary fixture tables disappeared when their sessions closed. No existing business records were changed. Unit tests also verify configuration validation, lifecycle attachment, private error responses and 503 handling in the primary list handlers. SQL timeout state was checked before/after reuse to verify SET LOCAL did not leak.

TypeScript, ESLint and the production Next.js build pass. The interactive rollback test also verifies that Serializable isolation reaches PostgreSQL unchanged.

Run locally:

```sh
npm test
npm run test:pool:local
```

The explicit local tests reject non-local database hosts. They execute short sleeps, connection waits and temporary fixture writes; they do not require a disposable copy of business tables. Broader existing integration tests still require TEST_DATABASE_URL and were not activated by this change.

## Measured overhead

[RUNTIME_POOL_VERIFICATION.json](RUNTIME_POOL_VERIFICATION.json) compares the old adapter and bounded adapter using the same pool limit of three and the same warmed mixed read workload. Each scenario completes 64 operations; all **384 operations** succeeded.

| Concurrency | Previous p95 | Bounded p95 |
| ---: | ---: | ---: |
| 1 | 3.94 ms | 4.74 ms |
| 8 | 13.81 ms | 17.56 ms |
| 16 | 20.79 ms | 31.04 ms |

Extra transaction messages have a real cost. These are small-dataset local observations, not a speed improvement, service capacity guarantee or prediction of cloud overhead. In the cloud, network round trips can increase the cost further. Private requests can also execute auth queries outside this measured handler workload. Public Redis hits can reduce catalogue SQL but do not replace checkout/auth validation.

The runtime pool finished with three idle clients and zero waiters, then was explicitly disposed by the verifier. Vercel lifecycle registration was tested separately; this comparative read test does not simulate function suspension.

Repeat this comparison with:

```sh
node --import tsx scripts/check-runtime-pool.ts ../architecture/RUNTIME_POOL_VERIFICATION.json
```

The script refuses remote hosts and applies a read-only flag to its own test connections. It never rewrites the historical baseline report/results.

## Tuning and rollback

The defaults are initial bounds, not proven Neon optima. If measured queueing dominates and the deployment-wide connection budget allows it, compare DB_POOL_MAX=5 with 3; do not assume Vercel's instance count is fixed. Test cold database activation before shortening acquisition waits. Keep client and SQL timeout ordering valid when adjusting them. Maintenance jobs have different duration needs and do not inherit this runtime policy.

Changing DB_* variables back to documented defaults and restarting returns to this bounded configuration. To restore pre-change unbounded behavior, revert the runtime pool/adapter integration and dependency changes; setting zero is deliberately rejected. Retain the benchmark artifacts to compare both versions. No database migration or role/server configuration rollback is necessary.

Remaining deployment checks: actual Neon pooled connectivity/UTC behavior, function suspension cleanup, cold starts, network failure handling, end-to-end checkout/auth flows, per-instance connection multiplication and latency/usage overhead. Those remain pending in TASKS.md rather than being claimed from local results.
