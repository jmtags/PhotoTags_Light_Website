const payments = require('./light-payments');
const { PRODUCT } = require('./light-crypto');
function checked(result) {
  if (result.error) throw new Error(['PGRST202','PGRST204','42703','42883'].includes(result.error.code) ? 'light_inline_qr_not_configured' : /^light_[a-z_]+$/.test(result.error.message || '') ? result.error.message : 'light_database_unavailable');
  return result.data;
}
function validateIntent(intent, session) {
  const a = intent?.attributes || {}, m = a.metadata || {};
  if (intent?.id !== session.payment_intent_id || a.amount !== session.amount || a.currency !== session.currency ||
      m.product !== PRODUCT || m.light_payment_id !== session.id || m.installation_id !== session.installation_id ||
      m.reference_number !== session.reference_number) throw new Error('light_payment_mismatch');
  return a;
}
function imageUrl(value) {
  if (typeof value !== 'string' || value.length > 1000000) throw new Error('light_qr_unavailable');
  if (/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=\r\n]+$/.test(value)) return value;
  if (/^[A-Za-z0-9+/=\r\n]+$/.test(value)) return `data:image/png;base64,${value}`;
  throw new Error('light_qr_unavailable');
}
function view(session, status = session.status) {
  return { paymentId: session.id, status, planId: session.plan_id, amount: session.amount, currency: session.currency,
    reference: session.reference_number, qrImageUrl: session.qr_image_url || undefined, expiresAt: session.qr_expires_at || undefined };
}
async function retrieve(session, env, fetcher) {
  const intent = await payments.provider(`/payment_intents/${encodeURIComponent(session.payment_intent_id)}`, {}, env, fetcher);
  validateIntent(intent, session); return intent;
}
async function reconcile(db, session, env, fetcher, known) {
  if (session.status === 'paid' && session.license_id) return session;
  const intent = known || await retrieve(session, env, fetcher), a = validateIntent(intent, session);
  const paid = (a.payments || []).find(p => p.attributes?.status === 'paid');
  if (a.status === 'succeeded' && paid) {
    const p = paid.attributes;
    if (p.amount !== session.amount || p.currency !== session.currency ||
      p.payment_intent_id && p.payment_intent_id !== session.payment_intent_id ||
      p.source?.type && p.source.type !== 'qrph') throw new Error('light_payment_mismatch');
    const licenseId = checked(await db.rpc('light_fulfill_qr', { p_payment_id: session.id, p_intent_id: intent.id,
      p_amount: p.amount, p_currency: p.currency, p_reference: a.metadata.reference_number }));
    return { ...session, status: 'paid', license_id: licenseId };
  }
  if (a.status === 'cancelled') {
    checked(await db.from('light_payments').update({status:'failed'}).eq('id',session.id).eq('status','pending'));
    return {...session,status:'failed'};
  }
  return session;
}
async function saveCode(db, session, intent) {
  const a = validateIntent(intent, session);
  if (a.status !== 'awaiting_next_action') return session;
  const qr = imageUrl(a.next_action?.code?.image_url);
  // Use the original reservation time when recovering, never extend an old QR's displayed lifetime.
  const expires = session.qr_expires_at || new Date(Date.parse(session.created_at) + 1800000).toISOString();
  checked(await db.from('light_payments').update({qr_image_url:qr,qr_expires_at:expires}).eq('id',session.id));
  return {...session,qr_image_url:qr,qr_expires_at:expires};
}
async function checkout(db, installationId, data, env, fetcher) {
  let reserved = checked(await db.rpc('light_reserve_qr',{p_installation_id:installationId,p_plan_id:data.planId,p_email:data.email}));
  let session = reserved.session;
  if (session.checkout_id) return {paymentId:session.id,status:'hosted_pending',checkoutUrl:session.checkout_url};
  if (!reserved.owner) {
    if (!session.payment_intent_id) throw new Error('light_checkout_pending_host_review');
    let intent = await retrieve(session,env,fetcher);
    let state = await reconcile(db,session,env,fetcher,intent);
    if (state.status === 'paid') return view(state);
    // Only a confirmed cancelled intent may be replaced; expiry on the device is not proof.
    if (session.qr_expires_at && Date.parse(session.qr_expires_at) <= Date.now() &&
        ['awaiting_payment_method','awaiting_next_action'].includes(intent.attributes.status)) {
      intent = await payments.provider(`/payment_intents/${intent.id}/cancel`,{method:'POST'},env,fetcher);
      state = await reconcile(db,session,env,fetcher,intent);
    }
    if (state.status !== 'failed') return view(await saveCode(db,session,intent));
    reserved = checked(await db.rpc('light_reserve_qr',{p_installation_id:installationId,p_plan_id:data.planId,p_email:data.email}));
    session = reserved.session;
    if (!reserved.owner) throw new Error('light_checkout_pending_host_review');
  }
  const plan = checked(await db.from('light_plans').select('*').eq('id',session.plan_id).maybeSingle());
  const metadata = {product:PRODUCT,light_payment_id:session.id,installation_id:installationId,reference_number:session.reference_number};
  const intent = await payments.provider('/payment_intents',{method:'POST',headers:{'Idempotency-Key':session.id},body:{data:{attributes:{
    amount:session.amount,currency:session.currency,payment_method_allowed:['qrph'],
    description:`PhotoTags Light license - ${plan.name} - ${session.reference_number}`,metadata
  }}}},env,fetcher);
  if (!/^pi_[A-Za-z0-9_]+$/.test(intent?.id || '')) throw new Error('light_payment_mismatch');
  session = {...session,payment_intent_id:intent.id}; validateIntent(intent,session);
  checked(await db.rpc('light_attach_qr_intent',{p_id:session.id,p_intent_id:intent.id}));
  const method = await payments.provider('/payment_methods',{method:'POST',body:{data:{attributes:{type:'qrph',expiry_seconds:1800,billing:{email:session.customer_email}}}}},env,fetcher);
  if (!/^pm_[A-Za-z0-9_]+$/.test(method?.id || '')) throw new Error('light_qr_unavailable');
  const attached = await payments.provider(`/payment_intents/${intent.id}/attach`,{method:'POST',body:{data:{attributes:{payment_method:method.id}}}},env,fetcher);
  return view(await saveCode(db,session,attached));
}
async function recover(db,session,intentId,env,fetcher) {
  const candidate = {...session,payment_intent_id:intentId};
  let intent = await retrieve(candidate,env,fetcher);
  if (intent.attributes.status === 'awaiting_payment_method') intent = await payments.provider(`/payment_intents/${intent.id}/cancel`,{method:'POST'},env,fetcher);
  checked(await db.rpc('light_attach_qr_intent',{p_id:session.id,p_intent_id:intentId}));
  return reconcile(db,await saveCode(db,candidate,intent),env,fetcher,intent);
}
module.exports = {checkout,reconcile,recover,retrieve,view,validateIntent,imageUrl};
