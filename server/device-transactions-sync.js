const {
  checkRateLimit,
  cleanText,
  createClientFromEnv,
  readJson,
  sendJson,
  validateDeviceId
} = require('./_business-utils');

const { MODES, METHODS, reprintFields } = require('./_reprint-contract');
const VALID_MODES = new Set(MODES);
const VALID_PAYMENT_METHODS = new Set(METHODS);
const VALID_STATUSES = new Set(['completed', 'failed']);
const MAX_TRANSACTIONS_PER_SYNC = 500;

function cleanOptionalText(value, maxLength) {
  const cleaned = cleanText(value, maxLength);
  return cleaned || null;
}

function parseTimestamp(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function toInteger(value) {
  return Number.isInteger(value) ? value : null;
}

function safeRawPayload(value) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return null;
  }
}

function normalizeTransaction(item) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) {
    return { error: 'Invalid payload' };
  }

  const transactionId = cleanText(item.transactionId || item.transaction_id, 200);
  const occurredAt = parseTimestamp(item.occurredAt || item.occurred_at);
  const mode = cleanText(item.mode, 40);
  const paymentMethod = cleanText(item.paymentMethod || item.payment_method, 20).toLowerCase();
  const status = cleanText(item.status, 20).toLowerCase();
  const amountCentavos = toInteger(item.amountCentavos ?? item.amount_centavos);
  const printsUsed = toInteger(item.printsUsed ?? item.prints_used);
  const voucherCode = cleanOptionalText(item.voucherCode || item.voucher_code, 120);
  const note = cleanOptionalText(item.note, 1000);

  if (!transactionId || !occurredAt || !VALID_MODES.has(mode) || !VALID_PAYMENT_METHODS.has(paymentMethod) || !VALID_STATUSES.has(status)) {
    return { transactionId: transactionId || null, error: 'Invalid payload' };
  }

  if (amountCentavos === null || amountCentavos < 0 || amountCentavos > 10000000 || printsUsed === null || printsUsed < 0 || printsUsed > 10000) {
    return { transactionId, error: 'Invalid payload' };
  }

  const metadata = reprintFields(item, { mode, paymentMethod, status, amountCentavos, printsUsed, voucherCode });
  if (metadata.error) return { transactionId, error: metadata.error };

  return {
    transactionId,
    row: {
      transaction_id: transactionId,
      occurred_at: occurredAt,
      mode,
      payment_method: paymentMethod,
      status,
      amount_centavos: amountCentavos,
      voucher_code: voucherCode,
      prints_used: printsUsed,
      note,
      ...metadata.row,
      // New reprint records deliberately exclude arbitrary gallery/file data.
      raw_payload: mode === 'Reprint' ? null : safeRawPayload(item)
    }
  };
}

module.exports = async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    sendJson(response, 405, { ok: false, status: 'method_not_allowed' });
    return;
  }

  if (!checkRateLimit(request, 'device_transactions_sync', 120, 60 * 1000)) {
    sendJson(response, 429, { ok: false, status: 'rate_limited' });
    return;
  }

  const supabase = createClientFromEnv();
  if (!supabase) {
    sendJson(response, 500, { ok: false, status: 'server_not_configured' });
    return;
  }

  let body;
  try {
    body = await readJson(request);
  } catch {
    sendJson(response, 400, { ok: false, status: 'invalid_json' });
    return;
  }

  const deviceId = cleanText(body.deviceId || body.device_id, 200);
  const businessId = cleanText(body.businessId || body.business_id, 80);
  const transactions = Array.isArray(body.transactions) ? body.transactions : null;

  if (!validateDeviceId(deviceId) || !businessId || !transactions || transactions.length > MAX_TRANSACTIONS_PER_SYNC) {
    sendJson(response, 400, { ok: false, status: 'invalid_sync_request' });
    return;
  }

  const { data: device, error: deviceError } = await supabase
    .from('devices')
    .select('device_id, business_id')
    .eq('device_id', deviceId)
    .eq('business_id', businessId)
    .maybeSingle();

  if (deviceError) {
    sendJson(response, 500, { ok: false, status: 'device_lookup_failed' });
    return;
  }

  if (!device) {
    sendJson(response, 403, { ok: false, status: 'device_not_paired_to_business' });
    return;
  }

  const accepted = [];
  const duplicates = [];
  const failed = [];
  const normalized = [];
  const seenInRequest = new Set();

  transactions.forEach((item) => {
    const result = normalizeTransaction(item);
    if (result.error) {
      failed.push({
        transactionId: result.transactionId || cleanText(item?.transactionId || item?.transaction_id, 200) || null,
        reason: result.error
      });
      return;
    }

    if (seenInRequest.has(result.transactionId)) {
      duplicates.push(result.transactionId);
      return;
    }

    seenInRequest.add(result.transactionId);
    normalized.push(result);
  });

  if (normalized.length) {
    const ids = normalized.map((item) => item.transactionId);
    const { data: existing, error: existingError } = await supabase
      .from('transactions')
      .select('transaction_id')
      .eq('device_id', deviceId)
      .in('transaction_id', ids);

    if (existingError) {
      sendJson(response, 500, { ok: false, status: 'transaction_lookup_failed' });
      return;
    }

    const existingIds = new Set((existing || []).map((item) => item.transaction_id));
    const originalIds = [...new Set(normalized.filter(item => !existingIds.has(item.transactionId))
      .map(item => item.row.original_transaction_id).filter(Boolean))];
    const allowedOriginals = new Set(normalized.filter(item => !existingIds.has(item.transactionId)).map(item => item.transactionId));
    if (originalIds.length) {
      const { data: originals, error: originalsError } = await supabase.from('transactions')
        .select('transaction_id').eq('business_id', businessId).eq('device_id', deviceId)
        .in('transaction_id', originalIds);
      if (originalsError) return sendJson(response, 500, { ok: false, status: 'transaction_lookup_failed' });
      (originals || []).forEach(item => allowedOriginals.add(item.transaction_id));
    }
    const rows = normalized
      .filter((item) => {
        if (existingIds.has(item.transactionId)) {
          duplicates.push(item.transactionId);
          return false;
        }

        return true;
      })
      .map((item) => ({
        ...item.row,
        original_transaction_id: item.row.original_transaction_id !== item.transactionId
          && allowedOriginals.has(item.row.original_transaction_id) ? item.row.original_transaction_id : null,
        business_id: businessId,
        device_id: deviceId
      }));

    if (rows.length) {
      const { data: inserted, error: insertError } = await supabase
        .from('transactions')
        .upsert(rows, {
          onConflict: 'device_id,transaction_id',
          ignoreDuplicates: true
        })
        .select('transaction_id');

      if (insertError) {
        rows.forEach((row) => {
          failed.push({ transactionId: row.transaction_id, reason: 'Insert failed' });
        });
      } else {
        const insertedIds = new Set((inserted || []).map((item) => item.transaction_id));
        accepted.push(...insertedIds);
        rows.forEach((row) => {
          if (!insertedIds.has(row.transaction_id)) {
            duplicates.push(row.transaction_id);
          }
        });
      }
    }
  }

  await supabase
    .from('devices')
    .update({ last_seen_at: new Date().toISOString() })
    .eq('device_id', deviceId);

  sendJson(response, 200, { ok: true, accepted, duplicates, failed });
};

module.exports.normalizeTransaction = normalizeTransaction;
