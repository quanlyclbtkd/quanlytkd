// Offline source integration for A9R3: the existing savePair owner, no Firestore emulator claimed.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';

const source=fs.readFileSync('js/core/coachBranchRuntimeRepair.js','utf8');
const rules=fs.readFileSync('firestore.rules','utf8');
assert(rules.includes('function coachMirrorVersionedWrite()'));
assert(rules.includes("previous == resource.data.get('assignmentVersion','legacy')"));
assert.equal((rules.match(/&& coachMirrorVersionedWrite\(\) && coachUserPairAfter\(/g)||[]).length,2);
assert(!source.includes('savePair2('));
assert(!source.includes('repairWriter('));

const acl={role:'coach',clubId:'A',branch:'CS1',coachBranch:'CS1',primaryCoachBranch:'CS1',defaultBranch:'CS1',allowedBranches:['CS1','CS2'],status:'active',assignmentVersion:'canonical-old-0000001'};
const deep=x=>JSON.parse(JSON.stringify(x));
function testContext({mirrorVersion='canonical-old-0000001',missingMirror=false,repair=false,creating=false}={}){
 const records=new Map([
  ['clubs/A',{coachAclEpoch:5}],
  ['clubs/A/settings/main_config',{branchCount:2}],
  ['clubs/A/coaches/U',deep(acl)]
 ]);
 if(!missingMirror)records.set('users/U',{...deep(acl),assignmentVersion:mirrorVersion});
 let batches=0,transactions=0,writes=0;
 const snap=v=>({exists:()=>v!==undefined,data:()=>v&&deep(v),metadata:{fromCache:false,hasPendingWrites:false}});
 function apply(ops){
  for(const [ref,fields] of ops){const old=records.get(ref)||{};const val={...old,...fields};if(val.coachAclEpoch&&typeof val.coachAclEpoch==='object'&&val.coachAclEpoch.increment)val.coachAclEpoch=old.coachAclEpoch+val.coachAclEpoch.increment;records.set(ref,val);}
  writes++;
 }
 const sdk={
  doc:(_, ...parts)=>parts.join('/'),
  getDoc:async ref=>snap(records.get(ref)),
  increment:n=>({increment:n}),
  writeBatch:()=>{batches++;const ops=[];return{set:(ref,fields)=>ops.push([ref,fields]),commit:async()=>apply(ops)};},
  runTransaction:async(_db,fn)=>{transactions++;const ops=[];await fn({get:async ref=>snap(records.get(ref)),set:(ref,fields)=>ops.push([ref,fields])});apply(ops);}
 };
 const w={__appLoaded:true,crypto:webcrypto,_fb_init:sdk,confirm:()=>true,prompt:()=> 'KHOI PHUC',showToast:()=>{},alert:()=>{},console};
 const ctx=vm.createContext({window:w,document:{},console});
 vm.runInContext(source.replace('})(window);','window.__testSavePair=savePair;})(window);'),ctx);
 const owner={club:'A',firestore:{},ensure(){}};
 const data=creating?{status:'active',email:'u@qa.invalid'}:deep(acl);
 const assignment={primary:'CS1',branches:['CS1','CS2']};
 return {run:()=>w.__testSavePair('U',assignment,data,owner,{repair,creating}),records,metrics:()=>({batches,transactions,writes})};
}
let pass=0;
async function check(name,opts,fn){const t=testContext(opts);try{await t.run();fn(t);console.log('PASS',name);pass++;}catch(e){console.error('FAIL',name,e);process.exitCode=1;}}
await check('normal pair has own mirror oldVersion',{},({records,metrics})=>{
 assert.equal(metrics().batches,1);assert.equal(metrics().transactions,0);assert.equal(metrics().writes,1);
 const c=records.get('clubs/A/coaches/U'),u=records.get('users/U');
 assert.equal(c.assignmentPreviousVersion,'canonical-old-0000001');
 assert.equal(u.assignmentPreviousVersion,'canonical-old-0000001');
 assert.equal(c.assignmentVersion,u.assignmentVersion);assert.equal(records.get('clubs/A').coachAclEpoch,6);
});
await check('Admin-reviewed repair preserves divergent old versions',{mirrorVersion:'mirror-legacy-000002',repair:true},({records,metrics})=>{
 assert.equal(metrics().batches,0);assert.equal(metrics().transactions,1);assert.equal(metrics().writes,1);
 const c=records.get('clubs/A/coaches/U'),u=records.get('users/U');
 assert.equal(c.assignmentPreviousVersion,'canonical-old-0000001');
 assert.equal(u.assignmentPreviousVersion,'mirror-legacy-000002');
 assert.equal(c.assignmentVersion,u.assignmentVersion);assert.equal(records.get('clubs/A').coachAclEpoch,6);
});
await check('new user mirror uses absent version', {creating:true,missingMirror:true},({records,metrics})=>{
 assert.equal(metrics().batches,1);
 const u=records.get('users/U');assert.equal(u.assignmentPreviousVersion,'absent');
 assert.equal(records.get('clubs/A').coachAclEpoch,6);
});
// Non-regression source assertion: no financial operations or new Firestore listeners in savePair.
const start=source.indexOf('async function savePair('),end=source.indexOf('async function loadCoachAccounts(',start);
const savePair=source.slice(start,end);
assert(!/\b(onSnapshot|addDoc|deleteDoc|transactions\/|inventory\/|profiles\/)\b/.test(savePair));
console.log(`A9R3 PAIR PAYLOAD SOURCE ${pass}/3`);
