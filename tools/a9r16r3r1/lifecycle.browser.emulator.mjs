// Review adds post-bootstrap lifecycle assertions to the existing actual-app SDK10 Emulator harness; runtime and fixture contracts unchanged.
// Full production HTML + unmodified app/main assets, actual SDK10 + local Rules.
// Only CDN delivery and Auth provider transport are substituted for isolated QA.
import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import zlib from 'node:zlib';import crypto from 'node:crypto';import assert from 'node:assert/strict';
import {initializeTestEnvironment} from '@firebase/rules-unit-testing';import * as sdk from 'firebase/firestore';
import {loadPlaywright,browserExecutable} from '../test-runtime.mjs';
import {inventory} from '../a9r16/module-identity.mjs';
const canonicalProbeURLs=Object.fromEntries(inventory().map(row=>{assert.equal(row.identities.length,1,'Probe requires one canonical URL: '+row.physicalPath);return[row.physicalPath,row.identities[0].url]}));
const root=path.resolve(process.env.A9R16_SOURCE_ROOT||process.cwd()),out=path.resolve(process.env.A9R16_EVIDENCE_ROOT||'evidence/A9R16/performance');fs.mkdirSync(out,{recursive:true});
const runs=Number(process.env.A9R16_RUNS||5),roles=(process.env.A9R16_ROLES||'coach,admin,super_admin').split(','),profiles=(process.env.A9R16_NETWORKS||'fast,moderate').split(',');
assert(runs>=1);const endpoint=process.env.FIRESTORE_EMULATOR_HOST;assert.match(endpoint||'',/^127\.0\.0\.1:\d+$/);
const [host,portText]=endpoint.split(':'),port=Number(portText),projectId='demo-a9r16-performance',club='PERF_CLUB',count=1500;
const rules=fs.readFileSync(path.join(root,'firestore.rules'),'utf8');
const env=await initializeTestEnvironment({projectId,firestore:{host,port,rules}});
const fixture={projectId,clubId:club,profiles:count,branchProfiles:750,allowedBranches:['CS1','CS2'],activeBranch:'CS1',coachUid:'coach',adminUid:'admin',superAdminUid:'super',firstShift:'S1',historyAuthority:'attendance-history-1aedda93-9437-4132-9694-35c2e6234d55'};
const authModule=`const auth={currentUser:null},secondary={currentUser:null},listeners=new Set();
export const getAuth=(app)=>app&&app.name==='SecondaryApp'?secondary:auth;
export function onAuthStateChanged(a,fn){listeners.add(fn);setTimeout(()=>{if(!auth.currentUser){auth.currentUser={uid:window.__QA.uid,email:'qa@example.invalid',getIdToken:async()=>''};window.markLoginPerf?.('loginStart');}fn(auth.currentUser)},0);return()=>listeners.delete(fn);}
export async function signInWithEmailAndPassword(){for(const f of listeners)f(auth.currentUser);return {user:auth.currentUser};}
export async function signOut(){auth.currentUser=null;for(const f of listeners)f(null);}
export const createUserWithEmailAndPassword=async()=>{throw Error('QA Auth create is disabled')};
export const sendPasswordResetEmail=async()=>{};export const updatePassword=async()=>{};export const reauthenticateWithCredential=async()=>{};export const signInAnonymously=async()=>({user:auth.currentUser});export const EmailAuthProvider={credential:()=>({})};`;
const sdkApp=`import * as sdk from '/__qa/vendor/firebase-app.js';export * from '/__qa/vendor/firebase-app.js';export const initializeApp=(config,name)=>sdk.initializeApp({...config,projectId:${JSON.stringify(projectId)}},name);`;
const sdkFirestore=`import * as sdk from '/__qa/vendor/firebase-firestore.js';export * from '/__qa/vendor/firebase-firestore.js';const dbs=new WeakMap();
export function getFirestore(app){if(dbs.has(app))return dbs.get(app);const db=sdk.initializeFirestore(app,{useFetchStreams:${!!process.env.A9R16_QA_FETCH_STREAMS}});${process.env.A9R16_DIAGNOSTIC_STREAM ? "sdk.setLogLevel('debug');" : ''}sdk.connectFirestoreEmulator(db,'127.0.0.1',${port},{mockUserToken:{sub:window.__QA.uid,user_id:window.__QA.uid}});dbs.set(app,db);return db;}
const size=s=>typeof s.size==='number'?s.size:s.exists()?1:0;
export async function getDoc(...args){window.__QA.reads.getDoc++;const s=await sdk.getDoc(...args);window.__QA.reads.documents+=size(s);return s;}
export async function getDocs(...args){window.__QA.reads.getDocs++;const s=await sdk.getDocs(...args);window.__QA.reads.documents+=size(s);return s;}
export function onSnapshot(...args){window.__QA.reads.onSnapshot++;window.__QA.reads.activeListeners++;const event={path:args[0]?.path||args[0]?._query?.path?.canonicalString?.(),queryShape:{limit:args[0]?._query?.limit??null,filters:args[0]?._query?.filters?.map(x=>({field:x.field?.canonicalString?.(),op:x.op,value:x.value})),databaseId:args[0]?.firestore?._databaseId?.projectId},snapshots:[],stack:new Error().stack.slice(0,1200)};window.__QA.subscriptions.push(event);let at=args.findIndex(x=>typeof x==='function');if(at>=0){const cb=args[at];args[at]=s=>{window.__QA.reads.snapshotDocuments+=size(s);event.snapshots.push({size:size(s),fromCache:s.metadata.fromCache,pending:s.metadata.hasPendingWrites,first:s.docs?.[0]?.id,last:s.docs?.at(-1)?.id});return cb(s)}}const un=sdk.onSnapshot(...args);let active=true;return()=>{if(active){active=false;window.__QA.reads.activeListeners--;}un()};}`;
const cache=new Map();
const server=http.createServer((req,res)=>{
 const u=new URL(req.url,'http://qa');let content,type='text/javascript';
 try{
  if(u.pathname==='/'&&u.searchParams.has('sdkonly')){content='<!doctype html><html><body>SDK transport probe</body></html>';type='text/html';}
  else if(u.pathname==='/'){content=fs.readFileSync(path.join(root,'index.html'),'utf8').replaceAll('https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js','/__qa/app.js').replaceAll('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js','/__qa/firestore.js').replaceAll('https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js','/__qa/auth.js');type='text/html';}
  else if(u.pathname==='/__qa/app.js')content=sdkApp;
  else if(u.pathname==='/__qa/firestore.js')content=sdkFirestore;
  else if(u.pathname==='/__qa/auth.js')content=authModule;
  else if(u.pathname.startsWith('/__qa/vendor/')){const name=path.basename(u.pathname);content=fs.readFileSync(path.join(root,'tools/a9r13/vendor/firebase-10.7.1',name),'utf8').replaceAll('https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js','/__qa/vendor/firebase-app.js');}
  else {const file=path.resolve(root,'.'+u.pathname);if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}content=fs.readFileSync(file);type=file.endsWith('.css')?'text/css':file.endsWith('.png')?'image/png':file.endsWith('.json')?'application/json':'text/javascript';}
  if(process.env.A9R16_MODULE_IDENTITY_PROBE&&['/js/utils/format.js','/js/services/inventory.service.js','/js/modules/students.js','/js/modules/finance.js'].includes(u.pathname))content=String(content)+'\nwindow.__QA.moduleEvaluations ||= {};window.__QA.moduleEvaluations['+JSON.stringify(u.pathname)+']=(window.__QA.moduleEvaluations['+JSON.stringify(u.pathname)+']||0)+1;';
  const key=u.pathname+u.search;if(!cache.has(key))cache.set(key,zlib.gzipSync(content));const body=cache.get(key);
  if(!res.destroyed&&!res.writableEnded&&!res.headersSent)res.writeHead(200,{'Content-Type':type,'Content-Encoding':'gzip','Content-Length':body.length,'Cache-Control':u.pathname==='/'?'no-store':'public,max-age=3600'});res.end(body);
 }catch(error){if(!res.headersSent)res.writeHead(404);res.end('QA missing asset');}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
const pw=loadPlaywright(),browser=await pw.chromium.launch({headless:true,executablePath:browserExecutable(),args:['--no-sandbox']});
const results=[],lifecycleCases=[];
const recordLifecycle=(name,evidence,ok)=>{const item={name,evidence,classification:ok?'PASS':'FAIL_RUNTIME'};lifecycleCases.push(item);fs.writeFileSync(path.join(out,'LIFECYCLE.json'),JSON.stringify({classification:lifecycleCases.some(x=>x.classification!=='PASS')?'FAIL_RUNTIME':'PASS',cases:lifecycleCases},null,2));console.log('LIFECYCLE',JSON.stringify(item));};
try{
 await env.clearFirestore();await env.withSecurityRulesDisabled(async context=>{
  const db=context.firestore();let batch=sdk.writeBatch(db),n=0;const put=async(ref,data)=>{batch.set(ref,data);if(++n===450){await batch.commit();batch=sdk.writeBatch(db);n=0;}};
  const acl={role:'coach',clubId:club,status:'active',branch:'CS1',coachBranch:'CS1',primaryCoachBranch:'CS1',defaultBranch:'CS1',allowedBranches:['CS1','CS2'],assignmentVersion:'a9r16-fixture-assignment-v1'};
  await put(sdk.doc(db,'users','coach'),acl);await put(sdk.doc(db,'clubs',club,'coaches','coach'),acl);
  await put(sdk.doc(db,'users','admin'),{role:'admin',clubId:club,status:'active'});await put(sdk.doc(db,'users','super'),{role:'super_admin',clubId:'',status:'active'});await put(sdk.doc(db,'super_admins','super'),{active:true,status:'active',role:'super_admin'});
  await put(sdk.doc(db,'clubs',club),{clubName:'Synthetic Performance Club',expiryDate:'2030-12-31',accountStatus:'active',coachAclEpoch:1});
  await put(sdk.doc(db,'clubs',club,'settings','main_config'),{branchCount:2});await put(sdk.doc(db,'clubs',club,'settings','shifts'),{list:[{id:'S1',name:'Shift 1',branch:'CS1'},{id:'S2',name:'Shift 2',branch:'CS2'}]});
  for(let i=0;i<count;i++)await put(sdk.doc(db,'clubs',club,'profiles','P'+String(i).padStart(5,'0')),{profileId:'P'+String(i).padStart(5,'0'),displayName:'Synthetic Student '+i,status:'active',branch:i%2?'CS2':'CS1',trainingShiftId:i%2?'S2':'S1',trainingDays:[],belt:'Đai trắng',joinDate:'2025-01-01'});
  if(n)await batch.commit();
 });
 let storedCounts;await env.withSecurityRulesDisabled(async c=>{const q=await sdk.getDocs(sdk.collection(c.firestore(),'clubs',club,'profiles'));storedCounts={total:q.size,CS1:q.docs.filter(d=>d.data().branch==='CS1').length,CS2:q.docs.filter(d=>d.data().branch==='CS2').length,fromCache:q.metadata.fromCache};});assert.equal(storedCounts.total,1500);assert.equal(storedCounts.CS1,750);assert.equal(storedCounts.CS2,750);
 const seeded=await sdk.getDocs(sdk.query(sdk.collection(env.authenticatedContext('coach').firestore(),'clubs',club,'profiles'),sdk.where('branch','==','CS1')));assert.equal(seeded.size,750);fs.writeFileSync(path.join(out,'FIXTURE_PROOF.json'),JSON.stringify({totalProfiles:1500,storedCounts,coachBranchProfiles:seeded.size,serverVerified:seeded.metadata.fromCache===false,role:'coach',branch:'CS1'},null,2));
 if(process.env.A9R16_TRANSPORT_ONLY){
  const nodeStart=performance.now(),nodeRows=await sdk.getDocs(sdk.query(sdk.collection(env.authenticatedContext('coach').firestore(),'clubs',club,'profiles'),sdk.where('branch','==','CS1')));console.log('NODE_BRANCH_QUERY',nodeRows.size,performance.now()-nodeStart);
  for(const throttled of [false,true]){const context=await browser.newContext(),p=await context.newPage(),c=await context.newCDPSession(p);await context.addInitScript(()=>{window.__QA={uid:'coach',reads:{getDoc:0,getDocs:0,onSnapshot:0,documents:0,snapshotDocuments:0,activeListeners:0},subscriptions:[]}});
   if(throttled){await c.send('Network.enable');await c.send('Network.emulateNetworkConditions',{offline:false,latency:10,downloadThroughput:30e6/8,uploadThroughput:10e6/8});}
   await p.goto(origin+'?sdkonly=1');
   const probe=await p.evaluate(async({projectId,club})=>{const t=performance.now(),a=await import('/__qa/app.js'),f=await import('/__qa/firestore.js'),db=f.getFirestore(a.initializeApp({projectId,apiKey:'demo',appId:'demo'}));let un;const unClub=f.onSnapshot(f.doc(db,'clubs',club),()=>{}),unLegacy=f.onSnapshot(f.query(f.collection(db,'clubs',club,'profiles'),f.where('branch','==','Mặc định')),()=>{});f.addDoc(f.collection(db,'login_history'),{clubId:club,role:'coach'}).catch(()=>{});const response=await Promise.race([new Promise((resolve,reject)=>{un=f.onSnapshot(f.query(f.collection(db,'clubs',club,'profiles'),f.where('branch','==','CS1')),{includeMetadataChanges:true},s=>{if(!s.metadata.fromCache)resolve({rows:s.size,ms:performance.now()-t})},e=>reject(e))}),new Promise(resolve=>setTimeout(()=>resolve({timeout:true,ms:performance.now()-t}),45000))]);un?.();unClub();unLegacy();return {response,qa:window.__QA}}, {projectId,club});
   fs.writeFileSync(path.join(out,'TRANSPORT_'+throttled+'.json'),JSON.stringify({throttled,nodeRows:nodeRows.size,nodeMs:performance.now()-nodeStart,...probe},null,2));console.log('SDK10_TRANSPORT',throttled,JSON.stringify(probe.response));await context.close();
  }
 }
 else for(const role of roles)for(const network of profiles)for(let index=0;index<runs;index++){
  const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true});
  const page=await context.newPage(),cdp=await context.newCDPSession(page),errors=[],sdkStreamMessages=[];
  if(process.env.A9R16_DIAGNOSTIC_STREAM)page.on('console',async m=>{if(m.text().includes("stream")&&m.text().includes('received:'))sdkStreamMessages.push(await Promise.all(m.args().map(a=>a.jsonValue().catch(()=>null))));});
  page.on('pageerror',e=>errors.push({kind:'pageerror',message:e.message}));page.on('console',m=>{if(['error','warning','warn'].includes(m.type()))errors.push({kind:m.type(),message:m.text().slice(0,1500)});});
  const cpu=network==='moderate'?4:1,net=network==='moderate'?{offline:false,latency:120,downloadThroughput:1.6e6/8,uploadThroughput:.75e6/8}:{offline:false,latency:10,downloadThroughput:30e6/8,uploadThroughput:10e6/8};
  await cdp.send('Network.emulateNetworkConditions',net);await cdp.send('Emulation.setCPUThrottlingRate',{rate:cpu});await cdp.send('Network.enable');await cdp.send('Performance.enable');await cdp.send('Network.setBlockedURLs',{urls:['https://*']});
  await context.addInitScript(({uid})=>{
   window.__QA={uid,reads:{getDoc:0,getDocs:0,onSnapshot:0,documents:0,snapshotDocuments:0,activeListeners:0},tasks:[],observed:{},subscriptions:[]};
   try{new PerformanceObserver(list=>window.__QA.tasks.push(...list.getEntries().map(x=>({start:x.startTime,duration:x.duration,attribution:x.attribution.map(a=>({name:a.name,containerSrc:a.containerSrc}))})))).observe({type:'longtask',buffered:true});}catch{}
  },{uid:role==='super_admin'?'super':role});
  for(const mode of ['cold','warm']){
   const row={role,networkProfile:network,cpuSlowdown:cpu,network:net,networkDriver:'Chromium CDP native network throttling for assets and direct SDK10 WebChannel; no HTTP byte proxy',cacheMode:mode,run:index+1,fixtureSha256:crypto.createHash('sha256').update(JSON.stringify(fixture)).digest('hex'),authState:'Returning signed-in fixture; Auth provider transport port; actual app.js server authorization and real Rules',sourceRoot:path.basename(root)};
   try{
    if(mode==='cold')await page.goto(origin,{waitUntil:'domcontentloaded',timeout:60000});else await page.reload({waitUntil:'domcontentloaded',timeout:60000});
    await page.waitForFunction(role=>window.__verifiedAuthContextState?.ready===true&&window.__verifiedAuthContextState.role===role&&document.getElementById('mainApp')?.style.display!=='none',role,{timeout:30000});
    row.shellUsefulObservedAt=await page.evaluate(()=>performance.now());
    if(role==='coach'){
     await page.waitForFunction(()=>window.AttendanceModule&&Array.from(document.getElementById('att_shift')?.options||[]).some(x=>x.value==='S1'),{},{timeout:30000});
     row.explicitShiftSelectionAt=await page.evaluate(()=>performance.now());await page.selectOption('#att_shift','S1');
     await page.waitForFunction(()=>{const d=window.AttendanceModule?.getDailyState?.(),p=window.getProfilesListenerMetrics?.();return d?.cacheReady===true&&d.serverConfirmedContext&&d.inFlightKeys.length===0&&p?.coachRosterReadiness==='verified'&&p.activeProfileCount===750&&Object.keys(window.currentAttendanceData||{}).length===750;},{},{timeout:30000});
    }else if(role==='admin'){
     await page.waitForFunction(()=>{const p=window.getProfilesListenerMetrics?.();return p?.fullAuthorityComplete===true&&p?.authorityServerConfirmed===true&&window.__store?.transactionCoverage?.ready===true;},{},{timeout:30000});
    }else await page.waitForFunction(()=>window.__saDashboardLoadedAt>0,{},{timeout:30000});
    Object.assign(row,await page.evaluate(()=>({classification:'PASS',authoritativeReadyObservedAt:performance.now(),marks:window.__loginPerfMetrics,hydration:window.__dataHydrationMetrics,
      activeTab:document.querySelector('.tab-content.active')?.id,verifiedContext:{...window.__verifiedAuthContextState},reads:window.__QA.reads,moduleEvaluations:window.__QA.moduleEvaluations,
      subscriptions:window.__QA.subscriptions,canonicalProfiles:Object.keys(window.studentProfileStore?.getAllProfilesCompat?.()||window.__store?.profiles||{}).length,filteredRoster:Object.keys(window.currentAttendanceData||{}).length,renderedRows:document.querySelectorAll('#attendanceGrid [id^="att_card_"]').length,profileMetrics:window.getProfilesListenerMetrics?.(),attendance:window.AttendanceModule?.getDailyState?.(),domNodes:document.querySelectorAll('*').length,
      resources:performance.getEntriesByType('resource').map(x=>({url:x.name,type:x.initiatorType,startTime:x.startTime,duration:x.duration,transferSize:x.transferSize,encodedBodySize:x.encodedBodySize,decodedBodySize:x.decodedBodySize})),longTasks:window.__QA.tasks,mainLoaded:window.MAIN_JS_LOADED})));row.cdpMetrics=await cdp.send('Performance.getMetrics');row.errors=errors.slice();
   }catch(error){Object.assign(row,{classification:'ENV_BLOCKED',message:error.message,errors:errors.slice(),debug:await page.evaluate(()=>({fb:!!window._fb_init,app:window.__appLoaded,main:window.MAIN_JS_LOADED,mainFailed:window.__MAIN_JS_LOAD_FAILED,context:window.__verifiedAuthContextState,perf:window.__loginPerfMetrics,clubAccess:window.__clubAccessBootstrapState,shift:window.AttendanceModule?.getShiftAuthority?.(),daily:window.AttendanceModule?.getDailyState?.(),debug:window.__attendanceDebug,profiles:window.getProfilesListenerMetrics?.(),qa:window.__QA,listenerMetrics:window.getListenerMetrics?.(),store:{clubId:window.__store?.clubId,role:window.__store?.userRole,currentUser:window.__store?.currentUser?.uid,coachBranch:window.__store?.coachBranch},loginError:document.getElementById('loginError')?.textContent})).catch(()=>null)});}
   if(row.classification==='PASS'&&role==='coach')try{
    // Diagnostic query is deliberately AFTER timing/read counters were captured.
    // It uses the same authenticated SDK and branch predicate, never fixture data.
    row.browserDirect=await page.evaluate(async()=>{const s=await import('/__qa/firestore.js');const q=await Promise.race([s.getDocsFromServer(s.query(s.collection(window.__store.db,'clubs','PERF_CLUB','profiles'),s.where('branch','==','CS1'))),new Promise((_,reject)=>setTimeout(()=>reject(Error('Browser direct server query timed out')),10000))]);return {count:q.size,fromCache:q.metadata.fromCache,first:q.docs[0]?.id,last:q.docs.at(-1)?.id};});
    const nodeCheck=await sdk.getDocsFromServer(sdk.query(sdk.collection(env.authenticatedContext('coach').firestore(),'clubs',club,'profiles'),sdk.where('branch','==','CS1')));
    row.completeness={seeded:count,stored:storedCounts.total,nodeBranch:nodeCheck.size,browserDirect:row.browserDirect.count,listener:row.subscriptions.find(q=>q.path==='clubs/PERF_CLUB/profiles'&&q.queryShape.filters?.some(f=>f.field==='branch'&&f.value.stringValue==='CS1'))?.snapshots.at(-1)?.size,canonicalStore:row.canonicalProfiles,filteredRoster:row.filteredRoster,renderedRows:row.renderedRows};
    for(const k of ['nodeBranch','browserDirect','listener','canonicalStore','filteredRoster','renderedRows'])assert.equal(row.completeness[k],750,'Incomplete '+k);
   }catch(e){row.classification='ENV_BLOCKED';row.message=e.message;}
   if(process.env.A9R16_MODULE_IDENTITY_PROBE&&row.classification==='PASS'){await page.evaluate(async urls=>{await import(urls['js/modules/students.js']);await import(urls['js/modules/finance.js']);},canonicalProbeURLs);row.moduleEvaluations=await page.evaluate(()=>window.__QA.moduleEvaluations);row.resources=await page.evaluate(()=>performance.getEntriesByType('resource').map(x=>({url:x.name,type:x.initiatorType,startTime:x.startTime,duration:x.duration,transferSize:x.transferSize,encodedBodySize:x.encodedBodySize,decodedBodySize:x.decodedBodySize})));}
   if(row.classification==='PASS') {
    try {
     if(role==='admin') {
      await page.evaluate(()=>window.switchTab('attendance'));
      await page.waitForFunction(()=>window.AttendanceModule&&window.showAttMemberHistory);
      const evidence=await page.evaluate(async()=>{
       await window._ensureClubShiftsLoaded();
       await window.showAttMemberHistory('P00000','2026-10');
       const modal=document.getElementById('attHistModal');
       const before={visible:getComputedStyle(modal).display!=='none',connected:modal.isConnected,parent:modal.parentElement.tagName};
       await window.switchTab('active');
       const after=document.getElementById('attHistModal');
       return {before,activeTab:document.querySelector('.tab-content.active')?.id,after:{connected:!!after?.isConnected,visible:!!after&&getComputedStyle(after).display!=='none',bodyLength:after?.querySelector('#attHistBody')?.textContent.length||0}};
      });
      recordLifecycle(role+' '+mode+' actual tab leave',evidence,evidence.before.visible&&evidence.activeTab==='tab_active'&&!evidence.after.visible&&evidence.after.bodyLength===0);
      await page.evaluate(()=>window.switchTab('attendance'));
     }
     await page.waitForFunction(()=>window.AttendanceModule&&window.showAttMemberHistory);
     if(role==='admin') {
      await page.evaluate(()=>window.showAttMemberHistory('P00000','2026-10'));
      try {
       await env.withSecurityRulesDisabled(ctx=>sdk.updateDoc(sdk.doc(ctx.firestore(),'clubs',club),{accountStatus:'locked'}));
       await page.waitForFunction(()=>!!document.getElementById('clubAccessBlockBanner'));
       const locked=await page.evaluate(()=>{const m=document.getElementById('attHistModal');return{blockedReason:window.__clubAccessBootstrapState?.blockedReason,tabDisplay:document.getElementById('tab_attendance').style.display,historyVisible:!!m&&getComputedStyle(m).display!=='none',historyBodyLength:m?.querySelector('#attHistBody')?.textContent.length||0};});
       recordLifecycle(role+' '+mode+' server club lock clears history',locked,locked.tabDisplay==='none'&&!locked.historyVisible&&locked.historyBodyLength===0);
      } finally {await env.withSecurityRulesDisabled(ctx=>sdk.updateDoc(sdk.doc(ctx.firestore(),'clubs',club),{accountStatus:'active'}));}
      await page.reload({waitUntil:'domcontentloaded'});
      await page.waitForFunction(()=>window.__verifiedAuthContextState?.ready===true&&window.__verifiedAuthContextState.role==='admin'&&window.getProfilesListenerMetrics?.().fullAuthorityComplete===true&&document.getElementById('mainApp').style.display!=='none');
      await page.evaluate(()=>window.switchTab('attendance'));
     }
     await page.evaluate(()=>window.showAttMemberHistory('P00000','2026-10'));
     if(role==='coach') {
      const guard=await page.evaluate(async()=>{await window.switchTab('debt');const m=document.getElementById('attHistModal');return{activeTab:document.querySelector('.tab-content.active')?.id,historyVisible:!!m&&getComputedStyle(m).display!=='none',role:__verifiedAuthContextState.role};});
      recordLifecycle(role+' '+mode+' denied Finance navigation stays in Attendance',guard,guard.activeTab==='tab_attendance'&&guard.historyVisible&&guard.role==='coach');
     }
     await page.evaluate(()=>window._fb_init.signOut(window._fb_init.getAuth()));
     await page.waitForFunction(()=>window.__verifiedAuthContextState?.ready===false&&document.getElementById('mainApp').style.display==='none');
     const evidence=await page.evaluate(()=>{const m=document.getElementById('attHistModal');return{uid:__verifiedAuthContextState.uid,ready:__verifiedAuthContextState.ready,mainDisplay:document.getElementById('mainApp').style.display,loginDisplay:document.getElementById('loginOverlay').style.display,historyBodyLength:m?.querySelector('#attHistBody')?.textContent.length||0,modalConnected:!!m?.isConnected,modalVisible:!!m&&getComputedStyle(m).display!=='none',oldNameVisible:!!m&&getComputedStyle(m).display!=='none'&&m.textContent.includes('Synthetic Student 0')};});
     recordLifecycle(role+' '+mode+' actual Auth null/reset',evidence,!evidence.modalVisible&&!evidence.oldNameVisible&&evidence.historyBodyLength===0);
    } catch(error) {recordLifecycle(role+' '+mode+' lifecycle test error',{message:error.stack},false);}
   }
   if(process.env.A9R16_DIAGNOSTIC_STREAM)row.sdkStreamMessages=sdkStreamMessages;row.qaNativeXHR=!process.env.A9R16_QA_FETCH_STREAMS;
   row.harnessSha256=crypto.createHash('sha256').update(fs.readFileSync(new URL(import.meta.url))).digest('hex');row.directFirestore=true;row.resources ||=await page.evaluate(()=>performance.getEntriesByType('resource').map(x=>({url:x.name,type:x.initiatorType,startTime:x.startTime,duration:x.duration,transferSize:x.transferSize,decodedBodySize:x.decodedBodySize}))).catch(()=>[]);
   if(row.classification!=='PASS')row.diagnosticSameQuery=await page.evaluate(async()=>{const s=window._fb_init,db=window.__store?.db;if(!s||!db)return null;const t=performance.now();try{return await Promise.race([s.getDocs(s.query(s.collection(db,'clubs','PERF_CLUB','profiles'),s.where('branch','==','CS1'))).then(q=>({count:q.size,fromCache:q.metadata.fromCache,ms:performance.now()-t,first:q.docs[0]?.id,last:q.docs.at(-1)?.id})),new Promise(resolve=>setTimeout(()=>resolve({timeout:true,ms:performance.now()-t}),5000))])}catch(e){return {code:e.code,message:e.message}}}).catch(e=>({message:e.message}));
   results.push(row);fs.writeFileSync(path.join(out,'RUNS.json'),JSON.stringify({fixture,physicalMobile:'ENV_BLOCKED',sdk:'10.7.1',browser:browser.version(),results},null,2)+'\n');
   console.log(JSON.stringify({role,network,mode,index:index+1,status:row.classification,shell:row.shellUsefulObservedAt,ready:row.authoritativeReadyObservedAt,message:row.message?.slice(0,150)}));
   if(row.classification!=='PASS'){await context.close();throw Error('BASELINE_NOT_MEASURABLE; see RUNS.json');}
  }
  await context.close();
 }
}finally{await browser.close();await new Promise(r=>server.close(r));await env.cleanup();}

if(lifecycleCases.some(x=>x.classification!=='PASS'))process.exitCode=1;
