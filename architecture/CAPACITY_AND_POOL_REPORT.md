# Local baseline, connection pools, and smaller-host comparison

**Date:** 28 October 2026. **Status:** measured local baseline and configuration review complete; runtime tuning and deployed validation pending.

**Subsequent implementation:** the bounded runtime pool was implemented later on the same date. This report and its measurements remain the pre-change baseline. See [DATABASE_POOL.md](DATABASE_POOL.md) for applied settings, verification and measured overhead; deployed validation remains pending.

## Assessment

The current small dataset is inexpensive to read locally. That does **not** prove a maximum customer count, that the application fits a 1 GB host, or that Vercel/Neon will reproduce the same latency. The most actionable findings are unbounded ordinary database waits, connection multiplication across application instances, CPU-heavy password checks, and recurring polling that can consume managed-service allowances even when little data changes.

Keep the selected separation: Vercel executes the application, Neon executes SQL, and Upstash holds disposable cache data. These have independent CPU, memory and usage budgets. Do not treat them as one 1 GB machine or add their memory together as interchangeable application memory.

No application pool settings, database-wide settings, schema, indexes, credentials or existing business data were changed for this report. New code is a repeatable local benchmark script. All database workloads were reads; timeout controls applied only to disposable probe connections.

## 1. What was measured

The benchmark used the configured **local** database and refused non-local hosts. It combined actual product-list handler reads, admin order-list reads, admin inbox reads and uncached available-zone reads. This exercises the Prisma/pg adapter and related-row queries; it does not run a complete HTTP server, authentication proxy or browser session.

For each pool limit of 1, 3, 5 and 10 connections, it ran 64 mixed operations at concurrency 1, 4, 8 and 16: **1,024 operations total**, with no errors. Connections and query paths were warmed before timing. Pool sizes were tested sequentially, not randomized; caching, JIT, GC and other laptop activity can affect comparisons. These short bursts are not sustained-load or saturation-capacity tests.

Separate probes measured 32 artificial 20 ms SQL sleeps with 16 workers, pool acquisition timeout behavior, server-side statement cancellation and bcrypt cost-12 checks. The artificial sleeps demonstrate queueing; they do **not** simulate slower CPU, scarce RAM, real network latency or Neon.

Raw aggregate results: [LOCAL_POOL_BASELINE.json](LOCAL_POOL_BASELINE.json). No emails, passwords, session tokens, customer rows or connection URLs are included.

### Local host and database

| Observation | Measured value | Interpretation |
| --- | --- | --- |
| CPU | Intel i7-8665U; 8 logical CPUs, 4 physical cores | “Eight-core” here means eight hardware threads, not eight independent physical cores |
| OS-visible RAM | 15,762 MiB, about 15.4 GiB | Consistent with a marketed 16 GB laptop |
| Available RAM at end | 6,331 MiB | Snapshot after existing desktop/app use; not RAM reserved for this project |
| Swap | 4,096 MiB configured | Not equivalent to RAM or an allowance guaranteed on hosted services |
| End load average | 1.09 / 0.74 / 0.70 | System-wide snapshot, not an application CPU profile |
| PostgreSQL | 16.15 | Local server, not a Neon instance |
| Database size | 8,879,127 bytes, about 8.47 MiB | Physical local database measurement; not an exact managed storage-billing measurement |
| Dataset | 14 products, 3 options, 2 orders, 3 order items, 2 payments, 1 conversation, 1 message, 1 zone | Too small for scaling conclusions; 14 products do not mean 14 fully populated products with options |
| Initial visible database sessions | One active session: the observer itself | Snapshot, not proof of real app connection demand |

The metadata snapshot reported no cumulative temporary-file use or deadlocks. These counters are historical, not measurements attributable exclusively to this run. The observer's own memory contexts allocated about 1.97 MiB; that excludes other backend/process/shared memory and must not be multiplied into a server capacity estimate.

The probe's process peak RSS reached **337.3 MiB**. This includes the benchmark's TypeScript/Prisma runtime, multiple sequential scenarios and V8 behavior. It excludes the full Next.js server, other application instances and PostgreSQL process memory. It does not establish the app's production memory requirement or total system fit.

## 2. Current connection behavior: what the code actually does

[prisma.ts](../api/server/database/prisma.ts) passes DATABASE_URL and a UTC startup option into `PrismaPg`. It does not explicitly configure pool size, connection timeout, query timeout or idle timeout.

Inspection of the installed adapter shows that it creates a node-postgres Pool from those options. Inspection of the installed driver's defaults confirms:

| Control | Current value | Meaning |
| --- | ---: | --- |
| Maximum connections per pool | 10 | Limit per independent pool, not per project |
| Idle connection timeout | 10,000 ms | Retires idle connections when the process can run its timers |
| Connection/acquisition timeout | 0 | No configured driver timeout for establishing/acquiring a connection |
| Ordinary SQL statement timeout | 0 locally | No local server time limit for an ordinary statement |
| Local lock timeout | 0 | No separate configured lock-wait cap |
| Local idle-in-transaction timeout | 0 | No configured server cleanup cap for an abandoned idle transaction |

These are different controls. An idle timeout does not bound how long a busy request waits. The driver's pool API documents the distinction between pool size, idle retirement and connection acquisition. [node-postgres Pool reference](https://node-postgres.com/apis/pool).

Interactive Prisma transactions are a separate case: their documented defaults are a 2-second acquisition wait and 5-second transaction duration unless overridden. Some existing operations request Serializable isolation, and benchmark scripts override transaction limits for their own purposes. Do not describe every database operation as unbounded, or assume those interactive limits protect ordinary list queries. [Prisma transaction options](https://docs.prisma.io/docs/orm/v7/prisma-client/queries/transactions).

Development caches Prisma on globalThis to survive reloads. Production relies on module reuse for a warm loaded module; it does not intentionally create a new client inside every request. However, separate Vercel instances or independently loaded bundles can own separate pools. CLI maintenance/seeding also create their own clients.

There is currently no `attachDatabasePool` lifecycle integration. Vercel recommends attaching an application-owned pool so its idle connections can be managed around function suspension. Adding this would require exposing a shared pg Pool to `PrismaPg`, installing the helper and verifying disposal behavior—not merely inserting a call on the Prisma object. [Vercel pooling guidance](https://vercel.com/kb/guide/connection-pooling-with-functions).

### Connection multiplication

The following is arithmetic illustrating potential client connections, not a prediction of Vercel's instance count:

| Independent pools | Current max 10 each | Candidate max 3 each |
| ---: | ---: | ---: |
| 1 | 10 | 3 |
| 5 | 50 | 15 |
| 20 | 200 | 60 |
| 50 | 500 | 150 |

The local database allows 100 connections, with 3 superuser-reserved slots and no additional reserved slots. Ordinary workloads cannot assume all 100 are available; operational tools and other applications need headroom too. A pooler accepts/multiplexes clients but does not turn all client connections into simultaneous CPU execution.

Neon's published PgBouncer configuration accepts up to 10,000 clients; backend capacity remains dependent on compute configuration and pool limits, and queued requests can wait up to 120 seconds in its queue. That client ceiling is not a safe target or a promise of 10,000 fast queries at once. Application timeouts and smaller pools still matter. We did not connect to Neon to inspect its actual limits. [Neon pooling limits](https://neon.com/docs/connect/connection-pooling).

## 3. Mixed-read results

Each cell below is **p95 operation latency in milliseconds**, with 64 operations per scenario. “Operation” may execute more than one SQL query, so it is not synonymous with one active connection.

| Pool maximum | Concurrency 1 | Concurrency 4 | Concurrency 8 | Concurrency 16 |
| ---: | ---: | ---: | ---: | ---: |
| 1 | 3.04 | 5.60 | 11.51 | 17.80 |
| 3 | 2.16 | 3.88 | 8.03 | 14.71 |
| 5 | 1.88 | 3.70 | 7.49 | 14.70 |
| 10 | 2.32 | 4.27 | 9.60 | 10.98 |

There is no universal winner. A small pool was sufficient for these tiny reads, while the pool of 10 had the lowest observed p95 at concurrency 16 in this run. This does not justify choosing 10 across a serverless deployment: aggregate connection pressure is missing from a single-process benchmark. Nor does it prove 3 is optimal. A limit of 3 is a conservative candidate to compare with 5 under more representative traffic.

Sampled waiting counts can exceed operation concurrency because related-row work can request multiple connections per operation. They are brief sampled observations, not queue-length service guarantees. The report deliberately avoids converting burst completions per second into a supported customer count.

### Why a pool of one is not automatically safer overall

In the artificial test, each task held a connection for about 20 ms. No CPU-intensive SQL was performed:

| Pool maximum | Workers / operations | p95 pool wait | p95 total task latency |
| ---: | --- | ---: | ---: |
| 1 | 16 / 32 | 308.93 ms | 329.63 ms |
| 3 | 16 / 32 | 102.80 ms | 123.52 ms |
| 5 | 16 / 32 | 61.64 ms | 82.28 ms |
| 10 | 16 / 32 | 21.11 ms | 41.67 ms |

A very small pool protects the database but can create long application queues. Increasing it helps when requests wait on available database capacity; it can make things worse when the database is already CPU/memory-bound. This demonstration isolates queueing, not those resource bottlenecks.

## 4. Timeout findings

With the only connection held for 250 ms:

- Driver timeout disabled: the queued acquisition succeeded after approximately **250.77 ms**, when the slot was released. There was no configured acquisition deadline.
- Driver timeout set to 100 ms for the probe: it failed after approximately **99.84 ms**, before that slot became free.

For a 250 ms SQL sleep:

- Statement timeout disabled in the probe session: completed in **251.24 ms**.
- Statement timeout 100 ms in the probe session: PostgreSQL canceled it after **100.81 ms**, returning code **57014**.

These short demonstrations verify that the controls work; 100 ms is intentionally a test value, **not a recommended production timeout**. Client timeout, server cancellation, transaction timeout and HTTP duration limit have different scopes. A platform duration ceiling is not a substitute for SQL cancellation and a bounded acquisition wait.

The normal benchmark pools used 3-second connection acquisition and 2-second session statement safety limits; these did not change the application's current settings. The initial observer excluded that statement override to inspect actual local role/database timeout defaults.

## 5. CPU result: password login deserves its own budget

The project uses bcryptjs with cost 12. The probe compared a synthetic password against a synthetic hash, without creating accounts or sessions:

| Concurrent comparisons | Samples | Median comparison latency | p95 comparison latency | Batch elapsed |
| ---: | ---: | ---: | ---: | ---: |
| 1 | 8 | 339.44 ms | 344.79 ms | 2,727.57 ms |
| 4 | 8 | 1,361.02 ms | 1,361.96 ms | 2,723.67 ms |
| 8 | 8 | 2,322.60 ms | 2,726.51 ms | 2,726.75 ms |

Process CPU time was approximately equal to batch wall time, consistent with roughly one fully occupied logical CPU for this single Node process. The async bcryptjs API yields between chunks but does not automatically distribute those comparisons across all eight laptop threads. Higher concurrency increased individual latency rather than increasing this batch's throughput.

This CPU work belongs to **Vercel**, not Neon. Multiplying these login times by Neon's 0.25 CU CPU fraction would be incorrect. Vercel CPUs also differ from this laptop in architecture, clock, scheduling and contention. Keep password strength, generic failures and rate limits; do not reduce bcrypt cost merely to improve these numbers. Profile end-to-end login and signup separately before changing implementation or worker/concurrency strategy.

## 6. Comparison: laptop, 1 GB host, Vercel and Neon

Provider specifications below were checked against public documentation on the report date; the actual user's hosted projects/settings were not inspected.

| Environment | CPU/RAM framing | What runs there | What this report can conclude |
| --- | --- | --- | --- |
| Current laptop | 4 physical cores / 8 threads; about 15.4 GiB OS-visible RAM | Local DB, tools and application development share the host | Only this environment was measured |
| Hypothetical 1 GB low-CPU VM | 1 GB total host RAM; CPU could mean a fractional allocation or one vCPU | OS + PostgreSQL + Redis, if following the older data-services VM design | Much less memory headroom; no measured latency/capacity result |
| Neon at 0.25 CU | About 0.25 vCPU and 1 GB RAM | Database compute only | Useful low-resource comparison, not a laptop benchmark multiplier |
| Neon Free with scaling | Can scale up to 2 CU, approximately 8 GB RAM | Database compute; usage allowance still applies | Free does not mean permanently fixed at 1 GB |
| Vercel Hobby with Fluid compute | 1 vCPU / 2 GB per standard function instance | Node/Next.js, auth, rendering and API logic | Distinct memory/CPU budget from the database |
| Upstash | Separately managed cache capacity/quotas | Cached public datasets | Its memory is not inside Neon or a Vercel instance |

Vercel's standard function allocation is documented independently of monthly usage allowances. Multiple requests may share an instance; multiple instances each have their own resource and connection behavior. [Vercel function limits](https://vercel.com/docs/functions/limitations). Neon's CU mapping and scaling model are described in its [compute explanation](https://neon.com/blog/new-usage-based-pricing) and [plan table](https://neon.com/docs/introduction/plans).

### What changes on a 1 GB database or VM

- Less room for PostgreSQL buffers, per-query work, per-backend state and filesystem cache. A dataset that remains hot on the laptop may require more reads under pressure.
- More CPU contention can slow parsing, joins, sorting, transaction coordination and concurrent work. The amount depends on the workload; it is not a fixed “four times slower” rule.
- Managed Neon compute and a 1 GB VM are not identical: the latter also needs its OS and any colocated Redis/other services. Neon has a different storage/compute architecture and managed resource policies.
- Sharing a cloud region helps distance, but does not eliminate TLS, network trips, pooler queueing, database resume time or provider resource limits.

No constrained PostgreSQL run was performed: the local Docker daemon denied access even outside the sandbox. Changing only the benchmark client's CPU affinity or JavaScript heap would not constrain the PostgreSQL server, so that was not presented as a 1 GB test. Host PostgreSQL/desktop resource limits were not altered.

### Local memory settings: why copying them is not a sizing method

| Local setting | Value | What it does and does not mean |
| --- | ---: | --- |
| shared_buffers | 128 MiB | Shared PostgreSQL cache allocation; not total PostgreSQL memory |
| work_mem | 4 MiB | Base budget for individual sort/hash operations; not a per-server total |
| maintenance_work_mem | 64 MiB | Maintenance operation budget, with separate worker considerations |
| effective_cache_size | 4 GiB | Planner estimate, not 4 GiB of newly allocated memory |
| max_connections | 100 | Connection slots, not 100 operations guaranteed to fit or run quickly |

Illustration: 10 concurrent queries × 2 sort operations × 4 MiB = **80 MiB** for those sorts alone; 100 such queries would allow **800 MiB**, before shared buffers, backend state, OS and other services. These are hypothetical operation budgets, not observed allocations. Hash multipliers and parallel workers can increase work memory further. PostgreSQL documents the per-operation/per-worker nature of these settings. [PostgreSQL resource settings](https://www.postgresql.org/docs/16/runtime-config-resource.html). The planner-only meaning of effective_cache_size is documented in the [PostgreSQL operations reference](https://wiki.postgresql.org/wiki/Operations_cheat_sheet).

Do not automatically transplant local memory settings to Neon. Review managed compute metrics and supported settings first. This report makes no server memory-setting change.

## 7. Free-tier allowances can matter before raw query speed

Neon's current Free allowance includes **100 CU-hours per project/month**, **1 GB of database storage per project**, and **5 GB public transfer per project/month**. The 1 GB storage cap is disk data, not RAM. Its compute suspends after five idle minutes; active-query patterns affect whether it can sleep. [Neon plans](https://neon.com/docs/introduction/plans), [compute lifecycle](https://neon.com/docs/introduction/compute-lifecycle).

Derived arithmetic, not usage predictions:

- At a constant 0.25 CU, 100 CU-hours permits about **400 active hours**.
- At 2 CU, the same allowance permits **50 active hours**.
- Continuously active at 0.25 CU for a 30-day month uses **180 CU-hours**. Free is therefore not an unlimited always-on database allocation.

Existing private order polling can prevent five-minute inactivity while an app remains active: one 15-second loop makes 240 requests/hour. It is not appropriate to assume those reads are free simply because they are fast. Public Redis hits also do not guarantee every request avoids SQL: authenticated session resolution can read PostgreSQL independently of catalogue caching.

Vercel documents Hobby allowances including **4 active CPU-hours**, **360 provisioned-memory GB-hours** and **1 million function invocations**. Waiting on I/O does not consume active CPU time, but provisioned instance memory remains metered while requests are in flight; concurrent requests may share that instance. [Vercel Fluid pricing](https://vercel.com/docs/functions/usage-and-pricing).

For an illustrative continuously occupied 2 GB instance, 360 GB-hours corresponds to 180 hours. This is not a per-customer calculation: sharing and suspension affect actual usage. It is one reason an always-open SSE design needs a usage comparison rather than an assumption that it is cheaper than polling.

Plan suitability also matters: Vercel states that Hobby is restricted to non-commercial personal use. A commercial fruit shop should use an eligible plan; free-tier resource estimates are still useful for development comparisons. [Vercel Hobby terms](https://vercel.com/docs/plans/hobby).

## 8. Recommended next changes, in order — not yet applied

The safest first implementation is application connection control, not speculative PostgreSQL memory tuning.

| Proposed step | Current | Candidate / verification | Tradeoff and rollback |
| --- | --- | --- | --- |
| Explicit pg pool maximum | Implicit 10 | Start comparison with 3 per independent pool; test 5 if waits dominate | Fewer backend/client connections, potentially longer queues. Remove max to restore driver default 10 |
| Bounded connection acquisition | 0 | Test 5,000 ms, including cold compute activation once hosted tests are allowed | Fails promptly instead of waiting indefinitely; a too-short value rejects healthy cold starts. Remove override to restore current 0 |
| Idle pool lifecycle | Driver idle 10 seconds; no Vercel helper | Shared external pg Pool + lifecycle integration, tested in preview | Avoids relying solely on timers during suspension. Revert shared-pool/helper changes together |
| Server query cancellation policy | Local statement_timeout 0 | Evaluate a 10-second ordinary-query cap separately from transaction/lock policy | Stops runaway work but may cancel legitimate maintenance. Scope appropriately; restore prior session/role setting to roll back |
| Private polling | Several separate timers | Consolidate ownership, stop inactive screens, deduplicate concurrent refreshes | Reduces redundant DB/HTTP work; preserve deliberate refresh and error recovery |
| SSE | Planned, absent | Pilot only after comparing connection/memory usage and reconnect recovery | Less repeated payload, but longer-lived function requests and messaging lifecycle |

The values above are starting experiments, not proven Neon optima or settings already applied. Before adopting server/startup options through a transaction pooler, verify compatibility and scope, including the existing UTC startup option. Keep pooled runtime and direct migration URLs separate. Do not call Prisma disconnect after every request or change interactive transaction limits blindly to accommodate all other timeout settings.

Acceptance criteria for the next implementation: queue wait/timeout counts observable, pools reused and bounded per instance, no connection leaks after errors, cold/warm behavior distinguished, checkout transaction integrity preserved, clear retryable errors, and a rollback demonstrated locally. A short read benchmark cannot establish write-contention behavior.

## 9. What is still unmeasured

- Actual application memory peaks and CPU under a production Next.js build.
- Whole HTTP request latency including proxy/session reads, serialization, TLS and clients.
- Sustained concurrent checkout/payment writes, locks, retries and vacuum work.
- Larger catalogues, order histories and geographic datasets with realistic option counts.
- A genuinely constrained PostgreSQL environment at 1 GB and fractional/one-vCPU settings.
- Neon cold starts, pooler limits and usage totals; Upstash latency/quotas; Vercel instance fan-out.

For a future constrained local comparison, create a separate disposable PostgreSQL instance and synthetic dataset, then run the same benchmark with explicit 1 GB memory and 0.25/1-vCPU limits. Never apply those limits to the current host database. Keep application CPU measurements separate; if its client is constrained too, report that as a different experiment. Such a container remains only a local resource-constrained proxy, not a Neon reproduction.

## 10. Reproduce and next decision

From `api/`:

```sh
npm run bench:pool -- ../architecture/LOCAL_POOL_BASELINE.json
```

This deliberately performs bounded work and short sleeps, allocates several short-lived local pools sequentially, and consumes several seconds of one Node CPU during bcrypt checks. It has no background workload after completion. Benchmark-only read-only flags/timeouts are not application configuration.

The review supports proceeding with an explicit, observable pool and timeout configuration as the next task. It does **not** support a promise that “1 GB is enough,” an estimated number of paying users, or a prediction that local sub-millisecond SQL will remain sub-millisecond in the cloud.
