#!/usr/bin/env node
// D1C3B4 actual production listener and fallback callbacks; no stubs of the tested functions.
import assert from 'node:assert/strict';
import { studentProfileStore as store, resetStudentProfileStore } from '../js/data/studentProfileStore.js';
import * as profiles from '../js/listeners/profiles.listeners.js';
let passed=0,failed=0;
const check=async(name,cb)=>{try{await cb();console.log('PASS',name);passed++;}catch(e){console.error('FAIL',name,e.stack || e.message);failed++;}};
globalThis.window=globalThis;
const listeners=new Map(), callbacks=[];let reads=0, hydrate=0, dirty=0, queued=[];let errors=[];
window.__profileScaleMetrics={};
window.studentProfileStore=store;
window._syncAllProfilesLegacy=()=>{};
window.RoleReadBoundary={isCoachAttendanceOnly:()=>false,canMount:()=>true};
window.getAppContext=()=>({});
window._moduleDashboard={reconcileHydrationEvidence:()=>{hydrate++},markStatsDirty:()=>{dirty++}};
window.invalidateList=()=>{};window.invalidateLists=()=>{};window.invalidateStudents=()=>{};
window.invalidateByDomain=()=>{};window.invalidateDashboard=()=>{};
window.scheduleAutomaticDebtProfileCoverage=()=>{};window.recordRuntimeError=(...args)=>errors.push(args);
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
 profiles.resetProfilesListeners('test-reset');resetStudentProfileStore('test-reset');listeners.clear();callbacks.length=0;reads=0;hydrate=0;dirty=0;errors=[];
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

const settle=()=>new Promise(resolve=>setImmediate(resolve));
const silent=async fn=>{const warn=console.warn;console.warn=()=>{};try{return await fn();}finally{console.warn=warn}};
await check('R01-01 same-owner duplicate mount legacy error attributed once',()=>silent(()=>{
 reset();mount();const oldErr=callbacks.at(-1).err;const before=callbacks.length;
 mount();assert.equal(callbacks.length,before,'idempotent existing listener');
 oldErr({code:'permission-denied',message:'denied'});
 assert.equal(profiles.getProfilesListenerMetrics().activeQueryErrorCount,1);
}));
await check('R01-02 same-owner legacy data remains eligible after duplicate mount',()=>{
 reset();mount();const live=callbacks.at(-1).cb;mount();live(snap({a:make('a','Mặc định')}));
 assert.deepEqual(activeIds(),[],'single alias is provisional, not complete');
 callbacks[0].cb(snap({p:make('p','CS1')}));
 assert.deepEqual(activeIds(),['a','p'],'same-owner alias remains healthy and joins verified primary');
});
await check('R01-03 stale legacy error after logout/club switch is ignored',()=>silent(()=>{
 reset();mount();const old=callbacks.at(-1).err;
 newOwner('admin','B','',2,'adminB');old({code:'permission-denied'});
 assert.equal(profiles.getProfilesListenerMetrics().activeQueryErrorCount,0);
}));
await check('R01-04 same-key new UID/epoch must reown listener, stale callback denied',()=>silent(()=>{
 reset();mount();const old=callbacks.at(-1).err;const before=callbacks.length;
 window.__verifiedAuthContextState={...window.__verifiedAuthContextState,uid:'u2',generation:2};
 mount();assert.equal(callbacks.length,before+2,'new owner must be mounted for new uid/epoch');
 const current=callbacks.at(-1).err;
 old({code:'permission-denied'});
 assert.equal(profiles.getProfilesListenerMetrics().activeQueryErrorCount,0);
 current({code:'permission-denied'});
 assert.equal(profiles.getProfilesListenerMetrics().activeQueryErrorCount,1);
}));
await check('R01-07 stale primary error after auth epoch change cannot start fallback',async()=>silent(async()=>{
 reset();mount();const error=callbacks[0].err;
 window.__verifiedAuthContextState={...window.__verifiedAuthContextState,uid:'u2',generation:2};
 getDocs=async()=>snap({});error({code:'permission-denied'});await settle();
 assert.equal(profiles.getProfilesListenerMetrics().activeQueryErrorCount,0);
 assert.equal(reads,0);
}));
// R1: branch-complete realtime makes the legacy status-zero-probe obsolete.
// Retain the original race matrix, now requiring *zero* extra SDK reads.
await check('R02-01 empty primary followed by same-key new UID creates no zero-probe',async()=>silent(async()=>{
 reset();mount();const old=callbacks[0].cb;old(snap({}));assert.equal(reads,0);
 newOwner('coach','A','CS1',2,'u2');old(snap({}));await settle();assert.equal(reads,0);
}));
await check('R02-02 late empty from Club A cannot fallback into B',async()=>silent(async()=>{
 reset();mount();const old=callbacks[0].cb;old(snap({}));newOwner('coach','B','CS2',2,'uB');old(snap({}));await settle();assert.equal(reads,0);
}));
await check('R02-03 old empty Coach snapshot after Admin/logout has zero reads',async()=>silent(async()=>{
 reset();mount();const old=callbacks[0].cb;newOwner('admin','B','',2,'adminB');old(snap({}));await settle();assert.equal(reads,0);
}));
await check('R02-04 CS1→CS2 old empty callback never probes other branch',async()=>silent(async()=>{
 reset();mount();const old=callbacks[0].cb;newOwner('coach','A','CS2',2,'u1');old(snap({}));await settle();assert.equal(reads,0);
}));
await check('R02-05 legitimate empty branch is complete only after alias server and zero extra reads',async()=>silent(async()=>{
 reset();mount();callbacks[0].cb(snap({}));assert.notEqual(profiles.getProfilesListenerMetrics().coachRosterReadiness,'verified');
 callbacks[1].cb(snap({}));await settle();assert.equal(reads,0);assert.equal(profiles.getProfilesListenerMetrics().coachRosterReadiness,'verified');
}));
await check('R02-06 repeated empty authoritative snapshots cause no read storm',async()=>silent(async()=>{
 reset();mount();callbacks[0].cb(snap({}));callbacks[1].cb(snap({}));
 for(let i=0;i<5;i++){callbacks[0].cb(snap({},undefined,[]));callbacks[1].cb(snap({},undefined,[]));}
 await settle();assert.equal(reads,0);
}));
await check('R02-07 stale primary error after owner switch does not attribute or fallback',async()=>silent(async()=>{
 reset();mount();const old=callbacks[0].err;newOwner('coach','B','CS2',2,'u2');
 old(Object.assign(new Error('denied'),{code:'permission-denied'}));await settle();
 assert.equal(errors.length,0);assert.equal(reads,0);
}));
await check('R02-08 stale fallback continuation cannot mutate new owner',async()=>silent(async()=>{
 reset();mount();let resolveMain,resolveAlias;
 getDocs=q=>new Promise(r=>{const branch=q.parts.find(c=>c.where?.[0]==='branch')?.where?.[2];if(branch==='CS1')resolveMain=r;else resolveAlias=r});
 const pending=profiles.loadCoachBranchProfilesFallback('probe-test');await Promise.resolve();
 newOwner('admin','B','',2,'adm');resolveMain(snap({old:make('old')}));resolveAlias(snap({legacy:make('legacy','Mặc định')}));
 assert.equal(await pending,false);assert(!activeIds().includes('old'));
}));
console.log(`D1C3B5 R01/R02 ACTUAL HANDLERS: PASS ${passed}, FAIL ${failed}`);
if(failed)process.exitCode=1;
