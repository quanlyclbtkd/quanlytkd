/**
 * check-student-list-load-more-coverage.mjs — Phase 4K-5G
 * Kiểm tra active fallback render có pagination status + _loadMore('active') hoạt động.
 */
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const readFile = (rel) => readFileSync(resolve(root, rel), 'utf8');

let passed = 0, failed = 0;
function check(name, ok, detail = '') {
    if (ok) { console.log(`  ✅  ${name}`); passed++; }
    else { console.error(`  ❌  ${name}${detail ? ' — ' + detail : ''}`); failed++; }
}

console.log('\n[check-student-list-load-more-coverage] Phase 4K-5G\n');

const studentsRenderer = readFile('js/ui/render/computation/studentsRenderer.js');
const appJs            = readFile('app.js');
const mainJs           = readFile('js/main.js');

// 1. renderStudentPaginationStatus defined in studentsRenderer
check('renderStudentPaginationStatus defined in studentsRenderer.js',
    studentsRenderer.includes('renderStudentPaginationStatus') ||
    studentsRenderer.includes('function renderStudentPaginationStatus'));

// 2. window.renderStudentPaginationStatus exposed globally
check('renderStudentPaginationStatus exposed on window',
    studentsRenderer.includes('window.renderStudentPaginationStatus'));

// 3. debugActiveListCoverage defined in app.js
check('debugActiveListCoverage defined in app.js',
    appJs.includes('window.debugActiveListCoverage'));

// 4. debugActiveListCoverage checks activeRowsDom
check('debugActiveListCoverage checks activeRowsDom',
    appJs.includes('activeRowsDom'));

// 5. debugActiveListCoverage returns reason field
check('debugActiveListCoverage returns reason field',
    appJs.includes('pagination-control-missing') &&
    appJs.includes('pagination-limit-with-load-more'));

// 6. debugRuntimeSmokeTest includes activeListCoverage
check('debugRuntimeSmokeTest includes activeListCoverage',
    mainJs.includes('activeListCoverage') &&
    mainJs.includes('debugActiveListCoverage'));

// 7. _loadMore('active') invalidates students via invalidateLoadMoreTab or invalidateTab
check("_loadMore('active') properly increments _activePage",
    appJs.includes("window._activePage = (window._activePage || 1) + 1"));

// 8. _loadMore('active') triggers invalidation
check("_loadMore invalidates via invalidateLoadMoreTab or fallback",
    appJs.includes('invalidateLoadMoreTab') ||
    (appJs.includes('invalidateTab') && appJs.includes('load-more-active')));

// 9. active load-more button uses _loadMore('active') call
check("studentsRenderer: active Tải thêm button calls _loadMore('active')",
    studentsRenderer.includes("_loadMore('active')"));

// 10. active load-more button still works when pgStudentsActive is false
check("studentsRenderer: active load-more only when !pgStudentsActive",
    studentsRenderer.includes('!pgStudentsActive') &&
    studentsRenderer.includes("_loadMore('active')"));

console.log(`\n  ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
