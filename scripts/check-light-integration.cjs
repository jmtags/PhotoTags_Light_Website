// Local test only: real WebCrypto + SQL + API, fake PayMongo, isolated browsers.
const path=require('node:path');const fs=require('node:fs');const crypto=require('node:crypto');
const {createRequire}=require('node:module');const {pathToFileURL}=require('node:url');
const {PGlite}=require('@electric-sql/pglite');const {createLightHandler}=require('../light-service/server/light-api');
const database=require('./lib/light-test-db.cjs');
async function main(){
 const booth=path.resolve(process.argv[2]||'../PhotoTagsReceipt_Booth_ALL');const req=createRequire(path.join(booth,'package.json'));
 const {chromium}=req('playwright'),{expect}=req('@playwright/test');
 const {createServer}=await import(pathToFileURL(req.resolve('vite')).href);
 const key=crypto.generateKeyPairSync('ec',{namedCurve:'prime256v1'});const publicKey=key.publicKey.export({format:'jwk'});
 const env={LIGHT_SIGNING_PRIVATE_KEY:key.privateKey.export({type:'pkcs8',format:'pem'}),ADMIN_PASSWORD:'light-fixture-admin',LIGHT_ALLOWED_ORIGINS:'http://localhost:4185,http://localhost:4186',LIGHT_PAYMONGO_SECRET_KEY:'sk_test_fixture'};
 const pg=new PGlite();let vite,website,browser;
 try{
  await pg.exec('create role anon;create role authenticated;create role service_role;');await pg.exec(fs.readFileSync('supabase/migrations/202611110001_light_licensing.sql','utf8'));
  await pg.exec("update light_plans set active=true,amount=15000 where id='monthly'");
  const db=database(pg);const grant=await db.rpc('light_admin_action',{p_action:'create_license',p_id:'',p_values:{planId:'monthly',email:'fixture@example.test'}});if(grant.error)throw grant.error;
  const handler=createLightHandler({env,client:()=>db,fetcher:async()=>{throw Error('Unexpected provider request');}});
  process.env.VITE_LIGHT_LICENSING_ENABLED='true';process.env.VITE_LIGHT_API_ORIGIN='http://localhost:4185';process.env.VITE_LIGHT_PUBLIC_KEY_JWK=JSON.stringify(publicKey);
  vite=await createServer({root:booth,server:{port:4185,strictPort:true},configFile:path.join(booth,'vite.config.ts')});await vite.listen();
  browser=await chromium.launch({channel:'chrome',headless:true});
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  let transportDown=false;
  await context.route('**/api/light?*',async route=>{
   if(transportDown)return route.abort('internetdisconnected');
   const request=route.request();let status=200,headers={},body='';
   const response={setHeader(k,v){headers[k]=v;},end(v){body=v||'';}};Object.defineProperty(response,'statusCode',{get:()=>status,set:v=>status=v});
   await handler({method:request.method(),url:request.url(),body:request.postDataJSON(),headers:{...request.headers(),host:'localhost:4185','x-forwarded-for':crypto.randomUUID()}},response);
   await route.fulfill({status,headers,body});
  });
  const page=await context.newPage();await page.clock.install();await page.goto('http://localhost:4185');
  await page.getByRole('button',{name:'Launch kiosk',exact:true}).click();
  await expect(page.getByRole('heading',{name:'PhotoTags Light license',exact:true})).toBeVisible();
  await expect(page.locator('.light-license-settings [role=status]')).toContainText('Activate a PhotoTags Light license');
  await page.getByLabel('Light license key',{exact:true}).fill(grant.data.licenseKey);await page.getByRole('button',{name:'Activate Light license',exact:true}).click();
  await expect(page.locator('.light-license-settings [role=status]')).toContainText('License active');
  await page.getByRole('button',{name:'Launch kiosk',exact:true}).click();await expect(page.getByRole('dialog',{name:'PhotoTags guest kiosk'})).toBeVisible();
  transportDown=false;await pg.exec('update light_installations set blocked=true');
  await page.reload();await page.getByRole('button',{name:'Light license',exact:true}).click();
  await expect(page.locator('.light-license-settings [role=status]')).toContainText('installation blocked');
  await page.getByRole('button',{name:'Launch kiosk',exact:true}).click();await expect(page.getByRole('dialog',{name:'PhotoTags guest kiosk'})).toHaveCount(0);
  await pg.exec('update light_installations set blocked=false');await page.getByRole('button',{name:'Check license / payment',exact:true}).click();
  await expect(page.locator('.light-license-settings [role=status]')).toContainText('License active');
  await page.screenshot({path:path.join(booth,'artifacts/light-license-phone.png'),fullPage:true});
  await page.getByRole('button',{name:'Launch kiosk',exact:true}).click();await expect(page.getByRole('dialog',{name:'PhotoTags guest kiosk'})).toBeVisible();
  // A transport outage keeps a cryptographically verified saved permit usable after reload.
  transportDown=true;await page.reload();await page.getByRole('button',{name:'Light license',exact:true}).click();
  await expect(page.locator('.light-license-settings [role=status]')).toContainText('saved offline permit remains usable');
  await page.getByRole('button',{name:'Launch kiosk',exact:true}).click();await expect(page.getByRole('dialog',{name:'PhotoTags guest kiosk'})).toBeVisible();
  // Expiry must close an already-open kiosk, not just disable a future launch.
  await page.clock.fastForward(8*86400000);
  await expect(page.getByRole('dialog',{name:'PhotoTags guest kiosk'})).toHaveCount(0);
  await expect(page.locator('.light-license-settings [role=status]')).toContainText('expired');
  // Verify the client rejects signature tampering and permits for another identity.
  const verified=await page.evaluate(async({pub})=>{
   const module=await import('/src/lightPermit.ts');const idb=await new Promise((resolve,reject)=>{const r=indexedDB.open('phototags-light-license',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
   async function get(key){return new Promise(resolve=>{const r=idb.transaction('values').objectStore('values').get(key);r.onsuccess=()=>resolve(r.result);});}
   const token=await get('permit'),identity=await get('identity');const payload=JSON.parse(new TextDecoder().decode(module.decode64(token.split('.')[1])));
   let checks=0;for(const [changed,id] of [[token,crypto.randomUUID()],[token.slice(0,-4)+'AAAA',identity.id]]){try{await module.verifyLightPermit(changed,pub,id,identity.keyHash,payload.iat*1000+1000);}catch{checks++;}}
   idb.close();return checks;
  },{pub:publicKey});expect(verified).toBe(2);
  await page.evaluate(async()=>{
    const other=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},false,['sign','verify']);
    const db=await new Promise(resolve=>{const r=indexedDB.open('phototags-light-license',1);r.onsuccess=()=>resolve(r.result);});
    await new Promise((resolve,reject)=>{const tx=db.transaction('values','readwrite'),store=tx.objectStore('values'),r=store.get('identity');r.onsuccess=()=>store.put({...r.result,privateKey:other.privateKey},'identity');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});db.close();
  });
  transportDown=true;await page.reload();await page.getByRole('button',{name:'Light license',exact:true}).click();
  await expect(page.locator('.light-license-settings [role=status]')).toContainText('does not match');
  await page.getByRole('button',{name:'Launch kiosk',exact:true}).click();await expect(page.getByRole('dialog',{name:'PhotoTags guest kiosk'})).toHaveCount(0);
  console.log('PASS: signed activation through real Light API/SQL, launch gating, persisted outage permit, block on reconnect, in-session expiry, tamper/wrong-installation and mismatched private-key rejection.');
  website=await createServer({root:process.cwd(),configFile:false,server:{port:4186,strictPort:true}});await website.listen();
  const adminContext=await browser.newContext({viewport:{width:1360,height:900}});
  await adminContext.addInitScript(()=>{sessionStorage.setItem('phototags.admin','true');sessionStorage.setItem('phototags.admin.password','light-fixture-admin');});
  await adminContext.route('**/api/**',async route=>{
    const request=route.request();
    if(!request.url().includes('/api/light?'))return route.fulfill({json:{ok:true,summary:{active:42,activations:10,devices:10},licenses:[],devices:[],businesses:[],paymentSessions:[],comments:[],plans:[],visits:0,downloads:0}});
    let status=200,headers={},body='';const response={setHeader(k,v){headers[k]=v;},end(v){body=v||'';}};Object.defineProperty(response,'statusCode',{get:()=>status,set:v=>status=v});
    await handler({method:request.method(),url:request.url(),body:request.postDataJSON(),headers:{...request.headers(),host:'localhost:4186','x-forwarded-for':crypto.randomUUID()}},response);await route.fulfill({status,headers,body});
  });
  const adminPage=await adminContext.newPage();await adminPage.goto('http://localhost:4186/admin');
  await adminPage.getByRole('button',{name:'PhotoTags Light',exact:true}).click();await expect(adminPage.getByRole('heading',{name:'PhotoTags Light',exact:true,level:2})).toBeVisible();
  await adminPage.getByRole('button',{name:'Installations',exact:true}).click();await expect(adminPage.locator('.light-admin tbody')).toContainText('My PhotoTags Light booth');
  await adminPage.getByRole('button',{name:'Plans',exact:true}).click();await expect(adminPage.getByRole('button',{name:'Save Light plan'})).toHaveCount(3);
  await adminPage.screenshot({path:path.join(booth,'artifacts/light-admin-plans.png'),fullPage:true});
  await adminPage.goto('http://localhost:4186/light');await expect(adminPage.getByRole('heading',{name:'Light license terms',exact:true})).toBeVisible();
  console.log('PASS: separate website Light admin navigation, installations, plans and public terms page.');
 }finally{await browser?.close();await vite?.close();await website?.close();await pg.close();delete process.env.VITE_LIGHT_LICENSING_ENABLED;delete process.env.VITE_LIGHT_API_ORIGIN;delete process.env.VITE_LIGHT_PUBLIC_KEY_JWK;}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
