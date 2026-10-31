# Remaining activation and device checks

These items are not completed merely because local tests pass. No provider was provisioned, no existing application database was migrated, and no deployment was made by this review.

## Owner/provider activation

- Create/select isolated Neon development/preview/production branches and inspect actual regions/compute/pooling limits. Use pooled DATABASE_URL at runtime and direct DATABASE_URL_UNPOOLED for CLI.
- Review/apply the complete ordered migration chain to the intended application environment before deploying the generated client. The chain through hybrid uploads and realtime signals has passed on an empty disposable PostgreSQL instance. This does not confirm application on Neon or an existing populated database.
- Configure Upstash TLS TCP REDIS_URL and environment-specific REDIS_CACHE_PREFIX. Verify cache operations and Pub/Sub/connection quotas for the actual plan. REST-only integration variables do not configure the current TCP clients.
- Configure separate public-product/private-evidence R2 buckets, product delivery domain, R2 credentials and canonical APP_URL. Verify evidence cannot be fetched without the owner/admin session.
- Configure QStash signing/publishing and Expo/Android FCM credentials using api/server/notifications/README.md. Keep iOS flags off until Apple/APNs activation is available.
- Configure CRON_SECRET and verify the four production schedules: order expiry 02 UTC, notification recovery 03 UTC, upload cleanup 04 UTC, expired credentials 05 UTC. Each may run anywhere in its hour; Lagos is UTC+1. Verify backlog/failure logs and manual retry. Cron does not run locally automatically and Vercel does not automatically retry a failed invocation.
- Verify actual Vercel plan, Fluid setting, runtime region, effective function duration and streaming proxy behavior. SSE requests maxDuration 300 seconds and rotates at 240 seconds. Keep all SSE flags false until this is checked, then pilot with aligned server/web/native flags.
- Rebuild installed native apps for the picker/plugin and public environment flag changes. Test Google/native auth on actual configured accounts; no Google browser consent was simulated here.

## Device/browser acceptance

Use isolated staging accounts/data, including two customer accounts and an admin. No real money transfer is needed for these acceptance checks.

- Product scrolling, tied sort values, rapid search/filter resets, pull-to-refresh, request cancellation, failed-page retry and no duplicate cards.
- Draft restoration after page/app restart; selected-image copy, Android picker recovery, failed upload retry, replace/remove and final-save lost-response retry.
- Explicit logout and cross-tab logout must not recreate drafts. Account switching must not show another account's draft, cached order or evidence.
- Read old conversations/messages through cursors, send while older history is loaded, retry a failed older-page request and navigate away during a load.
- Order navigation, notification preferences, payment-sheet recovery, background/resume and push navigation. Verify one foreground stream, owner isolation, session revocation, rotation/reconnect and fallback polling.
- Admin approval of partial quantities starts the buying window; complaint creation does not. Confirm expiry, bank details, transfer lock, audited unlock and manual confirmation with test references. A test confirmation is not a real bank transfer.

## Measurements requiring hosted/device conditions

- Record cold/warm HTTP latency, pool/connection waits, Neon resume, cache hit/miss/fallback, SSE reconnects and actual provider resource usage.
- Use the native opt-in diagnostics for API JSON counts/decoded payload bytes and request durations. It excludes SSE/image/upload/TLS/compression/render time; capture total wire bytes separately.
- Measure idle Shop, scroll/search, order tracking and background/resume over equal durations before/after. Compare requests/hour, total bytes and screen loading time.
- Repeat bounded staging workloads with actual resource limits. The local synthetic benchmark is not a 1 GB/low-CPU or Neon/Vercel free-tier simulation.
- Use the existing capacity/pool report as a baseline, and publish a hosted retest with workload, duration, p50/p95/p99, errors and provider usage. Do not run the disposable seed scripts against production.
