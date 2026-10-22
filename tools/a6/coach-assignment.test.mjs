import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const results=[];
async function test(name,fn){try{await fn();results.push({name,status:'PASS'});console.log('PASS '+name)}catch(e){results.push({name,status:'FAIL',error:e.message});console.error('FAIL '+name+': '+e.message)}}
const base={uid:'C',role:'coach',clubId:'A',branch:'CS2',coachBranch:'CS2',allowedBranches:['CS2','CS3']};
function fixture(assignment=base,metadata={fromCache:false,hasPendingWrites:false}){
 const writes=[],reads=[],alerts=[];
 const global={__appLoaded:true,userRole:'coach',__store:{db:{},clubId:'A',userRole:'coach',currentUser:{uid:'C'},clubConfig:{branchCount:3}},console:{warn(){},error(){},info(){}},_fb_init:{doc:(_, ...p)=>p.join('/'),getDoc:async ref=>{reads.push(ref);return {exists:()=>!!assignment,data:()=>assignment,metadata}},setDoc:async(...args)=>writes.push(args)},alert:m=>alerts.push(m)};
 const ctx=vm.createContext({window:global,console:global.console,alert:global.alert,setTimeout(){throw Error('Unexpected timer')},document:{getElementById:()=>null}});
 vm.runInContext(fs.readFileSync('js/core/branchIdentity.js','utf8'),ctx);vm.runInContext(fs.readFileSync('js/core/coachBranchRuntimeRepair.js','utf8'),ctx);
 return {global,owner:global.CoachBranchRuntimeRepair,writes,reads,alerts,resolve:(mirror=base)=>global.CoachBranchRuntimeRepair.resolveAuthContext({user:{uid:'C'},context:mirror,db:global.__store.db})};
}
await test('server-verified CS2 + CS3 is retained without hardcoded CS1/CS2',async()=>{const f=fixture();const r=await f.resolve();assert.deepEqual(Array.from(r.allowedBranches),['CS2','CS3']);assert.equal(r.primaryCoachBranch,'CS2');assert.equal(f.reads.length,1)});
await test('legacy scalar assignment becomes exactly one branch',async()=>{const f=fixture({role:'coach',clubId:'A',branch:'Mặc định'});const r=await f.resolve({uid:'C',role:'coach',clubId:'A',branch:'Mặc định',coachBranch:'CS1'});assert.deepEqual(Array.from(r.allowedBranches),['CS1'])});
await test('missing assignment fails closed',async()=>{await assert.rejects(fixture(null).resolve(),e=>e.code==='auth/coach-assignment-missing')});
for(const [name,changes]of [['wrong club',{clubId:'B'}],['wrong role',{role:'admin'}],['locked assignment',{status:'locked'}],['duplicate branches',{allowedBranches:['CS2','CS2']}],['over ten branches',{allowedBranches:Array.from({length:11},(_,i)=>'CS'+(i+1))}],['empty list',{allowedBranches:[]}],['unknown branch',{allowedBranches:['CS2','all']}],['primary outside list',{branch:'CS1',coachBranch:'CS1'}]])await test(name+' is rejected',async()=>{await assert.rejects(fixture({...base,...changes}).resolve())});
for(const [name,meta]of [['cache-only',{fromCache:true,hasPendingWrites:false}],['pending-write',{fromCache:false,hasPendingWrites:true}],['missing metadata',{}]])await test(name+' cannot verify an assignment',async()=>{await assert.rejects(fixture(base,meta).resolve(),e=>e.code==='auth/coach-assignment-unverified')});
await test('mismatched users mirror is rejected without a Coach write',async()=>{const f=fixture();await assert.rejects(f.resolve({...base,allowedBranches:['CS2']}),e=>e.code==='auth/coach-assignment-mismatch');assert.equal(f.writes.length,0)});
await test('malformed explicit list never falls back to primary scalar',async()=>{await assert.rejects(fixture({...base,allowedBranches:'CS2'}).resolve())});
if(process.env.A6_OUTPUT){fs.mkdirSync(process.env.A6_OUTPUT,{recursive:true});fs.writeFileSync(process.env.A6_OUTPUT+'/assignment.json',JSON.stringify({results},null,2))}
console.log('A6 ASSIGNMENT '+results.filter(x=>x.status==='PASS').length+'/'+results.length);if(results.some(x=>x.status==='FAIL'))process.exitCode=1;
