# Backend improvement tracker

Work order agreed with the owner: documentation → Redis implementation → guided indexes → guided configuration. Current instruction: continue implementation reviews and speed comparisons locally; managed-provider connection/provisioning work is deferred and does not block these reviews.

## 1. Documentation — complete
- [x] Consolidate architecture/design documents here and repair references.
- [x] Identify historical plans so they are not mistaken for current deployment instructions.

## 2. Redis — code implemented; live activation pending
- [x] Add optional, bounded Redis access with database fallback.
- [x] Cache public product lists/details and available delivery-zone datasets.
- [x] Invalidate after product, stock and zone mutations, including maintenance and seeding.
- [x] Verify hits, misses, expiry, outage behavior, invalidation races and private-data exclusion.
- [x] Document effects and connection variables; do not change the user's deployed environment.
- [ ] Owner: connect Upstash Redis and verify deployed TLS/cache behavior (guided separately).

## Managed-services activation — pending

- [ ] Create/connect Neon through Vercel; choose nearby regions and separate development/preview/production data.
- [ ] Set pooled `DATABASE_URL` for runtime and direct `DATABASE_URL_UNPOOLED` for Prisma CLI; verify the existing pg adapter and UTC behavior against Neon.
- [ ] Apply existing migrations on the intended Neon development branch and seed representative products/orders/payments; never load synthetic performance data into production.
- [ ] Configure Upstash TLS TCP `REDIS_URL` for the existing ioredis client. REST integration variables alone are insufficient; verify deadlines, command usage and invalidation from Vercel.
- [ ] Verify deployed reads/transactions, cache hit/miss/fallback and managed-provider metrics before claiming performance gains.

## 3. Indexes — owner applies changes, one table at a time
For each table: explain the query → inspect existing indexes/query plan → choose whether a change is needed → owner edits migration/schema → verify the effect. No indexes are changed automatically.
- [x] VerificationToken: expiry index added to schema and migration `20261026113215_new`; owner confirmed migration applied locally. Live database application/query plan not independently checked.
- [x] MobileAuthGrant: userId index present in schema and migration `20261026114623_new`; owner confirmed application locally. Live query plan not independently checked.
- [x] Product: browsing sort/filter and search reviewed; cursor-only API implemented across mobile, web shop and admin. Search trigram indexes deferred for the small catalogue. Browsing index is present in schema/migration `20261028090045_new`; live application and query-plan benefit remain unverified.
- [ ] Product follow-up on Neon: confirm migration application and measure representative browsing/search plans before claiming a performance improvement.
- [x] Order / Payment: review admin listing and join plan locally. Replaced newest-100 truncation with 20-order keyset batches, deterministic `(createdAt DESC, id DESC)` order and selected list fields; admin can load older orders. Local database confirms Payment(orderId) is unique and OrderItem(orderId) is indexed. No extra index applied: the two-order local plan is already cheap and cannot establish a scaling benefit.
- [x] Order / Payment: benchmark 1,000 synthetic local orders in a disposable database; save plans/timing/bytes in review-next/REPRESENTATIVE_LOCAL_BENCHMARK.json.
- [ ] Verify actual admin browser pagination and hosted scalability; local query fixtures do not establish either.
- [x] Conversation: admin inbox ordering reviewed; cursor-only 20-conversation batches, stable conversation/message ordering, minimal previews and one abortable admin loading path implemented. Existing user/time and message/time indexes inspected locally; no extra index justified with one conversation. See [local inbox benchmark](LOCAL_INBOX_BENCHMARK.md).
- [x] Conversation: benchmark 1,000 synthetic conversations/2,000 messages locally; no new global recency index selected.
- [ ] Verify admin browser flows and hosted inbox behavior.
- [x] User: email lookup semantics and normalization reviewed and unified across signup, password login, Google adapter and recovery/deletion requests. Exact lookups use the existing unique email index; local audit found no normalization conflicts. No index/data migration added. See [email identity review](EMAIL_IDENTITY.md).
- [ ] User follow-up: verify live Google/browser/native auth flows and audit canonical values/collisions before adopting imported data. The synthetic 1,000-user local audit/benchmark is complete; it does not audit imported identities or establish hosted speed gains.
- [x] DeliveryZone and remaining tables: reviewed queries and confirmed local primary/unique, relation, expiry and revocation indexes. One-zone reads do not justify another index; added name/ID ordering tie-breakers only. See [coverage review and local measurements](DELIVERY_INDEX_REVIEW.md).
- [x] Remeasure synthetic zone/expiry/prefix-token selection plans locally; no additional index selected. See review-next/LOCAL_BENCHMARK.md. Hosted index use remains a separate check.

## 4. Configuration — owner applies settings, one at a time
Explain the effect, tradeoffs, current value and rollback before each change.
- [x] Measure a local baseline and review pool defaults/timeouts; compare the laptop with a 1 GB low-CPU environment and documented Vercel/Neon free tiers. See [capacity and pool report](CAPACITY_AND_POOL_REPORT.md) and [raw aggregate results](LOCAL_POOL_BASELINE.json). No runtime tuning applied; an actual constrained database run was unavailable because Docker daemon access was denied.
- [ ] Establish Neon compute/query/connection baselines and Upstash command/data usage; separate cold and warm requests.
- [x] Implement explicit runtime pool limits, bounded acquisition/query policies and Vercel lifecycle registration. Defaults: max 3, connection/idle 5s, SQL 10s, client fallback 12s, interactive transaction duration 5s. Six local pool/cancellation/rollback/recovery checks pass; Vercel suspension and Neon pooled execution remain deployment checks. See [implementation and overhead](DATABASE_POOL.md).
- [ ] Review Neon compute sizing, autosuspend behavior and plan limits; self-hosted shared_buffers tuning is no longer in scope.
- [ ] Review expensive sorts/joins and Neon-supported query settings before choosing any per-session tuning.
- [ ] Review Upstash cache capacity, eviction behavior, command quotas and TCP connection limits.
- [ ] TLS/network access, region placement and timeout review.
- [ ] Re-measure Vercel/Neon/Upstash latency, usage and cost against expected load.

### Post-deployment capacity and pool retest — pending deployment

Repeat the [local capacity/pool review](CAPACITY_AND_POOL_REPORT.md) after deployment using actual Vercel, Neon and Upstash metrics. Local measurements are a comparison baseline, not production capacity evidence. The existing benchmark scripts deliberately refuse remote database hosts; do not remove that guard to run them against production.

- [ ] Record actual plans, regions, function CPU/RAM, Neon compute range, pooling limits and Upstash quotas.
- [ ] Use a deployed preview/staging environment with representative synthetic data for load tests; use bounded, read-only checks and normal-traffic observation in production.
- [ ] Measure complete HTTP paths for catalogue browsing/search, admin orders/inbox, login and checkout; distinguish warm requests, function cold starts, Neon resume and cache hits/misses. Use isolated test accounts/orders for any write-path testing.
- [ ] Repeat concurrency comparisons with deployed pool settings; record p50/p95/p99 latency, error/timeout rates, pool waits, connection counts, CPU and memory peaks. Check per-instance pool multiplication and cleanup after requests/errors.
- [ ] Verify bounded acquisition, statement/transaction cancellation and retry behavior safely in staging; do not inject stalls or faults into live customer transactions.
- [ ] Measure query plans on representative data, Redis fallback/invalidation, polling volume and any SSE connection/reconnect overhead if SSE has been implemented.
- [ ] Compare results with LOCAL_POOL_BASELINE.json; explain differences rather than applying a CPU/RAM scaling multiplier. Record Neon CU-hours, Vercel CPU/memory/invocations and Upstash usage over representative traffic windows.
- [ ] Publish a deployment retest report with the environment, dataset, test duration, results, bottlenecks and any setting changes plus rollback. Claim capacity only for the measured workload and resource envelope.

Current deployment decision (2026-10-28): Vercel owns Next.js and the API; Neon hosts PostgreSQL and Upstash Redis handles caching. Oracle provisioning and VM tuning are superseded. Live credentials, provider provisioning and migration execution remain owner-operated.

## Verification of the Redis implementation

- TypeScript and ESLint passed.
- Test suite: 79 passed, 7 database integration tests skipped (no disposable test database configured).
- Isolated local Redis smoke: hit, invalidation, TTL expiry and shutdown fallback passed.
- Production build passed outside the sandbox. The sandboxed build could not capture TypeScript configuration subprocess output; no application configuration workaround was needed.
- Upstash Redis connectivity/TLS and deployment activation are not yet verified.

Current local completion review: SSE code/contract, message pagination, public conditional reads, credential cleanup and device diagnostics are implemented; see review-next/WALKTHROUGH.md. Hosted SSE activation remains pending. Remote push code is implemented and awaits owner migration/Android credentials/QStash activation (section 6). Protected 24-hour expiry endpoint is implemented; schedule activation and database contention verification remain pending. Shared order polling is implemented; real-device request/UX checks remain pending. Bounded runtime pooling and current local table/index reviews are complete. Managed-provider activation, deployed lifecycle validation, representative-volume benchmarks and UI/auth checks remain follow-ups.

## 5. Mobile refresh efficiency — local SSE implementation complete; hosted activation pending

Product browsing update (2026-10-28): cursor responses and mobile incremental loading are implemented. Mobile requests 20 products per batch, searches/filters/sorts on the server, caches loaded batches in TanStack Query, debounces search, supports pull-to-refresh/retry and cancels requests when inactive. The unconditional 30-second catalogue timer is removed. The old page/offset branch and pagination mode flag are removed. Public and admin listings share the cursor-only contract; mobile uses scroll loading, web/admin use incremental Load more controls. The default sort key and label are both Newest; unsupported bundle/recipe filters are hidden until their metadata exists. For the expected catalogue below 100 varieties, the API currently reads and sorts matching products before slicing each response; public non-search matches use the existing invalidatable cache. This reduces mobile bandwidth, not database rows fetched per cache miss. Revisit SQL-level pagination if catalogue growth warrants it. Automated cursor tests cover 20/20/5 batches, tied timestamps, cached dates, sort order, filter queries, invalid cursors and deletion of a boundary row. Device scrolling and Neon query performance remain unverified. Shared order polling is implemented; the later SSE implementation is complete locally and remains disabled pending hosted activation. The unused bundled mock catalogue and no-op smoothie filter control were removed.

Original problem: Shop repeatedly downloaded the full catalogue, and notifications/order/detail/payment screens had independent timers that could survive loss of focus. Product incremental loading and shared order polling now address those paths. Active notification polling still intentionally refreshes every 15 seconds; public conditional reads and opt-in SSE are now implemented; hosted/device savings remain unmeasured. Redis avoids some database reads but does not eliminate HTTP payloads.

Summary fix: first consolidate refresh ownership and stop unnecessary polling; then add one foreground SSE connection for small change notifications, with normal API reads remaining authoritative. Start with order changes, then catalogue changes. Keep deployment on Vercel/Neon/Upstash unless measurements justify a separate realtime service.

### Completed product implementation

- [x] Remove page/offset compatibility code and migrate every product-list caller to cursors.
- [x] Load 20 products per batch in mobile/web/admin (homepage preview intentionally requests four).
- [x] Apply supported search/filter/sort operations before selecting each response batch; reset results when criteria change.
- [x] Cache mobile batches, debounce search, handle cancellation/retry/pull-to-refresh and remove periodic full-catalogue downloads.
- [x] Remove stale popularity naming, unused mock catalogue data and unsupported filter controls.
- [x] Verify TypeScript, ESLint and automated cursor/cache/authorization tests. Real-device UX and live Neon performance remain follow-ups.

### Remaining refresh fixes

- [x] Share order refresh state and deduplicate concurrent list/detail requests across notifications and screens. One scheduler replaces four timers; checkout selects its pending order from the same cache. See [order refresh implementation](MOBILE_ORDER_REFRESH.md).
- [x] Apply focus/background/authentication/preference gating, abort reads and reject stale generations; retain scoped errors, manual refresh/retry and safe payment-detail merging. Mobile typecheck/lint, 22 tests and Android production export pass.
- [ ] Verify real-device order navigation, notification preferences, background/resume, logout/account switching, payment-sheet recovery and actual request counts/bytes. Simulated scheduler deduplication is verified; device/cloud savings remain unmeasured.
- [x] Evaluate conditional reads and implement public-product ETags/304 reuse in the native client. Private responses remain uncached; revisit private version checks only if device/hosted measurements justify them.
- [ ] On a real device, verify scrolling, rapid search changes, filter resets, pull-to-refresh and network failure/retry behavior.
- [ ] Measure requests/hour, bytes transferred, query latency and mobile loading time before and after.

### SSE implementation and activation

- [x] Define one authenticated foreground order/catalogue stream and select Expo SDK 58 streaming fetch with bearer headers, cancellation and reconnects.
- [x] Add Redis TCP Pub/Sub delivery across instances; verify independent local clients. Hosted Upstash plan/transport quotas remain unverified.
- [x] Record durable change signals inside business transactions and publish after commit; include product edits/archives, stock-affecting order changes, payments, returns and choices. Coalesce invalidations and debounce client refreshes.
- [x] Establish subscription before ready; reconcile current authorized state on ready/reconnect and cancel stale native reads. Retain failed publication records for later recovery.
- [x] Add session rechecks/heartbeats, bounded buffers, per-owner/process stream limits, abort cleanup, planned 240-second rotation and retry backoff/jitter.
- [x] Close on native background/logout and hidden web pages. Healthy native streaming uses 60-second shared order reconciliation; failure restores 15-second deduplicated polling. Catalogue state reconciles on reconnect/rotation.
- [x] Verify local owner isolation, cross-instance Redis delivery, revoked/rotated stream cleanup, slow consumers, fragmented frames, transactional rollback and retained publish failures.
- [ ] Confirm actual Vercel plan/Fluid setting/effective duration/region and Upstash Pub/Sub/connection quotas; enable a limited pilot only afterward. All SSE flags default false.
- [ ] Verify actual device streaming/background/reconnect and deployed timeout/outage behavior, and compare total bandwidth, resources and cost against the polling baseline.

Code/read-through: [SSE](../api/features/realtime/README.md), [completion walkthrough](review-next/WALKTHROUGH.md). Local tests do not establish hosted cost savings.

### Vercel limits and deployment recommendation

Checked 2026-10-28: standard Fluid compute documentation lists a 300-second default; Hobby is capped at 300 seconds and Pro/Enterprise normally allow 800 seconds. Vercel's newer June 15, 2026 announcement adds an opt-in 1800-second maximum in beta for supported Pro/Enterprise Node.js/Python functions. Confirm runtime eligibility and account settings rather than assuming beta access. A heartbeat does not reset the invocation lifetime; increasing `maxDuration` does not make a stream permanent. For a verified 300-second budget, rotation around 270 seconds is an initial example, not a deployed setting.

With Fluid compute, waiting does not consume active CPU billing, but provisioned memory remains billable while the instance handles streams; multiple concurrent requests can share an instance. Reconnects create new invocations. SSE therefore reduces repeated payloads but does not guarantee lower hosting cost. Start with a small Vercel SSE pilot and measure; consider managed realtime or a separately budgeted persistent gateway only if connection scale/cost warrants it. A separate persistent gateway is not part of the selected managed-services deployment and would require its own capacity and operating plan.

Sources: [duration configuration](https://vercel.com/docs/functions/configuring-functions/duration), [30-minute beta announcement](https://vercel.com/changelog/vercel-functions-can-now-run-up-to-30-minutes), [Fluid compute pricing](https://vercel.com/docs/functions/usage-and-pricing), [shared state and reconnect guidance](https://vercel.com/kb/guide/vercel-services-fluid-compute).

Product indexing follow-up: inspect the existing `(isAvailable, createdAt DESC, id DESC)` schema/migration against actual Neon plans; its live application is unverified. Cursor responses currently sort matching rows in application memory, so do not assume that index eliminates their sorting. Trigram search indexes are deferred. No further index or migration was applied during this implementation.


## 6. Scheduled expiry and remote push notifications

- [x] Change unreported unpaid reservation lifetime from 12 to 24 hours and align payment eligibility, customer copy and policies.
- [x] Add protected GET /api/cron/maintenance callable by Vercel Cron or an external scheduler; bounded serializable expiry, stock release and post-commit catalogue cache invalidation. Keep reported/verified payments protected. CLI remains available for local cleanup.
- [x] Owner confirmed Vercel Hobby: configure daily cleanup at 02:00 UTC (03:00 Lagos, within the scheduled hour) in api/vercel.json. Drain at most ten batches of 20 per run with a 40-second loop budget.
- [ ] Deploy/activate daily schedule and CRON_SECRET; verify logs/backlog. Payment eligibility ends at 24 hours; status/stock cleanup waits for the next successful daily run (roughly 24–49 hours from creation without backlog/failures).
- [x] Verify payment-report/expiry races, retry idempotency and stock consistency on disposable local PostgreSQL.
- [ ] Repeat expiry/payment contention and provider delivery checks on deployed staging.
- [x] Confirm product/restock audience: all customers who explicitly opt in (owner decision, 2026-10-29). No product-follow feature required.
- [x] Implement separate catalogue-alert consent; the existing order-notification preference must not automatically opt customers into product/restock alerts.
- [x] Implement authenticated per-installation push-token registration, permissions, token refresh, logout/account-switch revocation and notification navigation with native-build/Expo Go gates; platform credentials and device verification remain pending.
- [x] Add durable transactional notification outbox for available product creation, availability/restock changes and actual order/payment/delivery transitions; deduplicate retries/no-op updates. Product fan-out must be bounded and opt-in. Do not treat reservation cancellation/expiry stock restoration as a new merchandising restock automatically. Schema/migration application remains owner-operated.
- [x] Implement QStash-triggered bounded push worker, publishing after business commit independently of daily cleanup: claim jobs with leases, Expo delivery batches, retry/backoff, tickets/receipt polling and invalid-token removal. Recheck active account, session/installation ownership and preferences before delivery. Keep private order events owner-only; exclude payment/account/address secrets from push payloads.
- [x] Test push processing with a fake transport, including broadcast batches, network retry, receipts, ownership/preferences, invalid tokens and QStash signature verification.
- [ ] Owner applies push schema migration before deploying the generated Prisma client; configure QStash/Expo/Android FCM, then rebuild and verify Android on a device. See api/server/notifications/README.md.
- [ ] Activate/test iOS later when Apple membership/APNs credentials are available; iOS flags remain off. Expo Go is not the remote-push test environment.
- [ ] Deploy/retest expiry and push workers together with SSE, Neon and Upstash; distinguish background push delivery from foreground SSE refresh.

See [worker findings and operation](WORKERS.md).

Notification code and read-through guide: [backend folder](../api/server/notifications/README.md), [mobile folder](../mobile/src/features/notifications/README.md). No push migration or provider activation was executed.

- [x] Remove the five-event notification recovery bottleneck: keyset batches of 20, bulk conditional claiming, QStash batch publishing, signed continuation jobs, partial-failure recovery and regression coverage. Successful per-device deliveries remain deduplicated. Live QStash backlog/quotas still need deployment validation.


## 7. Returns credit and manual refunds — implementation complete; migration/live verification pending

- [x] Approve partial/full received returns at original prices, prevent duplicate/excess quantities/refunds, explicitly select delivery-fee reimbursement and restock only inspected fruit.
- [x] Add auditable credit buckets and allocations; apply full/partial credit to replacement checkout and show only the bank top-up. Reserve until verified; release on cancellation/rejection/expiry.
- [x] Enforce server-side 20-minute refund due time. The later choice-window rule below supersedes unlimited spending until Transfer; that action atomically locks the current remainder and bank snapshot. Confirmation records a manual transfer reference; audited unlock requires confirmation no funds were sent.
- [x] Add web admin/customer and mobile checkout/source-order views, ownership/admin guards, idempotency and transactional push events. Block deletion while money remains unsettled; anonymize settled refund bank data on deletion.
- [x] Author migration with nonnegative/conservation checks and one-pending-transfer uniqueness. Owner application remains pending.
- [ ] Owner applies returns migration after prior migrations, before deploying the updated Prisma client.
- [x] Verify actual local PostgreSQL approval/debit/transfer contention, money conservation, partial approval windows, rollback and completed-lock protection in disposable fixtures.
- [ ] Repeat financial flows and payout procedures on migrated staging, including real browser/device behavior; no actual bank transfer is performed by local tests.
- [ ] Verify web/native UI, manual bank transfer procedure and push on staging; do not mark real refunds successful from unit fixtures.

Read-through: [returns/refunds implementation](../api/features/returns/README.md).


## 8. Chat navigation, disputes and customer choice — implemented; activation/device checks pending

- [x] Add Chat to native and web navigation, with separate Chat/Disputes messaging tabs and admin inbox filters; keep existing messages under CHAT. Move native support links to canonical /chat.
- [x] Create owner-scoped, paid-order dispute cases with affected quantities, structured reasons, optional HTTPS evidence links, requested outcome and idempotency. Do not create money from a complaint alone.
- [x] Admin approve/reject with responsibility, explanation and policy-based delivery reimbursement; overrides require a reason. Support non-physical resolution without automatic fruit restock.
- [x] Start the customer window at approval, default to Buy again, allow changes for 20 minutes, and make all unused balance bank-refund-only at the deadline. Enforce on the server without a new timer worker.
- [x] Connect choices to checkout/refunds: all unused grants become unspendable after the deadline and manual Transfer locks the remaining refundable balance. One approved store/rider-fault replacement can waive delivery once, with normal stock/price checks and slot release on unpaid cancellation.
- [x] Add focused/manual HTTP messaging reads and abort stale native reads on background/blur/account change; remove the old support page’s 15-second interval. No WebSocket implementation in this change.
- [ ] Owner applies chat/dispute migration after prior migrations before deployment. Verify live relational constraints/choice versus checkout/payout/replacement contention on isolated migrated data.
- [ ] Verify web/mobile message navigation, evidence links, approvals, clock offsets, all final choices, one-time replacement delivery, account switching and provider push after deployment.
- [ ] Add authenticated WebSocket transport later: owner/admin room isolation, reconnect/resync, ordering/deduplication and a provider/runtime compatible with deployment. Existing HTTP history remains authoritative.
- [x] Add owner-filtered customer conversation cursors and 20-message history cursors across customer web/native/admin. Remove the 500-message cap and verify 501 tied-timestamp messages without duplicates.
- [ ] Review future delivery-arrival/contact-attempt evidence and redelivery policy before implementation; see review-next/future-features/CHAT_AND_DELIVERY.md. No automatic forfeiture/report deadline is introduced.

Read-through: [chat/disputes](../api/features/chat/README.md).


## 9. Approval-gated Buy again window — current rule, superseding prior final-choice behavior

- [x] Default new dispute requests and approved grants to Buy again (CREDIT). All unspent money becomes bank-refund-only at the original 20-minute deadline, regardless of earlier choice; no recurring worker is required for enforcement.
- [x] Show owner-scoped approved spendable amounts and pending-refund amounts on mobile/web Home and Shop. Hide zero balances; refresh on navigation/focus/expiry without a recurring HTTP loop.
- [x] Let admins approve selected disputed quantities or the whole claim, persist approvedItems, and calculate credit only for those approved units. No credit or timer starts on complaint creation/rejection.
- [x] Verify partial approval, no over-approval, approval-based timer, expiry for every choice and approved-balance summary with local fixtures.
- [ ] Owner applies buy-window/approved-items migration after prior pending migrations before deployment. Repeat actual DB contention and device/browser flows on migrated staging.

Current implementation notes: api/features/chat/README.md and BUY_WINDOW_VERIFICATION.json. Earlier checked tasks describing permanent last-choice credit are historical and superseded by this rule.


## 10. Cloudflare uploads and resumable device drafts

- [x] Replace the Cloudinary uploader with server-side Cloudflare R2 uploads; validate ownership, role, file size/type/signature and return URLs/timestamps only after confirmed upload.
- [x] Store product/chat/dispute drafts locally (web IndexedDB, native persistent files), with separate account/context scopes, selected-image recovery, debounced autosave and explicit logout clearing.
- [x] Add Choose → Preview → Upload → URL/time → Replace/Remove flow; block final saves with unfinished selected images; attach uploaded assets transactionally and clear drafts only after successful final responses.
- [x] Add durable submission receipts for product/chat/reply retries and preserve dispute idempotency. Server controls image URL/time; pasted metadata is rejected.
- [x] Preserve bundled product thumbnails; add native current-photo viewer. Record explicit batch arrivals independently of optional photo uploads and connect available-stock notifications.
- [x] Add private evidence storage and authenticated reads on web/native. Submitted evidence stays outside abandoned-upload cleanup.
- [x] Separate daily order-expiry, notification-recovery and upload-cleanup cron endpoints. Persist each deletion and use leases/retry timestamps for interruption recovery; add protected admin manual cleanup.
- [x] Retain replaced published photos as archived backup history; expire unattached drafts after seven days of inactivity.
- [x] Verify upload validation/failures, ownership, attachment gates, image metadata, save replay, IndexedDB persistence/expiry, interrupted deletion recovery and worker authentication with local fixtures. Save results in api/features/uploads/VERIFICATION.json.
- [ ] Owner applies hybrid-upload migration after previous pending migrations, configures public/private R2 buckets and credentials, and builds/deploys updated web/native apps.
- [ ] On migrated staging/real devices verify image selection/upload, page/app restart, Android picker recovery, account switching/logout, lost-response save retry, private evidence access and daily/manual cleanup with actual Cloudflare.
- [ ] Set a submitted-evidence/archive retention policy before enabling automatic deletion of attached or archived assets. Current cleanup deliberately preserves them.

Read-through: [uploads and drafts](../api/features/uploads/README.md). Production build passes after removing Cache Components-incompatible runtime exports. The restricted sandbox still has a TypeScript subprocess capture limitation; final build verification used normal process access.


## 11. Whole-tracker local completion review — 2026-10-29

- [x] Add repeatable disposable PostgreSQL/Redis verification, migrate only the temporary database and run all integration/pool tests without skips.
- [x] Fix actual Cache Components route configuration failures and verify the production web build without disabling type checks.
- [x] Add independent daily expired-credential cleanup with bounded fair sweeps and expiry rechecks; reuse it in the CLI. There are now four daily cron jobs.
- [x] Harden cross-tab logout/draft clearing and abandoned native picker results.
- [x] Add opt-in development request diagnostics with route/value redaction, count/JSON payload/error/latency summaries and logout reset. This is not total wire-byte or screen-render measurement.
- [x] Save representative local benchmarks, transaction results, activation checks, a code walkthrough and future-feature proposals in [review-next](review-next/README.md).
- [ ] Execute device/browser acceptance and hosted/provider activation in review-next/ACTIVATION_CHECKLIST.md. External account/device/resource prerequisites are not marked complete by simulated checks.
- [ ] Review new business/provider/policy proposals in review-next/future-features before implementing them.

Current local verification: 187 API tests pass with zero skips in disposable PostgreSQL/Redis; 26 mobile tests pass; production web build, Android export, type checks and lint pass. See review-next/VERIFICATION.json for the final saved results.
