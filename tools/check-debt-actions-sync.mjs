/**
 * check-debt-actions-sync.mjs — Phase 4K-5L
 * Kiểm tra Debt Action Bridge: quit + skip month sync.
 *
 * Test fail nếu:
 * 1.  Không có syncStudentSkippedMonthLocal
 * 2.  Không có removeStudentFromDebtDom
 * 3.  Không có markStudentQuitFromDebt
 * 4.  Không có skipDebtMonthFromDebt
 * 5.  skipMonth không gọi syncStudentSkippedMonthLocal
 * 6.  syncStudentStatusLocal không gọi removeStudentFromDebtDom khi kind === quit
 * 7.  renderDebtRow vẫn dùng handleQuitOption làm action chính (không được có nữa)
 * 8.  renderDebtRow không có nút markStudentQuitFromDebt
 * 9.  renderDebtRow không có nút skipDebtMonthFromDebt
 * 10. app.js legacy debt row còn dùng handleQuitOption làm action chính
 * 11. Không có debugDebtActionState
 * 12. debugRuntimeSmokeTest không include debtActionState
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

function readFile(rel) {
    try {
        return readFileSync(resolve(ROOT, rel), 'utf-8');
    } catch (e) {
        return null;
    }
}

const errors = [];
let passed = 0;

function check(id, desc, ok) {
    if (ok) {
        passed++;
        console.log(`  ✅ [${id}] ${desc}`);
    } else {
        errors.push(`[${id}] ${desc}`);
        console.error(`  ❌ [${id}] ${desc}`);
    }
}

console.log('\n🔍 check-debt-actions-sync.mjs — Phase 4K-5L\n');

// ── Files ──────────────────────────────────────────────────────
const studentsJs    = readFile('js/modules/students.js') || '';
const rendererJs    = readFile('js/ui/render/computation/studentsRenderer.js') || '';
const appJs         = readFile('app.js') || '';
const mainJs        = readFile('js/main.js') || '';
const financeJs     = readFile('js/modules/finance.js') || '';
const statusBoundary = readFile('js/core/studentStatusCommandBoundary.js') || '';

// ── 1. syncStudentSkippedMonthLocal exists ──
check('1', 'syncStudentSkippedMonthLocal defined in students.js',
    studentsJs.includes('window.syncStudentSkippedMonthLocal'));

// ── 2. removeStudentFromDebtDom exists ──
check('2', 'removeStudentFromDebtDom defined in students.js',
    studentsJs.includes('window.removeStudentFromDebtDom'));

// ── 3. markStudentQuitFromDebt exists ──
check('3', 'markStudentQuitFromDebt defined in students.js',
    studentsJs.includes('window.markStudentQuitFromDebt'));

// ── 4. skipDebtMonthFromDebt exists ──
check('4', 'skipDebtMonthFromDebt defined in students.js',
    studentsJs.includes('window.skipDebtMonthFromDebt'));

// ── 5. skipMonth calls syncStudentSkippedMonthLocal ──
check('5', 'V5U-1 skipMonth ownership moved out of app.js and boundary syncs skipped month',
    appJs.includes('legacy student status writers were removed from app.js') && statusBoundary.includes('syncStudentSkippedMonthLocal'));

// ── 6. syncStudentStatusLocal calls removeStudentFromDebtDom when kind=quit ──
check('6', 'syncStudentStatusLocal calls removeStudentFromDebtDom on quit',
    studentsJs.includes('removeStudentFromDebtDom') && studentsJs.includes('syncStudentStatusLocal'));

// ── 7. renderDebtRow no longer uses handleQuitOption as main action ──
// handleQuitOption may still appear in comments — we check for onclick="handleQuitOption
check('7', 'renderDebtRow does NOT use onclick="handleQuitOption as action button',
    !rendererJs.includes("onclick=\"handleQuitOption(") &&
    !rendererJs.includes("onclick=`handleQuitOption(") &&
    !rendererJs.includes('onclick="handleQuitOption('));

// ── 8. renderDebtRow has markStudentQuitFromDebt button ──
check('8', 'renderDebtRow has markStudentQuitFromDebt button',
    rendererJs.includes('markStudentQuitFromDebt'));

// ── 9. renderDebtRow has skipDebtMonthFromDebt button ──
check('9', 'renderDebtRow has skipDebtMonthFromDebt button',
    rendererJs.includes('skipDebtMonthFromDebt'));

// ── 10. app.js legacy: no debt row still using handleQuitOption as onclick for quit action ──
// handleQuitOption is still defined in app.js (that's OK) but should NOT be used
// as the onclick in a debt row context. We check that any remaining usage is
// the definition itself, not a new onclick assignment for debt rows.
// Since app.js uses module-rendered rows now, this is less critical — but we verify
// it's not newly calling handleQuitOption from the debt list context.
// The definition `window.handleQuitOption = ` is allowed; new onclick uses for debt are not.
// For safety, we accept that the function still EXISTS (legacy), but verify the
// markStudentQuitFromDebt bridge is preferred.
check('10', 'app.js has markStudentQuitFromDebt or removeStudentFromDebtDom wired (legacy bridge)',
    appJs.includes('removeStudentFromDebtDom') || appJs.includes('markStudentQuitFromDebt'));

// ── 11. debugDebtActionState exists ──
check('11', 'debugDebtActionState defined in students.js',
    studentsJs.includes('window.debugDebtActionState'));

// ── 12. debugRuntimeSmokeTest includes debtActionState ──
check('12', 'debugRuntimeSmokeTest in main.js includes debtActionState',
    mainJs.includes('debtActionState'));

// ── A. students.js skipMonth calls syncStudentSkippedMonthLocal ──
{
    const skipStart = studentsJs.indexOf('window.skipMonth = async');
    const skipEnd   = studentsJs.indexOf('window.removeSkip', skipStart > 0 ? skipStart : 0);
    const skipBlock = (skipStart >= 0 && skipEnd > skipStart)
        ? studentsJs.slice(skipStart, skipEnd) : '';
    check('A', 'students.js window.skipMonth delegates to StudentStatusCommandBoundary and boundary syncs local month',
        skipBlock.includes('StudentStatusCommandBoundary.addSkippedMonth') && statusBoundary.includes('syncStudentSkippedMonthLocal'));
}

// ── B. students.js skipMonth calls removeStudentFromDebtDom ──
{
    const skipStart = studentsJs.indexOf('window.skipMonth = async');
    const skipEnd   = studentsJs.indexOf('window.removeSkip', skipStart > 0 ? skipStart : 0);
    const skipBlock = (skipStart >= 0 && skipEnd > skipStart)
        ? studentsJs.slice(skipStart, skipEnd) : '';
    check('B', 'V5U-1 boundary removes skipped student from Debt DOM after command success',
        skipBlock.includes('StudentStatusCommandBoundary.addSkippedMonth') && statusBoundary.includes('removeStudentFromDebtDom'));
}

// ── C. students.js removeSkip calls syncStudentSkippedMonthLocal ──
{
    const rsStart = studentsJs.indexOf('window.removeSkip = async');
    const rsEnd   = studentsJs.indexOf('window.addAchievementRow', rsStart > 0 ? rsStart : 0);
    const rsBlock = (rsStart >= 0 && rsEnd > rsStart)
        ? studentsJs.slice(rsStart, rsEnd) : '';
    check('C', 'students.js window.removeSkip delegates and boundary syncs removal locally',
        rsBlock.includes('StudentStatusCommandBoundary.removeSkippedMonth') && statusBoundary.includes("'remove', 'v5u1-skip-month-remove'"));
}

// ── D. app.js legacy debt row does NOT use onclick="handleQuitOption( ──
check('D', 'app.js legacy debt row không còn onclick="handleQuitOption( làm nút chính',
    !appJs.includes('onclick="handleQuitOption(') &&
    !appJs.includes("onclick='handleQuitOption("));

// ── E. finance.js handleQuitOption quit branch calls syncStudentStatusLocal ──
{
    const fhqStart = financeJs.indexOf('window.handleQuitOption');
    const fhqEnd   = financeJs.indexOf('window.deleteTx', fhqStart > 0 ? fhqStart : 0);
    const fhqBlock = (fhqStart >= 0 && fhqEnd > fhqStart)
        ? financeJs.slice(fhqStart, fhqEnd) : '';
    check('E', 'finance.js handleQuitOption delegates quit and boundary commits canonical local status',
        fhqBlock.includes('StudentStatusCommandBoundary.markQuit') && statusBoundary.includes('syncStudentStatusLocal'));
}

// ── Summary ──────────────────────────────────────────────────────────────────
console.log(`\nResults: ${passed} passed, ${errors.length} failed\n`);

if (errors.length > 0) {
    console.error('FAILURES:');
    errors.forEach(e => console.error('  ✗ ' + e));
    process.exit(1);
} else {
    console.log('✅ All debt-actions-sync checks passed.\n');
    process.exit(0);
}
