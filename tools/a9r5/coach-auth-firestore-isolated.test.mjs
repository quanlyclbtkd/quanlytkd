/**
 * A9R5R1 INDEPENDENT integration acceptance: Auth + Firestore Emulators only.
 * Original nine business assertions, independent fixtures and explicit errors.
 * DO NOT point at production; never weaken source Rules or alter pass criteria.
 */
import fs from 'node:fs';
import crypto,{webcrypto} from 'node:crypto';
import assert from 'node:assert/strict';
import {initializeApp,deleteApp} from 'firebase/app';
import {getAuth,connectAuthEmulator,createUserWithEmailAndPassword,signInWithEmailAndPassword,signOut} from 'firebase/auth';
import {getFirestore,connectFirestoreEmulator,doc,getDoc,setDoc,writeBatch,increment,runTransaction,collection,getDocs,query,limit} from 'firebase/firestore';
import {initializeTestEnvironment} from '@firebase/rules-unit-testing';

const PROJECT='demo-a9r5-coach-auth';
const authHost=process.env.FIREBASE_AUTH_EMULATOR_HOST||'';
const fsHostPort=process.env.FIRESTORE_EMULATOR_HOST||'';
assert(/^127\.0\.0\.1:\d+$/.test(authHost)&&/^127\.0\.0\.1:\d+$/.test(fsHostPort), 'STOP: Both emulators must use 127.0.0.1');
assert((process.env.GCLOUD_PROJECT||process.env.GOOGLE_CLOUD_PROJECT)===PROJECT,'STOP: wrong demo project');
const rules=fs.readFileSync('firestore.rules','utf8');
const rulesSha256=crypto.createHash('sha256').update(rules).digest('hex');
assert.equal(rulesSha256,fs.readFileSync('tools/a9r4/a9r3-original-rules.sha256','utf8').trim(),'STOP: Rules source was modified');
const source=fs.readFileSync('js/core/coachBranchRuntimeRepair.js','utf8');
// A9R5R2: Execute the actual browser owner in the SAME JS realm as Firebase SDK.
// vm.runInNewContext produces object literals with a foreign Object.prototype;
// Firestore rejects cross-realm values during batch.set()/transaction.set().
// Only the TEST harness changes. Production owner, SDK, and Rules are unchanged.
const loadOwnerInSdkRealm=new Function('window','document','console','setTimeout','crypto','Blob','URL',source+'\n//# sourceURL=coach-branch-owner-a9r5r2.test.js');
const runtimeSha256=crypto.createHash('sha256').update(source).digest('hex');
const [firestoreHost,port]=fsHostPort.split(':');
const env=await initializeTestEnvironment({projectId:PROJECT,firestore:{host:firestoreHost,port:Number(port),rules}});
const app=initializeApp({projectId:PROJECT,apiKey:'demo-api-key-never-production',authDomain:`${PROJECT}.firebaseapp.com`,appId:'demo:a9r5r1:admin'});
const second=initializeApp({projectId:PROJECT,apiKey:'demo-api-key-never-production',authDomain:`${PROJECT}.firebaseapp.com`,appId:'demo:a9r5r1:secondary'},'A9R5R1Secondary');
const auth=getAuth(app),secondaryAuth=getAuth(second);
connectAuthEmulator(auth,`http://${authHost}`,{disableWarnings:true});
connectAuthEmulator(secondaryAuth,`http://${authHost}`,{disableWarnings:true});
const db=getFirestore(app);connectFirestoreEmulator(db,firestoreHost,Number(port));
const passWord='Emulator-Only-Password-2026!';
const emailAdmin='admin.a9r5r1@example.invalid';
const adminUid=(await createUserWithEmailAndPassword(auth,emailAdmin,passWord)).user.uid;
await env.withSecurityRulesDisabled(async ctx=>{
  const seed=ctx.firestore(),batch=writeBatch(seed);
  batch.set(doc(seed,'users',adminUid),{clubId:'A',role:'admin',status:'active'});
  batch.set(doc(seed,'clubs','A'),{clubName:'DEMO TEST ONLY',coachAclEpoch:7});
  batch.set(doc(seed,'clubs','A','settings','main_config'),{branchCount:2});
  batch.set(doc(seed,'clubs','B'),{clubName:'OTHER DEMO',coachAclEpoch:3});
  await batch.commit();
});
const report={projectId:PROJECT,rulesSha256,runtimeSha256,scope:'Auth and Firestore local EMULATORS; independent tests for original nine requirements',results:[]};
const redact=str=>String(str??'').replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,'[EMAIL]').replace(/(?:AIza[0-9A-Za-z_-]{20,})/g,'[API_KEY]').replace(/(users\/|coaches\/)[A-Za-z0-9_-]{6,128}/g,'$1[UID]').slice(0,320);
const latest=async(...segments)=>getDoc(doc(db,...segments));
async function adminSession(){
  if(auth.currentUser?.uid!==adminUid)await signInWithEmailAndPassword(auth,emailAdmin,passWord);
  if(secondaryAuth.currentUser)await signOut(secondaryAuth);
  assert.equal(auth.currentUser?.uid,adminUid,'fixture Admin session missing');
}
async function privilegedWrite(entries){
  await env.withSecurityRulesDisabled(async ctx=>{const db0=ctx.firestore(),b=writeBatch(db0);for(const [parts,value] of entries)b.set(doc(db0,...parts),value);await b.commit()});
}
const now=()=>new Date().toISOString();
const fields=(email,version,branches=['CS1','CS2'])=>({role:'coach',clubId:'A',status:'active',branch:branches[0]||'',coachBranch:branches[0]||'',primaryCoachBranch:branches[0]||'',defaultBranch:branches[0]||'',allowedBranches:branches,assignmentVersion:version,assignmentPreviousVersion:'absent',email,updatedAt:now()});
async function authCoach(email){const user=(await createUserWithEmailAndPassword(secondaryAuth,email,passWord)).user;await signOut(secondaryAuth);return user.uid}
async function fixtureCoach(tag){
  const email=`${tag}.a9r5r1@example.invalid`,uid=await authCoach(email);
  const version=`baseline-${tag}-version-000001`;
  await privilegedWrite([[['users',uid],fields(email,version)],[['clubs','A','coaches',uid],{...fields(email,version),uid}]]);
  return {uid,email,version};
}
function mountOwner({email='coach.a9r5r1@example.invalid',name='DEMO COACH',branches=['CS1','CS2'],uidPrompt='',confirm=true}={}){
  const dialogs=[],toasts=[];let promptValue=uidPrompt;
  const repairButton={dataset:{coachRepair:""},onclick:null};
  const list={textContent:"",innerHTML:"",querySelectorAll:selector=>selector==="[data-coach-repair]" ? [repairButton] : []};
  const dom={
    coachAccountsList:list,
    coach_email:{value:email},coach_pass:{value:passWord},coach_name:{value:name},
    btnCreateCoach:{disabled:false},btnRecoverCoach:{disabled:false},
    coach_create_branches:{querySelectorAll:()=>branches.map(value=>({value}))},
    coach_create_branches_primary:{value:'CS1'},
  };
  const sdk={doc,getDoc,writeBatch,increment,runTransaction,collection,getDocs,query,limit,createUserWithEmailAndPassword,signInWithEmailAndPassword,signOut};
  const win={__appLoaded:true,crypto:webcrypto,_fb_init:sdk,_secondaryAuth:secondaryAuth,
    __store:{clubId:'A',db,userRole:'admin',currentUser:{uid:adminUid},clubConfig:{branchCount:2}},
    __verifiedAuthContextState:{uid:adminUid,clubId:'A',role:'admin',ready:true,generation:1},
    userRole:'admin',alert:msg=>dialogs.push(String(msg)),showToast:msg=>toasts.push(String(msg)),confirm:()=>confirm,prompt:()=>promptValue};
  const document={getElementById:id=>dom[id]||null};
  loadOwnerInSdkRealm(win,document,console,setTimeout,webcrypto,globalThis.Blob,globalThis.URL);
  return {win,dom,dialogs,toasts,repairButton,setPrompt:p=>promptValue=p};
}
async function caseRun(name,fn){
  const stage={value:'initial'};
  try{await adminSession();await fn(stage);report.results.push({label:name,result:'PASS'});console.log('PASS',name)}
  catch(e){
    const diagnostic={stage:stage.value,code:String(e?.code||e?.name||'UNKNOWN'),message:redact(e?.message),location:String(e?.stack||'').split('\n').slice(1,3).join(' | ').slice(0,260),adminSignedIn:auth.currentUser?.uid===adminUid,secondarySignedIn:Boolean(secondaryAuth.currentUser)};
    report.results.push({label:name,result:'FAIL',diagnostic});console.error('FAIL_DETAIL',name,JSON.stringify(diagnostic));
  } finally {try{if(secondaryAuth.currentUser)await signOut(secondaryAuth)}catch{}
    try{if(auth.currentUser?.uid!==adminUid)await signInWithEmailAndPassword(auth,emailAdmin,passWord)}catch(e){console.error('FIXTURE_ADMIN_RESTORE_FAILED',redact(e.code||e.message))}}
}
const checked=(mount,what)=>assert(mount.dialogs.some(m=>m.includes(what)),`Expected UI message not seen; observed: ${redact(mount.dialogs.join(' | '))}`);
const checkedToast=(mount,what)=>assert(mount.toasts.some(m=>m.includes(what)),`Expected success toast not seen; alerts: ${redact(mount.dialogs.join(' | '))}; toasts: ${redact(mount.toasts.join(' | '))}`);
const initialEpoch=async()=>Number((await latest('clubs','A')).data().coachAclEpoch);
await caseRun('RED: Admin reading absent User preflight is denied',async stage=>{
  const uid=await authCoach('preflight.a9r5r1@example.invalid');stage.value='get absent User';
  await assert.rejects(latest('users',uid),err=>err?.code==='permission-denied');
});
await caseRun('GREEN: canonical owner creates Auth, 3-doc ACL and server readback',async stage=>{
  const mount=mountOwner({email:'green.a9r5r1@example.invalid'});
  const epoch=await initialEpoch();stage.value='createCoachAccount';
  await mount.win.createCoachAccount();stage.value='UI completion message';
  checked(mount,'Đã tạo và xác minh hồ sơ HLV');
  stage.value='Auth credential';
  const uid=(await signInWithEmailAndPassword(secondaryAuth,'green.a9r5r1@example.invalid',passWord)).user.uid;
  stage.value='authoritative documents';
  const [canonical,mirror,root]=await Promise.all([latest('clubs','A','coaches',uid),latest('users',uid),latest('clubs','A')]);
  assert(canonical.exists()&&mirror.exists(),'3-doc creation did not materialize');
  assert.equal(canonical.data().assignmentVersion,mirror.data().assignmentVersion);
  assert.deepEqual(canonical.data().allowedBranches,['CS1','CS2']);
  assert.equal(canonical.data().primaryCoachBranch,'CS1');
  assert.equal(root.data().coachAclEpoch,epoch+1);
});
await caseRun('DENY: existing Auth email is not recreated; epoch unchanged',async stage=>{
  const email='duplicate.a9r5r1@example.invalid';await authCoach(email);
  const mount=mountOwner({email});const epoch=await initialEpoch();stage.value='attempt duplicate create';
  await mount.win.createCoachAccount();
  checked(mount,'auth/email-already-in-use');
  assert.equal(await initialEpoch(),epoch);
});
await caseRun('Coach signs in with verified CS1+CS2 and rejects stale mirror',async stage=>{
  const {uid,email}=await fixtureCoach('login');stage.value='Coach Auth signin';
  await signOut(auth);const credential=await signInWithEmailAndPassword(auth,email,passWord);
  assert.equal(credential.user.uid,uid);
  const mirror=(await latest('users',uid)).data();stage.value='resolveAuthContext';
  const mount=mountOwner({email});const found=await mount.win.CoachBranchRuntimeRepair.resolveAuthContext({user:credential.user,context:{...mirror,ready:true},db});
  assert.equal(found.role,'coach');assert.deepEqual(Array.from(found.allowedBranches),['CS1','CS2']);
  assert.equal(found.primaryCoachBranch,'CS1');stage.value='deny stale mirror';
  await assert.rejects(mount.win.CoachBranchRuntimeRepair.resolveAuthContext({user:credential.user,context:{...mirror,assignmentVersion:'STALE_VERSION'},db}),e=>e?.code==='auth/coach-assignment-mismatch');
});
await caseRun('Normal Admin update revokes CS2 without changing Auth identity',async stage=>{
  const {uid,email}=await fixtureCoach('revoke');const mount=mountOwner({email});
  const id='coach_assigned_branch_'+uid;
  mount.dom[id]={dataset:{assignmentVersion:(await latest('clubs','A','coaches',uid)).data().assignmentVersion},querySelectorAll:()=>[{value:'CS1'}]};
  mount.dom[id+'_primary']={value:'CS1'};
  const before=(await latest('clubs','A','coaches',uid)).data();const epoch=await initialEpoch();stage.value='updateCoachBranch';
  await mount.win.updateCoachBranch(uid);stage.value='UI update success';checkedToast(mount,'Đã lưu và xác minh');stage.value='readback';
  const after=(await latest('clubs','A','coaches',uid)).data();
  assert.deepEqual(after.allowedBranches,['CS1']);assert.notEqual(after.assignmentVersion,before.assignmentVersion);assert.equal(await initialEpoch(),epoch+1);
});
await caseRun('Repair reconciles divergent mirror via canonical CAS',async stage=>{
  const {uid,email}=await fixtureCoach('repair');const mount=mountOwner({email,uidPrompt:'KHOI PHUC'});
  const original=(await latest('clubs','A','coaches',uid)).data();
  await privilegedWrite([[['users',uid],{...fields(email,'DEMO_STALE_MIRROR_VERSION_2026')}]]);
  const id='coach_assigned_branch_'+uid;
  mount.dom[id]={dataset:{assignmentVersion:original.assignmentVersion},querySelectorAll:()=>[{value:'CS1'},{value:'CS2'}]};mount.dom[id+'_primary']={value:'CS1'};
  mount.repairButton.dataset.coachRepair=uid;
  stage.value='render real Coach list and bind repair click';
  await mount.win.loadCoachAccounts();
  assert.equal(typeof mount.repairButton.onclick,'function','Real repair UI button was not bound');
  const epoch=await initialEpoch();stage.value='click actual repair UI handler';
  await mount.repairButton.onclick();
  stage.value='UI repair success';checkedToast(mount,'Đã xác minh khôi phục');
  stage.value='CAS readback';const [c,u]=await Promise.all([latest('clubs','A','coaches',uid),latest('users',uid)]);
  assert.equal(c.data().assignmentVersion,u.data().assignmentVersion);
  assert.equal(u.data().assignmentPreviousVersion,'DEMO_STALE_MIRROR_VERSION_2026');
  assert.equal(c.data().assignmentPreviousVersion,original.assignmentVersion);
  assert.equal(await initialEpoch(),epoch+1);
});
let recoveryFixture=null;
await caseRun('Orphan Auth recovery uses original savePair, no duplicate Auth',async stage=>{
  const email='orphan.a9r5r1@example.invalid',uid=await authCoach(email),mount=mountOwner({email,name:'DEMO ORPHAN',uidPrompt:uid});
  recoveryFixture={uid,email};const epoch=await initialEpoch();stage.value='recoverCreatedCoachAccount';
  await mount.win.recoverCreatedCoachAccount();stage.value='authoritative readback';
  checked(mount,'Đã khôi phục và đọc lại hồ sơ');
  assert.equal((await latest('users',uid)).data().clubId,'A');
  assert.equal((await latest('clubs','A','coaches',uid)).data().role,'coach');
  assert.equal(await initialEpoch(),epoch+1);
});
await caseRun('DENY recovery replay with existing canonical; no epoch increase',async stage=>{
  // Independent fixture avoids relying on the prior recovery PASS.
  const {uid,email}=await fixtureCoach('replay');
  const mount=mountOwner({email,uidPrompt:uid}),epoch=await initialEpoch();stage.value='replay UI';
  await mount.win.recoverCreatedCoachAccount();stage.value='replay outcome';
  checked(mount,'auth/coach-recovery-review');assert.equal(await initialEpoch(),epoch);
});
await caseRun('Coach attendance maintenance locks remain unchanged',async()=>{
  assert(fs.readFileSync('js/core/attendanceContract.js','utf8').includes('HISTORY_COACH_ACCESS = false'));
  assert(/function coachAttendanceCutoverOpen\(\)\s*\{\s*return false;\s*\}/.test(rules));
});
report.pass=report.results.filter(r=>r.result==='PASS').length;
report.fail=report.results.filter(r=>r.result==='FAIL').length;report.total=report.results.length;
fs.mkdirSync('qa_emulator_results_a9r5r1',{recursive:true});
fs.writeFileSync('qa_emulator_results_a9r5r1/isolated-auth-firestore.json',JSON.stringify(report,null,2));
console.log('A9R5R1_ISOLATED_RESULT',JSON.stringify({pass:report.pass,fail:report.fail,total:report.total,rulesSha256}));
await signOut(auth);await signOut(secondaryAuth);await deleteApp(app);await deleteApp(second);await env.cleanup();
if(report.fail)process.exitCode=1;
