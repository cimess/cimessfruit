# Local request diagnostics

Set EXPO_PUBLIC_REQUEST_METRICS_ENABLED=true in a development build and open Account → Request diagnostics. Counters are disabled by default and the screen is development-only. Reset, exercise a fixed scenario for a fixed duration, then refresh the report.

The API client reports request count, HTTP errors, decoded JSON payload bytes, unknown/incomplete payload counts and recent network-to-body p50/p95 duration. Route IDs and query values are removed. Headers, credentials, owners, bodies and messages are never retained. Counters reset when credentials are removed. Counts cover this JSON API client, not Expo push, maps, image delivery or SSE transport.

These are not total network wire bytes: request bodies, image uploads/downloads, compression, TLS, SSE bytes, render time and search debounce are excluded. Use device/proxy/provider measurements for those. Comparing equal scenarios before/after is essential; a local query benchmark cannot establish real mobile loading time or hosted bandwidth savings.
