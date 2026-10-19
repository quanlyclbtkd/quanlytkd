#!/usr/bin/env node
// Node-only isolated actual Admin handler benchmark. Not a mobile/browser benchmark.
import {performance} from 'node:perf_hooks';
import {resetStudentProfileStore,studentProfileStore} from '../js/data/studentProfileStore.js';
import {mountActiveProfilesListener,resetProfilesListeners} from '../js/listeners/profiles.listeners.js';
globalThis.window=globalThis;let cb,visits=0,invalidates=0;
window.__profileScaleMetrics={};window.studentProfileStore=studentProfileStore;
window.__store={clubId:'bench',userRole:'admin',coachBranch:'',profiles:{}};
window.userRole='admin';window.getAppContext=()=>({});window.RoleReadBoundary={canMount:()=>true,isCoachAttendanceOnly:()=>false};
window.__verifiedAuthContextState={ready:true,role:'admin',clubId:'bench',generation:1,uid:'admin'};
window._syncAllProfilesLegacy=()=>{};window.hasListener=()=>false;window.removeListener=()=>true;
window.safeRegisterSnapshot=(key,fn)=>{fn();return true};window.markListenerSnapshot=()=>{};
window.invalidateByDomain=()=>{invalidates++};window.invalidateDashboard=()=>{};window.invalidateList=()=>{};
window.invalidateLists=()=>{};window.invalidateStudents=()=>{};window._moduleDashboard={reconcileHydrationEvidence:()=>{}};
window.scheduleAutomaticDebtProfileCoverage=()=>{};
window._fb_init={onSnapshot:(query,opts,fn)=>{cb=fn;return()=>{}}};
function snapshot(data,first){return {size:data.length,metadata:{fromCache:false,hasPendingWrites:false},forEach(fn){for(const [id,value] of data){visits++;fn({id,data:()=>value})}},docChanges(){return first ? data.map(([id,value])=>({type:'added',doc:{id,data:()=>value}})):[]}};}
for(const n of [1000,1500]){
 resetProfilesListeners('bench-reset');resetStudentProfileStore('bench-reset');visits=invalidates=0;
 const docs=Array.from({length:n},(_,i)=>['b'+i,{branch:'CS1',status:'active',name:'Student '+i}]);
 mountActiveProfilesListener({clubId:'bench',role:'admin',profRef:{path:'clubs/bench/profiles'},db:{}});
 const t0=performance.now();cb(snapshot(docs,true));const firstMs=performance.now()-t0;const firstVisits=visits;
 const i0=invalidates;
 const t1=performance.now();cb(snapshot(docs,false));const noOpMs=performance.now()-t1;
 console.log(JSON.stringify({scenario:'node-actual-admin-listener',profiles:n,firstMs:+firstMs.toFixed(3),metadataMs:+noOpMs.toFixed(3),firstVisits,metadataVisits:visits-firstVisits,extraInvalidations:invalidates-i0,heapMB:+(process.memoryUsage().heapUsed/1048576).toFixed(2)}));
}
