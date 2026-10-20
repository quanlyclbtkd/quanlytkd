#!/usr/bin/env node
// Exercise actual service code with controlled ACK/failure/session ordering.
import assert from 'node:assert/strict';
import {AttendanceService as service} from '../js/services/attendance.service.js';
globalThis.window=globalThis;
let commits=[],attempts=0,inFlight=0,maxConcurrent=0,afterCommit=()=>{};
const rows=n=>Array.from({length:n},(_,i)=>({docId:'p'+i,data:{profileId:'p'+i,name:'p'+i,branch:'CS1',date:'2026-10-20',status:1}}));
const offline=n=>Object.fromEntries(rows(n).map(r=>[r.docId,{...r.data,docId:r.docId}]));
function reset(role='coach') {
  commits=[];attempts=0;inFlight=0;maxConcurrent=0;afterCommit=()=>{};
  window.userRole=role;window.coachBranch=role==='coach'?'CS1':'';
  window.__store={db:{},clubId:'A',userRole:role,coachBranch:window.coachBranch};
  window.__verifiedAuthContextState={uid:'u1',generation:1,role,coachBranch:window.coachBranch,clubId:'A',ready:true};
  window._fb_init={doc:(...parts)=>parts,writeBatch(){let n=0;return {set(){n++;},delete(){n++;},async commit(){
    attempts++;inFlight++;maxConcurrent=Math.max(maxConcurrent,inFlight);
    try {await Promise.resolve();await afterCommit(attempts);commits.push(n);}finally{inFlight--;}
  }};}};
}
let pass=0,fail=0;
async function test(name,fn){try{await fn();pass++;console.log('PASS V9_BATCH',name);}catch(e){fail++;console.error('FAIL V9_BATCH',name,e.message);}}
await test('Coach bulk 41: serial 10/10/10/10/1',async()=>{reset();const ack=await service.bulkSaveRecords(rows(41),{chunkSize:400});assert.equal(ack.committed,41);assert.deepEqual(commits,[10,10,10,10,1]);assert.equal(maxConcurrent,1);});
await test('Admin bulk 401: existing 400/1 policy',async()=>{reset('admin');const ack=await service.bulkSaveRecords(rows(401));assert.equal(ack.committed,401);assert.deepEqual(commits,[400,1]);});
await test('Smaller explicit chunk size is respected',async()=>{reset();await service.bulkSaveRecords(rows(7),{chunkSize:3});assert.deepEqual(commits,[3,3,1]);});
await test('Coach offline uses same serial writer',async()=>{reset();const ack=await service.bulkSyncOffline('A','2026-10-20',offline(41));assert.equal(ack.committed,41);assert.deepEqual(commits,[10,10,10,10,1]);assert.equal(maxConcurrent,1);});
await test('Admin offline keeps one <=400 commit',async()=>{reset('admin');await service.bulkSyncOffline('A','2026-10-20',offline(400));assert.deepEqual(commits,[400]);});
await test('Offline >400 is blocked before write',async()=>{reset();await assert.rejects(service.bulkSyncOffline('A','2026-10-20',offline(401)),{code:'attendance/offline-chunk-too-large'});assert.equal(attempts,0);});
await test('Failure exposes exact successful chunk IDs',async()=>{reset();afterCommit=i=>{if(i===2)throw Error('network-failure');};await assert.rejects(service.bulkSaveRecords(rows(41)),e=>e.committed===10&&e.pending===31&&e.committedIds.length===10);assert.deepEqual(commits,[10]);assert.equal(attempts,2);});
await test('Offline partial failure does not mutate journal input',async()=>{reset();const input=offline(41),before=JSON.stringify(input);afterCommit=i=>{if(i===2)throw Error('network-failure');};await assert.rejects(service.bulkSyncOffline('A','2026-10-20',input),e=>e.committed===10&&e.pending===31);assert.equal(JSON.stringify(input),before);assert.deepEqual(commits,[10]);});
for(const field of ['uid','generation','role','coachBranch','ready','clubId','db'])for(const kind of ['bulk','offline']) {
  await test(`${kind} stops after ACK when ${field} changes`,async()=>{
    reset();afterCommit=()=>{if(field==='db')window.__store.db={};else if(field==='clubId')window.__store.clubId='B';else window.__verifiedAuthContextState={...window.__verifiedAuthContextState,[field]:field==='generation'?2:field==='ready'?false:'changed'};};
    const operation=kind==='bulk'?service.bulkSaveRecords(rows(21)):service.bulkSyncOffline('A','2026-10-20',offline(21));
    await assert.rejects(operation,e=>e.code==='attendance/stale-bulk-context'&&e.committed===10&&e.pending===11);
    assert.equal(attempts,1);assert.deepEqual(commits,[10]);
  });
}
await test('Wrong-club offline target is blocked before commit',async()=>{reset();await assert.rejects(service.bulkSyncOffline('B','2026-10-20',offline(1)),{code:'attendance/stale-bulk-context'});assert.equal(attempts,0);});
console.log(`V9 ATTENDANCE BATCHES: ${pass} PASS / ${fail} FAIL`);if(fail)process.exitCode=1;
