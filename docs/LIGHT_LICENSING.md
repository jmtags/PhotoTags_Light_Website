# PhotoTags Light licensing

Light is a separate product. No Android source, existing API handler, existing plan, existing table/RPC, payment webhook, trial rule, or merchant configuration is modified. The existing website receives only additive Light frontend entry points and new Light files. Its root `api/` remains at 12 functions. The new service in `light-service/` deploys independently with one function, avoiding an extra function in the APK website deployment.

## Deployment order

Source implementation and automated checks do not activate production licensing. Do these steps in order; keep booth enforcement disabled until the service has passed the test-mode flow.

1. On the existing Supabase database, apply **only** `supabase/migrations/202611110001_light_licensing.sql`. It creates `light_` tables/functions and grants access only to the service role. Do not rerun the entire one-time setup against an existing production database. The same Light block is included there for fresh installations.
2. Generate a separate P-256 signing key using `node scripts/light-signing-key.cjs <private-directory-outside-the-repository>`. Keep `light-private.pem` private and backed up. Never commit it or place it in a `VITE_` variable. The public JSON is safe to bundle in the booth. The helper refuses to overwrite existing files or create keys inside the repository.
3. Create a **separate Vercel project** from this repository with Root Directory **light-service**, Framework **Other**, build command `npm run build`, output directory `public`. Configure its variables from `light-service/.env.example`: the existing Supabase project/service-role credential, the same configured website admin password, a new Light signing private key, allowed website/booth origins, booth return URL, offline permit duration, and PayMongo credentials. Use real HTTPS origins with no trailing paths. For the PEM variable, literal `\n` line separators are accepted. Do not edit the APK project's environment variables or webhooks.
4. Set **VITE_LIGHT_API_ORIGIN** on the website to the new service's HTTPS origin and rebuild the website. This is public configuration. Add that website's actual origin to **LIGHT_ALLOWED_ORIGINS** on the service. The existing admin login and existing APK sections continue to operate as before.
5. In the existing back office, open **PhotoTags Light**. Its own tabs are Overview, Licenses, Installations, Plans and Payments. Set Light prices/durations/installation allowances, then enable sales. Seeded weekly/monthly/lifetime plans are disabled with no sale price; Android pricing is never copied or changed. You may issue a Light key administratively before enabling sales.
6. Register a **new** PayMongo webhook for `checkout_session.payment.paid` at `<Light service origin>/api/light?route=webhook`. Store that webhook's secret as **LIGHT_PAYMONGO_WEBHOOK_SECRET** on the Light service. Keep the APK webhook, business merchant webhooks and their secrets unchanged. The Light webhook verifies timestamp/signature, ignores non-Light metadata, fetches canonical provider status, and validates checkout ID, installation, payment ID, reference, amount and currency before provisioning.
7. Configure the booth: **VITE_LIGHT_API_ORIGIN** = that same Light service origin; **VITE_LIGHT_PUBLIC_KEY_JWK** = the JSON in `light-public.json`; **VITE_LIGHT_LICENSING_ENABLED=true**. Rebuild/deploy only after the server and public key match. Enabling with missing/invalid configuration blocks kiosk launch and printing. The default is false so rolling out source cannot silently lock existing booths before setup.
8. First use PayMongo test credentials and a test-mode Light webhook. Verify checkout, return to the original installed booth, Check license / payment, permit receipt, offline relaunch, expiry, block and transfer. Then configure the Light service's live-mode key/webhook secret and enable the intended Light plans. No real payment, production migration or deployment secrets are created by the source checks.

On iPhone/iPad, activate from the Home Screen app. Checkout may open Safari; after paying, return to the **original Home Screen app** and tap **Check license / payment**. A different browser installation cannot claim its payment because the request must prove possession of the original installation key.

## Isolation and behavior

- All Light data is in `light_plans`, `light_installations`, `light_licenses`, `light_activations`, `light_payments`, `light_auth_nonces` and `light_audit`. The service imports no APK business/payment/license helper. Android keys cannot activate Light, and Light keys do not exist in the Android license table.
- Registration is a browser installation, not a MAC/hardware identifier. A non-extractable P-256 private key lives in a separate IndexedDB database. The client proves possession on load and signs server challenges bound to the operation and payload. Each challenge expires after two minutes and can be consumed only once. Photos/history ZIPs do not contain this database.
- The server locks the license while enforcing its installation allowance. Repeat activation of the same binding is idempotent. Release for transfer blocks the old installation and frees its seat; the new installation activates the same Light key. Do not unblock the old installation unless deliberately restoring access.
- Permits are ES256 signed, tied to the installation ID and key, and capped at both the license expiry and the configured offline window (7 days by default; maximum 30). Lifetime plans also need periodic online permit refreshes. Browser connectivity being unavailable preserves an existing valid permit. Explicit unlicensed/blocked results revoke the local cached permit. Expiry closes the guest kiosk and blocks new printing; settings, saved history, exports and print-job review remain accessible for recovery. Enforcement is commercial client-side protection, not tamper-proof DRM.
- The browser checks for gross clock rollback using a saved high-water mark and checks expiry before kiosk launch and each print. A fully offline browser cannot provide a hardware-backed trusted clock; deliberate client modifications remain outside this protection.
- Blocking, revocation, refunds and transfers cannot reach an offline installation immediately. An issued permit remains valid offline until its expiry. The admin shows the latest issued permit expiry to help schedule transfers without overlapping use.
- Checkout terms are snapshotted server-side. Retrying a pending purchase reuses its checkout. If provider creation has an uncertain outcome before the checkout ID is saved, retries stop with `light_checkout_pending_host_review`, rather than creating a second possible charge. For such an orphan reservation, find its checkout ID in PayMongo using the Light reference, then use Payments > Verify / recover checkout. The server verifies its ownership and canonical payment details before attaching or fulfilling it; do not manually mark it paid. An ordinary pending checkout can be reopened using its saved URL.
- Paid webhook/polling retries converge on one license in an atomic SQL transaction. A paid renewal replaces the purchaser's installation binding with a newly tracked Light license and adds its term to that installation's current active remaining period. Other installations on an older shared license retain their own original license terms. New purchases and replacement activations are now blocked for every active license, including time-limited licenses, by the Light API and `202611120002_light_single_active_license.sql`. The historical fulfillment behavior is retained only so earlier paid purchases are never discarded.
- Last seen is a server check-in, not a live online indicator. Only registered installations can be counted; adding an icon alone is not an observable registration event. Admin lists show the latest 1,000 rows per category and label that boundary.

## Validation

Run in the website root:

```text
npm ci
npm run build
npm test
node scripts/check-light-integration.cjs <path-to-PhotoTagsReceipt_Booth_ALL>
```

Run `npm ci` and `npm run build` inside `light-service/` as well. The integration check needs the booth's installed Vite, Playwright and Chrome dependencies, and free localhost ports 4185/4186. It uses isolated PGlite data, temporary signing keys, real WebCrypto and mocked PayMongo/API transport; it never opens a real checkout or accesses production Supabase.

Checks cover proof/signature/payload binding, replay prevention, key replacement rejection, seat limits, expiry, transfer, payment field matching, reservation reuse, payment fulfillment idempotency, renewal duration, webhook signature mode/timestamp, RLS/execute grants, API origin/admin checks, and unchanged APK sentinel records. The browser check exercises activation, saved permits during API outage, blocking on reconnect, in-session expiry, wrong-installation/tampered permits, and separate Light admin/public screens. Actual iOS/Home Screen and PayMongo test/live acceptance remain deployment tasks.

Protocol references: [PayMongo Hosted Checkout](https://docs.paymongo.com/docs/payment-channels-hosted-checkout), [PayMongo webhook events](https://docs.paymongo.com/docs/developer-tools-webhooks-events), [Web Cryptography](https://www.w3.org/TR/webcrypto/), [Vercel function deployment counts](https://vercel.com/docs/functions/runtimes).


## One active license per installation

Apply only `supabase/migrations/202611120002_light_single_active_license.sql` in Supabase SQL Editor after the two existing Light migrations. It changes three Light-only RPCs, preserves existing records and payment fulfillment, and serializes activation/reservation checks with the installation row lock. The service also rejects active installations at the API boundary before contacting PayMongo, even before this migration is applied. Apply the migration for the atomic database guarantee. Do not rerun the complete setup on production.

Settings disables both purchase and manual-key controls while the saved license term remains active, even if its offline permit needs refreshing. Check license / payment remains available. New activation becomes available after the license expiry; lifetime licenses never offer another purchase. A pending purchase must be resolved before manual activation. Reapplying the same key through the database is idempotent and cannot replace the binding. Previously initiated payments remain reconcilable. This policy follows the registered browser installation, not the physical machine across browsers or cleared app data.
