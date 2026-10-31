# User email identity and local lookup review

Reviewed 2026-10-28. The application's existing identity policy treats email as case-insensitive. The canonical form is now consistently **trim surrounding whitespace, validate the email, lowercase it**. Dots and `+suffix` parts are preserved; no provider-specific mailbox alias merging is performed. Password contents and phone-number formatting are not changed by this email policy.

## Changes

- Signup trims email before validation, stores its canonical form and checks duplicates with `findUnique({ where: { email } })`.
- Password login normalizes the submitted identity and uses exact unique email or phone lookup. Password hashing/comparison, rate limits, inactive-account rejection and browser/native session issuance retain their previous behavior. Session responses never include the password hash.
- Auth.js adapter `createUser`, email-bearing `updateUser` and `getUserByEmail` share the email schema. The Google sign-in eligibility check also uses canonical email. Google's verified-email requirement, disabled-account checks and Auth.js's default account-linking protection remain in place. Normalization does not enable automatic account linking.
- Recovery, verification and deletion-request handlers use the same schema and exact lookup. Their rate-limit keys use canonical email, while public responses remain generic. Existing token consumption/session revocation rules are unchanged.

Browser password login and native login/signup share the mobile-named API routes, so these changes apply to both clients. The password-login handler was extracted behind dependencies to verify queries and session response behavior without issuing real sessions in tests.

## Existing data and uniqueness

The read-only local audit found **1 email, 0 noncanonical values and 0 canonical collision groups**. No stored users or credentials were modified.

`User.email` already has the unique B-tree index `User_email_key`. Canonical exact equality matches that existing index, so no new `lower(email)`, trigram or duplicate email index was added. Phone already has its own unique index. Primary-key profile reads remain separate.

The database index enforces uniqueness of stored values, not normalization of arbitrary SQL/import writes. Before adopting this code with another database or importing users, audit existing email values and canonical collisions. Resolve any conflicting accounts deliberately; do not automatically merge accounts or rewrite credentials. All application email writes must pass through the canonical schema/adapter. No database CHECK constraint or data migration was applied during this task.

## Local measurements

`npm run bench:email` from `api/` performs a local-host-only, read-only audit and compares 30 alternating warm SQL lookup samples. It reports aggregate counts, allowlisted plan metadata and index definitions without printing account email values or full plan expressions.

| Measurement | Previous case-insensitive lookup | Canonical exact lookup |
| --- | ---: | ---: |
| Median SQL round trip | 0.197 ms | 0.200 ms |
| 95th percentile | 0.494 ms | 0.475 ms |
| Observed local plan | Sequential scan | Index scan on User_email_key |

At one account these timings do not establish a speed improvement. The result verifies index compatibility, not performance at scale. Bcrypt, authentication/session queries, HTTP and deployed network costs are excluded.

## Verification

TypeScript and ESLint pass. Automated tests cover normalization before validation, preserved `+suffix`/dots, malformed email rejection, canonical OAuth adapter reads/writes, unchanged account-link delegation, exact password-login queries, phone login, password-hash exclusion, inactive/missing/passwordless accounts, rate limits and canonical recovery/deletion lookups. Full API suite: **96 passed, 7 database integration tests skipped** without TEST_DATABASE_URL.

Remaining checks: actual Google OAuth and browser/native sign-in/recovery round trips, representative-volume local benchmarks, and a fresh normalization/collision audit before any imported database is adopted. No external email was sent and no live OAuth flow was run by these tests.

References: [Auth.js adapter methods](https://authjs.dev/reference/nextjs/adapters), [Google verified email](https://authjs.dev/reference/core/providers/google), [OAuth account-linking defaults](https://authjs.dev/reference/core/providers).
