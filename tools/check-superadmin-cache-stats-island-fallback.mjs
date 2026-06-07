// tools/check-superadmin-cache-stats-island-fallback.mjs — Phase 4K-6I-D
import { readFileSync } from 'fs';

let passes = 0, failures = 0;
function check(cond, pass, fail) {
  if (cond) { console.log('  ✓ PASS:', pass); passes++; }
  else { console.log('  ✗ FAIL:', fail); failures++; }
}
function readFile(p) {
  const path = new URL('../' + p, import.meta.url).pathname;
  try { return readFileSync(path, 'utf8'); } catch { return null; }
}

console.log('══════════════════════════════════════════════════════');
console.log(' check-superadmin-cache-stats-island-fallback — Phase 4K-6I-D');
console.log('══════════════════════════════════════════════════════');
console.log();

const sa = readFile('js/modules/superadmin.js');
const students = readFile('js/modules/students.js');
const main = readFile('js/main.js');
const index = readFile('index.html');
const pkg = readFile('package.json');

check(sa && sa.includes('_readStatsIncomeTotal'), 'SuperAdmin reads revenue from stats docs robustly', 'missing _readStatsIncomeTotal');
check(sa && sa.includes('_readClubCachedRevenue'), 'SuperAdmin reads cached revenue from club doc fallback', 'missing _readClubCachedRevenue');
check(sa && sa.includes('_readStudentCountFromClub') && sa.includes('_readStudentCountFromStats'), 'SuperAdmin has cached student count readers', 'missing cached student count readers');
check(sa && sa.includes('studentKnownClubCount') && sa.includes('totalStudentsDisplay'), 'SuperAdmin top total students is cache-aware', 'top total students still may show false 0');
check(sa && sa.includes('revenueDisplay') && sa.includes('revenueNote'), 'SuperAdmin top revenue is cache/stats-aware', 'top revenue still may show false 0');
check(sa && sa.includes('CLB nào chưa có cache sẽ hiển thị') && sa.includes('<b>--</b>'), 'SuperAdmin UI explains cache-only -- fallback', 'missing cache-only explanation');
check(sa && !sa.includes('totalStudents += (activeCount || 0)'), 'SuperAdmin no longer sums missing active counts as 0', 'totalStudents still sums null activeCount as 0');
check(sa && !sa.includes('totalRevenue > 0 ? Math.round(totalRevenue/1000000)'), 'SuperAdmin no longer hides valid zero/missing revenue with old >0 check', 'old revenue >0 display logic remains');
check(students && students.includes('debugStudentsPaginationIslandFallback'), 'debugStudentsPaginationIslandFallback defined', 'missing debugStudentsPaginationIslandFallback');
check(students && students.includes('island-retry') && students.includes('renderActiveList'), 'student pagination fallback tries island render before legacy fallback', 'fallback does not force island render first');
check(students && students.includes('Fallback render after island timeout'), 'fallback warning only after island timeout', 'fallback warning text not updated');
check(main && main.includes('debugStudentsPaginationIslandFallback'), 'runtime smoke includes student pagination island fallback debug', 'runtime smoke missing student pagination island fallback debug');
check(main && main.includes('4K-6I-D-superadmin-cache-stats-island-fallback'), 'APP_BUILD_VERSION updated to 4K-6I-D', 'APP_BUILD_VERSION not updated to 4K-6I-D');
check(index && index.includes('superadmin-cache-stats-island-fallback-20260607'), 'index.html cache bust updated to 4K-6I-D', 'index.html cache bust not updated to 4K-6I-D');
check(pkg && pkg.includes('check:superadmin-cache-stats-island-fallback'), 'package.json includes check:superadmin-cache-stats-island-fallback', 'package.json missing check:superadmin-cache-stats-island-fallback');

console.log();
console.log('══════════════════════════════════════════════════════');
if (failures === 0) {
  console.log(' ✓ check-superadmin-cache-stats-island-fallback PASSED');
} else {
  console.log(` ✗ check-superadmin-cache-stats-island-fallback FAILED — ${failures} failure${failures !== 1 ? 's' : ''}`);
  process.exit(1);
}
console.log('══════════════════════════════════════════════════════');
