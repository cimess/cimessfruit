# Oracle deployment and launch runbook

Prepared for an Ubuntu Oracle VM, Nginx, PostgreSQL 16, Node.js 24, Resend and Cloudinary. No server, domain, provider account or paid service has been provisioned by this change. The selected domain is `friut.cimessinvest.com` (spelling supplied by the owner); the proposed sender is `CimessFruit <no-reply@cimessinvest.com>`. Replace credential placeholders before activation. The Expo identifiers proposed here are `com.cimessfruit.app`; confirm ownership before the first store upload.

## Server preparation

1. Create an Oracle Ubuntu VM, attach a persistent volume and assign the domain's DNS A record to its public address. Match any AAAA record to a working IPv6 setup or omit it. In Oracle network rules and the VM firewall allow 80/443 publicly and restrict SSH to your administrator IP. Keep PostgreSQL (5432) and Next.js (3001) private.
2. Install Node.js 24 (with `/usr/bin/node`), npm, PostgreSQL 16 and its client, Nginx, Certbot and its Nginx plugin. Create a non-login service user `cimessfruit`. Put the checkout at `/opt/cimessfruit`; the service user must own `api/.next` for Next.js cache writes. Do not build as root.
3. Create a dedicated PostgreSQL database and role. Keep PostgreSQL bound to loopback. Put runtime environment values in `/etc/cimessfruit/api.env` from `api.env.example`, owned by root with group `cimessfruit`, permissions 0640. Use random secrets of at least 32 characters, a URL-encoded database password, and a public HTTPS `AUTH_URL`. Never commit this file. Configure database statement/connection timeouts and monitor free disk space.
4. As the application user, install with `npm ci` in `api`, then `npm run build`. Build uses the same server variables; load them through a secure process manager or deployment environment. Do not paste secrets in terminal history. Production runtime needs the installed `tsx` and Prisma CLI too, so do not omit development dependencies from this deployment layout.
5. Back up any existing database, then run `npm run db:deploy` with the deployment database environment. This applies the account-deletion migration as well as earlier migrations. Do not use `migrate dev` or reset against production. Review catalogue seed data before running `npm run db:seed`; then enter real prices, stock, boundaries, fees and delivery estimates in admin.
6. Copy the service and timer files into `/etc/systemd/system/`. Create `/var/backups/cimessfruit` owned by `cimessfruit`, mode 0700. Run `systemctl daemon-reload`, then enable/start `cimessfruit.service`, `cimessfruit-cleanup.timer` and `cimessfruit-backup.timer`. A missing provider variable makes the API startup check fail visibly instead of silently launching a broken flow.

## Nginx and HTTPS

Copy `cimessfruit-proxy.conf` into `/etc/nginx/snippets/`, and install `nginx.conf` as the site configuration for `friut.cimessinvest.com`. Test with `nginx -t`. The site initially serves HTTP so Certbot can verify the domain. Run `certbot --nginx -d friut.cimessinvest.com --redirect` to enable HTTPS, verify automatic renewal with `certbot renew --dry-run`, then reload Nginx. Keep `AUTH_URL` HTTPS throughout. Nginx supplies trusted forwarding headers, so `AUTH_TRUST_HOST=true` is appropriate only while the API remains loopback-only.

The Nginx auth limit complements the database account limits. If a trusted CDN is later added, explicitly configure trusted real-IP ranges before relying on client-IP limits. Do not trust arbitrary incoming forwarded headers.

## Provider activation

- **Resend:** verify a domain and its DNS records in Resend. Set `RESEND_API_KEY` and `MAIL_FROM` to an address on that domain. The existing Gmail address is for customer support, not an assumed verified sending domain. Exercise password reset, email verification and account-deletion confirmation using real inboxes, including spam-folder checks.
- **Google:** set the web OAuth redirect to `https://friut.cimessinvest.com/api/auth/callback/google`. Verify the app's `cimessfruit://auth/callback` handoff on both target devices. Expo Go callback settings are development-only.
- **Cloudinary:** set server-only `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY` and `CLOUDINARY_API_SECRET`. Admin → product editor now uploads JPEG/PNG/WebP files up to 5 MB and saves the returned HTTPS URL when the product is saved. Do not put secrets into Expo public variables. Remove unused uploads through the Cloudinary dashboard after checking that no product or historical order uses them.
- **Maps:** enable Maps SDK for Android and restrict the API key to `com.cimessfruit.app` plus the correct signing SHA-1 for each build/store certificate. iPhone uses Apple Maps by default. Test standalone maps and permission denial; Expo Go is insufficient.

## Mobile builds

From `mobile`, authenticate with EAS and link the project using `npx eas-cli@latest init`. Set `EXPO_PUBLIC_API_URL` in both preview and production EAS environments and `GOOGLE_MAPS_ANDROID_API_KEY` as a sensitive variable. Review `eas.json`.

- Preview: `npx eas-cli@latest build --profile preview --platform all`
- Store build: `npx eas-cli@latest build --profile production --platform all`

Apple internal distribution requires registering test devices; TestFlight requires the production build and Apple Developer/App Store Connect access. Android production creates an AAB. Configure signing with EAS; back up access to signing accounts. Android offers Google plus email/password. iPhone deliberately offers email/password only, as selected by the owner. Existing Google-only users can set a password from their web account before signing into iPhone. Test both flows on signed builds.

Store URLs after deployment: `/privacy`, `/terms`, `/refunds`, `/delivery`, `/account-deletion`. Review policy wording and actual retention/operating practices before publishing. Complete Google Data safety and Apple App Privacy details accurately, supply review credentials and screenshots, and confirm support contact details.

## Monitoring and recovery

- Poll `https://friut.cimessinvest.com/api/health` from an external uptime monitor. It checks database connectivity and returns 503 on failure without exposing credentials. Configure email alerts in that monitoring service; no external monitoring account is configured here.
- Check `journalctl -u cimessfruit -u cimessfruit-cleanup -u cimessfruit-backup` and `systemctl list-timers`. Alert on failed timers, disk usage and repeated 5xx responses. Enable host security updates and log rotation. No mobile crash-reporting provider is configured yet.
- The backup timer creates a PostgreSQL custom-format dump nightly and prunes its own backups older than 14 days after a successful dump. Store an encrypted copy off the VM (for example in private Oracle Object Storage), with a matching retention policy. A backup on the same VM alone is not disaster recovery.
- Restore-test a dump into a separate empty database using `pg_restore --no-owner --no-acl --dbname=RESTORE_TEST_DB BACKUP.dump`, then inspect products and orders. Never point a restore at the live database. Record the test date. If restoring old backups after account deletions, reconcile deletion records before making the restored service public; the backup contains older personal data until expiry.

## Real-device acceptance (required before launch)

1. Create a test account, verify email, sign out/in, restart the app, and reset password. Verify old sessions stop working.
2. On Android and iPhone: choose a pin, drag it rapidly to another street, deny permission, test poor network, correct the suggested address, add entrance/bus-stop details and place an order. Confirm admin sees the final address, contact number, directions and correct pin.
3. Verify total and delivery fee, resume an unpaid order after reopening, report a controlled transfer and verify it in admin only after checking the bank. Prepare, dispatch, deliver. Test duplicate submit/retry and stock contention.
4. Cancel an unpaid order and check stock restoration once. Check the cleanup timer with expired test reservations; reported payments must stay reserved for review.
5. Send a support message and reply as admin. Upload a real stock photo and inspect it on web and mobile.
6. Use a disposable account to test deletion: no deletion on link opening, explicit DELETE confirmation, expired/reused tokens rejected, active orders blocked, and sessions revoked. Confirm sales records have no account link, address, phone or coordinates after deletion.
7. Confirm the store's manual payment/refund procedure, working hours and support staffing. Agree refund timing with the owner before advertising a guaranteed timeline. Review every policy link and store disclosure.
