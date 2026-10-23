import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';import {webcrypto} from 'node:crypto';
const src=fs.readFileSync('js/core/coachBranchRuntimeRepair.js','utf8');
const init={role:'coach',clubId:'A',branch:'CS1',coachBranch:'CS1',primaryCoachBranch:'CS1',defaultBranch:'CS1',allowedBranches:['CS1','CS2'],status:'active',assignmentVersion:'canonical-version-0000001'};
function harness({mirrorChanges={},canonicalChanges={},confirmed=true,phrase='KHOI PHUC',race=null,transactionAvailable=true,readbackFail=false,ackLost=false}={}){
 const records=new Map([['clubs/A/coaches/C',{...init,...canonicalChanges}],['users/C',{...init,assignmentVersion:'mirror-version-0000000002',...mirrorChanges}],['clubs/A',{coachAclEpoch:9}],['clubs/A/settings/main_config',{branchCount:2}]]);
 let writes=0,transactions=0,reads=0;const alerts=[];
 const snap=(d)=>({exists:()=>d!==undefined,data:()=>JSON.parse(JSON.stringify(d)),metadata:{fromCache:false,hasPendingWrites:false}});
 const w={__appLoaded:true,userRole:'admin',__store:{db:{},clubId:'A',userRole:'admin',currentUser:{uid:'Admin'},clubConfig:{branchCount:2}},__verifiedAuthContextState:{ready:true,uid:'Admin',role:'admin',generation:1,clubId:'A'},crypto:webcrypto,confirm:()=>confirmed,prompt:()=>phrase,console,showToast:x=>alerts.push(String(x)),alert:x=>alerts.push(String(x))};
 w._fb_init={doc:(_, ...s)=>s.join('/'),getDoc:async ref=>{reads++;if(readbackFail&&writes>0&&(ref==='users/C'||ref==='clubs/A/coaches/C'))throw Error('offline');return snap(records.get(ref))},increment:n=>({increment:n}),writeBatch:()=>{throw Error('No normal batch allowed in repair')},runTransaction:transactionAvailable?async(db,fn)=>{transactions++;let ops=[];const tx={get:async ref=>snap(records.get(ref)),set:(ref,fields)=>ops.push([ref,fields])};
  if(race==='mirror')records.get('users/C').assignmentVersion='raced-version-0000000003';
  if(race==='epoch')records.get('clubs/A').coachAclEpoch=10;
  if(race==='config')records.get('clubs/A/settings/main_config').branchCount=1;
  await fn(tx);assert.equal(ops.length,3);for(const [ref,fields]of ops){const old=records.get(ref)||{},data={...old,...fields};if(data.coachAclEpoch?.increment)data.coachAclEpoch=old.coachAclEpoch+data.coachAclEpoch.increment;records.set(ref,data);}writes++;if(ackLost)throw Object.assign(new Error('lost ACK'),{code:'unavailable'});
 }:undefined};
 const el={dataset:{assignmentVersion:records.get('clubs/A/coaches/C').assignmentVersion||'legacy'},querySelectorAll:()=>[]};
 const ctx=vm.createContext({window:w,document:{getElementById:()=>el},setTimeout(){throw Error('unexpected timer')},console});
 vm.runInContext(fs.readFileSync('js/core/branchIdentity.js','utf8'),ctx);
 vm.runInContext(src.replace('})(window);','window.__a9_repair_case=repairCoachMirror;})(window);'),ctx);
 return {run:()=>w.__a9_repair_case('C'),records,alerts,transactions:()=>transactions,writes:()=>writes,reads:()=>reads};
}
let pass=0;
async function test(name,config,check){const h=harness(config);await h.run();try{check(h);console.log('PASS '+name);pass++}catch(e){console.error('FAIL '+name,e);process.exitCode=1}}
await test('server-confirmed mismatched version repairs three documents atomically in same owner',{},h=>{assert.equal(h.transactions(),1);assert.equal(h.writes(),1);const c=h.records.get('clubs/A/coaches/C'),u=h.records.get('users/C');assert.equal(c.assignmentVersion,u.assignmentVersion);assert.equal(c.assignmentPreviousVersion,init.assignmentVersion);assert.equal(h.records.get('clubs/A').coachAclEpoch,10);assert(h.alerts.some(x=>x.includes('Đã xác minh khôi phục'))) });
await test('legacy canonical without assignmentVersion repairs mirror via legacy previous version',{canonicalChanges:{assignmentVersion:undefined}},h=>{
 assert.equal(h.writes(),1);assert.equal(h.records.get('clubs/A/coaches/C').assignmentPreviousVersion,'legacy');
});
await test('incoherent old mirror aliases force manual review',{mirrorChanges:{coachBranch:'CS2'}},h=>assert.equal(h.writes(),0));
await test('read version race on mirror aborts without writes',{race:'mirror'},h=>{assert.equal(h.writes(),0);assert(h.alerts.some(x=>x.includes('đổi sau preflight')))});
await test('read epoch race aborts without writes',{race:'epoch'},h=>assert.equal(h.writes(),0));
await test('configured branch count race aborts without writes',{race:'config'},h=>assert.equal(h.writes(),0));
await test('different club mirror cannot be claimed',{mirrorChanges:{clubId:'B'}},h=>assert.equal(h.writes(),0));
await test('non-Coach mirror cannot be claimed',{mirrorChanges:{role:'admin'}},h=>assert.equal(h.writes(),0));
await test('locked mirror cannot be implicitly unlocked',{mirrorChanges:{status:'locked'}},h=>assert.equal(h.writes(),0));
await test('cancel first confirmation emits no writes',{confirmed:false},h=>assert.equal(h.writes(),0));
await test('wrong explicit phrase emits no writes',{phrase:'ok'},h=>assert.equal(h.writes(),0));
await test('missing transaction/CAS has no unsafe batch fallback',{transactionAvailable:false},h=>assert.equal(h.writes(),0));
await test('readback failure becomes unverified without retry',{readbackFail:true},h=>{assert.equal(h.writes(),1);assert(!h.alerts.some(x=>x.includes('Đã xác minh khôi phục')))});
await test('transaction ACK lost but server readback exact accepts success',{ackLost:true},h=>{assert.equal(h.writes(),1);assert(h.alerts.some(x=>x.includes('Đã xác minh khôi phục')))});
console.log('A9 REPAIR CAS '+pass+'/14');
