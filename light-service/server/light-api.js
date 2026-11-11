const crypto = require('node:crypto');
const base = require('./light-utils');
const keys = require('./light-crypto');
const payments = require('./light-payments');
function checked(result) {
  if (result.error) throw new Error('light_database_unavailable');
  return result.data;
}
function admin(request, env) {
  const password = request.headers['x-admin-password'];
  const expected = env.ADMIN_PASSWORD;
  return typeof expected === 'string' && expected.length > 0 && typeof password === 'string' &&
    Buffer.byteLength(expected) === Buffer.byteLength(password) && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(password));
}
const validText = (v, max = 80) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
const email = v => typeof v === 'string' && v.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
function adminValues(data) {
  const { action, id, values: v = {} } = data;
  if (action === 'create_license' && validText(v.planId, 40) && (!v.email || email(v.email))) return;
  if (action === 'set_license_status' && keys.UUID.test(id) && ['active', 'revoked', 'refunded'].includes(v.status)) return;
  if (action === 'set_installation_blocked' && keys.UUID.test(id) && typeof v.blocked === 'boolean') return;
  if (action === 'release_installation' && keys.UUID.test(id)) return;
  if (action === 'update_plan' && /^[a-z0-9_-]{3,40}$/.test(id || '') && validText(v.name) &&
      Number.isInteger(v.amount) && v.amount >= (v.active ? 100 : 0) && v.amount <= 10000000 &&
      (v.durationDays === null || Number.isInteger(v.durationDays) && v.durationDays >= 1 && v.durationDays <= 36500) &&
      Number.isInteger(v.maxInstallations) && v.maxInstallations >= 1 && v.maxInstallations <= 1000 && typeof v.active === 'boolean') return;
  throw new Error('invalid_light_admin_action');
}
function createLightHandler({ env = process.env, client = base.createClientFromEnv, fetcher = fetch } = {}) {
  return async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    const origin = request.headers.origin;
    const allowed = (env.LIGHT_ALLOWED_ORIGINS || 'https://boothphototags.vercel.app,https://www.phototags.app,https://phototags.app').split(',').map(v => v.trim());
    if (origin) {
      if (!allowed.includes(origin) && origin !== `https://${request.headers.host}`) return base.sendJson(response, 403, { ok: false, status: 'light_origin_denied' });
      response.setHeader('Access-Control-Allow-Origin', origin);
      response.setHeader('Vary', 'Origin');
      response.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Password');
      response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    }
    if (request.method === 'OPTIONS') { response.statusCode = 204; return response.end(); }
    const url = new URL(request.url || '/', 'https://light.local');
    const route = request.query?.route || url.searchParams.get('route');
    if (!['plans','admin','challenge','register','check','activate','checkout','payment-status','webhook'].includes(route)) return base.sendJson(response, 404, { ok: false, status: 'light_route_not_found' });
    if (request.method !== (route === 'plans' || route === 'admin' && request.method === 'GET' ? 'GET' : 'POST')) return base.sendJson(response, 405, { ok: false, status: 'method_not_allowed' });
    if (!base.checkRateLimit(request, `light_${route}`, route === 'challenge' ? 60 : 120, 60000)) return base.sendJson(response, 429, { ok: false, status: 'rate_limited' });
    try {
      const db = client();
      if (!db) throw new Error('light_server_not_configured');
      if (route === 'webhook') {
        const chunks = []; let size = 0;
        for await (const chunk of request) { size += Buffer.byteLength(chunk); if (size > 1024 * 1024) throw new Error('light_request_too_large'); chunks.push(Buffer.from(chunk)); }
        const raw = Buffer.concat(chunks).toString('utf8');
        if (!payments.verifyWebhook(raw, request.headers['paymongo-signature'], env)) return base.sendJson(response, 401, { ok: false, status: 'invalid_light_webhook_signature' });
        const event = JSON.parse(raw); const resource = event.data?.attributes?.data || event.data?.data;
        if (resource?.attributes?.metadata?.product !== keys.PRODUCT) return base.sendJson(response, 200, { ok: true, status: 'ignored' });
        const id = resource.attributes.metadata.light_payment_id;
        if (!keys.UUID.test(id || '')) throw new Error('invalid_light_payment');
        const session = checked(await db.from('light_payments').select('*').eq('id', id).maybeSingle());
        if (session) await payments.reconcile(db, session, env, fetcher);
        return base.sendJson(response, 200, { ok: true });
      }
      if (route === 'plans') {
        const plans = checked(await db.from('light_plans').select('*').eq('active', true).order('amount'));
        return base.sendJson(response, 200, { ok: true, product: keys.PRODUCT, plans });
      }
      if (route === 'admin') {
        if (!admin(request, env)) return base.sendJson(response, 401, { ok: false, status: 'unauthorized' });
        if (request.method === 'GET') {
          const names = ['light_plans','light_installations','light_licenses','light_activations','light_payments','light_audit'];
          const rows = await Promise.all(names.map(name => db.from(name).select('*').order(name === 'light_installations' ? 'last_seen_at' : name === 'light_activations' ? 'activated_at' : 'created_at', { ascending: false }).limit(1000)));
          const result = Object.fromEntries(names.map((name, i) => [name.replace('light_', ''), checked(rows[i])]));
          // Public verification keys are not useful to the admin; never expose any private keys.
          result.installations = result.installations.map(({ public_key, key_hash, ...rest }) => rest);
          return base.sendJson(response, 200, { ok: true, ...result });
        }
        const body = await readBody(request);
        if (body.action === 'recover_checkout') {
          if (!keys.UUID.test(body.id || '') || !/^cs_[A-Za-z0-9_]+$/.test(body.values?.checkoutId || '')) throw new Error('invalid_light_checkout_recovery');
          const session = checked(await db.from('light_payments').select('*').eq('id', body.id).maybeSingle());
          if (!session) throw new Error('light_payment_not_found');
          const recovered = await payments.recover(db, session, body.values.checkoutId, env, fetcher);
          return base.sendJson(response, 200, { ok: true, status: recovered.status });
        }
        adminValues(body);
        const data = checked(await db.rpc('light_admin_action', { p_action: body.action, p_id: body.id || '', p_values: body.values || {} }));
        return base.sendJson(response, 200, { ok: true, ...data });
      }
      const body = await readBody(request);
      if (route === 'challenge') return base.sendJson(response, 200, { ok: true, challenge: keys.challenge(body, env) });
      const proof = keys.verifyProof(body, route, env);
      if (!checked(await db.rpc('light_use_nonce', { p_id: proof.payload.jti, p_expires_at: new Date(proof.payload.exp * 1000).toISOString() }))) throw new Error('light_challenge_replayed');
      const data = body.data || {};
      const registration = checked(await db.rpc('light_register', { p_id: body.installationId, p_public_key: proof.publicKey,
        p_key_hash: proof.payload.keyHash, p_name: validText(data.name) ? data.name.trim() : 'My PhotoTags Light booth',
        p_platform: validText(data.platform) ? data.platform : 'Web', p_app_version: 'light-1' }));
      if (registration.status !== 'registered') throw new Error(registration.status);
      if (route === 'activate') {
        if (!/^PTL-[A-Z0-9-]{12,80}$/.test(data.licenseKey || '')) throw new Error('invalid_light_license_key');
        const activated = checked(await db.rpc('light_activate', { p_installation_id: body.installationId, p_license_key: data.licenseKey }));
        if (activated.status !== 'licensed') throw new Error(activated.status);
      }
      if (route === 'checkout') {
        if (!email(data.email) || data.acceptedAgreement !== true) throw new Error('light_email_and_agreement_required');
        const plan = checked(await db.from('light_plans').select('*').eq('id', data.planId).eq('active', true).maybeSingle());
        if (!plan || plan.amount < 100) throw new Error('light_plan_unavailable');
        const reservation = checked(await db.rpc('light_reserve_checkout', { p_installation_id: body.installationId, p_plan_id: plan.id, p_email: data.email }));
        const session = reservation.session;
        if (!reservation.owner) {
          if (session.checkout_id && session.checkout_url) return base.sendJson(response, 200, { ok: true, paymentId: session.id, checkoutUrl: session.checkout_url });
          throw new Error('light_checkout_pending_host_review');
        }
        const boothUrl = new URL(env.LIGHT_BOOTH_URL || 'https://boothphototags.vercel.app');
        if (boothUrl.protocol !== 'https:') throw new Error('light_booth_url_invalid');
        boothUrl.searchParams.set('light_payment', session.id);
        const checkout = await payments.provider('/checkout_sessions', { version: 'v2', method: 'POST', headers: { 'Idempotency-Key': session.id }, body: { data: { attributes: {
          line_items: [{ name: plan.name, amount: session.amount, currency: session.currency, quantity: 1 }],
          payment_method_types: ['qrph'], success_url: boothUrl.href, cancel_url: boothUrl.href,
          reference_number: session.reference_number, metadata: { product: keys.PRODUCT, light_payment_id: session.id, installation_id: body.installationId }
        } } } }, env, fetcher);
        const checkoutUrl = new URL(checkout?.attributes?.checkout_url);
        if (checkoutUrl.protocol !== 'https:' || !checkoutUrl.hostname.endsWith('.paymongo.com') || !/^cs_[a-zA-Z0-9_]+$/.test(checkout.id)) throw new Error('light_checkout_response_invalid');
        checked(await db.from('light_payments').update({ checkout_id: checkout.id, checkout_url: checkoutUrl.href }).eq('id', session.id));
        return base.sendJson(response, 200, { ok: true, paymentId: session.id, checkoutUrl: checkoutUrl.href });
      }
      if (route === 'payment-status') {
        if (!keys.UUID.test(data.paymentId || '')) throw new Error('invalid_light_payment');
        const session = checked(await db.from('light_payments').select('*').eq('id', data.paymentId).eq('installation_id', body.installationId).maybeSingle());
        if (!session) throw new Error('light_payment_not_found');
        const paid = await payments.reconcile(db, session, env, fetcher);
        if (paid.status !== 'paid') return base.sendJson(response, 200, { ok: true, status: paid.status });
      }
      const activation = checked(await db.from('light_activations').select('license_id,light_licenses(*)').eq('installation_id', body.installationId).maybeSingle());
      const license = activation?.light_licenses;
      if (!license || license.status !== 'active' || license.expires_at && Date.parse(license.expires_at) <= Date.now()) return base.sendJson(response, 200, { ok: true, status: 'unlicensed', permit: null });
      const token = keys.permit({ id: body.installationId, key_hash: proof.payload.keyHash }, license, env);
      checked(await db.from('light_installations').update({ last_permit_expires_at: new Date(keys.verify(token, env).exp * 1000).toISOString() }).eq('id', body.installationId));
      return base.sendJson(response, 200, { ok: true, status: 'licensed', permit: token });
    } catch (error) {
      const status = error.message;
      const unavailable = /configured|database_unavailable|provider_unavailable|fulfillment_failed/.test(status);
      return base.sendJson(response, unavailable ? 503 : 400, { ok: false, status: /^([a-z_]+)$/.test(status) ? status : 'light_request_failed' });
    }
  };
}
async function readBody(request) {
  if (request.body && typeof request.body === 'object') return request.body;
  const chunks = []; let size = 0;
  for await (const chunk of request) { size += Buffer.byteLength(chunk); if (size > 16384) throw new Error('light_request_too_large'); chunks.push(Buffer.from(chunk)); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { throw new Error('invalid_json'); }
}
module.exports = { createLightHandler, adminValues, admin };
