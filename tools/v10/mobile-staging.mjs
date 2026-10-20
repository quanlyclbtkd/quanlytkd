// Actual HTML, roster owner, Attendance module/service and real Emulator SDK.
// Device descriptors emulate touch/viewport; this is not a physical phone.
import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
import {initializeTestEnvironment} from '@firebase/rules-unit-testing';import * as sdk from 'firebase/firestore';
const root=process.cwd(),out=path.resolve(process.env.V10_MOBILE_OUTPUT||'../../evidence/mobile-staging');fs.mkdirSync(out,{recursive:true});
const require=createRequire(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/../package.json'),pw=require('playwright');
const host=process.env.FIRESTORE_EMULATOR_HOST;assert.match(host||'',/^127\.0\.0\.1:\d+$/);const [hostname,port]=host.split(':');
const projectId='demo-mobile-coach-v10',env=await initializeTestEnvironment({projectId,firestore:{host:hostname,port:Number(port),rules:fs.readFileSync('firestore.rules','utf8')}});
const imports={};for(const name of ['@firebase/app','@firebase/firestore','@firebase/util','@firebase/component','@firebase/logger','idb','re2js']){const p=JSON.parse(fs.readFileSync('node_modules/'+name+'/package.json'));imports[name]='/vendor/'+name+'/'+p.module.replace(/^\.\//,'');}
for(const n of ['bloom','webchannel'])imports['@firebase/webchannel-wrapper/'+n+'-blob']='/vendor/@firebase/webchannel-wrapper/dist/'+n+'-blob/esm/'+n+'_blob_es2018.js';
const html=fs.readFileSync('index.html','utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<link\b[^>]*https:[^>]*>/gi,'').replace('</head>','<script type="importmap">'+JSON.stringify({imports})+'</script></head>');
const server=http.createServer((req,res)=>{const u=new URL(req.url,'http://localhost');if(u.pathname==='/'){res.setHeader('content-type','text/html');res.end(html);return;}const isVendor=u.pathname.startsWith('/vendor/'),base=isVendor?path.resolve(root,'node_modules'):root,file=path.resolve(base,'.'+(isVendor?u.pathname.slice(7):u.pathname));if(!file.startsWith(base+path.sep)){res.writeHead(403);res.end();return;}try{res.setHeader('content-type',/\.[cm]?js$/.test(file)?'text/javascript':file.endsWith('.css')?'text/css':'application/octet-stream');res.end(fs.readFileSync(file));}catch(e){res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
let browser;const results=[],errors=[];
try{
  await env.withSecurityRulesDisabled(async c=>{const db=c.firestore(),batch=sdk.writeBatch(db);for(const branch of ['CS1','CS2']){const club='mobile-'+branch;batch.set(sdk.doc(db,'users',club),{role:'coach',branch,clubId:club,status:'active'});batch.set(sdk.doc(db,'clubs',club,'settings','shifts'),{list:[{id:'S1',name:'Ca chiều',timeStart:'17:30',timeEnd:'19:00'}]});for(let i=0;i<36;i++)batch.set(sdk.doc(db,'clubs',club,'profiles','VDV'+i),{branch:branch==='CS1'&&i%2?'Mặc định':branch,status:'active',displayName:'VĐV thử nghiệm '+i,admissionDate:'2026-01-01',trainingDays:[],belt:'Trắng'});}await batch.commit();});
  browser=await pw.chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,args:['--no-sandbox']});
  for(const deviceName of ['Pixel 7','iPhone 13'])for(const branch of ['CS1','CS2']){
    await env.withSecurityRulesDisabled(async c=>{const db=c.firestore(),rows=await sdk.getDocs(sdk.collection(db,'clubs','mobile-'+branch,'attendance')),batch=sdk.writeBatch(db);rows.forEach(d=>batch.delete(d.ref));await batch.commit();});
    const context=await browser.newContext({...pw.devices[deviceName],defaultBrowserType:undefined});const page=await context.newPage();
    await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
    page.on('pageerror',e=>{errors.push({deviceName,branch,message:e.message});console.error('BROWSER_ERROR',e.message)});page.on('dialog',d=>d.accept());
    page.on('console',msg=>{if(msg.type()==='error')console.error('BROWSER_CONSOLE',msg.text().slice(0,220));});
    page.setDefaultTimeout(20000);page.setDefaultNavigationTimeout(20000);
    await page.goto(origin,{waitUntil:'domcontentloaded'});await page.addStyleTag({content:'.app-container{display:block!important}#loginOverlay{display:none!important}.tab-content{display:none!important}#tab_attendance{display:block!important}'});
    console.log('STAGING_PAGE_READY',deviceName,branch);
    await page.evaluate(async({projectId,port,branch})=>{
      const app=await import('@firebase/app'),s=await import('@firebase/firestore'),club='mobile-'+branch;
      console.log('SDK_IMPORTED');
      const firebaseApp=app.initializeApp({projectId,apiKey:'demo',appId:'demo'},club+Date.now());const db=s.initializeFirestore(firebaseApp,{experimentalForceLongPolling:true});s.connectFirestoreEmulator(db,'127.0.0.1',port,{mockUserToken:{sub:club,user_id:club}});
      const p=await import('/js/data/studentProfileStore.js'),registry=await import('/js/utils/listeners.js'),owner=await import('/js/listeners/profiles.listeners.js?v=coach-roster-context-v10-20261020');
      window.__store={db,clubId:club,currentClubId:club,userRole:'coach',coachBranch:branch,currentUser:{uid:club},profiles:{},clubConfig:{branchCount:2},clubData:{}};window.userRole='coach';window.coachBranch=branch;window.currentClubId=club;window.__verifiedAuthContextState={ready:true,uid:club,clubId:club,role:'coach',coachBranch:branch,generation:1};
      const commits=[];window.__staging={db,s,owner,p,registry,commits,notices:[],secondary:[]};window._fb_init={...s,writeBatch(db){const b=s.writeBatch(db);let n=0;return{set(...a){n++;b.set(...a)},delete(...a){n++;b.delete(...a)},async commit(){await b.commit();commits.push(n)}}}};
      window.showToast=t=>window.__staging.notices.push(String(t));window.recordRuntimeError=(...a)=>window.__staging.secondary.push(String(a[0]));window.getLocalToday=()=> '2026-10-20';window.getBranchNameDisplay=x=>x;window.confirm=()=>true;
      window.studentProfileStore=p.studentProfileStore;window.__profileScaleMetrics={};window.getProfileScaleMetrics=p.getProfileScaleMetrics;window.getProfilesListenerMetrics=owner.getProfilesListenerMetrics;window._syncAllProfilesLegacy=()=>{window.__store.profiles=p.getAllProfilesCompat()};
      window.hasListener=registry.hasListener;window.removeListener=registry.removeListener;window.safeRegisterSnapshot=registry.safeRegisterSnapshot;window.markListenerSnapshot=registry.markListenerSnapshot;window.getAppContext=()=>({});window.invalidateLists=()=>{};window.invalidateByDomain=()=>{};window.invalidateDashboard=()=>{};
      await import('/js/core/branchIdentity.js');await import('/js/core/roleReadBoundary.js');window.RoleReadBoundary.setContext({role:'coach',clubId:club,coachBranch:branch});
      (await import('/js/core/globalOwnershipRegistry.js')).initGlobalOwnershipRegistry();
      document.getElementById('tab_attendance').classList.add('active');document.getElementById('att_sub_month').style.display='none';document.getElementById('att_date').value='2026-10-20';document.getElementById('att_belt').value='all';document.getElementById('chk_show_all_att').checked=true;
      const a=await import('/js/modules/attendance.js');window.__staging.api=a.initAttendance();
      await Promise.race([window.__staging.api.ensureShiftsLoaded({force:true}),new Promise((_,reject)=>setTimeout(()=>reject(Error('STAGING_SHIFT_LOAD_TIMEOUT')),15000))]);
      owner.mountActiveProfilesListener({clubId:club,role:'coach',coachBranch:branch,db,profRef:s.collection(db,'clubs',club,'profiles')});
    },{projectId,port:Number(port),branch});
    console.log('STAGING_OWNERS_READY',deviceName,branch);
    await page.waitForFunction(()=>window.getProfilesListenerMetrics?.().coachRosterReadiness==='verified');
    await page.evaluate(async()=>{document.getElementById('att_shift').value='S1';await window.__staging.api.renderDailyFromRam('mobile-staging');});
    await page.waitForSelector('#att_card_0');assert.equal(await page.locator('#attendanceGrid > div[id^="att_card_"]').count(),36);
    // Tap the card body, away from the name's history action.
    await page.locator('#att_card_0').tap({position:{x:20,y:60}});
    await page.waitForFunction(()=>Object.values(window.currentAttendanceData).filter(x=>x===1).length===1);
    await page.locator('#att_bulk_btn').tap();await page.waitForFunction(()=>window.__staging.commits.reduce((a,b)=>a+b,0)>=35);
    // Real browser offline event and the existing V2 journal.
    await context.setOffline(true);
    await page.waitForFunction(()=>navigator.onLine===false);
    await page.locator('#att_card_0').tap({position:{x:20,y:60}});
    await page.waitForFunction(()=>Object.keys(localStorage).some(k=>k.startsWith('offline_att_v2_')));
    const pendingBefore=await page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('offline_att_')).length);assert.equal(pendingBefore,1);
    await context.setOffline(false);
    await page.evaluate(async()=>{await window.syncOfflineAttendance()});
    await page.waitForFunction(()=>!Object.keys(localStorage).some(k=>k.startsWith('offline_att_')));
    const result=await page.evaluate(async()=>{const t=window.__staging,club=window.__store.clubId,rows=await t.s.getDocs(t.s.query(t.s.collection(t.db,'clubs',club,'attendance'),t.s.where('branch','==',window.coachBranch)));return{rows:rows.size,statuses:rows.docs.map(d=>d.data().status),commitSizes:t.commits,roster:window.getProfilesListenerMetrics().coachRosterReadiness,notices:t.notices,secondary:t.secondary,pending:Object.keys(localStorage).filter(k=>k.startsWith('offline_att_')).length,shift:document.getElementById('att_shift').value};});
    assert.equal(result.rows,36);assert.equal(result.pending,0);assert.equal(result.shift,'S1');assert.equal(result.statuses.filter(x=>x===1).length,35);assert.equal(result.statuses.filter(x=>x===2).length,1);assert(!result.notices.some(t=>t.includes('chưa được xác minh')));
    await page.waitForFunction(()=>window.getProfilesListenerMetrics().coachRosterReadiness==='verified');
    await page.evaluate(async()=>{document.getElementById('att_date').value='2026-10-21';await window.__staging.api.requestDailyRefresh('staging-next-date',{force:true});});
    await context.setOffline(true);await page.waitForFunction(()=>navigator.onLine===false);
    await page.locator('#att_bulk_btn').tap();await page.waitForFunction(()=>Object.keys(localStorage).filter(k=>k.startsWith('offline_att_')).length===36);
    await context.setOffline(false);await page.evaluate(async()=>{await window.syncOfflineAttendance()});
    await page.waitForFunction(()=>!Object.keys(localStorage).some(k=>k.startsWith('offline_att_')));
    const bulkOffline=await page.evaluate(async()=>{const t=window.__staging,rows=await t.s.getDocs(t.s.query(t.s.collection(t.db,'clubs',window.__store.clubId,'attendance'),t.s.where('branch','==',window.coachBranch),t.s.where('date','==','2026-10-21')));return {rows:rows.size,allPresent:rows.docs.every(d=>d.data().status===1),pending:Object.keys(localStorage).filter(k=>k.startsWith('offline_att_')).length,commitSizes:t.commits.slice(-4)};});
    assert.equal(bulkOffline.rows,36);assert.equal(bulkOffline.allPresent,true);assert.deepEqual(bulkOffline.commitSizes,[10,10,10,6]);result.bulkOffline=bulkOffline;
    results.push({deviceDescriptor:deviceName,browser:'Chromium',physicalDevice:false,branch,pendingBefore,status:'PASS',...result});console.log('PASS MOBILE',deviceName,branch);
    await page.evaluate(async()=>{window.__staging.owner.resetProfilesListeners('done');window.__staging.registry.cleanupAllListeners('done');await window.__staging.s.terminate(window.__staging.db)});await context.close();
  }
  assert.deepEqual(errors,[]);
}finally{fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({environment:'local isolated staging, actual DOM/modules, synthetic authenticated principal, Firestore Emulator',physicalPhone:'NOT_AVAILABLE',results,errors},null,2));await browser?.close();await env.cleanup();await new Promise(r=>server.close(r));}
console.log('V10 MOBILE STAGING',results.length,'PASS');
