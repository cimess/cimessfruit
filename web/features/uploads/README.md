# Cloudflare uploads and device drafts

Implemented 2026-10-29. This folder owns storage, upload lifecycle, browser drafts, upload controls and manual cleanup. Native counterparts are in `mobile/src/features/uploads/`. Product and chat controllers attach assets within their existing database save transactions.

## Product flow

1. Edit product details. Browser IndexedDB autosaves the form, enabled sizes, selected image and save reference per account/product.
2. Choose a JPEG, PNG or WebP file: show its local preview. Choosing does not upload.
3. Upload: the server checks authentication/admin role, rate limit, bounded multipart body and file signature. Limit is **4 MiB**, leaving room below Vercel's 4.5 MB body limit.
4. Before contacting R2, create an UPLOADING record with a random immutable object key. An interrupted request therefore remains discoverable even if the remote PUT succeeds but its response is lost.
5. Only a confirmed PUT changes the record to READY and sets the server upload timestamp. Return its ID, URL, timestamp and expiry. Display the URL and offer Choose another/Remove. Unfinished selected files block final Save; an optional photo can be removed to continue without it.
6. Final Save sends `uploadId`, never a manually entered URL/time. A Serializable transaction checks owner/purpose/state/expiry, attaches the file, updates the product, archives its previous managed photo and writes a submission receipt. The catalogue cache is invalidated afterward.
7. Clear the local draft only after a successful response. Retrying the same save reference returns the saved product without creating another product, timestamp or notification. Edited details get a fresh save reference.

Bundled fruit thumbnails remain independent of the optional live photo on both platforms. Native Shop now opens a current-photo modal that fetches product detail. Explicit `newBatch` records `batchArrivedAt` at product save and can publish an available-stock catalogue event without requiring a photo. Uploading/replacing a photo alone does not announce a new batch. A batch arrival timestamp does not prove all previous stock sold.

## Evidence and local recovery

- Browser: IndexedDB stores structured form data and selected File blobs. Separate scopes cover products, new chat/dispute context and each conversation reply. Autosave is debounced 250 ms, flushed on page hide/visibility change/unmount and before final requests. Upload metadata is flushed immediately.
- Native: Expo FileSystem document storage holds account-scoped JSON drafts and copied picker files. JSON writes use a temporary file followed by replacement. Debounce is 250 ms with background/unmount/before-send flushes. Picker slot markers support Android pending-result recovery. Reopen the relevant chat/dispute/thread to restore its draft.
- Both keep stable idempotency references for lost-response retries. Chat creation/replies have SubmissionReceipt records; disputes retain their existing durable key/hash checks. Asset attachment and message/dispute persistence share the same transaction.
- Draft typing makes **no database requests**. Uploading writes a small server lifecycle record, and reopening a draft can renew READY upload expiry.
- Explicit logout clears local drafts. Generation guards prevent pending autosaves from recreating cleared drafts. Account keys prevent another account loading a draft. An uninstall, cleared/evicted browser storage or device replacement can lose local drafts. A sudden power loss can lose the last debounce window; these are device drafts, not cross-device backups.
- Local drafts and unattached uploads expire after seven days of inactivity. Opening a valid READY upload renews its server expiry. Native startup removes expired draft metadata and unreferenced local images; browser opening an expired draft removes it.
- Evidence uses a separate **private** bucket. Durable `/api/uploads/:id/content` links check the current session: owner may read their READY/ATTACHED files; admins may read submitted ATTACHED evidence. No permanent public evidence URL or bearer token is stored in messages. Native downloads evidence with the session bearer, rechecks account generation, previews it locally and removes its temporary file.
- Up to three uploaded images/external HTTPS links combined per message. Existing external links are still supported; managed upload links must be attached using upload IDs, not pasted around ownership checks.

## State and retention

UPLOADING → READY → ATTACHED. Replaced published product photos become ARCHIVED and remain in R2 for backup history. Removing an unattached selection queues DELETE_PENDING. Expired UPLOADING/READY files enter deletion too. DELETED records retain small audit metadata. Submitted evidence, attached photos and archived photos are **excluded** from abandoned-upload cleanup; evidence retention is a separate policy, not seven days.

Cleanup claims one record with a renewable-by-next-run lease, makes a bounded R2 delete and records success immediately. Failed deletes stay pending with a retry timestamp. A crash after remote deletion is safe: retrying DeleteObject for an already-missing key succeeds. No attempt assumes the process will run a final checkpoint before termination.

## Configuration and deployment

Set server-only variables from `api/.env.example`:

- `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` (bucket-scoped object read/write credentials).
- `R2_PRODUCT_BUCKET`: public product-photo bucket; configure its custom delivery domain.
- `R2_EVIDENCE_BUCKET`: a different bucket, with public access disabled.
- `R2_PUBLIC_URL`: HTTPS delivery base for the product bucket.
- `APP_URL`: canonical API origin for authenticated evidence links; localhost HTTP is accepted only outside production. Use the reachable API origin consistently on devices.
- `CRON_SECRET`: existing strong maintenance secret, at least 16 characters.

The server uploads to R2 itself; browser direct-PUT CORS and presigned client upload URLs are not required. Neither credentials nor bucket write access reach the client. Cloudinary upload code/configuration has been removed. Existing legacy image references are preserved until replaced; no external files have been migrated or deleted by these edits.

Owner applies `prisma/migrations/20261030000000_hybrid_uploads/migration.sql` **after earlier pending migrations and before deploying this generated client**. It adds UploadAsset, SubmissionReceipt and Product.batchArrivedAt. No migration has been applied during this task.

Native dependency/plugin changes require a fresh development/production build for installed apps. Gallery upload is implemented; camera capture is not requested. iOS push remains independently disabled as before.

## Daily jobs and manual retry

All schedules are daily UTC, each with its own function budget:

| Endpoint | UTC window | Lagos window | Work |
| --- | --- | --- | --- |
| GET `/api/cron/maintenance` | 02:00–02:59 | 03:00–03:59 | Existing unpaid-order expiry |
| GET `/api/cron/notifications` | 03:00–03:59 | 04:00–04:59 | Existing notification-outbox recovery |
| GET `/api/cron/uploads` | 04:00–04:59 | 05:00–05:59 | Expired/removed draft upload cleanup |
| GET `/api/cron/credentials` | 05:00–05:59 | 06:00–06:59 | Expired sessions/grants/rate limits/tokens |

Handlers verify CRON_SECRET. They bypass customer session middleware only on these exact GET routes. The upload function has maxDuration 60 seconds, a 40-second work budget and 5-second delete timeouts; unfinished records remain for another run. A failed daily cron invocation is not automatically retried by Vercel.

Admin catalogue offers **Retry expired-upload cleanup**, which POSTs `/api/admin/uploads/cleanup` using admin session and existing CSRF protection. It invokes the same cleanup function, without exposing CRON_SECRET. Notification delivery itself still uses QStash callbacks/retries immediately after events; daily recovery is a fallback. Order expiry also schedules a lightweight QStash recovery callback when it changes orders, so expiry notices need not wait for tomorrow’s cron.

## Verification

See VERIFICATION.json. Local tests use storage/database fixtures and IndexedDB emulation; no Cloudflare account, live migration, cron invocation, real-device restart or hosted performance measurement was performed. Repeat upload/save/reopen/replace/remove, private access, native picker recovery and interrupted cleanup against migrated staging with configured R2.

References: [R2 S3 API](https://developers.cloudflare.com/r2/api/s3/api/), [Vercel function limits](https://vercel.com/docs/functions/limitations), [cron limits](https://vercel.com/docs/cron-jobs/usage-and-pricing), [Expo SDK 58 FileSystem](https://docs.expo.dev/versions/v58.0.0/sdk/filesystem/), [ImagePicker](https://docs.expo.dev/versions/v58.0.0/sdk/imagepicker/).

Latest whole-tracker retest: architecture/review-next/VERIFICATION.json supersedes the earlier build blocker and skipped database checks. The application database remains unmigrated; disposable test clusters validated the complete migration chain.
