/**
 * tools/check-student-row-render-fallback.mjs — Phase 4K-STUDENT-LIST
 * ─────────────────────────────────────────────────────────────────────────────
 * Kiểm tra StudentPagination có fallback render rows vào #activeList:
 * 1. _doLoad() gọi refreshListComputation / invalidateList sau pagination load
 * 2. Có fallback function _renderStudentsPageRowsFallback (hoặc tương đương)
 * 3. Fallback có guard tr[data-student-id] — không override island đã render
 * 4. Fallback có try/catch (non-blocking)
 * 5. setTimeout fallback để chờ island render (300ms)
 * 6. window.debugStudentListHydration tồn tại trong main.js
 *
 * Chạy: node tools/check-student-row-render-fallback.mjs
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
console.log('  Student Row Render Fallback Check — Phase 4K-STUDENT-LIST');
console.log('══════════════════════════════════════════════════════════\n');

const studentsJs = readFile('js/modules/students.js');
const mainJs     = readFile('js/main.js');

if (!studentsJs) {
    console.error('  ❌ FATAL: js/modules/students.js không tìm thấy');
    process.exit(1);
}

console.log('▸ Section 1: _doLoad() invalidation sau pagination load');
check('_doLoad() gọi invalidateList("students.activeList") sau load',
    studentsJs.includes("invalidateList('students.activeList'") ||
    studentsJs.includes('invalidateList(\'students.activeList\'') ||
    studentsJs.includes('"students.activeList"'),
    "Thêm: window.invalidateList?.('students.activeList', 'students-pagination-loaded')");

check('_doLoad() gọi refreshListComputation sau load',
    studentsJs.includes('refreshListComputation') &&
    studentsJs.includes('students-pagination-loaded'),
    "Thêm: window.refreshListComputation?.('students.activeList', 'students-pagination-loaded')");

console.log();
console.log('▸ Section 2: Fallback render function');
check('Có _renderStudentsPageRowsFallback hoặc tương đương',
    studentsJs.includes('_renderStudentsPageRowsFallback') ||
    studentsJs.includes('renderStudentsPageRowsFallback'),
    'Thêm: function _renderStudentsPageRowsFallback(pgState) { ... }');

check('Fallback có guard tr[data-student-id] — không override island đã render',
    studentsJs.includes('tr[data-student-id]') ||
    studentsJs.includes('data-student-id'),
    'Guard: if (target.querySelector(\'tr[data-student-id]\')) return false;');

check('Fallback có try/catch (non-blocking)',
    (studentsJs.includes('_renderStudentsPageRowsFallback') ||
     studentsJs.includes('renderStudentsPageRowsFallback')) &&
    studentsJs.includes('} catch (_fe') ||
    studentsJs.includes('} catch (_e') ||
    studentsJs.includes('} catch (') &&
    studentsJs.includes('return false'),
    'Wrap fallback body trong try/catch để không crash pagination');

check('setTimeout fallback để chờ island render (≥200ms)',
    studentsJs.includes('setTimeout(') &&
    (studentsJs.includes('_renderStudentsPageRowsFallback') ||
     studentsJs.includes('renderStudentsPageRowsFallback')),
    'setTimeout(() => _renderStudentsPageRowsFallback(pgState), 300);');

console.log();
console.log('▸ Section 3: window.debugStudentListHydration trong main.js');
if (!mainJs) {
    console.error('  ❌ FATAL: js/main.js không tìm thấy');
    errors.push('main.js không tìm thấy');
} else {
    check('window.debugStudentListHydration được định nghĩa trong main.js',
        mainJs.includes('window.debugStudentListHydration') ||
        mainJs.includes('debugStudentListHydration'),
        'Thêm: window.debugStudentListHydration = async function debugStudentListHydration() { ... }');

    check('debugStudentListHydration in pgState.currentItems.length',
        mainJs.includes('currentItems') && mainJs.includes('debugStudentListHydration'),
        'debugStudentListHydration phải in pgState.currentItems.length');

    check('debugStudentListHydration in #activeList tr[data-student-id] count',
        mainJs.includes('tr[data-student-id]') && mainJs.includes('debugStudentListHydration'),
        'debugStudentListHydration phải in querySelectorAll(\'#activeList tr[data-student-id]\').length');

    check('debugStudentListHydration gọi retryDataHydration hoặc invalidateList khi DOM trống',
        mainJs.includes('retryDataHydration') && mainJs.includes('debugStudentListHydration'),
        'debugStudentListHydration: nếu items > 0 nhưng DOM = 0, gọi retryDataHydration hoặc invalidateList');
}

console.log();
console.log('══════════════════════════════════════════════════════════');
const total = pass + errors.length;
console.log('  Total: ' + total + ' | ✅ ' + pass + ' | ❌ ' + errors.length);
if (errors.length > 0) {
    errors.forEach(e => console.error('  ❌ ' + e));
    console.error('\n  ⚠️  Fallback render chưa đủ — UI có thể vẫn trống khi island miss!');
    console.log('══════════════════════════════════════════════════════════\n');
    process.exit(1);
} else {
    console.log('\n  🎉 Student row render fallback checks passed!');
    console.log('  _renderStudentsPageRowsFallback bảo vệ khi island miss.');
    console.log('══════════════════════════════════════════════════════════\n');
}
