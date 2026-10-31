# Scheduled expiry and push notifications

Inspection date: 2026-10-29.

## Findings

Order expiry already existed in `api/services/order-maintenance.ts` and the manual `npm run db:cleanup` script. No Vercel cron route or scheduler configuration existed. A script does not run automatically. Old policy was 12 hours; the requested policy is now 24 hours, applied to eligibility and both clients' explanatory/policy text. Already-created pending reservations use the new lifetime too.

Expiry applies only to PENDING orders whose order payment status AND manual-transfer payment row are PENDING. Reported transfers (`REVIEW_REQUIRED`), verified payments and fulfillment orders are excluded. Existing schema represents expiry as order/delivery CANCELLED, payment FAILED, and payment audit reason `reservation_expired`; no EXPIRED enum was introduced.

Historical inspection finding: the app originally used only foreground polling/toasts. Remote push registration, QStash delivery and recovery are now implemented in api/server/notifications; provider activation remains pending. SSE does not supply background OS notifications.

## Callable expiry worker

`GET /api/cron/maintenance` accepts `Authorization: Bearer <CRON_SECRET>`. Missing/short server configuration fails 503; invalid credentials fail 401 before database access. Its exact GET path bypasses customer session authentication because its handler validates a separate worker secret. The exact GET paths /api/cron/notifications, /api/cron/uploads and /api/cron/credentials also bypass customer sessions and verify CRON_SECRET themselves. Other cron paths remain private. Responses are not cached and errors do not expose secrets or database diagnostics.

Each call processes up to 10 batches of 20 oldest eligible reservations, stopping before starting another batch after 40 seconds. Each batch uses one Serializable transaction and returns `{ expired, batches, batchSize, moreMayRemain }`. The transaction updates order/payment and restores reserved quantities together, followed by catalogue cache invalidation. Concurrent conflicting payment/expiry actions cannot both commit at Serializable isolation; a failed invocation returns 503/Retry-After and can be retried. Successful repeats do not match already-cancelled orders. No detached background work or per-instance timer is used. The shared bounded runtime database pool is reused.

`moreMayRemain: true` is a conservative signal to invoke again; it does not assert another eligible row exists. The worker handles at most 200 reservations per invocation; monitor moreMayRemain and failures for backlog. Monitor failures/backlog: even 20 complex orders can hit the configured transaction deadline. The HTTP worker handles order expiry only; the CLI also cleans expired credentials and can drain a backlog. No live orders were expired merely by editing this code.

Local operation: set server-only CRON_SECRET in the API environment, restart the API and call the route with that bearer header using a trusted HTTP client. Never ship this secret in mobile configuration or an event URL. Alternatively run `npm run db:cleanup` from `api/` to perform the existing manual full cleanup. Both actions mutate real pending orders: use fixtures for verification.

## Scheduling on Vercel

Vercel Cron invokes HTTP functions; it does not run a permanent worker process. Set CRON_SECRET on the target deployment. Vercel sends the bearer header automatically. External schedulers must send it explicitly. Cron does not automatically run locally.

Owner confirmed Vercel Hobby and daily cleanup on 2026-10-29. `api/vercel.json` now contains this schedule (the Vercel project root must be `api/`):

```json
{
  "crons": [
    { "path": "/api/cron/maintenance", "schedule": "0 2 * * *" },
    { "path": "/api/cron/notifications", "schedule": "0 3 * * *" },
    { "path": "/api/cron/uploads", "schedule": "0 4 * * *" },
    { "path": "/api/cron/credentials", "schedule": "0 5 * * *" }
  ]
}
```

The schedule runs daily in the 02:00–02:59 UTC window (03:00–03:59 Africa/Lagos), once deployed to production with CRON_SECRET configured. It is not active locally or merely because the file exists. This matches the owner's free-tier decision. Payment eligibility ends at age 24 hours; stock release/status cleanup happens on the next successful daily run. Consequently a reservation can remain pending for roughly 24–49 hours from creation, longer with backlog/failures. This delay is accepted for the daily schedule; do not describe it as exact 24-hour cancellation. Monitor moreMayRemain and errors; automatic cron retries are not assumed.

Sources: [Vercel limits](https://vercel.com/docs/cron-jobs/usage-and-pricing), [cron authorization](https://vercel.com/docs/cron-jobs/manage-cron-jobs).

## Push worker implementation — activation pending

Backend push code is now grouped in [api/server/notifications](../api/server/notifications/README.md), with mobile code in [mobile/src/features/notifications](../mobile/src/features/notifications/README.md). Read that guide for the event → outbox → QStash → Expo → FCM/APNs flow, endpoint and worker limits, owner-applied migration, credentials and Android-first activation. iOS remains gated off until Apple membership/credentials are available.

The worker is event-driven, not dependent on daily expiry cron. Failed initial publication and exhausted QStash retries are recovered by bounded subsequent mutation/daily outbox scans; this recovery can be delayed without traffic. Real device/provider delivery remains unverified.

## Verification status

Automated checks are recorded after execution below. No real-device push delivery, deployed cron invocation or live managed-service validation has occurred. Local database expiry/payment contention remains a separate integration check; mocked tests verify boundary/filter/authentication/error contracts and existing tests verify post-commit cache invalidation.

Local verification on 2026-10-29:

- API automated suite: 117 total, 104 passed, 13 skipped, zero failed. Four new maintenance tests cover the 24-hour boundary, worker secret failures, bounded query/filter behavior, transient failure response and exact-path proxy handling. Existing stock/cache tests also passed.
- API typecheck and ESLint: passed.
- Mobile TypeScript and Expo ESLint: passed (payment-window copy/policy changes only).
- API production build: failed twice with Next.js 16.4.1 `Could not parse output from TypeScript's --showConfig`. Direct `tsc --showConfig` produced valid JSON. No application compilation error was identified; production build remains unverified. Repository-required Next feedback instructions could not be retrieved, including on the network-enabled retry.
- A daily deployment schedule was subsequently added; no deployed scheduler/secret was activated. No schema migration was changed/applied. No push delivery was sent. No live order-expiry invocation was performed.

Daily-schedule follow-up: eight focused maintenance/stock-cache tests passed, including the ten-batch cap/backlog signal. API typecheck and lint passed. Schedule JSON is configured for production deployment; live activation remains unverified.

Push implementation verification is saved in [VERIFICATION.json](../api/server/notifications/VERIFICATION.json): API 117 passed/13 skipped, mobile 23 passed, schema/typecheck/lint passed and Android export passed. API production build remains blocked by the recurring Next TypeScript configuration parse issue. No push migration was applied and no external notification was sent.

Upload lifecycle, separate job windows and manual cleanup are documented in [uploads README](../api/features/uploads/README.md). Order expiry schedules a lightweight QStash recovery callback after successful expirations so notices can dispatch immediately; the recovery scan/delivery run separately. The separate daily recovery cron remains a fallback.

Current local review: production build passes after Cache Components route fixes; 187 API tests pass with no skips in disposable PostgreSQL/Redis. Four daily cron jobs are configured. Expired credential cleanup is now also scheduled independently at 05 UTC (06 Lagos, within the hour). See review-next/WALKTHROUGH.md and api/features/maintenance/README.md. Earlier verification counts/build blockers above are historical.
