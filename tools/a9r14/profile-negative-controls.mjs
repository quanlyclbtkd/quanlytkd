import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {parse} from '../v11r2/vendor/acorn.mjs';
import {verifyRuntimeProfile} from '../v11r2/runtime-profile.mjs';
const root=process.cwd(),profile=verifyRuntimeProfile(root),results=[];
const manifest=JSON.parse(fs.readFileSync(profile.identity.manifest,'utf8'));
const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'a9r14-profile-'));
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const strip=node=>JSON.parse(JSON.stringify(node,(key,value)=>['start','end','loc','range'].includes(key)?undefined:value));
function check(title,fn){try{fn();results.push({title,result:'PASS'});console.log('PASS',title);}catch(error){results.push({title,result:'FAIL',message:error.message});console.error('FAIL',title,error.message);}}
try {
 for(const file of [...Object.keys(manifest.canonicalRuntimeFiles),'firestore.rules','firestore.indexes.json',profile.identity.manifest]) {
  for(const name of [file,...(Object.hasOwn(manifest.canonicalRuntimeFiles,file)?['public/'+file]:[])]) {
   const target=path.join(scratch,name);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(root,name),target);
  }
 }
 check('Exact operational source passes without any CUTOVER_PROOF file',()=>{
  assert.equal(fs.existsSync(path.join(scratch,'CUTOVER_PROOF.json')),false);
  assert.equal(verifyRuntimeProfile(scratch).identity.id,profile.identity.id);
 });
 for(const [title,file,change] of [
  ['a stale authority import is rejected','js/main.js',text=>text.replace(/qr-v11r6-a9r14-qa-mobile-20261025/,'stale-build')],
  ['a changed public mirror is rejected','public/css/ui-mobile-shell.css',text=>text+'\n/* wrong public bytes */'],
  ['Rules with broader access are rejected','firestore.rules',text=>text.replace('allow delete: if false;','allow delete: if true;')],
  ['changed indexes are rejected','firestore.indexes.json',text=>text+'\n'],
  ['a mismatched client attendance gate is rejected','js/core/attendanceContract.js',text=>text.replace('HISTORY_COACH_ACCESS = true','HISTORY_COACH_ACCESS = false')],
  ['a tampered pinned manifest is rejected',profile.identity.manifest,text=>text+'\n'],
 ]) check(title,()=>{
  const target=path.join(scratch,file),original=fs.readFileSync(target,'utf8');
  try {const modified=change(original);assert.notEqual(modified,original);fs.writeFileSync(target,modified);assert.throws(()=>verifyRuntimeProfile(scratch));}
  finally {fs.writeFileSync(target,original);}
 });
 check('A self-declared cutover proof cannot bless changed source bytes',()=>{
  const file=path.join(scratch,'js/main.js'),original=fs.readFileSync(file,'utf8');
  try {fs.writeFileSync(file,original+'\n/* tampered */');fs.writeFileSync(path.join(scratch,'CUTOVER_PROOF.json'),JSON.stringify({status:'STAGING_CANDIDATE_VERIFIED_NOT_DEPLOYED',plan:{activeBuildTag:profile.identity.buildTag}}));assert.throws(()=>verifyRuntimeProfile(scratch));}
  finally {fs.writeFileSync(file,original);fs.rmSync(path.join(scratch,'CUTOVER_PROOF.json'));}
 });
 check('Original app.js ceilings pass with an unchanged executable AST',()=>{
  const app=read('app.js'),baseline=JSON.parse(read('evidence/A9R14/APP_SIZE_AND_AST.json'));
  assert(Buffer.byteLength(app)<=700000);assert(app.split('\n').length<=11300);
  assert.equal(sha(JSON.stringify(strip(parse(app,{ecmaVersion:'latest',sourceType:'script'})))),baseline.astSha256);
 });
 check('Release verification still refuses missing signed evidence',()=>{
  const env={...process.env};for(const key of ['V11R2_RELEASE_DECISION_BUNDLE','V11R2_OWNER_PUBLIC_KEY','V11R2_TRUSTED_OWNER_KEY_SHA256'])delete env[key];
  const result=spawnSync(process.execPath,['tools/v11r2/release-gate.mjs'],{cwd:root,env,encoding:'utf8'});
  assert.notEqual(result.status,0);assert.match(result.stderr,/RELEASE_HOLD/);
 });
} finally {
 fs.rmSync(scratch,{recursive:true,force:true});
 const report={scope:'QA negative controls; no deployment authorization',total:results.length,pass:results.filter(x=>x.result==='PASS').length,fail:results.filter(x=>x.result==='FAIL').length,results};
 fs.mkdirSync('evidence/A9R14',{recursive:true});fs.writeFileSync('evidence/A9R14/PROFILE_NEGATIVE_CONTROLS.json',JSON.stringify(report,null,2));if(report.fail)process.exitCode=1;
}
