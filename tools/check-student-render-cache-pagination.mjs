/**
 * tools/check-student-render-cache-pagination.mjs — Phase 4K-STUDENT-RENDER-OVERWRITE-FIX
 * ─────────────────────────────────────────────────────────────────────────────
 * Kiểm tra computeAndCacheStudents() cache key bao gồm pagination version/count/page:
 * 1. paramsKey có pgv:${pgVersion} — pagination version
 * 2. paramsKey có pgc:${pgCount}  — pagination item count
 * 3. paramsKey có pgp:${pgPage}   — pagination page number
 * 4. _studentsPaginationVersion được tăng sau mỗi _doLoad() thành công
 * 5. getStudentsCacheMetrics() được export từ studentsRenderer.js
 * 6. window.getStudentsCacheMetrics được expose từ registerStudentsLegacyGlobals()
 *
 * Chạy: node tools/check-student-render-cache-pagination.mjs
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
console.log('  Student Render Cache-Pagination Check — Phase 4K-STUDENT-RENDER-OVERWRITE-FIX');
console.log('══════════════════════════════════════════════════════════\n');

const rendererJs  = readFile('js/ui/render/computation/studentsRenderer.js');
const studentsJs  = readFile('js/modules/students.js');
const renderStuJs = readFile('js/ui/render/renderStudents.js');

if (!rendererJs) { console.error('  ❌ FATAL: studentsRenderer.js không tìm thấy'); process.exit(1); }

console.log('▸ Section 1: Cache key có pagination version/count/page');
check('paramsKey có pgv:${pgVersion} — pagination version',
    rendererJs.includes('pgv:${pgVersion}') || rendererJs.includes('pgv:') && rendererJs.includes('pgVersion'),
    "Thêm vào paramsKey: |pgv:${pgVersion}");

check('paramsKey có pgc:${pgCount} — pagination item count',
    rendererJs.includes('pgc:${pgCount}') || rendererJs.includes('pgc:') && rendererJs.includes('pgCount'),
    "Thêm vào paramsKey: |pgc:${pgCount}");

check('paramsKey có pgp:${pgPage} — pagination page number',
    rendererJs.includes('pgp:${pgPage}') || rendererJs.includes('pgp:') && rendererJs.includes('pgPage'),
    "Thêm vào paramsKey: |pgp:${pgPage}");

check('_studentsPaginationVersion được đọc trong computeAndCacheStudents',
    rendererJs.includes('_studentsPaginationVersion') || rendererJs.includes('pgVersion'),
    'Thêm: const pgVersion = (window.__store || {})._studentsPaginationVersion || 0;');

console.log();
console.log('▸ Section 2: _studentsPaginationVersion tăng sau _doLoad()');
if (!studentsJs) {
    console.error('  ❌ FATAL: students.js không tìm thấy'); errors.push('students.js missing');
} else {
    check('students.js tăng _studentsPaginationVersion sau load thành công',
        studentsJs.includes('_studentsPaginationVersion') &&
        (studentsJs.includes('_studentsPaginationVersion + 1') ||
         studentsJs.includes('_studentsPaginationVersion || 0) + 1')),
        'Sau store.pagination.students = pgState: window.__store._studentsPaginationVersion = (... || 0) + 1');

    check('students.js tăng _dataVersion đồng thời với _studentsPaginationVersion',
        studentsJs.includes('_studentsPaginationVersion') &&
        studentsJs.includes('_dataVersion') &&
        (studentsJs.includes('_dataVersion || 0) + 1') || studentsJs.includes('_dataVersion + 1')),
        'Cũng tăng: window.__store._dataVersion = (... || 0) + 1');
}

console.log();
console.log('▸ Section 3: getStudentsCacheMetrics() export + window expose');
check('studentsRenderer.js export getStudentsCacheMetrics()',
    rendererJs.includes('export function getStudentsCacheMetrics'),
    'Thêm: export function getStudentsCacheMetrics() { return { activeRowsLength, ... }; }');

check('getStudentsCacheMetrics trả activeRowsLength (length của _cache.activeRows)',
    rendererJs.includes('activeRowsLength') && rendererJs.includes('_cache.activeRows'),
    'Trong getStudentsCacheMetrics: activeRowsLength: typeof _cache.activeRows === \'string\' ? _cache.activeRows.length : -1');

if (!renderStuJs) {
    console.error('  ❌ FATAL: renderStudents.js không tìm thấy'); errors.push('renderStudents.js missing');
} else {
    check('renderStudents.js import getStudentsCacheMetrics từ studentsRenderer',
        renderStuJs.includes('getStudentsCacheMetrics') &&
        renderStuJs.includes('./computation/studentsRenderer.js'),
        'Thêm getStudentsCacheMetrics vào import từ studentsRenderer.js');

    check('registerStudentsLegacyGlobals expose window.getStudentsCacheMetrics',
        renderStuJs.includes('window.getStudentsCacheMetrics = getStudentsCacheMetrics'),
        'Trong registerStudentsLegacyGlobals(): window.getStudentsCacheMetrics = getStudentsCacheMetrics;');
}

console.log();
console.log('══════════════════════════════════════════════════════════');
const total = pass + errors.length;
console.log('  Total: ' + total + ' | ✅ ' + pass + ' | ❌ ' + errors.length);
if (errors.length > 0) {
    errors.forEach(e => console.error('  ❌ ' + e));
    console.error('\n  ⚠️  Cache key thiếu pagination version — cache stale có thể giữ activeRows rỗng!');
    console.log('══════════════════════════════════════════════════════════\n');
    process.exit(1);
} else {
    console.log('\n  🎉 Student render cache-pagination checks passed!');
    console.log('  Cache key sẽ invalidate đúng khi pagination load xong.');
    console.log('══════════════════════════════════════════════════════════\n');
}
