# Architecture and implementation notes

Start with [STRUCTURE.md](STRUCTURE.md) for the current Vercel API / Neon PostgreSQL + Upstash Redis boundary and [TASKS.md](TASKS.md) for the staged work tracker.

- [Redis](REDIS.md): cache behavior, invalidation, setup and verification.
- [Product API](PRODUCTS_API.md)
- [Checkout](CHECKOUT.md)
- [Authentication](AUTH_SETUP.md)
- [Mobile authentication](MOBILE_AUTH.md)
- [Website and admin](ADMIN_WEBSITE.md)
- Local query reviews: [orders](LOCAL_ORDER_BENCHMARK.md), [Conversation inbox](LOCAL_INBOX_BENCHMARK.md)
- [Email identity](EMAIL_IDENTITY.md): normalization, existing unique-index coverage and local lookup audit.
- [DeliveryZone and remaining coverage](DELIVERY_INDEX_REVIEW.md): step-by-step query/index review and local measurements.
- [Capacity and connection pools](CAPACITY_AND_POOL_REPORT.md): measured local concurrency/timeouts, CPU/RAM limits, 1 GB comparison and current free-tier constraints; [raw baseline](LOCAL_POOL_BASELINE.json).
- [Bounded runtime pool](DATABASE_POOL.md): implemented limits/lifecycle, transaction-scoped SQL cancellation, verification, overhead and rollback.
- [Mobile order refresh](MOBILE_ORDER_REFRESH.md): shared polling, focus/background handling, race protection and modeled request reductions.
- [Launch checklist](LAUNCH_STATUS.md)
- Historical references: [original architecture](ARCHITECTURE.md), [old API design](API.md).

Code paths in the API-specific documents are relative to `api/` unless stated otherwise. Commands must be run from the package they describe, not this folder.

Package READMEs and agent instructions stay beside their code. The [Oracle deployment runbook](../deploy/oracle/README.md) stays beside its deployment files and describes the older full-app hosting setup; it is historical and is not the selected Vercel/Neon/Upstash topology.

## Latest whole-tracker completion review

See [review-next/WALKTHROUGH.md](review-next/WALKTHROUGH.md) for local implementation changes, repeatable verification, representative measurements, deployment/device follow-ups and future-feature proposals.
