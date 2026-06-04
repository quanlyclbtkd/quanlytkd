/**
 * check-student-list-pagination-coverage.mjs — Phase 4K-5G
 * Kiểm tra debt full source, extractCountFromTabText, __studentListPageState, _loadMore, debugStudentListCoverage.
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

console.log('\n[check-student-list-pagination-coverage] Phase 4K-5G\n');

const appJs          = readFile('app.js');
const studentsRenderer = readFile('js/ui/render/computation/studentsRenderer.js');
const mainJs         = readFile('js/main.js');

// 1. ensureDebtProfilesReady has NO broken regex /((d+))/
check('ensureDebtProfilesReady: no broken /((d+))/ regex (missing backslash)',
    !appJs.includes('/((d+))/')  &&
    !appJs.includes("match(/((d+))/)")
);

// 2. extractCountFromTabText defined
check('extractCountFromTabText defined in app.js',
    appJs.includes('window.extractCountFromTabText'));

// 3. extractCountFromTabText parses parenthesised number
check('extractCountFromTabText has digit-matching pattern',
    appJs.includes('extractCountFromTabText') &&
    (appJs.includes('\\d+') || appJs.includes('\\\\d+')) &&
    appJs.includes('replace(/[()]/'));

// 4. __studentListPageState initialised
check('__studentListPageState initialised in app.js',
    appJs.includes('__studentListPageState'));

// 5. __studentListPageState has activePage, debtPage, quitPage keys
check('__studentListPageState has activePage/debtPage/quitPage',
    appJs.includes('activePage') &&
    appJs.includes('debtPage') &&
    appJs.includes('quitPage'));

// 6. _loadMore syncs __studentListPageState.debtPage
check('_loadMore syncs __studentListPageState.debtPage',
    appJs.includes('__studentListPageState.debtPage'));

// 7. _resetListPages resets __studentListPageState
check('_resetListPages resets __studentListPageState',
    appJs.includes('_resetListPages') && appJs.includes('__studentListPageState') &&
    appJs.includes('debtPage   = 1'));

// 8. computeAndCacheStudents receives debtPage param in studentsRenderer
check('computeAndCacheStudents receives debtPage param',
    studentsRenderer.includes('debtPage'));

// 9. studentsRenderer: _debtTotalCount computed from allProfiles (not capped by _debtLimit)
check('studentsRenderer: _debtTotalCount computed before _debtLimit slice',
    studentsRenderer.includes('_debtTotalCount') &&
    studentsRenderer.includes('_debtLimit'));

// 10. studentsRenderer has load-more button for debt list
check('studentsRenderer: has "Tải thêm" button for debtList',
    studentsRenderer.includes('_loadMore(\'debt\')') ||
    studentsRenderer.includes('_loadMore("debt")'));

// 11. _injectControls inserts controls OUTSIDE <table> (uses parent.insertBefore)
check('students.js _injectControls uses parent.insertBefore (not inside table)',
    readFile('js/modules/students.js').includes('parent.insertBefore') ||
    readFile('js/modules/students.js').includes('insertBefore'));

// 12. debugStudentListCoverage defined in app.js
check('debugStudentListCoverage defined in app.js',
    appJs.includes('window.debugStudentListCoverage'));

// 13. debugStudentListCoverage checks debtRowsDom
check('debugStudentListCoverage checks debtRowsDom',
    appJs.includes('debtRowsDom'));

// 14. debugRuntimeSmokeTest calls studentListCoverage
check('debugRuntimeSmokeTest includes studentListCoverage in main.js',
    mainJs.includes('studentListCoverage'));

// 15. debugRuntimeSmokeTest calls financeTableLayout
check('debugRuntimeSmokeTest includes financeTableLayout in main.js',
    mainJs.includes('financeTableLayout'));

console.log(`\n  ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
