const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeTransaction } = require('../server/device-transactions-sync');
const record = {
  transactionId: 'qrph-payment-session', occurredAt: '2026-10-18T00:00:00Z',
  mode: 'Receiptbooth', paymentMethod: 'qrph', status: 'completed',
  amountCentavos: 15000, printsUsed: 2,
  note: 'paymentSessionId=payment-session; requestId=request-id'
};
test('QR Ph transactions preserve payment identifiers and amount', () => {
  const result = normalizeTransaction(record);
  assert.equal(result.error, undefined);
  assert.equal(result.row.payment_method, 'qrph');
  assert.equal(result.row.amount_centavos, 15000);
  assert.equal(result.row.note, record.note);
});
test('coin and voucher sync still normalize', () => {
  for (const paymentMethod of ['coin', 'voucher']) {
    assert.equal(normalizeTransaction({ ...record, paymentMethod }).error, undefined);
  }
});
test('unknown methods and invalid amounts remain rejected', () => {
  assert.ok(normalizeTransaction({ ...record, paymentMethod: 'unknown' }).error);
  assert.ok(normalizeTransaction({ ...record, amountCentavos: -1 }).error);
});
