import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
const app=fs.readFileSync('app.js','utf8');
const start=app.indexOf('    const _normalizeAuthRole = '),end=app.indexOf('    const _saveAuthCache =',start);
assert(start>0&&end>start,'Find actual auth context normalizer');
const loginStart=app.indexOf('                let _freshContext = _normalizeAuthContext({');
const loginEnd=app.indexOf('\n                if (_freshContext.role === \'coach\' && !_freshContext.coachBranch)',loginStart);
assert(loginStart>0&&loginEnd>loginStart,'Find real login context builder');
const login=app.slice(loginStart,loginEnd)+'\nreturn _freshContext;';
const coaches=fs.readFileSync('js/core/coachBranchRuntimeRepair.js','utf8');
const branch=fs.readFileSync('js/core/branchIdentity.js','utf8');
const base={role:'coach',clubId:'A',branch:'CS1',coachBranch:'CS1',primaryCoachBranch:'CS1',defaultBranch:'CS1',allowedBranches:['CS1','CS2'],assignmentVersion:'version-11111111111111111111',status:'active'};
function make({mirror={},canonical={},meta={fromCache:false,hasPendingWrites:false},exists=true}={}){
 const record={...base,...canonical},userProfile={...base,...mirror},window={__appLoaded:true,console,BranchIdentity:undefined,_fb_init:{doc:(_,...segments)=>segments.join('/'),getDoc:async()=>({exists:()=>exists,data:()=>record,metadata:meta})}};
 const context=vm.createContext({window,console,document:{getElementById:()=>null},setTimeout(){throw Error('Unexpected schedule')},_canonicalBranch:(v)=>v});
 vm.runInContext(branch,context);vm.runInContext(coaches,context);
 vm.runInContext(app.slice(start,end)+'\nthis._normalizeAuthContext=_normalizeAuthContext;',context);
 const user={uid:'C'};context.user=user;context._ud=userProfile;
 context._resolveCoachBranchContext=async(u,ctx)=>window.CoachBranchRuntimeRepair.resolveAuthContext({user:u,context:context._normalizeAuthContext({...ctx,uid:u.uid}),db:{}});
 if (['disabled','locked','suspended'].includes(String(userProfile.status || 'active').trim().toLowerCase())) return Promise.reject(Object.assign(new Error('Locked user profile rejected before context construction'),{code:'auth/user-locked'}));
 return vm.runInContext('(async()=>{'+login+'})()',context);
}
let cases=0;async function test(label,fn){try{await fn();console.log('PASS '+label);cases++}catch(e){console.error('FAIL '+label, String(e?.code||e?.message||e));process.exitCode=1;}}
await test('REAL app.js login context passes matched branch/version into canonical verifier',async()=>{const ctx=await make();assert.equal(ctx.assignmentVersion,base.assignmentVersion);assert.deepEqual(Array.from(ctx.allowedBranches),['CS1','CS2']);assert.equal(ctx.primaryCoachBranch,'CS1');});
for(const [label,options,code]of [
 ['version mismatch',{mirror:{assignmentVersion:'different-version-22222222'}},'auth/coach-assignment-mismatch'],
 ['branches mismatch',{mirror:{allowedBranches:['CS1']}},'auth/coach-assignment-mismatch'],
 ['primary mismatch',{mirror:{branch:'CS2',coachBranch:'CS2',defaultBranch:'CS2',primaryCoachBranch:'CS2'}},'auth/coach-assignment-mismatch'],
 ['locked mirror',{mirror:{status:'locked'}},'auth/user-locked'],
 ['cross-club canonical',{canonical:{clubId:'B'}},'auth/coach-assignment-invalid'],
 ['cache-only canonical',{meta:{fromCache:true,hasPendingWrites:false}},'auth/coach-assignment-unverified'],
 ['pending-write canonical',{meta:{fromCache:false,hasPendingWrites:true}},'auth/coach-assignment-unverified'],
 ['canonical missing',{exists:false},'auth/coach-assignment-missing'],
 ['revoked canonical',{canonical:{allowedBranches:[]}},'auth/coach-assignment-revoked'],
 ]) await test('NEGATIVE '+label, async()=>assert.rejects(make(options),e=>e.code===code));
console.log('A9 REAL LOGIN SOURCE '+cases+'/10');
