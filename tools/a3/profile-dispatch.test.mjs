// Mismatched profiles must fail before any Emulator/browser child starts.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {ACCEPTED_SOURCE} from '../v11r2/source-identity.mjs';
const root=process.cwd(),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'a3-profile-dispatch-')),results=[];
const scripts=['tools/firestore-rules-6v4b.test.mjs','tools/check-v10-coach-join.mjs'];
const files=['app.js','index.html','style.css','.nojekyll','js','css','firestore.rules','firestore.indexes.json','package.json',ACCEPTED_SOURCE.manifest,'tools/v11r2','tools/v11r3',...scripts];
for(const file of files){fs.mkdirSync(path.dirname(path.join(tmp,file)),{recursive:true});fs.cpSync(path.join(root,file),path.join(tmp,file),{recursive:true});}
fs.symlinkSync(path.join(root,'node_modules'),path.join(tmp,'node_modules'),'dir');
try {
 const contractFile=path.join(tmp,'js/core/attendanceContract.js'),rulesFile=path.join(tmp,'firestore.rules');
 const contract=fs.readFileSync(contractFile,'utf8'),rules=fs.readFileSync(rulesFile,'utf8');
 for(const [name,change]of [['client-open-rules-closed',()=>fs.writeFileSync(contractFile,contract.replace('HISTORY_COACH_ACCESS = false','HISTORY_COACH_ACCESS = true'))],['client-closed-rules-open',()=>fs.writeFileSync(rulesFile,rules.replace(/(function coachAttendanceCutoverOpen\(\)\s*\{\s*return )false/,'$1true'))]]) {
  fs.writeFileSync(contractFile,contract);fs.writeFileSync(rulesFile,rules);change();
  for(const script of scripts){
   const r=spawnSync('node',[script],{cwd:tmp,encoding:'utf8',timeout:10000,env:{...process.env,FIRESTORE_EMULATOR_HOST:'127.0.0.1:1'}});
   assert.equal(r.status,1,r.stdout+r.stderr);assert.match(r.stdout+r.stderr,/Client\/Rules.*(?:profile|profiles)/);
   assert(!/ECONNREFUSED|PERMISSION_DENIED|PASS|Rules Emulator total/.test(r.stdout+r.stderr));
   results.push({name:name+' '+script,status:'PASS'});console.log('PASS '+results.at(-1).name);
  }
 }
}finally {
 fs.rmSync(tmp,{recursive:true,force:true});fs.writeFileSync('handoff/A3/evidence/profile-dispatch-controls.json',JSON.stringify({results},null,2));
}
