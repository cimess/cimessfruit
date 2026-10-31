# Chat realtime, delivery evidence and redelivery

## Realtime chat

Current: authorized HTTP thread history, cursor pagination, local drafts, evidence uploads and manual/focus refresh. Order/catalogue SSE is implemented separately and disabled until activation.

Proposed: use a provider/runtime that supports the required WebSocket connections, or explicitly approve chat invalidation over the existing SSE path. Do not put an unsupported persistent WebSocket server inside a Vercel function. Preserve HTTP history as authority. Define customer/admin room authorization, token lifetime/revocation, ordering, reconnect catch-up, duplicate handling and attachments. Add typing/read indicators only if needed; each creates traffic and state.

Acceptance: another customer cannot join/read a room; logout and expired sessions lose access; messages committed during reconnect appear once; unavailable realtime falls back to history; real-device foreground/background transitions are measured.

## Arrival and contact evidence

Current system has CUSTOMER and ADMIN roles; it has no trusted rider identity/arrival/contact-attempt workflow. Add a rider/dispatch authorization model before accepting device-submitted arrival claims.

Proposed records: assigned delivery actor, server receipt time, delivery stage, permitted location evidence, contact attempts and support review. Define who may submit/correct these and which data is retained. A device timestamp/location alone must not automatically authorize forfeiture or reject a refund.

## Redelivery

Define an approved redelivery request linked to the original order, inventory/return inspection, a new quoted delivery fee, payment confirmation and an auditable dispatch action. Specify whether original delivery/fees are refundable for each responsibility scenario. Keep paid bank refunds manually locked/confirmed under the existing flow.

Owner decisions needed: waiting/contact policy, report deadline, eligibility period, responsibility exceptions, fee calculation and who authorizes redelivery. No competitor policy is adopted automatically.
