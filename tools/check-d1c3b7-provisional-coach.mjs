#!/usr/bin/env node
// D1C3B7: actual production handlers; source RED → guarded provisional GREEN.
import assert from 'node:assert/strict';
import * as profiles from '../js/listeners/profiles.listeners.js';
import {studentProfileStore as store, resetStudentProfileStore} from '../js/data/studentProfileStore.js';
import * as registry from '../js/utils/listeners.js';
import {classifyProfileStatus} from '../js/data/profileStatusConfig.js';
globalThis.window=globalThis;
let callbacks=[],readCalls=0,invalidations=0;
window.studentProfileStore=store;window.__profileScaleMetrics={};window._syncAllProfilesLegacy=()=>{};
window.RoleReadBoundary={isCoachAttendanceOnly:()=>true,canMount:()=>true};
window.getAppContext=()=>({}); window.invalidateLists=()=>{};
window.invalidateByDomain=(domain)=>{if(domain==='attendance')invalidations++};
window.invalidateDashboard=()=>{};
window.hasListener=registry.hasListener;window.removeListener=registry.removeListener;
window.safeRegisterSnapshot=registry.safeRegisterSnapshot;window.markListenerSnapshot=registry.markListenerSnapshot;
const fixture={
 canonical:{branch:'CS1',status:'active'},
 missing:{branch:'CS1'},
 vietnamese:{branch:'CS1',status:'Đang tập'},
 training:{branch:'Mặc định',status:'training'},
 quit:{branch:'CS1',status:'quit'}
};
const snapshot=(map,changes=undefined,metadata={fromCache:false,hasPendingWrites:false})=>({
  metadata,size:Object.keys(map).length,empty:Object.keys(map).length===0,
  forEach(fn){for(const [id,v] of Object.entries(map))fn({id,data:()=>v})},
  docChanges(){return changes ?? Object.entries(map).map(([id,v])=>({type:'added',doc:{id,data:()=>v}}))}
});
window._fb_init={query:(ref,...parts)=>({ref,parts}),where:(...args)=>({where:args}),limit:n=>({limit:n}),onSnapshot:(query,opts,cb,err)=>{
 const entry={query,cb:typeof opts==='function'?opts:cb,err:typeof opts==='function'?cb:err};callbacks.push(entry);return()=>{entry.disposed=true};
},getDocs:async(query)=>{readCalls++;const branch=query.parts.find(p=>p.where?.[0]==='branch')?.where?.[2];
 return snapshot(Object.fromEntries(Object.entries(fixture).filter(([id,p])=>p.branch===branch)));
}};
function reset(){profiles.resetProfilesListeners('B7-reset');registry.cleanupAllListeners('B7-reset');resetStudentProfileStore('B7-reset');
 callbacks=[];readCalls=0;invalidations=0;
 window.__store={clubId:'A',currentClubId:'A',userRole:'coach',coachBranch:'CS1'};
 window.userRole='coach';window.coachBranch='CS1';
 window.__verifiedAuthContextState={ready:true,role:'coach',clubId:'A',coachBranch:'CS1',generation:1,uid:'coachA'};
}
function mount(){return profiles.mountActiveProfilesListener({clubId:'A',role:'coach',coachBranch:'CS1',profRef:{path:'clubs/A/profiles'},db:{}})}
function ids(){return Object.keys(store.getAllProfilesCompat()).sort()}
let pass=0,fail=0;
async function test(name,fn){try{await fn();pass++;console.log('PASS '+name)}catch(e){fail++;console.error('FAIL '+name+': '+e.message)}}
if(process.env.D1C3B7_SCOPE !== 'provisional') await test('E01-coverage-source: CS1 query must not pre-filter canonical-active status',()=>{
 reset();mount();
 assert.equal(Object.values(fixture).filter(p=>classifyProfileStatus(p)==='active').length,4);
 const primary=callbacks[0].query.parts;
 assert(primary.every(p=>p.where?.[0]!=='status'),'status prefilter still discards legacy active before classifier');
});
await test('E02-provisional: fallback legacy must survive first partial primary snapshot',async()=>{
 reset();mount();assert.equal(callbacks.length,2);
 assert.equal(await profiles.loadCoachBranchProfilesFallback('B7-test'),true);
 assert(ids().includes('missing')&&ids().includes('vietnamese')&&ids().includes('training'));
 const before=invalidations;
 callbacks[0].cb(snapshot({canonical:fixture.canonical}));
 assert(ids().includes('missing')&&ids().includes('vietnamese')&&ids().includes('training'), 'fallback provisional roster overwritten by partial primary');
 assert.equal(profiles.getProfilesListenerMetrics().coachRosterReadiness,'provisional');
 assert.equal(invalidations,before,'partial primary should not invalidate fallback provisional roster');
});
await test('E02-provisional: metadata cache/pending cannot mark Coach roster verified',()=>{
 reset();mount();
 callbacks[0].cb(snapshot({canonical:fixture.canonical},undefined,{fromCache:true,hasPendingWrites:false}));
 callbacks[1].cb(snapshot({},undefined,{fromCache:false,hasPendingWrites:true}));
 assert.notEqual(profiles.getProfilesListenerMetrics().coachRosterReadiness,'verified');
});
await test('E02-authority: branch-only realtime becomes verified after two server slots',()=>{
 reset();mount();callbacks[0].cb(snapshot({canonical:fixture.canonical}));callbacks[1].cb(snapshot({}));
 assert.equal(profiles.getProfilesListenerMetrics().coachRosterReadiness,'verified');
});
console.log(`D1C3B7 ACTUAL-HANDLER: ${pass} PASS / ${fail} FAIL; SDK calls=${readCalls}`);
if(fail)process.exitCode=1;
