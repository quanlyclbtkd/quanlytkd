/**
 * tools/check-student-pagination-render-order.mjs
 * ─────────────────────────────────────────────────
 * Fail nếu trong js/modules/students.js:
 *   1. invalidateStudents('students-pagination') xuất hiện TRƯỚC
 *      refreshListComputation/refreshListsComputation trong cùng luồng _doLoad
 *   2. hoặc setTimeout fallback render là đường chính thay vì chỉ fallback
 *
 * Chạy: node tools/check-student-pagination-render-order.mjs
 */
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

function readFile(p) {
    try { return readFileSync(resolve(root, p), 'utf8'); } catch (_) { return null; }
}

let pass = 0, fail = 0;
const errors = [];

function check(label, condition, hint) {
    if (condition) { console.log('  ✅ ' + label); pass++; }
    else { console.error('  ❌ ' + label); if (hint) console.error('     → ' + hint); fail++; errors.push(label); }
}

console.log('\n══════════════════════════════════════════════════════════');
console.log('  check:student-pagination-render-order');
console.log('══════════════════════════════════════════════════════════\n');

const studentsJs = readFile('js/modules/students.js');

if (!studentsJs) {
    console.error('  ❌ Không đọc được js/modules/students.js');
    process.exit(1);
}

console.log('▸ Section 1: Thứ tự refreshListComputation TRƯỚC invalidateStudents');

// Tìm vị trí của các lệnh quan trọng trong file
const idxRefreshLists = studentsJs.indexOf('window.refreshListsComputation');
const idxRefreshSingle = studentsJs.indexOf('window.refreshListComputation');
const idxInvalidateStudents = studentsJs.indexOf("window.invalidateStudents('students-pagination')");
const idxInvalidateList = studentsJs.indexOf("window.invalidateList('students.activeList'");

// refreshListsComputation/refreshListComputation phải xuất hiện TRƯỚC invalidateStudents
const hasRefreshBefore = (
    (idxRefreshLists !== -1 && (idxInvalidateStudents === -1 || idxRefreshLists < idxInvalidateStudents)) ||
    (idxRefreshSingle !== -1 && (idxInvalidateStudents === -1 || idxRefreshSingle < idxInvalidateStudents))
);

check(
    'refreshListsComputation hoặc refreshListComputation xuất hiện TRƯỚC invalidateStudents',
    hasRefreshBefore,
    'PHẦN 3 FIX: Đổi thứ tự: refreshListsComputation/refreshListComputation phải gọi TRƯỚC invalidateStudents'
);

// invalidateStudents với arg 'students-pagination' (không arg, không phải 'students-pagination')
// không nên là lệnh invalidate chính trong _doLoad
check(
    'Không còn invalidateStudents("students-pagination") là lệnh duy nhất invalidate',
    !studentsJs.includes("window.invalidateStudents('students-pagination')") ||
    (idxInvalidateList !== -1 && idxInvalidateList < studentsJs.indexOf("window.invalidateStudents('students-pagination')")),
    "PHẦN 3 FIX: invalidateStudents('students-pagination') không nên chạy TRƯỚC invalidateList"
);

console.log('\n▸ Section 2: refreshListsComputation có trong luồng _doLoad');

check(
    'window.refreshListsComputation hoặc refreshListComputation được gọi trong _doLoad',
    studentsJs.includes('window.refreshListsComputation') ||
    studentsJs.includes('window.refreshListComputation'),
    "Thêm: if (typeof window.refreshListsComputation === 'function') { window.refreshListsComputation(keys, 'students-pagination-loaded'); }"
);

check(
    'Gọi refresh với keys mảng bao gồm students.activeList và dashboard.summary',
    studentsJs.includes("'students.activeList'") && studentsJs.includes("'dashboard.summary'"),
    "keys phải bao gồm ['students.activeList', 'dashboard.summary']"
);

console.log('\n▸ Section 3: Fallback setTimeout chỉ là fallback, không phải đường chính');

check(
    '_renderStudentsPageRowsFallback chỉ được gọi trong setTimeout (fallback)',
    studentsJs.includes('setTimeout') && studentsJs.includes('_renderStudentsPageRowsFallback'),
    "_renderStudentsPageRowsFallback phải chỉ là fallback sau 300ms, không phải đường render chính"
);

console.log('\n══════════════════════════════════════════════════════════');
console.log('  Total: ' + (pass + fail) + ' | ✅ ' + pass + ' | ❌ ' + fail);
if (fail > 0) {
    errors.forEach(e => console.error('  ❌ ' + e));
    console.log('══════════════════════════════════════════════════════════\n');
    process.exit(1);
} else {
    console.log('\n  🎉 Student pagination render order checks passed!');
    console.log('══════════════════════════════════════════════════════════\n');
}
