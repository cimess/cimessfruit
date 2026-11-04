# Foreground SSE and conditional catalogue reads

Implementation date: 2026-10-29. Disabled by default. This is invalidation/reconciliation, not a financial-action transport or a chat WebSocket server.

## Read the code in this order

1. `bus.ts`: shared per-process Redis TCP Pub/Sub subscription; separate server instances use the same environment-prefixed channel. Credentials never reach clients. Production requires TLS. The subscriber is closed when its last stream leaves; failures close affected streams.
2. `publication.ts`: write RealtimeSignal inside the same transaction as an order/product mutation; flush only after commit. Signals coalesce by kind/owner. Publishing failure retains rows for another mutation/daily recovery. At most 20 rows are considered per flush with a short work budget; transport operations have bounded timeouts. Hints can repeat and clients must not perform business actions in response.
3. `stream.ts`: authenticated stream, subscribe acknowledgment before `ready`, owner filtering, 30-second session rechecks/heartbeats, 240-second rotation, abort cleanup and bounded buffering. At most two concurrent streams per owner and 100 bus listeners per process. Those are process limits, not a global Vercel quota.
4. `stream.ts`: fresh database session checks for native bearer credentials or browser session cookies, including chunked cookies. Session expiry/revocation/disabled account closes access at the next heartbeat. No PostgreSQL connection remains checked out while a stream waits.
5. `protocol.ts`: bounded incremental parsing, fragmented CRLF handling, cancellation and retry waits. Native has a matching implementation under mobile/src/features/realtime.
6. `LiveUpdates.tsx`: one visible-page web stream, watchdog, exponential backoff/jitter and full reconciliation on ready. Web order payment view uses the stream's reconciliation events instead of its own timer when streaming is configured.
7. Native `Realtime.tsx`: one root foreground stream using Expo SDK 58 expo/fetch and bearer headers. Background/logout aborts it. Ready cancels stale reads before reconciliation. Change hints coalesce for 200 ms. There is no recurring native order polling, including during stream failures. Reads occur on subscription/screen entry, foregrounding, manual refresh, mutations and relevant change hints. Failed connections back off with jitter and respect Retry-After; only a heartbeat resets failure backoff. Catalogue reconciliation also happens on each planned rotation/reconnect, recovering missed hints.

The stream carries only named `ready`, `heartbeat`, `order.changed` and `catalogue.changed` events. Financial/order data still comes from authorized JSON APIs. An owner cannot subscribe to another owner's order events using URL parameters. Catalogue hints are shared, and order hints remain owner-only. Background push remains the separate Expo/QStash implementation.

Normal product saves/archives, stock-affecting order events, payment/fulfilment changes, return approvals/transfers and customer choice/bank changes publish through post-commit paths. Price/photo-only product edits also invalidate the catalogue. With flags off, native reads still work on entry/foreground/manual refresh, but there are no live native change notifications or realtime outbox writes.

Failed initial bus subscriptions return HTTP 503 with Retry-After: 60, rather than an empty successful stream. A missing REDIS_URL must be configured before expecting live delivery.

## Enablement

- Owner applies `20261030010000_realtime_signals` after all earlier migrations before deploying the generated client.
- Configure a TLS TCP `REDIS_URL` and a distinct `REDIS_CACHE_PREFIX` per environment. The existing cache connection is not used as a subscribed connection.
- Set server `SSE_ENABLED=true`, web `NEXT_PUBLIC_SSE_ENABLED=true` and native `EXPO_PUBLIC_SSE_ENABLED=true` together for a pilot. Public/native flags require rebuilding their bundles. Defaults remain false.
- Verify the actual Upstash plan's Pub/Sub, connection limits and quota, Vercel Fluid setting/region/maxDuration and proxy streaming behavior. The route requests maxDuration 300 seconds and rotates at 240 seconds; deployment settings must actually support that budget.
- Measure total function memory/invocations, Redis commands/connections and session-check load. This code does not establish hosted cost savings. Per-process limits multiply across instances.

The durable signal queue is not a client event history. Pub/Sub cannot replay missed events; subscription-first ready/reconciliation and stream-rotation reconciliation recover current state after connection gaps. Failed signals may wait until another mutation or daily recovery. They do not replace transactional order state. Manual CLI bulk seed changes should be followed by a normal refresh/reconnect; they are not an automatic merchandising notification workflow.

## Conditional public product reads

`conditional.ts` adds content-derived ETags to successful public product list/detail GET responses. A match returns 304 with no JSON body. Errors are never converted to 304. The native API client holds at most 32 public catalogue representations of at most 128 KiB each and always revalidates them; it does not reuse private order/account/payment responses. Logout clears the catalogue representation cache. Returned JSON is reparsed so caller mutation cannot corrupt the next reuse.

This saves response payload bytes only. The handler still performs its normal cache/database read and serializes/hashes the result. Private version/ETag checks remain a future decision based on deployed measurements.

## Verification and remaining checks

The disposable local command covers Redis cross-instance delivery, private-owner filtering, rotation/revocation/abort cleanup, slow-client limits, parsing and transactional rollback/retry. Native subscription/parser/API-client tests cover zero idle polling, explicit invalidations, retry backoff and public-only 304 reuse. Hosted network behavior, real-device streaming, requests/hour and total wire bytes remain deployment/device checks.

References: https://docs.expo.dev/versions/v58.0.0/sdk/expo/ ; https://upstash.com/docs/redis/features/restapi ; https://vercel.com/docs/functions/configuring-functions/duration
