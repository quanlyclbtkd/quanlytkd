import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
const read=p=>fs.readFileSync(p,'utf8');
const service=read('js/services/attendance.service.js');
const rules=read('firestore.rules');
const attendance=read('js/modules/attendance.js');
const results=[];
function check(title,fn){try{fn();results.push({title,result:'PASS'});console.log('PASS',title)}catch(e){results.push({title,result:'FAIL',message:String(e.message||e)});console.error('FAIL',title,e.message||e)}}
check('Coach current-authority daily/monthly queries use canonical branch equality',()=>{
  assert.match(service,/function _attendanceBranchConstraint[\s\S]*?return where\('branch', '==', canonical\);/);
  assert.equal((service.match(/_attendanceBranchConstraint\(where, branch, isCoach\)/g)||[]).length,2);
});
check('Legacy alias helper remains available outside current-authority attendance query',()=>{
  assert.match(service,/function _branchAliases/);
  assert.match(service,/const aliases = \(branch && branch !== 'all'\) \? \(isCoach \? _branchAliases\(branch\)/);
});
check('Coach daily query still requires date authority branch and shift',()=>{
  assert.match(service,/where\('date', '==', date\)/);
  assert.match(service,/where\('historyAuthority','==',HISTORY_AUTHORITY\)/);
  assert.match(service,/if \(shiftId\) baseConstraints\.push\(where\('shiftId', '==', shiftId\)\)/);
});
check('Rules list branch proof is direct allowedBranches membership',()=>{
  assert.match(rules,/function coachAttendanceResourceBranchMatches\(\)[\s\S]*?resource\.data\.branch in assignedBranches\(currentUser\(\)\)/);
  assert.match(rules,/allow list:[\s\S]*?coachAttendanceResourceBranchMatches\(\) && historicalProof\(resource\.data\)/);
});
check('Rules writes require canonical CS branch and server-authoritative assignment',()=>{
  assert.match(rules,/request\.resource\.data\.get\('branch',''\) in \['CS1','CS2','CS3','CS4','CS5','CS6','CS7','CS8','CS9','CS10'\]/);
  assert.match(rules,/coachAttendanceRequestBranchMatches\(\)[\s\S]*?request\.resource\.data\.branch in assignedBranches\(currentUser\(\)\)/);
  assert.match(rules,/coachAttendanceProfileMatches\(clubId, request\.resource\.data\)/);
});
check('Permission denial produces actionable Coach diagnostic without bypassing readiness guard',()=>{
  assert.match(attendance,/Firestore chưa cho phép tải trạng thái Điểm danh HLV/);
  assert.match(attendance,/if \(!_attendanceDailyState\.cacheReady/);
});
check('A9R11 authority and Journal V4 remain unchanged',()=>{
  const contract=read('js/core/attendanceContract.js');
  assert.match(contract,/attendance-history-1aedda93-9437-4132-9694-35c2e6234d55/);
  assert.match(contract,/tst-attendance-journal-v4/);
});
check('Root and public attendance runtime mirrors are identical',()=>{
  for(const p of ['js/services/attendance.service.js','js/modules/attendance.js']) assert.equal(read(p),read('public/'+p),p+' parity');
});
const report={kind:'A9R12_ATTENDANCE_QUERY_CLOSURE',pass:results.filter(x=>x.result==='PASS').length,fail:results.filter(x=>x.result==='FAIL').length,total:results.length,rulesSha256:crypto.createHash('sha256').update(rules).digest('hex'),results};
fs.mkdirSync('evidence/A9R12',{recursive:true});fs.writeFileSync('evidence/A9R12/A9R12_QUERY_CLOSURE_RESULT.json',JSON.stringify(report,null,2));
console.log('A9R12_QUERY_CLOSURE '+JSON.stringify({pass:report.pass,fail:report.fail,total:report.total}));if(report.fail)process.exitCode=1;
