import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {sha} from './proof.mjs';import {runtimeHash} from '../v11r2/cutover.mjs';
const root=process.cwd(),base=path.resolve(process.argv[2]),files=JSON.parse(fs.readFileSync(path.join(base,'handoff/V11R2/SOURCE_HASHES_AND_DIFF.json'))).runtimeFiles,results=[];
const check=(name,fn)=>{fn();results.push({name,status:'PASS'});console.log('PASS',name)};
try{
 check('all 128 canonical runtime files byte-identical to exact R2',()=>{assert.equal(Object.keys(files).length,128);for(const f of Object.keys(files))assert.equal(sha(fs.readFileSync(f)),sha(fs.readFileSync(path.join(base,f))),f)});
 check('all runtime public mirrors byte-identical',()=>{for(const f of Object.keys(files))assert.equal(sha(fs.readFileSync(f)),sha(fs.readFileSync(path.join('public',f))),f)});
 check('Rules and indexes unchanged including maintenance deny',()=>{for(const f of ['firestore.rules','firestore.indexes.json'])assert.equal(sha(fs.readFileSync(f)),sha(fs.readFileSync(path.join(base,f))));assert.match(fs.readFileSync('firestore.rules','utf8'),/coachAttendanceCutoverOpen\(\)\s*\{\s*return false;/)});
 check('journal, worker and CAS service untouched',()=>{for(const f of ['js/data/attendanceJournal.js','js/modules/attendance.js','js/services/attendance.service.js'])assert.equal(sha(fs.readFileSync(f)),sha(fs.readFileSync(path.join(base,f))))});
 check('no new diagnostics imported by the production runtime',()=>{for(const f of Object.keys(files).filter(f=>f.endsWith('.js')||f==='index.html'))assert(!fs.readFileSync(f,'utf8').includes('tools/v11r3'),f)});
 check('existing R2 pending owner decision remains unchanged',()=>assert.equal(fs.readFileSync('handoff/V11R2/OWNER_DECISION_REQUIRED.json','utf8'),fs.readFileSync(path.join(base,'handoff/V11R2/OWNER_DECISION_REQUIRED.json'),'utf8')));
}catch(e){results.push({name:'failure',status:'FAIL',actual:e.stack});throw e}finally{fs.writeFileSync('handoff/V11R3/evidence/runtime-boundary.json',JSON.stringify({command:process.argv.join(' '),runtimeSHA256:runtimeHash(root),rulesSHA256:sha(fs.readFileSync('firestore.rules')),results},null,2))}
console.log('R3 RUNTIME BOUNDARY PASS',results.length);
