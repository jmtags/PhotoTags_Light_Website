const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), crypto = require('node:crypto');
const {PGlite} = require('@electric-sql/pglite');
const database = require('../scripts/lib/light-test-db.cjs');
const fixture = require('../scripts/lib/light-qr-fixture.cjs');
const keys = require('../light-service/server/light-crypto');
const qr = require('../light-service/server/light-qr');
const {createLightHandler} = require('../light-service/server/light-api');
let pg,db;
const signer=crypto.generateKeyPairSync('ec',{namedCurve:'prime256v1'});
const env={LIGHT_SIGNING_PRIVATE_KEY:signer.privateKey.export({type:'pkcs8',format:'pem'}),LIGHT_PAYMONGO_SECRET_KEY:'sk_test_fixture',LIGHT_PAYMONGO_WEBHOOK_SECRET:'fixture-webhook'};
test.before(async()=>{
  pg=new PGlite();await pg.exec("create role anon;create role authenticated;create role service_role;create table licenses(id text);insert into licenses values('apk-untouched');");
  await pg.exec(fs.readFileSync('supabase/migrations/202611110001_light_licensing.sql','utf8'));
  const migration=fs.readFileSync('supabase/migrations/202611120001_light_inline_qr.sql','utf8');await pg.exec(migration);await pg.exec(migration);
  await pg.exec("update light_plans set active=true,amount=2000 where id='weekly'");db=database(pg);
});
test.after(async()=>{await pg?.close();});
function client(provider){
  const id=crypto.randomUUID(),pair=crypto.generateKeyPairSync('ec',{namedCurve:'prime256v1'}),pub=keys.publicKey(pair.publicKey.export({format:'jwk'}));
  const handler=createLightHandler({env,client:()=>db,fetcher:provider.fetcher});
  return {id,handler,async call(route,data){
    const challenge=keys.challenge({installationId:id,publicKey:pub,action:route,bodyHash:keys.hash(JSON.stringify(data))},env);
    const signature=crypto.sign('sha256',Buffer.from(challenge),{key:pair.privateKey,dsaEncoding:'ieee-p1363'}).toString('base64url');
    const request={url:`/api/light?route=${route}`,method:'POST',headers:{host:'light.test','x-forwarded-for':crypto.randomUUID()},body:{installationId:id,data,auth:{challenge,publicKey:pub,signature}}};
    const response={setHeader(){},end(raw){this.body=JSON.parse(raw);}};await handler(request,response);return {code:response.statusCode,...response.body};
  }};
}
const order={planId:'weekly',email:'fixture@example.test',acceptedAgreement:true};
test('in-app QR reuses a pending intent, labels the payment, verifies paid status and fulfills exactly once',async()=>{
  const provider=fixture(),c=client(provider);
  const denied=await c.call('qr-checkout',{...order,acceptedAgreement:false});assert.equal(denied.ok,false);
  const first=await c.call('qr-checkout',order);assert.equal(first.code,200,JSON.stringify(first));assert.match(first.qrImageUrl,/^data:image\/png;base64,/);assert.equal(first.checkoutUrl,undefined);
  const second=await c.call('qr-checkout',order);assert.equal(second.paymentId,first.paymentId);assert.equal(provider.intents.size,1);
  const intent=[...provider.intents.values()][0];assert.match(intent.attributes.description,/PhotoTags Light license - Light Weekly - PTL-/);
  assert.equal(JSON.stringify(first).includes('sk_test'),false);assert.equal(JSON.stringify(first).includes('client_key'),false);
  assert.equal((await c.call('payment-status',{paymentId:first.paymentId})).status,'pending');
  provider.pay(intent.id);
  const paid=await c.call('payment-status',{paymentId:first.paymentId});assert.equal(paid.status,'licensed',JSON.stringify(paid));assert.equal(keys.verify(paid.permit,env).plan,'weekly');
  await c.call('payment-status',{paymentId:first.paymentId});
  assert.equal((await pg.query('select count(*)::int as n from light_licenses where customer_email=$1',[order.email])).rows[0].n,1);
  assert.deepEqual((await pg.query('select * from licenses')).rows,[{id:'apk-untouched'}]);
});
test('QR payment verification rejects mismatched amount, product, installation, reference and intent',async()=>{
  const provider=fixture(),c=client(provider),first=await c.call('qr-checkout',order);
  const session=(await pg.query('select * from light_payments where id=$1',[first.paymentId])).rows[0];
  provider.pay(session.payment_intent_id);const intent=provider.intents.get(session.payment_intent_id);
  for(const mutation of [x=>x.attributes.amount=1,x=>x.attributes.metadata.product='apk',x=>x.attributes.metadata.installation_id=crypto.randomUUID(),x=>x.attributes.metadata.reference_number='other',x=>x.id='pi_other',x=>x.attributes.payments[0].attributes.amount=1]){
    const wrong=structuredClone(intent);mutation(wrong);await assert.rejects(qr.reconcile(db,session,env,provider.fetcher,wrong),/mismatch/);
  }
  const stranger=client(provider);assert.equal((await stranger.call('payment-status',{paymentId:first.paymentId})).status,'light_payment_not_found');
});
test('an expired QR is replaced only after canonical cancellation; closing/retrying does not create a duplicate charge',async()=>{
  const provider=fixture(),c=client(provider),first=await c.call('qr-checkout',order);
  await pg.query("update light_payments set qr_expires_at=now()-interval '1 minute' where id=$1",[first.paymentId]);
  const next=await c.call('qr-checkout',order);assert.notEqual(next.paymentId,first.paymentId);assert.equal(provider.intents.size,2);
  assert.equal(provider.intents.values().next().value.attributes.status,'cancelled');
  assert.equal((await pg.query('select status from light_payments where id=$1',[first.paymentId])).rows[0].status,'failed');
});
test('concurrent QR requests reserve one attempt and uncertain setup can be safely recovered by a host',async()=>{
  const provider=fixture(),c=client(provider);
  const results=await Promise.all([c.call('qr-checkout',order),c.call('qr-checkout',order)]);
  assert.equal(provider.intents.size,1);
  const records=(await pg.query('select * from light_payments where installation_id=$1',[c.id])).rows;
  assert.equal(records.length,1);assert.ok(results.some(r=>r.paymentId===records[0].id));
  // A provider-created intent survived, but local attachment/QR delivery was interrupted.
  const session=records[0],intent=provider.intents.get(session.payment_intent_id);
  await pg.query('update light_payments set payment_intent_id=null,qr_image_url=null,qr_expires_at=null where id=$1',[session.id]);
  const detached={...session,payment_intent_id:null,qr_image_url:null,qr_expires_at:null};
  const recovered=await qr.recover(db,detached,intent.id,env,provider.fetcher);
  assert.match(recovered.qr_image_url,/^data:image/);assert.equal(recovered.payment_intent_id,intent.id);
  const other={...detached,id:crypto.randomUUID()};await assert.rejects(qr.recover(db,other,intent.id,env,provider.fetcher),/mismatch/);
});
test('signed native payment webhook reconciles canonical provider data and never grants access from an event alone',async()=>{
  const provider=fixture(),c=client(provider),first=await c.call('qr-checkout',order);
  const session=(await pg.query('select * from light_payments where id=$1',[first.paymentId])).rows[0];
  async function webhook(){
    const raw=JSON.stringify({data:{attributes:{type:'payment.paid',data:{id:'pay_fixture',attributes:{payment_intent_id:session.payment_intent_id}}}}});
    const t=String(Math.floor(Date.now()/1000)),sig=crypto.createHmac('sha256',env.LIGHT_PAYMONGO_WEBHOOK_SECRET).update(`${t}.${raw}`).digest('hex');
    const request={url:'/api/light?route=webhook',method:'POST',headers:{host:'light.test','paymongo-signature':`t=${t},te=${sig}`},async *[Symbol.asyncIterator](){yield Buffer.from(raw);}};
    const response={setHeader(){},end(raw){this.body=JSON.parse(raw);}};await c.handler(request,response);assert.equal(response.body.ok,true,JSON.stringify(response.body));
  }
  await webhook();assert.equal((await pg.query('select status from light_payments where id=$1',[first.paymentId])).rows[0].status,'pending');
  provider.pay(session.payment_intent_id);await webhook();await webhook();assert.equal((await pg.query('select status from light_payments where id=$1',[first.paymentId])).rows[0].status,'paid');
});
test('QR migration remains service-role only and is included in fresh setup',async()=>{
  const sql=fs.readFileSync('supabase/migrations/202611120001_light_inline_qr.sql','utf8');assert.ok(fs.readFileSync('supabase/one_time_supabase_setup.sql','utf8').replace(/\r\n/g,'\n').includes(sql.replace(/\r\n/g,'\n')));
  assert.equal((await pg.query("select has_function_privilege('anon','light_fulfill_qr(uuid,text,integer,text,text)','execute') as ok")).rows[0].ok,false);
});
