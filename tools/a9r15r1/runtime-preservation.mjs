import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import assert from 'node:assert/strict';
import {verifyRuntimeProfile} from '../v11r2/runtime-profile.mjs';
const root=process.cwd(),sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const profile=verifyRuntimeProfile(root),manifest=JSON.parse(fs.readFileSync(path.join(root,profile.identity.manifest),'utf8'));
assert.equal(profile.identity.runtimeSHA256,'f112c0aea086cb3e7684d03ddfe1897d82bcb159086b0a8fd895c71e9208fb67');
assert.equal(profile.identity.rulesSHA256,'1aa7fd38544142dcb82dbd8809f9ea65d6c77dc6427f60934e3333005062e6b3');
assert.equal(profile.identity.indexesSHA256,'72ac0a7baf139b2ad52934be5efaf62c81dab8345be3d91ddf35700c949914f2');
const runtimeFiles=directory=>{
 const files=[];for(const prefix of ['app.js','index.html','style.css','.nojekyll','js','css']){
  const first=path.join(directory,prefix);if(!fs.existsSync(first))continue;
  const walk=file=>{if(fs.statSync(file).isDirectory())for(const entry of fs.readdirSync(file))walk(path.join(file,entry));else files.push(path.relative(directory,file).split(path.sep).join('/'));};walk(first);
 }return files.sort();
};
const rootFiles=runtimeFiles(root),publicFiles=runtimeFiles(path.join(root,'public')),expected=Object.keys(manifest.canonicalRuntimeFiles).sort();
const missing=expected.filter(file=>!publicFiles.includes(file)),extras=publicFiles.filter(file=>!expected.includes(file));
const rows=expected.map(file=>{const rootSHA256=sha(fs.readFileSync(path.join(root,file))),publicSHA256=fs.existsSync(path.join(root,'public',file))?sha(fs.readFileSync(path.join(root,'public',file))):null;return {file,parentSHA256:manifest.canonicalRuntimeFiles[file],rootSHA256,publicSHA256,match:rootSHA256===publicSHA256&&rootSHA256===manifest.canonicalRuntimeFiles[file]};});
const mismatches=rows.filter(row=>!row.match);assert.deepEqual(rootFiles,expected);assert.deepEqual(publicFiles,expected);assert.equal(rows.length,129);assert.equal(mismatches.length,0);
const counts=Object.fromEntries(['getDoc','getDocs','onSnapshot'].map(name=>[name,expected.filter(file=>file.endsWith('.js')).reduce((n,file)=>n+(fs.readFileSync(path.join(root,file),'utf8').match(new RegExp('\\b'+name+'\\s*\\(','g'))||[]).length,0)]));assert.deepEqual(counts,{getDoc:24,getDocs:58,onSnapshot:35});
const result={classification:'PASS',runtimeFilesChanged:0,appChanged:false,buildTagChanged:false,runtimeSHA256:profile.identity.runtimeSHA256,buildTag:profile.identity.buildTag,historyAuthority:profile.authority,journalDatabase:'tst-attendance-journal-v4',sdkStaticCounts:counts,rulesSHA256:profile.identity.rulesSHA256,indexesSHA256:profile.identity.indexesSHA256,rootFileCount:rootFiles.length,publicFileCount:publicFiles.length,countScope:'canonical runtime assets',missing,extras,mismatches,files:rows};
fs.mkdirSync('evidence/A9R15R1',{recursive:true});fs.writeFileSync('evidence/A9R15R1/A9R15R1_ROOT_PUBLIC_PARITY.json',JSON.stringify(result,null,2));console.log('PASS RUNTIME_BYTE_IDENTICAL',rootFiles.length,'build',profile.identity.buildTag);
