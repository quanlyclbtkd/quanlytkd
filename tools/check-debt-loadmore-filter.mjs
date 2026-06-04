/**
 * check-debt-loadmore-filter.mjs
 * Phase 4K-5J-1: Kiểm tra debt load more ngoài pgStudentsActive + overdue filter
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
const html      = readFileSync(join(root, 'index.html'), 'utf8');

// 1. debtOverdueFilter element in HTML or injected via JS
const hasFilterInHtml = html.includes('id="debtOverdueFilter"');
const hasFilterInJs   = students.includes('ensureDebtOverdueFilterUI');
if (!hasFilterInHtml && !hasFilterInJs)
  fail('debtOverdueFilter không có trong index.html cũng không có JS inject');
else ok('debtOverdueFilter có trong ' + (hasFilterInHtml ? 'index.html' : 'JS'));

// 2. getDebtOverdueFilterValue defined
if (!students.includes('window.getDebtOverdueFilterValue'))
  fail('students.js thiếu window.getDebtOverdueFilterValue');
else ok('getDebtOverdueFilterValue defined');

// 3. bindDebtOverdueFilter defined
if (!students.includes('window.bindDebtOverdueFilter'))
  fail('students.js thiếu window.bindDebtOverdueFilter');
else ok('bindDebtOverdueFilter defined');

// 4. studentsRenderer debt load more KHÔNG nằm trong if (!pgStudentsActive) block
// Check: debt load more must exist OUTSIDE the pgStudentsActive guard
// The key signal: buildDebt + _debtTotalCount > _debtRendered without pgStudentsActive wrapper
const debtOutsideGuard = renderer.includes("buildDebt && _debtTotalCount > _debtRendered") &&
  !renderer.match(/if\s*\(\s*!pgStudentsActive\s*\)\s*\{[^}]*buildDebt.*_debtTotalCount.*loadMoreDebtRows/s);
if (!debtOutsideGuard)
  fail('studentsRenderer.js còn đặt debt load more trong if (!pgStudentsActive)');
else ok('debt load more nằm ngoài if (!pgStudentsActive)');

// 5. Debt load more gọi window.loadMoreDebtRows(event)
if (!renderer.includes("window.loadMoreDebtRows(event)"))
  fail('studentsRenderer.js debt load more không gọi window.loadMoreDebtRows(event)');
else ok('debt load more gọi window.loadMoreDebtRows(event)');

// 6. loadMoreDebtRows tăng __debtRenderLimit
if (!students.includes('window.__debtRenderLimit = (window.__debtRenderLimit || 50) + inc'))
  fail('loadMoreDebtRows không tăng __debtRenderLimit');
else ok('loadMoreDebtRows increments __debtRenderLimit');

// 7. loadMoreDebtRows gọi cả refreshListsComputation VÀ invalidateList
const lmdrStart = students.indexOf('window.loadMoreDebtRows = async');
const lmdrEnd   = students.indexOf('window.loadMoreActiveStudents = async');
const lmdrBlock = lmdrStart >= 0 && lmdrEnd > lmdrStart
  ? students.slice(lmdrStart, lmdrEnd)
  : '';
if (!lmdrBlock.includes('refreshListsComputation') || !lmdrBlock.includes('invalidateList'))
  fail('loadMoreDebtRows phải gọi cả refreshListsComputation VÀ invalidateList');
else ok('loadMoreDebtRows gọi cả refreshListsComputation + invalidateList');

// 8. debugDebtLoadMoreAndFilter defined
if (!students.includes('window.debugDebtLoadMoreAndFilter'))
  fail('students.js thiếu window.debugDebtLoadMoreAndFilter');
else ok('debugDebtLoadMoreAndFilter defined');

// 9. overdue filter applied in renderer
if (!renderer.includes('getDebtOverdueFilterValue'))
  fail('studentsRenderer.js không apply getDebtOverdueFilterValue trong debt counting');
else ok('studentsRenderer.js áp dụng getDebtOverdueFilterValue');

// Tổng kết
console.log(`\n${'─'.repeat(55)}`);
if (failures === 0) {
  console.log('✅ check-debt-loadmore-filter: TẤT CẢ PASS');
} else {
  console.error(`❌ check-debt-loadmore-filter: ${failures} lỗi`);
  process.exit(1);
}
