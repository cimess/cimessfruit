# DeliveryZone and remaining index coverage

Reviewed 2026-10-28 against local code, schema, migrations and PostgreSQL index metadata. Benchmarks used a read-only transaction; no zone records, indexes or migrations were changed.

## 1. Start with the query

| Path | Database work | Existing support |
| --- | --- | --- |
| Checkout, profile and signup validation | One zone by ID | DeliveryZone primary key |
| Public zone list | Available zones sorted by name | Small-table scan/sort; reusable dataset cached for 300 seconds |
| Map resolution | Available zones sorted by ID, followed by application polygon checks | Primary key exists; planner may prefer a scan for the whole small dataset |
| Admin zone list | All zones sorted by name | Small-table scan/sort |
| Checkout settings/default zone | Available zones ordered by ID | Primary key exists; actual plan depends on table size and limit |

Public cached datasets are not checkout authority. Order creation reads the selected zone directly inside its transaction and checks current availability, price and coordinate coverage. User coordinates, sessions and checkout eligibility are not cached.

## 2. Inspect existing indexes before proposing another

The live local database has **one zone**, available and with a boundary, and the unique `DeliveryZone_pkey` index on ID. `@id` already created that index; a second ID index would duplicate it.

An availability flag alone partitions rows into only two values. It is not automatically a useful extra index, particularly on one row. Availability/name combinations are candidates only if future query plans and realistic zone counts show enough work to justify them.

The polygon boundary is JSON read into application code. Its containment calculation happens in `containsPoint`, not a SQL spatial/filter operation. Adding an ordinary JSON/name/availability index cannot accelerate that JavaScript calculation. A larger geographic dataset would require its own measured spatial-query design.

## 3. Measure the reads locally

Thirty warmed SQL round trips per query, with rotated query order:

| Query | Median round trip | 95th percentile | EXPLAIN execution |
| --- | ---: | ---: | ---: |
| Checkout by ID | 0.221 ms | 0.410 ms | 0.009 ms |
| Available, ordered by name | 0.196 ms | 0.372 ms | 0.015 ms |
| Available, ordered by ID | 0.193 ms | 0.458 ms | 0.011 ms |
| Admin, ordered by name | 0.183 ms | 0.428 ms | 0.009 ms |
| Available, ordered by name then ID | 0.192 ms | 0.463 ms | 0.010 ms |

Checkout used `DeliveryZone_pkey`. List queries scanned one row and sorted in 25 kB; all plans reported shared-buffer hits with no disk reads. Round-trip figures include local client/protocol overhead; EXPLAIN execution measures server execution. Neither includes HTTP/auth, Redis, polygon computation or cloud latency. At one zone these are baseline observations, not scalability or speed-improvement claims.

Repeat with `npm run bench:delivery` from `api/`. The script refuses non-local DATABASE_URL hosts and outputs aggregate counts, safe plan metadata and index definitions rather than zone boundaries or credentials.

## 4. Make only the justified change

The public and admin name-sorted lists now use `ORDER BY name ASC, id ASC`. ID provides consistent ordering when two zones have the same name. ID-sorted map/default reads retain their existing order. No new index, cache policy, delivery fee or checkout rule was introduced. The cache test verifies available-only predicates, ordering variants and invalidation.

## 5. Check remaining table coverage

The following indexes were confirmed in both schema and local PostgreSQL metadata:

| Table | Existing keys/indexes relevant to current operations |
| --- | --- |
| ProductOption | Primary-key option lookup; unique `(productId, size)` also begins with productId for loading a product's options |
| Account | Unique `(provider, providerAccountId)` for OAuth lookup; userId for account lookup/cascade |
| Session | Unique sessionToken for authentication/logout; userId for revocation; expires for cleanup |
| VerificationToken | Unique token for redemption; unique `(identifier, token)` begins with identifier for exact cleanup; expires for expiry cleanup |
| MobileAuthGrant | Primary-key codeHash for redemption; userId for revocation; expires for cleanup |
| AuthRateLimit | Primary-key key for upsert; expires for cleanup |

This confirms relevant access paths exist; it does not prove every query avoids scans. Product option price sorting handles at most three options per current product schema validation and does not justify another sorting index from the current data.

Conditional follow-ups remain separate: large-volume expiry cleanup, prefix-based verification-token cleanup during account deletion (collation/operator behavior needs a representative plan), and the rare active-admin count. No speculative index was added for those paths. Earlier reviews separately cover Product, Order/Payment, Conversation and User email.

## Verification and next step

TypeScript and ESLint pass. The API suite reports **96 passed, 7 database integration tests skipped** without TEST_DATABASE_URL. Existing tests cover zone cache hits/invalidation, fee/availability guards and polygon inside/outside/edge behavior. Local metadata inspection confirmed the expiry and revocation indexes introduced earlier; no maintenance deletion was executed for this review.

The current coverage review is complete. Representative-volume performance checks and browser/device checks remain follow-ups. Next is a local configuration baseline and application connection-pool review; managed Neon/Upstash activation stays deferred per the owner's instruction.
