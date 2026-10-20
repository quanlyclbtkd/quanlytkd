// Test the temporary deny phase. This script never deploys Rules to a real project.
import fs from 'node:fs';import assert from 'node:assert/strict';import {initializeTestEnvironment,assertFails,assertSucceeds} from '@firebase/rules-unit-testing';import * as sdk from 'firebase/firestore';import {HISTORY_AUTHORITY} from '../../js/core/attendanceContract.js';
const [host,port]=process.env.FIRESTORE_EMULATOR_HOST.split(':'),club='cutover';
const env=await initializeTestEnvironment({projectId:'demo-v11-cutover',firestore:{host,port:Number(port),rules:fs.readFileSync('handoff/V11/firestore-cutover-admin-only.rules','utf8')}});
try{
 const data={profileId:'P',name:'P',branch:'CS1',date:'2026-10-20',month:'2026-10',status:1,historyAuthority:HISTORY_AUTHORITY,attendanceVersion:'cutover-marker-version',attendancePreviousVersion:'legacy'};
 await env.withSecurityRulesDisabled(async c=>{const db=c.firestore();for(const [uid,role] of [['coach','coach'],['admin','admin']])await sdk.setDoc(sdk.doc(db,'users',uid),{clubId:club,role,branch:'CS1'});await sdk.setDoc(sdk.doc(db,'clubs',club,'profiles','P'),{branch:'CS1'});await sdk.setDoc(sdk.doc(db,'clubs',club,'attendance','P_2026-10-20'),data)});
 const coach=env.authenticatedContext('coach').firestore(),admin=env.authenticatedContext('admin').firestore(),ref=db=>sdk.doc(db,'clubs',club,'attendance','P_2026-10-20');
 await assertFails(sdk.getDoc(ref(coach)));await assertFails(sdk.getDocs(sdk.query(sdk.collection(coach,'clubs',club,'attendance'),sdk.where('branch','==','CS1'),sdk.where('historyAuthority','==',HISTORY_AUTHORITY))));
 await assertFails(sdk.setDoc(sdk.doc(coach,'clubs',club,'attendance','P_2026-10-21'),{...data,date:'2026-10-21'}));await assertFails(sdk.updateDoc(ref(coach),{status:2}));
 const result=await assertSucceeds(sdk.getDocs(sdk.query(sdk.collection(admin,'clubs',club,'attendance'),sdk.where('historyAuthority','==',HISTORY_AUTHORITY))));assert.equal(result.size,1);
 const canActivate=snap=>{if(snap.size!==0)throw Error('COHORT_NOT_EMPTY: stop activation and rotate/audit under maintenance Rules');return true};assert.throws(()=>canActivate(result),/COHORT_NOT_EMPTY/);
 console.log('CUTOVER PASS: Coach get/list/create/update denied; Admin sees pre-existing cohort; activation rejected on nonzero cohort.');
}finally{await env.cleanup()}
