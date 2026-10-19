#!/usr/bin/env node
// E01 read-only proof: actual existing listener query construction + actual status classifier.
// This is NOT a Firestore Rules Emulator and cannot establish authorization or billed reads.
import assert from 'node:assert/strict';
import { classifyProfileStatus, getActiveQueryValues } from '../js/data/profileStatusConfig.js';
import { mountActiveProfilesListener, resetProfilesListeners } from '../js/listeners/profiles.listeners.js';
const docs = [
    {id:'canonical',branch:'CS1',status:'active'},
    {id:'missing',branch:'CS1'},
    {id:'vietnamese',branch:'CS1',status:'Đang tập'},
    {id:'training',branch:'Mặc định',status:'training'},
    {id:'quit',branch:'CS1',status:'quit'},
    {id:'offbranch',branch:'CS2',status:'active'},
];
const visible = docs.filter(d=>['CS1','Mặc định'].includes(d.branch) && classifyProfileStatus(d)==='active');
assert.deepEqual(visible.map(d=>d.id),['canonical','missing','vietnamese','training']);
globalThis.window=globalThis;
window.__store={userRole:'coach',clubId:'club-A',coachBranch:'CS1',profiles:{}};
window.userRole='coach';window.coachBranch='CS1';
window.__verifiedAuthContextState={ready:true,generation:1,uid:'coachA',role:'coach',clubId:'club-A',coachBranch:'CS1'};
window.RoleReadBoundary={isCoachAttendanceOnly:()=>true,canMount:()=>true};
window.getAppContext=()=>({});window._syncAllProfilesLegacy=()=>{};
window.invalidateList=()=>{};window.invalidateLists=()=>{};
window.hasListener=()=>false;
let queries=[];
window.safeRegisterSnapshot=(key,fn)=>{fn();return true};
window._fb_init={query:(ref,...filters)=>{const q={ref,filters};queries.push(q);return q;},where:(...args)=>({where:args}),onSnapshot:()=>()=>{}};
resetProfilesListeners('E01-readonly');
assert.equal(mountActiveProfilesListener({clubId:'club-A',role:'coach',coachBranch:'CS1',profRef:{path:'clubs/club-A/profiles'},db:{}}),undefined);
assert.equal(queries.length,2,'existing CS1 + Mặc định listener slots only');
for(const q of queries){
  assert(q.filters.some(f=>f.where?.[0]==='branch'), 'Coach reader must always be branch-constrained');
}
const returned = docs.filter(d=>queries.some(q=>q.filters.every(f=>{
 const [field,op,value]=f.where;
 return op==='==' ? d[field]===value : op==='in' ? value.includes(d[field]) : false;
}))).filter(d=>classifyProfileStatus(d)==='active');
const missing=visible.filter(p=>!returned.some(x=>x.id===p.id));
console.log('E01 CANONICAL ACTIVE',visible.map(x=>x.id).join(','));
console.log('E01 STATUS-QUERY RESULTS',returned.map(x=>x.id).join(','));
console.log('E01 MISSING',missing.map(x=>x.id).join(','));
console.log('E01 ACTIVE QUERY VALUES',getActiveQueryValues().join(','));
if(missing.length){
  console.log('E01 BLOCKED — missing legacy profiles; branch-only rewrite withheld pending real Rules Emulator and measured reads.');
  if(process.env.D1C3B5_REQUIRE_E01_COMPLETE==='1')process.exitCode=1;
}else{
  console.log('E01 source fixture complete — still REQUIRES real emulator and read-cost proof');
}
