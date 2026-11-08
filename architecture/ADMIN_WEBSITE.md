# CimessFruit website

The Next.js app in `api` serves both the customer website and admin workspace.
Run `npm run dev` and open `http://localhost:3000`.

## Customer pages

- `/`: home, category links, and featured products from the real catalogue.
- `/shop`: public product listing, search, categories, size selection, stock-aware bag additions.
- `/cart`: browser-persisted shopping bag, quantities, removal, and subtotal in naira.
- `/signup`: normal name/email/phone/password signup or Google signup.
- `/login`: email/password or Google sign-in, using the same accounts as mobile.
- `/account`: customer profile, editable name/phone/update preference, and account navigation.
- `/account/security`: explicitly chosen password changes; never a second signup step.
- `/orders`: the signed-in user's 50 most recent persisted orders and items.

Catalogue prices are stored as integer kobo and displayed in naira. Bag contents
are saved locally in this browser, not synchronized to mobile or a server cart.
Checkout persists orders and reserves stock. Admins verify or reject reported bank transfers, then advance verified orders through preparation, dispatch and delivery. See CHECKOUT.md. Mobile uses the same catalogue and order API.

## Signup and Google password setup

Normal signup stores the supplied password hash once and goes directly to the
account page. It does not ask the user to create another password afterward.

Google success returns to `/auth/complete`. Only an authenticated account with a
linked Google provider and no existing password sees the optional password and
confirmation form. Google does not share the user's Google password. The user
creates a separate CimessFruit password, stored on the same account, for future
email/password login on web or mobile. Existing password users skip this screen.
The mobile Google browser handoff has the same first-password condition.

The existing cookie-based browser login uses `/api/mobile/login`; signup uses
`/api/mobile/signup`. `POST /api/account/password` supports first-password setup
for authenticated Google users and password changes with the current password.
Changes revoke all sessions; first-time setup preserves the Google handoff.
Forgotten-password recovery and email verification are available at `/recover` after configuring the mail provider.

## Admin sign-in and authorization key

1. Open `/admin-login` (also linked in the storefront footer and account page).
2. Sign in or create a normal account. Existing administrators go to `/admin`.
3. A customer account enters the store owner's authorization key.
4. Successful activation changes only that authenticated user's role to ADMIN,
   revokes its existing sessions, and asks the user to sign in again.
5. The admin workspace can list, create, edit, archive, and restore products.

The server reads `ADMIN_AUTHORIZATION_KEY` from its runtime environment or,
locally, `web/.env`. Set a strong random key of at least 32 characters and share
it only with intended administrators. Set it separately in the production
server environment for the deployment you are using, then restart or redeploy.
Both missing and shorter keys return the same "Admin activation is not configured"
response. Server logs identify which condition failed without exposing the key.
An existing process environment variable or a higher-priority `.env.local` file
can override `web/.env`.
Never put it in a `NEXT_PUBLIC_` or `EXPO_PUBLIC_` variable, a URL, a client bundle,
or a committed file. Restart/reload the server after changing it.

The activation endpoint is `POST /api/account/admin-access` with JSON
`{ "authorizationKey": "..." }`. It requires an active session, uses the
existing same-origin browser checks, rate-limits attempts, and uses a constant-time
key comparison. It accepts no target user ID or role. Missing/short server
configuration fails closed. The key is reusable until rotated; rotating it stops
future use of the old key but does not remove roles already granted. Admin-only
APIs continue enforcing role checks independently of the UI.

## Google configuration

Configure `AUTH_SECRET`, `AUTH_URL`, `AUTH_GOOGLE_ID`, and `AUTH_GOOGLE_SECRET`.
Google must allow the exact callback `<AUTH_URL>/api/auth/callback/google`.
Use HTTPS outside localhost. See AUTH_SETUP.md for the existing setup.

## Validation

Run `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build`.
Database integration tests need a migrated disposable `TEST_DATABASE_URL`.

Manual checks: normal signup goes directly to account; fresh Google signup shows
password setup only after successful authentication; existing-password accounts
skip setup; guests can browse products; unauthenticated activation is rejected;
wrong keys cannot promote a customer; the correct key promotes that account and
requires a fresh login; admins can manage products; customers cannot call admin APIs.
