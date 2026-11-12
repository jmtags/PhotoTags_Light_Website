// End-to-end browser check: actual Light API, SQL and WebCrypto; PayMongo is a local fixture.
const path=require('node:path'),fs=require('node:fs'),crypto=require('node:crypto');
const {createRequire}=require('node:module'),{pathToFileURL}=require('node:url');
const {PGlite}=require('@electric-sql/pglite');
const {createLightHandler}=require('../light-service/server/light-api');
const database=require('./lib/light-test-db.cjs'),fixture=require('./lib/light-qr-fixture.cjs');
async function main(){
 const booth=path.resolve(process.argv[2]||'../PhotoTagsReceipt_Booth_ALL'),req=createRequire(path.join(booth,'package.json'));
 const {chromium}=req('playwright'),{expect}=req('@playwright/test'),AxeBuilder=req('@axe-core/playwright').default;
 const {createServer}=await import(pathToFileURL(req.resolve('vite')).href);
 const signing=crypto.generateKeyPairSync('ec',{namedCurve:'prime256v1'}),pg=new PGlite();let server,browser;
 try {
  await pg.exec('create role anon;create role authenticated;create role service_role;');
  for(const file of ['202611110001_light_licensing.sql','202611120001_light_inline_qr.sql'])await pg.exec(fs.readFileSync('supabase/migrations/'+file,'utf8'));
  await pg.exec("update light_plans set active=true,amount=2000 where id='weekly'");
  const db=database(pg),provider=fixture(),env={LIGHT_SIGNING_PRIVATE_KEY:signing.privateKey.export({type:'pkcs8',format:'pem'}),LIGHT_PAYMONGO_SECRET_KEY:'sk_test_fixture',LIGHT_ALLOWED_ORIGINS:'http://localhost:4187'};
  const handler=createLightHandler({env,client:()=>db,fetcher:provider.fetcher});
  process.env.VITE_LIGHT_LICENSING_ENABLED='true';process.env.VITE_LIGHT_API_ORIGIN='http://localhost:4187';process.env.VITE_LIGHT_PUBLIC_KEY_JWK=JSON.stringify(signing.publicKey.export({format:'jwk'}));
  server=await createServer({root:booth,configFile:path.join(booth,'vite.config.ts'),server:{port:4187,strictPort:true}});await server.listen();
  browser=await chromium.launch({channel:'chrome',headless:true});
  for(const {mobile,legacy} of [{mobile:false,legacy:false},{mobile:true,legacy:false},{mobile:false,legacy:true}]){
   const context=await browser.newContext({viewport:mobile?{width:390,height:667}:{width:1440,height:1000},isMobile:mobile,hasTouch:mobile});
   const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.clock.install();
   await context.route('**/api/light?*',async route=>{
    const request=route.request();
    if(legacy && request.postDataJSON()?.action==='qr-checkout')return route.fulfill({status:400,json:{ok:false,status:'invalid_challenge_request'}});
    let status=200,headers={},body='';const response={setHeader(k,v){headers[k]=v;},end(v){body=v||'';}};Object.defineProperty(response,'statusCode',{get:()=>status,set:v=>status=v});
    await handler({method:request.method(),url:request.url(),body:request.postDataJSON(),headers:{...request.headers(),host:'localhost:4187','x-forwarded-for':crypto.randomUUID()}},response);await route.fulfill({status,headers,body});
   });
   await page.goto('http://localhost:4187');await page.getByRole('button',{name:'Light license',exact:true}).click();
   await expect(page.locator('.light-license-settings [role=status]')).toContainText('Activate a PhotoTags Light license');
   await expect(page.getByRole('button',{name:'Activate Light license',exact:true})).toBeVisible();
   await page.getByRole('button',{name:'Activate license',exact:true}).click();
   const dialog=page.getByRole('dialog');await expect(dialog).toBeVisible();
   await expect(dialog.getByRole('button',{name:'Agree & continue'})).toBeDisabled();
   await dialog.getByRole('checkbox').check();await dialog.getByRole('button',{name:'Agree & continue'}).click();
   await expect(dialog.getByRole('button',{name:'Show payment QR'})).toBeDisabled();
   await dialog.getByRole('radio').first().check();await dialog.getByLabel('Receipt email').fill('browser-fixture@example.test');
   await dialog.getByRole('button',{name:'Show payment QR'}).click();
   if(legacy)await expect(dialog.getByRole('link',{name:'Complete payment at PayMongo'})).toBeVisible();
   else await expect(dialog.getByRole('img',{name:'QR Ph code for PhotoTags Light license payment'})).toBeVisible();
   expect(page.url()).toBe('http://localhost:4187/');
   const issues=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();expect(issues.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)}))).toEqual([]);
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
   await page.screenshot({path:path.join(booth,`artifacts/light-qr-${legacy?'legacy':mobile?'phone':'desktop'}.png`)});
   const intent=[...(legacy?provider.checkouts:provider.intents).values()].at(-1);const before=provider.intents.size+provider.checkouts.size;
   await dialog.getByRole('button',{name:'Close license activation'}).click();
   await page.reload();await page.getByRole('button',{name:'Light license',exact:true}).click();await page.getByRole('button',{name:'Resume license payment'}).click();
   if(legacy)await expect(dialog.getByRole('link',{name:'Complete payment at PayMongo'})).toBeVisible();
   else await expect(dialog.getByRole('img')).toBeVisible();
   expect(provider.intents.size+provider.checkouts.size).toBe(before);
   provider.pay(intent.id);await page.clock.fastForward(6500);
   await expect(dialog.getByRole('heading',{name:'Your booth is licensed'})).toBeVisible();
   await expect(dialog.getByText('Light Weekly',{exact:true})).toBeVisible();await dialog.getByRole('button',{name:'Done',exact:true}).click();
   await expect(page.locator('.light-license-facts')).toContainText('Light Weekly');
   await expect(page.locator('.light-license-settings [role=status]')).toContainText('License active');
   expect(errors).toEqual([]);await context.close();
   console.log(`PASS ${legacy?'previous-service compatibility':mobile?'phone':'desktop'}: consent and plan gates, inline QR, no redirect, reload/resume without duplicate intent, automatic verified activation, updated plan, accessibility.`);
  }
 } finally {await browser?.close();await server?.close();await pg.close();for(const key of ['VITE_LIGHT_LICENSING_ENABLED','VITE_LIGHT_API_ORIGIN','VITE_LIGHT_PUBLIC_KEY_JWK'])delete process.env[key];}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
