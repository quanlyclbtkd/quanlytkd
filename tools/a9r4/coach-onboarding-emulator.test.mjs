/** A9R4 Firestore Rules preflight vs one existing atomic write owner. DEMO DATA ONLY. */
import fs from 'node:fs';import crypto from 'node:crypto';import assert from 'node:assert/strict';
import {initializeTestEnvironment,assertSucceeds,assertFails} from '@firebase/rules-unit-testing';
import {doc,getDoc,writeBatch,increment} from 'firebase/firestore';
const projectId='demo-a9r4-coach-onboard';
const hostValue=process.env.FIRESTORE_EMULATOR_HOST||'';
assert(/^127\.0\.0\.1:\d+$/.test(hostValue),'Firestore must be loopback emulator');
assert((process.env.GCLOUD_PROJECT||process.env.GOOGLE_CLOUD_PROJECT||projectId).startsWith('demo-'));
const [host,port]=hostValue.split(':');
const rules=fs.readFileSync('firestore.rules','utf8');const hash=crypto.createHash('sha256').update(rules).digest('hex');
assert.equal(hash,fs.readFileSync('tools/a9r4/a9r3-original-rules.sha256','utf8').trim(),'A9R3 Rules must be unchanged');
const env=await initializeTestEnvironment({projectId,firestore:{host,port:Number(port),rules}});
const admin=env.authenticatedContext('adminA').firestore(), outsider=env.authenticatedContext('adminB').firestore();
const version='a9r4-onboarding-version-00000001';
const role=(branch='CS1')=>({role:'coach',clubId:'A',status:'active',branch,coachBranch:branch,primaryCoachBranch:branch,defaultBranch:branch,allowedBranches:['CS1','CS2'],assignmentVersion:version,assignmentPreviousVersion:'absent',email:'fixture@example.invalid',updatedAt:'2026-10-23T00:00:00Z'});
const refs=db=>({user:doc(db,'users','newCoachAuthUid'),coach:doc(db,'clubs','A','coaches','newCoachAuthUid'),root:doc(db,'clubs','A')});
const results=[];
async function caseRun(title,fn){try{await fn();results.push({title,result:'PASS'});console.log('PASS',title)}catch(e){results.push({title,result:'FAIL',code:e.code||e.name});console.error('FAIL',title,e.code||e.message)}}
async function seed({mirror=null}={}){
 await env.clearFirestore();
 await env.withSecurityRulesDisabled(async bypass=>{
  const db=bypass.firestore(),b=writeBatch(db);
  b.set(doc(db,'users','adminA'),{clubId:'A',role:'admin',status:'active'});
  b.set(doc(db,'users','adminB'),{clubId:'B',role:'admin',status:'active'});
  b.set(doc(db,'clubs','A'),{clubName:'DEMO ONLY',coachAclEpoch:7});
  b.set(doc(db,'clubs','A','settings','main_config'),{branchCount:2});
  b.set(doc(db,'clubs','B'),{coachAclEpoch:4});
  b.set(doc(db,'clubs','B','settings','main_config'),{branchCount:2});
  if(mirror)b.set(doc(db,'users','newCoachAuthUid'),mirror);
  await b.commit();
 });
}
const commit=(db)=>{const r=refs(db),b=writeBatch(db);b.set(r.coach,{...role(),uid:'newCoachAuthUid'},{merge:true});b.set(r.user,role(),{merge:true});b.set(r.root,{coachAclEpoch:increment(1)},{merge:true});return b.commit();};
await caseRun('RED diagnosis: Admin pre-create get missing User is denied; do not broaden Rules',async()=>{await seed();await assertFails(getDoc(refs(admin).user));});
await caseRun('GREEN candidate: skip pre-write missing get, atomic 3-doc create allowed',async()=>{
 await seed();await assertSucceeds(commit(admin));const r=refs(admin);
 const [coach,user,root]=await Promise.all([assertSucceeds(getDoc(r.coach)),assertSucceeds(getDoc(r.user)),assertSucceeds(getDoc(r.root))]);
 assert(coach.exists()&&user.exists());assert.equal(coach.data().assignmentVersion,user.data().assignmentVersion);
 assert.equal(coach.data().assignmentPreviousVersion,'absent');assert.equal(user.data().assignmentPreviousVersion,'absent');assert.equal(root.data().coachAclEpoch,8);
});
await caseRun('DENY existing User document cannot be silently overwritten by creating mode',async()=>{
 await seed({mirror:{role:'coach',clubId:'B',assignmentVersion:'other-tenant-existing-00001'}});
 await assertFails(commit(admin));
 await env.withSecurityRulesDisabled(async bypass=>{
  const db=bypass.firestore();const got=await getDoc(refs(db).user);const epoch=await getDoc(refs(db).root);
  assert.equal(got.data().clubId,'B');assert.equal(epoch.data().coachAclEpoch,7);
 });
});
await caseRun('DENY cross-club Admin 3-doc creation',async()=>{await seed();await assertFails(commit(outsider));});
await caseRun('DENY replay creation after successful three-doc batch',async()=>{await seed();await assertSucceeds(commit(admin));await assertFails(commit(admin));const root=await getDoc(refs(admin).root);assert.equal(root.data().coachAclEpoch,8);});
const report={projectId,rulesSha256:hash,total:results.length,pass:results.filter(v=>v.result==='PASS').length,fail:results.filter(v=>v.result==='FAIL').length,results,scope:'EXACT A9R3 RULES + DEMO ONLY'};
fs.mkdirSync('qa_emulator_results_a9r4',{recursive:true});fs.writeFileSync('qa_emulator_results_a9r4/coach-onboarding.json',JSON.stringify(report,null,2));
console.log('A9R4_EMULATOR_QA_RESULT '+JSON.stringify({pass:report.pass,fail:report.fail,total:report.total,rulesSha256:hash}));
await env.cleanup();if(report.fail)process.exitCode=1;
