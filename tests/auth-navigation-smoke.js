const express=require('express'),path=require('path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
(async()=>{
  const app=express();app.use(express.json());let expired=false;
  const valid=req=>!expired&&req.headers.authorization==='Bearer valid-token';
  app.post('/api/local-preview/session',(q,r)=>r.sendStatus(404));
  app.get('/api/auth/verify',(q,r)=>valid(q)?r.json({user:{role:'admin'}}):r.status(401).json({error:'expired'}));
  app.post('/api/auth/login',(q,r)=>r.json({token:'valid-token',name:'测试',role:'admin'}));
  app.get('/api/auth/password-reset/status',(q,r)=>r.json({enabled:false}));
  app.get('/api/writing/directions',(q,r)=>valid(q)?r.json(require('../lib/writing-directions')):r.status(401).json({error:'expired'}));
  for(const route of ['/api/brands','/api/xhs-writing/methods','/api/writing/jobs'])app.get(route,(q,r)=>valid(q)?r.json([]):r.status(401).json({error:'expired'}));
  app.use(express.static(path.resolve(__dirname,'..')));
  const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base=`http://127.0.0.1:${server.address().port}`;let browser;
  try{
    browser=await chromium.launch({headless:true,channel:'msedge'});
    const page=await browser.newPage();let navigations=0;page.on('framenavigated',f=>{if(f===page.mainFrame())navigations++;});
    await page.addInitScript(()=>{if(!sessionStorage.getItem('seeded')){localStorage.setItem('brand_auth_token','expired-token');localStorage.setItem('brand_user_name','旧用户');localStorage.setItem('brand_user_role','admin');sessionStorage.setItem('seeded','1');}});
    await page.goto(base+'/studio.html');await page.waitForURL('**/login.html');
    await page.waitForFunction(()=>!localStorage.getItem('brand_auth_token'));
    assert.equal(await page.evaluate(()=>localStorage.getItem('brand_user_name')),null);
    const settled=navigations;await page.waitForTimeout(600);assert.equal(navigations,settled,'expired token must not cause redirect loop');
    await page.locator('#email').fill('person@example.test');await page.locator('#password').fill('password');await page.locator('#loginBtn').click();await page.waitForURL('**/studio.html');await page.locator('#directionPreset option[value=pain]').waitFor({state:'attached'});
    expired=true;await page.locator('#refresh').click();await page.waitForURL('**/login.html');assert.equal(await page.evaluate(()=>localStorage.getItem('brand_auth_token')),null);
    expired=false;await page.evaluate(()=>localStorage.setItem('brand_auth_token','valid-token'));await page.reload();await page.waitForURL('**/studio.html');
    await page.evaluate(()=>localStorage.setItem('brand_auth_token','expired-token'));await page.goto(base+'/login.html');await page.waitForFunction(()=>!localStorage.getItem('brand_auth_token'));assert.equal(new URL(page.url()).pathname,'/login.html');
    console.log('Expired token, direct login, active-session expiry and valid auto-login passed.');
  }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
