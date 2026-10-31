# Local admin order listing review

Measured 2026-10-28 against the configured local PostgreSQL database. No Neon/Upstash connection was made, no index was added, and no customer/order data was changed. The benchmark uses a read-only transaction.

## Changes

Previously the admin received the latest 100 manual-transfer orders with every order/item/payment field and no continuation. It could not reach older orders. The new API returns up to 20 orders and a continuation cursor, ordered by creation time and ID descending. It reads one extra row to detect another batch and selects only the fields displayed by the admin list. Payment verification payloads, checkout hashes and unrelated item fields are omitted. Admin authorization and private/no-store responses remain enforced. Customer order APIs and transactional payment actions are unchanged.

The admin screen appends batches with Load more, preserves existing rows while loading/retrying, and resets to the first batch on Refresh. Cursor validation rejects malformed/unknown/duplicate parameters before database reads; an explicit timestamp/ID boundary allows continuation even if the boundary record is removed.

## Results

Dataset: **2 orders, 2 payments, 3 order items**. After warming both queries, 30 samples per path were collected in alternating order using Prisma. These are query-path timings, excluding HTTP, authentication, compression and deployed network latency.

| Measurement | Previous listing | Revised listing |
| --- | ---: | ---: |
| Median | 5.55 ms | 4.10 ms |
| 95th percentile | 9.68 ms | 7.41 ms |
| JSON response size | 3,074 bytes | 1,101 bytes |

The small dataset and runtime noise prevent a reliable speed/scalability claim. The reduced response size is observable on the same records; approximately 64% fewer uncompressed JSON bytes were returned. With more orders, the first batch also fetches fewer records (21 for the lookahead versus the old maximum of 100).

## Index findings

Local index inspection confirmed `Payment_orderId_key` and `OrderItem_orderId_idx`; no duplicate join indexes are needed. Existing Order indexes cover user-specific history, status/time and delivery-zone lookup. The new unfiltered admin chronological ordering is not fully covered by those indexes, but an additional `(createdAt DESC, id DESC)` index is only a candidate for a representative-volume plan review.

`EXPLAIN (ANALYZE, BUFFERS)` for the parent selection query showed a hash join over sequential scans of Order/Payment, followed by a 25 kB sort. Execution was **0.097 ms**, with shared-buffer hits and no disk reads reported. This parent query does not include Prisma's separate item/payment fetches; the timings above cover those ORM reads too. Neither a provider-only index nor a chronological index is justified by two-row measurements.

## Repeat and follow up

From `api/`, run `npm run bench:orders`. The script refuses non-local DATABASE_URL hosts and prints aggregate timing/size/index/plan information without customer rows or credentials. Do not assume the result predicts Neon: sharing a deployment region reduces distance but does not reproduce compute sizing, connection overhead, suspend/resume or concurrent load.

- Benchmark representative local volumes in a disposable test database before choosing another index. Existing database data should not be replaced or populated with synthetic orders for this purpose.
- Verify admin scrolling through batches, Refresh, payment/fulfilment updates and failed-request retries in the browser.
- Automated tests cover tied timestamp pagination (20/20/5), bounded queries, minimal selection, malformed cursors and admin authorization. Database integration tests still require TEST_DATABASE_URL.
