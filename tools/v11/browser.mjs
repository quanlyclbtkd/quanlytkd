import {loadPlaywright,browserExecutable} from '../test-runtime.mjs';
// Actual Chromium tabs, native IndexedDB, real SPA DOM/modules and Emulator.
import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
import {initializeTestEnvironment} from '@firebase/rules-unit-testing';import * as sdk from 'firebase/firestore';
const out=path.resolve(process.env.V11_BROWSER_OUTPUT||'../../evidence/browser');fs.mkdirSync(out,{recursive:true});
const pw=loadPlaywright();
const [host,port]=(process.env.FIRESTORE_EMULATOR_HOST||'').split(':'),projectId='demo-v11-browser';assert(host&&port);
const env=await initializeTestEnvironment({projectId,firestore:{host,port:Number(port),rules:fs.readFileSync('firestore.rules','utf8')}});
assert.equal(host,'127.0.0.1');await env.clearFirestore();
const root=process.cwd(),imports={};for(const name of ['@firebase/app','@firebase/firestore','@firebase/util','@firebase/component','@firebase/logger','idb','re2js']){const p=JSON.parse(fs.readFileSync('node_modules/'+name+'/package.json'));imports[name]='/vendor/'+name+'/'+p.module.replace(/^\.\//,'');}
for(const n of ['bloom','webchannel'])imports['@firebase/webchannel-wrapper/'+n+'-blob']='/vendor/@firebase/webchannel-wrapper/dist/'+n+'-blob/esm/'+n+'_blob_es2018.js';
const html=fs.readFileSync('index.html','utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<link\b[^>]*https:[^>]*>/gi,'').replace('</head>','<script type="importmap">'+JSON.stringify({imports})+'</script></head>');
const server=http.createServer((req,res)=>{const u=new URL(req.url,'http://localhost');if(u.pathname==='/'){res.setHeader('content-type','text/html');res.end(html);return;}const vendor=u.pathname.startsWith('/vendor/'),base=vendor?path.resolve(root,'node_modules'):root,file=path.resolve(base,'.'+(vendor?u.pathname.slice(7):u.pathname));if(!file.startsWith(base+path.sep)){res.writeHead(403);res.end();return;}try{res.setHeader('content-type',/\.[cm]?js$/.test(file)?'text/javascript':file.endsWith('.css')?'text/css':'application/octet-stream');res.end(fs.readFileSync(file))}catch{res.writeHead(404);res.end()}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
let browser;const results=[],errors=[];
async function startPage(context,branch='CS1',resetDate=true){
 const page=await context.newPage();page.setDefaultTimeout(20000);page.on('pageerror',e=>{errors.push(e.message);console.error('PAGE_ERROR',e.message)});page.on('dialog',d=>d.accept());
 await page.goto(origin,{waitUntil:'domcontentloaded'});await setup(page,branch);return page;
}
async function setup(page,branch){
 await page.addStyleTag({content:'.app-container{display:block!important}#loginOverlay{display:none!important}.tab-content{display:none!important}#tab_attendance{display:block!important}'});
 await page.evaluate(async({projectId,port,branch})=>{
  const app=await import('@firebase/app'),s=await import('@firebase/firestore'),club='browser-'+branch;
  const a=app.initializeApp({projectId,apiKey:'demo',appId:'demo'},club+'-'+crypto.randomUUID());const db=s.initializeFirestore(a,{experimentalForceLongPolling:true});s.connectFirestoreEmulator(db,'127.0.0.1',port,{mockUserToken:{sub:club,user_id:club}});
  const p=await import('/js/data/studentProfileStore.js'),registry=await import('/js/utils/listeners.js'),owner=await import('/js/listeners/profiles.listeners.js');
  window.__store={db,clubId:club,currentClubId:club,userRole:'coach',coachBranch:branch,currentUser:{uid:club},profiles:{},clubConfig:{branchCount:2},clubData:{}};
  window.userRole='coach';window.coachBranch=branch;window.currentClubId=club;window.__verifiedAuthContextState={ready:true,uid:club,clubId:club,role:'coach',coachBranch:branch,generation:1};
  window.__staging={db,s,owner,p,registry,commits:[],notices:[],issues:[],attempts:0,reads:0,hook:null};
  window._fb_init={...s,runTransaction:async(db,fn,options)=>{
   const t=window.__staging,n=++t.attempts;await t.hook?.('before',n);
   let count=0;const result=await s.runTransaction(db,tx=>fn({get(...a){t.reads++;return tx.get(...a)},set(...a){count++;tx.set(...a)}}),options);
   t.commits.push(count);await t.hook?.('after',n);return result;
  }};
  window.showToast=t=>window.__staging.notices.push(String(t));window.recordRuntimeError=(...a)=>window.__staging.issues.push(String(a[0]));window.getLocalToday=()=> '2026-10-20';window.getBranchNameDisplay=x=>x;window.confirm=()=>true;
  window.studentProfileStore=p.studentProfileStore;window.__profileScaleMetrics={};window.getProfileScaleMetrics=p.getProfileScaleMetrics;window.getProfilesListenerMetrics=owner.getProfilesListenerMetrics;window._syncAllProfilesLegacy=()=>{window.__store.profiles=p.getAllProfilesCompat()};
  window.hasListener=registry.hasListener;window.removeListener=registry.removeListener;window.safeRegisterSnapshot=registry.safeRegisterSnapshot;window.markListenerSnapshot=registry.markListenerSnapshot;window.getAppContext=()=>({});window.invalidateLists=()=>{};window.invalidateByDomain=()=>{};window.invalidateDashboard=()=>{};
  await import('/js/core/branchIdentity.js');await import('/js/core/roleReadBoundary.js');window.RoleReadBoundary.setContext({role:'coach',clubId:club,coachBranch:branch});(await import('/js/core/globalOwnershipRegistry.js')).initGlobalOwnershipRegistry();
  document.getElementById('tab_attendance').classList.add('active');document.getElementById('att_sub_month').style.display='none';document.getElementById('att_date').value='2026-10-20';document.getElementById('att_belt').value='all';document.getElementById('chk_show_all_att').checked=true;
  const module=await import('/js/modules/attendance.js');window.__staging.api=module.initAttendance();
  window.__staging.journal=(await import('/js/data/attendanceJournal.js')).AttendanceJournal;
  await window.__staging.api.ensureShiftsLoaded({force:true});
  owner.mountActiveProfilesListener({clubId:club,role:'coach',coachBranch:branch,db,profRef:s.collection(db,'clubs',club,'profiles')});
 },{projectId,port:Number(port),branch});
 await page.waitForFunction(()=>window.getProfilesListenerMetrics?.().coachRosterReadiness==='verified');
 await page.evaluate(async()=>{document.getElementById('att_shift').value='S1';await window.__staging.api.requestDailyRefresh('v11-browser',{force:true});});
 await page.waitForSelector('#att_card_0');
}
async function untilPage(page,fn,arg,options={}){const deadline=Date.now()+(options.timeout||25000);while(Date.now()<deadline){if(await page.evaluate(fn,arg))return;await new Promise(r=>setTimeout(r,50));}throw Error('Timed out waiting for browser state: '+String(fn));}
const pending=page=>page.evaluate(async()=>{const t=window.__staging;return (await t.journal.list(window.__verifiedAuthContextState)).filter(x=>['pending','inflight'].includes(x.state)).length;});
async function drained(page){await untilPage(page,async()=>!(await window.__staging.journal.list(window.__verifiedAuthContextState)).some(x=>['pending','inflight'].includes(x.state)),{},{timeout:25000});}
async function check(name,fn){await fn();results.push({name,status:'PASS'});console.log('PASS',name)}
try{
 await env.withSecurityRulesDisabled(async c=>{const db=c.firestore(),b=sdk.writeBatch(db);for(const branch of ['CS1','CS2']){const club='browser-'+branch;b.set(sdk.doc(db,'users',club),{role:'coach',branch,clubId:club,status:'active'});b.set(sdk.doc(db,'clubs',club),{clubName:'QA'});b.set(sdk.doc(db,'clubs',club,'coaches',club),{role:'coach',branch,clubId:club,status:'active'});b.set(sdk.doc(db,'clubs',club,'settings','main_config'),{branchCount:2});b.set(sdk.doc(db,'clubs',club,'settings','shifts'),{list:[{id:'S1',name:'Ca chiều',timeStart:'17:30',timeEnd:'19:00'}]});for(let i=0;i<36;i++)b.set(sdk.doc(db,'clubs',club,'profiles','VDV'+i),{branch:branch==='CS1'&&i%2?'Mặc định':branch,status:'active',displayName:'VĐV thử nghiệm '+i,trainingDays:[],belt:'Trắng',totalSessionsAttended:999,consecutiveAbsences:99});}await b.commit();});
 browser=await pw.chromium.launch({headless:true,executablePath:browserExecutable(),args:['--no-sandbox']});
 for(const device of ['Pixel 7','iPhone 13'])for(const branch of ['CS1','CS2']){
  await env.withSecurityRulesDisabled(async c=>{const db=c.firestore(),rows=await sdk.getDocs(sdk.collection(db,'clubs','browser-'+branch,'attendance')),b=sdk.writeBatch(db);rows.forEach(d=>b.delete(d.ref));await b.commit();});
  const context=await browser.newContext({...pw.devices[device],defaultBrowserType:undefined});let transportBlocked=false;
  await context.route('**/*',route=>{const u=new URL(route.request().url());return u.hostname!=='127.0.0.1'||transportBlocked&&u.port===port?route.abort('internetdisconnected'):route.continue()});
  const page=await startPage(context,branch);
  await check(device+' '+branch+': roster verified, stale members stats not presented',async()=>{assert.equal(await page.locator('#attendanceGrid > div[id^="att_card_"]').count(),36);assert(!await page.locator('#attendanceGrid').innerHTML().then(x=>x.includes('Nghỉ 99')||x.includes('999/')));});
  await check(device+' '+branch+': single and bulk use one transaction owner, chunks <=10',async()=>{
   await page.locator('#att_card_0').tap({position:{x:20,y:60}});
   await untilPage(page,async()=>(await window.__staging.journal.list(window.__verifiedAuthContextState)).length>=1);await drained(page);
   await page.locator('#att_bulk_btn').tap();
   await untilPage(page,async()=>(await window.__staging.journal.list(window.__verifiedAuthContextState)).length>=36);await drained(page);
   const state=await page.evaluate(async()=>({commits:window.__staging.commits,notices:window.__staging.notices,dailyLoads:window.__attendanceDebug.dailyNetworkLoads,daily:window.__staging.api.getDailyState(),rows:(await window.__staging.journal.list(window.__verifiedAuthContextState)).map(x=>({id:x.id,state:x.state,base:x.baseVersion,principal:x.principal})),auth:window.__verifiedAuthContextState,issues:window.__staging.issues}));assert.equal(state.commits.reduce((a,b)=>a+b,0),36);assert.equal(state.dailyLoads,1,'ACK must not add a full-day query per click');assert(state.commits.every(n=>n<=10));assert(!state.notices.some(x=>x.includes('chưa được xác minh cho tài khoản')));
  });
  await check(device+' '+branch+': offline present/absent/delete intents persist and sync in order',async()=>{
   await context.setOffline(true);await page.locator('#att_card_0').tap({position:{x:20,y:60}});await untilPage(page,async()=>(await window.__staging.journal.list(window.__verifiedAuthContextState)).some(x=>x.state==='pending'));
   assert.equal(await pending(page),1);await page.screenshot({path:path.join(out,device.replaceAll(' ','-')+'-'+branch+'-offline.png'),fullPage:false});
   await context.setOffline(false);await page.evaluate(()=>window.syncOfflineAttendance());await drained(page);
   assert.equal(await page.evaluate(()=>Object.values(window.currentAttendanceData).filter(x=>x===2).length),1);
   await page.evaluate(()=>window.toggleAttendance(0));await drained(page); // excused
   await page.evaluate(()=>window.toggleAttendance(0));await drained(page); // tombstone
   assert.equal(await page.evaluate(()=>Object.values(window.currentAttendanceData).filter(x=>x===0).length),1);
  });
  await check(device+' '+branch+': Firestore transport blocked while navigator.onLine=true retains journal',async()=>{
   transportBlocked=true;assert.equal(await page.evaluate(()=>navigator.onLine),true);
   await page.evaluate(()=>window.toggleAttendance(0));assert.equal(await pending(page),1);
   assert.equal(await page.evaluate(()=>window.currentAttendanceData[Object.keys(window.currentAttendanceData)[0]]),1);
   transportBlocked=false;await page.evaluate(()=>window.syncOfflineAttendance());await drained(page);
  });
  await check(device+' '+branch+': lost ACK keeps intent; retry does no duplicate mutation',async()=>{
   await page.evaluate(()=>{const t=window.__staging;t.ackLost=false;t.hook=stage=>{if(stage==='after'&&!t.ackLost){t.ackLost=true;throw Object.assign(Error('ACK lost'),{code:'unavailable'})}}});
   await page.evaluate(()=>window.toggleAttendance(0));assert.equal(await pending(page),1);
   await page.evaluate(()=>{window.__staging.hook=null;return window.syncOfflineAttendance()});await drained(page);
   assert.equal(await page.evaluate(()=>window.__staging.commits.at(-1)),0);
  });
  await check(device+' '+branch+': secondary stats derive from canonical history; no members write',async()=>{
   await page.evaluate(()=>window.showAttMemberHistory(0));assert(await page.locator('#attHistBody').textContent().then(x=>x.includes('Quý 4/2026')));
   await page.locator('#attHistModal').evaluate(el=>el.style.display='none');
   const issues=await page.evaluate(()=>window.__staging.issues);assert(!issues.some(x=>x.includes('member-stats')));
  });
  if(device==='Pixel 7'&&branch==='CS1'){
   await check('Native IndexedDB: two tabs concurrent enqueue and stale ACK preserve newer intent',async()=>{
    const second=await startPage(context,branch);
    // Native transactions in two pages race on the same origin/database.
    const enqueue=async(page,status)=>page.evaluate(async status=>{
     const t=window.__staging,scope=window.__verifiedAuthContextState,rec={version:3,clubId:scope.clubId,name:'RACE',profileId:'RACE',docId:'RACE_2026-10-22',date:'2026-10-22',month:'2026-10',branch:'CS1',status,operation:'set',shiftId:'',shiftMode:'legacy-no-shift',baseVersion:'absent'};
     return (await t.journal.enqueue([rec],scope))[0];
    },status);
    const [a,b]=await Promise.all([enqueue(page,1),enqueue(second,2)]);assert.notEqual(a.id,b.id);
    const first=a.sequence<b.sequence?a:b,newer=a.sequence<b.sequence?b:a;
    const claim=await page.evaluate(async()=>window.__staging.journal.claim(window.__verifiedAuthContextState,'tab-A',10));assert.equal(claim.length,1);assert.equal(claim[0].id,first.id);
    await second.evaluate(async claims=>window.__staging.journal.acknowledge(claims,[claims[0].id]),claim);
    await page.evaluate(async claims=>window.__staging.journal.acknowledge(claims,[claims[0].id]),claim); // stale ACK is harmless
    let rows=await second.evaluate(()=>window.__staging.journal.list(window.__verifiedAuthContextState));assert.equal(rows.find(r=>r.id===newer.id).state,'pending');
    const next=await second.evaluate(()=>window.__staging.journal.claim(window.__verifiedAuthContextState,'tab-B',10));assert.equal(next[0].id,newer.id);assert.equal(next[0].baseVersion,first.id);
    await second.evaluate(async claims=>window.__staging.journal.release(claims,{code:'unavailable'}),next);
    // Resolve synthetic rows explicitly; they are not valid server profiles.
    await second.evaluate(async ids=>{for(const id of ids)await window.__staging.journal.keepServer(id,window.__verifiedAuthContextState)},[newer.id]);
    await second.close();
   });
   await check('Native IndexedDB: expired lease recovered, stale claim cannot ACK a newer claim',async()=>{
    const result=await page.evaluate(async()=>{
     const j=window.__staging.journal,scope=window.__verifiedAuthContextState,record={clubId:scope.clubId,name:'LEASE',profileId:'LEASE',docId:'LEASE_2026-10-23',date:'2026-10-23',month:'2026-10',branch:'CS1',status:1,shiftId:'',shiftMode:'legacy-no-shift',baseVersion:'absent'};
     const [r]=await j.enqueue([record],scope),first=await j.claim(scope,'old',10,100),second=await j.claim(scope,'new',10,60200);
     const stale=await j.acknowledge(first,[r.id]),ack=await j.acknowledge(second,[r.id]);return {stale,ack,id:r.id};
    });assert.equal(result.stale,0);assert.equal(result.ack,1);
   });
   await check('Legacy V1/V2 input: no automatic replay or removeItem across tabs',async()=>{
    const second=await startPage(context,branch);
    const key='offline_att_browser-CS1_2026-10-24';
    const raw=status=>JSON.stringify({clubId:'browser-CS1',date:'2026-10-24',records:{x:{name:'VDV0',profileId:'VDV0',date:'2026-10-24',month:'2026-10',branch:'CS1',status}}});
    await page.evaluate(({key,raw})=>localStorage.setItem(key,raw),{key,raw:raw(1)});
    await page.evaluate(()=>window.__staging.journal.importLegacy(window.__verifiedAuthContextState));
    await second.evaluate(({key,raw})=>localStorage.setItem(key,raw),{key,raw:raw(2)});
    await page.evaluate(()=>window.syncOfflineAttendance());assert.equal(await second.evaluate(key=>localStorage.getItem(key),key),raw(2));
    const summary=await second.evaluate(()=>window.__staging.journal.legacyReviewSummary(window.__verifiedAuthContextState));assert.equal(summary.count,2);const rows=await second.evaluate(()=>window.__staging.journal.list(window.__verifiedAuthContextState));assert(rows.every(x=>!x.legacySource),'legacy payload must be outside owned V3 list');
    await second.close();
   });
   await check('Persistent journal survives reload while Firestore unavailable; review UI retains legacy',async()=>{
    // Offline queue with verified roster, reload with server available to bootstrap,
    // then verify the pending UUID is preserved before an explicit sync.
    await context.setOffline(true);await page.evaluate(()=>window.toggleAttendance(0));
    const before=await page.evaluate(async()=>(await window.__staging.journal.list(window.__verifiedAuthContextState)).filter(x=>x.state==='pending').map(x=>x.id));assert(before.length);
    transportBlocked=true;await context.setOffline(false);
    // New page can read the same native database without requiring Firestore proof.
    const reload=await context.newPage();await reload.goto(origin,{waitUntil:'domcontentloaded'});
    const after=await reload.evaluate(async scope=>{window.__verifiedAuthContextState={...scope};window.userRole=scope.role;window.coachBranch=scope.coachBranch;window.currentClubId=scope.clubId;window.__store={clubId:scope.clubId,currentClubId:scope.clubId,userRole:scope.role,coachBranch:scope.coachBranch,currentUser:{uid:scope.uid}};return (await (await import('/js/data/attendanceJournal.js')).AttendanceJournal.list(scope)).map(x=>x.id)},{...await page.evaluate(()=>window.__verifiedAuthContextState)});
    assert(before.every(id=>after.includes(id)));await reload.close();transportBlocked=false;
    // Resume the actual SPA after proving native-IDB persistence above. A
    // restored route alone is not proof that an old SDK watch has recovered.
    await page.reload({waitUntil:'domcontentloaded'});await setup(page,branch);
    await page.evaluate(()=>window.syncOfflineAttendance());await drained(page);
    await page.evaluate(()=>window.__staging.api.openPendingReview());assert(await page.locator('#attendanceReviewSheet [data-legacy-review]').textContent().then(x=>x.includes('xác minh chủ dữ liệu')));assert.equal(await page.locator('#attendanceReviewSheet section').count(),0,'orphans have no mutable action row');await page.screenshot({path:path.join(out,'two-tab-review.png')});await page.locator('#attendanceReviewSheet').evaluate(el=>el.remove());
   });
  }
  await page.screenshot({path:path.join(out,device.replaceAll(' ','-')+'-'+branch+'-complete.png')});await context.close();
 }
 assert.deepEqual(errors,[]);
}finally{
 fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({environment:'actual Chromium tabs + native IndexedDB + Emulator + actual DOM/owners',physicalPhone:false,Safari:false,results,errors},null,2));
 await browser?.close();await env.cleanup();await new Promise(r=>server.close(r));
}
console.log('V11 BROWSER PASS',results.length);
