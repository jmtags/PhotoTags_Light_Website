# Reprint transaction API and deployment

This prepares the backend and portal only. The Android gallery currently sends print jobs without recording reprint transactions. Reprints will appear only after the Android handoff is implemented. There is no invented history or photo upload.

## Existing sync endpoint (unchanged route)

`POST /api/devices/transactions/sync`, JSON body:

```json
{
  "deviceId": "kiosk-01",
  "businessId": "11111111-1111-4111-8111-111111111111",
  "appVersion": "installed-version",
  "platform": "android",
  "transactions": [
    {
      "transactionId": "33333333-3333-4333-8333-333333333333",
      "occurredAt": "2026-11-04T02:00:00.000Z",
      "mode": "Reprint",
      "paymentMethod": "none",
      "status": "completed",
      "amountCentavos": 0,
      "voucherCode": null,
      "printsUsed": 2,
      "note": "Complimentary saved-photo reprint",
      "copiesRequested": 2,
      "printStatus": "submitted",
      "originalTransactionId": null,
      "sourceMode": "Photobooth"
    }
  ]
}
```

Success is HTTP 200:

```json
{"ok":true,"accepted":["33333333-3333-4333-8333-333333333333"],"duplicates":[],"failed":[]}
```

Retrying the identical batch returns:

```json
{"ok":true,"accepted":[],"duplicates":["33333333-3333-4333-8333-333333333333"],"failed":[]}
```

A record with `copiesRequested: 2` and `printsUsed: 3` is rejected individually:

```json
{"ok":true,"accepted":[],"duplicates":[],"failed":[{"transactionId":"33333333-3333-4333-8333-333333333333","reason":"Invalid reprint or print metadata"}]}
```

Mixed batches may contain accepted, duplicate, and invalid entries. The app must inspect these arrays, not just HTTP 200 or `ok`. Invalid entries are validated before duplicate detection. Authorization/pairing failures keep their existing non-200 response, for example HTTP 403 `{"ok":false,"status":"device_not_paired_to_business"}`.

### Accepted values and legacy behavior

- Modes: `Photobooth`, `ID Photo`, `Receiptbooth`, **`Reprint`**. Mode is case-sensitive after trimming. `payment_sessions.mode = reprint` remains a different, unchanged contract.
- Methods: `coin`, `voucher`, `qrph`, **`none`**. Existing normalization trims and lowercases method/status values. `none` is allowed only for zero-amount Reprint rows with `voucherCode: null`.
- Statuses: `completed`, `failed`. For a positive-amount reprint, `completed` means the new charge was collected, independently of printing. Do not send an unpaid configured price. Refund tracking is not implemented by this change; do not rewrite an existing transaction via retry to represent a refund.
- `amountCentavos`: integer 0-10000000, amount newly collected for this batch. Never include the original sale's amount. `printsUsed`: nonnegative integer; legacy max 10000 stays intact.
- `transactionId`: one stable device transaction identifier (up to 200 characters), normally a UUID, for one finalized batch. It is not the database row UUID. Use a new ID for a deliberate subsequent batch even if the image is the same.
- Existing required timestamps, IDs, note/voucher normalization, the max 500 records per sync, device/business pairing checks, and unique `(device_id, transaction_id)` are retained. App version/platform remain compatible top-level fields; this endpoint does not persist them on transaction rows.
- New metadata accepts camelCase or snake_case aliases, with camelCase taking precedence when non-null. It is stored and returned as nullable snake_case database columns.

| Input / stored/dashboard column | Validation / default |
| --- | --- |
| `copiesRequested` / `copies_requested` | Integer 1-10. Required for Reprint. Null for legacy rows. |
| `printStatus` / `print_status` | `submitted`, `partial`, `failed`, `unknown` (exact lowercase). Required for Reprint. Null for legacy rows. |
| `originalTransactionId` / `original_transaction_id` | Optional string 1-200 characters, trimmed, or null. Resolved only as a device transaction ID in the same business and same device. Missing, another device/business, self-reference, or a DB row UUID with no corresponding device ID becomes null without rejecting the reprint. A valid original in the same accepted offline batch can also link. |
| `sourceMode` / `source_mode` | Optional exact `Photobooth`, `ID Photo`, or `Receiptbooth`, otherwise null. This is client-reported metadata, not inferred from a gallery filename. |

For normal-session records all new fields remain optional. If either copiesRequested or printStatus is supplied on any mode, both must be supplied and obey the same copy/send consistency checks below. Legacy records with neither retain their prior behavior and larger legacy printsUsed bounds. SQL also enforces these rules; existing records are not rewritten.

### Printer-send consistency

`printsUsed` means the count of whole output sheets/receipts whose complete job data was successfully sent, not portraits on a sheet and not confirmed physical output.

| printStatus | printsUsed | Portal wording |
| --- | --- | --- |
| `submitted` | Exactly copiesRequested | Sent to printer |
| `partial` | At least 1, strictly less than copiesRequested | Partially sent to printer |
| `failed` | 0 | Sending failed |
| `unknown` | 0 through copiesRequested; include only durably proven complete sends | Send outcome unknown |

For a Reprint with amountCentavos > 0, status **must be completed**, even if printStatus is failed/unknown. The actual paid method must be coin/voucher/qrph, never none. For a Reprint with amountCentavos = 0, status must be completed when printsUsed > 0 and failed when printsUsed = 0. Thus submitted/partial free batches are completed, a completely failed free send is failed, and an unknown free batch with no proven complete sends is failed. A partially known unknown batch can be completed for its known copies while its printStatus remains unknown. Zero-amount voucher batches record no new cash revenue.

Paid two-copy batch with failed sending, still PHP 50 collected:

```json
{"transactionId":"44444444-4444-4444-8444-444444444444","occurredAt":"2026-11-04T02:05:00Z","mode":"Reprint","paymentMethod":"qrph","status":"completed","amountCentavos":5000,"printsUsed":0,"copiesRequested":2,"printStatus":"failed","originalTransactionId":null,"sourceMode":"Receiptbooth"}
```

Free partial and uncertain finalized batch examples:

```json
{"transactionId":"55555555-5555-4555-8555-555555555555","occurredAt":"2026-11-04T02:10:00Z","mode":"Reprint","paymentMethod":"none","status":"completed","amountCentavos":0,"printsUsed":1,"copiesRequested":3,"printStatus":"partial"}
```

```json
{"transactionId":"66666666-6666-4666-8666-666666666666","occurredAt":"2026-11-04T02:15:00Z","mode":"Reprint","paymentMethod":"none","status":"failed","amountCentavos":0,"printsUsed":0,"copiesRequested":2,"printStatus":"unknown"}
```

`unknown` does not prove nothing printed. Do not automatically retry the physical job. No physical-completion telemetry is added. Reprint raw_payload is null to exclude arbitrary image/file metadata; the whitelisted journal columns provide the audit record. Do not put photos, Base64, local file paths or customer secrets in note/originalTransactionId.

## Reporting API and portal

`GET /api/business/transactions?dateFrom=2026-11-04&dateTo=2026-11-04&deviceId=kiosk-01&mode=Reprint&paymentMethod=none&status=completed&page=1&pageSize=50`

Requires the existing authenticated business session cookie. Filters are optional; omitted/empty/`all` means unrestricted. Dates are inclusive **Asia/Manila** calendar days, implemented as a half-open UTC interval through the following midnight. Omitted dates cover all recorded history. Page starts at 1, max 1000000; pageSize defaults 50, max 100. Ordering is occurred_at descending, then DB id descending. Device filtering also supports manually typing a historical device ID. A supplied businessId is ignored; the server supplies the authenticated owner's business ID.

Example response for one free two-copy batch (IDs illustrative):

```json
{
  "ok": true,
  "transactions": [{
    "id": "77777777-7777-4777-8777-777777777777",
    "device_id": "kiosk-01",
    "transaction_id": "33333333-3333-4333-8333-333333333333",
    "occurred_at": "2026-11-04T02:00:00+00:00",
    "received_at": "2026-11-04T02:01:00+00:00",
    "mode": "Reprint", "payment_method": "none", "status": "completed",
    "amount_centavos": 0, "voucher_code": null, "prints_used": 2,
    "note": "Complimentary saved-photo reprint",
    "copies_requested": 2, "print_status": "submitted",
    "original_transaction_id": null, "source_mode": "Photobooth"
  }],
  "summary": {
    "recordedRevenueCentavos": 0, "completedTransactions": 1,
    "coinPayments": 0, "voucherPayments": 0, "qrphPayments": 0,
    "failedVoucherAttempts": 0, "receiptboothCopiesRecorded": 0,
    "reprintBatches": 1, "reprintCopiesSent": 2, "reprintCopiesRequested": 2,
    "freeAdminReprintBatches": 1, "paidReprintRevenueCentavos": 0,
    "failedReprintBatches": 0, "partialReprintBatches": 0, "unknownReprintBatches": 0
  },
  "total": 1, "page": 1, "pageSize": 50, "hasMore": false,
  "reportingTimezone": "Asia/Manila", "asOf": "2026-11-04T02:02:00+00:00"
}
```

The PostgreSQL RPC `business_transaction_report` computes the entire filtered summary and paginated rows in one snapshot. There is no 1000-record aggregate limit. Paid-reprint revenue is included in recordedRevenueCentavos, so do not add the two cards together. Free/admin reprints are identified by payment_method none. Other zero-amount reprints are labeled no new charge. All copy metrics count recorded complete sends, including the known sent subset of an unknown batch, never assumed physical output. Legacy normal rows retain their recorded amounts/status semantics and are labeled legacy copies rather than reinterpreted as printer confirmations.

Dashboard `transactions` now contains the first report page; `transactionReport` supplies its full summary and paging metadata; `summary.transactions` is the full count, not the page length. If reporting fails, the dashboard sets transactionReport null, transactionReportUnavailable true and summary.transactions null. The dedicated report endpoint returns HTTP 503 `transaction_report_unavailable`; the portal displays an error, not zero totals. Invalid filters return HTTP 400 `invalid_report_filters`.

The RPC is executable only by service_role, uses security invoker, and receives the server-supplied business ID. Existing transaction RLS, ownership policies, historical records and uniqueness remain intact. Pages are separate report snapshots; concurrent late sync can change totals/order between requests, so use Refresh when reviewing changing data. Browser filters use occurred_at, not received_at, including for offline catch-up records.

## Files and local validation

- API: `server/device-transactions-sync.js`, `server/_reprint-contract.js`, `server/business-transactions.js`, `server/business-dashboard.js`, `api/business.js`, `vercel.json`. The existing `api/devices.js` sync route is unchanged.
- Portal: `src/BusinessTransactionsSection.jsx`, `src/business-transactions.css`, import/use in `src/main.jsx`.
- SQL: `supabase/migrations/202611040001_reprint_transaction_tracking.sql`, appended verbatim to `supabase/one_time_supabase_setup.sql`. The pre-existing `202610180002_qrph_transaction_sync.sql` is retained.
- Tests: `test/reprint-tracking.test.js`, existing QR Ph tests; dev-only PGlite dependency/package lock supports isolated PostgreSQL tests. No remote database or PayMongo calls are made by these new tests.
- Android: `docs/android-reprint-tracking-handoff.md`.

Run `npm.cmd test` and `npm.cmd run build`. No production migration, online deployment or Git push is part of this local preparation.

## Deployment when explicitly authorized

1. Back up production data and apply any still-unapplied prerequisite transaction migrations, including `202610180002_qrph_transaction_sync.sql`.
2. Apply **only** `202611040001_reprint_transaction_tracking.sql` to the existing production database before publishing the API/portal. Use the complete one-time script for fresh installation/catch-up only. No new Vercel environment variables are needed.
3. Deploy the reviewed backend and portal together. Verify an authenticated business report and existing coin/voucher/QR Ph sync. Direct anonymous/browser execution of the reporting RPC must be denied.
4. Implement the Android handoff, test gallery printer callbacks and crash recovery on real hardware, then release the APK separately. Verify a controlled free and paid reprint, a failed paid send, an offline retry, and a standalone record without original linkage.
5. Do not backfill gallery history that the app never journaled. Backend readiness alone cannot create missing device records or reconstruct physical output.
