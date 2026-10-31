# Walkthrough — whole architecture tracker review

Completed local implementation/review on 2026-10-29. Deployment, provider activation and physical-device acceptance remain separate. Future business features are collected under future-features/ for review.

## 1. Production build compatibility

The restricted build stopped at an opaque TypeScript --showConfig subprocess error. Running the build with normal process access revealed actual route compilation failures: explicit runtime=nodejs exports are incompatible with Cache Components in this installed Next.js version.

Removed those exports from upload, cron and push-worker routes. Node.js remains the default. Did not disable type checking or Cache Components. The final production build now compiles, type-checks and generates pages successfully.

## 2. Repeatable local verification

From api:

```sh
npm run verify:local
npm run verify:local -- --bench
```

The script creates its own temporary PostgreSQL cluster/database and, when installed, a temporary Redis instance on OS-selected loopback ports. It overrides all test/CLI database URLs with its own connection and applies the migration chain only there. It then runs the full suite, optionally seeds synthetic data and executes read-only benchmarks, and stops/removes its temporary services.

It never reuses the application's configured database. PostgreSQL binaries default to /usr/lib/postgresql/16/bin; LOCAL_POSTGRES_BIN can select another installation. Starting local listeners may require permission in a restricted agent environment. Saved reports are LOCAL_DATABASE_VERIFICATION.json and REPRESENTATIVE_LOCAL_BENCHMARK.json.

## 3. Actual PostgreSQL transaction checks

api/tests/financial-database.test.ts adds database checks for:

- Dispute creation grants no money; partial approval starts exactly the approval-time 20-minute window.
- Simultaneous return approvals cannot refund the same quantity twice.
- Concurrent transfer attempts create one pending lock; spending cannot consume locked credit and completed transfers cannot be unlocked.
- A failed message transaction rolls back its evidence attachment; cleanup ignores attached evidence.
- A 501-message conversation remains fully reachable through 20-message cursor windows, including tied timestamps.
- Realtime hints roll back with a failed transaction and remain queued after a publish failure.
- Payment-report versus order-expiry races preserve consistent payment and inventory state.
- Credit debit versus later transfer preparation conserves money; a serialization conflict requires retry instead of double spending/refunding.

These operate on test data only. No money was transferred and no application order was expired by these checks.

## 4. Foreground realtime

Read api/features/realtime/README.md, then bus.ts → publication.ts → stream.ts → runtime.ts. Native code lives in mobile/src/features/realtime/.

One authenticated foreground stream carries order/catalogue change hints. Redis Pub/Sub connects separate instances. Committed changes leave a durable signal; failed publication retains it. Subscribe acknowledgment precedes ready; clients then cancel stale reads and fetch authoritative state. Session rechecks, owner filtering, heartbeats, bounded buffers, connection caps, abort cleanup and planned rotation are implemented.

Native uses Expo SDK 58 streaming fetch with bearer headers. Background/logout aborts the stream. Healthy SSE changes the existing shared order scheduler to 60-second reconciliation; failure restores the 15-second deduplicated fallback. Web uses visible-page streaming and reconciliation events. Product cards continue using bundled thumbnails; optional live photos stay separate.

SSE_ENABLED, NEXT_PUBLIC_SSE_ENABLED and EXPO_PUBLIC_SSE_ENABLED remain false by default. Apply the realtime migration and verify actual hosted settings before a pilot. This is not background push or a WebSocket chat server.

## 5. Public conditional responses

Successful public product GETs now return ETags. Matching If-None-Match returns a bodyless 304. Native revalidates a bounded public-product representation cache; private orders, account details and payments are excluded.

This reduces unchanged JSON response bytes. The API still reads its cache/database and computes the response hash. Do not report this as fewer database queries. Tests verify changed stock invalidates the tag and caller mutation cannot corrupt a reused representation.

## 6. Chat and inbox pagination

api/features/chat/history.ts defines deterministic createdAt/id boundaries, binds message cursors to their conversation and returns 20-message windows in display order. The old 500-message write/read cap is removed.

Customer conversations now use owner-filtered cursor pages too. Customer web/native and admin message views provide Load older messages; customer lists provide Load more conversations. Cursor validation and authorization stay server-side. Older-message loads are cancelled on customer navigation/background; sending/refreshing returns the newest window.

## 7. Draft recovery hardening

Browser drafts now notify other tabs on logout, invalidate pending writers and disable stale forms. Clearing is ordered after already-queued writes. Failed device persistence stays dirty so a later flush can retry. Native image selection ignores results from an unmounted/account-changed composer and removes a copied file if navigation wins the race.

The previous upload lifecycle, private evidence, archived photo history and seven-day inactive-draft expiry remain unchanged. Local storage can still be cleared/evicted; it is not a cross-device draft backup.

## 8. Four daily maintenance jobs

Order expiry, notification recovery and upload cleanup retain separate jobs. Added expired credential cleanup at 05 UTC (06 Lagos, within the hour), because this previously existed only in the manual CLI.

The new sweep handles expired sessions, grants, rate-limit rows and verification tokens in bounded batches, gives each table a turn, and rechecks expiry before deletion. Refreshed credentials survive. Already-deleted records are the durable progress checkpoint; unfinished records remain for another run. The CLI reuses this implementation.

Read api/features/maintenance/README.md and api/vercel.json.

## 9. Device request diagnostics

Set EXPO_PUBLIC_REQUEST_METRICS_ENABLED=true for a development build, then open Account → Request diagnostics. Reset, perform a fixed scenario, and refresh the report.

Counters include API request count, error count, decoded JSON payload bytes, incomplete/unknown payloads and recent request p50/p95 duration. IDs/query values are redacted; no headers, bodies, owners or credentials are retained. Logout resets counters.

This does not measure image/upload/SSE/TLS/compressed wire bytes or actual screen rendering. Those still need device/provider measurements. Counters are disabled by default and the screen is development-only.

## 10. Review results and future work

Read LOCAL_BENCHMARK.md and VERIFICATION.json. The synthetic dataset has 100 products, 1,000 orders/payments/items, 1,000 conversations with 2,000 messages, 1,000 users/tokens/sessions and 26 zones (25 seeded plus one integration fixture). No new browsing/search/admin-recency indexes were selected from these measurements.

Future chat WebSockets, rider/contact evidence, redelivery, archive/evidence retention and operational alerting are documented under future-features/. They need explicit product/provider/policy review. Provider activation, existing application migrations, physical devices, hosted costs and constrained-resource capacity are listed in ACTIVATION_CHECKLIST.md, not marked complete by local tests.
