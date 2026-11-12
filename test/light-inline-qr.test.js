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
const order={billingName:'Fixture Payer',planId:'weekly',email:'fixture@example.test',acceptedAgreement:true};
test('an earlier hosted attempt switches to in-app QR only after confirmed provider expiry',async()=>{
  const provider=fixture(),c=client(provider);
  const hosted=await c.call('checkout',order);assert.equal(hosted.ok,true,JSON.stringify(hosted));
  const held=await c.call('qr-checkout',order);assert.equal(held.status,'hosted_pending');assert.equal(provider.intents.size,0);
  const inline=await c.call('qr-checkout',{...order,replaceHosted:true});assert.equal(inline.code,200,JSON.stringify(inline));assert.match(inline.qrImageUrl,/^data:image/);
  assert.notEqual(inline.paymentId,hosted.paymentId);assert.equal(provider.checkouts.values().next().value.attributes.status,'expired');
  assert.equal((await pg.query('select status from light_payments where id=$1',[hosted.paymentId])).rows[0].status,'failed');
  const resumed=await c.call('qr-checkout',order);assert.equal(resumed.paymentId,inline.paymentId);assert.equal(provider.intents.size,1);
});
test('switching preserves a paid or processing hosted payment and never creates another payable intent',async()=>{
  for(const status of ['pending','paid']){
    const provider=fixture(),c=client(provider),hosted=await c.call('checkout',order),checkout=[...provider.checkouts.values()][0];
    if(status==='paid')provider.pay(checkout.id);
    else checkout.attributes.payments=[{attributes:{status:'pending',amount:2000,currency:'PHP'}}];
    const result=await c.call('qr-checkout',{...order,replaceHosted:true});
    assert.equal(result.status,status==='paid'?'paid':'hosted_processing',JSON.stringify(result));
    assert.equal(provider.intents.size,0);assert.equal(checkout.attributes.status,'active');
  }
});
test('QR readiness checks detect a missing migration without creating a payment',async()=>{
  const provider=fixture();
  async function request(client){
    const handler=createLightHandler({env,client:()=>client,fetcher:provider.fetcher});
    const response={setHeader(){},end(raw){this.body=JSON.parse(raw);}};
    await handler({url:'/api/light?route=plans',method:'GET',headers:{host:'light.test'}},response);return response.body;
  }
  assert.equal((await request(db)).paymentSetup.inlineQr,true);
  const missing={from(table){if(table==='light_payments')return {select(){return this;},limit(){return Promise.resolve({error:{code:'42703'}});}};return db.from(table);}};
  const result=await request(missing);assert.equal(result.ok,true);assert.equal(result.paymentSetup.status,'light_inline_qr_not_configured');assert.equal(result.paymentSetup.inlineQr,false);
  assert.equal(provider.calls.length,0);
});
test('cancel and restart closes only the owned unpaid attempt and restores its receipt email',async()=>{
  for(const hosted of [false,true]){
    const provider=fixture(),c=client(provider),first=await c.call(hosted?'checkout':'qr-checkout',order);
    const saved=await c.call('payment-status',{paymentId:first.paymentId});assert.equal(saved.receiptEmail,order.email);
    const stranger=client(provider);assert.equal((await stranger.call('cancel-payment',{paymentId:first.paymentId})).status,'light_payment_not_found');
    const cancelled=await c.call('cancel-payment',{paymentId:first.paymentId});assert.equal(cancelled.status,'cancelled',JSON.stringify(cancelled));
    const record=(await pg.query('select * from light_payments where id=$1',[first.paymentId])).rows[0];assert.equal(record.status,'failed');
    const next=await c.call('qr-checkout',order);assert.equal(next.ok,true);assert.notEqual(next.paymentId,first.paymentId);
  }
});
test('cancel and restart preserves paid and processing attempts',async()=>{
  for(const hosted of [false,true])for(const paid of [false,true]){
    const provider=fixture(),c=client(provider),first=await c.call(hosted?'checkout':'qr-checkout',order);
    const resource=[...(hosted?provider.checkouts:provider.intents).values()][0];
    if(paid)provider.pay(resource.id);
    else if(hosted)resource.attributes.payments=[{attributes:{status:'pending',amount:2000,currency:'PHP'}}];
    else resource.attributes.status='processing';
    const result=await c.call('cancel-payment',{paymentId:first.paymentId});assert.equal(result.status,paid?'licensed':'payment_processing',JSON.stringify(result));
    assert.notEqual(resource.attributes.status,'cancelled');assert.notEqual(resource.attributes.status,'expired');
  }
});
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
  assert.equal((await pg.query('select count(*)::int as n from light_licenses l join light_activations a on a.license_id=l.id where a.installation_id=$1',[c.id])).rows[0].n,1);
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


test('payment-status restores a generated QR after interrupted delivery without creating another intent',async()=>{
  const provider=fixture(),c=client(provider),first=await c.call('qr-checkout',order);
  await pg.query('update light_payments set qr_image_url=null,qr_expires_at=null where id=$1',[first.paymentId]);
  const recovered=await c.call('payment-status',{paymentId:first.paymentId});
  assert.equal(recovered.qrImageUrl,first.qrImageUrl);assert.equal(recovered.status,'pending');assert.equal(provider.intents.size,1);
  assert.ok((await pg.query('select qr_image_url from light_payments where id=$1',[first.paymentId])).rows[0].qr_image_url);
});

test('unfinished QR setup is distinguished from processing and can be cancelled before retrying',async()=>{
  const provider=fixture(),c=client(provider),first=await c.call('qr-checkout',order),intent=[...provider.intents.values()][0];
  intent.attributes.status='awaiting_payment_method';delete intent.attributes.next_action;
  const incomplete=await c.call('payment-status',{paymentId:first.paymentId});assert.equal(incomplete.status,'qr_setup_incomplete');assert.equal(incomplete.qrImageUrl,undefined);
  assert.equal((await c.call('cancel-payment',{paymentId:first.paymentId})).status,'cancelled');
  const next=await c.call('qr-checkout',order);assert.ok(next.qrImageUrl);assert.notEqual(next.paymentId,first.paymentId);
  const current=[...provider.intents.values()].at(-1);current.attributes.status='processing';
  assert.equal((await c.call('payment-status',{paymentId:next.paymentId})).status,'processing');
});

test('QR image formats accept provider SVG and PNG while rejecting unsafe URLs and invalid base64',()=>{
  const svg=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>').toString('base64');
  assert.equal(qr.imageUrl(svg),'data:image/svg+xml;base64,'+svg);
  assert.equal(qr.imageUrl('data:image/svg+xml;base64,'+svg),'data:image/svg+xml;base64,'+svg);
  assert.equal(qr.imageUrl('https://images.example.test/code.png'),'https://images.example.test/code.png');
  for(const invalid of ['javascript:alert(1)','http://example.test/qr','https://user:pass@example.test/qr','garbage','data:text/html;base64,PHN2Zz4='])assert.throws(()=>qr.imageUrl(invalid),/light_qr_unavailable/);
});

test('unpaid attempts remain cancellable even if the provider QR image cannot be displayed',async()=>{
  const provider=fixture(),c=client(provider),first=await c.call('qr-checkout',order),intent=[...provider.intents.values()][0];
  intent.attributes.next_action.code.image_url='invalid';
  assert.equal((await c.call('payment-status',{paymentId:first.paymentId})).status,'light_qr_unavailable');
  assert.equal((await c.call('cancel-payment',{paymentId:first.paymentId})).status,'cancelled');
});


test('QR requires a payer name before reservation and sends it to PayMongo billing',async()=>{
  const provider=fixture(),c=client(provider);
  for(const billingName of [undefined,'   ',42,'a'.repeat(121),'Bad\nName']){
    const denied=await c.call('qr-checkout',{...order,billingName});
    assert.equal(denied.status,'light_billing_name_required');
  }
  assert.equal(provider.calls.length,0);
  assert.equal((await pg.query('select count(*)::int as n from light_payments where installation_id=$1',[c.id])).rows[0].n,0);
  const result=await c.call('qr-checkout',{...order,billingName:'  Juan Dela Cruz  '});assert.ok(result.qrImageUrl);
  const request=provider.calls.find(c=>new URL(c.url).pathname==='/v1/payment_methods');
  assert.deepEqual(JSON.parse(request.options.body).data.attributes.billing,{name:'Juan Dela Cruz',email:order.email});
});
