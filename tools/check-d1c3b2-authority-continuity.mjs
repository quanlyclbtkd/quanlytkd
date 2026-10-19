#!/usr/bin/env node
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const studentsSrc = fs.readFileSync('js/modules/students.js','utf8');
const rendererSrc = fs.readFileSync('js/ui/render/computation/studentsRenderer.js','utf8');
const summarySrc = fs.readFileSync('js/ui/render/listComputationRefresh.js','utf8');
const boundarySrc = fs.readFileSync('js/core/debtProfileReadBoundary.js','utf8');
const src = studentsSrc.slice(studentsSrc.indexOf('function _paginationContext()'),studentsSrc.indexOf('// ── Core: thực sự load một trang profiles',studentsSrc.indexOf('function _paginationContext()')));
assert.ok(src.includes('function _mergePaginationProfilesIntoStore'));
let passed = 0, failed=0;
async function check(name, fn) { try { await fn(); console.log('PASS',name); passed++; } catch(e){ console.error('FAIL',name,e.message); failed++; } }
const { StudentProfileStore } = await import('../js/data/studentProfileStore.js').then(m=>({ StudentProfileStore:m }));
globalThis.window = globalThis;
await import('../js/core/tuitionDebtCanonical.js');
const computeProfileDebt = window.TuitionDebtCanonical.computeProfileDebt;
function pageContext(initial, metrics={authorityClubId:'club-A',role:'admin',authorityServerConfirmed:true,authorityFreshness:'fresh',fullAuthoritySnapshotSeen:true,fullAuthorityComplete:true,lastProfilesMode:'full-profiles-authoritative'}) {
  StudentProfileStore.resetStudentProfileStore('test-reset');
  StudentProfileStore.syncLegacyAllProfiles(initial,'test-full',{complete:true});
  const store = { clubId:'club-A', userRole:'admin', profiles:structuredClone(initial), _dataVersion:1 };
  const page={window:{__store:store,userRole:'admin',studentProfileStore:{ mergeProfile:StudentProfileStore.mergeProfile }, getProfilesListenerMetrics:()=>metrics},store,Array,Object,String};
  page.window.studentProfileStore.quitComplete = StudentProfileStore.isQuitProfilesComplete?.() ?? true;
  vm.createContext(page); vm.runInContext(src+'\nthis.mergePage = _mergePaginationProfilesIntoStore;',page);
  return {page,store};
}
const one={A:{status:'active',tuitionFee:500000,admissionDate:'2026-09-01',paidUntil:'2026-09',paidMonths:['2026-09'],branch:'CS1'}};
await check('A01 stale pagination cannot overwrite settled authoritative profile',()=>{
  const {page,store}=pageContext(one);
  page.mergePage([{id:'A',status:'active',paidUntil:'2026-08',paidMonths:['2026-08'],tuitionFee:500000,admissionDate:'2026-09-01'}]);
  assert.equal(store.profiles.A.paidUntil,'2026-09');
  assert.equal(StudentProfileStore.getAllProfilesCompat().A.paidUntil,'2026-09');
  assert.equal(store.profiles.A.paidUntil,'2026-09');
  assert.equal(computeProfileDebt(store.profiles.A,'2026-09',{name:'A',transactions:[]}).shouldAppearInDebtBeforeRender,false);
});
await check('A02 sparse page must preserve authoritative financial fields',()=>{
  const {page,store}=pageContext(one); page.mergePage([{id:'A',status:'active',name:'A'}]);
  assert.equal(store.profiles.A.paidUntil,'2026-09'); assert.deepEqual(store.profiles.A.paidMonths,['2026-09']);
});
await check('A03 actual later full snapshot overrides page data',()=>{
  const {page,store}=pageContext(one); page.mergePage([{id:'A',status:'active',paidUntil:'2026-08'}]);
  const next={A:{...one.A,paidUntil:'2026-10',paidMonths:['2026-09','2026-10']}};
  StudentProfileStore.syncLegacyAllProfiles(next,'full-profiles:admin-authority',{complete:true});
  // existing bridge updates local runtime independently, but page must never demote it
  Object.assign(store.profiles,next); page.mergePage([{id:'A',status:'active',paidUntil:'2026-08'}]);
  assert.equal(store.profiles.A.paidUntil,'2026-10');
});
await check('A04 authority from another club cannot authorize pagination overwrite',()=>{
  const {page,store}=pageContext(one,{authorityClubId:'club-B',role:'admin',fullAuthoritySnapshotSeen:true,fullAuthorityComplete:true,lastProfilesMode:'full-profiles-authoritative'});
  page.mergePage([{id:'A',status:'active',paidUntil:'2026-08'}]);
  assert.notEqual(store.profiles.A.paidUntil,'2026-08');
});
await check('A04B role switch cannot enrich Coach page from prior Admin authority',()=>{
  const {page,store}=pageContext(one,{authorityClubId:'club-A',role:'admin',authorityServerConfirmed:true,authorityFreshness:'fresh',fullAuthoritySnapshotSeen:true,fullAuthorityComplete:true,lastProfilesMode:'full-profiles-authoritative'});
  page.window.userRole='coach';
  const coachPage={id:'A',name:'A',branch:'CS1'};
  assert.equal(page.mergePage([coachPage]),0);
  assert.equal(coachPage.paidUntil,undefined);
  assert.equal(store.profiles.A.paidUntil,'2026-09');
});
await check('A05 search/load-more remains presentation data, no new readers',()=>{
  assert.match(studentsSrc,/pgState\.currentItems\s*=\s*Array\.from\(byId\.values\(\)\)/);
  assert.match(studentsSrc,/processPage\(snap, pgState\)/);
  assert.doesNotMatch(src,/getDocs\(|getDoc\(|onSnapshot\(/);
});

// Actual listener owner + registry (mocked only at Firestore boundary).
globalThis.window = globalThis;
window.userRole='admin';
window.__store={clubId:'club-A',profiles:{},clubConfig:{}};
window._syncAllProfilesLegacy=()=>{};
window.refreshListsComputation=()=>{}; window.invalidateList=()=>{}; window.invalidateStudents=()=>{};
window.scheduleAutomaticDebtProfileCoverage=()=>{};
window.RoleReadBoundary={isCoachAttendanceOnly:()=>false,canMount:()=>true};
window._moduleDashboard={reconcileHydrationEvidence(){},markStatsDirty(){}};
const registry=new Map(); let onCalls=0, readCalls=0, next, error;
window.hasListener=k=>registry.has(k);
window.removeListener=k=>{registry.get(k)?.();registry.delete(k);return true};
window.safeRegisterSnapshot=(key,create)=>{if(registry.has(key)) return false; registry.set(key,create());return true};
window.markListenerSnapshot=()=>{};
window._fb_init={query:(ref,...constraints)=>({ref,constraints}),where:(...args)=>({where:args}),limit:n=>({limit:n}),onSnapshot:(q,opts,n,e)=>{assert.equal(opts.includeMetadataChanges,true);onCalls++;next=n;error=e;return ()=>{}},getDocs:async()=>{readCalls++;return {size:1,metadata:{fromCache:false,hasPendingWrites:false},forEach:fn=>fn({id:'A',data:()=>one.A})}}};
const listeners=await import('../js/listeners/profiles.listeners.js?d1c3b2');
const ctx={db:{},clubId:'club-A',profRef:{path:'clubs/club-A/profiles'},role:'admin'};
function reset() {listeners.resetProfilesListeners('case-reset');registry.clear(); onCalls=0;readCalls=0;next=null;error=null;window.__store.clubId='club-A';window.userRole='admin'}
const snap=(profiles)=>({metadata:{fromCache:false,hasPendingWrites:false},size:Object.keys(profiles).length,forEach:fn=>Object.entries(profiles).forEach(([id,p])=>fn({id,data:()=>p})),docChanges:()=>[]});
await check('T01 registered pending listener cannot be replaced by timeout fallback',async()=>{reset();listeners.mountActiveProfilesListener(ctx);assert.equal(onCalls,1);assert.equal(await listeners.loadFullProfilesFallback('debt-coverage-emergency:timeout'),false);assert.equal(readCalls,0);assert.equal(registry.size,1);next(snap(one));assert.equal(listeners.getProfilesListenerMetrics().fullAuthorityComplete,true)});
// Actual Debt boundary with virtual 8s clock and registered pending listener.
await check('T01B boundary timeout must not request fallback for healthy pending listener', async()=>{
  let clock=0, fallbackRuns=0;
  class FakeDate extends Date { static now(){return clock;} }
  const w={ userRole:'admin', __store:{clubId:'club-A',userRole:'admin',profiles:{},clubConfig:{}}, studentProfileStore:{quitComplete:false},
    getProfilesListenerMetrics:()=>({activeListenerKey:'students:profiles:active:club-A:admin',activeListenerFailed:false,authorityClubId:'club-A',fullAuthoritySnapshotSeen:false,fullAuthorityComplete:false,lastProfilesMode:'none',quitComplete:false}),
    hasListener:k=>k==='students:profiles:active:club-A:admin',
    loadFullProfilesFallback:async()=>{fallbackRuns++;return true;} };
  const sandbox={window:w,Date:FakeDate,console,Promise,Math,Object,Array,String,Number,
    setTimeout:(fn,ms)=>{clock+=ms;queueMicrotask(fn);return 0;},clearTimeout:()=>{}};
  vm.createContext(sandbox);vm.runInContext(boundarySrc,sandbox,{filename:'debtProfileReadBoundary.js'});
  const result=await w.ensureDebtProfileCoverage('pending-eight-seconds');
  assert.equal(result.ready,false);assert.equal(result.source,'full-profile-listener-pending');
  assert.equal(fallbackRuns,0);assert.ok(clock>=8000);
});
await check('T02 explicit first snapshot error has exclusive fallback and no overlap',async()=>{reset();listeners.mountActiveProfilesListener(ctx);error({code:'unavailable'});await Promise.resolve();await new Promise(r=>setImmediate(r));assert.equal(readCalls,1);assert.ok(registry.size<=1)});
await check('T03 emergency fallback recovers one realtime owner after one-shot',async()=>{reset();listeners.mountActiveProfilesListener(ctx);error({code:'unavailable'});await new Promise(r=>setImmediate(r));assert.equal(readCalls,1);assert.equal(registry.size,1);assert.equal(onCalls,2)});
await check('T04 remote tuition settlement after recovery updates canonical store',async()=>{reset();listeners.mountActiveProfilesListener(ctx);error({code:'unavailable'});await new Promise(r=>setImmediate(r));next(snap(one));next({...snap({A:{...one.A,paidUntil:'2026-10'}}),docChanges:()=>[{type:'modified'}]});assert.equal(StudentProfileStore.getAllProfilesCompat().A.paidUntil,'2026-10')});
await check('T03B one-shot fallback without registry recovery cannot be ready forever',async()=>{
  reset(); listeners.mountActiveProfilesListener(ctx);
  const safe=window.safeRegisterSnapshot;
  window.safeRegisterSnapshot=null;
  try {
    error({code:'unavailable'});
    await new Promise(r=>setImmediate(r));
    const metrics=listeners.getProfilesListenerMetrics();
    assert.equal(metrics.fullAuthorityComplete,false);
    assert.equal(metrics.fullAuthoritySnapshotSeen,false);
    assert.equal(metrics.lastProfilesMode,'full-fallback-awaiting-realtime');
  } finally { window.safeRegisterSnapshot=safe; }
});
await check('T05B in-flight fallback after club switch never writes old snapshot',async()=>{
  reset(); listeners.mountActiveProfilesListener(ctx);
  let resolveRead;
  const original=window._fb_init.getDocs;
  window._fb_init.getDocs=()=>new Promise(resolve=>{readCalls++;resolveRead=resolve});
  try {
    error({code:'unavailable'});
    await new Promise(r=>setImmediate(r));
    assert.equal(typeof resolveRead,'function');
    listeners.resetProfilesListeners('club-switch');
    StudentProfileStore.resetStudentProfileStore('club-switch');
    window.__store.clubId='club-B';window.__store.profiles={};
    resolveRead(snap(one));
    await new Promise(r=>setImmediate(r));
    assert.equal(StudentProfileStore.getAllProfilesCompat().A,undefined);
    assert.equal(listeners.getProfilesListenerMetrics().fullAuthorityComplete,false);
  } finally { window._fb_init.getDocs=original; window.__store.clubId='club-A'; }
});
await check('T05C role switch during fallback prevents old Admin recovery',async()=>{
  reset();listeners.mountActiveProfilesListener(ctx);
  let resolveRead;const old=window._fb_init.getDocs;
  window._fb_init.getDocs=()=>new Promise(resolve=>{readCalls++;resolveRead=resolve});
  try {
    error({code:'unavailable'});await new Promise(r=>setImmediate(r));
    const before=onCalls;
    window.userRole='coach';window.__store.userRole='coach';
    resolveRead(snap(one));await new Promise(r=>setImmediate(r));
    assert.equal(onCalls,before);
    assert.equal(listeners.getProfilesListenerMetrics().fullAuthorityComplete,false);
  }finally{window._fb_init.getDocs=old;window.userRole='admin';delete window.__store.userRole;}
});
await check('T05 context change/logout invalidates former authority',async()=>{reset();listeners.mountActiveProfilesListener(ctx);next(snap(one));listeners.resetProfilesListeners('logout');assert.equal(listeners.getProfilesListenerMetrics().fullAuthorityComplete,false);assert.equal(registry.size,0)});
await check('T06 fallback failure must not fabricate complete coverage',async()=>{reset();listeners.mountActiveProfilesListener(ctx);const old=window._fb_init.getDocs;window._fb_init.getDocs=async()=>{readCalls++;throw Error('network-error')};try{error({code:'unavailable'});await new Promise(r=>setImmediate(r));assert.equal(listeners.getProfilesListenerMetrics().fullAuthorityComplete,false)} finally{window._fb_init.getDocs=old}});
await check('S01 summary from a former club or month is neutral',()=>{
  assert.match(rendererSrc,/debtSummaryPending|debtCoveragePending/);
  assert.match(summarySrc,/debtSummaryPending|debtCoveragePending/);
  const match=rendererSrc.match(/export function getStudentsSummary\(\) \{[\s\S]*?\n\}/);
  assert.ok(match,'actual summary getter found');
  const w={__store:{clubId:'club-B',selectedMonth:'2026-10'},getDebtProfileCoverageStatus:()=>({ready:false,sameClub:false})};
  const sandbox={window:w,_cache:{summary:{debtCount:19,totalDebtEst:9500000},summaryClubId:'club-A',summaryMonth:'2026-09'}};
  vm.createContext(sandbox);vm.runInContext(match[0].replace('export function','function')+';this.summary=getStudentsSummary;',sandbox);
  const result=sandbox.summary();assert.equal(result.debtCount,null);assert.equal(result.totalDebtEst,null);assert.equal(result.debtSummaryPending,true);
  w.__store.clubId='club-A';w.__store.selectedMonth='2026-09';w.getDebtProfileCoverageStatus=()=>({ready:true,sameClub:true});
  const valid=sandbox.summary();assert.equal(valid.debtCount,19);assert.equal(valid.totalDebtEst,9500000);assert.equal(valid.debtSummaryPending,false);
});
await check('S02 dashboard badge shows syncing instead of fake zero',()=>{
  const source=fs.readFileSync('js/modules/dashboard.js','utf8');
  assert.match(source,/debtSummaryPending \? 'Đang đồng bộ…'/);
});
await check('G01 release & critical preserve prior gates and lock D1C3B2',()=>{
  const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
  for(const name of ['check:release','check:all:critical']){
    const script=pkg.scripts[name]||'';
    assert.ok(script.includes('check:d1c3b-debt-authoritative-profile-coverage'));
    assert.ok(script.includes('check:d1c3b1-debt-runtime-closure'));
    assert.ok(script.includes('check:d1c3b2-authority-continuity'));
  }
});
console.log(`D1C3B2 actual-handler closure: ${passed} passed, ${failed} failed.`);
if(failed) process.exitCode=1;
