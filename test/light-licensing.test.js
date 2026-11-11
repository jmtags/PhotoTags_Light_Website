const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const { PGlite } = require('@electric-sql/pglite');
const keys = require('../light-service/server/light-crypto');
const payments = require('../light-service/server/light-payments');
const { createLightHandler } = require('../light-service/server/light-api');
const pair = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const env = { LIGHT_SIGNING_PRIVATE_KEY: pair.privateKey.export({type:'pkcs8',format:'pem'}), ADMIN_PASSWORD: 'test-only-password', LIGHT_PAYMONGO_SECRET_KEY: 'sk_test_fixture', LIGHT_PAYMONGO_WEBHOOK_SECRET:'test-only-webhook-secret' };
const identity = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const publicKey = keys.publicKey(identity.publicKey.export({format:'jwk'}));
const A=crypto.randomUUID(), B=crypto.randomUUID();
let pg;
test.before(async()=>{
  pg = new PGlite();
  await pg.exec('create role anon; create role authenticated; create role service_role; create table licenses(id text primary key); insert into licenses values (\'apk-untouched\'); create table devices(id text primary key); insert into devices values (\'android-device\');');
  const sql=fs.readFileSync('supabase/migrations/202611110001_light_licensing.sql','utf8');
  await pg.exec(sql); await pg.exec(sql);
});
test.after(async()=>{await pg?.close();});
async function rpc(name,args){const names=Object.keys(args);return (await pg.query(`select ${name}(${names.map((n,i)=>`${n} => $${i+1}`).join(',')}) as value`,Object.values(args))).rows[0].value;}
async function register(id,key=publicKey){return rpc('light_register',{p_id:id,p_public_key:JSON.stringify(key),p_key_hash:keys.keyHash(key),p_name:'Event booth',p_platform:'iOS',p_app_version:'light-test'});}

test('installation proof is bound to key, request payload, route, product and expiry',()=>{
  const data={name:'Booth A'};
  const token=keys.challenge({installationId:A,publicKey,action:'activate',bodyHash:keys.hash(JSON.stringify(data))},env);
  const signature=crypto.sign('sha256',Buffer.from(token),{key:identity.privateKey,dsaEncoding:'ieee-p1363'}).toString('base64url');
  const body={installationId:A,data,auth:{challenge:token,publicKey,signature}};
  assert.equal(keys.verifyProof(body,'activate',env).payload.sub,A);
  assert.throws(()=>keys.verifyProof({...body,data:{name:'Changed'}},'activate',env));
  assert.throws(()=>keys.verifyProof(body,'checkout',env));
  assert.throws(()=>keys.verifyProof({...body,installationId:B},'activate',env));
  assert.throws(()=>keys.verifyProof({...body,auth:{...body.auth,signature:'not-a-signature'}},'activate',env));
  const expired=keys.sign({product:keys.PRODUCT,type:'challenge',exp:1},env);assert.throws(()=>keys.verify(expired,env));
});
test('challenge replay is rejected atomically and installation keys cannot be replaced',async()=>{
  const nonce=crypto.randomUUID(), args={p_id:nonce,p_expires_at:new Date(Date.now()+60000).toISOString()};
  assert.equal(await rpc('light_use_nonce',args),true);assert.equal(await rpc('light_use_nonce',args),false);
  assert.equal((await register(A)).status,'registered');
  const other=crypto.generateKeyPairSync('ec',{namedCurve:'prime256v1'}).publicKey.export({format:'jwk'});
  assert.equal((await register(A,other)).status,'installation_key_mismatch');
  // Separate key for B: one persisted cryptographic identity per installation.
  assert.equal((await register(B,other)).status,'registered');
});
test('Light activation enforces seats, repeat activation, expiry and transfer without touching APK data',async()=>{
  const license=await rpc('light_admin_action',{p_action:'create_license',p_id:'',p_values:JSON.stringify({planId:'monthly',email:'fixture@example.test'})});
  const activate=id=>rpc('light_activate',{p_installation_id:id,p_license_key:license.licenseKey});
  assert.equal((await activate(A)).status,'licensed');assert.equal((await activate(A)).status,'licensed');
  assert.equal((await activate(B)).status,'installation_limit_reached');
  assert.equal((await rpc('light_activate',{p_installation_id:B,p_license_key:'APK-KEY'})).status,'light_license_not_found');
  await rpc('light_admin_action',{p_action:'release_installation',p_id:A,p_values:'{}'});
  assert.equal((await activate(A)).status,'installation_blocked');assert.equal((await activate(B)).status,'licensed');
  await pg.query('update light_licenses set expires_at=now()-interval \'1 second\' where license_key=$1',[license.licenseKey]);
  assert.equal((await activate(B)).status,'license_inactive');
  assert.deepEqual((await pg.query('select * from licenses')).rows,[{id:'apk-untouched'}]);
  assert.deepEqual((await pg.query('select * from devices')).rows,[{id:'android-device'}]);
});
test('offline permit signatures bind the product, installation and key, and never outlive the license',()=>{
  const expires=new Date(Date.now()+3600000).toISOString();
  const token=keys.permit({id:A,key_hash:keys.keyHash(publicKey)},{id:crypto.randomUUID(),plan_id:'monthly',expires_at:expires},env);
  const p=keys.verify(token,env);assert.equal(p.type,'permit');assert.equal(p.sub,A);assert.equal(p.keyHash,keys.keyHash(publicKey));
  assert.ok(p.exp*1000<=Date.parse(expires));assert.equal(p.product,keys.PRODUCT);
  const tampered=token.split('.');tampered[1]=Buffer.from(JSON.stringify({...p,sub:B})).toString('base64url');assert.throws(()=>keys.verify(tampered.join('.'),env));
});
test('provider data must match every Light payment field; redirect and pending payments are not proof',()=>{
  const session={id:crypto.randomUUID(),installation_id:A,amount:25000,currency:'PHP',checkout_id:'cs_test_one',reference_number:'PTL-fixture'};
  const checkout={id:session.checkout_id,attributes:{reference_number:session.reference_number,metadata:{product:keys.PRODUCT,light_payment_id:session.id,installation_id:A},payments:[{attributes:{status:'paid',amount:25000,currency:'PHP'}}]}};
  assert.equal(payments.validatePaidCheckout(checkout,session),true);
  for(const patch of [{amount:1},{currency:'USD'},{installation_id:B},{id:crypto.randomUUID()},{checkout_id:'cs_other'},{reference_number:'APK-reference'}])assert.throws(()=>payments.validatePaidCheckout(checkout,{...session,...patch}));
  assert.equal(payments.validatePaidCheckout({attributes:{}},session),false);
  assert.throws(()=>payments.validatePaidCheckout({...checkout,attributes:{...checkout.attributes,metadata:{...checkout.attributes.metadata,product:'phototags_license'}}},session));
});
test('paid fulfillment is atomic, idempotent, preserves checkout terms and extends paid renewals',async()=>{
  const id=crypto.randomUUID(), reference='PTL-test-'+id;
  await pg.query("insert into light_payments(id,installation_id,plan_id,amount,currency,duration_days,max_installations,customer_email,reference_number,checkout_id,agreement_version,agreement_accepted_at) values($1,$2,'monthly',25000,'PHP',30,1,'fixture@example.test',$3,'cs_test_paid','light-test',now())",[id,B,reference]);
  const args={p_payment_id:id,p_checkout_id:'cs_test_paid',p_amount:25000,p_currency:'PHP',p_reference:reference};
  const l=await rpc('light_fulfill_payment',args);assert.equal(await rpc('light_fulfill_payment',args),l);
  assert.equal((await pg.query('select count(*)::int as n from light_licenses where id=$1',[l])).rows[0].n,1);
  await assert.rejects(rpc('light_fulfill_payment',{...args,p_amount:1}));
  const session=(await pg.query('select * from light_payments where id=$1',[id])).rows[0];assert.equal(session.status,'paid');
  const original=(await pg.query('select expires_at from light_licenses where id=$1',[l])).rows[0].expires_at;
  const id2=crypto.randomUUID();await pg.query("insert into light_payments(id,installation_id,plan_id,amount,currency,duration_days,max_installations,customer_email,reference_number,checkout_id,agreement_version,agreement_accepted_at) values($1,$2,'monthly',25000,'PHP',30,1,'fixture@example.test',$3,'cs_test_renewal','light-test',now())",[id2,B,'PTL-'+id2]);
  const renewed=await rpc('light_fulfill_payment',{p_payment_id:id2,p_checkout_id:'cs_test_renewal',p_amount:25000,p_currency:'PHP',p_reference:'PTL-'+id2});
  const end=(await pg.query('select expires_at from light_licenses where id=$1',[renewed])).rows[0].expires_at;
  assert.equal(Date.parse(end)-Date.parse(original),30*86400000);
});
test('Light webhook signatures require their own secret, correct mode and a recent timestamp',()=>{
  const raw='{"fixture":true}',t=String(Math.floor(Date.now()/1000));
  const sig=crypto.createHmac('sha256',env.LIGHT_PAYMONGO_WEBHOOK_SECRET).update(`${t}.${raw}`).digest('hex');
  assert.equal(payments.verifyWebhook(raw,`t=${t},te=${sig}`,env),true);
  assert.equal(payments.verifyWebhook(raw,`t=${t},li=${sig}`,env),false);
  assert.equal(payments.verifyWebhook(raw,`t=1,te=${sig}`,env),false);
  assert.equal(payments.verifyWebhook(raw,`t=${t},te=${sig}`,{...env,LIGHT_PAYMONGO_WEBHOOK_SECRET:'APK-secret'}),false);
});
test('Light API rejects foreign origins, missing admin credentials and replayed proofs before any APK table access',async()=>{
  const accessed=[];
  const client=()=>({from(name){accessed.push(name);throw Error('unexpected_query');},async rpc(name){accessed.push(name);return {data:false,error:null};}});
  const handler=createLightHandler({env,client});
  async function call(body,route='admin',headers={}){const request={url:`/api/light?route=${route}`,method:'POST',body,headers:{host:'www.phototags.app','x-forwarded-for':crypto.randomUUID(),...headers}};const response={setHeader(){},end(v){this.body=JSON.parse(v);}};await handler(request,response);return {code:response.statusCode,...response.body};}
  assert.equal((await call({action:'create_license'})).code,401);
  assert.equal((await call({},'check',{origin:'https://foreign.example'})).code,403);
  const data={name:'Test'};const token=keys.challenge({installationId:A,publicKey,action:'check',bodyHash:keys.hash(JSON.stringify(data))},env);
  const signature=crypto.sign('sha256',Buffer.from(token),{key:identity.privateKey,dsaEncoding:'ieee-p1363'}).toString('base64url');
  const response=await call({installationId:A,data,auth:{challenge:token,publicKey,signature}},'check');
  assert.equal(response.status,'light_challenge_replayed');assert.deepEqual(accessed,['light_use_nonce']);
});
test('Light migrations are service-role only and match the additive one-time setup block',async()=>{
  const sql=fs.readFileSync('supabase/migrations/202611110001_light_licensing.sql','utf8');
  assert.ok(fs.readFileSync('supabase/one_time_supabase_setup.sql','utf8').replace(/\r\n/g,'\n').includes(sql.replace(/\r\n/g,'\n')));
  assert.equal((await pg.query("select has_function_privilege('anon','light_activate(uuid,text)','execute') as allowed")).rows[0].allowed,false);
  assert.equal((await pg.query("select has_table_privilege('authenticated','light_licenses','select') as allowed")).rows[0].allowed,false);
  assert.equal((await pg.query('select count(*)::int as n from light_plans where active')).rows[0].n,0);
});

test('Light checkout reuses a reservation and paid status fulfills through the real API and SQL',async()=>{
  const database=require('../scripts/lib/light-test-db.cjs');const db=database(pg);
  const C=crypto.randomUUID(),installationKey=crypto.generateKeyPairSync('ec',{namedCurve:'prime256v1'}),jwk=keys.publicKey(installationKey.publicKey.export({format:'jwk'}));
  await pg.exec("update light_plans set active=true,amount=25000 where id='monthly'");
  let creates=0,paid=false;let checkout;
  const fetcher=async(url,options)=>{
    if(options.method==='POST'){
      assert.equal(url,'https://api.paymongo.com/v2/checkout_sessions');creates++;
      const attributes=JSON.parse(options.body).data.attributes;
      checkout={id:'cs_test_light',attributes:{...attributes,checkout_url:'https://checkout.paymongo.com/cs_test_light',payments:[]}};
    }else{
      assert.equal(url,'https://api.paymongo.com/v1/checkout_sessions/cs_test_light');
      checkout.attributes.payments=paid?[{attributes:{status:'paid',amount:25000,currency:'PHP'}}]:[];
    }
    return {ok:true,json:async()=>({data:checkout})};
  };
  const handler=createLightHandler({env,client:()=>db,fetcher});
  async function call(route,data){
    const challenge=keys.challenge({installationId:C,publicKey:jwk,action:route,bodyHash:keys.hash(JSON.stringify(data))},env);
    const signature=crypto.sign('sha256',Buffer.from(challenge),{key:installationKey.privateKey,dsaEncoding:'ieee-p1363'}).toString('base64url');
    const req={url:`/api/light?route=${route}`,method:'POST',headers:{host:'www.phototags.app','x-forwarded-for':crypto.randomUUID()},body:{installationId:C,data,auth:{challenge,publicKey:jwk,signature}}};
    const response={setHeader(){},end(v){this.body=JSON.parse(v);}};await handler(req,response);return {code:response.statusCode,...response.body};
  }
  const first=await call('checkout',{planId:'monthly',email:'fixture@example.test',acceptedAgreement:true});assert.equal(first.ok,true,JSON.stringify(first));
  const repeat=await call('checkout',{planId:'monthly',email:'fixture@example.test',acceptedAgreement:true});assert.equal(repeat.paymentId,first.paymentId);assert.equal(creates,1);
  // Simulate a successful provider request followed by an interrupted local attach.
  await pg.query('update light_payments set checkout_id=null,checkout_url=null where id=$1',[first.paymentId]);
  const adminRequest={url:'/api/light?route=admin',method:'POST',headers:{host:'www.phototags.app','x-admin-password':env.ADMIN_PASSWORD,'x-forwarded-for':crypto.randomUUID()},body:{action:'recover_checkout',id:first.paymentId,values:{checkoutId:'cs_test_light'}}};
  const adminResponse={setHeader(){},end(v){this.body=JSON.parse(v);}};await handler(adminRequest,adminResponse);
  assert.equal(adminResponse.body.ok,true,JSON.stringify(adminResponse.body));assert.equal(adminResponse.body.status,'pending');
  assert.equal((await pg.query('select checkout_id from light_payments where id=$1',[first.paymentId])).rows[0].checkout_id,'cs_test_light');
  const pending=await call('payment-status',{paymentId:first.paymentId});assert.equal(pending.status,'pending');
  paid=true;const fulfilled=await call('payment-status',{paymentId:first.paymentId});assert.equal(fulfilled.status,'licensed',JSON.stringify(fulfilled));
  assert.equal(keys.verify(fulfilled.permit,env).sub,C);
  const repeated=await call('payment-status',{paymentId:first.paymentId});assert.equal(repeated.status,'licensed');
  assert.equal((await pg.query('select count(*)::int as n from light_payments where installation_id=$1',[C])).rows[0].n,1);
  assert.deepEqual((await pg.query('select * from licenses')).rows,[{id:'apk-untouched'}]);
});
