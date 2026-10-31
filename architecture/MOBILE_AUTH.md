# Customer mobile authentication

This client supports iOS and Android only. The future web frontend will use its
own authentication client. Native API requests always omit cookies and attach a
validated SecureStore bearer credential to protected requests. Google sign-in
still opens the system browser for the backend OAuth flow and exchanges a
one-use callback code for a native credential.

Credentials use `WHEN_UNLOCKED_THIS_DEVICE_ONLY`. Existing credentials are
rewritten with that policy when first read after this update. A locked-device
storage failure propagates without deleting the credential. This customer app
does not enable background access for rider tracking.

Login, signup, Google login, session restore, and logout are queued in invocation
order through the auth store. Each operation includes its network work, storage
writes, and UI commit. An operation that fails does not block the next one. A
logout queued during Google sign-in runs after that browser flow completes or is
cancelled. Call authentication actions through the store, not the service directly.

A separate storage queue protects request snapshots, profile updates, expiry
cleanup, and 401 invalidation. Old responses cannot erase a newer session;
profile refresh checks the original session version before persisting user data.
Expired/corrupt storage is removed and the UI is notified. Storage errors are not
treated as session expiry. These queues coordinate this app's JS runtime, not
separate apps or processes.

Logout revokes the server credential before clearing local state. An already
expired/revoked session is cleared locally. A network/server failure leaves the
session available so logout can be retried, rather than claiming revocation
succeeded.

`apiRequest` accepts JSON string bodies and FormData/Blob bodies. Supply an
explicit content type for non-JSON strings. Do not manually set multipart content
type: fetch must generate its boundary. Responses are JSON; malformed/empty
successful JSON responses throw an error. HTTP 204/205 and empty HEAD responses
return null. Requests cannot override the client's bearer token or cookie policy.

Regression checks (from `mobile`, using the workspace's installed TS loader):

```sh
node --import ../api/node_modules/tsx/dist/loader.mjs tests/api-client.test.ts
npx tsc --noEmit
npx eslint src/lib/api.ts src/lib/api-client.ts src/features/auth tests/api-client.test.ts
```

Full-project `npm run lint` also checks unrelated screens. Native keychain
accessibility and real Google sign-in still require device testing.
