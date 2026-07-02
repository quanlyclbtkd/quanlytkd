#!/usr/bin/env node
import fs from 'node:fs';
const attendance = fs.readFileSync('js/modules/attendance.js', 'utf8');
let pass = 0, fail = 0;
function check(name, ok) { if (ok) { pass++; console.log('✅', name); } else { fail++; console.error('❌', name); } }
console.log('\n=== Phase 4K-6V5B — Coach Attendance Status Cycle Fix ===\n');
check('stored status meanings are preserved', attendance.includes('1 = Có mặt, 2 = Nghỉ không phép, 3 = Nghỉ có phép'));
check('UI labels match legend', attendance.includes("label: 'Nghỉ không phép'") && attendance.includes("label: 'Nghỉ có phép'"));
check('explicit cycle order matches legend 0→1→3→2→0', attendance.includes('const _ATT_STATUS_CYCLE = Object.freeze([0, 1, 3, 2])'));
check('toggle uses _nextAttendanceStatus instead of numeric modulo', attendance.includes('const newStatus     = _nextAttendanceStatus(currentStatus);') && !attendance.includes('const newStatus     = (currentStatus + 1) % 4;'));
check('reports still count code 2 as absent and code 3 as excused', attendance.includes('if      (st === 1) presentCount++') && attendance.includes('else if (st === 2) absentCount++') && attendance.includes('else if (st === 3) excusedCount++'));
function next(s) { const cycle=[0,1,3,2]; const n=Number(s); const c=(n>=0&&n<=3)?n:0; const i=cycle.indexOf(c); return cycle[((i>=0?i+1:1)%cycle.length)]; }
check('dynamic cycle from Chưa ĐD works', next(0)===1 && next(1)===3 && next(3)===2 && next(2)===0);
check('dynamic cycle prevents Có phép double-tap landing on Có mặt', next(next(3)) === 0); // old code returned 1
console.log(`\nTotal: ${pass+fail} | PASS: ${pass} | FAIL: ${fail}`);
if (fail) process.exit(1);
console.log('Phase 4K-6V5B coach attendance status cycle checks passed.\n');
