# Light in-app QR payments

This update changes only PhotoTags Light. APK payment routes, tables, webhooks and plans remain unchanged. Hosted Light purchases already in progress can still be reconciled through their original checkout IDs.

## Production rollout

1. In the existing Supabase project, run only `supabase/migrations/202611120001_light_inline_qr.sql`. It adds columns and service-role-only RPCs to Light objects. It requires the original Light migration. Do not rerun the full one-time setup on an existing production database.
2. Deploy the updated `light-service` directory to the existing separate Light Vercel project. No new credentials are required; it uses the existing Light PayMongo key and signing key.
3. Edit the **Light-only** PayMongo webhook and add `payment.paid`. Keep `checkout_session.payment.paid` enabled for older hosted purchases. Keep the same URL and Light webhook signing secret. Leave the APK webhook unchanged. The service verifies the signature, then retrieves the canonical Payment Intent or Checkout Session before fulfilling anything.
4. Deploy the booth update. Its activation button opens Terms > Plan > Payment QR. It uses native QR Ph Payment Intents; no iframe, external checkout redirect or browser payment-success flag grants access.
5. Test a purchase from the original installed booth. Confirm the dialog updates automatically, the correct plan appears, the admin payment is paid and the installation is linked. Test a real iPhone/iPad separately before event use. Local fixture tests do not prove live merchant QR permissions or bank-app behavior.

During rollout, the updated booth recognizes an older service or a missing QR migration and offers a hosted payment link inside the dialog. It does not automatically redirect. This compatibility fallback is used only for known setup failures; uncertain provider creation is never retried as a new hosted purchase. Finish the service rollout to display the in-app QR for new purchases.

## Payment lifecycle and recovery

- The receipt email, accepted agreement version, amount, currency, duration and installation allowance are snapshotted server-side. Payment Intent descriptions explicitly identify `PhotoTags Light license`, plan and reference. This affects new purchases; historical PayMongo transaction descriptions are unchanged.
- The client polls payment status every six seconds while visible, and checks again on focus/visibility change. It stores only the pending payment ID locally; after reload, the same installation can retrieve its QR and resume. A newly verified signed permit updates the plan and access dates. Manual key activation remains available beside its field.
- Retries reuse the pending intent. Provider creation is never blindly repeated after an uncertain response. Only the request owning the reservation creates and attaches the QR. Expired QRs are replaced only after the provider confirms cancellation; local clock expiry alone never creates a second payable attempt.
- An interrupted creation can require host review. In Light admin > Payments, use Verify / recover checkout with the `pi_...` ID found in PayMongo using the Light reference. Recovery verifies product, payment ID, installation, amount, currency and reference before attaching. An unpaid intent that never obtained a payment method is cancelled to allow a safe fresh attempt. Existing hosted recovery still accepts `cs_...`.
- Closing the dialog does not cancel a payment. The Resume license payment button returns to the pending QR. On a phone, save the QR image and import it into a banking app if supported, or scan from a second device.

## Local validation

Run `npm test`, `npm run build`, `npm run build --prefix light-service`, `node scripts/check-light-integration.cjs <booth-path>`, and `node scripts/check-light-qr.cjs <booth-path>` from this repository. The QR browser check uses the actual Light API, SQL and WebCrypto with a fixture provider, including reload/resume and automatic activation on desktop and phone. No live payment is created.

Provider references: [QR Ph API](https://docs.paymongo.com/docs/payment-acceptance-qr-ph-api), [Payment Intent description](https://docs.paymongo.com/reference/the-payment-intent-object), [Cancel a Payment](https://docs.paymongo.com/reference/cancel-a-payment).
