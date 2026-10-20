import assert from 'node:assert/strict';import fs from 'node:fs';import {casContract} from './cas-contract.mjs';
const source=fs.readFileSync('js/services/attendance.service.js','utf8');
for(const [name,change] of [
 ['compare-and-set removed',s=>s.replace("data?.attendanceVersion !== intent.id && attendanceServerVersion(data) !== intent.baseVersion","false")],
 ['ACK recovery removed',s=>s.replace('if (data?.attendanceVersion === intent.id) {','if (false) {')],
 ['payload whitelist removed',s=>s.replace('const payload = _toCanonicalAttendanceWrite(intent.record, intent.record.date);','const payload = {...intent.record};')],
 ['context guard removed',s=>s.replaceAll('ensureCurrent();','')]
]){const mutated=change(source);assert.notEqual(mutated,source);await assert.rejects(()=>casContract(()=>mutated),'Mutation survived: '+name);console.log('CAUGHT',name)}
console.log('CAS MUTATIONS PASS 4/4');
