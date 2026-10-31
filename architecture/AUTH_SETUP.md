> Current status (19 October 2026): Google credentials are configured locally. Mobile catalogue, checkout and order history now use the API. Password recovery and email verification are implemented; email provider settings and physical-device verification remain outstanding. See LAUNCH_STATUS.md. Stage-specific statements below are historical.

# Stage 1: Prisma and Auth.js

This stage uses Next.js App Router, Prisma 7/PostgreSQL and Auth.js v5 with Google OAuth and database sessions. Google creates a user on first sign-in. Mobile clients also support password signup/login through `/api/mobile/*`.

## Setup

1. Run `npm install` in `api`.
2. Add the variables from `.env.example` to `.env`, preserving your database URL. Generate `AUTH_SECRET` with `openssl rand -base64 32`.
3. Create a Google OAuth **Web application** client. Configure `http://localhost:3000` as an authorized JavaScript origin and `http://localhost:3000/api/auth/callback/google` as an authorized redirect URI. Set `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET`. Add test users if the Google consent screen is in testing mode.
4. On a fresh database run `npm run db:deploy` to apply the checked-in initial migration. Use `npm run db:migrate -- --name description` for future schema changes. Do not apply the legacy `db/migrations/001_initial.sql`; it belongs to the deleted server. Existing databases need a deliberate data migration, not a reset.
5. Run `npm run dev` and open `/login`.

For production, configure `AUTH_URL` and Google's origin/redirect URI for your HTTPS domain. Set `AUTH_TRUST_HOST=true` only if your deployment's reverse proxy controls the host headers.

## Files and routes

- `prisma/schema.prisma`: Auth.js users, OAuth accounts, sessions and verification tokens; shop products/options, delivery zones, orders/items and payments.
- `prisma.config.ts`: standard Prisma CLI configuration.
- `server/database/prisma.ts`: reusable PostgreSQL client.
- `auth.ts`: Google provider, Prisma adapter and database sessions.
- `proxy.ts`: validates browser sessions with `await auth()` or native bearer sessions; handles guest access, RBAC, and write-origin checks.
- `server/auth/current-user.ts`: returns the validated session user without a second profile lookup. Reuse in every protected handler/action; use `requireUser("ADMIN")` for admin operations and enforce resource ownership in queries.
- `app/api/auth/[...nextauth]/route.ts`: Auth.js standard GET/POST endpoints, including the Google callback.
- `app/login/page.tsx`: email/password sign-in and automatic sign-up with Google.
- `app/api/account/password/route.ts`: authenticated first-password setup and password changes.
- `app/account/page.tsx`: protected account page and sign-out action.
- `app/api/me/route.ts`: returns the current safe user profile, or HTTP 401; never cached.

Auth.js owns its auth endpoint catch-all. Other features should get their own `app/api/<feature>/route.ts` files. No custom router or custom server is needed.

## Schema decisions

All amounts are integer kobo (NGN). SQL migration checks enforce positive prices/quantities, nonnegative stock/fees and matching totals. Order items and addresses retain checkout snapshots. Users default to CUSTOMER; Google cannot choose a role. OAuth users need no phone or password. Account and session records cascade when a user is deleted; order history is protected from deletion. Disabled users cannot access protected app data.

## Verify

Run `npm run db:validate`, `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build`. Database integration tests are skipped unless `TEST_DATABASE_URL` points to a disposable PostgreSQL database with the migration applied; run `TEST_DATABASE_URL=... npm test` to include them.

With credentials and the database configured: visit `/account` signed out (redirect to `/login`), call `/api/me` (401), sign in using Google, confirm the user/account/session rows, reload and sign out. Returning Google users should reuse their existing user record. Setting `isActive=false` must deny `/account` and `/api/me`, including with an existing cookie.

Product, checkout and payment handlers are future stages; this stage defines only their database models. The older API.md and backend sections in ../api/README.md describe the deleted server, not this implementation.

References: [Auth.js Prisma adapter](https://authjs.dev/getting-started/adapters/prisma), [Google provider](https://authjs.dev/getting-started/providers/google), [Next.js Proxy](https://nextjs.org/docs/app/api-reference/file-conventions/proxy).

## Real mobile auth and session contract

Both Auth.js session responses and `/api/me` return the safe fields `id`, `name`,
`email`, `image`, `phone`, `role`, and `isActive`. Nullable fields remain null.
Passwords, hashes, OAuth tokens, and session internals are excluded.
The server uses the validated session profile; it no longer queries the user a
second time in `getCurrentUser()`. Database validation remains intentional for
immediate role changes, deactivation, and revocation. Proxy and handlers validate
independently; client profile JSON and identity headers are never authority.

- `POST /api/mobile/signup`: name, email, phoneNumber, password, optional deliveryAddress.
- `POST /api/mobile/login`: emailOrPhone and password.
- `POST /api/mobile/exchange`: one-use Google handoff code and verifier.
- `POST /api/mobile/logout`: revokes the current session.
- `GET /api/me`: current safe user, or 401.
- `GET /api/profile`: authenticated profile and saved delivery address.

Native login responses contain `{ user, token, expires }`. Mobile stores this in
Expo SecureStore and sends `Authorization: Bearer <token>` through `src/lib/api.ts`.
Only a SHA-256 hash of a native credential is stored in the database. Sessions
expire after 30 days and require sign-in again. Browser password responses set
an HttpOnly/SameSite=Lax cookie and return `{ user, expires }`; browser fetches
use `credentials: "include"`. Browser clients must use the same API origin;
cross-origin credentialed browser access is not configured.

Google mobile login uses the existing Auth.js web OAuth flow in the system browser.
`/mobile-auth` asks the user to continue to the app, then returns a 60-second,
one-use code to the `cimessfruit://auth/callback` URI. For Expo Go during `next dev`,
set `MOBILE_DEV_CALLBACK_URL` to the exact callback generated by Expo, for example
`exp://192.168.0.197:8081/--/auth/callback`, then restart the API. Update it if the
Metro host or port changes. Only that exact Expo URL is allowed in development;
production accepts only the native callback. The callback is preserved through
Google sign-in. The browser opens it directly and provides a manual link if the
automatic handoff is blocked. The app verifies the callback destination and state
and redeems the code with a locally generated secret whose SHA-256 challenge was
sent when sign-in started. The session credential is never placed in a deep link.
Google still uses the existing web OAuth client and `/api/auth/callback/google`.
Google accounts are not automatically linked to password accounts by matching
email; use the original sign-in method for existing accounts. Password signup
does not mark email as verified. Signed-in Google users can set a separate
CimessFruit password on the account page or mobile handoff page; the same account
then supports email/password login. Existing password changes require the current
password and revoke all sessions. Email verification and forgotten-password
recovery are not implemented.

## Proxy access policy

Public pages and catalog GET/HEAD requests allow guest mode. `/account` requires
a user. Other APIs are private by default, except the three mobile login/signup/
exchange endpoints. `/admin`, `/api/admin`, and catalog mutations require ADMIN.
Auth.js endpoints and known static assets are excluded from Proxy. All protected
handlers must independently validate identity, roles, and resource ownership.
The internal `x-auth-mode` header is a UI hint only, never authorization.

Browser writes require the same Origin and reject cross-site requests. Native
writes can omit Origin only without cookies or browser fetch metadata and with
bearer authentication (or on the explicit public mobile auth endpoints). Merely
supplying an Authorization header never grants access: its session is validated.
Auth.js retains its own CSRF/OAuth protections. Invalid sessions become guests;
private APIs return 401 and private pages redirect to `/login`. Invalid browser
session cookies are expired. Private responses are not cached.

Passwords use bcrypt cost 12, require 12–72 characters and at most 72 UTF-8 bytes.
Login/signup are limited to 10 attempts per normalized identity per 15-minute
window using shared database counters. Configure deployment-level IP/global
limits as well for distributed abuse; client-supplied forwarding headers are not
trusted as rate-limit identities. Periodically delete expired `AuthRateLimit`,
`MobileAuthGrant`, and `Session` rows with a scheduled maintenance job.

## Enable and verify

1. Apply the additive migration with `npm run db:deploy` in `api`.
2. Configure `AUTH_SECRET`, `AUTH_URL`, and Google credentials in the API environment.
3. Set `EXPO_PUBLIC_API_URL` in mobile (reachable LAN URL for development, HTTPS in production).
4. Rebuild the native app to register the `cimessfruit` scheme and Expo Crypto module.
   Use a development/native build for the OAuth callback, not Expo Go.
5. Check password signup/login, Google sign-in, cold-start restore, logout, invalid/
   expired tokens, disabled users, and ADMIN denial on a physical device.

Both migrations have now been applied to the configured local database. Live OAuth
and device validation still require Google credentials and a native app build.
The auth and profile mocks are removed; unrelated catalog/order/payment mock
services are outside this auth change.

Expo references: [WebBrowser](https://docs.expo.dev/versions/v57.0.0/sdk/webbrowser/),
[Crypto](https://docs.expo.dev/versions/v57.0.0/sdk/crypto/).

### Validation in this workspace

API and mobile TypeScript checks pass; API lint and lint for changed mobile auth
files pass. Seventeen auth/proxy unit tests pass. Three database integration
tests are skipped without `TEST_DATABASE_URL`. Full mobile lint currently reports
37 errors and one warning in existing account/checkout/shop screens. Production
build verification is blocked here: Turbopack cannot bind its worker port, and the
webpack fallback cannot parse the TypeScript subprocess configuration output.


## Local activation completed

The configured local PostgreSQL database now has both migrations. `api/.env`
contains a generated auth secret and the local auth URL; `mobile/.env.local`
points at this computer's Wi-Fi address on port 3001. These files are ignored by
Git. Port 3000 belongs to another service and was left running.

Start the API with `npm run dev:mobile` in `api`. Restart Expo after environment
changes, and keep the phone on the same Wi-Fi as this computer. If the computer's
LAN address changes, update both local URL settings. Never use the development
HTTP setup for production credentials.

Run `npm run test:auth-live` against the running API to verify real signup, login,
profile access, RBAC, disabled users, expiry, mobile handoff proof/replay checks,
and logout. The script creates a unique temporary user and deletes its fixtures.
The live suite passed against the configured database. It does not authorize a
real Google account or exercise a phone's keychain.

Prisma PostgreSQL connections now explicitly request UTC. This fixes an observed
one-hour offset in timestamptz reads that allowed recently expired sessions to
remain usable. The live test checks expiry just one minute in the past.

Google credentials are not configured yet. Add `AUTH_GOOGLE_ID` and
`AUTH_GOOGLE_SECRET` to the ignored API environment file. For physical-device
Google testing, configure a reachable HTTPS backend domain/tunnel, use its origin
for both API URL settings, and register its `/api/auth/callback/google` URL with
Google. The LAN HTTP address works for password testing but is not an eligible
Google web OAuth callback. See [Google redirect URI rules](https://developers.google.com/identity/protocols/oauth2/web-server#uri-validation).

## Customer website and admin activation

The website now has public home/shop/bag pages, normal signup, customer profile
and persisted order history. Google returns to `/auth/complete`: only a linked,
authenticated Google account without a password gets first-password setup. Normal
signup uses its original password and skips this extra step.

`/admin-login` provides dedicated admin entry. Authenticated customers can activate
admin access using `ADMIN_AUTHORIZATION_KEY` through `/api/account/admin-access`.
The key stays server-only, has a minimum length of 32 characters, and attempts
are rate-limited. Activation revokes the account's sessions and requires sign-in
again. See ADMIN_WEBSITE.md for setup, rotation, and route details.
