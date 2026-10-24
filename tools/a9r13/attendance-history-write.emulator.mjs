// The real service is bound to the Firebase test SDK. No production access.
import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {initializeTestEnvironment,assertFails} from '@firebase/rules-unit-testing';
import * as sdk from 'firebase/firestore';
import {AttendanceService as service} from '../../js/services/attendance.service.js';
import {HISTORY_AUTHORITY,attendanceServerVersion} from '../../js/core/attendanceContract.js';

const endpoint=process.env.FIRESTORE_EMULATOR_HOST||'';
assert.match(endpoint,/^127\.0\.0\.1:\d+$/,'A loopback Firestore Emulator is required');
const [host,port]=endpoint.split(':');
const project='demo-a9r13-attendance',club='CLB_TEST',date='2026-10-24';
const rules=fs.readFileSync('firestore.rules','utf8');
const env=await initializeTestEnvironment({projectId:project,firestore:{host,port:Number(port),rules}});
const coach=env.authenticatedContext('coach').firestore();
const admin=env.authenticatedContext('admin').firestore();
const outsider=env.authenticatedContext('outsider').firestore();
const results=[],queries=[],reads=[];
const docId=(name,day=date,shift='S1')=>name+'_'+day+(shift?'_'+shift:'');
const ref=(db,id)=>sdk.doc(db,'clubs',club,'attendance',id);
const data=(name,branch='CS1',extra={})=>({profileId:name,name,branch,date,month:'2026-10',shiftId:'S1',status:1,historyAuthority:HISTORY_AUTHORITY,attendanceVersion:crypto.randomUUID(),...extra});
function bind(db,role='coach',branch='CS1') {
 const uid=role==='admin'?'admin':db===outsider?'outsider':'coach';
 globalThis.window={_fb_init:{...sdk,getDocs:q=>{queries.push(q);return sdk.getDocs(q);}},
  __store:{db,clubId:club,currentClubId:club,userRole:role,currentUser:{uid}},userRole:role,coachBranch:role==='coach'?branch:'',currentClubId:club,
  __verifiedAuthContextState:{uid,clubId:club,role,ready:true,coachBranch:branch,activeBranch:branch,allowedBranches:['CS1','CS2'],generation:1},
  recordFirestoreReadAttribution:(key,n)=>reads.push({key,n})};
}
const intent=(name,branch='CS1',baseVersion='absent',extra={})=>({id:crypto.randomUUID(),baseVersion,record:{...data(name,branch),clubId:club,docId:docId(name),...extra}});
async function check(title,fn) {
 try {await fn();results.push({title,result:'PASS'});console.log('PASS',title);}
 catch(error) {results.push({title,result:'FAIL',code:error.code,message:error.message});console.error('FAIL',title,error);}
}
try {
 await env.clearFirestore();
 await env.withSecurityRulesDisabled(async ctx=>{
  const db=ctx.firestore(),b=sdk.writeBatch(db),assignmentVersion='a9r13-assignment-000001';
  const acl={role:'coach',clubId:club,status:'active',branch:'CS1',coachBranch:'CS1',defaultBranch:'CS1',allowedBranches:['CS1','CS2'],assignmentVersion};
  b.set(sdk.doc(db,'clubs',club),{coachAclEpoch:1});
  b.set(sdk.doc(db,'clubs',club,'settings','main_config'),{branchCount:2});
  b.set(sdk.doc(db,'users','coach'),acl);b.set(sdk.doc(db,'clubs',club,'coaches','coach'),acl);
  const other={...acl,clubId:'OTHER'};
  b.set(sdk.doc(db,'users','outsider'),other);b.set(sdk.doc(db,'clubs','OTHER','coaches','outsider'),other);
  b.set(sdk.doc(db,'users','admin'),{role:'admin',clubId:club,status:'active'});
  for(const [name,branch] of [['CS1 student','CS1'],['CS2 student','CS2'],['CS3 student','CS3'],['Fresh CS1','CS1'],['Fresh CS2','CS2'],['Legacy collision','CS1'],['Hidden CS2','CS2'],['Mặc định profile','Mặc định']])b.set(sdk.doc(db,'clubs',club,'profiles',name),{branch,status:'active'});
  b.set(ref(db,docId('CS1 student')),data('CS1 student'));
  b.set(ref(db,docId('CS1 student','2026-10-23')),data('CS1 student','CS1',{date:'2026-10-23',status:0}));
  b.set(ref(db,docId('CS2 student')),data('CS2 student','CS2'));
  b.set(ref(db,docId('Legacy collision')),data('Legacy collision','CS1',{historyAuthority:'pre-cutover-untrusted'}));
  b.set(ref(db,docId('Hidden CS2')),data('Hidden CS2','CS2'));
  await b.commit();
 });
 await check('Coach CS1 individual quarter history succeeds in one real query',async()=>{
  bind(coach);const before=queries.length;const rows=await service.loadMemberHistory('CS1 student',['2026-10','2026-11','2026-12']);
  assert.equal(rows.length,1);assert.equal(rows[0].data.status,1);assert.equal(queries.length-before,1);
 });
 await check('Coach CS2 individual history succeeds after branch selection',async()=>{
  bind(coach,'coach','CS2');const rows=await service.loadMemberHistory('CS2 student',['2026-10']);assert.equal(rows.length,1);
 });
 await check('Coach with legacy primary alias reads canonical CS1 history once',async()=>{
  bind(coach);window.coachBranch='Mặc định';window.__verifiedAuthContextState.coachBranch='Mặc định';
  const before=queries.length;assert.equal((await service.loadMemberHistory('CS1 student',['2026-10'])).length,1);assert.equal(queries.length-before,1);
 });
 await check('Empty member history is a successful empty result',async()=>{bind(coach);assert.deepEqual(await service.loadMemberHistory('Fresh CS1',['2026-10']),[]);});
 await check('Coach history rejects a mismatched requested branch before any query',async()=>{
  bind(coach);const before=queries.length;await assert.rejects(service.loadMemberHistory('CS1 student',['2026-10'],{branch:'CS2'}),e=>e.code==='attendance/coach-branch-required');assert.equal(queries.length,before);
 });
 await check('Direct legacy alias history query is denied even with no matching rows',async()=>{
  await assertFails(sdk.getDocs(sdk.query(sdk.collection(coach,'clubs',club,'attendance'),sdk.where('profileId','==','CS1 student'),sdk.where('month','in',['2026-10']),sdk.where('historyAuthority','==',HISTORY_AUTHORITY),sdk.where('branch','==','Mặc định'))));
 });
 await check('Coach daily reader succeeds and hides old-authority collision',async()=>{
  bind(coach);const rows=await service.loadByDate(date,{branch:'CS1',shiftId:'S1'});assert(rows.some(x=>x.data.name==='CS1 student'));assert(!rows.some(x=>x.data.name==='Legacy collision'));
 });
 await check('Coach monthly reader succeeds for selected canonical branch',async()=>{
  bind(coach);const rows=await service.loadByMonth('2026-10');assert(rows.every(x=>x.data.branch==='CS1'));assert(!rows.some(x=>x.data.name==='Legacy collision'));
 });
 await check('Transaction get on an absent document is permitted by unchanged Rules',async()=>{
  bind(coach);assert.equal((await sdk.getDocFromServer(ref(coach,docId('Fresh CS1')))).exists(),false);
 });
 let fresh;
 await check('Actual single writer creates a fresh CS1 mark using transaction.get',async()=>{
  bind(coach);fresh=intent('Fresh CS1');const before=reads.length;const ack=await service.bulkSyncOffline(club,date,[fresh]);assert.deepEqual(ack.acknowledgedIds,[fresh.id]);assert.equal(reads.length-before,1);assert.equal((await sdk.getDoc(ref(coach,fresh.record.docId))).data().attendanceVersion,fresh.id);
 });
 await check('Actual single writer creates a fresh CS2 mark',async()=>{
  bind(coach,'coach','CS2');const row=intent('Fresh CS2','CS2');assert.equal((await service.bulkSaveRecords([row])).committed,1);
 });
 await check('Retry after a lost ACK remains idempotent',async()=>{bind(coach);assert.equal((await service.bulkSaveRecords([fresh])).committed,1);assert.equal((await sdk.getDoc(ref(coach,fresh.record.docId))).data().attendanceVersion,fresh.id);});
 await check('Correct CAS updates and stale CAS conflicts without overwrite',async()=>{
  bind(coach);const update=intent('Fresh CS1','CS1',fresh.id,{status:2});await service.bulkSaveRecords([update]);await assert.rejects(service.bulkSaveRecords([intent('Fresh CS1','CS1',fresh.id,{status:3})]),e=>e.code==='attendance/intent-conflict');assert.equal((await sdk.getDoc(ref(coach,fresh.record.docId))).data().status,2);
 });
 await check('Legacy collision produces precise read-stage diagnostic and zero ACK',async()=>{
  bind(coach);await assert.rejects(service.bulkSaveRecords([intent('Legacy collision')]),e=>e.code==='permission-denied'&&e.attendanceDiagnostic?.stage==='intent-version-read'&&e.attendanceDiagnostic.docId===docId('Legacy collision')&&e.committed===0&&e.acknowledgedIds.length===0);
  const old=(await sdk.getDoc(ref(admin,docId('Legacy collision')))).data();assert.equal(old.historyAuthority,'pre-cutover-untrusted');assert.equal(old.status,1);
 });
 await check('Coach still cannot directly promote old history or inspect its contents',async()=>{
  bind(coach);await assert.rejects(service.inspectIntent(intent('Legacy collision').record),e=>e.code==='permission-denied');await assertFails(sdk.setDoc(ref(coach,docId('Legacy collision')),data('Legacy collision')));
 });
 await check('Admin reads the exact legacy document using the existing review service',async()=>{
  bind(admin,'admin');const inspected=await service.inspectIntent(intent('Legacy collision').record);assert.equal(inspected.data.historyAuthority,'pre-cutover-untrusted');assert.equal(inspected.version,inspected.data.attendanceVersion);
 });
 await check('Existing Admin attestation resolves the same document with CAS',async()=>{
  bind(admin,'admin');const record=intent('Legacy collision').record;const current=await service.inspectIntent(record);await service.attestHistory({...current.data,clubId:club,docId:record.docId},current.version);
  const verified=(await sdk.getDoc(ref(admin,record.docId))).data();assert.equal(verified.historyAuthority,HISTORY_AUTHORITY);assert.equal(verified.status,current.data.status);
 });
 await check('After explicit Admin verification Coach can inspect and update that exact slot',async()=>{
  bind(coach);const row=intent('Legacy collision');const current=await service.inspectIntent(row.record);assert.equal(current.data.historyAuthority,HISTORY_AUTHORITY);const revised={...row,baseVersion:attendanceServerVersion(current.data),record:{...row.record,status:3}};await service.bulkSaveRecords([revised]);assert.equal((await sdk.getDoc(ref(coach,row.record.docId))).data().status,3);
 });
 await check('Coach cannot spoof a CS1 branch for a CS2 canonical profile',async()=>{
  bind(coach);await assert.rejects(service.bulkSaveRecords([intent('CS2 student','CS1','absent',{docId:docId('CS2 student',date,'OTHER'),shiftId:'OTHER'})]),e=>e.code==='permission-denied');
 });
 await check('Cross-club Coach is still denied',async()=>{bind(outsider);await assert.rejects(service.bulkSaveRecords([intent('CS1 student')]),e=>e.code==='permission-denied');});
 await check('Coach cannot delete attendance or access finance',async()=>{await assertFails(sdk.deleteDoc(ref(coach,docId('CS1 student'))));await assertFails(sdk.getDoc(sdk.doc(coach,'clubs',club,'transactions','tx1')));});
 await check('Admin quarter history retains unfiltered authority access',async()=>{bind(admin,'admin');assert.equal((await service.loadMemberHistory('Legacy collision',['2026-10'])).length,1);});
} finally {
 const report={kind:'A9R13_ACTUAL_SERVICE_EMULATOR',projectId:project,emulatorHost:endpoint,authority:HISTORY_AUTHORITY,rulesSha256:crypto.createHash('sha256').update(rules).digest('hex'),total:results.length,pass:results.filter(x=>x.result==='PASS').length,fail:results.filter(x=>x.result==='FAIL').length,results};
 fs.mkdirSync('evidence/A9R13',{recursive:true});fs.writeFileSync('evidence/A9R13/ACTUAL_SERVICE_EMULATOR.json',JSON.stringify(report,null,2));console.log('A9R13_EMULATOR',JSON.stringify({pass:report.pass,fail:report.fail,total:report.total}));await env.cleanup();if(report.fail)process.exitCode=1;
}
