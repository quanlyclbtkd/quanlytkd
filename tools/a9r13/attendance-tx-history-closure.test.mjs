import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

const read=p=>fs.readFileSync(p,'utf8');
const service=read('js/services/attendance.service.js');
const journal=read('js/data/attendanceJournal.js');
const attendance=read('js/modules/attendance.js');
const results=[];
function check(title,fn){try{fn();results.push({title,result:'PASS'});console.log('PASS',title)}catch(e){results.push({title,result:'FAIL',message:String(e.message||e)});console.error('FAIL',title,e.message||e)}}
check('A9R13 imports ABSENT_VERSION and skips missing-doc transaction read',()=>{
  assert.match(service,/HISTORY_AUTHORITY, ABSENT_VERSION, attendanceServerVersion/);
  assert.match(service,/if \(intent\.baseVersion === ABSENT_VERSION\) \{[\s\S]*?current\.push\(\{intent,ref,data:null,createWithoutRead:true\}\);[\s\S]*?continue;/);
});
check('Existing attendance still uses transaction.get CAS path',()=>{
  assert.match(service,/const snap = await transaction\.get\(ref\);[\s\S]*?attendance\.intent-version/);
  assert.match(service,/attendanceServerVersion\(data\) !== intent\.baseVersion/);
  assert.match(service,/attendancePreviousVersion = data\?\.attendanceVersion \|\| \(intent\.baseVersion === ABSENT_VERSION \? ABSENT_VERSION : 'legacy'\)/);
});
check('Coach member history no longer issues legacy branch alias query',()=>{
  assert.match(service,/current-authority Coach history is canonical-branch only/);
  assert.match(service,/\? \(isCoach \? \[_canonicalBranch\(branch, ''\)\] : \[branch\]\)/);
  const block=service.slice(service.indexOf('async loadMemberHistory'),service.indexOf('// ── COACH NOTES'));
  assert(!block.includes('_branchAliases(branch)'));
});
check('A9R13 recovers only known A9R12 permission-denied absent Journal roots once',()=>{
  assert.match(journal,/async recoverPermissionDeniedAbsent/);
  assert.match(journal,/row\.state==='needs-review' && row\.lastError==='permission-denied'/);
  assert.match(journal,/originalBaseVersion\|\|row\.baseVersion/);
  assert.match(journal,/a9r13RecoveryMarker!==marker/);
  assert.match(attendance,/recoverPermissionDeniedAbsent\?\.\(syncContext\)/);
});
check('A9R13 does not change forward-only authority or Journal database',()=>{
  const contract=read('js/core/attendanceContract.js');
  assert.match(contract,/attendance-history-1aedda93-9437-4132-9694-35c2e6234d55/);
  assert.match(contract,/JOURNAL_DATABASE = 'tst-attendance-journal-v4'/);
  assert.match(contract,/HISTORY_COACH_ACCESS = true/);
});
check('Root/public mirrors match for changed runtime files',()=>{
  for(const p of ['js/services/attendance.service.js','js/data/attendanceJournal.js','js/modules/attendance.js','js/main.js','index.html']) assert.equal(read(p),read('public/'+p),p+' parity');
});
const report={kind:'A9R13_ATTENDANCE_TX_HISTORY_CLOSURE',pass:results.filter(x=>x.result==='PASS').length,fail:results.filter(x=>x.result==='FAIL').length,total:results.length,serviceSha256:crypto.createHash('sha256').update(service).digest('hex'),results};
fs.writeFileSync('evidence/A9R13/A9R13_TX_HISTORY_CLOSURE_RESULT.json',JSON.stringify(report,null,2));
console.log('A9R13_TX_HISTORY_CLOSURE '+JSON.stringify({pass:report.pass,fail:report.fail,total:report.total}));if(report.fail)process.exitCode=1;
