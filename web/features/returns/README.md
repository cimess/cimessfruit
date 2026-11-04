# Returns, replacement credit and manual refunds

Implementation date: 2026-10-29. Backend and web UI are grouped here. Native UI is in `mobile/src/features/returns/`. Route files are thin Next.js adapters; checkout, expiry and account deletion contain integration hooks.

## The agreed behavior

1. An administrator confirms returned items and approves a return against a successfully paid order. The server calculates credit from the original line prices and quantities, not customer-supplied money. Partial returns and multiple approvals are supported without exceeding purchased quantities/order value. Delivery is excluded by default; the admin can explicitly refund its remaining fee once.
2. The customer can apply available return credit to another order. A fully covered order becomes PAID immediately, with no transfer instructions. A partly covered order reserves the applied credit and asks for only the bank top-up. Payment verification spends the reservation. Cancellation, rejection or unpaid expiry releases it.
3. Admin approval starts a server-recorded 20-minute buying window, defaulting to Buy again (CREDIT). During it, customers can use approved credit or order replacements. At expiry, **all unspent balances become bank refunds**, regardless of choice. Transfer is unavailable before the deadline and explicitly locks the bank payout afterward. Earlier last-choice/indefinite-credit behavior is superseded.
4. **Transfer — lock remainder** atomically moves the current available balance into a fixed pending-transfer amount and snapshots the customer's saved bank details. It does not call a bank API or move real money. While a transfer is pending, that entire credit grant is blocked from new checkout use.
5. The admin sends that exact amount externally, checks success and selects Confirm transferred with a bank reference. This moves locked money into refunded. Duplicate confirmations with the same reference do nothing; changing a confirmed reference is rejected. A separate audited unlock is permitted only before completion and only after the admin has checked no money was sent. There is no automatic unlock when a bank result is uncertain.

No extra worker is required for the 20-minute gate. It is enforced by server time on each Transfer request, so it works even if the page was closed or a delayed job would arrive late. Notifications are queued through the existing transactional outbox on approval, lock, confirmation and unlock, provided push is activated. The app/page must refresh or regain focus for updated return balance details; no new periodic API polling was introduced.

## Financial model and race protection

All amounts are integer NGN kobo. Each ReturnCredit maintains:

`approvedAmount = balance + reserved + spent + locked + refunded`

- balance: remaining value, spendable only when no pending transfer exists and the original 20-minute buying window is still open.
- reserved: attached to unpaid replacement orders awaiting their bank top-up.
- spent: paid into replacement orders.
- locked: frozen snapshot for a pending manual bank transfer.
- refunded: amounts the admin confirmed externally transferred.

CreditAllocation records each replacement order's amount and RESERVED/SPENT/RELEASED state. RefundTransfer records its fixed amount, bank snapshot, initiating/completing admin identifiers, reference or unlock reason. Original payment records stay SUCCESS as historical proof of payment; refund accounting is separate. Fully returned orders gain RETURNED status; partial returns retain their fulfillment status and display their return records.

Checkout, approval, transfer locking, completion, unlock and reservation settlement run inside Serializable transactions. Conditional balance/state updates reject races. A SQL conservation check rejects negative/inconsistent buckets. A partial unique index allows only one PENDING transfer per credit. Approval and transfer keys protect lost-response retries. Returned-item counts are validated against all prior approved returns. Original stock and financial writes roll back together on failure. Real PostgreSQL contention testing remains pending; unit fixtures are not proof of deployed transaction behavior.

A pending bank top-up reserves credit so it cannot also be refunded. If the top-up order is cancelled after another remainder was locked, its reservation returns to balance **without changing the existing transfer's amount/bank snapshot**. The grant remains blocked while that payout is pending. After confirmation/unlock, newly released balance can be reused only before its original deadline; afterward it needs a new bank refund; it is never silently added to a bank instruction already being acted on. The original due timestamp remains unchanged.

Checkout considers oldest available grants first, at most 100 per order; it rejects an oversized grant set rather than silently allocating an incomplete balance. Prices and stock are still checked server-side. Returned fruit is not automatically restocked: admin must explicitly mark each returned line inspected/safe to resell. Those restocks invalidate catalogue cache but do not emit marketing restock alerts.

## Read-through

- `validation.ts`: permitted inputs, bank details, 20-minute duration and domain errors.
- `credit.ts`: FIFO allocation, conditional debit and reservation settlement.
- `service.ts`: approval and manual-transfer state machine.
- `handlers.ts`: authenticated/owner/admin HTTP contracts and transactions.
- `handlers.ts` also resolves database/auth/cache/notification dependencies for live requests.
- `AdminReturns.tsx`: approve received returns, countdown, lock, bank instructions, confirm and audited unlock.
- `CustomerReturns.tsx`: source-order credit breakdown and customer bank details.
- `CheckoutCredit.tsx`: web checkout consent to apply credit.
- `types.ts`: frontend view contracts.
- `tests.ts`: deterministic ledger/checkout/auth/idempotency scenarios. The standard runner imports these through `api/tests/returns.test.ts`.

Integrations: `controllers/checkout-handlers.ts`, `services/order-maintenance.ts`, `services/admin-order-list.ts`, `controllers/account-deletion.ts`, web admin/orders/checkout, and mobile order service/types/checkout/detail.

## HTTP entrypoints

- GET `/api/returns/balance`: authenticated customer's currently spendable total.
- GET `/api/returns/orders/:orderId`: customer's own return/bank/transfer details.
- PATCH `/api/returns/:creditId/bank`: customer-owned Nigerian bank details; blocked while transfer is pending.
- GET/POST `/api/admin/returns/orders/:orderId`: admin view/approval, with item quantities, inspection/restock flags, reason, optional delivery refund and idempotency UUID.
- POST `/api/admin/returns/:creditId/transfer`: admin action `transfer` + UUID key, `confirm` + transfer ID/reference, or `unlock` + transfer ID/reason. Amounts are never accepted from this request.

Responses are private/no-store. Bank details are only exposed to the customer owner and authorized admins. Notifications never include bank details. Account disabling preserves balances, reservations, refunds, bank details and the customer link. It revokes sessions without cancelling financial obligations. Verified reactivation restores access to the same account.

## Migration and activation

Owner must review and apply `prisma/migrations/20261029190000_returns_credit/migration.sql` **before deploying this generated Prisma client**, after earlier pending migrations. It adds RETURNED enum values, Order.creditApplied, ReturnCredit/ReturnedItem/CreditAllocation/RefundTransfer tables, FKs, indexes and financial CHECK/partial uniqueness constraints. No migration has been applied by this implementation. No real funds were moved and no live refunds/returns were created.

After owner migration application, test in an isolated development/staging environment: partial/full returns, delivery fee policy, inspection/restock, full/partial credit checkout, top-up verification/cancel/expiry, simultaneous checkout versus Transfer, simultaneous admin transfers, repeated/lost responses, bank edits during locking, cancellation during pending transfer, account switching/deletion and notification receipt. Confirm actual bank outcome before using Confirm transferred; automatic verification of bank-account ownership or transfer success is not implemented.

No daily cron or QStash schedule was changed for refunds. Push must be separately activated. Deployment checks and real-device UI checks remain pending.

## Saved checks

`VERIFICATION.json` records local results: 135 API tests passed / 13 skipped, including 12 return/refund tests; schema/typecheck/lint passed; all 23 mobile tests passed and Android export passed. Later copy/guard changes were checked with typecheck/lint and targeted return/order/stock tests. API production build still fails at the existing Next.js TypeScript configuration parsing step; feedback instructions could not be retrieved even with network retry. No live PostgreSQL financial contention test, schema application, device refund test, provider push or bank transfer was performed.

Choice/dispute integration is described in ../chat/README.md. That later owner-confirmed final-choice rule supersedes the earlier “spend until Transfer” behavior.

Home/Shop approved-balance cards and per-line partial dispute approval are documented in ../chat/README.md. The latest rule always refunds unspent money after 20 minutes; it supersedes earlier final-choice wording in historical verification notes.
