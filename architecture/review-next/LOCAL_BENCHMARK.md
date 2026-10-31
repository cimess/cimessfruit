# Representative local measurements

Measured on a disposable local PostgreSQL/Redis environment on 2026-10-29. Synthetic data only. These are laptop measurements, not hosted capacity or a 1 GB/low-CPU simulation.

Dataset: 100 products; 1,000 orders, payments and order items; 1,000 conversations and 2,000 messages; 1,000 users/tokens/sessions; 26 delivery zones. The extra zone is an integration fixture. Existing migrations were applied only to the disposable cluster.

| Path | p50 ms | p95 ms | JSON bytes |
| --- | ---: | ---: | ---: |
| Admin orders: previous 100/full fields | 10.98 | 16.82 | 118112 |
| Admin orders: current 20/minimal fields | 5.81 | 7.73 | 8000 |
| Admin inbox: previous 100/full previews | 6.99 | 10.41 | 47809 |
| Admin inbox: current 20/minimal previews | 3.77 | 4.62 | 6430 |
| Products: newest | 8.88 | 23.97 | 9860 |
| Products: price | 5.58 | 11.32 | 9863 |
| Products: search | 3.98 | 5.96 | 9949 |

Order/inbox reads use 30 warm alternating samples; product cases use 15 measured uncached handler samples after warmup. JSON bytes are uncompressed response bodies. The old/new listing comparisons deliberately differ in page size and selected fields; they are not equal-record query microbenchmarks.

Order JSON is 93.2% smaller and inbox JSON is 86.6% smaller in these fixtures. This demonstrates bounded response size, not a production bandwidth forecast.

Product handler measurements exclude HTTP, authentication, compression and the ETag wrapper. The current small-catalogue API still reads matching products and sorts in application memory before slicing responses. Search remains a scan for this small dataset; no trigram index was added.

The email audit found 1,000 canonical synthetic addresses and no collisions. Exact lookup used the existing unique index, but short local timings do not establish a general speed advantage. The fixture is not an audit of imported or deployed customer identities.

Maintenance selection plans were measured read-only for expired reservations, expired tokens, account-specific token prefixes and expired sessions. Saved plans are in REPRESENTATIVE_LOCAL_BENCHMARK.json. No extra zone/expiry/prefix/admin-recency index was justified or applied to the application database.

The machine retains its ordinary CPU/RAM and OS cache. PostgreSQL connection settings in the temporary harness are test settings, not a recommendation for Neon. Native diagnostics are available for later device request measurements; real screen load time, SSE/image/upload wire bytes, cold starts, provider quotas and hosted costs remain unmeasured.

Repeat from api with `npm run verify:local -- --bench`. The runner starts/stops only its own temporary services and refuses to seed a configured application database.
