const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
const {PGlite}=require('@electric-sql/pglite');
const database=require('../scripts/lib/light-test-db.cjs');
const keys=require('../light-service/server/light-crypto');
const {createLightHandler}=require('../light-service/server/light-api');
const usage=require('../light-service/server/light-usage');
let pg,db;const pair=crypto.generateKeyPairSync('ec',{namedCurve:'prime256v1'});
const env={LIGHT_SIGNING_PRIVATE_KEY:pair.privateKey.export({type:'pkcs8',format:'pem'}),ADMIN_PASSWORD:'fixture-admin'};
const migration=fs.readFileSync('supabase/migrations/202611120004_light_usage_tracking.sql','utf8');
test.before(async()=>{
 pg=new PGlite();await pg.exec("create role anon;create role authenticated;create role service_role;create table licenses(id text);insert into licenses values('apk-untouched');");
 for(const file of ['202611110001_light_licensing.sql','202611120003_light_one_day_trial.sql'])await pg.exec(fs.readFileSync('supabase/migrations/'+file,'utf8'));
 await pg.exec(migration);await pg.exec(migration);db=database(pg);
});
test.after(async()=>pg.close());
function client(){
 const id=crypto.randomUUID(),p=crypto.generateKeyPairSync('ec',{namedCurve:'prime256v1'}),pub=keys.publicKey(p.publicKey.export({format:'jwk'}));
 const handler=createLightHandler({env,client:()=>db});
 return {id,async call(data,mutate){const challenge=keys.challenge({installationId:id,publicKey:pub,action:'usage',bodyHash:keys.hash(JSON.stringify(data))},env);const signature=crypto.sign('sha256',Buffer.from(challenge),{key:p.privateKey,dsaEncoding:'ieee-p1363'}).toString('base64url');
  const body={installationId:id,data,auth:{publicKey:pub,challenge,signature}};mutate?.(body);
  const response={setHeader(){},end(raw){this.body=JSON.parse(raw);}};
  await handler({url:'/api/light?route=usage',method:'POST',headers:{host:'light.test','x-forwarded-for':crypto.randomUUID()},body},response);return {code:response.statusCode,...response.body};
 }};
}
const report=()=>({visitId:crypto.randomUUID(),name:'Fixture LRB',mode:'settings',device:{type:'Desktop',os:'Windows',browser:'Edge 130',installed:true},camera:{label:'Logitech C920',width:1280,height:720,active:true},printer:{queue:'EPSON test queue',profile:'deli'},photo:'must-not-store',deviceId:'must-not-store',pin:'must-not-store'});
async function admin(password='fixture-admin',query=''){
 const handler=createLightHandler({env,client:()=>db}),response={setHeader(){},end(raw){this.body=JSON.parse(raw);}};
 await handler({url:'/api/light?route=admin-usage'+query,method:'GET',headers:{host:'light.test','x-admin-password':password}},response);return {code:response.statusCode,...response.body};
}
test('signed heartbeats deduplicate views, count active installations and sanitize all telemetry',async()=>{
 const c=client(),data=report();assert.equal((await c.call(data)).ok,true);
 const repeated=await Promise.all([c.call(data),c.call(data)]);assert.ok(repeated.every(r=>r.ok));
 const first=await admin();assert.equal(first.summary.pageViews,1);assert.equal(first.summary.uniqueInstallations,1);assert.equal(first.summary.activeNow,1);assert.equal(first.summary.activeToday,1);
 assert.equal(first.daily.length,30);assert.equal(first.timeZone,'Asia/Manila');assert.equal(first.devices[0].camera.label,'Logitech C920');assert.equal(first.devices[0].printer.queue,'EPSON test queue');
 assert.equal(JSON.stringify(first).includes('must-not-store'),false);assert.equal(first.devices[0].license_status,'Unlicensed');
 await c.call({...data,visitId:crypto.randomUUID(),camera:{active:false}});
 const next=await admin();assert.equal(next.summary.pageViews,2);assert.equal(next.devices[0].camera.label,'Logitech C920');assert.equal(next.devices[0].camera.active,false);
 assert.equal((await pg.query('select count(*)::int n from light_usage_visits')).rows[0].n,2);
});
test('usage authentication, payload validation, admin access and installation blocks are enforced',async()=>{
 const c=client(),data=report();assert.equal((await c.call(data,b=>b.auth.signature='invalid')).ok,false);
 assert.equal((await c.call({...data,visitId:'bad'})).ok,false);assert.equal((await c.call({...data,device:{type:'invalid'}})).ok,false);
 assert.equal((await c.call(data)).ok,true);assert.equal((await admin('wrong')).code,401);
 await pg.query('update light_installations set blocked=true where id=$1',[c.id]);assert.equal((await c.call(data)).ok,false);
 const result=await admin();assert.equal(result.devices.find(i=>i.installation_id===c.id).online,false);
 assert.deepEqual((await pg.query('select * from licenses')).rows,[{id:'apk-untouched'}]);
});
test('server timestamps determine active status and search paginates separately from summary counts',async()=>{
 const c=client();await c.call({...report(),name:'Unique tablet',device:{type:'Tablet',os:'iOS/iPadOS',browser:'Safari',installed:true}});
 await pg.query("update light_usage_devices set last_seen_at=now()-interval '6 minutes' where installation_id=$1",[c.id]);
 const result=await admin('fixture-admin','&search=Unique%20tablet');assert.equal(result.totalDevices,1);assert.equal(result.devices[0].online,false);assert.equal(result.devices[0].device.type,'Tablet');
 const page=await admin('fixture-admin','&offset=50');assert.equal(page.devices.length,0);assert.equal(page.summary.uniqueInstallations,result.summary.uniqueInstallations);
 assert.ok(result.platforms.some(p=>p.name==='iOS/iPadOS'));assert.ok(result.summary.activeNow<result.summary.uniqueInstallations);
});
test('usage tables and RPCs are private, migration is in setup, and missing setup is non-fatal to admin',async()=>{
 for(const table of ['light_usage_devices','light_usage_visits','light_usage_daily']){
  assert.equal((await pg.query('select relrowsecurity from pg_class where relname=$1',[table])).rows[0].relrowsecurity,true);
  assert.equal((await pg.query("select has_table_privilege('anon',$1,'select') allowed",[table])).rows[0].allowed,false);
 }
 assert.equal((await pg.query("select has_function_privilege('anon','light_report_usage(uuid,uuid,jsonb)','execute') allowed")).rows[0].allowed,false);
 assert.ok(fs.readFileSync('supabase/one_time_supabase_setup.sql','utf8').includes(migration));
 const missing={rpc:async()=>({error:{code:'PGRST202'}})};assert.equal((await usage.admin(missing,0,'')).available,false);
 await assert.rejects(usage.report(missing,crypto.randomUUID(),crypto.randomUUID(),report()),/not_configured/);
});
