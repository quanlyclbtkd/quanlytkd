// Synthetic client-owner test; it is NOT Firestore Emulator or live proof.
import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';import {webcrypto} from 'node:crypto';
const initial={role:'coach',clubId:'A',branch:'CS1',coachBranch:'CS1',primaryCoachBranch:'CS1',defaultBranch:'CS1',allowedBranches:['CS1'],assignmentVersion:'baseline-assignment-ver-0001',status:'active'};
function fixture({user={},epoch=0,missingRoot=false,ackLost=false,commitReject=false,readbackFailure=false,selection=['CS1','CS2'],metadata={fromCache:false,hasPendingWrites:false}}={}){
 let commits=0,requested=0,post=false;const alerts=[];
 const records=new Map([['clubs/A/coaches/C',{...initial}],['users/C',{...initial,...user}],['clubs/A',{coachAclEpoch:epoch}],['clubs/A/settings/main_config',{branchCount:2}]]);
 if(missingRoot)records.delete('clubs/A');
 const fieldset={dataset:{assignmentVersion:initial.assignmentVersion},querySelectorAll:()=>selection.map(value=>({value})),disabled:false};
 const els=new Map([['coach_assigned_branch_C',fieldset],['coach_assigned_branch_C_primary',{value:'CS1'}]]);
 const w={__appLoaded:true,userRole:'admin',__store:{db:{},clubId:'A',userRole:'admin',currentUser:{uid:'Admin'},clubConfig:{branchCount:2}},__verifiedAuthContextState:{ready:true,uid:'Admin',clubId:'A',role:'admin',generation:1},crypto:webcrypto,console:{warn(){},error(){}},confirm:()=>true,showToast:x=>alerts.push(String(x)),alert:x=>alerts.push(String(x))};
 const snap=(d)=>({exists:()=>d!==undefined,data:()=>d,metadata});
 w._fb_init={doc:(_, ...p)=>p.join('/'),getDoc:async ref=>{requested++;if(readbackFailure&&post&&(ref==='clubs/A/coaches/C'||ref==='users/C'))throw Object.assign(new Error('connection lost'),{code:'unavailable'});return snap(records.get(ref))},increment:n=>({increment:n}),writeBatch:()=>{let ops=[];return{set(ref,fields){ops.push([ref,fields])},async commit(){if(commitReject)throw Object.assign(new Error('batch rejected'),{code:'permission-denied'});commits++;for(const [ref,fields]of ops){const old=records.get(ref)||{};const next={...old,...fields};if(next.coachAclEpoch?.increment)next.coachAclEpoch=(old.coachAclEpoch||0)+next.coachAclEpoch.increment;records.set(ref,next);}post=true;if(ackLost)throw Object.assign(new Error('Ack lost'),{code:'unavailable'});}}}};
 const context=vm.createContext({window:w,document:{getElementById:id=>els.get(id)||null},console:w.console,setTimeout(){throw Error('timer not expected')}});
 for(const path of ['js/core/branchIdentity.js','js/core/coachBranchRuntimeRepair.js'])vm.runInContext(fs.readFileSync(path,'utf8'),context);
 return {run:()=>w.updateCoachBranch('C'),commits:()=>commits,reads:()=>requested,records,alerts};
}
let count=0;async function t(label,options,validator){const h=fixture(options);await h.run();validator(h);count++;console.log('PASS '+label)}
await t('Admin saves 2 branches in canonical pair and root epoch',{},h=>{assert.equal(h.commits(),1);assert.deepEqual(Array.from(h.records.get('users/C').allowedBranches),['CS1','CS2']);assert.equal(h.records.get('clubs/A').coachAclEpoch,1);assert(h.reads()>=6)});
for(const role of ['hlv','trainer'])await t('same-club legacy '+role+' can reach original atomic batch', {user:{role}},h=>{assert.equal(h.commits(),1);assert.equal(h.records.get('users/C').role,'coach')});
await t('non-Coach user cannot be claimed', {user:{role:'admin'}},h=>{assert.equal(h.commits(),0);assert(h.alerts.some(s=>s.includes('chiếm quyền')))});
await t('cross-club user cannot be claimed', {user:{clubId:'B'}},h=>{assert.equal(h.commits(),0)});
await t('stale mirror version is held', {user:{assignmentVersion:'newer-authority-version-9999'}},h=>{assert.equal(h.commits(),0);assert(h.alerts.some(s=>s.includes('Phiên bản user mirror')))});
await t('non-number root epoch fails closed', {epoch:'0'},h=>{assert.equal(h.commits(),0);assert(h.alerts.some(s=>s.includes('coachAclEpoch')))});
await t('negative root epoch fails closed', {epoch:-1},h=>{assert.equal(h.commits(),0)});
await t('missing root fails closed', {missingRoot:true},h=>{assert.equal(h.commits(),0)});
await t('lost ACK succeeds only on exact server readback', {ackLost:true},h=>{assert.equal(h.commits(),1);assert(h.alerts.some(s=>s.includes('Đã lưu')))});
await t('ACK lost + offline readback is NOT reported successful', {ackLost:true,readbackFailure:true},h=>{assert.equal(h.commits(),1);assert(h.alerts.some(s=>s.includes('COMMIT')||s.includes('Không thể xác minh')));assert(!h.alerts.some(s=>s.includes('Đã lưu')))});
await t('committed + offline readback is NOT reported successful', {readbackFailure:true},h=>{assert.equal(h.commits(),1);assert(!h.alerts.some(s=>s.includes('Đã lưu')))});
await t('genuine permission denial preserved', {commitReject:true},h=>{assert.equal(h.commits(),0);assert(h.alerts.some(s=>s.includes('Firestore từ chối batch')))});
await t('offline cache preflight cannot authorize batch', {metadata:{fromCache:true,hasPendingWrites:false}},h=>{assert.equal(h.commits(),0)});
console.log(`A8 SYNTHETIC ACL PREFLIGHT ${count}/${count}`);
