/** A9R7 — TEST ONLY: Coach attendance writes on an independently activated DEMO source.
 * Run only on 127.0.0.1 Firestore Emulator. Never read or write production. */
import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {initializeTestEnvironment,assertSucceeds,assertFails} from '@firebase/rules-unit-testing';
import * as sdk from 'firebase/firestore';
import {HISTORY_AUTHORITY,HISTORY_COACH_ACCESS} from '../../js/core/attendanceContract.js';

const host=process.env.FIRESTORE_EMULATOR_HOST||'';
assert.match(host,/^127\.0\.0\.1:\d+$/,'Firestore Emulator on loopback REQUIRED');
const [addr,port]=host.split(':');
const project='demo-v11r2-cutover', club='A', date='2026-10-23';
assert.equal(HISTORY_COACH_ACCESS,true,'Must run ONLY on freshly prepared active demo candidate');
assert(/^attendance-history-[0-9a-f-]{36}$/.test(HISTORY_AUTHORITY));
const rules=fs.readFileSync('firestore.rules','utf8');
assert.match(rules,/function coachAttendanceCutoverOpen\(\)\s*\{\s*return true;/);
assert(rules.includes(HISTORY_AUTHORITY),'Client/Rules authority must be identical');
const dbEnv=await initializeTestEnvironment({projectId:project,firestore:{host:addr,port:Number(port),rules}});
const coach=dbEnv.authenticatedContext('coach-A').firestore();
const admin=dbEnv.authenticatedContext('admin-A').firestore();
const outsider=dbEnv.authenticatedContext('coach-B').firestore();
const att=(db,id)=>sdk.doc(db,'clubs',club,'attendance',id);
const version=()=>crypto.randomUUID();
const base=(profileId,branch,day=date)=>({profileId,name:profileId,branch,date:day,month:day.slice(0,7),status:1,shiftId:'',historyAuthority:HISTORY_AUTHORITY,attendanceVersion:version(),attendancePreviousVersion:'absent'});
const results=[];
async function check(title,fn) {try{await fn();results.push({title,result:'PASS'});console.log('PASS',title)}catch(error){results.push({title,result:'FAIL',code:error.code||error.name,message:String(error.message||error)});console.error('FAIL',title,error.message||error)}}
try {
 await dbEnv.clearFirestore();
 await dbEnv.withSecurityRulesDisabled(async context=>{
  const db=context.firestore(),b=sdk.writeBatch(db),v='demo-a9r7-assignment-version-00000001';
  b.set(sdk.doc(db,'clubs',club),{clubName:'A9R7 DEMO ONLY',coachAclEpoch:1});
  b.set(sdk.doc(db,'clubs',club,'settings','main_config'),{branchCount:2});
  b.set(sdk.doc(db,'clubs',club,'settings','shifts'),{list:[{id:'S1',name:'Ca sáng',branch:'CS1',timeStart:'08:00',timeEnd:'09:00'}]});
  b.set(sdk.doc(db,'users','admin-A'),{role:'admin',clubId:club,status:'active'});
  const coachUser={role:'coach',clubId:club,status:'active',branch:'CS1',coachBranch:'CS1',defaultBranch:'CS1',allowedBranches:['CS1','CS2'],assignmentVersion:v};
  b.set(sdk.doc(db,'users','coach-A'),coachUser);b.set(sdk.doc(db,'clubs',club,'coaches','coach-A'),coachUser);
  b.set(sdk.doc(db,'users','coach-B'),{role:'coach',clubId:'B',status:'active',branch:'CS1',coachBranch:'CS1',defaultBranch:'CS1',allowedBranches:['CS1'],assignmentVersion:v});
  b.set(sdk.doc(db,'clubs','B'),{clubName:'Other'});b.set(sdk.doc(db,'clubs','B','coaches','coach-B'),{role:'coach',clubId:'B',status:'active',branch:'CS1',allowedBranches:['CS1'],assignmentVersion:v});
  b.set(sdk.doc(db,'clubs','B','settings','main_config'),{branchCount:2});
  b.set(sdk.doc(db,'clubs',club,'profiles','P1'),{branch:'CS1',status:'active'});
  b.set(sdk.doc(db,'clubs',club,'profiles','P2'),{branch:'CS2',status:'active'});
  b.set(sdk.doc(db,'clubs',club,'profiles','Foreign'),{branch:'CS2',status:'active'});
  b.set(att(db,'old-untrusted'),{...base('P1','CS1'),historyAuthority:'untrusted-old-history'});
  b.set(att(db,'forged-marker'),{...base('P2','CS1')}); // pre-cutover forged-marker; release blocker by design
  await b.commit();
 });
 await check('Coach may read only authorized shift settings',async()=>{await assertSucceeds(sdk.getDoc(sdk.doc(coach,'clubs',club,'settings','shifts')));await assertFails(sdk.getDoc(sdk.doc(coach,'clubs',club,'settings','main_config')))});
 await check('Coach may read own CS1 and CS2 profiles',async()=>{for(const id of ['P1','P2'])await assertSucceeds(sdk.getDoc(sdk.doc(coach,'clubs',club,'profiles',id)))});
 await check('Coach creates attendance for CS1 and CS2 using canonical profile',async()=>{await assertSucceeds(sdk.setDoc(att(coach,'P1_'+date),base('P1','CS1')));await assertSucceeds(sdk.setDoc(att(coach,'P2_'+date),base('P2','CS2')))});
 await check('Coach reads own current-authority attendance',async()=>{for(const id of ['P1_'+date,'P2_'+date])await assertSucceeds(sdk.getDoc(att(coach,id)))});
 await check('Coach cannot read untrusted legacy record',()=>assertFails(sdk.getDoc(att(coach,'old-untrusted'))));
 await check('Coach cannot invent branch to write foreign profile',()=>assertFails(sdk.setDoc(att(coach,'Foreign_'+date),base('Foreign','CS1'))));
 await check('Coach update with correct CAS advances version',async()=>{const ref=att(coach,'P1_'+date),old=(await sdk.getDoc(ref)).data();await assertSucceeds(sdk.setDoc(ref,{...old,status:2,attendancePreviousVersion:old.attendanceVersion,attendanceVersion:version()}));});
 await check('Stale CAS and wrong marker cannot overwrite',async()=>{const ref=att(coach,'P1_'+date),old=(await sdk.getDoc(ref)).data();await assertFails(sdk.setDoc(ref,{...old,status:1,attendancePreviousVersion:'bad-stale',attendanceVersion:version()}));await assertFails(sdk.setDoc(ref,{...old,historyAuthority:'bad',attendancePreviousVersion:old.attendanceVersion,attendanceVersion:version()}))});
 await check('Coach cannot update pre-cutover legacy record',async()=>{const ref=att(coach,'old-untrusted'),old=(await sdk.getDoc(att(admin,'old-untrusted'))).data();await assertFails(sdk.setDoc(ref,{...old,historyAuthority:HISTORY_AUTHORITY,attendancePreviousVersion:old.attendanceVersion,attendanceVersion:version()}))});
 await check('Cross-club Coach cannot read or write',async()=>{await assertFails(sdk.getDoc(att(outsider,'P1_'+date)));await assertFails(sdk.setDoc(att(outsider,'P1_'+date),base('P1','CS1')))});
 await check('Coach cannot read financial data',()=>assertFails(sdk.getDoc(sdk.doc(coach,'clubs',club,'transactions','test'))));
 await check('Coach cannot delete attendance',()=>assertFails(sdk.deleteDoc(att(coach,'P1_'+date))));
 await check('Admin historical reads retained',async()=>{await assertSucceeds(sdk.getDoc(att(admin,'old-untrusted')));await assertSucceeds(sdk.getDoc(att(admin,'forged-marker')))});
 // This negative cohort proves that marker alone is *NOT* sufficient to trust
 // pre-cutover historical rows. Site activation requires signed zero cohort.
 await check('S01 proof: forged pre-cutover marker remains a release blocker',async()=>{
  const snap=await sdk.getDoc(att(coach,'forged-marker'));assert.equal(snap.exists(),true);
  // Intentionally known unsafe: this fixture is a reason not to deploy before scan.
  assert.equal(snap.data().profileId,'P2');
 });
}finally{
 const report={kind:'DEMO_ACTIVE_ONLY_NOT_RELEASE',projectId:project,authority:HISTORY_AUTHORITY,sourceRulesSHA256:crypto.createHash('sha256').update(rules).digest('hex'),total:results.length,pass:results.filter(x=>x.result==='PASS').length,fail:results.filter(x=>x.result==='FAIL').length,results,notMeasured:['physical iOS/Android','Journal V1/V2 legacy recovery','real historical provenance','production rules/index identities','reads budget approval']};
 fs.mkdirSync('qa_results_a9r7',{recursive:true});fs.writeFileSync('qa_results_a9r7/coach-attendance-demo.json',JSON.stringify(report,null,2));
 console.log('A9R7_DEMO_ATTENDANCE '+JSON.stringify({pass:report.pass,fail:report.fail,total:report.total,release:'HOLD'}));
 await dbEnv.cleanup();if(report.fail)process.exitCode=1;
}
