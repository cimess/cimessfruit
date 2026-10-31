# Operations and scaling proposals

- Add an authenticated admin health summary for pending upload deletions, oldest realtime/push outbox age, failed deliveries and cron summaries. Define alert thresholds and recipients before sending external alerts.
- Use the new native diagnostics with fixed scenarios. Collect real image/SSE/upload wire bytes separately. Compare idle Shop, active scroll/search, order tracking, background/resume and payment recovery over equal windows.
- Evaluate private conditional/version checks only if unchanged order responses remain material after SSE. Public catalogue ETags are implemented; private account/payment response caching is intentionally absent.
- Keep the small-catalogue implementation until measured growth warrants SQL-level keyset pagination. Current response cursors do not prevent reading/sorting matching products in memory. Do not add trigram or broad composite indexes solely because the system is read-heavy; measure representative plans first.
- For SSE, inspect instance multiplication, Redis TCP/PubSub quotas, heartbeats/session query cost, retry storms and stream memory. A 100-listener process cap is not a global connection quota.
- Add hosted staging load tests with explicit request/concurrency/time budgets. Use read-only observations in production. Never point synthetic seed/benchmark scripts at production.
- A measured 1 GB/low-CPU test requires a controlled cgroup/container/VM. The present laptop measurements do not simulate that environment and must not be divided by CPU/RAM ratios to predict Neon/Vercel.

Acceptance requires recorded workload, actual plans/regions/resources, p50/p95/p99, errors, connection/pool waits, provider usage and rollback settings. New indexes, paid services and financial policy changes remain review decisions.
