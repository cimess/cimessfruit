# API code organization

The `api` package currently contains both the Next.js web application and its backend. Directory separation does not create a separately deployed API.

| Directory | Responsibility |
| --- | --- |
| `app/api` | Next.js route entry points; preserve existing public URLs |
| `controllers` | Request handlers: authentication/authorization, validation, HTTP responses and existing transactional workflows |
| `services` | Business operations such as basket eligibility and reservation expiry |
| `server/composition` | Wire handler factories to database, authentication and email dependencies |
| `server/auth` | Session resolution, credentials, request guards and authentication rate limiting |
| `server/database` | Prisma client infrastructure |
| `server/cache` | Optional Redis transport and cache-aside infrastructure |
| `server/email` | Transactional email transport |
| `validation` | Shared Zod request/data schemas, including those used by browser forms |
| `domain` | Shared domain types and pure rules; no database or framework dependencies |
| `lib` | Remaining catalogue, image, form, cart and legal helpers |
| `prisma` | Database schema and migrations |

Controllers still contain some business workflows. Extract those into services when changing those workflows; do not create thin repository wrappers merely to rename Prisma methods. Keep transaction boundaries intact. Browser-imported schemas and domain helpers must not import server infrastructure.

## Selected Vercel / Neon / Upstash boundary

Decision updated 2026-10-28: Vercel hosts the Next.js web application, API, authentication and business services. Neon hosts PostgreSQL; Upstash Redis provides disposable server-side caching. Oracle VM hosting is no longer selected.

```text
Browser / mobile
       |
       v
Vercel: Next.js web UI, API, authentication and business services
       |                                |
       | TLS                            | TLS
       v                                v
Neon PostgreSQL                    Upstash Redis
(pooled application endpoint)      (disposable cache)
```

Use Neon's pooled connection string as server-only `DATABASE_URL`. Use its direct connection string as `DATABASE_URL_UNPOOLED` for Prisma CLI migrations and schema inspection. `prisma.config.ts` prefers the unpooled URL and falls back to `DATABASE_URL` for local development. Provision separate development/preview databases or branches rather than pointing every deployment at production. Existing migrations and PostgreSQL transactions remain applicable; no database schema rewrite is required.

The current application uses Prisma's `@prisma/adapter-pg` TCP adapter. Confirm TLS, pooled endpoint compatibility, UTC behavior, bounded pool size and Vercel connection lifecycle against the actual Neon project before deployment. Neon's Prisma guide also documents the optional Neon serverless adapter; changing drivers is a separate decision, not a prerequisite assumed by this plan. Keep Auth.js, server-rendered queries and route handlers on Vercel.

The cache currently uses `ioredis` and therefore needs Upstash's TLS TCP connection string (`rediss://`) in server-only `REDIS_URL`. Vercel integration variables for the Upstash REST API alone do not configure this TCP client. A REST-only configuration would require a transport change. Verify cache hit/miss, mutation invalidation, expiry, outage fallback and the existing 250/300 ms deadlines from the deployed Vercel region. No live connection or credential setup has been verified.

Choose compatible nearby Vercel, Neon and Upstash regions. Review Neon compute/storage/connection limits, suspend/resume latency and backup/restore policy, plus Upstash command/data/connection limits and eviction behavior. Managed services replace Oracle OS, PostgreSQL shared-memory and Redis maxmemory tuning; application queries, indexes, request volume and connection management still need measurement. Never cache private orders, session validity, roles or checkout eligibility as a side effect.

Schedule maintenance explicitly and apply migrations deliberately. Benchmark both database execution (`EXPLAIN (ANALYZE, BUFFERS)`) and the Vercel API path, separating cold activation, cache misses and warm requests. Moving providers does not verify previously proposed indexes automatically.

References: [Neon Prisma connections](https://neon.com/docs/guides/prisma), [Prisma pooled runtime/direct CLI configuration](https://www.prisma.io/docs/orm/prisma-client/setup-and-configuration/databases-connections), [Upstash TLS TCP configuration](https://upstash.com/docs/redis/troubleshooting/econn_reset).

## Profile reads and indexes

Email identity uses one canonical trim/validate/lowercase rule across application writes and lookups; exact email equality uses the existing unique email index. See [EMAIL_IDENTITY.md](EMAIL_IDENTITY.md) for the implementation, local audit and import prerequisites. No new email index or database normalization constraint was added.

Profile reads use the `User` primary key. Do not add Redis solely for settings navigation. Mobile already retains the profile in its user store; it needs a deliberate revalidation policy to notice edits from another device. Keep profile responses private and avoid caching session validity or roles as a side effect.

The following indexes are present in schema and local migration files; their application on Neon and live query plans remain unverified:

- `VerificationToken(expires)`: supports maintenance deletion of expired verification/reset/deletion credentials. The existing token and identifier indexes support lookup/consumption, not expiry range selection. Expiration checks remain necessary even when maintenance has not run.
- `MobileAuthGrant(userId)`: supports revoking every outstanding browser-to-mobile handoff grant for an account during password reset and account deletion. These grants are not mobile sessions; session revocation is separate and already has `Session(userId)`. The existing grant `expires` index supports scheduled expiration, not account-specific deletion.

For a small table PostgreSQL may correctly prefer a sequential scan even after adding an index. Validate with representative query plans and table sizes before claiming a latency improvement.

See [REDIS.md](REDIS.md) for the implemented caching behavior and [TASKS.md](TASKS.md) for guided indexing/configuration work.
