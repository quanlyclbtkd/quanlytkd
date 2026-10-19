#!/usr/bin/env node
// D1C3B6 RED/GREEN: actual imported production handlers and real in-memory listener registry.
import assert from 'node:assert/strict';
import {studentProfileStore as store,resetStudentProfileStore} from '../js/data/studentProfileStore.js';
import * as profiles from '../js/listeners/profiles.listeners.js';
import * as registry from '../js/utils/listeners.js';
globalThis.window=globalThis;
let callbacks=[],visits=0,invalidations=0,statsDirty=0,readCalls=0;
window.studentProfileStore=store;window.__profileScaleMetrics={};window.getAppContext=()=>({});
window._syncAllProfilesLegacy=()=>{};window.RoleReadBoundary={isCoachAttendanceOnly:()=>true,canMount:()=>true};
window.invalidateList=()=>{invalidations++};window.invalidateLists=()=>{};
window.invalidateStudents=()=>{};window.invalidateByDomain=(domain)=>{if(domain==='attendance')invalidations++};window.invalidateDashboard=()=>{};
window.scheduleAutomaticDebtProfileCoverage=()=>{};
window._moduleDashboard={reconcileHydrationEvidence:()=>{},markStatsDirty:()=>{statsDirty++}};
window.hasListener=registry.hasListener;window.removeListener=registry.removeListener;
window.safeRegisterSnapshot=registry.safeRegisterSnapshot;window.markListenerSnapshot=registry.markListenerSnapshot;
const build=(ref,...parts)=>({ref,parts});
window._fb_init={query:build,where:(...where)=>({where}),limit:n=>({limit:n}),onSnapshot:(query,opts,cb,err)=>{
  const entry={query,cb:typeof opts==='function'?opts:cb,err:typeof opts==='function'?cb:err};callbacks.push(entry);return()=>{entry.disposed=true};
},getDocs:async()=>{readCalls++;return snap({})}};
function snap(items,changes,meta={fromCache:false,hasPendingWrites:false}){
 return {size:Object.keys(items).length,metadata:meta,empty:!Object.keys(items).length,
  forEach(fn){Object.entries(items).forEach(([id,obj])=>{visits++;fn({id,data:()=>obj})})},
  docChanges(){return changes===undefined?Object.entries(items).map(([id,obj])=>({type:'added',doc:{id,data:()=>obj}})):changes}};
}
const model=(id,branch='CS1',status='active')=>({name:id,branch,status});
const profileItems=n=>Object.fromEntries(Array.from({length:n},(_,i)=>['profile'+i,model('P'+i)]));
function reset(role='coach',club='A',branch='CS1',generation=1,uid='coach-1'){
 profiles.resetProfilesListeners('D1C3B6-reset');registry.cleanupAllListeners('D1C3B6-reset');resetStudentProfileStore('D1C3B6-reset');
 callbacks=[];visits=0;invalidations=0;statsDirty=0;readCalls=0;
 window.__store={clubId:club,currentClubId:club,userRole:role,coachBranch:branch,profiles:{}};
 window.userRole=role;window.coachBranch=branch;
 window.__verifiedAuthContextState={ready:true,role,clubId:club,coachBranch:branch,generation,uid};
}
function mount(role=window.userRole,club=window.__store.clubId,branch=window.coachBranch){return profiles.mountActiveProfilesListener({clubId:club,role,coachBranch:branch,profRef:{path:`clubs/${club}/profiles`},db:{}})}
const activeIds=()=>Object.keys(store.getAllProfilesCompat()||{}).sort();
let passed=0,failed=0;
const scope=process.env.D1C3B6_SCOPE||'all';
async function test(id,run){
 if(scope==='listener'&&!id.startsWith('L01'))return;
 if(scope==='metadata'&&!id.startsWith('P0'))return;
 if(scope==='roster'&&!id.startsWith('E0'))return;try{await run();console.log('PASS',id);passed++}catch(err){console.error('FAIL',id,err.stack||err);failed++}}
await test('L01-01 missing CS1 legacy listener is re-registered only in its existing slot',()=>{
 reset();mount();assert.equal(callbacks.length,2);const primary=callbacks[0],legacy=callbacks[1];
 const key=Array.from(registry.getListenerMetrics?.()?.activeKeys||[])[0];
 // Use the exact existing registry key, not an invented slot.
 const legacyKey='students:profiles:active:A:coach:CS1:legacy-primary';
 assert.equal(registry.hasListener(legacyKey),true);
 registry.removeListener(legacyKey,'simulate-terminal-error');
 mount();assert.equal(callbacks.length,3,'a missing slot must be restored');
 assert.equal(callbacks[0],primary,'healthy primary stays unchanged');
 assert.equal(callbacks[1].disposed,true);assert.equal(callbacks[2].disposed,undefined);
 assert.equal(registry.hasListener(legacyKey),true);
});
await test('L01-02 missing primary listener is restored without replacing healthy legacy',()=>{
 reset();mount();const originalLegacy=callbacks[1];
 registry.removeListener('students:profiles:active:A:coach:CS1','simulate-terminal-error');
 mount();assert.equal(callbacks.length,3);assert.equal(originalLegacy.disposed,undefined);
 assert.equal(registry.hasListener('students:profiles:active:A:coach:CS1'),true);
 originalLegacy.cb(snap({legacy:model('legacy','Mặc định')}));
 assert(!activeIds().includes('legacy'),'alias alone must remain provisional');
 callbacks[2].cb(snap({one:model('one','CS1')}));
 assert(activeIds().includes('legacy'),'healthy alias contributes after both slots are server verified');
});
await test('L01-03 ten duplicate mounts preserve two active Coach CS1 listeners',()=>{
 reset();mount();for(let i=0;i<10;i++)mount();assert.equal(callbacks.length,2);assert.equal(registry.hasListener('students:profiles:active:A:coach:CS1'),true);
 assert.equal(registry.hasListener('students:profiles:active:A:coach:CS1:legacy-primary'),true);
});

await test('L01-05 repaired legacy slot must consume first server snapshot even when docChanges empty',()=>{
 reset();mount();callbacks[1].cb(snap({old:model('old','Mặc định')}));
 const before=visits;
 registry.removeListener('students:profiles:active:A:coach:CS1:legacy-primary','recreate');
 mount();assert.equal(callbacks.length,3);
 callbacks[2].cb(snap({newone:model('newone','Mặc định')},[]));
 assert(visits>before,'first server snapshot on restored slot must not be skipped');
 assert(!activeIds().includes('newone'),'restored alias alone is not complete');
 callbacks[0].cb(snap({one:model('one','CS1')}));
 assert(activeIds().includes('newone'),'restored slot becomes authoritative after healthy primary server snapshot');
});
await test('L01-04 cleanup unsubscribe failure must fail closed without opening new listener',()=>{
 reset();
 const priorOnSnapshot=window._fb_init.onSnapshot;
 window._fb_init.onSnapshot=(query,opts,cb,err)=>{
   const callback={query,cb,err,disposeFails:true};callbacks.push(callback);
   return ()=>{throw new Error('unsubscribe failed')};
 };
 try{
  mount();assert.equal(callbacks.length,2);
  window.__verifiedAuthContextState={...window.__verifiedAuthContextState,uid:'new-uid',generation:2};
  const result=mount();
  assert.equal(result,false,'must fail closed when physical unsubscribe failed');
  assert.equal(callbacks.length,2,'do not open an additional physical subscription');
 }finally{window._fb_init.onSnapshot=priorOnSnapshot;}
});
await test('P01-01 Admin metadata-only server snapshot visits zero documents',()=>{
 reset('admin','A','',1,'admin');mount();const docs=profileItems(1500);
 callbacks[0].cb(snap(docs));const first=visits;
 assert(first>=1500);
 callbacks[0].cb(snap(docs,[]));assert.equal(visits,first,'metadata-only event must not enumerate documents');
});
await test('P01-02 first server acknowledgment of cache-only snapshot is never skipped',()=>{
 reset('admin','A','',1,'admin');mount();const docs=profileItems(4);
 callbacks[0].cb(snap(docs,undefined,{fromCache:true,hasPendingWrites:false}));
 const before=visits;callbacks[0].cb(snap(docs,[],{fromCache:false,hasPendingWrites:false}));
 assert(visits>before,'must consume first server evidence');assert.equal(profiles.getProfilesListenerMetrics().fullAuthorityComplete,true);
});
await test('P02-01 Coach metadata-only server snapshot adds no invalidations',()=>{
 reset();mount();callbacks[0].cb(snap({one:model('one')}));const before=invalidations,beforeVisits=visits;
 callbacks[0].cb(snap({one:model('one')},[]));assert.equal(invalidations,before,'primary metadata-only no-op');assert.equal(visits,beforeVisits,'primary metadata-only zero visits');
});
await test('P02-02 legacy Coach metadata-only server snapshot adds no invalidations',()=>{
 reset();mount();callbacks[1].cb(snap({legacy:model('legacy','Mặc định')}));const before=invalidations,beforeVisits=visits;
 callbacks[1].cb(snap({legacy:model('legacy','Mặc định')},[]));assert.equal(invalidations,before,'legacy metadata-only no-op');assert.equal(visits,beforeVisits,'legacy metadata-only zero visits');
});
await test('E02-01 fallback legacy profile cannot silently disappear when partial primary arrives',async()=>{
 reset();mount();let calls=0;
 window._fb_init.getDocs=async()=>{calls++;return snap(calls===1?{legacy:model('legacy','CS1','Đang tập')}:{},undefined,{fromCache:false,hasPendingWrites:false})};
 assert.equal(await profiles.loadCoachBranchProfilesFallback('test'),true);
 assert(activeIds().includes('legacy'),'fallback contains legacy');
 callbacks[0].cb(snap({canonical:model('canonical')}));
 assert(activeIds().includes('legacy'),'late filtered query must not silently erase visible legacy profile');
});

for(const n of [1000,1500]) await test('P01-03 '+n+' profiles baseline/metadata traversal and timing',()=>{
 reset('admin','A','',1,'admin');mount();const docs=profileItems(n);
 const t0=performance.now();callbacks[0].cb(snap(docs));const firstMs=performance.now()-t0;
 assert.equal(visits,n,'first snapshot must consume each profile once');
 const t1=performance.now();callbacks[0].cb(snap(docs,[]));const noopMs=performance.now()-t1;
 assert.equal(visits,n,'metadata-only zero additional visits');
 const heapMB=+(process.memoryUsage().heapUsed/1048576).toFixed(2);
 console.log('B6_NODE_BENCH',JSON.stringify({profiles:n,firstMs:+firstMs.toFixed(3),metadataNoopMs:+noopMs.toFixed(3),metadataDocumentVisits:0,heapUsedMB:heapMB,sdkReads:readCalls}));
});
console.log('D1C3B6 ACTUAL HANDLERS',passed,'PASS',failed,'FAIL');if(failed)process.exitCode=1;
