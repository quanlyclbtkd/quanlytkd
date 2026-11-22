import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {verifyAuthStartupR1AAppDiff} from './app-diff-guard.mjs';
import {verifyRuntimeProfile} from '../v11r2/runtime-profile.mjs';

const root=path.resolve(process.argv[2]||process.cwd());
const output=path.resolve(process.argv[3]||fs.mkdtempSync(path.join(os.tmpdir(),'r1a-auth-')));
fs.mkdirSync(output,{recursive:true});
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const checks=[];
const check=(name,ok)=>checks.push({name,status:ok?'PASS':'FAIL'});
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
check('exact auth-only diff reconstructs accepted baseline',verifyAuthStartupR1AAppDiff(root).ok);
let profile;
try{profile=verifyRuntimeProfile(root);check('current lineage, mirrored runtime and frozen cache graph',profile.identity.testOnly===true);}catch(error){check('current lineage, mirrored runtime and frozen cache graph',false);}
const app=read('app.js');
check('one existing auth observer',app.split('onAuthStateChanged(auth, async (user) => {').length===2);
check('private callback epoch is not a public/business authority',!app.includes('window._authObserverEpoch')&&!app.includes('window.authObserverEpoch'));
check('registry module remains frozen',sha(fs.readFileSync(path.join(root,'js/utils/listeners.js')))==='bd572fda452100e79b3eb1ead383efaeb9a48b460db44f75d1d9926e5fffb4cb');
check('main module remains frozen',sha(fs.readFileSync(path.join(root,'js/main.js')))==='1b56d270635c857a7100d2d3ed891f43125b3f326c5b09bbbe5e49e9818e8322');
const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?(['migrations','diagnostics'].includes(e.name)?[]:walk(path.join(dir,e.name))):e.name.endsWith('.js')?[path.join(dir,e.name)]:[]);
const counts={getDoc:0,getDocs:0,onSnapshot:0};
const patterns={getDoc:/(?<![A-Za-z0-9_$])(?:getDoc|_getDoc|fbGetDoc)\s*\(/g,getDocs:/(?<![A-Za-z0-9_$])(?:getDocs|_getDocs|fbGetDocs|_pG4k)\s*\(/g,onSnapshot:/(?<![A-Za-z0-9_$])(?:onSnapshot|fbOnSnapshot)\s*\(/g};
for(const file of [path.join(root,'app.js'),...walk(path.join(root,'js'))])for(const line of fs.readFileSync(file,'utf8').split('\n')){
  const text=line.trim();if(text.startsWith('//')||text.startsWith('*')||text.startsWith('/*'))continue;
  for(const [name,pattern] of Object.entries(patterns)){pattern.lastIndex=0;if(pattern.test(line))counts[name]++;}
}
check('exact Firestore reader call-site budget 24/43/16',counts.getDoc===24&&counts.getDocs===43&&counts.onSnapshot===16);
for(const [script,file] of [['run-isolation.mjs','isolation.json'],['run-controls.mjs','controls.json']]) {
  const run=spawnSync(process.execPath,[path.join(root,'tools/auth-startup-r1a',script),root,path.join(output,file)],{encoding:'utf8'});
  fs.writeFileSync(path.join(output,script+'.log'),run.stdout+'\n'+run.stderr);
  check(script+' exact-source fixtures',run.status===0);
}
const result={scope:'OFFLINE_SOURCE_AND_AUTH_HARNESS_ONLY',realBrowserVerified:false,realFirebaseAuthVerified:false,productionNetworkAccess:0,total:checks.length,passed:checks.filter(c=>c.status==='PASS').length,counts,checks};
fs.writeFileSync(path.join(output,'phase-gate.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
if(result.total!==result.passed)process.exitCode=1;
