import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {activate,activateIntoNewClaim,refreshDemoCandidate,runtimeHash,fileDigest} from '../v11r2/cutover.mjs';
import {demoDecision} from '../v11r2/decision-fixture.mjs';
import {makeDemoActive} from '../v11r2/make-demo-active.mjs';
import {refreshDemoProof} from '../v11r2/refresh-demo-proof.mjs';
import {isolatedOutputPaths,claimNewOutput,cleanupOwnedOutput,writeNewOwnedFile} from '../v11r2/isolated-output.mjs';

const root=process.cwd(),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'a4-activation-')),f=demoDecision(root),results=[];
const test=(name,fn)=>{fn();results.push({name,status:'PASS'});console.log('PASS '+name)};
const snapshot=directory=>{
 const entries=[];
 const walk=dir=>{for(const name of fs.readdirSync(dir).sort()){
  const file=path.join(dir,name),stat=fs.lstatSync(file),rel=path.relative(directory,file);
  if(stat.isSymbolicLink())entries.push([rel,'link',fs.readlinkSync(file)]);
  else if(stat.isDirectory()){entries.push([rel,'directory']);walk(file)}
  else entries.push([rel,createHash('sha256').update(fs.readFileSync(file)).digest('hex')]);
 }};walk(directory);return entries;
};
const before={runtime:runtimeHash(root),rules:fileDigest(path.join(root,'firestore.rules')),indexes:fileDigest(path.join(root,'firestore.indexes.json'))};
try {
 test('direct activate rejects existing user data before any write',()=>{
  const output=path.join(tmp,'existing');fs.mkdirSync(output);fs.writeFileSync(path.join(output,'firestore.rules'),'DO_NOT_OVERWRITE_EXISTING_RULES');
  const saved=snapshot(output);assert.throws(()=>activate(f.bundle,f.evidence,output,root),e=>e.code==='ISOLATED_NEW_OUTPUT_REQUIRED');assert.deepEqual(snapshot(output),saved);
 });
 test('existing empty directory and file are rejected',()=>{
  for(const [name,directory]of [['empty',true],['file',false]]){const output=path.join(tmp,name);directory?fs.mkdirSync(output):fs.writeFileSync(output,'keep');assert.throws(()=>activate(f.bundle,f.evidence,output,root),e=>e.code==='ISOLATED_NEW_OUTPUT_REQUIRED')}
 });
 test('source, descendants and source-containing output are rejected',()=>{
  for(const output of [root,path.join(root,'public'),path.join(root,'new-child'),path.dirname(root)])assert.throws(()=>activate(f.bundle,f.evidence,output,root),e=>e.code==='ISOLATED_NEW_OUTPUT_REQUIRED');
 });
 test('symlink parent into source is rejected before any copy',()=>{
  const alias=path.join(tmp,'source-alias');fs.symlinkSync(root,alias,'dir');const output=path.join(alias,'new-child');assert.throws(()=>activate(f.bundle,f.evidence,output,root),e=>e.code==='ISOLATED_NEW_OUTPUT_REQUIRED');assert(!fs.existsSync(output));
 });
 test('symlink parent into existing external output preserves sentinel',()=>{
  const external=path.join(tmp,'external'),alias=path.join(tmp,'external-alias');fs.mkdirSync(external);fs.symlinkSync(external,alias,'dir');fs.mkdirSync(path.join(external,'existing'));fs.writeFileSync(path.join(external,'existing','sentinel'),'keep');
  const saved=snapshot(external);assert.throws(()=>activate(f.bundle,f.evidence,path.join(alias,'existing'),root));assert.deepEqual(snapshot(external),saved);
 });
 test('canonical parent replacement after preflight is rejected before mkdir',()=>{
  const parent=path.join(tmp,'parent');fs.mkdirSync(parent);const paths=isolatedOutputPaths(root,path.join(parent,'candidate'),{requireNew:true});fs.renameSync(parent,parent+'-original');fs.mkdirSync(parent);fs.writeFileSync(path.join(parent,'sentinel'),'keep');
  assert.throws(()=>claimNewOutput(paths),e=>e.code==='OUTPUT_OWNERSHIP_CHANGED');assert.deepEqual(fs.readdirSync(parent),['sentinel']);
 });
 test('directory appearing at exclusive claim is preserved and never cleaned',()=>{
  const output=path.join(tmp,'appeared'),original=fs.mkdirSync;let injected=false;
  try{fs.mkdirSync=function(file,...args){if(file===output&&!injected){injected=true;original(file);fs.writeFileSync(path.join(file,'sentinel'),'keep')}return original.call(this,file,...args)};assert.throws(()=>activate(f.bundle,f.evidence,output,root),e=>e.code==='EEXIST')}
  finally{fs.mkdirSync=original}assert.equal(fs.readFileSync(path.join(output,'sentinel'),'utf8'),'keep');assert.deepEqual(fs.readdirSync(output),['sentinel']);
 });
 test('output replacement after mkdir is rejected and foreign data is preserved',()=>{
  const output=path.join(tmp,'replaced'),original=fs.mkdirSync;let injected=false;
  try{fs.mkdirSync=function(file,...args){const result=original.call(this,file,...args);if(file===output&&!injected){injected=true;fs.renameSync(output,output+'-owned');fs.symlinkSync(root,output,'dir')}return result};assert.throws(()=>activate(f.bundle,f.evidence,output,root),e=>e.code==='OUTPUT_OWNERSHIP_CHANGED')}
  finally{fs.mkdirSync=original}assert(fs.lstatSync(output).isSymbolicLink());assert(!fs.existsSync(path.join(root,'CUTOVER_PROOF.json')));
 });
 test('fabricated claim cannot authorize writes to an existing folder',()=>{
  const output=path.join(tmp,'fabricated');fs.mkdirSync(output);const stat=fs.statSync(output),saved=snapshot(output);
  assert.throws(()=>activateIntoNewClaim(f.bundle,f.evidence,{source:root,output,dev:stat.dev,ino:stat.ino},root),e=>e.code==='NEW_OUTPUT_CLAIM_REQUIRED');assert.deepEqual(snapshot(output),saved);
 });
 test('claimed directory replaced by a plain folder fails before writes or cleanup',()=>{
  const output=path.join(tmp,'plain-replacement'),claim=claimNewOutput(isolatedOutputPaths(root,output,{requireNew:true}));fs.renameSync(output,output+'-owned');fs.mkdirSync(output);fs.writeFileSync(path.join(output,'sentinel'),'keep');const saved=snapshot(output);
  assert.throws(()=>activateIntoNewClaim(f.bundle,f.evidence,claim,root),e=>e.code==='OUTPUT_OWNERSHIP_CHANGED');assert.equal(cleanupOwnedOutput(claim),false);assert.deepEqual(snapshot(output),saved);
 });
 test('nonempty newly claimed directory fails before runtime writes',()=>{
  const claim=claimNewOutput(isolatedOutputPaths(root,path.join(tmp,'claimed-nonempty'),{requireNew:true}));fs.writeFileSync(path.join(claim.output,'sentinel'),'keep');const saved=snapshot(claim.output);
  assert.throws(()=>activateIntoNewClaim(f.bundle,f.evidence,claim,root),e=>e.code==='NEW_OUTPUT_NOT_EMPTY');assert.deepEqual(snapshot(claim.output),saved);assert(cleanupOwnedOutput(claim));
 });
 test('exclusive owned writes cannot follow existing symlinks or hardlinks',()=>{
  const claim=claimNewOutput(isolatedOutputPaths(root,path.join(tmp,'exclusive'),{requireNew:true})),outside=path.join(tmp,'outside-file');fs.writeFileSync(outside,'keep');fs.symlinkSync(outside,path.join(claim.output,'symlink'));fs.linkSync(outside,path.join(claim.output,'hardlink'));
  for(const file of ['symlink','hardlink'])assert.throws(()=>writeNewOwnedFile(claim,file,'overwrite'),e=>e.code==='EEXIST');assert.equal(fs.readFileSync(outside,'utf8'),'keep');assert(cleanupOwnedOutput(claim));
 });
 test('pending approval cannot create output',()=>{
  const evidence=structuredClone(f.evidence);evidence.approval.decision='pending';const output=path.join(tmp,'pending');assert.throws(()=>activate(f.bundle,evidence,output,root),e=>e.code==='OWNER_DECISION_PENDING');assert(!fs.existsSync(output));
 });
 test('new direct activation has complete runtime, Rules, indexes and bound proof',()=>{
  const output=path.join(tmp,'new-direct'),proof=activate(f.bundle,f.evidence,output,root),saved=JSON.parse(fs.readFileSync(path.join(output,'CUTOVER_PROOF.json'))),stat=fs.statSync(output);
  assert.equal(proof.status,'DEMO_VERIFIED_NOT_RELEASE');assert.equal(runtimeHash(output),f.bundle.plan.activeRuntimeSHA256);assert.equal(fileDigest(path.join(output,'firestore.rules')),f.bundle.plan.activeRulesSHA256);assert.equal(fileDigest(path.join(output,'firestore.indexes.json')),before.indexes);assert.deepEqual(saved.outputOwner,{dev:stat.dev,ino:stat.ino});
 });
 const candidate=path.join(tmp,'demo');makeDemoActive(root,candidate);
 const mutateAndReject=(name,file,mutate,code)=>test(name,()=>{
  const target=path.join(candidate,file),original=fs.readFileSync(target);
  try{fs.writeFileSync(target,mutate(original.toString()));const saved=snapshot(candidate);assert.throws(()=>refreshDemoProof(root,candidate),code?e=>e.code===code:undefined);assert.deepEqual(snapshot(candidate),saved)}finally{fs.writeFileSync(target,original)}
 });
 const mutateProof=mutate=>text=>{const record=JSON.parse(text);mutate(record);return JSON.stringify(record)};
 mutateAndReject('bad proof plan is rejected before metadata writes','CUTOVER_PROOF.json',mutateProof(x=>x.plan.activeBuildTag+='bad'),'CANDIDATE_PROOF_INVALID');
 mutateAndReject('bad proof signature is rejected','CUTOVER_PROOF.json',mutateProof(x=>x.verification.signature='bad'),'OWNER_SIGNATURE_INVALID');
 mutateAndReject('proof from another directory is rejected','CUTOVER_PROOF.json',mutateProof(x=>x.outputOwner.ino++),'CANDIDATE_PROOF_INVALID');
 mutateAndReject('missing proof schema is rejected','CUTOVER_PROOF.json',mutateProof(x=>delete x.proofSchema),'CANDIDATE_PROOF_INVALID');
 mutateAndReject('DEMO metadata must bind the verified proof','DEMO_ACTIVE_ONLY.json',text=>{const x=JSON.parse(text);x.proof.planSHA256='0'.repeat(64);return JSON.stringify(x)},'CANDIDATE_PROOF_INVALID');
 mutateAndReject('runtime edits cannot be refreshed','js/modules/finance.js',text=>text+'\n//tampered','CANDIDATE_RUNTIME_CHANGED');
 mutateAndReject('Rules edits cannot be refreshed','firestore.rules',text=>text+'\n//tampered','CANDIDATE_RUNTIME_CHANGED');
 mutateAndReject('index edits cannot be refreshed','firestore.indexes.json',text=>text+'\n','CANDIDATE_RUNTIME_CHANGED');
 test('refresh on arbitrary output never writes or creates proof',()=>{
  const output=path.join(tmp,'no-proof');fs.mkdirSync(output);fs.writeFileSync(path.join(output,'sentinel'),'keep');const saved=snapshot(output);assert.throws(()=>refreshDemoCandidate(f.bundle,f.evidence,output,root));assert.deepEqual(snapshot(output),saved);
 });
 test('refresh with a pending new decision preserves the candidate',()=>{
  const old=JSON.parse(fs.readFileSync(path.join(candidate,'CUTOVER_PROOF.json'))),next=demoDecision(root,{authority:old.plan.authority});next.evidence.approval.decision='pending';const saved=snapshot(candidate);assert.throws(()=>refreshDemoCandidate(next.bundle,next.evidence,candidate,root),e=>e.code==='OWNER_DECISION_PENDING');assert.deepEqual(snapshot(candidate),saved);
 });
 test('refresh cannot switch active authority',()=>{
  const next=demoDecision(root),saved=snapshot(candidate);assert.throws(()=>refreshDemoCandidate(next.bundle,next.evidence,candidate,root),e=>e.code==='REFRESH_IDENTITY_MISMATCH');assert.deepEqual(snapshot(candidate),saved);
 });
 test('directory replacement during proof verification fails before writes',()=>{
  const original=fs.readFileSync,other=candidate+'-tested';let injected=false;
  try{fs.readFileSync=function(file,...args){const data=original.call(this,file,...args);if(file===path.join(candidate,'CUTOVER_PROOF.json')&&!injected){injected=true;fs.renameSync(candidate,other);fs.mkdirSync(candidate);fs.writeFileSync(path.join(candidate,'sentinel'),'keep')}return data};assert.throws(()=>refreshDemoProof(root,candidate),e=>e.code==='OUTPUT_OWNERSHIP_CHANGED')}
  finally{fs.readFileSync=original}assert.deepEqual(fs.readdirSync(candidate),['sentinel']);fs.unlinkSync(path.join(candidate,'sentinel'));fs.rmdirSync(candidate);fs.renameSync(other,candidate);
 });
 test('valid refresh changes only two proof metadata files',()=>{
  const saved=snapshot(candidate),result=refreshDemoProof(root,candidate),after=snapshot(candidate),changes=after.filter(row=>JSON.stringify(row)!==JSON.stringify(saved.find(old=>old[0]===row[0]))).map(row=>row[0]).sort();
  assert.equal(result.proof.status,'DEMO_VERIFIED_NOT_RELEASE');assert.equal(result.runtimeBefore,result.runtimeAfter);assert.deepEqual(changes,['CUTOVER_PROOF.json','DEMO_ACTIVE_ONLY.json']);
  const again=refreshDemoProof(root,candidate);assert.equal(again.runtimeAfter,result.runtimeAfter);
 });
 test('interrupted second metadata replacement fails closed on retry',()=>{
  const beforeRuntime=runtimeHash(candidate),metadata=fs.readFileSync(path.join(candidate,'DEMO_ACTIVE_ONLY.json'),'utf8'),original=fs.renameSync;
  try{
   fs.renameSync=function(from,to,...args){if(to===path.join(candidate,'DEMO_ACTIVE_ONLY.json'))throw Object.assign(Error('injected interruption'),{code:'EIO'});return original.call(this,from,to,...args)};
   assert.throws(()=>refreshDemoProof(root,candidate),e=>e.code==='EIO');
  }finally{fs.renameSync=original}
  assert.equal(runtimeHash(candidate),beforeRuntime);assert.equal(fs.readFileSync(path.join(candidate,'DEMO_ACTIVE_ONLY.json'),'utf8'),metadata);
  const interrupted=snapshot(candidate);assert.throws(()=>refreshDemoProof(root,candidate),e=>e.code==='CANDIDATE_PROOF_INVALID');assert.deepEqual(snapshot(candidate),interrupted);
 });
 test('maintenance runtime, Rules, indexes and pending decision are unchanged',()=>{
  assert.deepEqual({runtime:runtimeHash(root),rules:fileDigest(path.join(root,'firestore.rules')),indexes:fileDigest(path.join(root,'firestore.indexes.json'))},before);assert.equal(JSON.parse(fs.readFileSync('handoff/V11/TRANSACTION_READS_DECISION.json')).decision,'pending');
 });
}catch(error){results.push({name:'failure',status:'FAIL',error:error.stack});throw error}
finally{
 fs.mkdirSync('handoff/A4/evidence',{recursive:true});fs.writeFileSync('handoff/A4/evidence/activation-safety.json',JSON.stringify({results,productionWrites:0,scope:'Local DEMO; deterministic filesystem interleavings, not a race-free filesystem guarantee'},null,2));fs.rmSync(tmp,{recursive:true,force:true});
}
console.log('A4 ACTIVATION SAFETY PASS '+results.length);
