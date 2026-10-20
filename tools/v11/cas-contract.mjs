// Isolated service contract; real Emulator and native browser suites are separate
// mandatory integration checks. SDK fixture models atomic transaction commit.
import fs from 'node:fs';import assert from 'node:assert/strict';import crypto from 'node:crypto';import path from 'node:path';import {pathToFileURL} from 'node:url';
export async function casContract(change=x=>x){
 const originalWindow=globalThis.window,db={},club='A',state=new Map(),calls=[],results=[];let hook=null;
 const file='js/services/attendance.service.js';let code=change(fs.readFileSync(file,'utf8'));
 code=code.replace(/from\s+['"]([^'"]+)['"]/g,(all,spec)=>spec.startsWith('.')?"from '"+new URL(spec,pathToFileURL(path.resolve(file))).href+"'":all);
 const service=(await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'))).AttendanceService;
 const auth={ready:true,uid:'u',role:'coach',clubId:club,coachBranch:'CS1',generation:1};
 const sdk={doc:(database,...parts)=>parts.join('/'),runTransaction:async(database,fn,options)=>{
  assert.equal(database,db);assert.equal(options.maxAttempts,3);const sequence=calls.length+1;calls.push({sequence,reads:0,writes:0});const call=calls.at(-1),pending=[];await hook?.('before',sequence);
  const value=await fn({async get(ref){assert.equal(pending.length,0,'all reads precede writes');call.reads++;return {exists:()=>state.has(ref),data:()=>state.get(ref)}},set(ref,data){pending.push([ref,data]);call.writes++}});
  pending.forEach(([ref,data])=>state.set(ref,data));await hook?.('after',sequence);return value;
 }};
 globalThis.window={_fb_init:sdk,__store:{db,clubId:club,userRole:'coach',currentUser:{uid:'u'},coachBranch:'CS1'},userRole:'coach',coachBranch:'CS1',__verifiedAuthContextState:auth};
 const record=(i,status=1,shift='S1')=>({clubId:club,name:'P'+i,profileId:'P'+i,docId:'P'+i+'_2026-10-20'+(shift?'_'+shift:''),date:'2026-10-20',month:'2026-10',branch:'CS1',status,shiftId:shift,shiftMode:shift?'explicit-shift':'legacy-no-shift',operation:status===0?'delete':'set',queuedAt:123,legacyNoise:'strip',claimId:'strip'});
 const intent=(i,status=1,baseVersion='absent',shift='S1')=>({id:crypto.randomUUID(),record:record(i,status,shift),baseVersion});
 const read=i=>state.get('clubs/A/attendance/'+i.record.docId);
 const check=async(label,fn)=>{await fn();results.push(label)};
 try{
  await check('Coach 41 intents serial chunks 10/10/10/10/1',async()=>{const rows=Array.from({length:41},(_,i)=>intent(i));await service.bulkSaveRecords(rows);assert.deepEqual(calls.map(x=>x.writes),[10,10,10,10,1]);assert(calls.every(x=>x.reads===x.writes));});
  await check('explicit smaller chunks respected',async()=>{calls.length=0;await service.bulkSaveRecords([intent(45),intent(46),intent(47)],{chunkSize:2});assert.deepEqual(calls.map(x=>x.writes),[2,1]);});
  await check('Admin 401 intents keeps 400/1 policy',async()=>{auth.role=window.userRole=window.__store.userRole='admin';calls.length=0;await service.bulkSaveRecords(Array.from({length:401},(_,i)=>intent(i+100)));assert.deepEqual(calls.map(x=>x.writes),[400,1]);auth.role=window.userRole=window.__store.userRole='coach';});
  await check('second commit failure exposes exact ACK ids',async()=>{calls.length=0;const rows=Array.from({length:11},(_,i)=>intent(i+600));hook=(stage,n)=>{if(stage==='before'&&n===2)throw Object.assign(Error('second commit'),{code:'unavailable'})};await assert.rejects(service.bulkSaveRecords(rows),e=>{assert.equal(e.committed,10);assert.equal(e.pending,1);assert.deepEqual(e.acknowledgedIds,rows.slice(0,10).map(x=>x.id));return true});hook=null;});
  await check('lost ACK recovery is read-only and validates same UUID content',async()=>{calls.length=0;const a=intent(700);hook=stage=>{if(stage==='after')throw Object.assign(Error('ACK lost'),{code:'unavailable'})};await assert.rejects(service.bulkSaveRecords([a]));hook=null;await service.bulkSaveRecords([a]);assert.equal(calls.at(-1).writes,0);await assert.rejects(service.bulkSaveRecords([{...a,record:{...a.record,status:2}}]),e=>e.code==='attendance/intent-reuse');});
  await check('newer intent survives stale set/delete/reapply',async()=>{const a=intent(701);await service.bulkSaveRecords([a]);const b=intent(701,2,a.id);await service.bulkSaveRecords([b]);await assert.rejects(service.bulkSaveRecords([a]),e=>e.code==='attendance/intent-conflict');assert.equal(read(a).status,2);const tombstone=intent(701,0,b.id);await service.bulkSaveRecords([tombstone]);await assert.rejects(service.bulkSaveRecords([b]),e=>e.code==='attendance/intent-conflict');assert.equal(read(a).status,0);const c=intent(701,3,tombstone.id);await service.bulkSaveRecords([c]);assert.equal(read(a).status,3);});
  await check('whitelist strips all journal identity and metadata',async()=>{const a=intent(702);await service.bulkSaveRecords([a]);const data=read(a);for(const key of ['docId','clubId','queuedAt','claimId','legacyNoise','operation','baseVersion','shiftMode'])assert(!Object.hasOwn(data,key),key);assert.equal(data.shiftId,'S1');assert.equal(data.profileId,'P702');assert.equal(data.attendanceVersion,a.id);});
  await check('legacy no-shift identity remains name_date after explicit review',async()=>{const a=intent(703,1,'absent','');await service.bulkSyncOffline('A','2026-10-20',[a]);assert.equal(a.record.docId,'P703_2026-10-20');assert(!Object.hasOwn(read(a),'shiftId'));});
  await check('unknown/V1 direct input never auto-replayed',async()=>{const count=calls.length;await assert.rejects(service.bulkSaveRecords([{...intent(704),baseVersion:'unknown'}]));await assert.rejects(service.bulkSyncOffline('A','2026-10-20',{x:record(704)}));assert.equal(calls.length,count);});
  await check('wrong club/identity/date and duplicate targets fail before SDK',async()=>{const count=calls.length;for(const patch of [{clubId:'B'},{docId:'wrong'},{date:'2026-02-30',month:'2026-02'},{profileId:'wrong'},{branch:''}]){const a=intent(705);await assert.rejects(service.bulkSaveRecords([{...a,record:{...a.record,...patch}}]));}const a=intent(706);await assert.rejects(service.bulkSaveRecords([a,{...a,id:crypto.randomUUID()}]));assert.equal(calls.length,count);});
  await check('role/db/branch/uid/generation changes stop following chunk after ACK',async()=>{
   for(const field of ['role','uid','coachBranch','generation','db']){
    const before={...auth},oldDb=window.__store.db;calls.length=0;const rows=Array.from({length:11},(_,i)=>intent(field+i));
    hook=(stage,n)=>{if(stage==='after'&&n===1){if(field==='db')window.__store.db={};else auth[field]=String(auth[field])+'-changed'}};
    await assert.rejects(service.bulkSaveRecords(rows),e=>e.committed===10&&e.pending===1);assert.equal(calls.length,1);Object.assign(auth,before);window.__store.db=oldDb;hook=null;
   }
  });
  await check('members projection has no writer',()=>assert.rejects(service.updateMemberStats('P0',{totalSessionsAttended:1}),e=>e.code==='attendance/derived-read-only'));
 }finally{globalThis.window=originalWindow}
 return {results};
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(new URL(import.meta.url).pathname)){const r=await casContract();console.log('CAS CONTRACT PASS',r.results.length)}
