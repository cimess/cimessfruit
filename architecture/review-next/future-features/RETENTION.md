# Evidence, photo history and draft retention

Current rules: seven-day inactive local/unattached drafts; attached evidence and archived published product photos are preserved. Daily abandoned-upload cleanup excludes them.

Before adding deletion, decide separately:

1. Product photo history: how long old batches should remain, whether admins need a history browser and whether an independent export/backup is required. R2 storage in one place is not an independent backup.
2. Submitted evidence: duration, dispute/financial hold, access audit and account-deletion handling. Choose the policy with the business's actual obligations; no legal retention duration is assumed here.
3. Deletion: staged tombstone/grace, server authorization, reference/hold checks, a recoverable work queue, retryable remote deletion and an audit record. Never delete a referenced asset just because a product is edited.
4. Local storage: quota limits, abandoned draft listings/discard controls and optional encrypted device drafts if shared-device risk warrants it.

Acceptance: held/referenced evidence cannot be deleted; concurrent attachment defeats cleanup; remote failure retains retry state; account switching reveals no private draft; backup restoration is actually tested.
