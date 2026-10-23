/**
 * A9R5 Auth + Firestore integration, DEMO ONLY.
 * Exercises the UNCHANGED canonical browser owner (coachBranchRuntimeRepair.js)
 * with real Firebase Web SDK sessions against BOTH local emulators. No production.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto, {webcrypto} from 'node:crypto';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {initializeApp,deleteApp} from 'firebase/app';
import {getAuth,connectAuthEmulator,createUserWithEmailAndPassword,signInWithEmailAndPassword,signOut} from 'firebase/auth';
import {getFirestore,connectFirestoreEmulator,doc,getDoc,setDoc,writeBatch,increment,runTransaction} from 'firebase/firestore';
import {initializeTestEnvironment} from '@firebase/rules-unit-testing';

const PROJECT='demo-a9r5-coach-auth';
const authHost=process.env.FIREBASE_AUTH_EMULATOR_HOST;
const dbHost=process.env.FIRESTORE_EMULATOR_HOST;
const portMatch=s=>/^127\.0\.0\.1:\d+$/.test(String(s||''));
assert(portMatch(authHost)&&portMatch(dbHost),'STOP: Both Auth and Firestore emulators must run on 127.0.0.1; no live fallback');
assert(process.env.GCLOUD_PROJECT===PROJECT || process.env.GOOGLE_CLOUD_PROJECT===PROJECT,'STOP: demo project identity mismatch');
const source=fs.readFileSync('js/core/coachBranchRuntimeRepair.js','utf8');
const rules=fs.readFileSync('firestore.rules','utf8');
const rulesSha=crypto.createHash('sha256').update(rules).digest('hex');
const expectedRules=fs.readFileSync('tools/a9r4/a9r3-original-rules.sha256','utf8').trim();
assert.equal(rulesSha,expectedRules,'STOP: A9R3 ACL Rules changed');
const [fsHost,fsPort]=dbHost.split(':');
const env=await initializeTestEnvironment({projectId:PROJECT,firestore:{host:fsHost,port:Number(fsPort),rules}});
const app=initializeApp({projectId:PROJECT,apiKey:'demo-api-key-never-production',authDomain:`${PROJECT}.firebaseapp.com`,appId:'demo:a9r5:primary'});
const secondary=initializeApp({projectId:PROJECT,apiKey:'demo-api-key-never-production',authDomain:`${PROJECT}.firebaseapp.com`,appId:'demo:a9r5:secondary'},'SecondaryAppA9R5');
const auth=getAuth(app),secondaryAuth=getAuth(secondary);
// Must connect both Auths BEFORE the first Auth network action.
connectAuthEmulator(auth,`http://${authHost}`,{disableWarnings:true});
connectAuthEmulator(secondaryAuth,`http://${authHost}`,{disableWarnings:true});
const db=getFirestore(app);
connectFirestoreEmulator(db,fsHost,Number(fsPort));
const report={projectId:PROJECT,rulesSha256:rulesSha,scope:'DEMO Auth + Firestore emulators; canonical owner exercised',results:[]};
const test=async(label,run)=>{try{await run();report.results.push({label,result:'PASS'});console.log('PASS',label)}catch(e){report.results.push({label,result:'FAIL',code:String(e?.code||e?.name||'UNKNOWN')});console.error('FAIL',label,String(e?.code||e?.name||'UNKNOWN'))}};
const snap=async r=>getDoc(doc(db,...r));
const testEmails={admin:'admin.a9r5@example.invalid',first:'coach.a9r5@example.invalid',orphan:'orphan.a9r5@example.invalid'};
const password='Emulator-Only-Password-2026!';
const administrator=await createUserWithEmailAndPassword(auth,testEmails.admin,password);
const adminUid=administrator.user.uid;
await env.withSecurityRulesDisabled(async ctx=>{
 const seed=ctx.firestore(),b=writeBatch(seed);
 b.set(doc(seed,'users',adminUid),{clubId:'A',role:'admin',status:'active'});
 b.set(doc(seed,'clubs','A'),{clubName:'DEMO TRAINING ONLY',coachAclEpoch:7});
 b.set(doc(seed,'clubs','A','settings','main_config'),{branchCount:2});
 b.set(doc(seed,'clubs','B'),{clubName:'OTHER DEMO CLUB',coachAclEpoch:3});
 await b.commit();
});
const elements={
 coach_email:{value:testEmails.first},coach_pass:{value:password},coach_name:{value:'DEMO COACH'},
 btnCreateCoach:{disabled:false},btnRecoverCoach:{disabled:false},
 coach_create_branches:{querySelectorAll:()=>[{value:'CS1'},{value:'CS2'}]},
 coach_create_branches_primary:{value:'CS1'},
};
const dialogs=[];let promptValue='';
const ownerSdk={doc,getDoc,writeBatch,increment,runTransaction,createUserWithEmailAndPassword,signInWithEmailAndPassword,signOut};
const win={__appLoaded:true,_fb_init:ownerSdk,_secondaryAuth:secondaryAuth,crypto:webcrypto,
 __store:{clubId:'A',db,userRole:'admin',currentUser:{uid:adminUid},clubConfig:{branchCount:2}},
 __verifiedAuthContextState:{uid:adminUid,clubId:'A',role:'admin',ready:true,generation:1},
 userRole:'admin',alert:m=>dialogs.push(String(m)),showToast:()=>{},
 confirm:()=>true,prompt:()=>promptValue,
};
const document={getElementById:id=>elements[id]||null};
vm.runInNewContext(source,{window:win,document,console,setTimeout,crypto:webcrypto,Blob:globalThis.Blob,URL:globalThis.URL});
let coachUid='';
await test('RED: Admin preflight read of absent User denied by Rules',async()=>{
 // The existing Auth identity from an Auth-only creation is not a Firestore User.
 const created=await createUserWithEmailAndPassword(secondaryAuth,'preflight.a9r5@example.invalid',password);
 await assert.rejects(getDoc(doc(db,'users',created.user.uid)),e=>e.code==='permission-denied');
 await signOut(secondaryAuth);
});
await test('GREEN: original UI owner creates Auth then atomic 3-doc ACL and readback',async()=>{
 await win.createCoachAccount();
 assert(dialogs.some(m=>m.startsWith('Đã tạo và xác minh hồ sơ HLV')),'No confirmed completion');
 const cred=await signInWithEmailAndPassword(secondaryAuth,testEmails.first,password);
 coachUid=cred.user.uid;
 const [c,u,r]=await Promise.all([
   snap(['clubs','A','coaches',coachUid]),snap(['users',coachUid]),snap(['clubs','A'])]);
 assert(c.exists()&&u.exists());
 assert.equal(c.data().assignmentVersion,u.data().assignmentVersion);
 assert.deepEqual(c.data().allowedBranches,['CS1','CS2']);
 assert.equal(c.data().primaryCoachBranch,'CS1');
 assert.equal(r.data().coachAclEpoch,8);
 await signOut(secondaryAuth);
});
await test('Existing Auth email cannot be recreated; no duplicate ACL write',async()=>{
 const before=(await snap(['clubs','A'])).data().coachAclEpoch;
 elements.coach_email.value=testEmails.first;elements.coach_pass.value=password;elements.coach_name.value='DEMO COACH';
 await win.createCoachAccount();
 assert(dialogs.some(m=>m.includes('auth/email-already-in-use')));
 assert.equal((await snap(['clubs','A'])).data().coachAclEpoch,before);
});
await test('Coach signs in and resolves CS1+CS2 from canonical plus mirror',async()=>{
 await signOut(auth);
 const cred=await signInWithEmailAndPassword(auth,testEmails.first,password);
 const mirror=(await snap(['users',cred.user.uid])).data();
 const c=await win.CoachBranchRuntimeRepair.resolveAuthContext({user:cred.user,context:{...mirror,ready:true},db});
 assert.equal(c.role,'coach');assert.deepEqual(Array.from(c.allowedBranches),['CS1','CS2']);
 assert.equal(c.primaryCoachBranch,'CS1');
 await assert.rejects(win.CoachBranchRuntimeRepair.resolveAuthContext({user:cred.user,context:{...mirror,assignmentVersion:'stale-version'},db}),e=>e.code==='auth/coach-assignment-mismatch');
 await signOut(auth);await signInWithEmailAndPassword(auth,testEmails.admin,password);
});
await test('Normal Admin update revokes CS2 without replacing Auth identity',async()=>{
 const before=await snap(['clubs','A','coaches',coachUid]);
 const id='coach_assigned_branch_'+coachUid;
 elements[id]={dataset:{assignmentVersion:before.data().assignmentVersion},querySelectorAll:()=>[{value:'CS1',disabled:false}]};
 elements[id+'_primary']={value:'CS1'};
 await win.updateCoachBranch(coachUid);
 const after=(await snap(['clubs','A','coaches',coachUid])).data();
 assert.deepEqual(after.allowedBranches,['CS1']);
 assert.notEqual(after.assignmentVersion,before.data().assignmentVersion);
});
await test('Admin-reviewed repair after mirror version divergence keeps atomic CAS',async()=>{
 const before=(await snap(['clubs','A','coaches',coachUid])).data();
 await env.withSecurityRulesDisabled(async ctx=>{
  const ref=doc(ctx.firestore(),'users',coachUid);
  const old=(await getDoc(ref)).data();
  await setDoc(ref,{...old,assignmentVersion:'DEMO_STALE_MIRROR_VERSION_2026'});
 });
 const id='coach_assigned_branch_'+coachUid;
 elements[id]={dataset:{assignmentVersion:before.assignmentVersion},querySelectorAll:()=>[{value:'CS1'}]};
 elements[id+'_primary']={value:'CS1'};promptValue='KHOI PHUC';
 const epochBefore=(await snap(['clubs','A'])).data().coachAclEpoch;
 await win.repairCoachMirror(coachUid);
 const [c,u,r]=await Promise.all([snap(['clubs','A','coaches',coachUid]),snap(['users',coachUid]),snap(['clubs','A'])]);
 assert.equal(c.data().assignmentVersion,u.data().assignmentVersion);
 assert.equal(u.data().assignmentPreviousVersion,'DEMO_STALE_MIRROR_VERSION_2026');
 assert.equal(c.data().assignmentPreviousVersion,before.assignmentVersion);
 assert.equal(r.data().coachAclEpoch,epochBefore+1);
});
await test('Orphan Auth identity recovers with same savePair owner, no new Auth registration',async()=>{
 const credential=await createUserWithEmailAndPassword(secondaryAuth,testEmails.orphan,password);
 const uid=credential.user.uid;await signOut(secondaryAuth);
 assert.equal((await snap(['clubs','A','coaches',uid])).exists(),false);
 elements.coach_email.value=testEmails.orphan;elements.coach_pass.value=password;elements.coach_name.value='DEMO ORPHAN';
 promptValue=uid;
 await win.recoverCreatedCoachAccount();
 assert(dialogs.some(m=>m.includes('Đã khôi phục và đọc lại hồ sơ')),'recovery was not verified');
 assert.equal((await snap(['users',uid])).data().clubId,'A');
 assert.equal((await snap(['clubs','A','coaches',uid])).data().role,'coach');
});
await test('Recovery replay refuses existing canonical, no epoch increase',async()=>{
 const old=(await snap(['clubs','A'])).data().coachAclEpoch;
 // A9R4 clears credential form on success, re-enter demo-only values.
 elements.coach_email.value=testEmails.orphan;elements.coach_pass.value=password;elements.coach_name.value='DEMO ORPHAN';
 await win.recoverCreatedCoachAccount();
 assert(dialogs.some(m=>m.includes('auth/coach-recovery-review')));
 assert.equal((await snap(['clubs','A'])).data().coachAclEpoch,old);
});
await test('Existing Auth and Firestore preserve Coach maintenance lock',async()=>{
 assert(fs.readFileSync('js/core/attendanceContract.js','utf8').includes('HISTORY_COACH_ACCESS = false'));
 assert(/function coachAttendanceCutoverOpen\(\)\s*\{\s*return false;\s*\}/.test(rules));
});
report.pass=report.results.filter(x=>x.result==='PASS').length;
report.fail=report.results.filter(x=>x.result==='FAIL').length;
report.total=report.results.length;
fs.mkdirSync('qa_emulator_results_a9r5',{recursive:true});
fs.writeFileSync('qa_emulator_results_a9r5/coach-auth-firestore.json',JSON.stringify(report,null,2));
console.log('A9R5_AUTH_FIRESTORE_RESULT',JSON.stringify({pass:report.pass,fail:report.fail,total:report.total,rulesSha256:rulesSha}));
await signOut(auth);await signOut(secondaryAuth);await deleteApp(app);await deleteApp(secondary);await env.cleanup();
if(report.fail)process.exitCode=1;
