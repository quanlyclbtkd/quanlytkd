/**
 * A9R5R2 OFFLINE contract reproducer. Executes the unchanged production owner
 * with a strict Firebase-shaped SDK mock to isolate JavaScript realm/argument
 * compatibility. These tests do NOT replace Auth+Firestore Emulator acceptance.
 */
import assert from 'node:assert/strict';
import crypto, {webcrypto} from 'node:crypto';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync('js/core/coachBranchRuntimeRepair.js','utf8');
const isolated=fs.readFileSync('tools/a9r5/coach-auth-firestore-isolated.test.mjs','utf8');
assert(!isolated.includes('vm.runInNewContext('), 'Integrated QA must not use a foreign JavaScript realm');
assert(isolated.includes('loadOwnerInSdkRealm('));
const factory=new Function('window','document','console','setTimeout','crypto','Blob','URL',source);
const red=(msg)=>Object.assign(new Error(msg),{code:'invalid-argument'});
const output=[];
const failureVm=vm.runInNewContext('({role:"coach", allowedBranches:["CS1","CS2"]})');
assert.notEqual(Object.getPrototypeOf(failureVm), Object.prototype,'RED: foreign object prototype must differ');
function strictInput(o){if(Object.getPrototypeOf(o)!==Object.prototype)throw red('Foreign-realm DocumentData rejected by strict SDK fixture');return o;}
assert.throws(()=>strictInput(failureVm),e=>e.code==='invalid-argument');
output.push({test:'RED: foreign VM object is incompatible with strict Firestore DocumentData',result:'PASS'});
const capture=[];
const db={tag:'demo-only'};
const data=new Map();
const docs={root:'clubs/A',config:'clubs/A/settings/main_config'};
data.set(docs.root,{coachAclEpoch:7});
data.set(docs.config,{branchCount:2});
const snapshot=(path)=>({exists:()=>data.has(path),data:()=>structuredClone(data.get(path)),metadata:{fromCache:false,hasPendingWrites:false}});
const sdk={
 doc:(_db,...segments)=>({path:segments.join('/')}),
 getDoc:async ref=>snapshot(ref.path),
 increment:n=>({__incrementDelta:n}),
 writeBatch:()=>{const pending=[];return {set(ref,input,options){strictInput(input);pending.push([ref,input,options]);return this;},async commit(){apply(pending);}}},
 runTransaction:async(_db,callback)=>{const pending=[];const tx={get:async ref=>snapshot(ref.path),set(ref,input,options){strictInput(input);pending.push([ref,input,options]);return this;}};await callback(tx);apply(pending);},
 collection:(_db,...parts)=>({path:parts.join('/')}),
 query:(col,_limit)=>col,
 limit:n=>n,
 getDocs:async col=>{const docs=[...data].filter(([path])=>path.startsWith(col.path+'/')).map(([path,obj])=>({id:path.split('/').at(-1),data:()=>structuredClone(obj)}));return {empty:docs.length===0,docs,forEach:callback=>docs.forEach(callback)}},
 createUserWithEmailAndPassword:async(_auth,email)=>{const uid='uid-'+email.split('@')[0].replace(/[^A-Za-z0-9_-]/g,'_');if(fakeAuth.has(email))throw Object.assign(new Error('duplicate'),{code:'auth/email-already-in-use'});fakeAuth.set(email,uid);return {user:{uid,email}};},
 signInWithEmailAndPassword:async(_auth,email)=>({user:{uid:fakeAuth.get(email),email}}),
 signOut:async()=>{},
};
function apply(pending){for(const [ref,obj,options] of pending){const existing=data.get(ref.path)||{};const merged=options?.merge?{...existing,...obj}:obj;for(const [key,value] of Object.entries(merged)){if(value&&typeof value==='object'&&Object.hasOwn(value,'__incrementDelta'))merged[key]=Number(existing[key]||0)+value.__incrementDelta;}data.set(ref.path,structuredClone(merged));}}
const fakeAuth=new Map();
let caseNo=0;
function setup({email='demo.coach@example.invalid',uidPrompt='',selection=['CS1','CS2'],name='DEMO HLV',mode='host'}={}){
 const dialogs=[],toasts=[];
 const repairButton={dataset:{coachRepair:''},onclick:null};
 const list={textContent:'',innerHTML:'',querySelectorAll:selector=>selector==='[data-coach-repair]'?[repairButton]:[]};
 const dom={coachAccountsList:list,coach_email:{value:email},coach_pass:{value:'demo-pass-2026'},coach_name:{value:name},btnCreateCoach:{disabled:false},btnRecoverCoach:{disabled:false},coach_create_branches:{querySelectorAll:()=>selection.map(value=>({value}))},coach_create_branches_primary:{value:'CS1'}};
 const win={__appLoaded:true,crypto:webcrypto,_fb_init:sdk,_secondaryAuth:{},__store:{db,clubId:'A',userRole:'admin',currentUser:{uid:'admin-demo'},clubConfig:{branchCount:2}},__verifiedAuthContextState:{uid:'admin-demo',clubId:'A',role:'admin',ready:true,generation:1},userRole:'admin',showToast:msg=>toasts.push(String(msg)),alert:msg=>dialogs.push(String(msg)),confirm:()=>true,prompt:()=>uidPrompt};
 const document={getElementById:id=>dom[id]??null};
 if(mode==='host')factory(win,document,console,setTimeout,webcrypto,globalThis.Blob,globalThis.URL);
 else vm.runInNewContext(source,{window:win,document,console,setTimeout,crypto:webcrypto,Blob:globalThis.Blob,URL:globalThis.URL});
 return {win,dom,dialogs,toasts,repairButton,document};
}
function result(label){caseNo++;output.push({test:label,result:'PASS'});console.log('PASS',label)}
// Old harness reproduces A9R5R1 invalid-argument WITHOUT a live Emulator.
{
 const o=setup({email:'foreign@example.invalid',mode:'vm'});
 await o.win.createCoachAccount();
 assert(o.dialogs.some(v=>v.includes('invalid-argument')),`Expected VM reproduction error, got: ${o.dialogs}`);
 assert(!data.has('clubs/A/coaches/uid-foreign'),'VM failure must not create a Coach');
 result('RED: original vm.runInNewContext owner creates invalid-argument after Auth');
}
// New harness calls exact unchanged owner via host-realm constructor.
{
 const o=setup({email:'green@example.invalid'}),epoch=data.get(docs.root).coachAclEpoch;
 await o.win.createCoachAccount();
 assert(o.dialogs.some(v=>v.includes('Đã tạo và xác minh')),`GREEN create failed: ${o.dialogs.join(' | ')}`);
 const uid=fakeAuth.get('green@example.invalid'),coach=data.get('clubs/A/coaches/'+uid),user=data.get('users/'+uid);
 assert(coach&&user);assert.equal(coach.assignmentVersion,user.assignmentVersion);assert.deepEqual(coach.allowedBranches,['CS1','CS2']);assert.equal(data.get(docs.root).coachAclEpoch,epoch+1);
 result('GREEN: exact source owner creates Auth and 3 documents with valid realm values');
}
{
 const email='revoke@example.invalid',uid='uid-revoke',ver='old-assignment-version-2026';fakeAuth.set(email,uid);
 const common={role:'coach',clubId:'A',status:'active',branch:'CS1',coachBranch:'CS1',primaryCoachBranch:'CS1',defaultBranch:'CS1',allowedBranches:['CS1','CS2'],assignmentVersion:ver,email};
 data.set('clubs/A/coaches/'+uid,{...common,uid});data.set('users/'+uid,{...common});
 const o=setup({email}),id='coach_assigned_branch_'+uid,epoch=data.get(docs.root).coachAclEpoch;
 o.dom[id]={dataset:{assignmentVersion:ver},querySelectorAll:()=>[{value:'CS1'}]};o.dom[id+'_primary']={value:'CS1'};
 await o.win.updateCoachBranch(uid);
 assert(o.toasts.some(m=>m.includes('Đã lưu và xác minh')),`Normal update failed: ${o.dialogs.join(' | ')}`);
 assert.deepEqual(data.get('clubs/A/coaches/'+uid).allowedBranches,['CS1']);assert.deepEqual(data.get('users/'+uid).allowedBranches,['CS1']);assert.equal(data.get(docs.root).coachAclEpoch,epoch+1);
 result('GREEN: Admin revoke CS2 through unchanged savePair normal owner');
}
{
 const email='repair@example.invalid',uid='uid-repair',ver='old-repair-version-2026',stale='STALE-MIRROR-2026';fakeAuth.set(email,uid);
 const common={role:'coach',clubId:'A',status:'active',branch:'CS1',coachBranch:'CS1',primaryCoachBranch:'CS1',defaultBranch:'CS1',allowedBranches:['CS1','CS2'],assignmentVersion:ver,email};
 data.set('clubs/A/coaches/'+uid,{...common,uid});data.set('users/'+uid,{...common,assignmentVersion:stale});
 const o=setup({email,uidPrompt:'KHOI PHUC'}),id='coach_assigned_branch_'+uid,epoch=data.get(docs.root).coachAclEpoch;
 o.dom[id]={dataset:{assignmentVersion:ver},querySelectorAll:()=>[{value:'CS1'},{value:'CS2'}]};o.dom[id+'_primary']={value:'CS1'};o.repairButton.dataset.coachRepair=uid;
 await o.win.loadCoachAccounts();assert.equal(typeof o.repairButton.onclick,'function');await o.repairButton.onclick();
 assert(o.toasts.some(m=>m.includes('Đã xác minh khôi phục')),`CAS repair failed: ${o.dialogs.join(' | ')}`);
 const c=data.get('clubs/A/coaches/'+uid),u=data.get('users/'+uid);
 assert.equal(c.assignmentVersion,u.assignmentVersion);assert.equal(u.assignmentPreviousVersion,stale);assert.equal(c.assignmentPreviousVersion,ver);assert.equal(data.get(docs.root).coachAclEpoch,epoch+1);
 result('GREEN: mirror CAS repair keeps independent previous versions');
}
{
 const email='orphan@example.invalid',uid='uid-orphan';fakeAuth.set(email,uid);
 const o=setup({email,uidPrompt:uid}),epoch=data.get(docs.root).coachAclEpoch;
 await o.win.recoverCreatedCoachAccount();
 assert(o.dialogs.some(v=>v.includes('Đã khôi phục và đọc lại')),`Orphan recover failed: ${o.dialogs.join(' | ')}`);
 assert.equal(data.get('users/'+uid).clubId,'A');assert.equal(data.get('clubs/A/coaches/'+uid).clubId,'A');assert.equal(data.get(docs.root).coachAclEpoch,epoch+1);
 result('GREEN: orphan Auth recover completes using existing 3-doc savePair');
}
{
 assert.equal(crypto.createHash('sha256').update(fs.readFileSync('firestore.rules')).digest('hex'),fs.readFileSync('tools/a9r4/a9r3-original-rules.sha256','utf8').trim());
 assert(fs.readFileSync('js/core/attendanceContract.js','utf8').includes('HISTORY_COACH_ACCESS = false'));
 result('GUARD: Rules SHA-256 unchanged and Coach attendance remains locked');
}
fs.mkdirSync('qa_local_a9r5r2',{recursive:true});
fs.writeFileSync('qa_local_a9r5r2/owner-realm-contract.json',JSON.stringify({scope:'OFFLINE SDK-shaped mock, not Firebase Emulator',pass:output.length,fail:0,results:output},null,2));
console.log('A9R5R2_OFFLINE_RESULT',output.length,'PASS');
