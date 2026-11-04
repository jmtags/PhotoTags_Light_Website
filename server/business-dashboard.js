const {
  createClientFromEnv,
  getBusinessAuth,
  sendJson
} = require('./_business-utils');

function normalizeBusiness(row) {
  return {
    id: row.id,
    businessName: row.business_name,
    ownerName: row.owner_name,
    email: row.email,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function normalizeSettings(row) {
  return {
    paymongoConnected: Boolean(row?.paymongo_public_key && row?.paymongo_secret_key_encrypted),
    paymongoPublicKey: row?.paymongo_public_key || '',
    secretKeySaved: Boolean(row?.paymongo_secret_key_encrypted),
    webhookSecretSaved: Boolean(row?.webhook_secret_encrypted),
    qrphEnabled: Boolean(row?.qrph_enabled),
    webhookEnabled: Boolean(row?.webhook_enabled),
    updatedAt: row?.updated_at || null
  };
}

module.exports = async function handler(request, response) {
  const supabase = createClientFromEnv();

  if (!supabase) {
    sendJson(response, 500, { ok: false, status: 'server_not_configured' });
    return;
  }

  const auth = await getBusinessAuth(request, supabase);
  if (!auth) {
    sendJson(response, 401, { ok: false, status: 'unauthenticated' });
    return;
  }

  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    sendJson(response, 405, { ok: false, status: 'method_not_allowed' });
    return;
  }

  const businessId = auth.business.id;
  const [
    settingsResult,
    devicesResult,
    paymentsResult,
    transactionsResult,
    codeResult
  ] = await Promise.all([
    supabase.from('business_payment_settings').select('paymongo_public_key, paymongo_secret_key_encrypted, webhook_secret_encrypted, qrph_enabled, webhook_enabled, updated_at').eq('business_id', businessId).maybeSingle(),
    supabase.from('devices').select('device_id, app_version, platform, status, paired_at, last_seen_at, created_at, updated_at').eq('business_id', businessId).order('last_seen_at', { ascending: false }).limit(100),
    supabase.from('payment_sessions').select('id, device_id, mode, amount, currency, status, paymongo_checkout_url, paid_at, expires_at, created_at, updated_at').eq('business_id', businessId).order('created_at', { ascending: false }).limit(100),
    supabase.rpc('business_transaction_report', { p_business_id: businessId }),
    supabase.from('device_pairing_codes').select('code, expires_at, used_at, created_at').eq('business_id', businessId).is('used_at', null).gt('expires_at', new Date().toISOString()).order('created_at', { ascending: false }).limit(1).maybeSingle()
  ]);

  const firstError = [settingsResult, devicesResult, paymentsResult, codeResult].find((result) => result.error && result.error.code !== 'PGRST116')?.error;
  if (firstError) {
    sendJson(response, 500, { ok: false, status: 'dashboard_failed' });
    return;
  }

  sendJson(response, 200, {
    ok: true,
    status: 'ready',
    business: normalizeBusiness(auth.business),
    paymentSettings: normalizeSettings(settingsResult.data),
    webhookPath: `/api/paymongo/webhook?businessId=${encodeURIComponent(businessId)}`,
    activePairingCode: codeResult.data || null,
    devices: devicesResult.data || [],
    payments: paymentsResult.data || [],
    transactions: transactionsResult.data?.transactions || [],
    transactionReport: transactionsResult.error ? null : transactionsResult.data,
    transactionReportUnavailable: Boolean(transactionsResult.error),
    summary: {
      linkedDevices: (devicesResult.data || []).length,
      paymongoConnected: normalizeSettings(settingsResult.data).paymongoConnected,
      qrphEnabled: Boolean(settingsResult.data?.qrph_enabled),
      payments: (paymentsResult.data || []).length,
      transactions: transactionsResult.error ? null : transactionsResult.data?.total ?? null
    }
  });
};
