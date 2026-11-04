# CimessFruit

Next.js customer website, admin workspace, and API with PostgreSQL/Prisma and Auth.js. The Expo app in `../mobile` uses the same accounts, live catalogue, checkout and order history.

## Setup

Use Node 22.13+ (Node 24 tested), PostgreSQL 16+, and `npm ci`. Copy `.env.example` to `.env` and configure the database, auth secret, auth URL and Google credentials. Run `npm run db:deploy`, then `npm run dev` (or `npm run dev:mobile` on port 3001).

Google uses a Web OAuth client with the exact `<AUTH_URL>/api/auth/callback/google` redirect. Native login returns through `cimessfruit://auth/callback` with a one-use handoff. Set `EXPO_PUBLIC_API_URL` in mobile to the reachable API origin. Use HTTPS for production and physical-device Google testing.

## Current features

- Customer signup/password and Google sign-in, profile and password management.
- Public live product catalogue and admin product management.
- Server-priced checkout with idempotency, stock reservation, persisted orders and manual bank transfer.
- Customers report transfers; administrators verify actual receipts or reject them.
- Verified orders advance PAID → PROCESSING → DISPATCHED → DELIVERED.
- Web and mobile order history refresh from the server.
- Password recovery and email verification through `/recover`; requires `RESEND_API_KEY` and a verified `MAIL_FROM` sender. Links last 30 minutes, are one-use and stored hashed. Resetting a password revokes sessions and pending mobile handoffs.

## Operations

Unreported unpaid reservations expire after 24 hours. `GET /api/cron/maintenance` releases stock in up to ten transactional batches of 20, with a 40-second loop budget; authorize with `Bearer <CRON_SECRET>` (server-only, at least 16 random characters). `vercel.json` schedules it daily at 02:00 UTC (03:00 Lagos, within Vercel Hobby’s hourly scheduling window). It activates after production deployment with CRON_SECRET configured. Eligibility ends at 24 hours; status/stock cleanup waits for the next successful daily run. See [worker operations](../architecture/WORKERS.md). Reported transfers remain reserved for admin review. Expiry records CANCELLED/FAILED with reason reservation_expired; it does not refund money.

For local/manual backlog processing, run `npm run db:cleanup`. It drains all reservation batches and additionally removes expired sessions, handoff grants, verification tokens and rate limits. The HTTP worker deliberately handles bounded order-expiry batches per call; retry when moreMayRemain is true.

Amounts in API responses are integer NGN kobo; mobile converts them to naira for display. Custom smoothie surcharges are not supported by server checkout and are disabled in live catalogue entries.

## Verification

`npm run db:validate`, `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build`.

Set `TEST_DATABASE_URL` to a **disposable migrated database** to include integration tests. The test runner uses in-process isolation so individual tests and skipped database tests are reported accurately. The production build uses webpack because Turbopack's CSS worker cannot bind its port in this environment.

See [LAUNCH_STATUS.md](../architecture/LAUNCH_STATUS.md) for verified results and remaining external activation. [CHECKOUT.md](../architecture/CHECKOUT.md) describes the checkout contract. `../architecture/API.md` describes the historical deleted server; current routes are under `/api`, not `/api/v1`.

Architecture and implementation notes: [documentation index](../architecture/README.md).

## Push notifications

Implementation and read-through guide: [server/notifications/README.md](server/notifications/README.md). The owner must apply the new push migration before deploying the updated generated client. Sending is disabled by default; Android activation needs QStash/Expo/FCM credentials and a native build. iOS remains deferred. No Apple payment or live push activation was performed.

## Returns and manual refunds

See [features/returns/README.md](features/returns/README.md). An admin approves a received return; the customer can spend its credit on replacement checkout. After 20 minutes, Transfer locks the available remainder for a manual bank transfer; Confirm transferred records completion separately. Apply the owner-reviewed returns migration before deploying the generated client. Real database contention/device checks remain pending.

## Following an API request

Routes in `app/api` call named operations directly in `controllers`, feature `handlers.ts` files, or a service for simple data operations. For example, `app/api/orders/route.ts` calls `listOrders` in `controllers/checkout-handlers.ts`. There is no intermediate composition or runtime wiring file.

Each handler module owns its production dependencies and loads server resources when called. Operations accept optional dependencies for isolated tests; the existing factory exports are compatibility adapters for tests and benchmark scripts, not part of the route call path. Keep authentication, validation, and HTTP error mapping in handlers, and substantial reusable business rules in services.

Realtime streaming lives in `features/realtime/stream.ts`, including session checks and a shared handler that preserves per-account connection limits.

### Support email inbox

Admins can open `/admin/support/emails` (Support email in the sidebar) to read,
reply to, close, and reopen incoming email requests. Customer chat remains at
`/admin/support`.

Set these server environment variables locally in `api/.env` and in production:

- `RESEND_API_KEY`: a Resend key with receiving and sending access.
- `RESEND_WEBHOOK_SECRET`: the signing secret (`whsec_...`) from the webhook details.
- `SUPPORT_EMAIL_ADDRESS`: `support@cimessfruit.cimessinvest.com`.
- `MAIL_FROM`: a verified Resend sending address, optionally with a display name.

Enable receiving for the support domain in Resend and install its required MX
record. Subscribe a Resend webhook to `email.received` with destination
`https://cimessfruit.cimessinvest.com/api/support`. The handler verifies the raw
body, fetches message content from Resend, and stores matching support mail once.
See [Resend receiving content](https://resend.com/docs/dashboard/receiving/get-email-content)
and [signature verification](https://resend.com/docs/webhooks/verify-webhooks-requests).

Before running the updated server, apply the existing support-email migration
with `npm run db:deploy` from `api`, then build and restart the server. Attachments
are listed by filename; open Resend to download them. Confirm production setup by
emailing the support address and replying from the admin inbox.
