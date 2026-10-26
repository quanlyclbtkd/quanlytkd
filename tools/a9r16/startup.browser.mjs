// Full production HTML + unmodified app/main assets, actual SDK10 + local Rules.
// Only CDN delivery and Auth provider transport are substituted for isolated QA.
import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import zlib from 'node:zlib';import crypto from 'node:crypto';import assert from 'node:assert/strict';
import {initializeTestEnvironment} from '@firebase/rules-unit-testing';import * as sdk from 'firebase/firestore';
import {loadPlaywright,browserExecutable} from '../test-runtime.mjs';
import {inventory,sourceIdentity} from './module-identity.mjs';
import {browserContractSource,classifyStartupFailure} from './startup-contract.mjs';
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
const requestPath=ref=>ref?.path||ref?._query?.path?.canonicalString?.()||'';
export async function getDoc(...args){window.__QA.reads.getDoc++;window.__QA.calls.push({op:'getDoc',path:requestPath(args[0])});const s=await sdk.getDoc(...args);window.__QA.reads.documents+=size(s);return s;}
export async function getDocs(...args){window.__QA.reads.getDocs++;window.__QA.calls.push({op:'getDocs',path:requestPath(args[0])});const s=await sdk.getDocs(...args);window.__QA.reads.documents+=size(s);return s;}
export function onSnapshot(...args){window.__QA.reads.onSnapshot++;window.__QA.reads.activeListeners++;const event={path:requestPath(args[0]),queryShape:{limit:args[0]?._query?.limit??null,filters:args[0]?._query?.filters?.map(x=>({field:x.field?.canonicalString?.(),op:x.op,value:x.value})),databaseId:args[0]?.firestore?._databaseId?.projectId},snapshots:[],stack:new Error().stack.slice(0,1200)};window.__QA.subscriptions.push(event);let at=args.findIndex(x=>typeof x==='function');if(at>=0){const cb=args[at];args[at]=s=>{window.__QA.reads.snapshotDocuments+=size(s);event.snapshots.push({size:size(s),fromCache:s.metadata.fromCache,pending:s.metadata.hasPendingWrites,first:s.docs?.[0]?.id,last:s.docs?.at(-1)?.id,profileIds:event.path.endsWith('/profiles')?s.docs?.map(d=>d.id).sort():undefined});return cb(s)}}const un=sdk.onSnapshot(...args);let active=true;return()=>{if(active){active=false;window.__QA.reads.activeListeners--;}un()};}`;
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
  if(u.pathname==='/js/main.js')content='window.__QA.marks.coachRuntimeImported=performance.now();\n'+String(content);
  const key=u.pathname+u.search;if(!cache.has(key))cache.set(key,zlib.gzipSync(content));const body=cache.get(key);
  if(!res.destroyed&&!res.writableEnded&&!res.headersSent)res.writeHead(200,{'Content-Type':type,'Content-Encoding':'gzip','Content-Length':body.length,'Cache-Control':u.pathname==='/'?'no-store':'public,max-age=3600'});res.end(body);
 }catch(error){if(!res.headersSent)res.writeHead(404);res.end('QA missing asset');}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
const pw=loadPlaywright(),browser=await pw.chromium.launch({headless:true,executablePath:browserExecutable(),args:['--no-sandbox']});
const results=[];
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
 const expectedBranchIds=seeded.docs.map(d=>d.id).sort();assert.equal(new Set(expectedBranchIds).size,750);
 if(process.env.A9R16_TRANSPORT_ONLY){
  const nodeStart=performance.now(),nodeRows=await sdk.getDocs(sdk.query(sdk.collection(env.authenticatedContext('coach').firestore(),'clubs',club,'profiles'),sdk.where('branch','==','CS1')));console.log('NODE_BRANCH_QUERY',nodeRows.size,performance.now()-nodeStart);
  for(const throttled of [false,true]){const context=await browser.newContext(),p=await context.newPage(),c=await context.newCDPSession(p);await context.addInitScript(()=>{window.__QA={uid:'coach',reads:{getDoc:0,getDocs:0,onSnapshot:0,documents:0,snapshotDocuments:0,activeListeners:0},calls:[],subscriptions:[]}});
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
  await context.addInitScript({content:browserContractSource()});
  await context.addInitScript(({uid,expectedIds})=>{
   window.__QA={uid,reads:{getDoc:0,getDocs:0,onSnapshot:0,documents:0,snapshotDocuments:0,activeListeners:0},calls:[],tasks:[],observed:{},subscriptions:[],marks:{navigationStart:0},probe:{calls:0,totalMs:0,maxMs:0,heavyChecks:0}};
   try{new PerformanceObserver(list=>window.__QA.tasks.push(...list.getEntries().map(x=>({start:x.startTime,duration:x.duration,attribution:x.attribution.map(a=>({name:a.name,containerSrc:a.containerSrc}))})))).observe({type:'longtask',buffered:true});}catch{}
   // QA-only observation: no runtime state writes, query/listener or readiness promotion.
   const stamp=(key,ok)=>{if(ok&&window.__QA.marks[key]===undefined)window.__QA.marks[key]=performance.now()};
   function observe(){const started=performance.now(),q=window.__QA,c=window.__verifiedAuthContextState,m=q.marks;stamp('appLoaded',window.__appLoaded===true);stamp('verifiedAuthReady',c?.ready===true);
    const fields=['att_branch','att_shift','att_date'].map(id=>document.getElementById(id)),bound=fields.every(x=>x&&x.dataset.evtBound==='1'),moduleReady=!!window.AttendanceModule&&bound&&typeof window.onShiftChange==='function';stamp('coachRuntimeInitialized',moduleReady);
    if(c?.role==='coach'&&m.attendanceInteractive===undefined){q.observed.interactive=__qaStartupContract.interactiveEvidence(window,document);stamp('attendanceInteractive',q.observed.interactive.ok);}
    if(m.attendanceInteractive!==undefined&&m.attendanceAuthorityReady===undefined){const d=window.AttendanceModule?.getDailyState?.();if(d?.cacheReady===true&&d.serverConfirmedContext&&d.inFlightKeys.length===0){const p=window.getProfilesListenerMetrics?.();if(p?.coachRosterReadiness==='verified'&&p.activeProfileCount===expectedIds.length){q.probe.heavyChecks++;q.observed.authority=__qaStartupContract.authorityEvidence(window,document,expectedIds);stamp('attendanceAuthorityReady',q.observed.authority.ok);}}}
    const cost=performance.now()-started;q.probe.calls++;q.probe.totalMs+=cost;q.probe.maxMs=Math.max(q.probe.maxMs,cost);
    if(m.attendanceAuthorityReady!==undefined||(c?.ready===true&&c.role!=='coach'&&moduleReady))return;
    requestAnimationFrame(observe);
   }requestAnimationFrame(observe);
  },{uid:role==='super_admin'?'super':role,expectedIds:expectedBranchIds});
  for(const mode of ['cold','warm']){
   const row={protocol:'A9R16BR_IDENTITY_AND_VISIBLE_SHELL_V2',sourceRuntimeSHA256:sourceIdentity.runtimeSHA256,sourceBuildTag:sourceIdentity.buildTag,role,networkProfile:network,cpuSlowdown:cpu,network:net,networkDriver:'Chromium CDP native network throttling for assets and direct SDK10 WebChannel; no HTTP byte proxy',cacheMode:mode,run:index+1,fixtureSha256:crypto.createHash('sha256').update(JSON.stringify(fixture)).digest('hex'),authState:'Returning signed-in fixture; Auth provider transport port; actual app.js server authorization and real Rules',sourceRoot:path.basename(root)};
   try{
    if(mode==='cold')await page.goto(origin,{waitUntil:'domcontentloaded',timeout:60000});else await page.reload({waitUntil:'domcontentloaded',timeout:60000});
    await page.waitForFunction(role=>window.__verifiedAuthContextState?.ready===true&&window.__verifiedAuthContextState.role===role&&document.getElementById('mainApp')?.style.display!=='none',role,{timeout:30000});
    row.shellUsefulObservedAt=await page.evaluate(()=>performance.now());
    if(role==='coach'){
     await page.waitForFunction(()=>window.__QA.marks.attendanceInteractive!==undefined,{},{timeout:30000});
     await page.waitForFunction(()=>window.AttendanceModule&&Array.from(document.getElementById('att_shift')?.options||[]).some(x=>x.value==='S1'),{},{timeout:30000});
     row.explicitShiftSelectionAt=await page.evaluate(()=>performance.now());await page.selectOption('#att_shift','S1');
     await page.waitForFunction(()=>window.__QA.marks.attendanceAuthorityReady!==undefined,{},{timeout:30000});
    }else if(role==='admin'){
     await page.waitForFunction(()=>{const p=window.getProfilesListenerMetrics?.();return p?.fullAuthorityComplete===true&&p?.authorityServerConfirmed===true&&window.__store?.transactionCoverage?.ready===true;},{},{timeout:30000});
    }else await page.waitForFunction(()=>window.__saDashboardLoadedAt>0,{},{timeout:30000});
    Object.assign(row,await page.evaluate(()=>({classification:'PASS',authoritativeReadyObservedAt:performance.now(),marks:window.__loginPerfMetrics,startupMarks:window.__QA.marks,hydration:window.__dataHydrationMetrics,
      activeTab:document.querySelector('.tab-content.active')?.id,verifiedContext:{...window.__verifiedAuthContextState},reads:window.__QA.reads,calls:window.__QA.calls,probeCost:window.__QA.probe,readinessEvidence:window.__QA.observed,moduleEvaluations:window.__QA.moduleEvaluations,
      subscriptions:window.__QA.subscriptions,canonicalProfiles:Object.keys(window.studentProfileStore?.getAllProfilesCompat?.()||window.__store?.profiles||{}).length,filteredRoster:Object.keys(window.currentAttendanceData||{}).length,renderedRows:document.querySelectorAll('#attendanceGrid [id^="att_card_"]').length,profileMetrics:window.getProfilesListenerMetrics?.(),attendance:window.AttendanceModule?.getDailyState?.(),domNodes:document.querySelectorAll('*').length,
      resources:performance.getEntriesByType('resource').map(x=>({url:x.name,type:x.initiatorType,startTime:x.startTime,duration:x.duration,transferSize:x.transferSize,encodedBodySize:x.encodedBodySize,decodedBodySize:x.decodedBodySize})),longTasks:window.__QA.tasks,mainLoaded:window.MAIN_JS_LOADED})));row.cdpMetrics=await cdp.send('Performance.getMetrics');row.errors=errors.slice();
   }catch(error){Object.assign(row,{classification:classifyStartupFailure(error,errors),message:error.message,errors:errors.slice(),debug:await page.evaluate(()=>({fb:!!window._fb_init,app:window.__appLoaded,main:window.MAIN_JS_LOADED,mainFailed:window.__MAIN_JS_LOAD_FAILED,context:window.__verifiedAuthContextState,perf:window.__loginPerfMetrics,clubAccess:window.__clubAccessBootstrapState,shift:window.AttendanceModule?.getShiftAuthority?.(),daily:window.AttendanceModule?.getDailyState?.(),debug:window.__attendanceDebug,profiles:window.getProfilesListenerMetrics?.(),qa:window.__QA,listenerMetrics:window.getListenerMetrics?.(),store:{clubId:window.__store?.clubId,role:window.__store?.userRole,currentUser:window.__store?.currentUser?.uid,coachBranch:window.__store?.coachBranch},loginError:document.getElementById('loginError')?.textContent})).catch(()=>null)});}
   if(row.classification==='PASS'&&role==='coach')try{
    const snap=row.subscriptions.find(q=>q.path==='clubs/PERF_CLUB/profiles'&&q.queryShape.filters?.some(f=>f.field==='branch'&&f.value.stringValue==='CS1'))?.snapshots.filter(s=>!s.fromCache&&!s.pending).at(-1);
    assert.deepEqual(snap?.profileIds,expectedBranchIds,'Authoritative SDK listener must contain exact assigned profile IDs');
    assert.equal(row.readinessEvidence.authority.ok,true,'Exact store/roster/DOM identity proof required');
    assert.equal(row.errors.filter(e=>e.kind==='pageerror'||e.kind==='error').length,0,'SOURCE_CONSOLE_OR_PAGE_ERROR');
    assert(!row.calls.some(c=>/transactions|inventory|finance/.test(c.path)),'Coach startup emitted forbidden Finance/Inventory read');
    row.completeness={seeded:count,stored:storedCounts.total,nodeBranch:seeded.size,listener:snap.size,canonicalStore:row.canonicalProfiles,filteredRoster:row.filteredRoster,renderedRows:row.renderedRows,expectedIdsSHA256:crypto.createHash('sha256').update(JSON.stringify(expectedBranchIds)).digest('hex'),sdkIdentityMatch:true,storeRosterDOMIdentityMatch:true,extraBrowserDiagnosticQueries:0};
    for(const k of ['nodeBranch','listener','canonicalStore','filteredRoster','renderedRows'])assert.equal(row.completeness[k],750,'Incomplete '+k);
   }catch(e){row.classification=classifyStartupFailure(e,errors);row.message=e.message;}
   if(row.classification==='ENV_BLOCKED'&&row.debug?.qa?.observed?.authority?.failures?.some(x=>x.startsWith('IDENTITY_SET_MISMATCH:'))){row.classification='FAIL_RUNTIME';row.failureEvidence='Accepted data flags but exact profile identity sets never became consistent before deadline';}
   if(process.env.A9R16_MODULE_IDENTITY_PROBE&&row.classification==='PASS'){await page.evaluate(async urls=>{await import(urls['js/modules/students.js']);await import(urls['js/modules/finance.js']);},canonicalProbeURLs);row.moduleEvaluations=await page.evaluate(()=>window.__QA.moduleEvaluations);row.resources=await page.evaluate(()=>performance.getEntriesByType('resource').map(x=>({url:x.name,type:x.initiatorType,startTime:x.startTime,duration:x.duration,transferSize:x.transferSize,encodedBodySize:x.encodedBodySize,decodedBodySize:x.decodedBodySize})));}
   if(process.env.A9R16_DIAGNOSTIC_STREAM)row.sdkStreamMessages=sdkStreamMessages;row.qaNativeXHR=!process.env.A9R16_QA_FETCH_STREAMS;
   row.harnessSha256=crypto.createHash('sha256').update(fs.readFileSync(new URL(import.meta.url))).digest('hex');row.contractSha256=crypto.createHash('sha256').update(fs.readFileSync(new URL('./startup-contract.mjs',import.meta.url))).digest('hex');row.directFirestore=true;row.resources ||=await page.evaluate(()=>performance.getEntriesByType('resource').map(x=>({url:x.name,type:x.initiatorType,startTime:x.startTime,duration:x.duration,transferSize:x.transferSize,decodedBodySize:x.decodedBodySize}))).catch(()=>[]);
   if(row.classification!=='PASS')row.diagnosticSameQuery=await page.evaluate(async()=>{const s=window._fb_init,db=window.__store?.db;if(!s||!db)return null;const t=performance.now();try{return await Promise.race([s.getDocs(s.query(s.collection(db,'clubs','PERF_CLUB','profiles'),s.where('branch','==','CS1'))).then(q=>({count:q.size,fromCache:q.metadata.fromCache,ms:performance.now()-t,first:q.docs[0]?.id,last:q.docs.at(-1)?.id})),new Promise(resolve=>setTimeout(()=>resolve({timeout:true,ms:performance.now()-t}),5000))])}catch(e){return {code:e.code,message:e.message}}}).catch(e=>({message:e.message}));
   results.push(row);fs.writeFileSync(path.join(out,'RUNS.json'),JSON.stringify({fixture,physicalMobile:'ENV_BLOCKED',sdk:'10.7.1',browser:browser.version(),results},null,2)+'\n');
   console.log(JSON.stringify({role,network,mode,index:index+1,status:row.classification,shell:row.shellUsefulObservedAt,ready:row.authoritativeReadyObservedAt,message:row.message?.slice(0,150)}));
   if(row.classification!=='PASS'){await context.close();throw Error('BASELINE_NOT_MEASURABLE; see RUNS.json');}
  }
  await context.close();
 }
}finally{await browser.close();await new Promise(r=>server.close(r));await env.cleanup();}
