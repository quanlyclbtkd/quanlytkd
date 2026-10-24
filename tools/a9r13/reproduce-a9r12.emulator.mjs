import fs from 'node:fs';
import assert from 'node:assert/strict';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {initializeTestEnvironment} from '@firebase/rules-unit-testing';
import * as sdk from 'firebase/firestore';
assert(process.env.A9R12_BASELINE_ROOT,'Set A9R12_BASELINE_ROOT to the extracted, unmodified A9R12 source folder');
const baseline=path.resolve(process.env.A9R12_BASELINE_ROOT);
const {AttendanceService}=await import(pathToFileURL(path.join(baseline,'js/services/attendance.service.js')).href);
const {HISTORY_AUTHORITY}=await import(pathToFileURL(path.join(baseline,'js/core/attendanceContract.js')).href);
const host=process.env.FIRESTORE_EMULATOR_HOST;
assert.match(host||'',/^127\.0\.0\.1:\d+$/);
const [address,port]=host.split(':');
const rulesPath=path.join(baseline,'firestore.rules');
const env=await initializeTestEnvironment({projectId:'demo-a9r13-baseline',firestore:{host:address,port:Number(port),rules:fs.readFileSync(rulesPath,'utf8')}});
const club='CLB_TEST',date='2026-10-24',report=[];
try {
 await env.clearFirestore();
 await env.withSecurityRulesDisabled(async ctx=>{
  const db=ctx.firestore(),b=sdk.writeBatch(db);
  const user={role:'coach',clubId:club,status:'active',branch:'CS1',coachBranch:'CS1',defaultBranch:'CS1',allowedBranches:['CS1','CS2'],assignmentVersion:'assignment-a9r13-00001'};
  b.set(sdk.doc(db,'clubs',club),{coachAclEpoch:1});
  b.set(sdk.doc(db,'clubs',club,'settings','main_config'),{branchCount:2});
  b.set(sdk.doc(db,'users','coach-test'),user);b.set(sdk.doc(db,'clubs',club,'coaches','coach-test'),user);
  for(const name of ['Fresh','Legacy','Current']) b.set(sdk.doc(db,'clubs',club,'profiles',name),{branch:'CS1',status:'active'});
  for(const name of ['Legacy','Current'])b.set(sdk.doc(db,'clubs',club,'attendance',name+'_'+date+'_S1'),{profileId:name,name,branch:'CS1',date,month:'2026-10',shiftId:'S1',status:1,historyAuthority:name==='Current'?HISTORY_AUTHORITY:'old-history',attendanceVersion:'baseline-version-00001'});
  await b.commit();
 });
 const db=env.authenticatedContext('coach-test').firestore();
 globalThis.window={_fb_init:sdk,__store:{db,clubId:club,userRole:'coach',currentUser:{uid:'coach-test'}},userRole:'coach',coachBranch:'CS1',__verifiedAuthContextState:{uid:'coach-test',clubId:club,role:'coach',ready:true,activeBranch:'CS1',coachBranch:'CS1',allowedBranches:['CS1','CS2']}};
 async function attempt(title,fn){try {const result=await fn();report.push({title,result:'SUCCESS',details:result});}catch(e){report.push({title,result:'ERROR',code:e.code,message:e.message});}}
 const target=name=>sdk.doc(db,'clubs',club,'attendance',name+'_'+date+'_S1');
 await attempt('getDoc absent attendance',async()=>({exists:(await sdk.getDocFromServer(target('Fresh'))).exists()}));
 await attempt('actual service transaction create after absent read',()=>AttendanceService.bulkSyncOffline(club,date,[{id:'fresh-intent-a9r13-00001',baseVersion:'absent',record:{clubId:club,profileId:'Fresh',name:'Fresh',branch:'CS1',date,month:'2026-10',shiftId:'S1',docId:'Fresh_'+date+'_S1',status:1}}]));
 await attempt('actual service member history CS1',async()=>({count:(await AttendanceService.loadMemberHistory('Current',['2026-10','2026-11','2026-12'])).length}));
 await attempt('actual service transaction on hidden legacy collision',()=>AttendanceService.bulkSyncOffline(club,date,[{id:'legacy-intent-a9r13-00001',baseVersion:'absent',record:{clubId:club,profileId:'Legacy',name:'Legacy',branch:'CS1',date,month:'2026-10',shiftId:'S1',docId:'Legacy_'+date+'_S1',status:1}}]));
} finally {
 fs.mkdirSync('evidence/A9R13',{recursive:true});
 fs.writeFileSync('evidence/A9R13/A9R12_REPRODUCTION.json',JSON.stringify({rulesPath,results:report},null,2));
 console.log(JSON.stringify(report,null,2));
 await env.cleanup();
}
