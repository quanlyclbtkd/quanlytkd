/**
 * check-loadmore-scroll-preservation.mjs
 * Phase 4K-5I: Kiểm tra scroll preservation + debt/active load more fix
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
const eventsJs  = readFileSync(join(root, 'js/events/students.events.js'), 'utf8');

// 1. preserveScrollDuringListUpdate exists
if (!students.includes('window.preserveScrollDuringListUpdate'))
  fail('students.js thiếu window.preserveScrollDuringListUpdate');
else ok('preserveScrollDuringListUpdate defined');

// 2. loadMoreDebtRows nhận event và gọi preventDefault
if (!students.includes('loadMoreDebtRows = async function loadMoreDebtRows(event'))
  fail('loadMoreDebtRows không phải async hoặc không nhận event');
else ok('loadMoreDebtRows is async + accepts event');

if (!students.includes('event.preventDefault') || !students.includes('loadMoreDebtRows'))
  fail('loadMoreDebtRows không gọi event.preventDefault');
else ok('loadMoreDebtRows calls event.preventDefault');

// 3. loadMoreDebtRows tăng __debtRenderLimit
if (!students.includes('window.__debtRenderLimit = (window.__debtRenderLimit || 50) + inc'))
  fail('loadMoreDebtRows không tăng __debtRenderLimit đúng cách');
else ok('loadMoreDebtRows increments __debtRenderLimit');

// 4. loadMoreDebtRows gọi cả refreshListsComputation VÀ invalidateList (không dùng else if)
const lmdrBlock = students.slice(
  students.indexOf('window.loadMoreDebtRows = async'),
  students.indexOf('window.loadMoreActiveStudents = async')
);
if (!lmdrBlock.includes('refreshListsComputation') || !lmdrBlock.includes('invalidateList'))
  fail('loadMoreDebtRows phải gọi cả refreshListsComputation VÀ invalidateList');
else ok('loadMoreDebtRows calls both refreshListsComputation + invalidateList');

// 5. studentsRenderer KHÔNG còn _loadMore('debt')
if (renderer.includes("_loadMore('debt')"))
  fail("studentsRenderer.js vẫn còn _loadMore('debt') cho nút BÁO NỢ");
else ok("studentsRenderer.js không còn _loadMore('debt')");

// 6. studentsRenderer gọi loadMoreDebtRows(event)
if (!renderer.includes('window.loadMoreDebtRows(event)'))
  fail('studentsRenderer.js nút BÁO NỢ chưa gọi window.loadMoreDebtRows(event)');
else ok('studentsRenderer.js debt button calls window.loadMoreDebtRows(event)');

// 7. loadMoreActiveStudents dùng preserveScrollDuringListUpdate
if (!students.includes('loadMoreActiveStudents = async function') || !students.includes('preserveScrollDuringListUpdate'))
  fail('loadMoreActiveStudents không phải async hoặc không dùng preserveScrollDuringListUpdate');
else ok('loadMoreActiveStudents is async + uses preserveScrollDuringListUpdate');

// 8. students.events.js gọi preventDefault cho pgNext_students_active
if (!eventsJs.includes('e.preventDefault()') || !eventsJs.includes('pgNext_students_active'))
  fail('students.events.js không gọi preventDefault cho pgNext_students_active');
else ok('students.events.js calls preventDefault for pgNext_students_active');

// 9. debugLoadMoreScrollState defined
if (!students.includes('window.debugLoadMoreScrollState'))
  fail('students.js thiếu window.debugLoadMoreScrollState');
else ok('debugLoadMoreScrollState defined');

// 10. __loadMoreLock guard exists in loadMoreDebtRows
if (!students.includes('__loadMoreLock.debt'))
  fail('loadMoreDebtRows thiếu __loadMoreLock guard chống double click');
else ok('loadMoreDebtRows has __loadMoreLock.debt guard');

if (!students.includes('__loadMoreLock.active'))
  fail('loadMoreActiveStudents thiếu __loadMoreLock guard chống double click');
else ok('loadMoreActiveStudents has __loadMoreLock.active guard');

// Tổng kết
console.log(`\n${'─'.repeat(55)}`);
if (failures === 0) {
  console.log('✅ check-loadmore-scroll-preservation: TẤT CẢ PASS');
} else {
  console.error(`❌ check-loadmore-scroll-preservation: ${failures} lỗi`);
  process.exit(1);
}
