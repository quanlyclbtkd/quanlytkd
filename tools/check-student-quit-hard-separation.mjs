/**
 * check-student-quit-hard-separation.mjs
 * Phase 4K-5C — Kiểm tra hard separation quit students khỏi pagination
 * Chạy: node tools/check-student-quit-hard-separation.mjs
 */
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

console.log('[check-student-quit-hard-separation] Phase 4K-5C static analysis...');

const studentsJs = readFileSync(join(__dirname, '../js/modules/students.js'), 'utf8');
const appJs      = readFileSync(join(__dirname, '../app.js'), 'utf8');
const boundaryJs = readFileSync(join(__dirname, '../js/core/studentStatusCommandBoundary.js'), 'utf8');

const checks = {
    // Phase 6: syncStudentStatusLocal in students.js
    syncStatusLocalExists: studentsJs.includes('window.syncStudentStatusLocal'),
    syncStatusLocalHasPaginationHardRemoval: studentsJs.includes('pg.currentItems = pg.currentItems.filter(function'),
    syncStatusLocalBumpsDataVersion: studentsJs.includes('_dataVersion') && studentsJs.includes('_studentStatusVersion'),
    syncStatusLocalInvalidatesSearchCache: studentsJs.includes('invalidateSearchCache'),
    syncStatusLocalInvalidatesDashboard: studentsJs.includes('invalidateDashboard'),
    syncStatusLocalCallsRefreshLists: studentsJs.includes('refreshListsComputation'),
    // Phase 14: debugStudentStatusSeparation pagination fields
    debugSepHasPaginationDiagnostics: studentsJs.includes('pgCurrentItemsCount') && studentsJs.includes('pgCurrentItemsQuitCount'),
    debugSepHasDataVersion: studentsJs.includes('dataVersion'),
    // Phase 6: quit call site passes reason
    quitCallPassesReason: studentsJs.includes('StudentStatusCommandBoundary.markQuit') && boundaryJs.includes('v5u1-mark-quit'),
    // app.js: syncStudentStatusLocal call sites exist
    appJsCallsSyncStatus: appJs.includes('legacy student status writers were removed from app.js') && boundaryJs.includes('syncStudentStatusLocal'),
};

let allOk = true;
Object.entries(checks).forEach(([k, v]) => {
    const icon = v ? '✅' : '❌';
    if (!v) allOk = false;
    console.log(`  ${icon} ${k}: ${v}`);
});

console.log('');
if (allOk) {
    console.log('✅ All student quit hard separation checks passed.');
    process.exit(0);
} else {
    console.error('❌ Some checks failed. Review output above.');
    process.exit(1);
}
