# Read the notification implementation here

This folder owns backend push behavior. Mobile-specific code is grouped in `mobile/src/features/notifications/`. Next.js requires route entrypoints under `app/api/notifications/`; those files only delegate here. Prisma requires its schema/migration under `prisma/`. Business handlers contain small hooks so notification records can share their database transaction.

## Read in this order

1. `events.ts`: which changes create events, safe message text, deduplication and activation gates.
2. `publisher.ts`: publish committed outbox IDs to QStash, retaining failed publications for recovery.
3. `transport.ts`: QStash HTTP publishing/signature verification and Expo send/receipt calls.
4. `worker.ts`: bounded broadcast fan-out, per-device state, eligibility, attempts, receipts and completion.
5. `handlers.ts`: authenticated installation/preferences endpoints and signed QStash worker endpoint.
Production Prisma and bounded JSON body reader dependencies are resolved inside `handlers.ts`; routes call named operations directly.
7. `tests.ts`: fake-provider scenarios; `api/tests/notifications.test.ts` is the test-runner entrypoint.

## Event to phone

Business change + outbox event commit together → backend awaits a best-effort QStash publish → QStash POSTs `/api/notifications/worker` → bounded worker sends through Expo → Expo routes to Android FCM / Apple APNs → worker checks receipts in delayed QStash invocations.

No BullMQ, permanent Node worker, Redis subscription or in-process timer is required. Redis remains the catalogue cache. Cleanup stays on the existing daily Vercel cron. QStash delivery is independent of that daily schedule; any successfully published job can execute immediately. Each publishing HTTP call has an eight-second deadline; a batch plus continuation (or failed batch plus fallback recovery scheduling) can require two calls, but errors are caught after commit so they do not turn a successful order change into a checkout failure.

Catalogue events cover newly created available products with positive stock, unavailable-to-available products with stock, and actual increases in any option stock while available. Name/price-only edits, stock decreases, zero-stock products, cancellation releases and reservation-expiry releases do not generate promotional restock events. Seed/import scripts do not notify customers automatically. Order events cover new orders, reported payment, verification/rejection, acceptance/preparation, dispatch, delivery, cancellation and expiry. No-op/idempotent order actions do not create duplicate events; event keys also enforce this in the database. Product writes use Serializable transactions when notifications are enabled.

## Endpoints

- `POST /api/notifications/devices`: native bearer session; `{ installationId, token, platform }`.
- `DELETE /api/notifications/devices`: native bearer session; `{ installationId }`.
- `GET /api/notifications/preferences`: native bearer session; catalogue consent.
- `PATCH /api/notifications/preferences`: native bearer session; `{ catalogueEnabled: boolean }`.
- `POST /api/notifications/worker`: QStash signature only; `{ eventId }`. Signature checks bind raw body, destination URL, issuer and JWT validity, with current/next signing-key support. This route alone bypasses customer-session proxy authentication. It remains protected by its signature verification.

Order preference uses the existing User.notificationsEnabled field. Catalogue consent is a new separate field, default false. Each installation has one owner/session; session logout/revocation and account deletion cascade its registrations/deliveries. Before each send, the worker checks current account activity, preference, matching owner/session/token, session expiry and platform activation. A notification already accepted by Expo cannot be recalled by a later logout or preference change.

The payload carries only safe text, event ID, kind and entity ID. Mobile validates IDs and opens internal routes, then reads the authorized API; arbitrary payload URLs are never navigated. Foreground order notices continue through the shared order store; catalogue events invalidate product queries and display a toast. OS banners are suppressed while foregrounded to avoid duplicating order toasts.

## Bounded delivery and failure behavior

Each step materializes at most 20 installations, reconciles at most 20 receipts and sends at most 20 messages. One event lease lasts two minutes, longer than the route's configured 60-second duration. A concurrent duplicate invocation receives a retryable response while the lease is held. Cursor advancement and delivery creation share a transaction; event/installation uniqueness prevents duplicate fan-out. Repeated completed events do no work.

After successful sends, a delayed QStash invocation checks receipts. More fan-out is scheduled after one second; once fan-out is done, outstanding receipt work is scheduled after 60 seconds. HTTP requests to Expo/QStash have eight-second client deadlines. QStash's HTTP delivery timeout is configured at 30 seconds; the actual QStash plan must support the selected setting. QStash publication requests specify three delivery retries. Temporary provider failures return 503; retry attempts are not infinite. Per-device send attempts stop at eight. Missing receipts stop after fifteen checks; such jobs finish FAILED/ReceiptUnavailable, not falsely marked delivered. Provider acceptance is not proof of display/read.

DeviceNotRegistered removes only the exact matching token/installation/owner/session. InvalidCredentials, MismatchSenderId and MessageTooBig are terminal for that delivery and require operator correction. Do not blindly retry them. Network timeouts can happen after Expo accepts a message: delivery is at least once and may duplicate; foreground tap handling deduplicates event IDs. Catalogue events expire after 24 hours; order events after 72 hours. Expired events stop processing.

Recovery now uses cursor pages of **20 events**, not a fixed five-event stop. Each page reads at most 21 IDs (one look-ahead), bulk-claims up to 20 still-eligible rows with `updateManyAndReturn`, and publishes those event jobs through **one QStash batch HTTP request**. If more remain, it schedules a signed `{ type: "recover", after: { createdAt, id } }` job for the next page. Each page runs in a fresh bounded Vercel invocation; the daily cron does not need to run again to process the remainder. Timestamp/ID ties are handled by the keyset cursor. Overlapping scanners publish only rows they actually claim.

HTTP 200 does not imply every QStash batch item succeeded. A partial rejection, timeout or malformed acknowledgement resets that page's still-owned publication claims; accepted items may be queued twice, which event leases/per-device delivery state handle. A continuation-publication failure does not reset event jobs already accepted by QStash. A failed post-commit kick attempts a delayed recovery job (60 seconds) without failing the business mutation. A failing recovery webhook returns 503 for QStash retry. When QStash is entirely unavailable, durable database records remain for subsequent mutation/daily recovery; initial publication failure still cannot guarantee prompt recovery without an external trigger.

An event is not a user notification count: one catalogue event can fan out to all opted-in installations, while each delivery retains its own success/failure state. Successful deliveries are not resent just because others failed. Expired events, invalid tokens, revoked permissions, terminal credential errors and exhausted attempts cannot be guaranteed successful; they must remain observable failures/skips, never falsely marked delivered. Monitor unpublished/unfinished events, FAILED deliveries, quotas, QStash logs/DLQ and expiry backlog. Batch publication reduces HTTP/database round trips, not QStash's underlying per-message quota/usage. No deployment capacity or provider delivery has been measured yet.


## Owner activation checklist — Android first

1. Review `api/prisma/migrations/20261029160000_push_notifications/migration.sql`. It adds catalogue consent and three push tables with keys/foreign keys. **Owner applies this migration before deploying the updated Prisma client, even if sending remains disabled:** existing full User queries can select the new column. No migration has been applied by this implementation. Back up/choose the intended development branch before schema operations.
2. Create/configure QStash. Set server-only `QSTASH_TOKEN`, `QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY`, and the appropriate `QSTASH_URL` from its console. Set `NOTIFICATIONS_ORIGIN` to the canonical public HTTPS API origin, without a path. The exact resulting worker URL must match the signature's subject; avoid redirects. Expose the worker to QStash: Vercel preview protection must be configured appropriately; signature validation must stay enabled.
3. Configure an Expo/EAS project and Firebase Android app with the correct package ID. Add Firebase's client `google-services.json` via an EAS file environment variable `GOOGLE_SERVICES_JSON`; `mobile/app.config.ts` consumes its path. Upload the private FCM v1 service-account credentials through EAS credential management, never into app source or EXPO_PUBLIC variables. Existing Firebase Auth is not required for this app's authentication.
4. Set the EAS project ID through linked EAS configuration or `EXPO_PUBLIC_EAS_PROJECT_ID`. Set `EXPO_PUBLIC_PUSH_ENABLED=true` for the Android native build. The installed `expo-notifications` version was selected by Expo's SDK-compatible installer. Rebuild; an existing Expo Go installation/OTA update alone cannot add native support.
5. Set server `NOTIFICATIONS_ENABLED=true` only after schema/credentials are ready. If Expo enhanced push security is enabled, configure server-only `EXPO_ACCESS_TOKEN` too. Do not expose QStash, Expo server or FCM service-account secrets to mobile.
6. Log in on an Android device with the development/internal build. In Account, use Enable device notifications. Opt into Product and restock alerts if desired; order alerts use the existing separate order preference. OS permission and account preference are independent.
7. Verify with isolated test data: available product creation, stock increase, no-op updates, all private order transitions, expiry, logout/account switch, background/tap/resume, invalid tokens and provider failure/retry. Check both Expo tickets and receipts.
8. Keep server `PUSH_IOS_ENABLED=false` and mobile `EXPO_PUBLIC_IOS_PUSH_ENABLED=false`. When Apple membership is available, configure bundle ID, APNs key/signing through EAS, enable both flags, rebuild iOS and test separately. No Apple enrollment/payment is needed for the backend/mock/Android work.

The code has not created external accounts, enabled provider settings, sent push messages, deployed, or enrolled Apple. EAS credentials/builds and QStash limits are owner activation steps, not completed tests.

Official references: [Expo setup](https://docs.expo.dev/push-notifications/push-notifications-setup/), [SDK 58 notifications](https://docs.expo.dev/versions/v58.0.0/sdk/notifications/), [Expo send/receipts](https://docs.expo.dev/push-notifications/sending-notifications/), [QStash signatures](https://upstash.com/docs/qstash/howto/signature), [QStash retries](https://upstash.com/docs/qstash/features/retry).

## Saved local verification (2026-10-29)

See `VERIFICATION.json`. API schema validation, typecheck and ESLint pass. The API suite has 136 tests: 123 pass, 13 opt-in/integration tests skip, zero fail; 18 tests specifically cover notifications. Mobile typecheck/ESLint and all 23 tests pass. Android production export passed to `/tmp/cimessfruit-push-export`; subsequent keyed settings remount/foreground deduplication changes passed typecheck/lint.

The API production build remains blocked by the recurring Next.js 16.4.1 TypeScript CLI configuration parse error. A direct invocation of Next's TypeScript CLI helper returned empty stdout with exit code zero. No dependency/config workaround was applied to hide this. Repository-required feedback instructions could not be retrieved, including on a network-enabled retry. Live DB migration/provider/device verification is not represented by the automated results.

Recovery follow-up: fake tests cover 65 events across 20/20/20/5 publication batches, overlapping claims, partial/network failures, continuation failure, delayed recovery and HTTP-200 per-item rejection. See VERIFICATION.json for current check totals.
