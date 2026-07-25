/**
 * tools/check-debt-service-bridge.mjs — Phase 4K-5L-C
 *
 * Kiểm tra static: đảm bảo StudentService bridge được expose đúng cách
 * và không còn ReferenceError: StudentService is not defined trong finance.js.
 *
 * Chạy: npm run check:debt-service-bridge
 */

import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

function readFile(rel) {
    const abs = resolve(ROOT, rel);
    if (!existsSync(abs)) return null;
    return readFileSync(abs, 'utf-8');
}

const PASS = '\x1b[32m✅ PASS\x1b[0m';
const FAIL = '\x1b[31m❌ FAIL\x1b[0m';

let failures = 0;

function check(label, condition, hint) {
    if (condition) {
        console.log(`${PASS}  ${label}`);
    } else {
        console.log(`${FAIL}  ${label}`);
        if (hint) console.log(`       💡 ${hint}`);
        failures++;
    }
}

console.log('\n🔍 Phase 4K-5L-C — Debt Service Bridge Check\n');

const financeJs  = readFile('js/modules/finance.js');
const studentsJs = readFile('js/modules/students.js');
const mainJs     = readFile('js/main.js');
const statusBoundary = readFile('js/core/studentStatusCommandBoundary.js');

check('financeJs readable',  !!financeJs,  'Không tìm thấy js/modules/finance.js');
check('studentsJs readable', !!studentsJs, 'Không tìm thấy js/modules/students.js');
check('mainJs readable',     !!mainJs,     'Không tìm thấy js/main.js');

if (!financeJs || !studentsJs || !mainJs) {
    console.error('\n❌ Cannot continue — required files missing\n');
    process.exit(1);
}

// ── 1. finance.js import StudentService ──────────────────────────────────────
check(
    '1. finance.js imports StudentService from students.service.js',
    financeJs.includes("import { StudentService } from '../services/students.service.js'"),
    "Thêm: import { StudentService } from '../services/students.service.js'; vào đầu finance.js"
);

// ── 2. finance.js không dùng StudentService. trực tiếp không khai báo ────────
{
    // Check that every use of StudentService. in finance.js is safe (has svc = ... || StudentService)
    const hasImport = financeJs.includes("import { StudentService }");
    check(
        '2. finance.js không còn dùng StudentService. mà không import',
        hasImport,
        'finance.js phải import StudentService từ students.service.js'
    );
}

// ── 3. students.js expose window.StudentService ───────────────────────────────
check(
    '3. students.js expose window.StudentService trong initStudents()',
    studentsJs.includes('window.StudentService = window.StudentService || StudentService'),
    'Thêm window.StudentService = window.StudentService || StudentService; vào đầu initStudents()'
);

// ── 4–7. V5U-1: Debt actions delegate into the canonical student-status boundary ──
{
    const mqStart = studentsJs.indexOf('window.markStudentQuitFromDebt');
    const mqEnd   = studentsJs.indexOf('window.skipDebtMonthFromDebt', mqStart > 0 ? mqStart : 0);
    const mqBlock = (mqStart >= 0 && mqEnd > mqStart) ? studentsJs.slice(mqStart, mqEnd) : '';
    const sdStart = studentsJs.indexOf('window.skipDebtMonthFromDebt');
    const sdEnd   = studentsJs.indexOf('window.debugDebtServiceBridge', sdStart > 0 ? sdStart : 0);
    const sdBlock = (sdStart >= 0 && sdEnd > sdStart) ? studentsJs.slice(sdStart, sdEnd) : '';
    check(
        '4. markStudentQuitFromDebt delegates to StudentStatusCommandBoundary',
        mqBlock.includes('StudentStatusCommandBoundary.markQuit'),
        'V5U-1 requires the Debt quit action to use the canonical status command owner'
    );
    check(
        '5. skipDebtMonthFromDebt delegates to StudentStatusCommandBoundary',
        sdBlock.includes('StudentStatusCommandBoundary.addSkippedMonth'),
        'V5U-1 requires the Debt skip-month action to use the canonical status command owner'
    );
    check(
        '6. canonical boundary resolves the existing StudentService bridge',
        statusBoundary.includes('window.StudentService') && statusBoundary.includes('|| StudentService'),
        'StudentStatusCommandBoundary must reuse the existing StudentService, not create a new write path'
    );
    check(
        '7. canonical boundary centralizes local status/debt synchronization',
        statusBoundary.includes('syncStudentStatusLocal') && statusBoundary.includes('syncStudentSkippedMonthLocal') && statusBoundary.includes('removeStudentFromDebtDom'),
        'Boundary must commit local status and Debt removal only after the service succeeds'
    );
}

// ── 8. debugDebtServiceBridge tồn tại ────────────────────────────────────────
check(
    '8. students.js có window.debugDebtServiceBridge',
    studentsJs.includes('window.debugDebtServiceBridge'),
    'Thêm window.debugDebtServiceBridge = function() {...} vào students.js'
);

// ── 9. debugRuntimeSmokeTest include debtServiceBridge ───────────────────────
check(
    '9. debugRuntimeSmokeTest trong main.js include debtServiceBridge',
    mainJs.includes('debtServiceBridge'),
    "Thêm out.debtServiceBridge = await safeCall('debugDebtServiceBridge', ...) vào debugRuntimeSmokeTest"
);

// ── 10–11. finance.js delegates; boundary owns local synchronization ─────────
{
    const smStart = financeJs.indexOf('window.skipMonth = async');
    const smEnd   = financeJs.indexOf('window.removeSkip = async', smStart > 0 ? smStart : 0);
    const smBlock = (smStart >= 0 && smEnd > smStart) ? financeJs.slice(smStart, smEnd) : '';
    check(
        '10. finance.js skipMonth delegates to StudentStatusCommandBoundary',
        smBlock.includes('StudentStatusCommandBoundary.addSkippedMonth'),
        'Finance alias must not write status directly after V5U-1'
    );
    check(
        '11. boundary syncs skipped month and removes Debt row after success',
        statusBoundary.includes('syncStudentSkippedMonthLocal') && statusBoundary.includes('removeStudentFromDebtDom'),
        'Canonical status boundary owns local synchronization after the service write'
    );
}

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('');
const total = 11;
if (failures === 0) {
    console.log(`\x1b[32m✅ All checks passed (${total}/${total})\x1b[0m\n`);
    process.exit(0);
} else {
    console.log(`\x1b[31m❌ ${failures} check(s) failed of ${total}\x1b[0m\n`);
    process.exit(1);
}
