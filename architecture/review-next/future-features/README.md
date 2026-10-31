# Future features — review before implementation

These are proposals, not enabled functionality or completed tasks. They capture missing pieces discovered during the whole-tracker review without silently introducing business policies.

| Proposal | Problem addressed | Decision needed before implementation |
| --- | --- | --- |
| [Chat realtime and delivery workflow](CHAT_AND_DELIVERY.md) | Chat replies currently need refresh/focus; no rider arrival/contact-attempt audit or paid redelivery flow | Realtime provider/runtime, rider access model, customer contact/arrival policy and redelivery fee rules |
| [Evidence/archive retention](RETENTION.md) | Submitted evidence and archived product photos currently remain indefinitely | Retention duration, dispute/legal hold, deletion grace and who may authorize deletion |
| [Operational visibility and scaling](OPERATIONS_AND_SCALE.md) | Local tests cannot establish hosted cost/capacity or alert on real provider backlogs | Monitoring destination, expected traffic, alert ownership and staged load budget |

Existing implemented SSE is for order/catalogue invalidation; it is not a WebSocket chat server. Push notifications remain separate from foreground streams. No automatic financial forfeiture, automatic bank transfer, image-history deletion or new rider permissions were added.
