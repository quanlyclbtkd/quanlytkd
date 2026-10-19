#!/usr/bin/env node
// Behavioral gate: actual Firebase callback owner, actual Debt boundary,
// actual pagination projection, and actual StudentService search handler.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
let pass = 0, fail = 0;
const test = async (id, fn) => {
  try { await fn(); console.log('PASS', id); pass++; }
  catch (e) { console.error('FAIL', id, String(e.stack || e)); fail++; }
};
const src = (p) => fs.readFileSync(p, 'utf8');
const originalWarn = console.warn;
const quiet = (...a) => { if (process.env.D1C3B3_VERBOSE === '1') originalWarn(...a); };
console.warn = quiet;
globalThis.window = globalThis;
const { studentProfileStore: StudentProfileStore } = await import('../js/data/studentProfileStore.js');
window.userRole = 'admin';
window.__store = { clubId:'A', currentClubId:'A', userRole:'admin', profiles:{}, clubConfig:{} };
window.__verifiedAuthContextState = {ready:true, clubId:'A',role:'admin',coachBranch:'',generation:10,uid:'admin-u'};
window.studentProfileStore = StudentProfileStore;
window._syncAllProfilesLegacy = () => {};
window.refreshListsComputation = () => {};
window.invalidateList = () => {};
window.invalidateStudents = () => {};
window.invalidateByDomain = () => {};
window.invalidateDashboard = () => {};
window.scheduleAutomaticDebtProfileCoverage = () => {};
window.RoleReadBoundary = {isCoachAttendanceOnly:()=>false,canMount:()=>true};
window._moduleDashboard = {reconcileHydrationEvidence(){},markStatsDirty(){}};
const regs = new Map();let callbacks=[], reads=0, registrations=0, metadataOpt=[];
window.hasListener = k => regs.has(k);
window.removeListener = k => { const v=regs.get(k);v?.unsub?.();regs.delete(k);return true; };
window.safeRegisterSnapshot = (key,create) => {if(regs.has(key))return false; regs.set(key,{unsub:create()});return true;};
window.markListenerSnapshot=()=>{};
let fallbackSnap = {size:0,metadata:{fromCache:false,hasPendingWrites:false},forEach() {}};
window._fb_init = {
  query:(q,...constraints)=>({q,constraints}),where:(...args)=>({where:args}),limit:n=>({limit:n}),
  onSnapshot:(query,opt,next,error)=>{
    const opts = typeof opt === 'function' ? null : opt;
    const cb = typeof opt === 'function' ? opt : next;
    metadataOpt.push(opts); registrations++;
    callbacks.push({cb,error:typeof opt === 'function' ? next : error});return ()=>{};
  },getDocs:async()=>{reads++;return fallbackSnap;},
};
const owner = await import('../js/listeners/profiles.listeners.js');
window.getProfilesListenerMetrics = owner.getProfilesListenerMetrics;
const boundaryVM = {window,Date,console,Promise,Math,Object,Array,String,Number,setTimeout,clearTimeout};
vm.createContext(boundaryVM);
vm.runInContext(src('js/core/debtProfileReadBoundary.js'), boundaryVM);
const snapshot=(profiles={}, fromCache=false, pending=false, changes=null)=>({
  size:Object.keys(profiles).length,metadata:{fromCache,hasPendingWrites:pending},
  forEach:fn=>Object.entries(profiles).forEach(([id,p])=>fn({id,data:()=>p})),
  docChanges:()=>changes === null ? Object.keys(profiles).map(id=>({type:'added',doc:{id}})) : changes,
});
const roster=(n=100)=>Object.fromEntries(Array.from({length:n},(_,i)=>['s'+i,{name:'Student '+i,branch:'CS1',status:'active'}]));
function reset(){
  owner.resetProfilesListeners('d1c3b3'); StudentProfileStore.resetStudentProfileStore('d1c3b3');
  regs.clear();callbacks=[];reads=0;registrations=0;metadataOpt=[];
  window.userRole='admin'; window.coachBranch='';
  window.__store = {clubId:'A',currentClubId:'A',userRole:'admin',profiles:{},clubConfig:{}};
  window.__verifiedAuthContextState={ready:true,clubId:'A',role:'admin',coachBranch:'',generation:10,uid:'admin-u'};
  window.getProfilesListenerMetrics = owner.getProfilesListenerMetrics;
  window.studentProfileStore = StudentProfileStore;
}
const mount=()=>owner.mountActiveProfilesListener({clubId:'A',db:{},profRef:{path:'clubs/A/profiles'},role:'admin'});
const debt=()=>window.getDebtProfileCoverageStatus();
await test('A01 cache-only 1/100 never becomes complete Debt',()=>{
  reset();mount();callbacks.at(-1).cb(snapshot({s0:roster(1).s0},true,false));
  assert.equal(debt().ready,false);assert.equal(owner.getProfilesListenerMetrics().fullAuthorityComplete,false);
});
await test('A02 cache-only empty is not an authoritative zero',()=>{
  reset();mount();callbacks.at(-1).cb(snapshot({},true,false));
  assert.equal(debt().ready,false);assert.notEqual(owner.getProfilesListenerMetrics().quitAuthorityState,'complete');
});
await test('A03 identical metadata cache→server promotes using one listener',()=>{
  reset();mount();const cb=callbacks.at(-1).cb; const docs=roster(3);
  cb(snapshot(docs,true,false));cb(snapshot(docs,false,false,[]));
  assert.equal(debt().ready,true);assert.equal(registrations,1);assert.equal(reads,0);
  assert.equal(owner.getProfilesListenerMetrics().authoritySnapshotVersion,1);
});
await test('A04 pending writes never promote before server acknowledgement',()=>{
  reset();mount();const cb=callbacks.at(-1).cb;
  cb(snapshot(roster(2),false,true));assert.equal(debt().ready,false);
  cb(snapshot(roster(2),false,false,[]));assert.equal(debt().ready,true);
});
await test('A05 last-good becomes stale offline without losing verified map',()=>{
  reset();mount();const cb=callbacks.at(-1).cb;
  cb(snapshot(roster(3),false,false));const previous=StudentProfileStore.getAllProfilesCompat();
  cb(snapshot(roster(1),true,false));
  assert.equal(debt().ready,false);assert.equal(owner.getProfilesListenerMetrics().authorityFreshness,'stale');
  assert.equal(Object.keys(StudentProfileStore.getAllProfilesCompat()).length,Object.keys(previous).length);
});
await test('A06 cache-only getDocs fallback cannot establish authority',async()=>{
  reset();mount();fallbackSnap=snapshot(roster(1),true,false);
  callbacks.at(-1).error({code:'unavailable'});
  await new Promise(r=>setImmediate(r));
  assert.equal(debt().ready,false);assert.equal(owner.getProfilesListenerMetrics().fullAuthorityComplete,false);
});
await test('A07 server-confirmed empty is authoritative zero',()=>{
  reset();mount();callbacks.at(-1).cb(snapshot({},false,false));
  assert.equal(debt().ready,true);assert.equal(owner.getProfilesListenerMetrics().fullAuthoritySnapshotCount,0);
});
await test('A08 disposed callback and new-session callback dropped',()=>{
  reset();mount();const old=callbacks.at(-1).cb;
  window.__verifiedAuthContextState.generation=11;window.__verifiedAuthContextState.uid='different';
  old(snapshot(roster(1),false,false));assert.equal(owner.getProfilesListenerMetrics().fullAuthorityComplete,false);
});
await test('A11 SuperAdmin verified session can select a different club without mixing authority',()=>{
  reset();window.userRole='super_admin';window.__store.userRole='super_admin';
  window.__store.clubId='B';window.__store.currentClubId='B';
  window.__verifiedAuthContextState.role='super_admin';window.__verifiedAuthContextState.clubId='';
  owner.mountActiveProfilesListener({clubId:'B',role:'super_admin',db:{},profRef:{path:'clubs/B/profiles'}});
  callbacks.at(-1).cb(snapshot(roster(2),false,false));
  assert.equal(owner.getProfilesListenerMetrics().authorityClubId,'B');
  assert.equal(debt().ready,true);
});
await test('A09 Firebase metadata-change overload is requested',()=>{
  reset();mount();assert.deepEqual(JSON.parse(JSON.stringify(metadataOpt[0])),{includeMetadataChanges:true});
});
await test('A10 one listener/read topology for Admin cache→server',()=>{
  reset();mount();const cb=callbacks.at(-1).cb;cb(snapshot(roster(10),true));cb(snapshot(roster(10),false,false,[]));
  assert.equal(registrations,1);assert.equal(regs.size,1);assert.equal(reads,0);
});

// Exact nested pagination helper from production students.js, not a second implementation.
const studentsSrc=src('js/modules/students.js');
const blockStart=studentsSrc.indexOf('function _paginationContext()')>=0
  ? studentsSrc.indexOf('function _paginationContext()')
  : studentsSrc.indexOf('function _mergePaginationProfilesIntoStore(');
const blockEnd=studentsSrc.indexOf('// ── Core: thực sự load một trang profiles',blockStart);
const block=studentsSrc.slice(blockStart,blockEnd);
function pageHarness({role='admin',storeRole=role,windowRole=role,metricRole=role,clubId='A',metricClub='A',branch='CS1',metricEpoch=10,verified=true}={}){
  const store={clubId,currentClubId:clubId,userRole:storeRole,coachBranch:role==='coach'?branch:'',profiles:{'s':{name:'S',branch:'CS1',paidUntil:'2026-09',secretTuition:999}},_dataVersion:1};
  const auth={ready:verified,clubId,role,coachBranch:role==='coach'?branch:'',generation:10,uid:'user-A'};
  const metrics={authorityClubId:metricClub,role:metricRole,authoritySessionEpoch:metricEpoch,authorityServerConfirmed:true,
    authorityFreshness:'fresh',fullAuthorityComplete:true,lastProfilesMode:'full-profiles-authoritative'};
  const w={__store:store,userRole:windowRole,coachBranch:role==='coach'?branch:'',__verifiedAuthContextState:auth,
    getProfilesListenerMetrics:()=>metrics,studentProfileStore:{quitComplete:true}};
  const vmctx={window:w,store,Array,Object,String,Number};
  vm.createContext(vmctx);
  vm.runInContext(block+'\nthis.project=_mergePaginationProfilesIntoStore;this.capture=typeof _paginationContext === "function" ? _paginationContext : null;this.same=typeof _samePaginationContext === "function" ? _samePaginationContext : null;',vmctx);
  return {w,store,auth,metrics,project:vmctx.project,capture:vmctx.capture,same:vmctx.same};
}
await test('B01 coach window vs stale admin store blocks sensitive projection',()=>{
  const h=pageHarness({role:'coach',windowRole:'coach',storeRole:'admin',metricRole:'admin'});const row={id:'s',name:'S'};
  assert.equal(h.project([row]),0);assert.equal(row.secretTuition,undefined);
});
await test('B02 admin window vs stale coach store blocks projection',()=>{
  const h=pageHarness({role:'admin',windowRole:'admin',storeRole:'coach'});const row={id:'s'};
  h.project([row]);assert.equal(row.secretTuition,undefined);
});
await test('B03 wrong club profile authority cannot enrich page',()=>{
  const h=pageHarness({metricClub:'B'});const row={id:'s'};
  h.project([row]);assert.equal(row.secretTuition,undefined);
});
await test('B04 coach branch mismatch blocks projection',()=>{
  const h=pageHarness({role:'coach'});h.w.coachBranch='CS2';const row={id:'s'};
  h.project([row]);assert.equal(row.secretTuition,undefined);
});
await test('B05 stable same-session Admin projection preserves canonical paid data',()=>{
  const h=pageHarness();const row={id:'s',paidUntil:'2026-08'};
  h.project([row]);assert.equal(row.paidUntil,'2026-09');assert.equal(h.store.profiles.s.paidUntil,'2026-09');
});
await test('B06 blocked session never enriches',()=>{
  const h=pageHarness({verified:false});const row={id:'s'};h.project([row]);assert.equal(row.secretTuition,undefined);
});
await test('B09 SuperAdmin current-club projection accepts verified global super_admin principal',()=>{
  const h=pageHarness({role:'super_admin',metricRole:'super_admin',clubId:'B',metricClub:'B'});
  h.auth.clubId='';const row={id:'s',paidUntil:'2026-08'};h.project([row]);
  assert.equal(row.paidUntil,'2026-09');
});
await test('B07 projection has no Firebase calls or canonical mutation',()=>{
  assert.doesNotMatch(block,/getDoc\(|getDocs\(|onSnapshot\(|mergeProfile\(/);
});
await test('B08 session epoch mismatch drops current profile projection',()=>{
  const h=pageHarness({metricEpoch:9});const row={id:'s'};h.project([row]);assert.equal(row.secretTuition,undefined);
});
await test('C01-C03 context token changes across club/branch/login switch',()=>{
  const h=pageHarness();assert.equal(typeof h.capture,'function');const before=h.capture();
  h.auth.generation=11;assert.equal(h.same(before),false);h.auth.generation=10;
  h.store.clubId='B';assert.equal(h.same(before),false);h.store.clubId='A';
  h.auth.uid='new-user';assert.equal(h.same(before),false);
});
await test('C04-C05 request owner and stale guard used after both await variants',()=>{
  assert.match(studentsSrc,/pgState\._loadOwner !== _loadOwner/);
  assert.match(studentsSrc,/if \(_isStaleSearch\(\)\)[\s\S]*?return _dropStale\(\)/);
  assert.match(studentsSrc,/if \(pgState\._loadOwner === _loadOwner\) pgState\.isLoading = false/);
});

// Full Admin search uses the exact StudentService handler with zero getDocs.
const {StudentService}=await import('../js/services/students.service.js');
const searchDocs={
  'a':{name:'Nguyễn Văn An',branch:'CS1',status:'active',searchName:'nguyen van an',phone:'0902345678'},
  'b':{name:'Nguyễn Văn Ánh',branch:'CS1',status:'Đang tập',nickname:'Bé Ánh',code:'K123'},
  'quit':{name:'Nguyễn Văn Ai',branch:'CS1',status:'quit'},
};
let serviceReads=0;const searchConstraints=[];const executedQueries=[];
const prepareSearch=({data=searchDocs,role='admin',branch='CS1'}={})=>{
  serviceReads=0;searchConstraints.length=0;executedQueries.length=0;
  window.__verifiedAuthContextState={ready:true,role,clubId:'A',coachBranch:role==='coach'?branch:'',generation:10,uid:'uid'};
  window.__store={db:{},clubId:'A',userRole:role,coachBranch:role==='coach'?branch:'',profiles:data};
  window.userRole=role;window.coachBranch=role==='coach'?branch:'';
  window.studentProfileStore={quitComplete:true,getAllProfilesCompat:()=>data};
  window.getProfilesListenerMetrics=()=>({authorityClubId:'A',authoritySessionEpoch:10,role,
    authorityServerConfirmed:true,authorityFreshness:'fresh',fullAuthorityComplete:true,lastProfilesMode:'full-profiles-authoritative'});
  window.classifyProfileStatus=p=>(p.status==='quit'?'quit':'active');
  window._fb_init={collection:(...a)=>({collection:a}),query:(q,...a)=>{searchConstraints.push(a);return {base:q,constraints:a}},
    where:(...a)=>({where:a}),orderBy:(...a)=>({orderBy:a}),limit:n=>({limit:n}),startAt:v=>({startAt:v}),endAt:v=>({endAt:v}),
    getDocs:async(q)=>{serviceReads++;executedQueries.push(q);return {size:0,forEach(){}};}};
};
await test('D01 one indexed and one legacy unindexed Admin match',async()=>{
  prepareSearch();const result=await StudentService.searchProfilesServerSide('Nguyễn Văn',{statusFilter:'active'});
  assert.deepEqual(result.items.map(x=>x.id).sort(),['a','b']);assert.equal(serviceReads,0);
});
await test('D02 Vietnamese accents and alias/code/phone searches',async()=>{
  prepareSearch();for(const q of ['nguyen van','Ánh','Be Anh','K123','0902345']){
    const r=await StudentService.searchProfilesServerSide(q,{statusFilter:'active'});assert.ok(r.items.length>=1,q);
  }
});
await test('D03 1500 records paginate 50 without duplicates',async()=>{
  const data=Object.fromEntries(Array.from({length:1500},(_,i)=>['p'+i,{name:'Học viên '+i,branch:'CS1',status:'active'}]));
  prepareSearch({data});let rows=[];for(let offset=0;offset<1500;offset+=50){const r=await StudentService.searchProfilesServerSide('hoc vien',{pageSize:50,offset,statusFilter:'active'});rows.push(...r.items);}
  assert.equal(rows.length,1500);assert.equal(new Set(rows.map(x=>x.id)).size,1500);assert.equal(serviceReads,0);
});
await test('D04 Admin active search excludes quit but quit search includes it',async()=>{
  prepareSearch();const active=await StudentService.searchProfilesServerSide('nguyen',{statusFilter:'active'});
  const quit=await StudentService.searchProfilesServerSide('nguyen',{statusFilter:'quit'});
  assert.equal(active.items.length,2);assert.deepEqual(quit.items.map(x=>x.id),['quit']);
});
await test('D06 SuperAdmin verified global principal searches selected club locally',async()=>{
  prepareSearch({role:'super_admin'});window.__verifiedAuthContextState.clubId='';
  const result=await StudentService.searchProfilesServerSide('nguyen',{statusFilter:'active'});
  assert.equal(result.items.length,2);assert.equal(serviceReads,0);
});
await test('D05 Admin branch filter and no off-branch leakage',async()=>{
  prepareSearch({data:{...searchDocs,other:{name:'Nguyễn Văn Other',branch:'CS2',status:'active'}}});
  const r=await StudentService.searchProfilesServerSide('nguyen',{statusFilter:'active',branchFilter:'CS1'});
  assert.equal(r.items.length,2);assert.ok(r.items.every(x=>x.branch==='CS1'));
});
await test('E01 Coach search query must always have a branch predicate',async()=>{
  prepareSearch({role:'coach'});await StudentService.searchProfilesServerSide('van',{statusFilter:'active'});
  assert.ok(serviceReads>=1);
  assert.ok(executedQueries.every(q=>q.constraints?.some(p=>p.where?.[0]==='branch')));
});
await test('R01 preserves static Firestore sites and test-only no writers',()=>{
  const ownerSrc=src('js/listeners/profiles.listeners.js');
  assert.match(ownerSrc,/includeMetadataChanges:\s*true/);
  assert.doesNotMatch(block,/writeBatch\(|setDoc\(|setTimeout\(/);
});
console.warn=originalWarn;
console.log(`D1C3B3 closure: ${pass} PASS / ${fail} FAIL`);
if(fail)process.exitCode=1;
