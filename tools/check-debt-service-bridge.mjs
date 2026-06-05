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

// ── 4. markStudentQuitFromDebt dùng window.StudentService || StudentService ───
{
    const mqStart = studentsJs.indexOf('window.markStudentQuitFromDebt');
    const mqEnd   = studentsJs.indexOf('window.skipDebtMonthFromDebt', mqStart > 0 ? mqStart : 0);
    const mqBlock = (mqStart >= 0 && mqEnd > mqStart) ? studentsJs.slice(mqStart, mqEnd) : '';
    check(
        '4. markStudentQuitFromDebt dùng window.StudentService || StudentService',
        mqBlock.includes('window.StudentService || StudentService'),
        'Sửa markStudentQuitFromDebt dùng const svc = window.StudentService || StudentService'
    );
}

// ── 5. skipDebtMonthFromDebt dùng window.StudentService || StudentService ─────
{
    const sdStart = studentsJs.indexOf('window.skipDebtMonthFromDebt');
    const sdEnd   = studentsJs.indexOf('window.debugDebtServiceBridge', sdStart > 0 ? sdStart : 0);
    const sdBlock = (sdStart >= 0 && sdEnd > sdStart) ? studentsJs.slice(sdStart, sdEnd) : '';
    check(
        '5. skipDebtMonthFromDebt dùng window.StudentService || StudentService',
        sdBlock.includes('window.StudentService || StudentService'),
        'Sửa skipDebtMonthFromDebt dùng const svc = window.StudentService || StudentService'
    );
}

// ── 6. markStudentQuitFromDebt fallback dùng __store.clubId ──────────────────
{
    const mqStart = studentsJs.indexOf('window.markStudentQuitFromDebt');
    const mqEnd   = studentsJs.indexOf('window.skipDebtMonthFromDebt', mqStart > 0 ? mqStart : 0);
    const mqBlock = (mqStart >= 0 && mqEnd > mqStart) ? studentsJs.slice(mqStart, mqEnd) : '';
    check(
        '6. markStudentQuitFromDebt fallback dùng window.__store.clubId',
        mqBlock.includes('st.clubId || window.currentClubId'),
        'Fallback trong markStudentQuitFromDebt phải dùng st.clubId || window.currentClubId'
    );
}

// ── 7. skipDebtMonthFromDebt fallback dùng __store.clubId ────────────────────
{
    const sdStart = studentsJs.indexOf('window.skipDebtMonthFromDebt');
    const sdEnd   = studentsJs.indexOf('window.debugDebtServiceBridge', sdStart > 0 ? sdStart : 0);
    const sdBlock = (sdStart >= 0 && sdEnd > sdStart) ? studentsJs.slice(sdStart, sdEnd) : '';
    check(
        '7. skipDebtMonthFromDebt fallback dùng window.__store.clubId',
        sdBlock.includes('st.clubId || window.currentClubId'),
        'Fallback trong skipDebtMonthFromDebt phải dùng st.clubId || window.currentClubId'
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

// ── 10. finance.js skipMonth gọi syncStudentSkippedMonthLocal ────────────────
{
    const smStart = financeJs.indexOf('window.skipMonth = async');
    const smEnd   = financeJs.indexOf('window.removeSkip = async', smStart > 0 ? smStart : 0);
    const smBlock = (smStart >= 0 && smEnd > smStart) ? financeJs.slice(smStart, smEnd) : '';
    check(
        '10. finance.js skipMonth gọi syncStudentSkippedMonthLocal sau Firestore',
        smBlock.includes('syncStudentSkippedMonthLocal'),
        'Thêm window.syncStudentSkippedMonthLocal(...) sau await svc.addSkippedMonth trong skipMonth'
    );
}

// ── 11. finance.js skipMonth gọi removeStudentFromDebtDom ────────────────────
{
    const smStart = financeJs.indexOf('window.skipMonth = async');
    const smEnd   = financeJs.indexOf('window.removeSkip = async', smStart > 0 ? smStart : 0);
    const smBlock = (smStart >= 0 && smEnd > smStart) ? financeJs.slice(smStart, smEnd) : '';
    check(
        '11. finance.js skipMonth gọi removeStudentFromDebtDom sau Firestore',
        smBlock.includes('removeStudentFromDebtDom'),
        'Thêm window.removeStudentFromDebtDom(name) sau await svc.addSkippedMonth trong skipMonth'
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
