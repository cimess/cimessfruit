# CimessFruit mobile

Expo SDK 58 app. Run `npm ci`, set `EXPO_PUBLIC_API_URL` in `.env.local` to the reachable API origin, then `npm start`.

The shop uses live products and per-option stock. Checkout creates a server order first and displays its exact payable amount and bank instructions. “I have paid” requests admin review; it never confirms receipt. Orders refresh from the server every 15 seconds. Password recovery/email verification are available from login/account and complete through an emailed web link.

Use a native development build for Google handoff and device keychain tests. Google credentials are already configured in the local API; email sending still requires provider configuration. Custom blending is unavailable in server checkout.

Validation: `npx tsc --noEmit`, `npm run lint`. See `../architecture/LAUNCH_STATUS.md` for remaining device and deployment checks.

Release builds: see `../deploy/oracle/README.md` and `eas.json`. Preview and production builds require a deployed HTTPS API. Android also requires a restricted Google Maps key.
