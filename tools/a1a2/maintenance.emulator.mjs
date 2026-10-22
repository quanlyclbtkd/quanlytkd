// Maintenance DENY checks only. Does not certify S01 provenance or active access.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {initializeTestEnvironment,assertFails,assertSucceeds} from '@firebase/rules-unit-testing';
import * as sdk from 'firebase/firestore';
import {HISTORY_AUTHORITY,HISTORY_COACH_ACCESS} from '../../js/core/attendanceContract.js';
import {digest,runtimeHash} from '../v11r2/cutover.mjs';
const host=process.env.FIRESTORE_EMULATOR_HOST;assert.match(host||'',/^127\.0\.0\.1:\d+$/);assert.equal(HISTORY_COACH_ACCESS,false);
const [hostname,port]=host.split(':'),projectId='demo-a12-maintenance',club='A',date='2026-10-21',results=[];
const env=await initializeTestEnvironment({projectId,firestore:{host:hostname,port:Number(port),rules:fs.readFileSync('firestore.rules','utf8')}});
const coach1=env.authenticatedContext('coach1').firestore(),coach2=env.authenticatedContext('coach2').firestore(),admin=env.authenticatedContext('admin').firestore();
const ref=(db,id)=>sdk.doc(db,'clubs',club,'attendance',id);
const record=(profileId,branch)=>({profileId,name:profileId,branch,date,month:'2026-10',status:1,shiftId:'',historyAuthority:HISTORY_AUTHORITY,attendanceVersion:'maintenance-test-version',attendancePreviousVersion:'legacy'});
const test=async(name,fn)=>{await fn();results.push({name,status:'PASS'});console.log('PASS '+name)};
try {
 await env.withSecurityRulesDisabled(async context=>{
  const db=context.firestore(),batch=sdk.writeBatch(db);
  for(const [uid,role,branch]of [['coach1','coach','CS1'],['coach2','coach','CS2'],['admin','admin','CS1']])batch.set(sdk.doc(db,'users',uid),{role,clubId:club,branch});
  for(const [id,branch]of [['Own','CS1'],['Foreign','CS2']])batch.set(sdk.doc(db,'clubs',club,'profiles',id),{branch,status:'active'});
  batch.set(sdk.doc(db,'clubs',club,'settings','shifts'),{list:[]});
  batch.set(ref(db,'Own_'+date),record('Own','CS1'));batch.set(ref(db,'forged-current-marker'),record('Foreign','CS1'));
  batch.set(ref(db,'unmarked'),{...record('Own','CS1'),historyAuthority:''});await batch.commit();
 });
 await test('both Coach branches deny marked, unmarked, forged and absent gets',async()=>{
  for(const db of [coach1,coach2])for(const id of ['Own_'+date,'forged-current-marker','unmarked','absent'])await assertFails(sdk.getDoc(ref(db,id)));
 });
 await test('both Coach branches deny history list queries',async()=>{
  for(const [db,branch]of [[coach1,'CS1'],[coach2,'CS2']])for(const [field,value]of [['date',date],['month','2026-10'],['profileId','Foreign']]){
   await assertFails(sdk.getDocs(sdk.query(sdk.collection(db,'clubs',club,'attendance'),sdk.where('branch','==',branch),sdk.where('historyAuthority','==',HISTORY_AUTHORITY),sdk.where(field,'==',value))));
  }
 });
 await test('both Coach branches deny attendance create, update and delete',async()=>{
  for(const db of [coach1,coach2]){
   await assertFails(sdk.setDoc(ref(db,'new'),record('Own','CS1')));
   await assertFails(sdk.updateDoc(ref(db,'Own_'+date),{status:2}));await assertFails(sdk.deleteDoc(ref(db,'Own_'+date)));
  }
 });
 await test('canonical own profile and shifts reads are preserved',async()=>{
  await assertSucceeds(sdk.getDoc(sdk.doc(coach1,'clubs',club,'profiles','Own')));
  await assertSucceeds(sdk.getDoc(sdk.doc(coach1,'clubs',club,'settings','shifts')));
 });
 await test('Admin attendance get and list remain available',async()=>{
  await assertSucceeds(sdk.getDoc(ref(admin,'forged-current-marker')));assert.equal((await sdk.getDocs(sdk.collection(admin,'clubs',club,'attendance'))).size,3);
 });
 await test('financial and inventory Rules remain closed to Coach',async()=>{
  for(const col of ['transactions','inventory','exams']){
   const doc=sdk.doc(admin,'clubs',club,col,'LOCAL_TEST');await assertSucceeds(sdk.setDoc(doc,{test:true}));await assertSucceeds(sdk.getDoc(doc));
   for(const db of [coach1,coach2])await assertFails(sdk.getDoc(sdk.doc(db,'clubs',club,col,'LOCAL_TEST')));
  }
 });
} catch(error) {results.push({name:'failure',status:'FAIL',error:error.stack});throw error}
finally {
 fs.mkdirSync('handoff/A1A2/evidence',{recursive:true});
 fs.writeFileSync('handoff/A1A2/evidence/maintenance-emulator.json',JSON.stringify({status:results.every(r=>r.status==='PASS')?'PASS':'FAIL',scope:'CURRENT_MAINTENANCE_ONLY_NOT_S01_ACTIVE_ACCEPTANCE',runtimeSHA256:runtimeHash(process.cwd()),rulesSHA256:digest(fs.readFileSync('firestore.rules','utf8')),projectId,results,productionWrites:0},null,2));
 await env.cleanup();
}
