import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';

// This test covers the actual Admin account-list render => button binding =>
// existing savePair(repair=true) owner, not merely a standalone repair routine.
const repairSource = fs.readFileSync(process.argv[2] || 'js/core/coachBranchRuntimeRepair.js', 'utf8');
const sourceBranch = fs.readFileSync('js/core/branchIdentity.js', 'utf8');
const base = {uid:'C',role:'coach',clubId:'A',branch:'CS1',coachBranch:'CS1',primaryCoachBranch:'CS1',defaultBranch:'CS1',allowedBranches:['CS1','CS2'],status:'active',assignmentVersion:'canonical-version-00000001'};
const store = new Map([
 ['clubs/A/coaches/C',{...base,displayName:'HLV Test'}],
 ['users/C',{...base,assignmentVersion:'mirror-version-0000000002'}],
 ['clubs/A',{coachAclEpoch:9}],
 ['clubs/A/settings/main_config',{branchCount:2}]
]);
const snap = value => ({exists:()=>value!==undefined,data:()=>structuredClone(value),metadata:{fromCache:false,hasPendingWrites:false}});
let rendered = '', repairButton = null, writes = 0, transactions = 0;
const list = {
 set innerHTML(value) {
  rendered = value;
  repairButton = rendered.includes('data-coach-repair="C"') ? {dataset:{coachRepair:'C'},onclick:null} : null;
 },
 get innerHTML() { return rendered; },
 querySelectorAll(selector) {return selector==='[data-coach-repair]' && repairButton ? [repairButton] : [];},
 textContent:''
};
const box = {dataset:{},querySelectorAll:()=>[]};
const primary = {value:''};
const docEl = id => id==='coachAccountsList' ? list : id==='coach_assigned_branch_C' ? box : id==='coach_assigned_branch_C_primary' ? primary : null;
const notices=[];
const window = {
 __appLoaded:true,userRole:'admin',
 __store:{db:{},clubId:'A',userRole:'admin',currentUser:{uid:'Admin'},clubConfig:{branchCount:2}},
 __verifiedAuthContextState:{ready:true,uid:'Admin',role:'admin',generation:1,clubId:'A'},
 crypto:webcrypto,confirm:()=>true,prompt:()=> 'KHOI PHUC',
 showToast:x=>notices.push(String(x)),alert:x=>notices.push(String(x)),console,
 _fb_init:{
  doc:(_, ...p)=>p.join('/'),getDoc:async ref=>snap(store.get(ref)),
  collection:(_, ...p)=>p.join('/'),query:q=>q,limit:n=>n,
  getDocs:async()=>({empty:false,forEach:cb=>cb({id:'C',data:()=>structuredClone(store.get('clubs/A/coaches/C'))})}),
  increment:n=>({__increment:n}),
  writeBatch:()=>{throw Error('Repair may not use ordinary batch')},
  runTransaction:async(_db,cb)=>{
   transactions++;
   const updates=[];
   await cb({get:async ref=>snap(store.get(ref)),set:(ref,data)=>updates.push([ref,data])});
   assert.equal(updates.length,3);
   for(const [ref,change] of updates){const old=store.get(ref);store.set(ref,{...old,...change,coachAclEpoch:change.coachAclEpoch?.__increment?old.coachAclEpoch+change.coachAclEpoch.__increment:old.coachAclEpoch});}
   writes++;
  }
 }
};
const context=vm.createContext({window,document:{getElementById:docEl},console,setTimeout(){throw Error('Unexpected retry')} });
vm.runInContext(sourceBranch,context);
vm.runInContext(repairSource,context);
await window.loadCoachAccounts();
assert(rendered.includes('data-coach-repair="C"'),'Admin list did not render an actionable repair button');
assert.equal(typeof repairButton?.onclick,'function','The repair button has no bound click handler');
assert.equal(writes,0,'Rendering a button must not write ACL');
await repairButton.onclick();
assert.equal(transactions,1,'Click did not enter the existing CAS transaction owner');
assert.equal(writes,1,'Repair must write exactly once');
assert.equal(store.get('clubs/A/coaches/C').assignmentVersion,store.get('users/C').assignmentVersion);
assert.equal(store.get('clubs/A').coachAclEpoch,10);
assert(notices.some(x=>x.includes('Đã xác minh khôi phục')),'No success only after authoritative readback');
console.log('PASS Coach Admin list renders a repair button');
console.log('PASS Button binds to existing savePair CAS owner and writes exactly once');
console.log('PASS Readback confirms canonical/mirror equality and epoch increment');
