/** A9R11 — TEST ONLY Firestore Emulator acceptance for operational Coach attendance.
 * Loopback demo project only. Never writes a real Firebase project. */
import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {initializeTestEnvironment,assertSucceeds,assertFails} from '@firebase/rules-unit-testing';
import * as sdk from 'firebase/firestore';
import {HISTORY_AUTHORITY,HISTORY_COACH_ACCESS} from '../../js/core/attendanceContract.js';

const host=process.env.FIRESTORE_EMULATOR_HOST||'';
assert.match(host,/^127\.0\.0\.1:\d+$/,'Firestore Emulator loopback REQUIRED');
const [addr,port]=host.split(':');
const project='demo-a9r11-coach-attendance';
const club='CLB_TEST', otherClub='OTHER';
const date='2026-10-24';
const legacyDate='2026-10-23';
const crossDate='2026-10-25';
const OLD_AUTHORITY='attendance-history-7c42f5e2-6d94-4e49-b8e5-98f876cbd90a';
assert.equal(HISTORY_COACH_ACCESS,true,'A9R11 Coach attendance client gate must be enabled');
assert(/^attendance-history-[0-9a-f-]{36}$/.test(HISTORY_AUTHORITY));
assert.notEqual(HISTORY_AUTHORITY,OLD_AUTHORITY,'A9R11 must use a fresh forward-only authority');
const rules=fs.readFileSync('firestore.rules','utf8');
assert.match(rules,/function coachAttendanceCutoverOpen\(\)\s*\{\s*return true;/);
assert(rules.includes(HISTORY_AUTHORITY),'Client and Rules authority must match exactly');

const env=await initializeTestEnvironment({projectId:project,firestore:{host:addr,port:Number(port),rules}});
const coach=env.authenticatedContext('coach-test').firestore();
const admin=env.authenticatedContext('admin-test').firestore();
const outsider=env.authenticatedContext('coach-other').firestore();
const att=(db,id)=>sdk.doc(db,'clubs',club,'attendance',id);
const version=()=>crypto.randomUUID();
const attendanceId=(profileId,rowDate,shiftId='')=>profileId+'_'+rowDate+(shiftId?'_'+shiftId:'');
const make=(profileId,branch,extra={})=>{
 const rowDate=String(extra.date||date), shiftId=String(extra.shiftId??'S1');
 return {profileId,name:profileId,branch,date:rowDate,month:rowDate.slice(0,7),status:1,shiftId,historyAuthority:HISTORY_AUTHORITY,attendanceVersion:version(),attendancePreviousVersion:'absent',...extra,date:rowDate,month:rowDate.slice(0,7),shiftId};
};
const results=[];
async function check(title,fn){try{await fn();results.push({title,result:'PASS'});console.log('PASS',title)}catch(error){results.push({title,result:'FAIL',code:error.code||error.name,message:String(error.message||error)});console.error('FAIL',title,error.message||error)}}
try{
 await env.clearFirestore();
 await env.withSecurityRulesDisabled(async ctx=>{
  const db=ctx.firestore(),b=sdk.writeBatch(db),assign='a9r11-assignment-00000001';
  b.set(sdk.doc(db,'clubs',club),{clubName:'A9R11 TEST',coachAclEpoch:1});
  b.set(sdk.doc(db,'clubs',club,'settings','main_config'),{branchCount:2});
  b.set(sdk.doc(db,'clubs',club,'settings','shifts'),{list:[{id:'S1',name:'Ca 1',branch:'CS1',timeStart:'08:00',timeEnd:'09:00'},{id:'S2',name:'Ca 2',branch:'CS2',timeStart:'17:30',timeEnd:'19:00'}]});
  b.set(sdk.doc(db,'users','admin-test'),{role:'admin',clubId:club,status:'active'});
  const coachUser={role:'coach',clubId:club,status:'active',branch:'CS1',coachBranch:'CS1',defaultBranch:'CS1',activeBranch:'CS1',allowedBranches:['CS1','CS2'],assignmentVersion:assign};
  b.set(sdk.doc(db,'users','coach-test'),coachUser); b.set(sdk.doc(db,'clubs',club,'coaches','coach-test'),coachUser);
  const other={role:'coach',clubId:otherClub,status:'active',branch:'CS1',coachBranch:'CS1',defaultBranch:'CS1',allowedBranches:['CS1'],assignmentVersion:assign};
  b.set(sdk.doc(db,'clubs',otherClub),{clubName:'OTHER',coachAclEpoch:1}); b.set(sdk.doc(db,'users','coach-other'),other); b.set(sdk.doc(db,'clubs',otherClub,'coaches','coach-other'),other);
  b.set(sdk.doc(db,'clubs',club,'profiles','P1'),{branch:'CS1',status:'active'});
  b.set(sdk.doc(db,'clubs',club,'profiles','P2'),{branch:'CS2',status:'active'});
  b.set(sdk.doc(db,'clubs',club,'profiles','P3'),{branch:'CS3',status:'active'});
  b.set(att(db,attendanceId('P1',legacyDate,'S1')),make('P1','CS1',{date:legacyDate,historyAuthority:OLD_AUTHORITY,shiftId:'S1'}));
  await b.commit();
 });
 await check('Coach reads shift settings but not main_config',async()=>{await assertSucceeds(sdk.getDoc(sdk.doc(coach,'clubs',club,'settings','shifts')));await assertFails(sdk.getDoc(sdk.doc(coach,'clubs',club,'settings','main_config')))});
 await check('Coach reads assigned CS1 and CS2 profiles',async()=>{await assertSucceeds(sdk.getDoc(sdk.doc(coach,'clubs',club,'profiles','P1')));await assertSucceeds(sdk.getDoc(sdk.doc(coach,'clubs',club,'profiles','P2')))});
 await check('Coach cannot read unassigned CS3 profile',()=>assertFails(sdk.getDoc(sdk.doc(coach,'clubs',club,'profiles','P3'))));
 await check('Coach creates CS1 attendance with current authority',()=>assertSucceeds(sdk.setDoc(att(coach,attendanceId('P1',date,'S1')),make('P1','CS1',{shiftId:'S1'}))));
 await check('Coach creates CS2 attendance with current authority',()=>assertSucceeds(sdk.setDoc(att(coach,attendanceId('P2',date,'S2')),make('P2','CS2',{shiftId:'S2'}))));
 await check('Coach reads newly-created current-authority attendance',async()=>{const p1=await assertSucceeds(sdk.getDoc(att(coach,attendanceId('P1',date,'S1'))));const p2=await assertSucceeds(sdk.getDoc(att(coach,attendanceId('P2',date,'S2'))));assert.equal(p1.exists(),true);assert.equal(p2.exists(),true)});
 await check('Coach daily list query succeeds for assigned CS1',async()=>{const snap=await assertSucceeds(sdk.getDocs(sdk.query(sdk.collection(coach,'clubs',club,'attendance'),sdk.where('date','==',date),sdk.where('historyAuthority','==',HISTORY_AUTHORITY),sdk.where('branch','==','CS1'),sdk.where('shiftId','==','S1'),sdk.limit(400))));assert.equal(snap.size,1)});
 await check('Coach daily list query succeeds for assigned CS2',async()=>{const snap=await assertSucceeds(sdk.getDocs(sdk.query(sdk.collection(coach,'clubs',club,'attendance'),sdk.where('date','==',date),sdk.where('historyAuthority','==',HISTORY_AUTHORITY),sdk.where('branch','==','CS2'),sdk.where('shiftId','==','S2'),sdk.limit(400))));assert.equal(snap.size,1)});
 await check('Coach daily list query is denied for unassigned CS3',()=>assertFails(sdk.getDocs(sdk.query(sdk.collection(coach,'clubs',club,'attendance'),sdk.where('date','==',date),sdk.where('historyAuthority','==',HISTORY_AUTHORITY),sdk.where('branch','==','CS3'),sdk.where('shiftId','==','S3'),sdk.limit(400)))));
 await check('Coach cannot read legacy pre-A9R11 attendance',()=>assertFails(sdk.getDoc(att(coach,attendanceId('P1',legacyDate,'S1')))));
 await check('Coach cannot promote legacy attendance to new authority',async()=>{const ref=att(admin,attendanceId('P1',legacyDate,'S1')),old=(await sdk.getDoc(ref)).data();assert.ok(old?.attendanceVersion);await assertFails(sdk.setDoc(att(coach,attendanceId('P1',legacyDate,'S1')),{...old,historyAuthority:HISTORY_AUTHORITY,attendancePreviousVersion:old.attendanceVersion,attendanceVersion:version()}))});
 await check('Coach update succeeds only with correct CAS',async()=>{const ref=att(coach,attendanceId('P1',date,'S1')),oldSnap=await sdk.getDoc(ref);assert.equal(oldSnap.exists(),true);const old=oldSnap.data();assert.ok(old?.attendanceVersion);await assertSucceeds(sdk.setDoc(ref,{...old,status:2,attendancePreviousVersion:old.attendanceVersion,attendanceVersion:version()}));const nowSnap=await sdk.getDoc(ref);assert.equal(nowSnap.exists(),true);const now=nowSnap.data();await assertFails(sdk.setDoc(ref,{...now,status:1,attendancePreviousVersion:'stale-version',attendanceVersion:version()}))});
 await check('Coach cannot spoof branch against canonical profile',()=>assertFails(sdk.setDoc(att(coach,attendanceId('P2',date,'S1')),make('P2','CS1',{shiftId:'S1'}))));
 await check('Cross-club Coach denied',async()=>{await assertFails(sdk.getDoc(sdk.doc(outsider,'clubs',club,'profiles','P1')));await assertFails(sdk.setDoc(att(outsider,attendanceId('P1',crossDate,'S1')),make('P1','CS1',{date:crossDate,shiftId:'S1'})))});
 await check('Coach finance boundary remains denied',()=>assertFails(sdk.getDoc(sdk.doc(coach,'clubs',club,'transactions','tx1'))));
 await check('Coach cannot delete attendance',()=>assertFails(sdk.deleteDoc(att(coach,attendanceId('P1',date,'S1')))));
 await check('Admin retains access to legacy attendance',async()=>{const snap=await assertSucceeds(sdk.getDoc(att(admin,attendanceId('P1',legacyDate,'S1'))));assert.equal(snap.exists(),true)});
}finally{
 const report={kind:'A9R11_COACH_ATTENDANCE_OPERATIONAL_EMULATOR_TEST_ONLY',projectId:project,authority:HISTORY_AUTHORITY,rulesSha256:crypto.createHash('sha256').update(rules).digest('hex'),total:results.length,pass:results.filter(x=>x.result==='PASS').length,fail:results.filter(x=>x.result==='FAIL').length,results};
 fs.mkdirSync('qa_results_a9r11',{recursive:true});fs.writeFileSync('qa_results_a9r11/coach-attendance-operational-emulator.json',JSON.stringify(report,null,2));
 console.log('A9R11_EMULATOR '+JSON.stringify({pass:report.pass,fail:report.fail,total:report.total}));
 await env.cleanup(); if(report.fail)process.exitCode=1;
}
