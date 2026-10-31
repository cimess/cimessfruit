# Redis caching: implementation and learning notes

## Ownership and current status

Vercel runs the API and cache client. Neon hosts PostgreSQL and Upstash Redis is the selected cache provider. The application integration is implemented; managed-service provisioning, live credentials, limits and connection-pool tuning are separate owner-operated tasks in [TASKS.md](TASKS.md). No index migration or server configuration was changed.

## What this fixes

Without a cache, every catalogue/zone request repeats the same PostgreSQL query. With cache-aside, a request looks in Redis first. On a miss it queries PostgreSQL and stores the result temporarily. Later matching requests can avoid that database query. Authentication/proxy checks still run; this does not eliminate all database work for signed-in traffic.

| Read | Cached data | Lifetime |
| --- | --- | --- |
| `GET /api/products` | Public matching products, keyed by validated category/fruit filter; sorting and cursor slicing follow the cache read | 30 seconds |
| `GET /api/products/[id]` | Available product with options | 30 seconds |
| `GET /api/delivery-zones` | Available zones ordered by name | 300 seconds |
| `POST /api/delivery-zones/resolve` | Available zones/boundaries ordered by ID, before point-in-polygon evaluation | 300 seconds |

Product list searches bypass the cache to avoid low-reuse search keys. All cursor batches and sorts reuse the matching public dataset; cursor values and batch sizes do not create extra cache entries. Invalid inputs are rejected before caching. Missing products are not cached. Entries above 256 KiB bypass storage. Upstash capacity, command limits and eviction behavior remain a separate setup step; TTLs alone are not a hard memory cap.

No profiles, coordinates, sessions, auth decisions, order responses or checkout eligibility results are cached. Admin catalogue reads bypass public caches. HTTP `Cache-Control: no-store` headers remain: Redis is a server-side data cache, not browser/CDN response caching. Direct database queries elsewhere in server-rendered pages are not automatically cached.

## Keeping it fresh

After successful database writes, the application changes the relevant cache generation:

- Product create/edit/archive: all product variants.
- Successful checkout reservation: products, because remaining stock changed.
- Cancellation/rejection: products, because reserved stock was returned.
- Reservation expiry: products after each committed maintenance batch.
- Catalogue seeding: products after its transaction commits.
- Admin zone save: both zone dataset variants.

A generation is a random version identifier included in cache keys. Changing it makes all old entries unreachable without scanning Redis. Old entries expire naturally. A read already in progress can only write to its old generation, so it cannot refill the new generation with old data. Evicting the generation metadata creates a new random generation, rather than reusing an old version.

This is best-effort invalidation, not a database/Redis distributed transaction. If Redis is unavailable during a write, the database write still succeeds. Previously cached data can remain stale until its TTL expires after Redis recovers. Checkout always rechecks current prices, stock, zone availability and coverage in PostgreSQL, inside the existing transaction where applicable. Direct SQL edits or external scripts also rely on TTL unless they use the same invalidation integration.

## Failure behavior

`server/cache/redis.ts` creates a lazy, reusable connection only when REDIS_URL is configured. Empty REDIS_URL disables caching completely. Commands have a 250 ms timeout and an outer 300 ms deadline; a read can issue multiple commands. After a connection/command failure, that process bypasses Redis for 10 seconds before trying again. Offline queues and automatic retries are disabled to avoid holding requests or replaying stale operations. Warnings are throttled and never print credentials.

Database errors still propagate normally. Cache errors cannot turn a successful database write into an API error. Matching cache misses coalesce within a single process; this is not a distributed stampede lock or a global connection limit. Vercel-wide connection management will be reviewed in the configuration stage.

## Activation later, one step at a time

The safe template is `api/.env.example`. Real values belong in Vercel's server-only environment settings and in the environment of any maintenance/seed job:

```dotenv
REDIS_URL="rediss://default:URL_ENCODED_PASSWORD@redis.example.com:6380/0"
REDIS_CACHE_PREFIX="cimessfruit:production"
```

The existing ioredis transport requires the Upstash TCP TLS URL from its connection panel; Upstash REST URL/token variables are not read by this client. The example host/port are placeholders. Use the actual TLS endpoint and a valid certificate; production rejects plaintext `redis://`. Do not disable certificate verification. Do not put these values in `NEXT_PUBLIC_*` or `EXPO_PUBLIC_*` variables. Use a different prefix per environment/database and the same prefix for every API instance and maintenance job accessing that environment. Redeploy after changing environment variables. Leaving REDIS_URL empty keeps existing database-backed behavior.

Neon/Upstash provisioning, capacity/eviction review, database connections and live Vercel environment values remain guided owner tasks. Oracle self-hosted memory tuning is superseded.

## Verification

- `npm test` from `api/` includes cache hit/miss, TTL, generation race, outage, oversized/null entry, filter isolation, admin bypass and post-commit invalidation tests.
- `npm run typecheck` and `npm run lint` validate the integration.
- An isolated local Redis smoke test verified real connection/read/write behavior, expiry, invalidation and fallback after Redis shutdown. It did not connect to Upstash.
- Live Upstash TLS, credentials and latency still require verification during activation.

Implementation references: [cache core](../api/server/cache/json-cache.ts), [Redis transport](../api/server/cache/redis.ts), [product handlers](../api/controllers/product-handlers.ts), [delivery zone service](../api/services/delivery-zones.ts).

References: [Redis cache-aside](https://redis.io/docs/latest/develop/use-cases/cache-aside/), [ioredis options](https://redis.github.io/ioredis/interfaces/CommonRedisOptions.html).
