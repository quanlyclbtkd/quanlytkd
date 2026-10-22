import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
import {prepare,activate,validate,runtimeHash,digest,canonical,restrictiveRollback} from '../v11r2/cutover.mjs';
import {demoDecision} from '../v11r2/decision-fixture.mjs';
import {ACCEPTED_SOURCE} from '../v11r2/source-identity.mjs';
import {buildImportGraph,assertCacheGraph,cacheToken,buildTag} from '../v11r2/import-graph.mjs';
import {attendanceCacheChain} from '../v11r2/cache-contract.mjs';
import {protectedSyntax} from '../a5/owner-boundary.test.mjs';
const root=process.cwd(),out='handoff/A1A2/evidence/green',results=[];
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'a12-cutover-'));
const candidate=path.join(tmp,'candidate'),altered=path.join(tmp,'altered');
fs.mkdirSync(out,{recursive:true});
const test=(name,fn)=>{fn();results.push({name,status:'PASS'});console.log('PASS '+name)};
const copyRuntime=target=>{
 fs.mkdirSync(target,{recursive:true});
 for(const file of ['app.js','index.html','style.css','.nojekyll','js','css','firestore.rules','firestore.indexes.json',ACCEPTED_SOURCE.manifest]) {
  fs.mkdirSync(path.dirname(path.join(target,file)),{recursive:true});fs.cpSync(path.join(root,file),path.join(target,file),{recursive:true});
 }
};
const rejectSource=(name,file,transform,code)=>test(name,()=>{
 const original=fs.readFileSync(path.join(altered,file));
 try {fs.writeFileSync(path.join(altered,file),transform(original.toString()));assert.throws(()=>prepare(altered,{projectId:'demo-a12',clubIds:['A']}),e=>e.code===code)}
 finally {fs.writeFileSync(path.join(altered,file),original)}
});
try {
 const before=runtimeHash(root),f=demoDecision(root,{projectId:'demo-a12-r6'}),b=f.bundle;
 test('exact R6 manifest and build identity accepted; proposal is not approval',()=>{
  assert.equal(b.plan.sourceIdentity.id,ACCEPTED_SOURCE.id);assert.equal(b.plan.sourceRuntimeSHA256,before);
  assert.equal(b.plan.kind,'OFFLINE_CUTOVER_PROPOSAL_NOT_APPROVAL');assert.equal(b.plan.sourceIdentity.buildTag,ACCEPTED_SOURCE.buildTag);
 });
 test('complete graph verifies the pinned maintenance imports before active rewrite',()=>{
  assert.equal(b.cacheGraph.before.edges.filter(e=>e.url.includes('qr-v11r2-cutover-20261021')).length,0);
  assertCacheGraph(b.cacheGraph.before,b.plan.cacheScope,ACCEPTED_SOURCE.buildTag);
  assert(b.cacheGraph.before.edges.some(e=>e.kind==='dynamic'));assert(b.cacheGraph.before.files.length>100);
 });
 test('every affected edge has one active token; Journal contract included',()=>{
  assertCacheGraph(b.cacheGraph.after,b.plan.cacheScope,b.plan.activeBuildTag);
  assert.equal(b.cacheGraph.after.edges.filter(e=>e.url.includes('qr-v11r2-cutover-20261021')).length,0);
  assert.equal(cacheToken(b.cacheGraph.after.edges.find(e=>e.from==='js/data/attendanceJournal.js').url),b.plan.activeBuildTag);
 });
 test('unaffected edge URLs and files are unchanged',()=>{
  const scope=new Set(b.plan.cacheScope);
  const beforeEdges=b.cacheGraph.before.edges.filter(e=>!scope.has(e.to)).map(({from,to,url,kind})=>({from,to,url,kind}));
  const afterEdges=b.cacheGraph.after.edges.filter(e=>!scope.has(e.to)).map(({from,to,url,kind})=>({from,to,url,kind}));
  assert.deepEqual(afterEdges,beforeEdges);
  assert(Object.keys(b.runtimeOverrides).every(file=>scope.has(file)));
  // Finance imports StudentService: A6 refreshes that existing dependency edge only.
  for(const file of ['js/modules/finance.js','js/services/finance.service.js'])if(Object.hasOwn(b.runtimeOverrides,file))assert.equal(protectedSyntax(b.runtimeOverrides[file]),protectedSyntax(fs.readFileSync(file,'utf8')),'Financial logic changed during cache rewrite');
 });
 test('all override bytes and graph are hashed into the signed plan',()=>{
  assert.equal(digest(b.cacheGraph),b.plan.cacheGraphSHA256);
  for(const [file,text]of Object.entries(b.runtimeOverrides))assert.equal(digest(text),b.plan.runtimeOverrideHashes[file]);
  assert.equal(runtimeHash(root,b.runtimeOverrides),b.plan.activeRuntimeSHA256);
 });
 test('pending approval cannot create an output directory',()=>{
  const output=path.join(tmp,'pending'),e=structuredClone(f.evidence);e.approval.decision='pending';
  assert.throws(()=>activate(b,e,output,root),x=>x.code==='OWNER_DECISION_PENDING');assert(!fs.existsSync(output));
 });
 test('source and public destinations are rejected before write',()=>{
  for(const target of [root,path.join(root,'public'),path.dirname(root)])assert.throws(()=>activate(b,f.evidence,target,root),e=>e.code==='ISOLATED_NEW_OUTPUT_REQUIRED');
  const link=path.join(tmp,'source-link');fs.symlinkSync(root,link,'dir');assert.throws(()=>activate(b,f.evidence,link,root),e=>e.code==='ISOLATED_NEW_OUTPUT_REQUIRED');
 });
 test('signed DEMO activation creates a full isolated R6 candidate',()=>{
  assert(!fs.existsSync(candidate));const proof=activate(b,f.evidence,candidate,root);
  assert.equal(proof.status,'DEMO_VERIFIED_NOT_RELEASE');assert.equal(runtimeHash(candidate),b.plan.activeRuntimeSHA256);
  assert.equal(buildTag(fs.readFileSync(path.join(candidate,'js/main.js'),'utf8')).tag,b.plan.activeBuildTag);
  assert(attendanceCacheChain(candidate));
 });
 test('candidate graph postcheck catches intentionally stale dynamic import',()=>{
  const file='js/services/attendance.service.js',text=b.runtimeOverrides[file];
  const broken=text.replace(/(import\("[^"\n]+attendanceContract\.js\?v=)[^"\n]+("\))/, '$1qr-v11r2-cutover-20261021$2');
  assert.notEqual(broken,text);const graph=buildImportGraph(root,{...b.runtimeOverrides,[file]:broken});
  assert.throws(()=>assertCacheGraph(graph,b.plan.cacheScope,b.plan.activeBuildTag),e=>e.code==='STALE_AUTHORITY_IMPORT');
 });
 test('changing override or graph invalidates signed candidate',()=>{
  for(const mutate of [x=>x.runtimeOverrides['js/main.js']+='\n//tamper',x=>x.cacheGraph.after.edges[0].url+='x']){
   const x=structuredClone(b);mutate(x);assert.throws(()=>validate(x,f.evidence),e=>e.code==='CANDIDATE_TAMPERED');
  }
 });
 test('public mirror of generated candidate is byte-identical',()=>{
  fs.mkdirSync(path.join(candidate,'tools'),{recursive:true});
  for(const file of ['build-public.mjs','check-root-public-parity.mjs'])if(fs.existsSync('tools/'+file))fs.copyFileSync('tools/'+file,path.join(candidate,'tools',file));
  const script=JSON.parse(fs.readFileSync('package.json')).scripts['build:public'];
  const r=spawnSync('node',[script.replace(/^node\s+/, '')],{cwd:candidate,encoding:'utf8'});
  assert.equal(r.status,0,r.stdout+r.stderr);
  for(const file of b.cacheGraph.after.files)assert.deepEqual(fs.readFileSync(path.join(candidate,file)),fs.readFileSync(path.join(candidate,'public',file)),file);
 });
 test('restrictive rollback has a fresh cache identity and preserves raw storage authority',()=>{
  const rollback=restrictiveRollback(b),contract=rollback.runtimeOverrides['js/core/attendanceContract.js'];
  assert(contract.includes('HISTORY_COACH_ACCESS = false'));assert(contract.includes(b.plan.authority));assert(contract.includes('tst-attendance-journal-v3'));
  assertCacheGraph(buildImportGraph(root,rollback.runtimeOverrides),b.plan.cacheScope,b.plan.activeBuildTag+'-hold');
  assert.equal(rollback.noDataWrites,true);assert.equal(rollback.noJournalDeletion,true);
 });
 copyRuntime(altered);
 rejectSource('unknown build tag fails closed even on a demo project','js/main.js',s=>s.replace(ACCEPTED_SOURCE.buildTag,'qr-v99-unreviewed'),'SOURCE_RUNTIME_NOT_ACCEPTED');
 rejectSource('runtime mutation fails closed','js/modules/finance.js',s=>s+'\n//tampered','SOURCE_RUNTIME_NOT_ACCEPTED');
 rejectSource('self-edited manifest cannot authorize a source',ACCEPTED_SOURCE.manifest,s=>s+'\n','SOURCE_MANIFEST_NOT_ACCEPTED');
 rejectSource('unreviewed Rules fail closed','firestore.rules',s=>s+'\n','SOURCE_RULES_NOT_ACCEPTED');
 rejectSource('unreviewed indexes fail closed','firestore.indexes.json',s=>s+'\n','SOURCE_INDEXES_NOT_ACCEPTED');
 test('true staging is not approved by the demo baseline',()=>assert.throws(()=>prepare(root,{projectId:'test-staging',clubIds:['A']}),e=>e.code==='STAGING_FIREBASE_CONFIG_MISMATCH'));
 test('maintenance bytes, pending decision and release HOLD are preserved',()=>{
  assert.equal(runtimeHash(root),before);assert(fs.readFileSync('js/core/attendanceContract.js','utf8').includes('HISTORY_COACH_ACCESS = false'));
  assert.equal(JSON.parse(fs.readFileSync('handoff/V11/TRANSACTION_READS_DECISION.json')).decision,'pending');
  const r=spawnSync('node',['tools/v11r2/release-gate.mjs'],{encoding:'utf8'});assert.equal(r.status,1);assert.match(r.stdout+r.stderr,/RELEASE_HOLD/);
 });
 fs.writeFileSync(out+'/cutover-plan.json',JSON.stringify({plan:b.plan,evidenceScope:'DEMO_ONLY_NOT_APPROVAL',proof:validate(b,f.evidence)},null,2));
 fs.writeFileSync(out+'/import-graph.json',JSON.stringify(b.cacheGraph,null,2));
} catch(error) {results.push({name:'failure',status:'FAIL',error:error.stack});throw error}
finally {
 fs.writeFileSync(out+'/cutover.json',JSON.stringify({status:results.every(x=>x.status==='PASS')?'PASS':'FAIL',evidenceScope:'DEMO_ONLY',results},null,2));
 fs.rmSync(tmp,{recursive:true,force:true});
}
console.log('A2 CUTOVER PASS '+results.length);
