// Compatibility gate for the current attendance owner: maintenance DENY or
// isolated DEMO V3 UI + native journal/CAS. Never replay the obsolete V1 queue.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {runtimeHash,fileDigest} from './v11r2/cutover.mjs';
import {verifySourceIdentity} from './v11r2/source-identity.mjs';
import {attendanceCacheChain} from './v11r2/cache-contract.mjs';
const root=process.cwd(),host=process.env.FIRESTORE_EMULATOR_HOST;
assert.match(host||'',/^127\.0\.0\.1:\d+$/,'Run coach join against an already-started local demo Emulator');
const {HISTORY_COACH_ACCESS}=await import(pathToFileURL(path.join(root,'js/core/attendanceContract.js')));
const rules=fs.readFileSync('firestore.rules','utf8');
const rulesOpen=rules.match(/function coachAttendanceCutoverOpen\(\)\s*\{\s*return (true|false);\s*\}/)?.[1];
assert.equal(rulesOpen,HISTORY_COACH_ACCESS?'true':'false','Client/Rules profile mismatch');
const profile=HISTORY_COACH_ACCESS?'DEMO_ACTIVE_NOT_RELEASE':'MAINTENANCE_DENY',results=[];
if(HISTORY_COACH_ACCESS){
 const {plan,status}=JSON.parse(fs.readFileSync('CUTOVER_PROOF.json','utf8'));
 assert.equal(status,'DEMO_VERIFIED_NOT_RELEASE');assert(plan.projectId.startsWith('demo-'));
 assert.equal(runtimeHash(root),plan.activeRuntimeSHA256);
 assert.equal(fileDigest('firestore.rules'),plan.activeRulesSHA256);assert.equal(fileDigest('firestore.indexes.json'),plan.indexesSHA256);
 assert.equal(attendanceCacheChain(root),true,'Active cache graph must remain strict');
}else verifySourceIdentity(root,runtimeHash(root));
const commands=HISTORY_COACH_ACCESS?['tools/v11/browser.mjs','tools/v11r1/cas-idb.mjs']:['tools/v11r2/maintenance-browser.mjs','tools/a1a2/maintenance.emulator.mjs'];
try{
 for(const file of commands){
  const r=spawnSync(process.execPath,[file],{cwd:root,env:process.env,encoding:'utf8',timeout:300000,maxBuffer:16000000});
  process.stdout.write(r.stdout||'');process.stderr.write(r.stderr||'');
  results.push({command:['node',file],actualExit:r.status,status:r.status===0?'PASS':'FAIL'});
  assert.equal(r.status,0,file+' must execute successfully: '+(r.error?.message||''));
 }
}finally{
 const out=process.env.V10_OUTPUT||'handoff/A3/evidence/coach-join';fs.mkdirSync(out,{recursive:true});
 fs.writeFileSync(path.join(out,'CURRENT_OWNER_COACH_JOIN.json'),JSON.stringify({profile,runtimeSHA256:runtimeHash(root),rulesSHA256:fileDigest('firestore.rules'),results,productionWrites:0,scope:'Synthetic local demo and Chromium only; no physical device or old cached-client acceptance'},null,2));
}
console.log('CURRENT OWNER COACH JOIN '+profile+' PASS; release remains HOLD');
