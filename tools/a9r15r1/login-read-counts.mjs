// Executes the exact app.js users/{uid} read and real login context builder,
// plus the existing canonical Coach verifier, on an instrumented SDK port.
import fs from 'node:fs';import vm from 'node:vm';import path from 'node:path';import assert from 'node:assert/strict';
const root=process.cwd(),baseline=path.resolve(process.env.A9R15R1_BASELINE_ROOT||'../a9r15r1_baseline');
async function measure(directory,primary,branches){
 const app=fs.readFileSync(path.join(directory,'app.js'),'utf8'),read=f=>fs.readFileSync(path.join(directory,f),'utf8');
 const a=app.indexOf('    const _normalizeAuthRole = '),b=app.indexOf('    const _saveAuthCache =',a);
 const c=app.indexOf('    let _verifiedUserProfileFlight = '),d=app.indexOf('    const _isDisabledUserAuthorization',c);
 const e=app.indexOf('                let _freshContext = _normalizeAuthContext({'),f=app.indexOf("\n                if (_freshContext.role === 'coach' && !_freshContext.coachBranch)",e);assert(a>0&&b>a&&c>0&&d>c&&e>0&&f>e);
 const assignment={role:'coach',clubId:'QA_CLUB',status:'active',branch:primary,coachBranch:primary,primaryCoachBranch:primary,defaultBranch:primary,allowedBranches:branches,assignmentVersion:'fixture-assignment-00001'};
 const calls=[],counts={getDoc:0,getDocs:0,onSnapshot:0};
 const sdk={doc:(_db,...segments)=>segments.join('/'),getDoc:async ref=>{counts.getDoc++;calls.push(ref);assert(['users/C','clubs/QA_CLUB/coaches/C'].includes(ref));return {exists:()=>true,data:()=>({...assignment}),metadata:{fromCache:false,hasPendingWrites:false}};},getDocs:()=>{counts.getDocs++;throw Error('Unexpected auth list');},onSnapshot:()=>{counts.onSnapshot++;throw Error('Unexpected auth listener');}};
 const window={_fb_init:sdk,__appLoaded:true,console},context=vm.createContext({window,console,document:{getElementById:()=>null},db:{},getDoc:sdk.getDoc,doc:sdk.doc,setTimeout(){throw Error('Unexpected timer');},_canonicalBranch:value=>value});
 vm.runInContext(read('js/core/branchIdentity.js'),context);vm.runInContext(read('js/core/coachBranchRuntimeRepair.js'),context);
 vm.runInContext(app.slice(a,b)+'\nthis.normalize=_normalizeAuthContext;',context);
 vm.runInContext(app.slice(c,d)+'\nthis.readAuth=_readUserAuthorizationProfileOnce;',context);
 context.user={uid:'C'};
 const [first,coalesced]=await Promise.all([context.readAuth(context.user),context.readAuth(context.user)]);assert.equal(first,coalesced);
 context._ud=first.data();context._resolveCoachBranchContext=async(user,ctx)=>window.CoachBranchRuntimeRepair.resolveAuthContext({user,context:context.normalize({...ctx,uid:user.uid}),db:{}});
 const result=await vm.runInContext('(async()=>{'+app.slice(e,f)+'\nreturn _freshContext;})()',context);
 assert.equal(result.primaryCoachBranch,primary);assert.deepEqual(Array.from(result.allowedBranches),branches);
 assert.deepEqual(counts,{getDoc:2,getDocs:0,onSnapshot:0});
 return {counts,calls,concurrentUsersReadCoalesced:true,primary,allowedBranches:branches};
}
const rows=[];
for(const [primary,branches] of [['CS1',['CS1']],['CS2',['CS2']],['CS1',['CS1','CS2']]]){
 const before=await measure(baseline,primary,branches),after=await measure(root,primary,branches);assert.deepEqual(after,before);rows.push({before,after,delta:{getDoc:0,getDocs:0,onSnapshot:0}});console.log('PASS auth verification slice',branches.join(','));
}
fs.mkdirSync('evidence/A9R15R1',{recursive:true});fs.writeFileSync('evidence/A9R15R1/LOGIN_READ_COUNTS.json',JSON.stringify({classification:'PASS',scope:'Actual app.js auth verification slice with SDK port; not full Firebase Auth login/bootstrap/roster or billed telemetry',liveFullLogin:'LIVE_NOT_VERIFIED',rows},null,2));
