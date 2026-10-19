#!/usr/bin/env node
// D1C3B4 actual production listener and fallback callbacks; no stubs of the tested functions.
import assert from 'node:assert/strict';
import { studentProfileStore as store, resetStudentProfileStore } from '../js/data/studentProfileStore.js';
import * as profiles from '../js/listeners/profiles.listeners.js';
let passed=0,failed=0;
const check=async(name,cb)=>{try{await cb();console.log('PASS',name);passed++;}catch(e){console.error('FAIL',name,e.stack || e.message);failed++;}};
globalThis.window=globalThis;
const listeners=new Map(), callbacks=[];let reads=0, hydrate=0, dirty=0, queued=[];
window.__profileScaleMetrics={};
window.studentProfileStore=store;
window._syncAllProfilesLegacy=()=>{};
window.RoleReadBoundary={isCoachAttendanceOnly:()=>false,canMount:()=>true};
window.getAppContext=()=>({});
window._moduleDashboard={reconcileHydrationEvidence:()=>{hydrate++},markStatsDirty:()=>{dirty++}};
window.invalidateList=()=>{};window.invalidateLists=()=>{};window.invalidateStudents=()=>{};
window.invalidateByDomain=()=>{};window.invalidateDashboard=()=>{};
window.scheduleAutomaticDebtProfileCoverage=()=>{};
window.hasListener=k=>listeners.has(k);
window.removeListener=k=>{listeners.get(k)?.unsub?.();listeners.delete(k);return true};
window.safeRegisterSnapshot=(key,make)=>{if(listeners.has(key))return false;const unsub=make();listeners.set(key,{unsub});return true};
window.markListenerSnapshot=()=>{};
let getDocs=async()=>({size:0,forEach(){},metadata:{fromCache:false,hasPendingWrites:false}});
window._fb_init={query:(ref,...parts)=>({ref,parts}),where:(...parts)=>({where:parts}),limit:n=>({limit:n}),
  onSnapshot:(query,opt,cb,err)=>{let callback=typeof opt==='function'?opt:cb;callbacks.push({query,cb:callback,err:typeof opt==='function'?cb:err});return()=>{}},
  getDocs:(query)=>{reads++;return getDocs(query)}};
const snap=(p={},metadata={fromCache:false,hasPendingWrites:false},changes)=>({size:Object.keys(p).length,metadata,
 forEach(fn){for(const [id,value] of Object.entries(p))fn({id,data:()=>value});},
 docChanges(){return changes===undefined?Object.keys(p).map(id=>({type:'added',doc:{id}})):changes;}});
const make=(id,branch='CS1',status='active')=>({name:id,branch,status});
function reset(role='coach',club='A',branch='CS1',gen=1,uid='u1'){
 profiles.resetProfilesListeners('test-reset');resetStudentProfileStore('test-reset');listeners.clear();callbacks.length=0;reads=0;hydrate=0;dirty=0;
 window.__store={clubId:club,currentClubId:club,userRole:role,coachBranch:role==='coach'?branch:'',profiles:{}};
 window.userRole=role;window.coachBranch=role==='coach'?branch:'';
 window.__verifiedAuthContextState={ready:true,role,clubId:club,coachBranch:role==='coach'?branch:'',generation:gen,uid};
 getDocs=async()=>snap({});
}
function mount(role='coach',club='A',branch='CS1'){return profiles.mountActiveProfilesListener({clubId:club,role,coachBranch:role==='coach'?branch:'',profRef:{path:`clubs/${club}/profiles`},db:{}});}
function newOwner(role,club,branch,gen,uid){
 profiles.resetProfilesListeners('owner-switch');resetStudentProfileStore('owner-switch');listeners.clear();
 window.__store={clubId:club,currentClubId:club,userRole:role,coachBranch:role==='coach'?branch:'',profiles:{}};
 window.userRole=role;window.coachBranch=role==='coach'?branch:'';
 window.__verifiedAuthContextState={ready:true,role,clubId:club,coachBranch:role==='coach'?branch:'',generation:gen,uid};
 mount(role,club,branch);
}
function activeIds(){return Object.keys(store.getAllProfilesCompat() || {}).sort();}
await check('B4-01 stale legacy-primary snapshot cannot enter new club or role',()=>{
 reset();mount();const legacy=callbacks.at(-1).cb;
 newOwner('admin','B','',2,'admin-B');const admin=callbacks.at(-1).cb;
 admin(snap({B1:make('B1','CS2')})); const before=activeIds();
 legacy(snap({A1:make('A1','Mặc định')}));
 assert.deepEqual(activeIds(),before);assert(!activeIds().includes('A1'));
});
await check('B4-02 stale legacy-primary same club/new uid, branch-switch, multi-switch ignored',()=>{
 reset();mount();const old=callbacks.at(-1).cb;
 newOwner('coach','B','CS2',2,'u2');newOwner('coach','A','CS1',3,'u3');
 const canonical=callbacks.at(-2).cb;canonical(snap({newA:make('newA')}));const before=activeIds();
 old(snap({oldA:make('oldA','Mặc định')}));assert.deepEqual(activeIds(),before);
});
await check('B4-03 live CS1 canonical and Mặc định aliases merge without duplicate',()=>{
 reset();mount();assert.equal(callbacks.length,2);
 callbacks[0].cb(snap({one:make('one')}));callbacks[1].cb(snap({legacy:make('legacy','Mặc định'),one:make('one','Mặc định')}));
 assert.deepEqual(activeIds(),['legacy','one']);
});
await check('B4-04 pending Coach branch fallback from A does not mutate B session',async()=>{
 reset();mount();let resolveCS1,resolveLegacy;
 getDocs=query=>new Promise(resolve=>{const branch=query.parts.find(c=>c.where?.[0]==='branch')?.where?.[2];if(branch==='CS1')resolveCS1=resolve;else resolveLegacy=resolve;});
 const pending=profiles.loadCoachBranchProfilesFallback('held');await Promise.resolve();
 assert.equal(reads,2);
 newOwner('admin','B','',2,'admin-B');callbacks.at(-1).cb(snap({B1:make('B1','CS2')}));const before=activeIds();
 resolveCS1(snap({A1:make('A1')}));resolveLegacy(snap({A2:make('A2','Mặc định')}));
 assert.equal(await pending,false);assert.deepEqual(activeIds(),before);assert.equal(profiles.getProfilesListenerMetrics().fallbackCompleted,false);
});
await check('B4-05 stale fallback finally cannot clear new-session fallback owner',async()=>{
 reset();mount();let resolveOld1,resolveOld2,resolveNew1,resolveNew2;
 let phase='old';getDocs=query=>new Promise(resolve=>{const alias=query.parts.find(c=>c.where?.[0]==='branch')?.where?.[2];
 if(phase==='old'){if(alias==='CS1')resolveOld1=resolve;else resolveOld2=resolve;}else{if(alias==='CS1')resolveNew1=resolve;else resolveNew2=resolve;}});
 const old=profiles.loadCoachBranchProfilesFallback('old');await Promise.resolve();
 newOwner('coach','B','CS1',2,'u2');phase='new';const fresh=profiles.loadCoachBranchProfilesFallback('new');await Promise.resolve();
 assert.equal(reads,4);resolveOld1(snap({old1:make('old1')}));resolveOld2(snap({old2:make('old2','Mặc định')}));
 assert.equal(await old,false);assert.equal(profiles.getProfilesListenerMetrics().fallbackInProgress,true);
 resolveNew1(snap({new1:make('new1')}));resolveNew2(snap({new2:make('new2','Mặc định')}));
 assert.equal(await fresh,true);assert.deepEqual(activeIds(),['new1','new2']);
});
await check('B4-06 partial aliases permission-denied never promote Coach fallback',async()=>{
 reset();mount();getDocs=q=>q.parts.some(c=>c.where?.[2]==='Mặc định')?Promise.reject(Object.assign(new Error('permission denied'),{code:'permission-denied'})):Promise.resolve(snap({A1:make('A1')}));
 const prev=console.error;console.error=()=>{};
 try{assert.equal(await profiles.loadCoachBranchProfilesFallback('partial-denied'),false);assert.equal(profiles.getProfilesListenerMetrics().fallbackCompleted,false)}finally{console.error=prev;}
});
await check('B4-07 Admin cached→server metadata-only hydrates Dashboard exactly once',()=>{
 reset('admin');mount('admin');const cb=callbacks[0].cb;
 const docs={a:make('a'),b:make('b')};cb(snap(docs,{fromCache:true,hasPendingWrites:false}));assert.equal(hydrate,0);
 cb(snap(docs,{fromCache:false,hasPendingWrites:false},[]));assert.equal(hydrate,1);
 cb(snap(docs,{fromCache:false,hasPendingWrites:false},[]));assert.equal(hydrate,1);
 assert.equal(profiles.getProfilesListenerMetrics().fullAuthorityComplete,true);
});
await check('B4-08 Admin server-first, cache repeated, doc mutation, reset hydration',()=>{
 reset('admin');mount('admin');const cb=callbacks[0].cb;
 cb(snap({a:make('a')},{fromCache:true,hasPendingWrites:false}));cb(snap({a:make('a')},{fromCache:true,hasPendingWrites:false}));assert.equal(hydrate,0);
 cb(snap({a:make('a')},{fromCache:false,hasPendingWrites:false},[]));assert.equal(hydrate,1);
 cb(snap({a:make('a'),b:make('b')},{fromCache:false,hasPendingWrites:false},[{type:'added',doc:{id:'b'}}]));assert.equal(hydrate,1);assert.equal(dirty,1);
 newOwner('admin','B','',2,'b');callbacks.at(-1).cb(snap({c:make('c')},{fromCache:false,hasPendingWrites:false}));assert.equal(hydrate,2);
});
console.log(`D1C3B4 actual handler: PASS ${passed}, FAIL ${failed}`);
if(failed)process.exitCode=1;
await check('B4-09 Coach fallback rejects cache-only partial snapshots',async()=>{
 reset();mount();getDocs=q=>Promise.resolve(snap({p:make('p')},{fromCache:true,hasPendingWrites:false}));
 assert.equal(await profiles.loadCoachBranchProfilesFallback('offline-cache'),false);
 assert.equal(profiles.getProfilesListenerMetrics().fallbackCompleted,false);
});
await check('B4-10 Coach search service drops stale query result after auth switch',async()=>{
 reset();mount();
 const {StudentService}=await import('../js/services/students.service.js');
 window.__store.db={};let resolveFirst;let calls=0;
 window._fb_init={...window._fb_init,collection:(...a)=>({collection:a}),
 query:(q,...args)=>({base:q,constraints:args}),where:(...a)=>({where:a}),orderBy:(...a)=>({orderBy:a}),
 startAt:v=>({startAt:v}),endAt:v=>({endAt:v}),limit:v=>({limit:v}),
 getDocs:q=>{calls++;if(calls===1)return new Promise(r=>{resolveFirst=r});return Promise.resolve(snap({}));}};
 const pending=StudentService.searchProfilesServerSide('van',{statusFilter:'active'});
 await Promise.resolve();
 newOwner('admin','B','',2,'admin-B');
 resolveFirst(snap({old:{name:'van',branch:'CS1',status:'active'}}));
 const result=await pending;
 assert.deepEqual(result.items,[]);assert.equal(result.source,'context-stale');assert.equal(calls,1,'no follow-on old-session reads');
});
console.log(`D1C3B4 extended: PASS ${passed}, FAIL ${failed}`);
if(failed)process.exitCode=1;
await check('B4-11 idempotent same-session Coach remount does not starve live legacy callback',()=>{
 reset();mount();const legacy=callbacks.at(-1).cb;const n=callbacks.length;
 mount();assert.equal(callbacks.length,n);
 callbacks[0].cb(snap({main:make('main')}));legacy(snap({legacy:make('legacy','Mặc định')}));
 assert.deepEqual(activeIds(),['legacy','main']);
});
console.log(`D1C3B4 TOTAL: PASS ${passed}, FAIL ${failed}`);
if(failed)process.exitCode=1;
