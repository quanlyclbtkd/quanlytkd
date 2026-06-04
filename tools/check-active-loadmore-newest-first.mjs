/**
 * check-active-loadmore-newest-first.mjs
 * Phase 4K-5J-2: Kiểm tra active load more client limit + newest-first sort
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

let failures = 0;
function fail(msg) { console.error('❌ FAIL:', msg); failures++; }
function ok(msg)   { console.log ('✅ OK:  ', msg); }

const students  = readFileSync(join(root, 'js/modules/students.js'), 'utf8');
const renderer  = readFileSync(join(root, 'js/ui/render/computation/studentsRenderer.js'), 'utf8');
const helpers   = readFileSync(join(root, 'js/utils/monthlyHelpers.js'), 'utf8');
const appJs     = readFileSync(join(root, 'app.js'), 'utf8');

// 1. __activeRenderLimit defined
if (!students.includes('window.__activeRenderLimit'))
  fail('students.js thiếu window.__activeRenderLimit');
else ok('__activeRenderLimit defined');

// 2. resetActiveRenderLimit defined
if (!students.includes('window.resetActiveRenderLimit'))
  fail('students.js thiếu window.resetActiveRenderLimit');
else ok('resetActiveRenderLimit defined');

// 3. loadMoreActiveStudents tăng __activeRenderLimit
const lmasStart = students.indexOf('window.loadMoreActiveStudents = async');
const lmasEnd   = students.indexOf('window.ensureDebtProfilesReady');
const lmasBlock = lmasStart >= 0 && lmasEnd > lmasStart ? students.slice(lmasStart, lmasEnd) : '';
if (!lmasBlock.includes('__activeRenderLimit'))
  fail('loadMoreActiveStudents không tăng __activeRenderLimit');
else ok('loadMoreActiveStudents increments __activeRenderLimit');

// 4. loadMoreActiveStudents gọi refreshListsComputation
if (!lmasBlock.includes('refreshListsComputation'))
  fail('loadMoreActiveStudents không gọi refreshListsComputation');
else ok('loadMoreActiveStudents calls refreshListsComputation');

// 5. loadMoreActiveStudents gọi invalidateList
if (!lmasBlock.includes('invalidateList'))
  fail('loadMoreActiveStudents không gọi invalidateList');
else ok('loadMoreActiveStudents calls invalidateList');

// 6. studentsRenderer dùng __activeRenderLimit trong _activeLimit
if (!renderer.includes('window.__activeRenderLimit || activePage * _PAGE_LIMIT'))
  fail('studentsRenderer không dùng window.__activeRenderLimit cho _activeLimit');
else ok('studentsRenderer _activeLimit uses window.__activeRenderLimit');

// 7. studentsRenderer paramsKey có active render limit key
if (!renderer.includes('arl:') || !renderer.includes('drl:'))
  fail('studentsRenderer paramsKey thiếu arl:/drl: keys');
else ok('studentsRenderer paramsKey has arl:/drl: keys');

// 8. PASS 2 có guard !useFullProfileActiveRender
if (!renderer.includes('useFullProfileActiveRender'))
  fail('studentsRenderer PASS 2 thiếu !useFullProfileActiveRender guard');
else ok('studentsRenderer PASS 2 has useFullProfileActiveRender guard');

// 9. Active load more KHÔNG nằm trong if (!pgStudentsActive)
// The pattern "!pgStudentsActive) {\n...buildActive && _activeTotalCount > _activeRendered" should NOT exist
const activeInsidePgGuard = renderer.match(/if\s*\(\s*!pgStudentsActive\s*\)\s*\{[^}]*activeList[^}]*loadMoreActiveStudents/s);
if (activeInsidePgGuard)
  fail('studentsRenderer active load more vẫn còn trong if (!pgStudentsActive)');
else ok('active load more nằm ngoài if (!pgStudentsActive)');

// 10. Active load more button gọi window.loadMoreActiveStudents(event)
if (!renderer.includes("window.loadMoreActiveStudents(event)"))
  fail('studentsRenderer active load more không gọi window.loadMoreActiveStudents(event)');
else ok('active load more button calls window.loadMoreActiveStudents(event)');

// 11. getStudentJoinTimestamp có admissionDate + joinDate
if (!helpers.includes('p.admissionDate') || !helpers.includes('p.joinDate'))
  fail('getStudentJoinTimestamp thiếu admissionDate hoặc joinDate');
else ok('getStudentJoinTimestamp has admissionDate + joinDate');

// 12. addNewStudent lưu admissionDate + joinDate
if (!students.includes('admissionDate:') || !students.includes('joinDate:'))
  fail('addNewStudent không lưu admissionDate hoặc joinDate');
else ok('addNewStudent saves admissionDate + joinDate');

// 13. debugActiveLoadMoreAndSort defined
if (!students.includes('window.debugActiveLoadMoreAndSort'))
  fail('students.js thiếu window.debugActiveLoadMoreAndSort');
else ok('debugActiveLoadMoreAndSort defined');

// 14. app.js renderExamList dùng extractExamStudentName
const rELStart = appJs.indexOf('window.renderExamList = ');
const rELEnd   = appJs.indexOf('window.cancelExamPayment');
const rELBlock = rELStart >= 0 && rELEnd > rELStart ? appJs.slice(rELStart, rELEnd) : '';
if (!rELBlock.includes('extractExamStudentName'))
  fail('app.js renderExamList không dùng extractExamStudentName');
else ok('app.js renderExamList dùng extractExamStudentName');

// Tổng kết
console.log(`\n${'─'.repeat(60)}`);
if (failures === 0) {
  console.log('✅ check-active-loadmore-newest-first: TẤT CẢ PASS');
} else {
  console.error(`❌ check-active-loadmore-newest-first: ${failures} lỗi`);
  process.exit(1);
}
