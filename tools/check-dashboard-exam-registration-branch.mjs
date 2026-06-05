/**
 * tools/check-dashboard-exam-registration-branch.mjs
 * Phase 4K-5P — Dashboard Exam Registration Branch Authority
 *
 * Fails if:
 *  1. buildCanonicalExamBranchLedger is absent
 *  2. buildCanonicalExamPaymentLedger does not support options.transactions
 *  3. financeRenderer does not call buildCanonicalExamBranchLedger
 *  4. dashboard.js refreshDashboardBranchStatsFullMonth does not call buildCanonicalExamBranchLedger
 *  5. renderBranchStats does not display examRegisteredCount
 *  6. debugExamBranchRegistrationMismatch is absent
 *  7. debugRuntimeSmokeTest does not include debugExamBranchRegistrationMismatch
 *  8. financeRenderer still uses transaction-loop examFeeMap as final source without canonical override
 *  9. bStats branch does not have examRegisteredNames field
 */

import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

function readFile(rel) {
    const abs = resolve(root, rel);
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

console.log('\n🔍 Phase 4K-5P — check-dashboard-exam-registration-branch\n');

const appJs   = readFile('app.js');
const dash    = readFile('js/modules/dashboard.js');
const fin     = readFile('js/ui/render/computation/financeRenderer.js');
const mainJs  = readFile('js/main.js');

check('app.js readable',          !!appJs,   'app.js không tìm thấy');
check('dashboard.js readable',    !!dash,    'js/modules/dashboard.js không tìm thấy');
check('financeRenderer.js readable', !!fin,  'js/ui/render/computation/financeRenderer.js không tìm thấy');
check('js/main.js readable',      !!mainJs,  'js/main.js không tìm thấy');

if (!appJs || !dash || !fin || !mainJs) {
    console.error('\n❌ Cannot continue — required files missing\n');
    process.exit(1);
}

// 1. buildCanonicalExamBranchLedger tồn tại
check(
    'buildCanonicalExamBranchLedger được định nghĩa trong app.js',
    appJs.includes('window.buildCanonicalExamBranchLedger'),
    'Thêm window.buildCanonicalExamBranchLedger = function(options) {...} vào app.js'
);

// 2. buildCanonicalExamPaymentLedger hỗ trợ options.transactions
check(
    'buildCanonicalExamPaymentLedger hỗ trợ options.transactions',
    appJs.includes('options.transactions'),
    'Sửa buildCanonicalExamPaymentLedger để ưu tiên options.transactions'
);

// 3. financeRenderer gọi buildCanonicalExamBranchLedger
check(
    'financeRenderer gọi buildCanonicalExamBranchLedger',
    fin.includes('buildCanonicalExamBranchLedger'),
    'Thêm canonical exam branch ledger override sau transaction loop trong financeRenderer.js'
);

// 4. refreshDashboardBranchStatsFullMonth gọi buildCanonicalExamBranchLedger
const dashHasCanonical = dash.includes('buildCanonicalExamBranchLedger');
check(
    'refreshDashboardBranchStatsFullMonth gọi buildCanonicalExamBranchLedger',
    dashHasCanonical,
    'Thêm canonical exam branch ledger override vào refreshDashboardBranchStatsFullMonth trong dashboard.js'
);

// 5. renderBranchStats hiển thị examRegisteredCount
check(
    'renderBranchStats hiển thị examRegisteredCount',
    dash.includes('examRegisteredCount') && dash.includes('võ sinh đã đăng ký thi'),
    'Thêm examRegisteredBadge với text "võ sinh đã đăng ký thi" vào renderBranchStats'
);

// 6. debugExamBranchRegistrationMismatch tồn tại
check(
    'debugExamBranchRegistrationMismatch được định nghĩa trong app.js',
    appJs.includes('window.debugExamBranchRegistrationMismatch'),
    'Thêm window.debugExamBranchRegistrationMismatch = function() {...} vào app.js'
);

// 7. debugRuntimeSmokeTest gọi debugExamBranchRegistrationMismatch
check(
    'debugRuntimeSmokeTest gọi debugExamBranchRegistrationMismatch',
    mainJs.includes('debugExamBranchRegistrationMismatch'),
    'Thêm safeCall debugExamBranchRegistrationMismatch vào window.debugRuntimeSmokeTest trong js/main.js'
);

// 8. financeRenderer có canonical override sau transaction loop (không còn dùng transaction loop làm nguồn cuối)
check(
    'financeRenderer có canonical exam branch override (không chỉ dùng transaction loop)',
    fin.includes('buildCanonicalExamBranchLedger') && fin.includes('examRegisteredCount'),
    'financeRenderer cần gọi buildCanonicalExamBranchLedger và set examRegisteredCount sau transaction loop'
);

// 9. bStats branch có field examRegisteredNames
check(
    'financeRenderer set examRegisteredNames trong bStats branch',
    fin.includes('examRegisteredNames'),
    'Thêm bStats[branch].examRegisteredNames = info.names || [] sau canonical override'
);

// Bonus: dashboard.js cũng set examRegisteredNames
check(
    'dashboard.js refreshDashboardBranchStatsFullMonth set examRegisteredNames',
    dash.includes('examRegisteredNames'),
    'Thêm bStats[branch].examRegisteredNames = info.names || [] trong refreshDashboardBranchStatsFullMonth'
);

// Summary
console.log('');
if (failures === 0) {
    console.log('\x1b[32m✅ All checks passed — Phase 4K-5P Dashboard Exam Registration Branch\x1b[0m\n');
    process.exit(0);
} else {
    console.log(`\x1b[31m❌ ${failures} check(s) failed\x1b[0m\n`);
    process.exit(1);
}
