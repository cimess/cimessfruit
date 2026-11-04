# Chat, disputes and customer resolution choice

Backend/web code is grouped here; native code is in `mobile/src/features/chat`. The canonical customer page is `/chat`, linked from native bottom navigation, desktop web navigation, web mobile navigation and source-order return panels. `/admin/support` now has Chat and Disputes tabs. Existing conversations default to CHAT. Native callers formerly using /support now use /chat; the unused duplicate route/types were removed.

## Flow

Chat creates ordinary persisted enquiry threads. Disputes creates a paid-order case and its messaging thread in one Serializable transaction. The authenticated customer must own the order; affected item IDs/quantities must belong to it. The body, reason, requested resolution and up to three HTTPS evidence links are stored. One OPEN case per order is enforced in SQL. A request UUID/hash makes repeated creation idempotent. A complaint does not mint credit.

An admin reviews the messages/evidence and records responsibility, approval/rejection and explanation. Approval uses the original paid line prices and existing refund caps. Whole-order store cancellation/wrong-order approval must cover all order items. Store/rider fault on an entirely affected order includes delivery by default; partial issues and preference-based goodwill normally exclude delivery. Failed delivery/wrong-address customer cases and undetermined responsibility require an explicit exception explanation before approval. Deviating from calculated delivery policy also requires an override explanation. There is no automatic forfeiture or rigid late-report rejection. Every decision is recorded; rejected cases create no credit. Dispute resolution never automatically restocks fruit and may mark the source order RESOLVED instead of claiming a physical RETURNED event.

## 20-minute buying window — current owner-approved rule

Only administrator approval creates a ReturnCredit and refundDueAt. Opening a complaint, exchanging messages or rejecting a case creates neither money nor a spending clock. Admins can select all or part of the disputed quantities; approvedItems is stored separately from the originally reported items. Prices and refund caps remain server-calculated, and approval plus credit plus decision message commit together.

Buy again (technical key CREDIT) is the default for new cases/grants. Customers can spend the approved amount or place a replacement during the 20 minutes following approval. Choices can change during that window, but **every unused balance becomes due for a bank refund at expiry, regardless of the earlier choice**. Earlier documentation about keeping CREDIT/REPLACEMENT indefinitely or making the last choice permanent is superseded.

Spendability is a strict refundDueAt > server-time predicate in both planning and conditional checkout debits. Expired grants cannot fund a new checkout or replacement waiver. No worker must run to enforce expiry: expired balances appear as BANK_REFUND in API views and the pending-refund summary. Admin Transfer still explicitly locks a fixed bank payout after the deadline, followed by separate confirmation of an externally performed bank transfer. No real transfer is initiated automatically.

Already-reserved credit on a pending bank-top-up order is not simultaneously refunded. Cancellation/expiry releases it; if its original 20-minute deadline has passed, that released balance is also refundable, not newly spendable. Spending or changing a choice does not restart the clock.

An approved store/rider-fault replacement can waive delivery once if ordered within the window. Stock and price differences are checked normally. An unpaid cancelled replacement releases its allocation and waiver slot, but reusing that slot still requires an unexpired grant.

Home and Shop on mobile/web show only approved available credit and pending-refund amounts. They hide the card when both are zero. Financial summaries are owner-scoped/no-store; expiry triggers a one-off refresh, not a periodic API loop. Direct return/refund details remain under the source order.

## Transport and evidence

Both tabs use the existing private HTTP message API with persisted history, replies, refresh and focus/foreground reconciliation. The old native 15-second support timer was removed. Reads abort on blur/background and private chat components are keyed to the account. No sockets or new polling loop were added. Staff replies appear when the customer refreshes/resumes; live WebSocket transport is explicitly deferred. Dispute decisions integrate with existing order push events, subject to separate push activation.

Evidence currently means message descriptions and HTTPS links. Links are validated against non-HTTPS/credential-bearing URLs, stored privately with the thread and opened only by user action. The server does not fetch arbitrary evidence URLs. Direct photo uploads/private asset management and automatic rider GPS/contact-attempt logs are follow-ups, not implemented features.

Customer/admin message history now uses 20-message timestamp/ID cursors, with Load older messages. Customer conversations use owner-filtered cursor batches too; the previous 100-conversation/500-message caps are removed. Tests traverse 501 tied-timestamp messages without duplicates. WebSockets remain a separate future transport decision.

## Read in order

- `validation.ts`: reasons, choices, dispute/decision inputs and evidence constraints.
- `policy.ts`: delivery reimbursement/exception rules.
- `service.ts`: atomic case creation and admin decision/credit creation.
- `handlers.ts`: named HTTP operations with auth/role/rate/body guards and production dependencies.
- `types.ts`: UI contracts.
- `ChatClient.tsx`: customer web messaging, dispute entry and history.
- `AdminDecision.tsx`: staff decision form, mounted in existing admin inbox.
- `ResolutionChoice.tsx`: web choice/countdown, reused on the source-order page.
- `tests.ts`: fake-DB policy, ownership, decisions and deadline tests.

Native equivalents: `ChatScreen.tsx`, `ResolutionChoice.tsx`, `types.ts`, with a thin `/chat/index.tsx` account-keyed entrypoint. Checkout/return components use these choices; query/payout mutations remain in `features/returns`.

## Routes and migration

POST `/api/disputes` creates a case. POST `/api/admin/disputes/:id` records its decision. PATCH `/api/returns/:id/choice` updates the owner's choice only before the deadline. Existing `/api/support` list supports kind=CHAT/DISPUTE; thread reads/replies preserve owner/admin isolation. The web `/chat` page is authenticated by proxy as well as private API guards.

Owner applies `prisma/migrations/20261029220000_chat_disputes_choices/migration.sql` after prior migrations, **before deploying the updated generated client**. It adds thread kinds, evidence JSON, the Dispute model/relations, RESOLVED status, default bank choice, one-open-case uniqueness and decision/choice checks. Existing credits default to BANK_REFUND; review any real outstanding credits before applying. No migration, provider activation or financial transaction has been executed by this implementation.

Deployment follow-ups: actual Postgres concurrency/rollback, full/partial credits after prior refunds, choice/checkout/payout races, replacement-claim races, device/browser flows, provider push, evidence privacy and WebSocket provider/auth design. Local fixture results are not a live delivery/financial guarantee. See VERIFICATION.json for saved checks.

## Saved local checks

`VERIFICATION.json`: schema validation, API/mobile typecheck and lint passed. API 143 passed / 13 skipped (eight dispute/choice tests plus twelve related return tests); mobile's existing 23 tests passed. Android export passed to `/tmp/cimessfruit-chat-export`, followed by typecheck/lint on small account-key/copy changes. The API production build still stops at the existing Next.js TypeScript configuration parsing error, and the repository feedback instruction check failed even with network retry. No migration, real browser/device financial flow, live push, bank transfer or actual concurrent PostgreSQL test was executed.

Latest migration: owner also applies 20261029230000_buy_window_approval after earlier migrations. It changes defaults to CREDIT and adds the approved-quantity snapshot. Existing stored preferences are not rewritten; the expiry rule applies to all unspent balances. See BUY_WINDOW_VERIFICATION.json for current checks.

Latest local check totals: 146 API tests passed / 13 skipped, mobile 23 passed; schema/typecheck/lint and Android export passed. Partial approval and the Home/Shop summary are covered by fixtures. See BUY_WINDOW_VERIFICATION.json. Actual PostgreSQL races, provider delivery and device/browser flows still need migrated staging; production build retains the existing Next configuration parsing failure.

## Hybrid evidence uploads (2026-10-29)

Private R2 evidence upload, local form/file drafts and idempotent chat/reply submission are now implemented. Earlier statements limiting evidence to pasted links are superseded. See ../uploads/README.md for storage ownership, retention, migration and deployment checks.
