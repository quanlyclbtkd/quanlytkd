import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {isolatedOutputPaths,claimNewOutput,assertOwnedOutput,cleanupOwnedOutput} from '../v11r2/isolated-output.mjs';
import {makeDemoActive} from '../v11r2/make-demo-active.mjs';
import {runtimeHash} from '../v11r2/cutover.mjs';
import {ACCEPTED_SOURCE} from '../v11r2/source-identity.mjs';
const root=process.cwd(),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'a3-guard-')),results=[];
const candidate=process.env.A3_CANDIDATE||path.join(tmp,'candidate');
const test=(name,fn)=>{fn();results.push({name,status:'PASS'});console.log('PASS '+name)};
try {
 const before=runtimeHash(root);
 test('self, child, public and parent targets are rejected',()=>{
  for(const output of [root,path.join(root,'new-output'),path.join(root,'public'),path.dirname(root)])
   assert.throws(()=>isolatedOutputPaths(root,output,{requireNew:true}),e=>e.code==='ISOLATED_NEW_OUTPUT_REQUIRED');
 });
 test('symlink-parent into source is rejected before candidate preparation or copy',()=>{
  const alias=path.join(tmp,'source-alias');fs.symlinkSync(root,alias,'dir');
  const output=path.join(alias,'new-output');
  assert.throws(()=>makeDemoActive(root,output),e=>e.code==='ISOLATED_NEW_OUTPUT_REQUIRED');assert(!fs.existsSync(output));
 });
 test('existing directory and sentinel remain untouched',()=>{
  const target=path.join(tmp,'existing');fs.mkdirSync(target);fs.writeFileSync(path.join(target,'sentinel'),'keep');
  assert.throws(()=>makeDemoActive(root,target),e=>e.code==='ISOLATED_NEW_OUTPUT_REQUIRED');assert.equal(fs.readFileSync(path.join(target,'sentinel'),'utf8'),'keep');
 });
 test('existing and dangling symlink targets are rejected',()=>{
  for(const [name,dest]of [['link',root],['dangling',path.join(tmp,'absent')]]){
   const output=path.join(tmp,name);fs.symlinkSync(dest,output,'dir');
   assert.throws(()=>isolatedOutputPaths(root,output,{requireNew:true}),e=>e.code==='ISOLATED_NEW_OUTPUT_REQUIRED');
   assert(fs.lstatSync(output).isSymbolicLink());
  }
 });
 test('missing output parent fails without making directories',()=>{
  assert.throws(()=>isolatedOutputPaths(root,path.join(tmp,'absent-parent','candidate'),{requireNew:true}),e=>e.code==='OUTPUT_PARENT_REQUIRED');
  assert(!fs.existsSync(path.join(tmp,'absent-parent')));
 });
 test('destination appearing between preflight and claim is preserved',()=>{
  const output=path.join(tmp,'appeared'),paths=isolatedOutputPaths(root,output,{requireNew:true});
  fs.mkdirSync(output);fs.writeFileSync(path.join(output,'user-file'),'keep');
  assert.throws(()=>claimNewOutput(paths));assert.equal(fs.readFileSync(path.join(output,'user-file'),'utf8'),'keep');
 });
 test('directory replacement fails ownership and cannot be cleaned by the tool',()=>{
  const output=path.join(tmp,'replaced'),claim=claimNewOutput(isolatedOutputPaths(root,output,{requireNew:true}));
  fs.renameSync(output,output+'-owned');fs.mkdirSync(output);fs.writeFileSync(path.join(output,'user-file'),'keep');
  assert.throws(()=>assertOwnedOutput(claim),e=>e.code==='OUTPUT_OWNERSHIP_CHANGED');assert.equal(cleanupOwnedOutput(claim),false);
  assert.equal(fs.readFileSync(path.join(output,'user-file'),'utf8'),'keep');
 });
 test('replacement symlink into source is never traversed for cleanup',()=>{
  const output=path.join(tmp,'swapped'),claim=claimNewOutput(isolatedOutputPaths(root,output,{requireNew:true}));
  fs.renameSync(output,output+'-owned');fs.symlinkSync(root,output,'dir');assert.equal(cleanupOwnedOutput(claim),false);assert(fs.existsSync(path.join(root,'js/main.js')));
 });
 test('changing a parent alias cannot redirect the canonical output path',()=>{
  const safe=path.join(tmp,'safe-parent'),alias=path.join(tmp,'parent-alias');fs.mkdirSync(safe);fs.symlinkSync(safe,alias,'dir');
  const paths=isolatedOutputPaths(root,path.join(alias,'new-output'),{requireNew:true});fs.unlinkSync(alias);fs.symlinkSync(root,alias,'dir');
  const claim=claimNewOutput(paths);assert.equal(claim.output,path.join(safe,'new-output'));assertOwnedOutput(claim);assert.equal(cleanupOwnedOutput(claim),true);
  assert(!fs.existsSync(path.join(root,'new-output')));
 });
 test('post-copy dependency failure cleans only the directory just created',()=>{
  const minimal=path.join(tmp,'source-without-dependencies');fs.mkdirSync(minimal);
  for(const file of ['app.js','index.html','style.css','.nojekyll','js','css','firestore.rules','firestore.indexes.json',ACCEPTED_SOURCE.manifest]){
   fs.mkdirSync(path.dirname(path.join(minimal,file)),{recursive:true});fs.cpSync(path.join(root,file),path.join(minimal,file),{recursive:true});
  }
  const output=path.join(tmp,'failed-copy');assert.throws(()=>makeDemoActive(minimal,output),e=>e.code==='ENOENT');assert(!fs.existsSync(output));assert.equal(runtimeHash(minimal),before);
 });
 test('full DEMO preparation succeeds in a new isolated directory',()=>{
  const r=makeDemoActive(root,candidate);assert.equal(r.status,'DEMO_VERIFIED_NOT_RELEASE');assert.equal(runtimeHash(candidate),r.activeRuntimeSHA);
 });
 test('maintenance runtime remains byte-identical',()=>assert.equal(runtimeHash(root),before));
}catch(error){results.push({name:'failure',status:'FAIL',error:error.stack});throw error}
finally {
 fs.mkdirSync('handoff/A3/evidence',{recursive:true});fs.writeFileSync('handoff/A3/evidence/T03-output-guard.json',JSON.stringify({status:results.every(t=>t.status==='PASS')?'PASS':'FAIL',results,candidate,scope:'Filesystem-only; deterministic interleavings, no concurrent filesystem adversary certification'},null,2));
 fs.rmSync(tmp,{recursive:true,force:true});
}
