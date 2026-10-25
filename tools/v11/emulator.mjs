// Independent real-SDK security/CAS regression tests. No production project.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import crypto from 'node:crypto';
import {initializeTestEnvironment,assertFails,assertSucceeds} from '@firebase/rules-unit-testing';import * as sdk from 'firebase/firestore';
import {HISTORY_AUTHORITY,attendanceServerVersion} from '../../js/core/attendanceContract.js';
const out=path.resolve(process.env.V11_OUTPUT||'evidence/emulator');fs.mkdirSync(out,{recursive:true});
const [host,port]=(process.env.FIRESTORE_EMULATOR_HOST||'').split(':');assert(host&&port,'Run with firebase emulators:exec');
assert.equal(host,'127.0.0.1','Local-only synthetic fixture reset');
const env=await initializeTestEnvironment({projectId:'demo-v11-contract',firestore:{host,port:Number(port),rules:fs.readFileSync('firestore.rules','utf8')}});
// Each invocation owns an isolated demo fixture, including B6 after B7.
await env.clearFirestore();
const club='v11-club',date='2026-10-20',results=[],id=()=>crypto.randomUUID();let transactionHook=null,attempt=0,reads=0,writes=0;
const row=(name,status=1,branch='CS1',day=date)=>({clubId:club,docId:name+'_'+day,profileId:name,name,branch,date:day,month:day.slice(0,7),status,shiftId:'',shiftMode:'legacy-no-shift',operation:status===0?'delete':'set'});
const intent=(record,baseVersion='absent',intentId=id())=>({id:intentId,record,baseVersion});
const ref=(db,name)=>sdk.doc(db,'clubs',club,'attendance',name);
const dbAs=uid=>env.authenticatedContext(uid).firestore();
const coach=dbAs('c1'),coach2=dbAs('c2'),admin=dbAs('admin'),viewer=dbAs('viewer');
globalThis.window=globalThis;
const use=(db,role='coach',branch='CS1',uid='c1')=>{
 window.__store={db,clubId:club,userRole:role,currentUser:{uid},coachBranch:branch};window.userRole=role;window.coachBranch=branch;
 window.__verifiedAuthContextState={ready:true,uid,role,clubId:club,coachBranch:branch,generation:1};
 window._fb_init={...sdk,runTransaction:async(db,fn,options)=>{
   const sequence=++attempt;await transactionHook?.('before',sequence);
   const result=await sdk.runTransaction(db,tx=>{let writing=false;return fn({async get(r){assert(!writing,'reads must precede writes');reads++;return tx.get(r)},set(...args){writing=true;writes++;tx.set(...args)}})},options);
   await transactionHook?.('after',sequence);return result;
 }};
};
const check=async(name,fn)=>{await fn();results.push({name,status:'PASS'});console.log('PASS',name)};
try {
 await env.withSecurityRulesDisabled(async c=>{
  const db=c.firestore(),b=sdk.writeBatch(db);
  b.set(sdk.doc(db,'clubs',club),{clubName:'QA'});b.set(sdk.doc(db,'clubs',club,'settings','main_config'),{branchCount:2});for(const [uid,role,branch] of [['c1','coach','CS1'],['c2','coach','CS2'],['admin','admin',''],['viewer','viewer','']]){const d={clubId:club,role,branch,status:'active'};b.set(sdk.doc(db,'users',uid),d);if(role==='coach')b.set(sdk.doc(db,'clubs',club,'coaches',uid),d);}
  for(let i=0;i<30;i++)b.set(sdk.doc(db,'clubs',club,'profiles','P'+i),{name:'P'+i,branch:'CS1',status:'active'});
  b.set(sdk.doc(db,'clubs',club,'profiles','Foreign'),{branch:'CS2',status:'active'});b.set(sdk.doc(db,'clubs',club,'profiles','Legacy'),{branch:'Mặc định',status:'paused'});
  b.set(ref(db,'forged'),row('Foreign'));b.set(ref(db,'P29_'+date),row('P29'));await b.commit();
 });
 const {AttendanceService:service}=await import('../../js/services/attendance.service.js');use(coach);
 await check('S01: forged and unverified legacy get denied',async()=>{await assertFails(sdk.getDoc(ref(coach,'forged')));await assertFails(sdk.getDoc(ref(coach,'P29_'+date)));});
 await check('S01: broad and legacy branch-only queries denied',async()=>{for(const field of ['date','month','profileId'])await assertFails(sdk.getDocs(sdk.query(sdk.collection(coach,'clubs',club,'attendance'),sdk.where('branch','==','CS1'),sdk.where(field,'==',field==='month'?'2026-10':field==='profileId'?'Foreign':date))));});
 await check('S01: actual day/month/history queries omit unverified records on server',async()=>{
  for(const get of [()=>service.loadByDate(date),()=>service.loadByMonth('2026-10'),()=>service.loadMemberHistory('Foreign',['2026-10'])])assert.equal((await get()).length,0);
 });
 await check('S01: untrusted history cannot be promoted by blind Coach update',async()=>{
  const data={...row('P29'),historyAuthority:HISTORY_AUTHORITY,attendanceVersion:id(),attendancePreviousVersion:'legacy'};delete data.clubId;delete data.docId;
  await assertFails(sdk.setDoc(ref(coach,'P29_'+date),data));
 });
 await check('S01: canonical-profile branch rejects forged create',async()=>{
  await assert.rejects(service.bulkSaveRecords([intent(row('Foreign'))]),e=>e.code==='permission-denied');
 });
 const p0=intent(row('P0')),legacy=intent(row('Legacy'));
 await check('S01: own canonical and CS1 legacy profiles accepted',async()=>{await service.bulkSaveRecords([p0,legacy]);assert.equal((await sdk.getDoc(ref(coach,p0.record.docId))).data().historyAuthority,HISTORY_AUTHORITY);});
 await env.withSecurityRulesDisabled(c=>sdk.updateDoc(sdk.doc(c.firestore(),'clubs',club,'profiles','P0'),{branch:'CS2'}));
 await check('S01: historical branch survives profile transfer, current branch cannot read old history',async()=>{
  await assertSucceeds(sdk.getDoc(ref(coach,p0.record.docId)));await assertFails(sdk.getDoc(ref(coach2,p0.record.docId)));
  assert((await service.loadMemberHistory('P0',['2026-10'])).some(x=>x.id===p0.record.docId));
  use(coach2,'coach','CS2','c2');assert.equal((await service.loadMemberHistory('P0',['2026-10'])).length,0);use(coach);
 });
 await check('S01: historical branch immutable and old Coach cannot edit transferred profile',async()=>{
  await assert.rejects(service.bulkSaveRecords([intent(row('P0',2),p0.id)]),e=>e.code==='permission-denied');
  const data=(await sdk.getDoc(ref(admin,p0.record.docId))).data();await assertFails(sdk.setDoc(ref(coach2,p0.record.docId),{...data,branch:'CS2',attendanceVersion:id(),attendancePreviousVersion:p0.id}));
 });
 await check('S01: new branch may create new-day history after transfer',async()=>{use(coach2,'coach','CS2','c2');await service.bulkSaveRecords([intent(row('P0',1,'CS2','2026-10-21'))]);use(coach);});
 await check('S01: Admin audit uses same CAS writer; viewer cannot attest',async()=>{
  use(admin,'admin','','admin');const old=(await sdk.getDoc(ref(admin,'P29_'+date))).data();await service.attestHistory({...old,docId:'P29_'+date},attendanceServerVersion(old));
  use(viewer,'viewer','','viewer');await assert.rejects(service.attestHistory(row('P28'),'absent'),e=>e.code==='permission-denied');use(coach);
  await assertSucceeds(sdk.getDoc(ref(coach,'P29_'+date)));
 });
 await check('O01: second commit fails, ACKs identify only first ten intents',async()=>{
  const group=Array.from({length:11},(_,i)=>intent(row('P'+(i+1))));globalThis.group=group;attempt=0;
  transactionHook=(stage,n)=>{if(stage==='before'&&n===2)throw Object.assign(Error('second commit unavailable'),{code:'unavailable'})};
  await assert.rejects(service.bulkSaveRecords(group),e=>{assert.equal(e.committed,10);assert.deepEqual(e.acknowledgedIds,group.slice(0,10).map(x=>x.id));return true});transactionHook=null;
 });
 await check('O01: stale retry cannot overwrite newer status 2 with 1',async()=>{
  const old=group[0],newer=intent({...old.record,status:2},old.id);await service.bulkSaveRecords([newer]);
  await assert.rejects(service.bulkSaveRecords(group),e=>e.code==='attendance/intent-conflict');
  assert.equal((await sdk.getDoc(ref(admin,old.record.docId))).data().status,2);
  await service.bulkSaveRecords(group.slice(10));
 });
 await check('O01: lost ACK retries same intent idempotently without write',async()=>{
  const mark=intent(row('P15'));attempt=0;transactionHook=(stage,n)=>{if(stage==='after'&&n===1)throw Object.assign(Error('ACK lost'),{code:'unavailable'})};
  await assert.rejects(service.bulkSaveRecords([mark]));transactionHook=null;const before=writes;assert.deepEqual((await service.bulkSaveRecords([mark])).acknowledgedIds,[mark.id]);assert.equal(writes,before);
  await assert.rejects(service.bulkSaveRecords([{...mark,record:{...mark.record,status:2}}]),e=>e.code==='attendance/intent-reuse');
 });
 await check('O01: present/delete/reapply uses tombstone and blocks delayed resurrection',async()=>{
  const a=intent(row('P16'));await service.bulkSaveRecords([a]);const del=intent(row('P16',0),a.id);await service.bulkSaveRecords([del]);
  assert.equal((await sdk.getDoc(ref(admin,a.record.docId))).data().status,0);
  await assert.rejects(service.bulkSaveRecords([a]),e=>e.code==='attendance/intent-conflict');
  assert(!(await service.loadByMonth('2026-10')).some(x=>x.id===a.record.docId));assert(!(await service.loadMemberHistory('P16',['2026-10'])).length);
  const next=intent(row('P16',3),del.id);await service.bulkSaveRecords([next]);assert.equal((await sdk.getDoc(ref(admin,a.record.docId))).data().status,3);
  await assertFails(sdk.deleteDoc(ref(coach,a.record.docId)));await assertFails(sdk.deleteDoc(ref(admin,a.record.docId)));
 });
 await check('O01: unversioned legacy writer and invalid identity fail closed',async()=>{
  await assertFails(sdk.setDoc(ref(coach,'P16_'+date),row('P16',1)));
  await assert.rejects(service.bulkSaveRecords([intent({...row('P17'),docId:'other'})]));
 });
 await check('P1: Coach members stats write remains denied and compatibility API rejects',async()=>{
  await assertFails(sdk.setDoc(sdk.doc(coach,'clubs',club,'members','P16'),{totalSessionsAttended:99}));
  await assert.rejects(service.updateMemberStats(),e=>e.code==='attendance/derived-read-only');
 });
 await check('O01: SDK stream-disable does not count as a failed server ACK',async()=>{
  Object.defineProperty(globalThis,'navigator',{value:{onLine:true},configurable:true});await sdk.disableNetwork(coach);
  const result=await service.bulkSaveRecords([intent(row('P18'))]);assert.equal(result.committed,1);await sdk.enableNetwork(coach);
  // SDK disableNetwork stops listen streams, not every transaction RPC in this SDK.
  // The browser suite blocks the actual Emulator transport with navigator still online.
 });
 await check('Cross-account, cross-club, viewer and stale context denied',async()=>{
  use(viewer,'viewer','','viewer');await assert.rejects(service.bulkSaveRecords([intent(row('P18'))]),e=>e.code==='attendance/unverified-writer');use(coach);
  await assert.rejects(service.bulkSaveRecords([intent({...row('P18'),clubId:'foreign'})]));
  transactionHook=stage=>{if(stage==='before')window.__verifiedAuthContextState.generation++};await assert.rejects(service.bulkSaveRecords([intent(row('P18'))]),e=>e.code==='attendance/stale-bulk-context');transactionHook=null;
 });
 // Negative controls mutate only in-memory Rules in separate demo projects.
 for (const [label,change,kind] of [
  ['S01 historical proof removed',s=>s.replace(/((?:coachAttendanceResourceBranchMatches|resourceBranchMatchesCoach)\(\)) && historicalProof\(resource\.data\)/g,'$1'),'read'],
  ['S01 canonical profile check removed',s=>s.replaceAll('&& coachAttendanceProfileMatches(clubId, request.resource.data)',''),'write']
 ]) {
  const original=fs.readFileSync('firestore.rules','utf8'),mutated=change(original);assert.notEqual(mutated,original);
  const control=await initializeTestEnvironment({projectId:'demo-v11-negative-'+kind,firestore:{host,port:Number(port),rules:mutated}});
  await control.clearFirestore(); // isolated demo negative control, including repeated aggregate runs
  try {
   await control.withSecurityRulesDisabled(async c=>{const d=c.firestore();await sdk.setDoc(sdk.doc(d,'users','control'),{clubId:club,role:'coach',branch:'CS1'});await sdk.setDoc(sdk.doc(d,'clubs',club,'coaches','control'),{clubId:club,role:'coach',branch:'CS1'});await sdk.setDoc(sdk.doc(d,'clubs',club,'settings','main_config'),{branchCount:2});await sdk.setDoc(sdk.doc(d,'clubs',club,'profiles','Foreign'),{branch:'CS2'});await sdk.setDoc(ref(d,'forged'),row('Foreign'));});
   const d=control.authenticatedContext('control').firestore();
   if(kind==='read')await assert.rejects(()=>assertFails(sdk.getDoc(ref(d,'forged'))));
   else {const data={...row('Foreign'),historyAuthority:HISTORY_AUTHORITY,attendanceVersion:id(),attendancePreviousVersion:'legacy'};delete data.clubId;delete data.docId;await assert.rejects(()=>assertFails(sdk.setDoc(ref(d,'Foreign_'+date),data)));}
   results.push({name:label,status:'CAUGHT',type:'negative-control'});console.log('CAUGHT',label);
  } finally {await control.cleanup()}
 }
} finally {
 transactionHook=null;await env.cleanup();
 const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
 fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({project:'demo-v11-contract',results,transactionReads:reads,transactionWritesAttempted:writes,sourceHashes:Object.fromEntries(['firestore.rules','js/services/attendance.service.js','js/core/attendanceContract.js'].map(f=>[f,hash(f)]))},null,2));
}
console.log('V11 EMULATOR PASS',results.length);
