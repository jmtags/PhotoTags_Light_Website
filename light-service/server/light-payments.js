const crypto = require('node:crypto');
const { PRODUCT } = require('./light-crypto');
function providerKey(env) { return env.LIGHT_PAYMONGO_SECRET_KEY || env.PAYMONGO_SECRET_KEY; }
async function provider(path, options = {}, env = process.env, fetcher = fetch) {
  const key = providerKey(env);
  if (!key) throw new Error('light_payments_not_configured');
  const response = await fetcher(`https://api.paymongo.com/${options.version || 'v1'}${path}`, {
    method: options.method || 'GET',
    headers: { Authorization: `Basic ${Buffer.from(`${key}:`).toString('base64')}`, 'Content-Type': 'application/json', ...(options.headers || {}) },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(15000)
  });
  const result = await response.json();
  if (!response.ok) throw new Error('light_payment_provider_unavailable');
  return result.data;
}
function validatePaidCheckout(checkout, session) {
  const a = checkout?.attributes || {};
  const payments = [...(a.payments || []), ...(a.payment_intent?.attributes?.payments || [])];
  const paid = payments.find(p => ['paid', 'succeeded'].includes(p.attributes?.status));
  if (!paid) return false;
  const p = paid.attributes;
  if (checkout.id !== session.checkout_id || a.metadata?.product !== PRODUCT || a.metadata?.light_payment_id !== session.id ||
      a.reference_number !== session.reference_number || p.amount !== session.amount || p.currency !== session.currency ||
      a.metadata?.installation_id !== session.installation_id) throw new Error('light_payment_mismatch');
  return true;
}
async function recover(db, session, checkoutId, env, fetcher) {
  const checkout = await provider(`/checkout_sessions/${encodeURIComponent(checkoutId)}`, {}, env, fetcher);
  const a = checkout?.attributes || {};
  if (checkout?.id !== checkoutId || a.metadata?.product !== PRODUCT || a.metadata?.light_payment_id !== session.id ||
      a.reference_number !== session.reference_number || a.metadata?.installation_id !== session.installation_id) throw new Error('light_checkout_recovery_mismatch');
  const url = new URL(a.checkout_url);
  if (url.protocol !== 'https:' || !url.hostname.endsWith('.paymongo.com')) throw new Error('light_checkout_response_invalid');
  const { error } = await db.rpc('light_attach_checkout', { p_id: session.id, p_checkout_id: checkoutId, p_url: url.href });
  if (error) throw new Error('light_checkout_recovery_failed');
  return reconcile(db, { ...session, checkout_id: checkoutId, checkout_url: url.href }, env, fetcher);
}
async function reconcile(db, session, env, fetcher) {
  if (session.status === 'paid' && session.license_id) return session;
  if (!session.checkout_id) return session;
  const checkout = await provider(`/checkout_sessions/${encodeURIComponent(session.checkout_id)}`, {}, env, fetcher);
  if (!validatePaidCheckout(checkout, session)) return session;
  const { data, error } = await db.rpc('light_fulfill_payment', {
    p_payment_id: session.id, p_checkout_id: checkout.id, p_amount: session.amount,
    p_currency: session.currency, p_reference: session.reference_number
  });
  if (error) throw new Error('light_payment_fulfillment_failed');
  return { ...session, status: 'paid', license_id: data };
}
function verifyWebhook(raw, signature, env = process.env) {
  const secret = env.LIGHT_PAYMONGO_WEBHOOK_SECRET;
  if (!secret || typeof signature !== 'string') return false;
  const parts = Object.fromEntries(signature.split(',').map(s => s.trim().split('=')));
  const timestamp = Number(parts.t);
  if (!Number.isFinite(timestamp) || Math.abs(Date.now() / 1000 - timestamp) > 300) return false;
  const given = parts[providerKey(env)?.startsWith('sk_test_') ? 'te' : 'li'] || '';
  const expected = crypto.createHmac('sha256', secret).update(`${parts.t}.${raw}`).digest('hex');
  return given.length === expected.length && crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}
module.exports = { provider, reconcile, recover, validatePaidCheckout, verifyWebhook };
