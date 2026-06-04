/**
 * check-student-pagination-status-filter.mjs — Phase 4K-5F
 * Kiểm tra filter active/quit tại pagination, fallback, renderIsland, search, syncStatus.
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

console.log('\n[check-student-pagination-status-filter] Phase 4K-5F\n');

const studentsJs      = readFile('js/modules/students.js');
const renderStudents  = readFile('js/ui/render/renderStudents.js');
const studentsService = readFile('js/services/students.service.js');

// 1. filterStudentItemsForMode defined
check('filterStudentItemsForMode defined',
    studentsJs.includes('window.filterStudentItemsForMode'));

// 2. _renderStudentsPageRowsFallback uses filterStudentItemsForMode
check('_renderStudentsPageRowsFallback uses filterStudentItemsForMode',
    studentsJs.includes('_renderStudentsPageRowsFallback') &&
    studentsJs.includes('filterStudentItemsForMode') &&
    studentsJs.includes('_filteredItems'));

// 3. buildStudentsRowsFromPagination uses filterStudentItemsForMode
check('buildStudentsRowsFromPagination uses filterStudentItemsForMode',
    studentsJs.includes('buildStudentsRowsFromPagination') &&
    studentsJs.includes('filterStudentItemsForMode'));

// 4. _renderStudentsPageRowsFallback targets correct list (not always #activeList)
check('_renderStudentsPageRowsFallback targets _listId (not hardcoded activeList)',
    studentsJs.includes("const _listId = _mode === 'quit' ? 'quitList' : 'activeList'"));

// 5. renderActiveIsland filters by mode=active before fallback
check('renderActiveIsland uses filterStudentItemsForMode(items, \'active\')',
    renderStudents.includes("filterStudentItemsForMode(_pgState.currentItems, 'active')") ||
    renderStudents.includes("filterStudentItemsForMode") && renderStudents.includes("'active'"));

// 6. renderQuitIsland filters by mode=quit before fallback
check('renderQuitIsland uses filterStudentItemsForMode(items, \'quit\')',
    renderStudents.includes("filterStudentItemsForMode(_pgState.currentItems, 'quit')") ||
    renderStudents.includes("filterStudentItemsForMode") && renderStudents.includes("'quit'"));

// 7. searchProfilesServerSide accepts statusFilter
check('searchProfilesServerSide accepts statusFilter option',
    studentsService.includes('statusFilter'));

// 8. searchProfilesServerSide applies filterStudentItemsForMode or mode filter
check('searchProfilesServerSide applies mode filter on results',
    studentsService.includes('filterStudentItemsForMode') ||
    (studentsService.includes('_statusMode') && studentsService.includes("=== 'active'")));

// 9. searchProfilesServerSide call in students.js passes statusFilter
check('students.js search call passes statusFilter',
    studentsJs.includes('statusFilter: _curTabStatus') ||
    studentsJs.includes('statusFilter:'));

// 10. syncStudentStatusLocal removes DOM row on quit
check('syncStudentStatusLocal removes #activeList DOM row on quit',
    studentsJs.includes('#activeList tr[data-student-id]') &&
    studentsJs.includes("kind === 'quit'") &&
    studentsJs.includes('.remove()'));

// 11. debugActiveQuitLeak defined
check('debugActiveQuitLeak defined',
    readFile('app.js').includes('window.debugActiveQuitLeak'));

console.log(`\n  ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
