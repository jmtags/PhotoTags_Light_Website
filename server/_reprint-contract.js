const SOURCE_MODES = ['Photobooth', 'ID Photo', 'Receiptbooth'];
const MODES = [...SOURCE_MODES, 'Reprint'];
const METHODS = ['coin', 'voucher', 'qrph', 'none'];
const PRINT_STATUSES = ['submitted', 'partial', 'failed', 'unknown'];

function reprintFields(item, { mode, paymentMethod, status, amountCentavos, printsUsed, voucherCode }) {
  const copies = item.copiesRequested ?? item.copies_requested ?? null;
  const printStatus = item.printStatus ?? item.print_status ?? null;
  const originalId = item.originalTransactionId ?? item.original_transaction_id ?? null;
  const sourceMode = item.sourceMode ?? item.source_mode ?? null;
  const invalid = () => ({ error: 'Invalid reprint or print metadata' });
  if (copies !== null && (!Number.isInteger(copies) || copies < 1 || copies > 10)) return invalid();
  if (printStatus !== null && !PRINT_STATUSES.includes(printStatus)) return invalid();
  if (originalId !== null && (typeof originalId !== 'string' || !originalId.trim() || originalId.length > 200)) return invalid();
  if (sourceMode !== null && !SOURCE_MODES.includes(sourceMode)) return invalid();
  if ((copies === null) !== (printStatus === null)) return invalid();
  if (mode === 'Reprint' && (copies === null || printStatus === null)) return invalid();
  if (copies !== null) {
    if (printsUsed > copies) return invalid();
    if (printStatus === 'submitted' && printsUsed !== copies) return invalid();
    if (printStatus === 'partial' && (printsUsed === 0 || printsUsed >= copies)) return invalid();
    if (printStatus === 'failed' && printsUsed !== 0) return invalid();
  }
  if (paymentMethod === 'none' && (mode !== 'Reprint' || amountCentavos !== 0 || voucherCode !== null)) return invalid();
  if (mode === 'Reprint') {
    if (amountCentavos > 0 && status !== 'completed') return invalid();
    if (amountCentavos === 0 && status !== (printsUsed > 0 ? 'completed' : 'failed')) return invalid();
  }
  return { row: {
    copies_requested: copies, print_status: printStatus,
    original_transaction_id: originalId?.trim() || null, source_mode: sourceMode
  } };
}

module.exports = { SOURCE_MODES, MODES, METHODS, PRINT_STATUSES, reprintFields };
