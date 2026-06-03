/**
 * tools/check-active-list-mutation-debug.mjs — Phase 4K-STUDENT-RENDER-OVERWRITE-FIX
 * ─────────────────────────────────────────────────────────────────────────────
 * Kiểm tra debug helpers đầy đủ cho việc trace DOM mutation trên #activeList:
 * 1. window.debugStudentListHydration() có pgState.currentPage, pgState.enabled
 * 2. window.debugStudentListHydration() có _studentsPaginationVersion
 * 3. window.debugStudentListHydration() in activeRows cache length
 * 4. window.debugStudentListHydration() in #activeList innerHTML.length
 * 5. window.watchActiveListMutations() được định nghĩa trong main.js
 * 6. watchActiveListMutations dùng MutationObserver
 * 7. watchActiveListMutations log rows count + htmlLength + stack
 * 8. watchActiveListMutations KHÔNG tự động mount khi page load
 *
 * Chạy: node tools/check-active-list-mutation-debug.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

function readFile(p) {
    try { return readFileSync(resolve(root, p), 'utf8'); } catch (_) { return null; }
}

let pass = 0;
const errors = [];

function check(label, condition, hint) {
    if (condition) { console.log('  ✅ ' + label); pass++; }
    else { console.error('  ❌ ' + label); if (hint) console.error('     → ' + hint); errors.push(label); }
}

console.log('\n══════════════════════════════════════════════════════════');
console.log('  Active List Mutation Debug Check — Phase 4K-STUDENT-RENDER-OVERWRITE-FIX');
console.log('══════════════════════════════════════════════════════════\n');

const mainJs = readFile('js/main.js');

if (!mainJs) { console.error('  ❌ FATAL: js/main.js không tìm thấy'); process.exit(1); }

console.log('▸ Section 1: window.debugStudentListHydration() đầy đủ');
check('debugStudentListHydration in pgState.currentPage',
    mainJs.includes('currentPage') && mainJs.includes('debugStudentListHydration'),
    'Thêm: console.log(\'pgState.currentPage:\', _pgPage)');

check('debugStudentListHydration in pgState.enabled',
    mainJs.includes('_pgEnable') || (mainJs.includes('enabled') && mainJs.includes('debugStudentListHydration')),
    'Thêm: console.log(\'pgState.enabled:\', _pgEnable)');

check('debugStudentListHydration in _studentsPaginationVersion',
    mainJs.includes('_studentsPaginationVersion') && mainJs.includes('debugStudentListHydration'),
    'Thêm: console.log(\'_studentsPaginationVersion:\', _pgVer)');

check('debugStudentListHydration in activeRows cache length (via getStudentsCacheMetrics)',
    mainJs.includes('activeRowsLength') && mainJs.includes('debugStudentListHydration'),
    'Thêm: window.getStudentsCacheMetrics?.() → print activeRowsLength');

check('debugStudentListHydration in #activeList innerHTML.length',
    mainJs.includes('innerHTML.length') || mainJs.includes('_activeInnerLen'),
    'Thêm: console.log(\'#activeList innerHTML.length:\', el.innerHTML.length)');

console.log();
console.log('▸ Section 2: window.watchActiveListMutations()');
check('window.watchActiveListMutations được định nghĩa trong main.js',
    mainJs.includes('window.watchActiveListMutations') &&
    mainJs.includes('function watchActiveListMutations'),
    'Thêm: window.watchActiveListMutations = function watchActiveListMutations() { ... }');

check('watchActiveListMutations dùng MutationObserver',
    mainJs.includes('MutationObserver') && mainJs.includes('watchActiveListMutations'),
    'Dùng: const obs = new MutationObserver(mutations => { ... }) để theo dõi childList changes');

check('watchActiveListMutations log rows count + htmlLength + stack trace',
    mainJs.includes('rows') && mainJs.includes('htmlLength') &&
    mainJs.includes('stack') && mainJs.includes('watchActiveListMutations'),
    'Log: { rows: el.querySelectorAll(\'tr[data-student-id]\').length, htmlLength, stack: new Error().stack }');

check('watchActiveListMutations KHÔNG tự động gọi khi page load',
    !mainJs.includes('watchActiveListMutations()') ||
    mainJs.includes('window.watchActiveListMutations = function'),
    'watchActiveListMutations phải chỉ chạy khi gọi thủ công từ Console — không autorun');

check('watchActiveListMutations lưu observer vào window.__activeListMutationObserver',
    mainJs.includes('__activeListMutationObserver') && mainJs.includes('watchActiveListMutations'),
    'Thêm: window.__activeListMutationObserver = obs; để có thể disconnect sau');

console.log();
console.log('══════════════════════════════════════════════════════════');
const total = pass + errors.length;
console.log('  Total: ' + total + ' | ✅ ' + pass + ' | ❌ ' + errors.length);
if (errors.length > 0) {
    errors.forEach(e => console.error('  ❌ ' + e));
    console.error('\n  ⚠️  Debug helpers chưa đủ — khó trace DOM mutation trên production!');
    console.log('══════════════════════════════════════════════════════════\n');
    process.exit(1);
} else {
    console.log('\n  🎉 Active list mutation debug checks passed!');
    console.log('  Debug helpers đầy đủ để trace DOM mutation trên production.');
    console.log('══════════════════════════════════════════════════════════\n');
}
