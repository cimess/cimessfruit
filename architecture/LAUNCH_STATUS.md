# Launch status — 19 October 2026

## Implemented

- Mobile live catalogue, per-option stock, conversion from server kobo to displayed naira.
- Mobile server checkout before transfer instructions; server authoritative prices/stock/address validation; idempotent retries.
- Transfer reporting remains REVIEW_REQUIRED until admin verification.
- Persistent customer order list/detail and mobile polling; private data cleared on sign-out.
- Admin preparation, dispatch and delivery with guarded sequential transitions.
- 24-hour unpaid reservation expiry and maintenance command. Reported transfers stay reserved for review.
- Web/mobile recovery entry points; one-use 30-minute email links; password reset revokes sessions and handoffs; email verification.
- Fixed mobile lint errors around Animated values and redundant profile state synchronization.
- Updated setup/checkout documentation and production build command.

## Verified

- All 62 API tests passed with a newly initialized PostgreSQL 16 database and all four migrations. No existing application database was reset or used for these tests.
- All 12 mobile API-client tests passed.
- API production build passed with webpack, including TypeScript and page generation. Turbopack's CSS worker cannot bind its port in this environment; webpack is now the build default.
- Prisma schema validation passed.

## External activation still required

- `RESEND_API_KEY` and `MAIL_FROM` are missing locally. Configure a verified Resend sender and key in the server environment. Recovery fails closed without configuration. Real email delivery has not been exercised.
- Google credentials are present locally. Complete Google OAuth and keychain/session restore checks on a physical native build with a reachable HTTPS backend and matching Google redirect URL. No real Google account was authorized during this work.
- Deploy the API and schedule `npm run db:cleanup` every five minutes with its database environment. This workspace does not establish a production scheduler or hosting destination.
- Complete a real-device checkout → transfer report → admin verification → delivery walkthrough. No real bank transfer was initiated.

## Manual acceptance

1. Browse live stock on a phone, place an order, and confirm its total matches the web/admin record.
2. Close/reopen the app; reopen the pending order from Orders and resume transfer reporting.
3. Report payment; verify that the app shows awaiting verification, never confirmed payment.
4. In admin, verify receipt then prepare, dispatch and deliver. Observe updates in mobile.
5. Request a recovery email, reset the password and verify old sessions no longer work. Reusing the link must fail. Test email verification separately.
6. Run scheduled maintenance against intentionally expired unpaid test orders; verify stock is restored once and reported transfers remain reserved.

Final mobile checks: TypeScript and lint passed; Android production JavaScript/Hermes export completed successfully at `/tmp/cimessfruit-mobile-export`. This is a bundle validation, not a signed APK or physical-device test.

Provider implementation follows https://resend.com/docs/api-reference/emails/send-email. Expo SDK 57 APIs were checked against https://docs.expo.dev/versions/v57.0.0/.
