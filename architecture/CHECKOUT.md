# Web checkout and manual transfers

Customers open **Bag → Proceed to checkout**, enter their Abesan Estate address,
and continue to transfer. The server checks current prices and stock, reserves
the selected quantities, and saves an order before displaying the exact amount.

Transfer details match the mobile app: Moniepoint, 6645847720, Aimuan Enterprise.
These are maintained in `validation/checkout-validation.ts`. Both mobile and web create real server orders before displaying bank details.

After transferring, the customer selects **I have paid**. This records
`REVIEW_REQUIRED`, never successful payment. In **Admin → Orders & payments**,
an administrator checks the bank account and verifies or rejects the transfer.
Verification records the admin ID and confirmation time. Rejection cancels the
order and returns reserved stock; it does not send a refund.

Unpaid orders may be cancelled by their owner. A reported transfer must be
reviewed by the store. Unreported reservations expire after 24 hours. The protected `/api/cron/maintenance` worker is configured for daily Vercel Hobby cleanup; eligibility ends at 24 hours and stock is released on the next successful daily run; use `npm run db:cleanup` for manual local backlog processing. See WORKERS.md. Reported transfers remain reserved for admin review.
Order details can be reopened from My orders to resume payment or refresh status.

The delivery migration adds Abesan Estate with a ₦500 fee and 30–60 minute
estimate without overwriting an existing zone. Existing zone settings remain
authoritative. Delivery time is shown as an estimate after verification.

## Routes

- GET /api/checkout — delivery settings and saved address (signed in).
- POST /api/checkout — `items: [{productId, optionId, quantity}]` and
  `deliveryAddress`; requires an Idempotency-Key. Prices and status are not accepted.
- GET /api/orders/:id — owner-only order and transfer instructions.
- POST /api/orders/:id — `{"action":"reported"}` or `{"action":"cancel"}`.
- GET /api/admin/orders — latest 100 transfer orders, admins only.
- POST /api/admin/orders/:id — `{"action":"verify"}`, `{"action":"reject"}`, `{"action":"process"}`, `{"action":"dispatch"}` or `{"action":"deliver"}`.
- GET /api/orders — current user’s latest 100 orders.

Amounts are integer kobo. Order writes, stock reservations/restoration and payment
transitions run in serializable database transactions. Retries with the same
checkout key return the same order; a different payload with that key is rejected.
No Paystack integration or automatic bank verification is used in this flow.

## Availability checks before payment

- `POST /api/checkout/review` reviews every product/size/quantity against current
  database stock and prices, plus delivery availability. It does not create an
  order or reserve stock. Invalid baskets have no payable total.
- Bag and checkout show per-item requirements; checkout also requires a complete
  delivery address and phone number before enabling Continue to transfer.
- Adding a product fetches its current public product details first. Browser
  stock snapshots are not sufficient proof of availability.
- `POST /api/checkout` repeats all checks inside the stock-reservation transaction;
  a preview never overrides this final check.
- Order details and idempotent checkout replays recheck product and delivery
  availability before returning bank details. A reserved order does not need
  additional free stock: its quantity was already deducted at creation.
- The page rechecks every 30 seconds and on window focus. When blocked, no bank
  instructions appear. Customers who already transferred before a change can
  still report the transfer for manual review; reporting is not proof of payment.

Return credit is supported through features/returns: full credit creates a paid order; partial credit reserves the applied amount and requires only the bank top-up. Verification spends reserved credit, while unpaid cancellation/rejection/expiry releases it. Admin Transfer locks the available remainder after the 20-minute due time; manual transfer confirmation is separate. See ../api/features/returns/README.md.

Later customer-choice rule: after approval customers have 20 minutes to change BANK_REFUND/CREDIT/REPLACEMENT. The last choice is final; BANK_REFUND is the default. Bank-refund balances stop being spendable at that deadline, while CREDIT/REPLACEMENT stays usable. Admin Transfer locks only a bank-refund payout. Approved store/rider-fault replacements can waive delivery once. See ../api/features/chat/README.md.
