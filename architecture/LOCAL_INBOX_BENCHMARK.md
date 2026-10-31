# Local Conversation inbox review

Reviewed and measured 2026-10-28. Only the configured local PostgreSQL database was accessed, using a read-only benchmark transaction. No indexes, migrations or conversation/message data were changed.

## Problem and changes

The admin inbox returned the latest 100 conversations, ordered only by `updatedAt`, with no continuation. Older conversations became unreachable. The admin screen had separate initial-load and manual-refresh code paths and lacked consistent cancellation of stale requests.

The admin list now returns 20 conversations plus a continuation cursor. Ordering uses `(updatedAt DESC, id DESC)` to break timestamp ties. A database lookahead of one row detects whether more conversations exist. Each result includes only list/navigation fields and one latest message preview, ordered by `(createdAt DESC, id DESC)`. Admin authorization, inactive-account rejection and private/no-store responses precede database reads; no private support data enters Redis.

The admin screen uses one abortable loading path for inbox/thread reads, appends cursor batches, supports retries, and resets the inbox to the newest batch on Refresh or returning from a thread. Reply submission has an immediate lock against duplicate clicks. Message display ordering also has a deterministic ID tie-breaker. Customer support list limits/polling and message creation/authorization rules are otherwise unchanged.

Conversation recency is mutable: a reply can move a conversation ahead of an existing cursor. This is not a frozen snapshot; Refresh reconciles the latest order, and returning from a thread resets the list. The browser deduplicates IDs when appending batches.

## Measurements

Local dataset: **1 conversation, 1 message**. Thirty warm samples per path, measured in alternating order through Prisma:

| Measurement | Previous listing | Cursor listing |
| --- | ---: | ---: |
| Median query path | 2.20 ms | 2.28 ms |
| 95th percentile | 5.17 ms | 5.64 ms |
| Uncompressed JSON response | 435 bytes | 310 bytes |

There is no demonstrated speed improvement: the small timing difference is not meaningful evidence at this volume. The same-record JSON payload is about 29% smaller. With larger inboxes, the initial request also fetches fewer conversations (at most 21 rather than 100). HTTP/authentication and cloud/network costs are excluded.

## Existing indexes and decision

- `Conversation(userId, updatedAt)` supports customer-specific inbox reads. It does not directly supply global admin `(updatedAt, id)` ordering.
- `ConversationMessage(conversationId, createdAt)` supports per-conversation message retrieval. An additional ID tie-breaker may still require sorting messages with equal timestamps.
- Primary-key indexes already cover direct conversation/message ID lookups.

The admin parent-query plan used a sequential scan and a 25 kB in-memory sort, reporting **0.031 ms execution**, one shared-buffer hit and no disk reads. This parent plan excludes the related message query; the Prisma timings include both reads.

No additional index was justified or applied. At representative volumes, evaluate `Conversation(updatedAt DESC, id DESC)` first. Consider extending customer/message indexes with ID only if those actual plans show a worthwhile improvement; do not add all candidates automatically.

## Verification and repeatability

Run `npm run bench:inbox` from `api/`. The script accepts only local DATABASE_URL hosts and reports aggregate timings, response sizes, index definitions and the parent query plan without printing messages, customer records or credentials.

Automated tests verify 20/20/5 batches, timestamp tie boundaries, deterministic preview queries, malformed/duplicate/unknown parameters, guest/customer/inactive-admin rejection, empty results, continuation after boundary deletion and private error responses. TypeScript and ESLint pass. The complete API suite reports **91 passed, 7 database integration tests skipped** because TEST_DATABASE_URL is not configured.

Remaining checks: exercise the admin UI in a browser (open, reply, Back, Refresh, pagination and failed-request retry), and benchmark representative volumes in a disposable local test database before making scaling/index claims.
