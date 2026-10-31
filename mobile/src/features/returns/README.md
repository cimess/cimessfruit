# Mobile returns and replacement credit

Backend/read-through: `api/features/returns/README.md`.

- `CreditChoice.tsx`: focused checkout reads spendable credit and lets the customer apply it.
- `ReturnSummary.tsx`: focused source-order return balances, refund due time and bank details.
- `types.ts`: integer-kobo API view types; display converts to naira.

Checkout sends useReturnCredit. Order mapping exposes applied credit and bank-payment amount. Fully credit-paid checkout skips the transfer modal and opens the paid order; partial credit shows only the bank top-up. The existing shared order read/polling behavior remains in use. Return balance reads happen on focus/manual refresh, not a new polling loop.

The 20-minute deadline finalizes the customer’s last choice (default BANK_REFUND). Bank-refund balances stop being spendable then; CREDIT/REPLACEMENT stays usable. Admin Transfer subsequently locks the exact bank payout amount. Phone clock/UI text never authorizes spending or refunding: the server validates balances, ownership, deadline and lock state.

Current rule: Buy again is the default during an approval-based 20-minute window. All unused balances become bank-refund-only after expiry, including unused replacement credit. CreditBanner.tsx shows owner-scoped approved amounts on Home/Shop, shares React Query state, refreshes on focus/expiry and has no recurring HTTP timer. This supersedes earlier final-choice wording.
