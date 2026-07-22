/**
 * tools/check-active-island-preserve-pagination.mjs — Phase 4K-STUDENT-RENDER-OVERWRITE-FIX
 * ─────────────────────────────────────────────────────────────────────────────
 * Kiểm tra renderActiveIsland() không xóa #activeList khi cache rỗng nhưng pagination có items:
 * 1. renderActiveIsland() có guard pagination state trước khi clear DOM
 * 2. Có kiểm tra pgState.enabled && pgState.currentItems.length > 0
 * 3. Nếu cache rỗng nhưng pagination có items → dùng buildStudentsRowsFromPagination
 * 4. Nếu builder không có → preserve DOM (return sớm, không clear)
 * 5. renderQuitIsland() có guard tương tự
 * 6. _applyHtml(el, '') KHÔNG được gọi khi pagination có items
 * 7. window.buildStudentsRowsFromPagination được expose trong students.js
 *
 * Chạy: node tools/check-active-island-preserve-pagination.mjs
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
console.log('  Active Island Preserve Pagination Check — Phase 4K-STUDENT-RENDER-OVERWRITE-FIX');
console.log('══════════════════════════════════════════════════════════\n');

const renderStuJs = readFile('js/ui/render/renderStudents.js');
const studentsJs  = readFile('js/modules/students.js');

if (!renderStuJs) { console.error('  ❌ FATAL: renderStudents.js không tìm thấy'); process.exit(1); }

console.log('▸ Section 1: renderActiveIsland() guard khi cache rỗng');
check('renderActiveIsland() không gọi _applyHtml trực tiếp với getStudentsCachedHtml (đã có guard)',
    !(renderStuJs.includes("_applyHtml(document.getElementById('activeList'), getStudentsCachedHtml('activeRows'))")),
    "renderActiveIsland() phải đọc cache vào biến, kiểm tra pagination state trước khi apply");

check('renderActiveIsland() kiểm tra pgState.enabled && currentItems.length > 0',
    renderStuJs.includes('_hasPgItems') ||
    (renderStuJs.includes('enabled') && renderStuJs.includes('currentItems') && renderStuJs.includes('renderActiveIsland')),
    'Thêm: const _hasPgItems = _pgState?.enabled && Array.isArray(_pgState.currentItems) && _pgState.currentItems.length > 0;');

check('renderActiveIsland() dùng buildStudentsRowsFromPagination khi cache rỗng',
    renderStuJs.includes('buildStudentsRowsFromPagination') &&
    renderStuJs.includes('renderActiveIsland'),
    'Thêm: const _fbHtml = typeof window.buildStudentsRowsFromPagination === \'function\' ? window.buildStudentsRowsFromPagination(...) : \'\';');

check('renderActiveIsland() return sớm (không clear DOM) khi pagination có items',
    renderStuJs.includes('Preserving existing DOM rows') ||
    (renderStuJs.includes('return;') && renderStuJs.includes('_hasPgItems')),
    'Thêm guard: if (_hasPgItems) { ... return; } // không clear DOM');

console.log();
console.log('▸ Section 2: renderQuitIsland() guard tương tự');
check('renderQuitIsland() có guard nguồn dữ liệu trước khi clear DOM',
    renderStuJs.includes('_hasQuitItems') ||
    (renderStuJs.includes('renderQuitIsland') && renderStuJs.includes('_quitPagActive')) ||
    (renderStuJs.includes('if (window.QuitProfileBoundary)') && renderStuJs.includes('_buildAuthoritativeQuitRows') && !renderStuJs.includes("_applyHtml(target, getStudentsCachedHtml('quitRows'))")),
    'renderQuitIsland() phải bảo toàn pagination legacy hoặc dùng QuitProfileBoundary authoritative single source.');

console.log();
console.log('▸ Section 3: window.buildStudentsRowsFromPagination trong students.js');
if (!studentsJs) {
    console.error('  ❌ FATAL: students.js không tìm thấy'); errors.push('students.js missing');
} else {
    check('students.js expose window.buildStudentsRowsFromPagination',
        studentsJs.includes('window.buildStudentsRowsFromPagination') &&
        studentsJs.includes('function buildStudentsRowsFromPagination'),
        'Thêm: window.buildStudentsRowsFromPagination = function buildStudentsRowsFromPagination(items, mode) { ... }');

    check('buildStudentsRowsFromPagination tạo tr[data-student-id] rows',
        studentsJs.includes('data-student-id') && studentsJs.includes('buildStudentsRowsFromPagination'),
        'Builder phải tạo: <tr data-student-id="...">...</tr>');

    check('buildStudentsRowsFromPagination có try/catch (non-blocking)',
        studentsJs.includes('buildStudentsRowsFromPagination') &&
        (studentsJs.includes('} catch (_be)') || studentsJs.includes('} catch (_e')),
        'Wrap trong try/catch để không crash island render');

    check('buildStudentsRowsFromPagination có HTML escaping an toàn',
        studentsJs.includes('buildStudentsRowsFromPagination') &&
        (studentsJs.includes('&amp;') || studentsJs.includes('_esc') || studentsJs.includes('replace(/&/')),
        'Dùng HTML escaping cho name: .replace(/&/g, \'&amp;\').replace(/</g, \'&lt;\')...');
}

console.log();
console.log('══════════════════════════════════════════════════════════');
const total = pass + errors.length;
console.log('  Total: ' + total + ' | ✅ ' + pass + ' | ❌ ' + errors.length);
if (errors.length > 0) {
    errors.forEach(e => console.error('  ❌ ' + e));
    console.error('\n  ⚠️  Island vẫn có thể clear #activeList khi cache rỗng — bug chưa fix!');
    console.log('══════════════════════════════════════════════════════════\n');
    process.exit(1);
} else {
    console.log('\n  🎉 Active island preserve pagination checks passed!');
    console.log('  renderActiveIsland() bảo toàn DOM khi cache rỗng nhưng pagination có items.');
    console.log('══════════════════════════════════════════════════════════\n');
}
