import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {attendanceCacheChain} from '../v11r2/cache-contract.mjs';
import {ACCEPTED_SOURCE} from '../v11r2/source-identity.mjs';
const root=process.cwd(),candidate=path.resolve(process.argv[2]),gate=path.join(root,'tools/check-v5u2e-attendance-excel-sdk-fix.mjs');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'a3-excel-profile-')),results=[];
const clone=(from,to)=>{
 fs.mkdirSync(to,{recursive:true});
 for(const file of ['app.js','index.html','style.css','.nojekyll','js','css','public','firestore.rules','firestore.indexes.json','package.json',ACCEPTED_SOURCE.manifest,'CUTOVER_PROOF.json']){
  if(!fs.existsSync(path.join(from,file)))continue;
  fs.mkdirSync(path.dirname(path.join(to,file)),{recursive:true});fs.cpSync(path.join(from,file),path.join(to,file),{recursive:true});
 }
};
const test=(name,fn)=>{fn();results.push({name,status:'PASS'});console.log('PASS '+name)};
const run=cwd=>spawnSync('node',[gate],{cwd,encoding:'utf8',timeout:20000});
const reject=(dir,name,file,change,mirror=true)=>test(name,()=>{
 const original=fs.readFileSync(path.join(dir,file),'utf8'),next=change(original);assert.notEqual(original,next);
 const copies=[file,...(mirror&&file.startsWith('js/')?['public/'+file]:[])];
 const saved=copies.map(f=>[f,fs.readFileSync(path.join(dir,f))]);
 try {
  for(const f of copies)fs.writeFileSync(path.join(dir,f),next);
  const r=run(dir);assert.equal(r.status,1,r.stdout+r.stderr);assert.match(r.stdout+r.stderr,/❌ attendance profile:/);
 }finally{for(const [f,bytes]of saved)fs.writeFileSync(path.join(dir,f),bytes)}
});
try {
 const maintenance=path.join(tmp,'maintenance'),active=path.join(tmp,'active');clone(root,maintenance);clone(candidate,active);
 test('exact maintenance profile passes while active cache check stays false',()=>{assert.equal(attendanceCacheChain(maintenance),false);const r=run(maintenance);assert.equal(r.status,0,r.stdout+r.stderr)});
 test('exact DEMO active profile passes with strict cache check true',()=>{assert.equal(attendanceCacheChain(active),true);const r=run(active);assert.equal(r.status,0,r.stdout+r.stderr)});
 reject(maintenance,'maintenance client flag cannot be opened against closed Rules','js/core/attendanceContract.js',s=>s.replace('HISTORY_COACH_ACCESS = false','HISTORY_COACH_ACCESS = true'));
 reject(maintenance,'maintenance Rules cannot be opened against a closed client','firestore.rules',s=>s.replace(/(function coachAttendanceCutoverOpen\(\)\s*\{\s*return )false/,'$1true'));
 reject(maintenance,'unknown maintenance build identity is rejected','js/main.js',s=>s.replace("window.APP_BUILD_VERSION = '"+ACCEPTED_SOURCE.buildTag+"'","window.APP_BUILD_VERSION = 'qr-unreviewed'"));
 reject(maintenance,'root/public mismatch is rejected','js/main.js',s=>s+'\n// mismatch',false);
 test('a stale active dynamic import still fails strict cache validation',()=>{
  const file='js/modules/reports/reportExportFacade.js',original=fs.readFileSync(path.join(active,file),'utf8');
  const next=original.replace(/qr-v11r6-active-20261022-[0-9a-f]{12}/g,'qr-v11r2-cutover-20261021');assert.notEqual(next,original);
  try {for(const f of [file,'public/'+file])fs.writeFileSync(path.join(active,f),next);assert.equal(attendanceCacheChain(active),false);const r=run(active);assert.equal(r.status,1);assert.match(r.stdout+r.stderr,/❌ attendance profile:/)}
  finally {for(const f of [file,'public/'+file])fs.writeFileSync(path.join(active,f),original)}
 });
 reject(active,'active proof identity mismatch is rejected','CUTOVER_PROOF.json',s=>{const d=JSON.parse(s);d.plan.activeRuntimeSHA256='0'.repeat(64);return JSON.stringify(d)});
}catch(error){results.push({name:'failure',status:'FAIL',error:error.stack});throw error}
finally {
 fs.mkdirSync('handoff/A3/evidence',{recursive:true});fs.writeFileSync('handoff/A3/evidence/T02-profile-controls.json',JSON.stringify({status:results.every(t=>t.status==='PASS')?'PASS':'FAIL',results},null,2));fs.rmSync(tmp,{recursive:true,force:true});
}
