/** A9R13 TEST ONLY — exercise the real AttendanceService against Firestore Emulator. */
import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {initializeTestEnvironment,assertSucceeds} from '@firebase/rules-unit-testing';
import * as sdk from 'firebase/firestore';
import {HISTORY_AUTHORITY} from '../../js/core/attendanceContract.js';

const host=process.env.FIRESTORE_EMULATOR_HOST||'';
assert.match(host,/^127\.0\.0\.1:\d+$/,'Firestore Emulator loopback REQUIRED');
const [addr,port]=host.split(':');
const project='demo-a9r13-coach-attendance',club='CLB_TEST',date='2026-10-24',shift='shift_1';
const rules=fs.readFileSync('firestore.rules','utf8');
const env=await initializeTestEnvironment({projectId:project,firestore:{host:addr,port:Number(port),rules}});
const results=[];
async function check(title,fn){try{await fn();results.push({title,result:'PASS'});console.log('PASS',title)}catch(error){results.push({title,result:'FAIL',code:error.code||error.name,message:String(error.message||error)});console.error('FAIL',title,error.code||'',error.message||error)}}
try{
 await env.clearFirestore();
 await env.withSecurityRulesDisabled(async ctx=>{
  const db=ctx.firestore(),b=sdk.writeBatch(db),assign='a9r13-assignment-00000001';
  b.set(sdk.doc(db,'clubs',club),{clubName:'A9R13 TEST',coachAclEpoch:1});
  b.set(sdk.doc(db,'clubs',club,'settings','main_config'),{branchCount:2});
  b.set(sdk.doc(db,'clubs',club,'settings','shifts'),{list:[{id:shift,name:'Ca 1',branch:'CS1',timeStart:'08:00',timeEnd:'09:00'}]});
  const coachUser={role:'coach',clubId:club,status:'active',branch:'CS1',coachBranch:'CS1',defaultBranch:'CS1',activeBranch:'CS1',allowedBranches:['CS1','CS2'],assignmentVersion:assign};
  b.set(sdk.doc(db,'users','coach-test'),coachUser);b.set(sdk.doc(db,'clubs',club,'coaches','coach-test'),coachUser);
  b.set(sdk.doc(db,'clubs',club,'profiles','Student A'),{branch:'CS1',status:'active'});
  await b.commit();
 });
 const coachDb=env.authenticatedContext('coach-test').firestore();
 globalThis.window=globalThis;
 window.userRole='coach';window.coachBranch='CS1';window.currentClubId=club;
 window.__store={db:coachDb,clubId:club,currentClubId:club,userRole:'coach',coachBranch:'CS1',currentUser:{uid:'coach-test'}};
 window.__verifiedAuthContextState={ready:true,uid:'coach-test',role:'coach',clubId:club,coachBranch:'CS1',activeBranch:'CS1',allowedBranches:['CS1','CS2'],generation:1,branchGeneration:1,branchSelectionPending:false};
 window.RoleReadBoundary={isCoachAttendanceOnly:()=>true,canMount:()=>true};
 window.BranchIdentity={normalize:v=>String(v||'').trim()==='Mặc định'?'CS1':String(v||'').trim(),aliases:v=>String(v||'').trim()==='CS1'?['CS1','Mặc định']:[String(v||'').trim()]};
 window.recordFirestoreReadAttribution=()=>{};
 let transactionGets=0;
 const wrappedRunTransaction=(db,fn,opts)=>sdk.runTransaction(db,async tx=>{
   const proxy={get:ref=>{transactionGets++;return tx.get(ref);},set:(...args)=>tx.set(...args),update:(...args)=>tx.update(...args),delete:(...args)=>tx.delete(...args)};
   return fn(proxy);
 },opts);
 window._fb_init={...sdk,runTransaction:wrappedRunTransaction};
 const {AttendanceService}=await import('../../js/services/attendance.service.js');
 const docId='Student A_'+date+'_'+shift;
 const record={clubId:club,docId,name:'Student A',profileId:'Student A',branch:'CS1',date,month:'2026-10',shiftId:shift,status:1,belt:'white'};
 let createId='a9r13-create-'+crypto.randomUUID();
 await check('real service creates known-absent Coach attendance without transaction BatchGet',async()=>{
   transactionGets=0;
   const result=await AttendanceService.bulkSyncOffline(club,'',[{id:createId,baseVersion:'absent',record}]);
   assert.equal(result.committed,1);assert.equal(transactionGets,0);
   const snap=await assertSucceeds(sdk.getDoc(sdk.doc(coachDb,'clubs',club,'attendance',docId)));
   assert.equal(snap.exists(),true);assert.equal(snap.data().attendanceVersion,createId);assert.equal(snap.data().attendancePreviousVersion,'absent');
 });
 await check('real service update retains one transaction read and CAS',async()=>{
   transactionGets=0;const updateId='a9r13-update-'+crypto.randomUUID();
   const result=await AttendanceService.bulkSyncOffline(club,'',[{id:updateId,baseVersion:createId,record:{...record,status:2}}]);
   assert.equal(result.committed,1);assert.equal(transactionGets,1);
   const snap=await sdk.getDoc(sdk.doc(coachDb,'clubs',club,'attendance',docId));assert.equal(snap.data().attendanceVersion,updateId);assert.equal(snap.data().attendancePreviousVersion,createId);createId=updateId;
 });
 await check('real Coach member-history query is canonical branch only and succeeds',async()=>{
   const history=await AttendanceService.loadMemberHistory('Student A',['2026-10','2026-11','2026-12']);
   assert.equal(history.length,1);assert.equal(history[0].data.branch,'CS1');assert.equal(history[0].data.historyAuthority,HISTORY_AUTHORITY);
 });
}finally{
 const report={kind:'A9R13_ATTENDANCE_SERVICE_EMULATOR_TEST_ONLY',projectId:project,authority:HISTORY_AUTHORITY,rulesSha256:crypto.createHash('sha256').update(rules).digest('hex'),total:results.length,pass:results.filter(x=>x.result==='PASS').length,fail:results.filter(x=>x.result==='FAIL').length,results};
 fs.mkdirSync('qa_results_a9r13',{recursive:true});fs.writeFileSync('qa_results_a9r13/attendance-service-emulator.json',JSON.stringify(report,null,2));
 console.log('A9R13_SERVICE_EMULATOR '+JSON.stringify({pass:report.pass,fail:report.fail,total:report.total}));
 await env.cleanup();if(report.fail)process.exitCode=1;
}
