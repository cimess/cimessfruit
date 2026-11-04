# Expired credential maintenance

`credentials.ts` implements a bounded sweep shared by the daily HTTP worker and manual maintenance CLI. `credential-stores.ts` supplies database operations for Session, MobileAuthGrant, AuthRateLimit and VerificationToken.

Each table gets a turn in every round. A batch selects at most 200 expired keys ordered by expiry/key and deletes only keys that are still expired. A concurrently refreshed record survives. Each batch is independently committed; remaining rows are the durable checkpoint. Ten rounds and a 40-second work budget bound a call. Exceptions leave unprocessed rows for retry.

GET /api/cron/credentials verifies CRON_SECRET and runs once daily in the 05:00–05:59 UTC window (06:00–06:59 Lagos), independently of order expiry, notification recovery and upload cleanup. The CLI drains repeated bounded sweeps. Active credentials are excluded; expired sessions still cease authenticating immediately, independently of when cleanup removes their rows.
