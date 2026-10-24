import fs from 'node:fs';
import assert from 'node:assert/strict';
import {initializeTestEnvironment,assertSucceeds,assertFails} from '@firebase/rules-unit-testing';
import * as sdk from 'firebase/firestore';
import {HISTORY_AUTHORITY} from '../../js/core/attendanceContract.js';
const host=process.env.FIRESTORE_EMULATOR_HOST||''; assert.match(host,/^127\.0\.0\.1:\d+$/);
const [addr,port]=host.split(':'); const project='demo-a9r11-query-repro'; const club='CLB_TEST'; const date='2026-10-24';
const rules=fs.readFileSync('firestore.rules','utf8');
const env=await initializeTestEnvironment({projectId:project,firestore:{host:addr,port:Number(port),rules}});
const coach=env.authenticatedContext('coach-test').firestore();
const id=(p,d,s)=>`${p}_${d}_${s}`;
try {
 await env.clearFirestore();
 await env.withSecurityRulesDisabled(async ctx=>{
   const db=ctx.firestore(), b=sdk.writeBatch(db), assign='a9r11-assignment-00000001';
   b.set(sdk.doc(db,'clubs',club),{clubName:'A9R11 TEST',coachAclEpoch:1});
   b.set(sdk.doc(db,'clubs',club,'settings','main_config'),{branchCount:2});
   const u={role:'coach',clubId:club,status:'active',branch:'CS1',coachBranch:'CS1',defaultBranch:'CS1',activeBranch:'CS1',allowedBranches:['CS1','CS2'],assignmentVersion:assign};
   b.set(sdk.doc(db,'users','coach-test'),u); b.set(sdk.doc(db,'clubs',club,'coaches','coach-test'),u);
   b.set(sdk.doc(db,'clubs',club,'profiles','P1'),{branch:'CS1',status:'active'});
   b.set(sdk.doc(db,'clubs',club,'profiles','P2'),{branch:'CS2',status:'active'});
   b.set(sdk.doc(db,'clubs',club,'attendance',id('P1',date,'S1')),{profileId:'P1',name:'P1',branch:'CS1',date,month:'2026-10',status:1,shiftId:'S1',historyAuthority:HISTORY_AUTHORITY,attendanceVersion:'1234567890abcdef',attendancePreviousVersion:'absent'});
   b.set(sdk.doc(db,'clubs',club,'attendance',id('P2',date,'S2')),{profileId:'P2',name:'P2',branch:'CS2',date,month:'2026-10',status:1,shiftId:'S2',historyAuthority:HISTORY_AUTHORITY,attendanceVersion:'1234567890abcdef',attendancePreviousVersion:'absent'});
   await b.commit();
 });
 const col=sdk.collection(coach,'clubs',club,'attendance');
 const cases=[
  ['cs1-eq', sdk.query(col,sdk.where('date','==',date),sdk.where('historyAuthority','==',HISTORY_AUTHORITY),sdk.where('branch','==','CS1'),sdk.where('shiftId','==','S1'),sdk.limit(400))],
  ['cs1-in', sdk.query(col,sdk.where('date','==',date),sdk.where('historyAuthority','==',HISTORY_AUTHORITY),sdk.where('branch','in',['CS1','Mặc định']),sdk.where('shiftId','==','S1'),sdk.limit(400))],
  ['cs2-eq', sdk.query(col,sdk.where('date','==',date),sdk.where('historyAuthority','==',HISTORY_AUTHORITY),sdk.where('branch','==','CS2'),sdk.where('shiftId','==','S2'),sdk.limit(400))],
  ['date-authority-only', sdk.query(col,sdk.where('date','==',date),sdk.where('historyAuthority','==',HISTORY_AUTHORITY),sdk.limit(400))],
 ];
 for (const [name,q] of cases) {
   try { const s=await sdk.getDocs(q); console.log('QUERY',name,'PASS',s.size); }
   catch(e){ console.log('QUERY',name,'FAIL',e.code,e.message); }
 }
} finally { await env.cleanup(); }
