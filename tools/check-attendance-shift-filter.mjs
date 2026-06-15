/**
 * Phase 4K-6V — Attendance canonical shift-filter check.
 * Verifies the canonical module/service after the legacy duplicate was removed.
 */
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => readFileSync(resolve(root, file), 'utf8');
let pass = 0;
let fail = 0;
function check(label, ok, hint='') {
  if (ok) { console.log('  ✅ ' + label); pass++; }
  else { console.error('  ❌ ' + label); if (hint) console.error('     → ' + hint); fail++; }
}

const app = read('app.js');
const mod = read('js/modules/attendance.js');
const service = read('js/services/attendance.service.js');

console.log('\n══════════════════════════════════════════════════════════');
console.log('  Phase 4K-6V — Attendance Shift Filter Check');
console.log('══════════════════════════════════════════════════════════\n');

check('app.js không còn implementation renderAttendanceList',
  !/window\.renderAttendanceList\s*=\s*async/.test(app),
  'Attendance core phải chỉ nằm trong js/modules/attendance.js');
check('app.js không còn implementation toggleAttendance',
  !/window\.toggleAttendance\s*=/.test(app),
  'Xóa duplicate attendance write flow khỏi app.js');
check('Module có canonical renderAttendanceList',
  /window\.renderAttendanceList\s*=\s*async/.test(mod));
check('Không còn ternary shift filter sai',
  !/_currentShiftId\s*\?\s*\(_docShift\s*!==\s*_currentShiftId\)/.test(mod));
check('Module dùng logic đúng khi có ca',
  /if\s*\(\s*_currentShiftId\s*&&\s*_docShift\s*!==\s*_currentShiftId\s*\)\s*return/.test(mod));
check('Module vẫn nạp cache sau filter',
  /_attendanceCache\[_id\]\s*=\s*_mapLegacyStatus/.test(mod));
check('Service lọc shiftId phía server khi có ca',
  /if\s*\(shiftId\)\s*constraints\.push\(where\(['"]shiftId['"],\s*['"]==['"],\s*shiftId\)\)/.test(service));
check('Service dùng attendanceDailyLimit tập trung',
  service.includes('attendanceDailyLimit'));
check('Service cảnh báo khi chạm daily limit',
  service.includes('hitLimit') && service.includes('warnUnsafeLimit'));
check('Module truyền _currentShiftId vào loadByDate',
  /loadByDate\(_attCurrentDate,\s*\{\s*shiftId:\s*_currentShiftId\s*\}\)/.test(mod));

console.log(`\nTotal: ${pass + fail} | Pass: ${pass} | Fail: ${fail}`);
if (fail) process.exit(1);
console.log('✅ Attendance shift filtering is canonical and safe.\n');
