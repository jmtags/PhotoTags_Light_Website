const crypto = require('node:crypto');
const PRODUCT = 'phototags_light';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function publicKey(jwk) {
  if (!jwk || jwk.kty !== 'EC' || jwk.crv !== 'P-256' || jwk.d ||
      !/^[A-Za-z0-9_-]{43}$/.test(jwk.x || '') || !/^[A-Za-z0-9_-]{43}$/.test(jwk.y || '')) throw new Error('invalid_public_key');
  const key = { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y };
  crypto.createPublicKey({ key, format: 'jwk' });
  return key;
}
function hash(value) { return crypto.createHash('sha256').update(value).digest('base64url'); }
function keyHash(key) { return hash(JSON.stringify(publicKey(key))); }
function signingKey(env = process.env) {
  const pem = env.LIGHT_SIGNING_PRIVATE_KEY?.replace(/\\n/g, '\n');
  if (!pem) throw new Error('light_signing_not_configured');
  const key = crypto.createPrivateKey(pem);
  if (key.asymmetricKeyType !== 'ec' || key.asymmetricKeyDetails?.namedCurve !== 'prime256v1') throw new Error('light_signing_key_invalid');
  return key;
}
function sign(payload, env) {
  const header = Buffer.from(JSON.stringify({ alg: 'ES256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const data = `${header}.${body}`;
  return `${data}.${crypto.sign('sha256', Buffer.from(data), { key: signingKey(env), dsaEncoding: 'ieee-p1363' }).toString('base64url')}`;
}
function verify(token, env) {
  if (typeof token !== 'string' || token.length > 5000) throw new Error('invalid_challenge');
  const [h, b, s, extra] = token.split('.');
  if (extra || !s || JSON.parse(Buffer.from(h, 'base64url')).alg !== 'ES256' || !crypto.verify('sha256', Buffer.from(`${h}.${b}`),
    { key: crypto.createPublicKey(signingKey(env)), dsaEncoding: 'ieee-p1363' }, Buffer.from(s, 'base64url'))) throw new Error('invalid_challenge');
  const payload = JSON.parse(Buffer.from(b, 'base64url'));
  if (payload.product !== PRODUCT || !Number.isFinite(payload.exp) || payload.exp <= Date.now() / 1000) throw new Error('challenge_expired');
  return payload;
}
function challenge(body, env) {
  if (!UUID.test(body.installationId || '') || !['register', 'check', 'activate', 'checkout', 'qr-checkout', 'payment-status'].includes(body.action) ||
      !/^[A-Za-z0-9_-]{43}$/.test(body.bodyHash || '')) throw new Error('invalid_challenge_request');
  return sign({ product: PRODUCT, type: 'challenge', jti: crypto.randomUUID(), sub: body.installationId,
    keyHash: keyHash(body.publicKey), action: body.action, bodyHash: body.bodyHash,
    exp: Math.floor(Date.now() / 1000) + 120 }, env);
}
function verifyProof(body, action, env) {
  const auth = body.auth || {};
  const payload = verify(auth.challenge, env);
  const key = publicKey(auth.publicKey);
  if (payload.type !== 'challenge' || payload.action !== action || payload.sub !== body.installationId || !UUID.test(payload.jti) ||
      payload.keyHash !== keyHash(key) || payload.bodyHash !== hash(JSON.stringify(body.data || {})) ||
      !crypto.verify('sha256', Buffer.from(auth.challenge), { key: crypto.createPublicKey({ key, format: 'jwk' }), dsaEncoding: 'ieee-p1363' }, Buffer.from(auth.signature || '', 'base64url'))) throw new Error('invalid_installation_proof');
  return { payload, publicKey: key };
}
function permit(installation, license, env = process.env) {
  const now = Math.floor(Date.now() / 1000);
  const days = Math.max(1, Math.min(30, Number(env.LIGHT_OFFLINE_DAYS) || 7));
  const expires = Math.min(now + days * 86400, license.expires_at ? Math.floor(Date.parse(license.expires_at) / 1000) : Infinity);
  if (!Number.isFinite(expires) || expires <= now) throw new Error('license_expired');
  return sign({ product: PRODUCT, type: 'permit', sub: installation.id, keyHash: installation.key_hash,
    licenseId: license.id, plan: license.plan_id, iat: now, exp: expires,
    licenseExpiresAt: license.expires_at }, env);
}
module.exports = { PRODUCT, UUID, publicKey, keyHash, hash, sign, verify, challenge, verifyProof, permit };
