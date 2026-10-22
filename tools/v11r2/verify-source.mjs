// Compare the patch against an independently extracted R1 source, read-only.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {fileDigest,runtimeHash} from './cutover.mjs';import {attendanceCacheChain} from './cache-contract.mjs';
const root=process.cwd(),base=path.resolve(process.argv[2]),active=process.argv[3]&&path.resolve(process.argv[3]);
const read=(dir,file)=>fs.readFileSync(path.join(dir,file),'utf8'),results=[];
const check=(name,fn)=>{fn();results.push({name,expected:'unchanged owner or exact narrow patch',actual:'matched',status:'PASS'})};
const expected=['index.html','js/core/attendanceContract.js','js/main.js','js/modules/attendance.js','js/modules/reports/attendanceExcelReport.js','js/modules/reports/reportExportFacade.js','js/services/attendance.service.js'].sort();
function files(dir){let out=[];for(const name of ['app.js','index.html','style.css','.nojekyll','js','css']){const p=path.join(dir,name);if(!fs.existsSync(p))continue;const walk=p=>{if(fs.statSync(p).isDirectory())for(const n of fs.readdirSync(p))walk(path.join(p,n));else out.push(path.relative(dir,p).split(path.sep).join('/'))};walk(p)}return out.sort()}
const changed=files(root).filter(f=>!fs.existsSync(path.join(base,f))||fileDigest(path.join(root,f))!==fileDigest(path.join(base,f)));
try{
 check('canonical runtime whitelist is exactly seven files',()=>assert.deepEqual(changed,expected));
 check('journal, finance, QR, profiles, inventory, exam and indexes unchanged',()=>{for(const f of ['app.js','js/data/attendanceJournal.js','js/data/studentProfileStore.js','js/listeners/profiles.listeners.js','js/listeners/attendance.listeners.js','js/modules/finance.js','js/modules/finance/finance.receipt.js','js/services/finance.service.js','js/modules/inventory.js','js/modules/exam.js','firestore.indexes.json'])assert.equal(fileDigest(path.join(root,f)),fileDigest(path.join(base,f)),f)});
 check('CAS writer body byte-identical to R1',()=>{const body=s=>s.slice(s.indexOf('async function _commitAttendanceIntents('),s.indexOf('export const AttendanceService ='));assert.equal(body(read(root,'js/services/attendance.service.js')),body(read(base,'js/services/attendance.service.js')))});
 check('all Rules outside attendance block unchanged',()=>{const outside=s=>s.slice(0,s.indexOf('      match /attendance/{attendanceId}'))+s.slice(s.indexOf('      match /attendanceNotes/{noteId}'));assert.equal(outside(read(root,'firestore.rules')),outside(read(base,'firestore.rules')))});
 check('default server and UI both maintenance',()=>{assert.match(read(root,'firestore.rules'),/function coachAttendanceCutoverOpen\(\)\s*\{\s*return false;/);assert.match(read(root,'js/core/attendanceContract.js'),/HISTORY_COACH_ACCESS = false/)});
 check('all runtime mirrors equal public bytes',()=>{for(const f of files(root))assert.equal(fileDigest(path.join(root,f)),fileDigest(path.join(root,'public',f)),f)});
 check('default dynamic boot and all attendance import tags agree',()=>assert.equal(attendanceCacheChain(root),true));
 if(active)check('tested active candidate has its distinct consistent cache identity',()=>{assert.equal(attendanceCacheChain(active),true);assert.notEqual(read(root,'js/main.js'),read(active,'js/main.js'))});
}catch(e){results.push({name:'failure',status:'FAIL',actual:e.stack});throw e}finally{fs.writeFileSync('handoff/V11R2/evidence/source-invariants.json',JSON.stringify({command:process.argv.join(' '),runtimeSHA256:runtimeHash(root),rulesSHA256:fileDigest('firestore.rules'),baseline:base,canonicalRuntimeChanged:changed,results},null,2))}
console.log('SOURCE INVARIANTS PASS',results.length);
