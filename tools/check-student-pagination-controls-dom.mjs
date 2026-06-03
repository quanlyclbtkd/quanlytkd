/**
 * tools/check-student-pagination-controls-dom.mjs
 * ─────────────────────────────────────────────────
 * Fail nếu:
 *   1. pgWrap_activeList được insert bên trong TABLE (invalid HTML).
 *   2. Có duplicate id pgNext_students (shared prefix cho cả 2 lists).
 *   3. Không có unique id pgNext_students_active.
 *   4. Handler aliases (_pgNext_students_active, _pgNext_students_quit) chưa được định nghĩa.
 *
 * Chạy: node tools/check-student-pagination-controls-dom.mjs
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
console.log('  check:student-pagination-controls-dom');
console.log('══════════════════════════════════════════════════════════\n');

const studentsJs  = readFile('js/modules/students.js');
const paginationJs = readFile('js/utils/pagination.js');

console.log('▸ Section 1: _injectControls — DOM insertion an toàn ngoài TABLE');
if (studentsJs) {
    check(
        '_injectControls dùng tbody.closest(\'table\') để tìm table element',
        studentsJs.includes("tbody.closest") && studentsJs.includes("'table'"),
        "_injectControls phải: const tbl = tbody.closest('table') || tbody.parentElement;"
    );

    check(
        '_injectControls insert ctrlEl SAU table/anchor, không inside tbody',
        studentsJs.includes('anchor.nextSibling') || studentsJs.includes('tbl.nextSibling'),
        '_injectControls phải: parent.insertBefore(ctrlEl, anchor.nextSibling) — không table.parentNode.insertBefore(ctrlEl, table.nextSibling) khi table là tbody'
    );

    check(
        'Không còn tạo html với prefix "students" cho cả 2 lists (fixed to per-list prefix)',
        !(studentsJs.includes("renderPaginationControls(pgState, 'students', from") ||
          studentsJs.includes('renderPaginationControls(pgState, "students", from')),
        "_injectControls phải dùng prefix riêng ('students_active' / 'students_quit') không phải 'students'"
    );

    check(
        '_injectControls dùng prefix students_active cho activeList',
        studentsJs.includes("'students_active'") || studentsJs.includes('"students_active"'),
        "_injectControls phải: const prefix = listId === 'activeList' ? 'students_active' : 'students_quit';"
    );

    check(
        '_injectControls dùng prefix students_quit cho quitList',
        studentsJs.includes("'students_quit'") || studentsJs.includes('"students_quit"'),
        "_injectControls phải: prefix = 'students_quit' cho quitList"
    );
}

console.log('\n▸ Section 2: Handler aliases cho unique prefix IDs');
if (studentsJs) {
    check(
        'window._pgNext_students_active được define',
        studentsJs.includes('window._pgNext_students_active'),
        'Thêm: window._pgNext_students_active = window._pgNext_students;'
    );

    check(
        'window._pgPrev_students_active được define',
        studentsJs.includes('window._pgPrev_students_active'),
        'Thêm: window._pgPrev_students_active = window._pgPrev_students;'
    );

    check(
        'window._pgNext_students_quit được define',
        studentsJs.includes('window._pgNext_students_quit'),
        'Thêm: window._pgNext_students_quit = window._pgNext_students;'
    );

    check(
        'window._pgPrev_students_quit được define',
        studentsJs.includes('window._pgPrev_students_quit'),
        'Thêm: window._pgPrev_students_quit = window._pgPrev_students;'
    );
}

console.log('\n▸ Section 3: debugStudentPagination tồn tại');
if (studentsJs) {
    check(
        'window.debugStudentPagination được define',
        studentsJs.includes('window.debugStudentPagination'),
        'Thêm: window.debugStudentPagination = async function debugStudentPagination() {...}'
    );

    check(
        'debugStudentPagination kiểm tra duplicateOldNextButtons',
        studentsJs.includes('duplicateOldNextButtons'),
        'debugStudentPagination phải có: duplicateOldNextButtons: document.querySelectorAll(\'#pgNext_students\').length'
    );

    check(
        'debugStudentPagination kiểm tra nextActiveBtnHTML (unique id)',
        studentsJs.includes('nextActiveBtnHTML') || studentsJs.includes('pgNext_students_active'),
        'debugStudentPagination phải check: pgNext_students_active element tồn tại'
    );
}

console.log('\n▸ Section 4: Debug state tracking sau processPage');
if (studentsJs) {
    check(
        '_lastSnapSize được gán sau processPage',
        studentsJs.includes('_lastSnapSize'),
        'Sau processPage: pgState._lastSnapSize = snap.docs ? snap.docs.length : 0;'
    );

    check(
        '_lastHasNext được gán sau processPage',
        studentsJs.includes('_lastHasNext'),
        'Sau processPage: pgState._lastHasNext = pgState.hasNext;'
    );

    check(
        '_lastCursorId được gán sau processPage',
        studentsJs.includes('_lastCursorId'),
        'Sau processPage: pgState._lastCursorId = pgState.lastVisible?.id || \'\';'
    );
}

console.log('\n══════════════════════════════════════════════════════════');
console.log('  Total: ' + (pass + fail) + ' | ✅ ' + pass + ' | ❌ ' + fail);
if (fail > 0) {
    errors.forEach(e => console.error('  ❌ ' + e));
    console.log('══════════════════════════════════════════════════════════\n');
    process.exit(1);
} else {
    console.log('\n  🎉 Student pagination controls DOM checks passed!');
    console.log('══════════════════════════════════════════════════════════\n');
}
