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
  await pg.exec('create role anon;create role authenticated;create role service_role;');await pg.exec(fs.readFileSync('supabase/migrations/202611110001_light_licensing.sql','utf8'));await pg.exec(fs.readFileSync('supabase/migrations/202611120003_light_one_day_trial.sql','utf8'));
  await pg.exec(fs.readFileSync('supabase/migrations/202611120004_light_usage_tracking.sql','utf8'));
  await pg.exec("update light_plans set active=true,amount=15000 where id='monthly'");
  const db=database(pg);const grant=await db.rpc('light_admin_action',{p_action:'create_license',p_id:'',p_values:{planId:'monthly',email:'fixture@example.test'}});if(grant.error)throw grant.error;
  let uploadSlots=0,uploaded=0,rejectUpload=true;
  const handler=createLightHandler({env,client:()=>db,fetcher:async(url,options)=>{
    if(url!=='https://www.phototags.app/api/upload')throw Error('Unexpected provider request');
    expect(JSON.parse(options.body)).toEqual({contentType:'image/jpeg'});
    const code='LIGHTTEST'+(++uploadSlots);
    return {ok:true,json:async()=>({ok:true,code,signedUploadUrl:`https://fixture.supabase.co/storage/v1/object/upload/sign/photobooth-downloads/captures/${code}.jpg?token=fixture`,expiresAt:new Date(Date.now()+1800000).toISOString()})};
  }});
  process.env.VITE_LIGHT_LICENSING_ENABLED='true';process.env.VITE_LIGHT_API_ORIGIN='http://localhost:4185';process.env.VITE_LIGHT_PUBLIC_KEY_JWK=JSON.stringify(publicKey);
  const photoHarness={name:'light-photo-browser-check',configureServer(server){server.middlewares.use(async(request,response,next)=>{
    if(request.url!=='/__light-photo-test')return next();
    response.setHeader('Content-Type','text/html');response.end(await server.transformIndexHtml(request.url,'<!doctype html><html lang="en"><head><title>Photo download check</title><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/__light-photo-harness.tsx"></script></body></html>'));
  });},resolveId(id){if(id==='/__light-photo-harness.tsx')return '\0light-photo-harness.tsx';},load(id){if(id!=='\0light-photo-harness.tsx')return;return req('typescript').transpileModule(`
    import React,{useState} from 'react';import{createRoot}from'react-dom/client';
    import{useLightLicense}from'/src/lightLicense.ts';import{PhotoDownloadQr}from'/src/PhotoDownloadQr.tsx';import'/src/style.css';
    function photo(color){const c=document.createElement('canvas');c.width=40;c.height=30;const x=c.getContext('2d');x.fillStyle=color;x.fillRect(0,0,40,30);return c.toDataURL('image/png');}
    const cache=new Map();function App(){const l=useLightLicense(),[photos,setPhotos]=useState(()=>[photo('#ff4455')]),[online,setOnline]=useState(true),[preview,setPreview]=useState(()=>photo('#2255ee')),[automatic,setAutomatic]=useState(true),[visible,setVisible]=useState(true);return <main style={{maxWidth:420,padding:20}}><h1>Photo download check</h1>{visible&&<PhotoDownloadQr booth={{photos,preview,complete:true,rendering:false,online,lightLicense:l,autoDownloadQr:automatic,photoDownloadCache:cache}}/>}<button onClick={()=>{cache.clear();setPhotos([photo('#'+Math.floor(Math.random()*0xffffff).toString(16).padStart(6,'0'))]);setPreview(photo('#'+Math.floor(Math.random()*0xffffff).toString(16).padStart(6,'0')));}}>Change session</button><button onClick={()=>setOnline(!online)}>Toggle connection</button><button onClick={()=>setAutomatic(!automatic)}>Toggle automation</button><button onClick={()=>setVisible(!visible)}>Toggle panel</button></main>;}
    createRoot(document.getElementById('root')).render(<App/>);
  `,{compilerOptions:{jsx:4,module:99}}).outputText;}};
  vite=await createServer({root:booth,cacheDir:path.join(booth,'node_modules/.vite-light-integration'),plugins:[photoHarness],server:{port:4185,strictPort:true},configFile:path.join(booth,'vite.config.ts')});await vite.listen();
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
  await context.route('https://fixture.supabase.co/storage/v1/object/upload/sign/**',async route=>{
    expect(route.request().method()).toBe('PUT');expect(route.request().headers()['content-type']).toBe('image/jpeg');
    const bytes=route.request().postDataBuffer();expect(bytes[0]).toBe(255);expect(bytes[1]).toBe(216);
    if(rejectUpload){rejectUpload=false;return route.fulfill({status:503,body:'fixture upload failure'});}
    uploaded++;await route.fulfill({status:200,json:{ok:true}});
  });
  const page=await context.newPage();page.on('pageerror',e=>console.error('Browser error:',e.message));await page.clock.install();await page.goto('http://localhost:4185',{waitUntil:'domcontentloaded'});
  await page.getByRole('button',{name:'Launch kiosk',exact:true}).click();
  await expect(page.getByRole('heading',{name:'PhotoTags LRB license',exact:true})).toBeVisible();
  await expect(page.locator('.light-license-settings [role=status]')).toContainText('Activate a PhotoTags LRB license');
  await page.getByLabel('Light license key',{exact:true}).fill(grant.data.licenseKey);await page.getByRole('button',{name:'Activate Light license',exact:true}).click();
  await expect(page.getByRole('dialog',{name:'PhotoTags LRB guest kiosk'})).toBeVisible();
  await page.goto('http://localhost:4185/__light-photo-test');
  const raw=page.getByRole('group',{name:'Raw photo',exact:true}),decorated=page.getByRole('group',{name:'Decorated receipt',exact:true});
  await expect(raw).toHaveCount(0);
  await expect(decorated.getByRole('status')).toContainText('Upload failed');expect(uploadSlots).toBe(1);
  await page.clock.fastForward(2000);expect(uploadSlots).toBe(1);
  await decorated.getByRole('button',{name:'Retry QR for decorated receipt'}).click();
  await expect(page.getByAltText('Scan to download decorated receipt')).toBeVisible();expect(uploaded).toBe(1);expect(uploadSlots).toBe(2);
  const AxeBuilder=req('@axe-core/playwright').default;expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa']).analyze()).violations).toEqual([]);
  await page.screenshot({path:path.join(booth,'artifacts/light-photo-download-phone.png'),fullPage:true});
  await page.getByRole('button',{name:'Toggle panel'}).click();await page.getByRole('button',{name:'Toggle panel'}).click();
  await expect(raw).toHaveCount(0);await expect(decorated.getByRole('img')).toBeVisible();expect(uploadSlots).toBe(2);
  await page.getByRole('button',{name:'Change session'}).click();await expect(raw).toHaveCount(0);await expect(decorated.getByRole('img')).toBeVisible();expect(uploadSlots).toBe(3);
  await page.getByRole('button',{name:'Toggle automation'}).click();await page.getByRole('button',{name:'Change session'}).click();
  await expect(raw).toHaveCount(0);await expect(decorated.getByRole('img')).toHaveCount(0);expect(uploadSlots).toBe(3);
  await decorated.getByRole('button',{name:'Get QR for decorated receipt'}).click();await expect(decorated.getByRole('img')).toBeVisible();expect(uploadSlots).toBe(4);
  await page.getByRole('button',{name:'Toggle connection'}).click();await expect(raw).toHaveCount(0);await decorated.getByRole('img').waitFor();await page.getByRole('button',{name:'Change session'}).click();await expect(decorated.getByRole('button',{name:'Get QR for decorated receipt'})).toBeDisabled();
  console.log('PASS: decorated-only QR with no raw-photo uploads, failed upload and retry, cached remount without duplicate upload, new session reset, manual mode and offline gating.');
  await page.goto('http://localhost:4185',{waitUntil:'domcontentloaded'});
  await page.getByRole('button',{name:'Launch kiosk',exact:true}).click();await expect(page.getByRole('dialog',{name:'PhotoTags LRB guest kiosk'})).toBeVisible();
  transportDown=false;await pg.exec('update light_installations set blocked=true');
  await page.reload();await page.getByRole('button',{name:'Light license',exact:true}).click();
  await expect(page.locator('.light-license-settings [role=status]')).toContainText('installation blocked');
  await page.getByRole('button',{name:'Launch kiosk',exact:true}).click();await expect(page.getByRole('dialog',{name:'PhotoTags LRB guest kiosk'})).toHaveCount(0);
  const wall=page.getByRole('dialog',{name:'Activate to launch your booth'});
  await expect(wall).toBeVisible();
  await pg.exec('update light_installations set blocked=false');await wall.getByText('Installation & offline access',{exact:true}).click();await wall.getByRole('button',{name:'Check license / payment',exact:true}).click();
  await expect(page.getByRole('dialog',{name:'PhotoTags LRB guest kiosk'})).toBeVisible();
  await page.screenshot({path:path.join(booth,'artifacts/light-license-phone.png'),fullPage:true});
  // A transport outage keeps a cryptographically verified saved permit usable after reload.
  transportDown=true;await page.reload();await page.getByRole('button',{name:'Light license',exact:true}).click();
  await expect(page.locator('.light-license-settings [role=status]')).toContainText('saved offline permit remains usable');
  await page.getByRole('button',{name:'Launch kiosk',exact:true}).click();await expect(page.getByRole('dialog',{name:'PhotoTags LRB guest kiosk'})).toBeVisible();
  // Expiry must close an already-open kiosk, not just disable a future launch.
  await page.clock.fastForward(8*86400000);
  await expect(page.getByRole('dialog',{name:'PhotoTags LRB guest kiosk'})).toHaveCount(0);
  await expect(wall).toBeVisible();
  await expect(wall.locator('.light-license-settings [role=status]')).toContainText('expired');
  await expect(wall.getByRole('button',{name:'License active',exact:true})).toBeDisabled();
  await expect(wall.getByRole('button',{name:'Activate Light license',exact:true})).toBeDisabled();
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
  await page.getByRole('button',{name:'Launch kiosk',exact:true}).click();await expect(page.getByRole('dialog',{name:'PhotoTags LRB guest kiosk'})).toHaveCount(0);
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
  await adminPage.getByRole('button',{name:'Installations',exact:true}).click();await expect(adminPage.locator('.light-admin tbody')).toContainText('My PhotoTags LRB booth');
  await adminPage.getByRole('button',{name:'Plans',exact:true}).click();await expect(adminPage.getByRole('button',{name:'Save Light plan'})).toHaveCount(3);
  await adminPage.screenshot({path:path.join(booth,'artifacts/light-admin-plans.png'),fullPage:true});
  await adminPage.getByRole('button',{name:'Usage',exact:true}).click();await expect(adminPage.getByRole('heading',{name:'PhotoTags LRB usage',exact:true})).toBeVisible();
  await expect(adminPage.locator('.light-usage')).toContainText('Unique installations');
  await adminPage.goto('http://localhost:4186/light');await expect(adminPage.getByRole('heading',{name:'Light license terms',exact:true})).toBeVisible();
  console.log('PASS: separate website Light admin navigation, installations, plans and public terms page.');
  const trialContext=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  let trialTransportDown=false;
  await trialContext.route('**/api/light?*',async route=>{
   if(trialTransportDown)return route.fulfill({status:503,json:{ok:false,status:'fixture_offline'}});
    const request=route.request();let status=200,headers={},body='';const response={setHeader(k,v){headers[k]=v;},end(v){body=v||'';}};Object.defineProperty(response,'statusCode',{get:()=>status,set:v=>status=v});
    await handler({method:request.method(),url:request.url(),body:request.postDataJSON(),headers:{...request.headers(),host:'localhost:4185','x-forwarded-for':crypto.randomUUID()}},response);await route.fulfill({status,headers,body});
  });
  let trialUploads=0;
  await trialContext.route('https://fixture.supabase.co/storage/v1/object/upload/sign/**',async route=>{
    const decoded=await req('sharp')(route.request().postDataBuffer()).removeAlpha().raw().toBuffer({resolveWithObject:true});
    let dark=0;for(let i=0;i<decoded.data.length;i+=decoded.info.channels)if(Math.max(decoded.data[i],decoded.data[i+1],decoded.data[i+2])<140)dark++;
    expect(dark).toBeGreaterThan(0);trialUploads++;await route.fulfill({status:200,json:{ok:true}});
  });
  const trialPage=await trialContext.newPage();
  await trialPage.routeWebSocket(/wss:\/\/localhost:\d+\/?/,ws=>ws.onMessage(message=>{if(message==='ping')return;const r=JSON.parse(message.toString());ws.send(JSON.stringify({uid:r.uid,result:r.call==='getVersion'?'2.3.0':r.call==='printers.find'?['Fixture thermal queue']:null}));}));
  await trialPage.goto('http://localhost:4185',{waitUntil:'domcontentloaded'});
  const trialWall=trialPage.getByRole('dialog',{name:'Activate to launch your booth'});
  for(const section of ['Branding','Camera','Printer connection']){
   await trialPage.getByRole('button',{name:section,exact:true}).click();
   await trialPage.getByRole('button',{name:'Launch kiosk',exact:true}).click();await expect(trialWall).toBeVisible();
   if(section==='Branding'){
    expect((await new AxeBuilder({page:trialPage}).withTags(['wcag2a','wcag2aa']).analyze()).violations).toEqual([]);
    await trialPage.screenshot({path:path.join(booth,'artifacts/light-launch-wall-phone.png'),fullPage:true});
    await trialWall.getByRole('button',{name:'Activate license',exact:true}).click();
    const activation=trialPage.getByRole('dialog',{name:'Before you activate',exact:true});
    await expect(activation).toBeVisible();await activation.getByRole('button',{name:'Close license activation'}).click();
    await expect(trialWall).toBeVisible();
   }
   await expect(trialPage.getByRole('button',{name:section,exact:true})).toHaveAttribute('aria-current','page');
   await trialWall.getByRole('button',{name:'Close license wall',exact:true}).click();await expect(trialWall).toHaveCount(0);
   expect(await trialPage.evaluate(()=>document.body.style.overflow)).toBe('');
   await expect(trialPage.getByRole('button',{name:'Launch kiosk',exact:true})).toBeFocused();
  }
  await trialPage.getByRole('button',{name:'Launch kiosk',exact:true}).click();
  await trialWall.getByRole('button',{name:'Start 1-day free trial',exact:true}).click();
  await expect(trialPage.getByRole('dialog',{name:'PhotoTags LRB guest kiosk'})).toBeVisible();await expect(trialWall).toHaveCount(0);
  await trialPage.reload();await trialPage.getByRole('button',{name:'Launch kiosk',exact:true}).click();
  await expect(trialPage.getByRole('dialog',{name:'PhotoTags LRB guest kiosk'})).toBeVisible();await expect(trialWall).toHaveCount(0);
  trialTransportDown=true;await trialPage.reload();
  await trialPage.getByRole('button',{name:'Launch kiosk',exact:true}).click();
  await expect(trialPage.getByRole('dialog',{name:'PhotoTags LRB guest kiosk'})).toBeVisible();await expect(trialWall).toHaveCount(0);
  trialTransportDown=false;
  await trialPage.reload();await trialPage.getByRole('button',{name:'Light license',exact:true}).click();
  await expect(trialPage.locator('.light-license-settings [role=status]')).toContainText('1-day free trial is active');
  await expect(trialPage.getByRole('button',{name:'Buy a Light license',exact:true})).toBeEnabled();
  await expect(trialPage.getByRole('button',{name:'Start 1-day free trial',exact:true})).toHaveCount(0);
  await trialPage.getByRole('button',{name:'Printer connection',exact:true}).click();await trialPage.getByRole('button',{name:'Load printer test artwork'}).click();
  await expect(trialPage.getByRole('button',{name:'Export ESC/POS job'})).toBeEnabled();
  const trialJobEvent=trialPage.waitForEvent('download');await trialPage.getByRole('button',{name:'Export ESC/POS job'}).click();const trialJob=fs.readFileSync(await (await trialJobEvent).path());
  async function airPrintSheet(){
    await trialPage.getByRole('combobox',{name:'Print method',exact:true}).selectOption('airprint');
    await trialPage.getByRole('button',{name:'Preview AirPrint sheet',exact:true}).click();
    const sheet=trialPage.getByRole('dialog',{name:'Print your photo sheet'});
    await expect(sheet.getByRole('button',{name:'Print / AirPrint',exact:true})).toBeEnabled();
    const data=Buffer.from((await sheet.locator('.airprint-sheet').getAttribute('src')).split(',')[1],'base64');
    const meta=await req('sharp')(data).metadata();expect([meta.width,meta.height]).toEqual([1200,1800]);
    const opening=trialPage.waitForEvent('popup');
    await sheet.getByRole('button',{name:'Print / AirPrint',exact:true}).click();
    const target=await opening;await expect(target.getByRole('button',{name:'Print / AirPrint',exact:true})).toBeEnabled();
    await target.evaluate(()=>{window.fixtureAirPrintCalls=0;window.print=()=>window.fixtureAirPrintCalls++;});
    await target.getByRole('button',{name:'Print / AirPrint',exact:true}).click();
    expect(await target.evaluate(()=>window.fixtureAirPrintCalls)).toBe(1);
    await expect(target.getByRole('button',{name:'Print / AirPrint',exact:true})).toBeDisabled();await target.close();
    await sheet.getByRole('button',{name:'Close AirPrint preview'}).click();
    await expect(trialPage.getByRole('status').filter({hasText:'Check your last print'})).toContainText('Printing or cancellation is unconfirmed');
    await trialPage.getByRole('button',{name:'I checked the printer',exact:true}).click();
    await trialPage.getByRole('combobox',{name:'Print method',exact:true}).selectOption('qz');
    return data;
  }
  const trialAirPrint=await airPrintSheet();
  await trialPage.goto('http://localhost:4185/__light-photo-test');
  await expect(trialPage.getByAltText('Scan to download decorated receipt')).toBeVisible();await expect(trialPage.getByAltText('Scan to download raw photo')).toHaveCount(0);expect(trialUploads).toBe(1);
  await trialPage.screenshot({path:path.join(booth,'artifacts/light-trial-qr-phone.png'),fullPage:true});
  const upgrade=(await db.rpc('light_admin_action',{p_action:'create_license',p_id:'',p_values:{planId:'monthly',email:'trial-upgrade@example.test'}})).data;
  await trialPage.goto('http://localhost:4185');await trialPage.getByRole('button',{name:'Light license',exact:true}).click();
  await trialPage.getByLabel('Light license key',{exact:true}).fill(upgrade.licenseKey);await trialPage.getByRole('button',{name:'Activate Light license',exact:true}).click();
  await expect(trialPage.locator('.light-license-settings [role=status]')).toContainText('License active');
  await trialPage.getByRole('button',{name:'Printer connection',exact:true}).click();await trialPage.getByRole('button',{name:'Load printer test artwork'}).click();
  await expect(trialPage.getByRole('button',{name:'Export ESC/POS job'})).toBeEnabled();const paidJobEvent=trialPage.waitForEvent('download');await trialPage.getByRole('button',{name:'Export ESC/POS job'}).click();const paidJob=fs.readFileSync(await (await paidJobEvent).path());
  expect(paidJob.length).toBe(trialJob.length);expect(paidJob.equals(trialJob)).toBe(false);
  const paidAirPrint=await airPrintSheet();expect(paidAirPrint.equals(trialAirPrint)).toBe(false);
  console.log('PASS: signed trial and paid AirPrint sheets, trial watermark difference, native print request once and unresolved-job review.');
  await trialPage.getByRole('button',{name:'Connect & find printer queues'}).click();await trialPage.getByLabel('Raw printer queue').selectOption('Fixture thermal queue');
  await trialPage.evaluate(()=>Object.defineProperty(navigator.mediaDevices,'getUserMedia',{configurable:true,value:async()=>{const c=document.createElement('canvas');c.width=1280;c.height=720;c.getContext('2d').fillRect(0,0,1280,720);const stream=c.captureStream(10);Object.defineProperty(stream.getVideoTracks()[0],'label',{value:'Fixture USB Camera'});return stream;}}));
  await trialPage.getByRole('button',{name:'Launch kiosk',exact:true}).click();const trackedKiosk=trialPage.getByRole('dialog',{name:'PhotoTags LRB guest kiosk'});
  await trackedKiosk.locator('.kiosk-start').click();await trackedKiosk.getByRole('button',{name:'1 shot',exact:true}).click();await trackedKiosk.getByRole('button',{name:'Continue to camera'}).click();await trackedKiosk.locator('.kiosk-camera-button').click();
  await expect(trackedKiosk.getByRole('button',{name:'Take my photo',exact:true})).toBeEnabled();
  await expect.poll(async()=>JSON.stringify((await pg.query('select camera,printer,app_mode from light_usage_devices')).rows),{timeout:25000}).toContain('Fixture USB Camera');
  const tracked=(await pg.query("select * from light_usage_devices where camera->>'label'='Fixture USB Camera'")).rows[0];expect(tracked.printer.queue).toBe('Fixture thermal queue');expect(tracked.app_mode).toBe('kiosk');
  const views=tracked.total_views;await trackedKiosk.getByRole('button',{name:'Close camera',exact:true}).click();
  await expect.poll(async()=>(await pg.query('select camera from light_usage_devices where installation_id=$1',[tracked.installation_id])).rows[0].camera.active,{timeout:25000}).toBe(false);
  const closed=(await pg.query('select total_views,camera from light_usage_devices where installation_id=$1',[tracked.installation_id])).rows[0];expect(closed.total_views).toBe(views);expect(closed.camera.label).toBe('Fixture USB Camera');
  await adminPage.goto('http://localhost:4186/admin');await adminPage.getByRole('button',{name:'PhotoTags Light',exact:true}).click();await adminPage.getByRole('button',{name:'Usage',exact:true}).click();
  await expect(adminPage.locator('.light-usage-table')).toContainText('Fixture USB Camera');await expect(adminPage.locator('.light-usage-table')).toContainText('Fixture thermal queue');
  await adminPage.screenshot({path:path.join(booth,'artifacts/light-admin-usage-desktop.png'),fullPage:true});
  await adminPage.getByLabel('Find an installation or device').fill('Fixture USB Camera');await adminPage.getByRole('button',{name:'Search usage',exact:true}).click();await expect(adminPage.locator('.light-usage-table tbody tr')).toHaveCount(1);
  expect((await new AxeBuilder({page:adminPage}).include('.light-usage').withTags(['wcag2a','wcag2aa']).analyze()).violations).toEqual([]);
  await trialContext.close();console.log('PASS: one-day trial, decorated QR watermark, native print raster, signed usage reports, camera and printer metadata, view deduplication and admin usage search.');

 }finally{await browser?.close();await vite?.close();await website?.close();await pg.close();delete process.env.VITE_LIGHT_LICENSING_ENABLED;delete process.env.VITE_LIGHT_API_ORIGIN;delete process.env.VITE_LIGHT_PUBLIC_KEY_JWK;}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
