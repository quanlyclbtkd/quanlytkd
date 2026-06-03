/**
 * tools/check-pagination-version-invalidation.mjs — Phase 4K-STUDENT-RENDER-OVERWRITE-FIX
 * ─────────────────────────────────────────────────────────────────────────────
 * Kiểm tra invalidation chain hoàn chỉnh sau khi StudentPagination load thành công:
 * 1. _doLoad() tăng _studentsPaginationVersion
 * 2. _doLoad() tăng _dataVersion
 * 3. _doLoad() gọi invalidateStudents / invalidateList
 * 4. _doLoad() gọi refreshListComputation
 * 5. _doLoad() có setTimeout fallback render
 * 6. Cache key trong computeAndCacheStudents bao gồm pgVersion
 * 7. pgStudents?.currentItems?.length được đọc để tính pgCount trong cache key
 *
 * Chạy: node tools/check-pagination-version-invalidation.mjs
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
console.log('  Pagination Version Invalidation Check — Phase 4K-STUDENT-RENDER-OVERWRITE-FIX');
console.log('══════════════════════════════════════════════════════════\n');

const studentsJs  = readFile('js/modules/students.js');
const rendererJs  = readFile('js/ui/render/computation/studentsRenderer.js');

if (!studentsJs) { console.error('  ❌ FATAL: students.js không tìm thấy'); process.exit(1); }
if (!rendererJs) { console.error('  ❌ FATAL: studentsRenderer.js không tìm thấy'); process.exit(1); }

console.log('▸ Section 1: _doLoad() invalidation chain đầy đủ');
check('_doLoad() tăng _studentsPaginationVersion sau load thành công',
    studentsJs.includes('_studentsPaginationVersion') &&
    (studentsJs.includes('_studentsPaginationVersion || 0) + 1') ||
     studentsJs.includes('_studentsPaginationVersion + 1')),
    'Thêm: window.__store._studentsPaginationVersion = (window.__store._studentsPaginationVersion || 0) + 1;');

check('_doLoad() tăng _dataVersion sau load thành công',
    studentsJs.includes('_dataVersion') &&
    (studentsJs.includes('_dataVersion || 0) + 1') ||
     studentsJs.includes('_dataVersion + 1')),
    'Thêm: window.__store._dataVersion = (window.__store._dataVersion || 0) + 1;');

check('_doLoad() gọi invalidateStudents hoặc invalidateList sau load',
    studentsJs.includes('invalidateStudents') ||
    studentsJs.includes("invalidateList('students.activeList'") ||
    studentsJs.includes('invalidateList(\'students.activeList\''),
    "Thêm: window.invalidateStudents('students-pagination') hoặc window.invalidateList('students.activeList', ...)");

check('_doLoad() gọi refreshListComputation sau load',
    studentsJs.includes('refreshListComputation'),
    "Thêm: window.refreshListComputation?.('students.activeList', 'students-pagination-loaded')");

check('_doLoad() có setTimeout fallback render',
    studentsJs.includes('setTimeout') &&
    (studentsJs.includes('_renderStudentsPageRowsFallback') || studentsJs.includes('renderStudentsPageRowsFallback')),
    'Thêm: setTimeout(() => _renderStudentsPageRowsFallback(pgState), 300);');

console.log();
console.log('▸ Section 2: computeAndCacheStudents cache key bao gồm pgVersion');
check('computeAndCacheStudents đọc _studentsPaginationVersion cho cache key',
    rendererJs.includes('_studentsPaginationVersion') ||
    (rendererJs.includes('pgVersion') && rendererJs.includes('pgv:')),
    'Thêm: const pgVersion = (window.__store || {})._studentsPaginationVersion || 0;');

check('cache paramsKey bao gồm pgv:${pgVersion}',
    rendererJs.includes('pgv:') ||
    rendererJs.includes('pgVersion'),
    "Thêm vào paramsKey: |pgv:${pgVersion}|pgc:${pgCount}|pgp:${pgPage}");

check('cache paramsKey bao gồm pgc:${pgCount} — item count',
    rendererJs.includes('pgc:') ||
    (rendererJs.includes('pgCount') && rendererJs.includes('currentItems')),
    "const pgCount = pgStudents?.currentItems?.length || 0; thêm vào paramsKey");

console.log();
console.log('▸ Section 3: PASS 2 xử lý pgStudents.currentItems đúng');
check('PASS 2 dùng allProfiles[name] || item — không bỏ sót items thiếu allProfiles',
    rendererJs.includes('allProfiles[name] || item'),
    'const p = allProfiles[name] || item; // fallback nếu allProfiles chưa sync');

check('PASS 2 xây dựng activeRows từ pgStudents.currentItems khi pgStudentsActive',
    rendererJs.includes('pgStudentsActive') && rendererJs.includes('pgStudents.currentItems.forEach'),
    'PASS 2: pgStudents.currentItems.forEach(item => { ... build activeRows ... })');

console.log();
console.log('══════════════════════════════════════════════════════════');
const total = pass + errors.length;
console.log('  Total: ' + total + ' | ✅ ' + pass + ' | ❌ ' + errors.length);
if (errors.length > 0) {
    errors.forEach(e => console.error('  ❌ ' + e));
    console.error('\n  ⚠️  Invalidation chain không đủ — cache có thể stale sau pagination load!');
    console.log('══════════════════════════════════════════════════════════\n');
    process.exit(1);
} else {
    console.log('\n  🎉 Pagination version invalidation checks passed!');
    console.log('  Invalidation chain đầy đủ — cache luôn miss sau pagination load.');
    console.log('══════════════════════════════════════════════════════════\n');
}
