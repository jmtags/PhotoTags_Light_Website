# Android handoff: gallery reprints through existing transaction sync

Backend contract: `docs/reprint-transaction-tracking.md` in the website project. This is work for the Android repository, not an instruction to change Android from this website task. The gallery currently sends jobs without transaction creation. Implement this device work before expecting reprint activity in either local or business dashboards.

## Local SQLite journal and identifiers

Extend the existing local transaction/offline queue model with nullable copies_requested, print_status, original_transaction_id and source_mode. Add exact mode Reprint and method none. Preserve the existing database and old records using an additive local migration. Add a unique key for (device_id, transaction_id); enqueue/finalize with SQLite transactions and conflict-safe inserts.

Before submitting a gallery reprint, snapshot an immutable batch in SQLite with one UUID batchId/transactionId, paired business/device identity, creation time, copiesRequested (1-10), sourceMode if reliably known, originalTransactionId if durably associated, actual new payment method/amount, and one stable job ID per requested output. Preserve that pairing identity across offline retries; never relabel an old job with a newly paired business. The original ID is the source device transaction identifier, not a SQLite integer, database UUID, file name or newly guessed ID. If the saved asset has no durable association, use null and allow a standalone reprint.

The local unfinished job journal and the finalized sync transaction are different lifecycle records. Do not upload an initial pending transaction: the endpoint is insert-only and will ignore a later record with the same ID. Only enqueue a finalized batch transaction once. A deliberate new reprint gets a fresh batch UUID even for the same image. Never resend physical data in response to a transaction sync retry.

## Per-job printer results

Every printer submission API must include batchId and jobId in its results, or return a handle that maps durably to those IDs. Do not use a generic global printer status or the number of portraits as the copy counter. Journal the following transitions with serialized/deduplicated callbacks:

- job queued: persisted before any USB/Bluetooth/network output.
- job sending: record start for this specific job.
- complete data sent: callback only after every byte/chunk of that job's data has been accepted by the transport/write loop; increment its confirmed copy count once. Starting a coroutine, entering the print animation, enqueueing work, or first successful chunk is insufficient.
- send failure before complete: include batchId/jobId, error stage and a privacy-safe message. A partially sent copy is not counted as a complete output.
- indeterminate outcome: disconnect, timeout, process death or missing correlated callback means unknown. Keep already durably confirmed complete sends; do not infer the others succeeded. A USB write completion is still not physical printer completion.

Reconcile out-of-order/duplicate callbacks through unique per-job IDs and monotonic durable states. Finalize only when all jobs have a known send result, or deliberately finalize an interrupted/uncertain batch during recovery. Do not let a late callback mutate an already-synced finalized transaction. Keep the unresolved device journal for admin review rather than publishing a second conflicting record or counting the same batch twice.

## Finalized transaction mapping

- printsUsed = number of unique complete-data-sent jobs, bounded by copiesRequested; one output sheet/receipt is one copy.
- printStatus submitted: all requested complete jobs were sent. Local and portal wording: Sent to printer.
- printStatus partial: at least one complete job sent and another job definitively failed; printsUsed strictly between 0 and requested.
- printStatus failed: zero complete jobs sent, with a definite failed send.
- printStatus unknown: at least one outcome is unresolved; printsUsed is only the durably confirmed complete subset (0 through requested). Never show Physically printed.
- amountCentavos is the actual new charge for the batch, not the configured price, the original sale price, or a prior session's reusable credit counted twice. Actual new coin/voucher/qrph payment uses that method. No payment uses none, amount 0, voucherCode null.
- A positive-amount reprint must use transaction status completed regardless of printStatus. Keep the collected payment in local revenue even after print failure. For amount 0, status is completed when printsUsed > 0, otherwise failed. A zero-value voucher can retain method voucher but contributes no new cash.
- occurredAt is the batch finalization time as a UTC ISO timestamp, persisted once; retries retain that time. Existing older transactions keep their original occurredAt. Both local business reports and portal reporting dates must use Asia/Manila. Do not use upload time for daily attribution.

Atomically finalize the local batch and insert/enqueue exactly one transaction keyed by its stable batchId. Keep per-copy callback data in the local job journal; do not sync photos, local gallery paths or Base64. Show batch type, requested/sent copies, send status, actual amount and method, origin if known, transaction ID, and pending/synced/error state in the app's local dashboard. Keep monetary and copy-activity totals separate, with zero revenue from free copies.

## Existing offline queue

Send finalized Reprint rows alongside normal transactions to **POST /api/devices/transactions/sync** using the existing device/business envelope and queue. See exact JSON examples in the backend contract. Add camelCase copiesRequested, printStatus, originalTransactionId and sourceMode. There is no new reprint endpoint and no physical-print trigger in the server response.

Persist accepted and duplicates acknowledgements as synced. Leave failed IDs queued for review/correction according to their returned reason; HTTP 200 with failed entries is not a full-batch acknowledgement. Keep the same transactionId and finalized payload after timeouts. Preserve original business ownership when the app is re-paired; mismatched business/device gets 403, not an excuse to move historical revenue to another owner. Record a correction/refund explicitly through a separately designed flow; do not edit and replay an already acknowledged ID expecting an update.

On process restart, recover unfinished journal entries conservatively. If an outcome cannot be proven from matching persisted callbacks, create a finalized unknown record with only proven sends. Do not automatically repeat the physical print. A crash between physical sending and journal commit is fundamentally uncertain; show it for admin review. Never invent transactions for older gallery reprints that were not journaled.

## Android acceptance checks

Exercise two-copy free send, new charged reprint, partial failure, complete failure with a real payment retained, unknown after disconnect/restart, duplicate and out-of-order callbacks, multiple portraits on one sheet counting as one, unrelated printer callbacks, retrying offline sync without another print, and a deliberate second reprint creating a distinct ID. Verify local SQLite uniqueness, business binding, exactly one finalized local transaction per batch, local/portal total agreement, and old coin/voucher/QR Ph journal compatibility.
