/**
 * Firestore Rules QA for QR V11R6 A9R3. DEMO ONLY.
 * Uses synthetic DEMO-only fixtures. No production data, deployment or test-expected weakening.
 * Execute using firebase emulators:exec --only firestore --project demo-a9r3-coach-security.
 */
import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import path from 'node:path';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, writeBatch, increment, runTransaction } from 'firebase/firestore';

const EXPECTED_RULES_SHA='23aae5fcb7f0376e4dd14ac324942233dc1bf2690304f4b7521e86c878cc7dad';
const projectId='demo-a9r3-coach-security';
const address=process.env.FIRESTORE_EMULATOR_HOST||'';
assert(/^127\.0\.0\.1:\d+$/.test(address),`FIRESTORE_EMULATOR_HOST must point to loopback; got ${address||'UNSET'}`);
assert((process.env.GCLOUD_PROJECT||process.env.GOOGLE_CLOUD_PROJECT||projectId).startsWith('demo-'),'Project must be demo-only');
const [host,portText]=address.split(':');
const rules=fs.readFileSync('firestore.rules','utf8');
const sha=crypto.createHash('sha256').update(rules).digest('hex');
assert.equal(sha,EXPECTED_RULES_SHA,'Exact A9R3 Firestore Rules SHA mismatch: abort, never silently use other Rules');
const env=await initializeTestEnvironment({projectId,firestore:{host,port:Number(portText),rules}});
const results=[];let current='';
const vOld='canon-version-initial-0001', vMirror='mirror-version-legacy-0001', vNew='canon-version-next-0002';
const club='A';
const primary=(branches)=>branches[0]||'';
const acl=(branches=['CS1'], {role='coach',clubId=club,status='active',version=vOld}={})=>({
  role,clubId,status,branch:primary(branches),coachBranch:primary(branches),
  primaryCoachBranch:primary(branches),defaultBranch:primary(branches),
  allowedBranches:branches,assignmentVersion:version,
});
const docRefs=db=>({
  coach:doc(db,'clubs','A','coaches','coachA'),
  mirror:doc(db,'users','coachA'),
  root:doc(db,'clubs','A'),
  config:doc(db,'clubs','A','settings','main_config'),
});
const context=who=>env.authenticatedContext(who).firestore();
const adminA=context('adminA'),adminB=context('adminB'),coachA=context('coachA');
const data=(branch=['CS1'],opts={})=>({
  ...acl(branch,opts),assignmentVersion:vNew,assignmentPreviousVersion:opts.previous||vOld,
  email:'qa@example.invalid',updatedAt:'2026-10-23T00:00:00.000Z',uid:'coachA',
});
async function seed({canonical=acl(),mirror=canonical,epoch=7,branchCount=2,adminRole='admin'}={}) {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async bypass=>{
    const db=bypass.firestore(), b=writeBatch(db), refs=docRefs(db);
    b.set(refs.root,{coachAclEpoch:epoch,clubName:'QA ONLY'});
    b.set(refs.config,{branchCount});
    b.set(refs.coach,{...canonical,uid:'coachA'});
    if(mirror!==null)b.set(refs.mirror,mirror);
    b.set(doc(db,'users','adminA'),{role:adminRole,clubId:'A',status:'active'});
    b.set(doc(db,'users','adminB'),{role:'admin',clubId:'B',status:'active'});
    b.set(doc(db,'clubs','B'),{coachAclEpoch:4,clubName:'QA B'});
    b.set(doc(db,'clubs','B','settings','main_config'),{branchCount:2});
    b.set(doc(db,'clubs','A','profiles','p1'),{branch:'CS1',status:'active'});
    await b.commit();
  });
}
function pairWrite(db,{coachFields=data(['CS1','CS2']),mirrorFields,epochDelta=1,changeCoach=true,changeMirror=true,changeRoot=true}={}) {
  const r=docRefs(db),b=writeBatch(db),m=mirrorFields||coachFields;
  if(changeCoach)b.set(r.coach,coachFields,{merge:true});
  if(changeMirror)b.set(r.mirror,m,{merge:true});
  if(changeRoot)b.set(r.root,{coachAclEpoch:increment(epochDelta)},{merge:true});
  return b.commit();
}
async function state(){
  let s;
  await env.withSecurityRulesDisabled(async bypass=>{
    const db=bypass.firestore(),r=docRefs(db);
    const [c,m,root]=await Promise.all([getDoc(r.coach),getDoc(r.mirror),getDoc(r.root)]);
    s={canonical:c.data(),mirror:m.data(),epoch:root.data().coachAclEpoch};
  });
  return s;
}
async function expectState({epoch=8,branches=['CS1','CS2'],version=vNew,mirrorPrevious=vOld}={}){
  const s=await state();
  assert.equal(s.epoch,epoch,'epoch');
  assert.deepEqual(s.canonical.allowedBranches,branches,'canonical branches');
  assert.deepEqual(s.mirror.allowedBranches,branches,'mirror branches');
  assert.equal(s.canonical.assignmentVersion,version);
  assert.equal(s.mirror.assignmentVersion,version);
  assert.equal(s.canonical.assignmentPreviousVersion,vOld);
  assert.equal(s.mirror.assignmentPreviousVersion,mirrorPrevious);
}
async function test(name,fixture,fn){
  current=name;
  try{await seed(fixture);await fn();console.log('PASS '+name);results.push({name,result:'PASS'});}
  catch(e){console.error('FAIL '+name+' '+String(e?.code||e?.message||e).slice(0,250));results.push({name,result:'FAIL',code:String(e?.code||e?.message||'UNKNOWN').slice(0,130)});}
}
// ALLOW: the exact 3-document normal assignment pattern used by savePair().
await test('ALLOW normal Admin same-club CS1+CS2 3-doc batch',{},async()=>{
  await assertSucceeds(pairWrite(adminA));await expectState();
  // Exact replay must be rejected without incrementing epoch again.
  await assertFails(pairWrite(adminA));await expectState();
});
await test('ALLOW normal revocation of CS2 with valid previous version',{},async()=>{
  await assertSucceeds(pairWrite(adminA,{coachFields:data(['CS1'])}));
  await expectState({branches:['CS1']});
});
await test('ALLOW Admin migrates legacy HLV mirror role to coach',{
  mirror:acl(['CS1'],{role:'hlv'})
},async()=>{await assertSucceeds(pairWrite(adminA));await expectState();});
await test('ALLOW normal legacy trainer mirror role migration',{
  mirror:acl(['CS1'],{role:'trainer'})
},async()=>{await assertSucceeds(pairWrite(adminA));await expectState();});
await test('ALLOW repair transaction with mismatched mirror assignmentVersion',{
  mirror:acl(['CS1'],{version:vMirror})
},async()=>{
  const r=docRefs(adminA);
  const oldMirror=vMirror,expectedEpoch=7;
  const f=data(['CS1','CS2']);
  await assertSucceeds(runTransaction(adminA,async txn=>{
    const [c,m,root,config]=await Promise.all([txn.get(r.coach),txn.get(r.mirror),txn.get(r.root),txn.get(r.config)]);
    assert.equal(c.data().assignmentVersion,vOld);assert.equal(m.data().assignmentVersion,oldMirror);
    assert.equal(root.data().coachAclEpoch,expectedEpoch);assert.equal(config.data().branchCount,2);
    txn.set(r.coach,f,{merge:true});
    txn.set(r.mirror,{...f,assignmentPreviousVersion:vMirror},{merge:true});
    txn.set(r.root,{coachAclEpoch:increment(1)},{merge:true});
  },{maxAttempts:3}));
  await expectState({mirrorPrevious:vMirror});
});
// DENY: single-authority, ACL, version and epoch controls.
await test('DENY session role revoked from Admin to viewer',{adminRole:'viewer'},async()=>{
  await assertFails(pairWrite(adminA));assert.equal((await state()).epoch,7);
});
await test('DENY configuration branchCount numeric string',{branchCount:'2'},async()=>{
  await assertFails(pairWrite(adminA));assert.equal((await state()).epoch,7);
});
await test('DENY Admin cross-club assignment write',{},async()=>{
  await assertFails(pairWrite(adminB));assert.equal((await state()).epoch,7);
});
await test('DENY Coach writes own ACL',{},async()=>{
  await assertFails(pairWrite(coachA));assert.equal((await state()).epoch,7);
});
await test('DENY fake after-state coach role admin',{},async()=>{
  await assertFails(pairWrite(adminA,{mirrorFields:data(['CS1','CS2'],{role:'admin'})}));
  assert.equal((await state()).epoch,7);
});
await test('DENY branch beyond branchCount',{},async()=>{
  await assertFails(pairWrite(adminA,{coachFields:data(['CS1','CS3'])}));
  assert.equal((await state()).epoch,7);
});
await test('DENY stale canonical previousVersion',{},async()=>{
  await assertFails(pairWrite(adminA,{coachFields:data(['CS1','CS2'],{previous:'stale-version-000000'})}));
  assert.equal((await state()).epoch,7);
});
await test('DENY forged assignmentPreviousVersion',{},async()=>{
  await assertFails(pairWrite(adminA,{coachFields:data(['CS1','CS2'],{previous:'forged-version-000001'})}));
  assert.equal((await state()).epoch,7);
});
await test('DENY canonical/mirror different allowedBranches',{},async()=>{
  await assertFails(pairWrite(adminA,{mirrorFields:data(['CS1'])}));
  assert.equal((await state()).epoch,7);
});
await test('DENY canonical/mirror different assignmentVersion',{},async()=>{
  await assertFails(pairWrite(adminA,{mirrorFields:{...data(['CS1','CS2']),assignmentVersion:'mirror-next-version-0002'}}));
  assert.equal((await state()).epoch,7);
});
await test('DENY canonical/mirror conflicting status after-state',{},async()=>{
  await assertFails(pairWrite(adminA,{mirrorFields:data(['CS1','CS2'],{status:'locked'})}));
  assert.equal((await state()).epoch,7);
});
await test('DENY missing user mirror in batch',{},async()=>{
  await assertFails(pairWrite(adminA,{changeMirror:false}));assert.equal((await state()).epoch,7);
});
await test('DENY missing canonical in batch',{},async()=>{
  await assertFails(pairWrite(adminA,{changeCoach:false}));assert.equal((await state()).epoch,7);
});
await test('DENY missing epoch increment in batch',{},async()=>{
  await assertFails(pairWrite(adminA,{changeRoot:false}));assert.equal((await state()).epoch,7);
});
await test('DENY epoch increment by 2',{},async()=>{
  await assertFails(pairWrite(adminA,{epochDelta:2}));assert.equal((await state()).epoch,7);
});
await test('DENY stale previous version on revoked ACL restore',{
  canonical:acl([],{version:'revoked-version-000001'}),mirror:acl([],{version:'revoked-version-000001'})
},async()=>{
  await assertFails(pairWrite(adminA,{coachFields:data(['CS1','CS2'],{previous:vOld})}));
  assert.equal((await state()).epoch,7);
});
await test('DENY revoked Coach read of branch roster',{
  canonical:acl([],{version:'revoked-version-000001'}),mirror:acl([],{version:'revoked-version-000001'})
},async()=>{await assertFails(getDoc(doc(coachA,'clubs','A','profiles','p1')));});
// Version-sensitive CAS protection belongs to the transaction client. A Rules-only
// batch cannot reject stale mirror's previous version unless the Rules contract
// includes a mirror CAS field. Verify current A9 repair intent with real SDK txns.
async function repairWithExpected({expectedCanonical=vOld,expectedMirror=vMirror,expectedEpoch=7,expectedBranchCount=2}={}){
  const r=docRefs(adminA),newAcl=data(['CS1','CS2']);
  return runTransaction(adminA,async txn=>{
    const [c,m,root,setting]=await Promise.all([txn.get(r.coach),txn.get(r.mirror),txn.get(r.root),txn.get(r.config)]);
    if(!c.exists()||!m.exists()||!root.exists()||!setting.exists()||
       c.data().assignmentVersion!==expectedCanonical||m.data().assignmentVersion!==expectedMirror||
       root.data().coachAclEpoch!==expectedEpoch||setting.data().branchCount!==expectedBranchCount)
      throw new Error('auth/coach-repair-cas-conflict');
    txn.set(r.coach,{...newAcl,assignmentPreviousVersion:c.data().assignmentVersion||'legacy'},{merge:true});
    txn.set(r.mirror,{...newAcl,assignmentPreviousVersion:m.data().assignmentVersion||'legacy'},{merge:true});
    txn.set(r.root,{coachAclEpoch:increment(1)},{merge:true});
  },{maxAttempts:3});
}
async function expectCASAbort(fn){
  // The fixture sets the epoch (normally 7, but intentionally 8 in the
  // epoch-race test). Compare server state before and after the rejected
  // transaction instead of hard-coding 7 and falsely failing a correct abort.
  const before=await state();
  await assert.rejects(fn, e=>String(e?.message||e).includes('auth/coach-repair-cas-conflict'));
  const after=await state();
  assert.equal(after.epoch,before.epoch,'CAS abort must not change club epoch');
  assert.deepEqual(after.canonical,before.canonical,'CAS abort must not mutate canonical Coach');
  assert.deepEqual(after.mirror,before.mirror,'CAS abort must not mutate User mirror');
}
await test('CAS ABORT mirror changed between preflight and transaction',{
  mirror:acl(['CS1'],{version:'mirror-version-changed-0002'})
},async()=>expectCASAbort(()=>repairWithExpected()));
await test('CAS ABORT canonical changed between preflight and transaction',{
  canonical:acl(['CS1'],{version:'canonical-changed-0000002'}),mirror:acl(['CS1'],{version:vMirror})
},async()=>expectCASAbort(()=>repairWithExpected()));
await test('CAS ABORT epoch changed between preflight and transaction',{
  mirror:acl(['CS1'],{version:vMirror}),epoch:8
},async()=>expectCASAbort(()=>repairWithExpected()));
await test('CAS ABORT settings changed between preflight and transaction',{
  mirror:acl(['CS1'],{version:vMirror}),branchCount:1
},async()=>expectCASAbort(()=>repairWithExpected()));

// Live optimistic concurrency test: mutate a read document before the commit.
await test('CAS ABORT concurrent mirror mutation DURING transaction',{
  mirror:acl(['CS1'],{version:vMirror})
},async()=>{
  const r=docRefs(adminA),payload=data(['CS1','CS2']);
  await assert.rejects(runTransaction(adminA,async txn=>{
    await Promise.all([txn.get(r.coach),txn.get(r.mirror),txn.get(r.root),txn.get(r.config)]);
    await env.withSecurityRulesDisabled(async b=>{
      await updateDoc(doc(b.firestore(),'users','coachA'),{updatedAt:'2026-10-23T00:01:00.000Z'});
    });
    txn.set(r.coach,payload,{merge:true});
    txn.set(r.mirror,{...payload,assignmentPreviousVersion:vMirror},{merge:true});
    txn.set(r.root,{coachAclEpoch:increment(1)},{merge:true});
  },{maxAttempts:1}));
  assert.equal((await state()).epoch,7);
});

// A9R3 GREEN contract: a direct batch using the *wrong prior mirror version*
// must fail in Rules, without mutating either ACL doc or club epoch.
await test('DENY Rules-only direct batch with stale mirror expectedVersion',{
  mirror:acl(['CS1'],{version:vMirror})
},async()=>{
  const before=await state();
  await assertFails(pairWrite(adminA));
  const after=await state();
  assert.deepEqual(after,before,'DENY must preserve all three documents');
});
await test('DENY forged previous mirror version with otherwise valid canonical',{},async()=>{
  const before=await state();
  await assertFails(pairWrite(adminA,{mirrorFields:{...data(['CS1','CS2']),assignmentPreviousVersion:'forged-mirror-version'}}));
  assert.deepEqual(await state(),before);
});
await test('DENY omitted previous mirror version',{},async()=>{
  const before=await state(),m=data(['CS1','CS2']);
  delete m.assignmentPreviousVersion;
  await assertFails(pairWrite(adminA,{mirrorFields:m}));
  assert.deepEqual(await state(),before);
});
await test('ALLOW create absent mirror with previousVersion absent', {mirror:null},async()=>{
  await assertSucceeds(pairWrite(adminA,{mirrorFields:{...data(['CS1','CS2']),assignmentPreviousVersion:'absent'}}));
  await expectState({mirrorPrevious:'absent'});
});
await test('DENY create absent mirror with false prior version',{mirror:null},async()=>{
  const before=await state();
  await assertFails(pairWrite(adminA));
  assert.deepEqual(await state(),before);
});
await test('ALLOW normal legacy user mirror without assignmentVersion',{
  mirror:(()=>{const m=acl(['CS1'],{role:'trainer'});delete m.assignmentVersion;return m;})()
},async()=>{
  await assertSucceeds(pairWrite(adminA,{mirrorFields:{...data(['CS1','CS2']),assignmentPreviousVersion:'legacy'}}));
  await expectState({mirrorPrevious:'legacy'});
});
await test('DENY replay of mirror prior version after one successful assignment',{},async()=>{
  await assertSucceeds(pairWrite(adminA));
  const before=await state();
  await assertFails(pairWrite(adminA,{coachFields:{...data(['CS1','CS2']),assignmentPreviousVersion:vNew},mirrorFields:data(['CS1','CS2'])}));
  assert.deepEqual(await state(),before);
});

const summary={projectId,rulesSha256:sha,source:'A9R3 candidate rules, synthetic data only',
  total:results.length,pass:results.filter(r=>r.result==='PASS').length,
  fail:results.filter(r=>r.result==='FAIL').length,
  results,notes:['No production access','A9R3 Rules checks expected mirror version; this cannot prove a browser used a Firestore transaction']};
const output=process.env.QA_RESULT_PATH;
if(output){fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(summary,null,2)+'\n');}
console.log('A9R3_EMULATOR_QA_RESULT '+JSON.stringify({pass:summary.pass,fail:summary.fail,total:summary.total,rulesSha256:sha}));
await env.cleanup();
if(summary.fail)process.exitCode=1;
