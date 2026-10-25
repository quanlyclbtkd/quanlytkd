/** A9R4 client-only guarded coach creation; no production writes. */
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {verifySourceIdentity} from '../v11r2/source-identity.mjs';
import {runtimeHash} from '../v11r2/cutover.mjs';
import {verifyRuntimeProfile} from '../v11r2/runtime-profile.mjs';
const source=fs.readFileSync('js/core/coachBranchRuntimeRepair.js','utf8');
const rules=fs.readFileSync('firestore.rules','utf8');
const baseRules=fs.readFileSync('tools/a9r4/a9r3-original-rules.sha256','utf8').trim();
import crypto from 'node:crypto';
const identity=verifySourceIdentity(process.cwd(),runtimeHash(process.cwd()));
if(identity.coachAssignmentContract==='server-verified-multi-branch-v1') {
 verifyRuntimeProfile(process.cwd());
 assert.equal(crypto.createHash('sha256').update(rules).digest('hex'),identity.rulesSHA256,'Exact pinned Rules for the current assignment contract');
} else assert.equal(crypto.createHash('sha256').update(rules).digest('hex'),baseRules,'Must not change A9R3 Rules');
assert(source.includes('const userSnap=creating ? {exists:()=>false} : await readVerified'));
const acl={primary:'CS1',branches:['CS1','CS2']};
function context({existingUser=null,existingCoach=null,recovery=false,wrongUid=false,permissionFailure=false}={}){
 const records=new Map([['clubs/A',{coachAclEpoch:3}],['clubs/A/settings/main_config',{branchCount:2}],['users/admin',{role:'admin',clubId:'A'}]]);
 if(existingCoach)records.set('clubs/A/coaches/newUid',existingCoach);
 if(existingUser)records.set('users/newUid',existingUser);
 const reads=[],operations=[],dialogs=[],state={authCreates:0,authSignins:0,batches:0};
 const snap=r=>({exists:()=>r!==undefined,data:()=>r,metadata:{fromCache:false,hasPendingWrites:false}});
 const fields={'coach_email':{value:'qa@example.invalid'},'coach_pass':{value:'someValidPassword'},'coach_name':{value:'A Sample Coach'},'btnCreateCoach':{disabled:false},'btnRecoverCoach':{disabled:false},'coach_create_branches':{querySelectorAll:()=>[{value:'CS1'},{value:'CS2'}]},'coach_create_branches_primary':{value:'CS1'}};
 const sdk={
  doc:(_, ...p)=>p.join('/'),
  getDoc:async path=>{reads.push(path);if(path==='users/newUid'&&!records.has(path))throw Object.assign(new Error('Missing or insufficient permissions'),{code:'permission-denied'});return snap(records.get(path));},
  increment:n=>({inc:n}),
  writeBatch:()=>{state.batches++;const ops=[];return {set:(path,data)=>ops.push([path,data]),commit:async()=>{
     state.precommitReads=reads.slice();
     if(permissionFailure||records.has('users/newUid')&&ops.some(([p,v])=>p==='users/newUid'&&v.assignmentPreviousVersion==='absent'))throw Object.assign(new Error('Rule DENY'),{code:'permission-denied'});
     for(const [path,data] of ops){const old=records.get(path)||{};records.set(path,{...old,...data,coachAclEpoch:data.coachAclEpoch?.inc ? (old.coachAclEpoch||0)+data.coachAclEpoch.inc : old.coachAclEpoch});}operations.push(ops);
  }};
  },
  createUserWithEmailAndPassword:async()=>{state.authCreates++;return {user:{uid:'newUid',email:'qa@example.invalid'}};},
  signInWithEmailAndPassword:async()=>{state.authSignins++;return {user:{uid:wrongUid?'otherUid':'newUid',email:'qa@example.invalid'}};},
  signOut:async()=>{},
 };
 const w={__appLoaded:true,crypto:webcrypto,_fb_init:sdk,_secondaryAuth:{},__store:{clubId:'A',db:{},userRole:'admin',clubConfig:{branchCount:2},currentUser:{uid:'admin'}},
  __verifiedAuthContextState:{uid:'admin',role:'admin',clubId:'A',generation:2,ready:true},userRole:'admin',showToast:()=>{},
  confirm:()=>true,prompt:()=>recovery?'newUid':'KHOI PHUC',alert:m=>dialogs.push(m),console,
 };
 const document={getElementById:id=>fields[id]||null};
 vm.runInNewContext(source,{window:w,document,console,crypto:webcrypto,setTimeout});
 return {w,reads,operations,dialogs,state,records,run:()=>recovery?w.recoverCreatedCoachAccount():w.createCoachAccount()};
}
let pass=0;
const check=async(label,config,verify)=>{const t=context(config);await t.run();verify(t);pass++;console.log('PASS',label)};
await check('new Auth creates exactly once without reading missing User',{},t=>{
 assert.equal(t.state.authCreates,1);assert.equal(t.state.batches,1);assert(!t.state.precommitReads.includes('users/newUid'));
 assert.equal(t.records.get('users/newUid').assignmentPreviousVersion,'absent');assert.equal(t.operations.length,1);
 assert.equal(t.records.get('clubs/A').coachAclEpoch,4);
});
await check('normal Auth creation failure keeps UID in memory not logs',{permissionFailure:true},t=>{
 assert.equal(t.state.authCreates,1);assert.equal(t.operations.length,0);
 assert(!t.dialogs.join('').includes('newUid'));
});
await check('orphan recovery proves Firebase Auth identity and uses same batch',{recovery:true},t=>{
 assert.equal(t.state.authSignins,1);assert.equal(t.state.authCreates,0);assert.equal(t.state.batches,1);
 assert(!t.state.precommitReads.includes('users/newUid'));
 assert.equal(t.records.get('users/newUid').role,'coach');
});
await check('recovery refuses UID different from authenticated UID',{recovery:true,wrongUid:true},t=>{
 assert.equal(t.operations.length,0);assert.equal(t.state.batches,0);
});
await check('recovery refuses existing canonical Coach',{recovery:true,existingCoach:{role:'coach',clubId:'A'}},t=>{
 assert.equal(t.operations.length,0);assert.equal(t.state.batches,0);
});
await check('existing User mirror never overwritten by create mode',{recovery:true,existingUser:{role:'coach',clubId:'B',assignmentVersion:'previous-from-other-club'}},t=>{
 assert.equal(t.operations.length,0);assert.equal(t.state.batches,1);assert.equal(t.records.get('users/newUid').clubId,'B');
});
assert(!/\b(savePair2|repairWriter|onSnapshot|addDoc)\(/.test(source));
console.log(`A9R4 COACH NEW AUTH SOURCE ${pass}/6 - MOCKS ONLY`);
