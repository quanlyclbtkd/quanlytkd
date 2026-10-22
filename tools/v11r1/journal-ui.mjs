import {loadPlaywright,browserExecutable} from '../test-runtime.mjs';
// Actual attendance module and DOM, native IndexedDB; no Firebase SDK/network.
import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import crypto from 'node:crypto';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const {chromium}=loadPlaywright(),root=process.cwd(),results=[];
const out=path.resolve('handoff/V11R1/evidence/journal-ui');fs.mkdirSync(out,{recursive:true});
const html=fs.readFileSync('index.html','utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<link\b[^>]*https:[^>]*>/gi,'');
const server=http.createServer((req,res)=>{const u=new URL(req.url,'http://local');if(u.pathname==='/'){res.setHeader('content-type','text/html');res.end(html);return;}const file=path.resolve(root,'.'+u.pathname);if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return}try{res.setHeader('content-type',file.endsWith('.css')?'text/css':'text/javascript');res.end(fs.readFileSync(file))}catch{res.writeHead(404);res.end()}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({executablePath:browserExecutable(),headless:true,args:['--no-sandbox']});
async function check(name,fn){await fn();results.push({name,status:'PASS'});console.log('PASS',name)}
try{
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});await context.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 const page=await context.newPage();await page.goto('http://127.0.0.1:'+server.address().port);
 await page.evaluate(async()=>{
  Object.defineProperty(navigator,'onLine',{get:()=>false,configurable:true});window.confirm=()=>true;
  window.setAuth=(uid,role,generation)=>{window.userRole=role;window.currentClubId='A';window.coachBranch=role==='coach'?'CS1':'';window.__store={clubId:'A',currentClubId:'A',userRole:role,coachBranch:window.coachBranch,currentUser:{uid},profiles:{},clubConfig:{}};window.__verifiedAuthContextState={ready:true,uid,role,generation,clubId:'A',coachBranch:window.coachBranch};};
  setAuth('CoachA','coach',1);window._fb_init={};window.showToast=()=>{};window.getLocalToday=()=> '2026-10-20';
  document.querySelector('.app-container').style.display='block';document.getElementById('loginOverlay').style.display='none';document.getElementById('tab_attendance').classList.add('active');
  await import('/js/core/branchIdentity.js');await import('/js/core/roleReadBoundary.js');RoleReadBoundary.setContext({role:'coach',clubId:'A',coachBranch:'CS1'});(await import('/js/core/globalOwnershipRegistry.js')).initGlobalOwnershipRegistry();
  window.mod=await import('/js/modules/attendance.js');window.api=mod.initAttendance();window.j=(await import('/js/data/attendanceJournal.js')).AttendanceJournal;
  const record={clubId:'A',docId:'SECRET-CoachA_2026-10-20',profileId:'SECRET-CoachA',name:'SECRET-CoachA',date:'2026-10-20',month:'2026-10',branch:'CS1',status:1,baseVersion:'unknown',shiftId:'',shiftMode:'legacy-no-shift'};
  window.own=(await j.enqueue([record],__verifiedAuthContextState))[0];window.rawLegacy=JSON.stringify({clubId:'A',date:'2026-10-20',records:{x:{...record,name:'SECRET-LEGACY',profileId:'SECRET-LEGACY'}}});localStorage.setItem('offline_att_A_2026-10-20',rawLegacy);
  window.dump=()=>new Promise(resolve=>{const r=indexedDB.open('tst-attendance-journal-v3',1);r.onsuccess=()=>{const db=r.result,q=db.transaction('intents').objectStore('intents').getAll();q.onsuccess=()=>{resolve(q.result);db.close()}}});
  await api.openPendingReview();
 });
 await check('own V3 review visible; legacy inventory read-only with no identity',async()=>{
  const text=await page.locator('#attendanceReviewSheet').textContent();assert(text.includes('SECRET-CoachA'));assert(!text.includes('SECRET-LEGACY'));assert(text.includes('xác minh chủ dữ liệu'));assert.equal(await page.locator('#attendanceReviewSheet section').count(),1);assert.equal(await page.locator('[data-legacy-review] button').count(),0);
 });
 const stale=await page.locator('#attendanceReviewSheet section button').first().elementHandle();const before=await page.evaluate(()=>dump());
 await check('same club account/role switch removes old review and state',async()=>{
  await page.evaluate(()=>{setAuth('AdminB','admin',2);mod.initAttendance()});assert.equal(await page.locator('#attendanceReviewSheet').count(),0);
  await page.evaluate(()=>api.openPendingReview());const text=await page.locator('#attendanceReviewSheet').textContent();assert(!text.includes('SECRET-CoachA'));assert(!text.includes('SECRET-LEGACY'));assert.equal(await page.locator('#attendanceReviewSheet section').count(),0);
 });
 await check('detached stale button cannot mutate another principal',async()=>{await stale.evaluate(el=>el.click());assert.deepEqual(await page.evaluate(()=>dump()),before)});
 await check('logout hides sheet with attendance pane; next auth generation removes it',async()=>{
  await page.evaluate(()=>{__verifiedAuthContextState.ready=false;document.querySelector('.app-container').style.display='none'});assert.equal(await page.locator('#attendanceReviewSheet').isVisible(),false);
  await page.evaluate(()=>{setAuth('AdminB','admin',3);document.querySelector('.app-container').style.display='block';mod.initAttendance()});assert.equal(await page.locator('#attendanceReviewSheet').count(),0);
 });
 await check('raw legacy retained after review, account switch and logout',async()=>{assert.equal(await page.evaluate(()=>localStorage.getItem('offline_att_A_2026-10-20')===rawLegacy),true)});
 await context.close();
}catch(error){results.push({name:'test failure',status:'FAIL',actual:error.stack});throw error}finally{
 const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({command:process.argv.join(' '),environment:'actual module/DOM/native Chromium IDB; no Firestore; mobile viewport only',sourceHashes:Object.fromEntries(['js/data/attendanceJournal.js','js/modules/attendance.js','firestore.rules'].map(p=>[p,sha(p)])),results},null,2));await browser.close();await new Promise(r=>server.close(r));
}
console.log('JOURNAL UI PASS',results.length);
