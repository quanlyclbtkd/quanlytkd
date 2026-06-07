/**
 * tools/check-scale-readiness-write-safety.mjs — Phase 4K-6E
 *
 * Kiểm tra static: đảm bảo Transaction Delete Integrity, Scale Readiness 1500,
 * và Firebase Write Safety được implement đúng.
 *
 * Chạy: npm run check:scale-readiness-write-safety
 */

import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

function readFile(relPath) {
    const abs = resolve(root, relPath);
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

console.log('\n🔍 Phase 4K-6E — Scale Readiness 1500 + Firebase Write Safety Audit\n');

const tdiJs  = readFile('js/core/transactionDeleteIntegrity.js');
const mainJs = readFile('js/main.js');
const finJs  = readFile('js/modules/finance.js');
const appJs  = readFile('app.js');
const idxHtml = readFile('index.html');

// ── 1. File js/core/transactionDeleteIntegrity.js tồn tại ─────────────────
check(
    'js/core/transactionDeleteIntegrity.js tồn tại',
    !!tdiJs,
    'Tạo file js/core/transactionDeleteIntegrity.js'
);

if (!tdiJs) {
    console.error('\n❌ Cannot continue — transactionDeleteIntegrity.js missing\n');
    process.exit(1);
}

// ── 2. Export TransactionDeleteIntegrity ─────────────────────────────────
check(
    'transactionDeleteIntegrity.js export TransactionDeleteIntegrity',
    tdiJs.includes('export') && tdiJs.includes('TransactionDeleteIntegrity'),
    'Export TransactionDeleteIntegrity từ transactionDeleteIntegrity.js'
);

// ── 3. extractTuitionMonthsFromTransaction ────────────────────────────────
check(
    'transactionDeleteIntegrity.js có extractTuitionMonthsFromTransaction',
    tdiJs.includes('extractTuitionMonthsFromTransaction'),
    'Implement extractTuitionMonthsFromTransaction trong transactionDeleteIntegrity.js'
);

// ── 4. analyzeTransactionDeleteImpact ─────────────────────────────────────
check(
    'transactionDeleteIntegrity.js có analyzeTransactionDeleteImpact',
    tdiJs.includes('analyzeTransactionDeleteImpact'),
    'Implement analyzeTransactionDeleteImpact trong transactionDeleteIntegrity.js'
);

// ── main.js checks ─────────────────────────────────────────────────────────
if (!mainJs) {
    console.error('\n❌ Cannot continue — js/main.js missing\n');
    process.exit(1);
}

// ── 5. window.TransactionDeleteIntegrity exposed ──────────────────────────
check(
    'main.js expose window.TransactionDeleteIntegrity',
    mainJs.includes('window.TransactionDeleteIntegrity'),
    'Thêm window.TransactionDeleteIntegrity = ... vào js/main.js'
);

// ── 6. import TransactionDeleteIntegrity ──────────────────────────────────
check(
    'main.js import TransactionDeleteIntegrity',
    mainJs.includes('from \'./core/transactionDeleteIntegrity.js\'') ||
    mainJs.includes('from "./core/transactionDeleteIntegrity.js"'),
    'Thêm import { TransactionDeleteIntegrity } from \'./core/transactionDeleteIntegrity.js\' vào main.js'
);

// ── 7. window.reconcileStudentTuitionAfterDeletedTransaction ──────────────
check(
    'main.js có window.reconcileStudentTuitionAfterDeletedTransaction',
    mainJs.includes('window.reconcileStudentTuitionAfterDeletedTransaction'),
    'Thêm window.reconcileStudentTuitionAfterDeletedTransaction vào main.js'
);

// ── 8. window.isTuitionMonthStillPaidByAnotherTransaction ─────────────────
check(
    'main.js có window.isTuitionMonthStillPaidByAnotherTransaction',
    mainJs.includes('window.isTuitionMonthStillPaidByAnotherTransaction'),
    'Thêm window.isTuitionMonthStillPaidByAnotherTransaction vào main.js'
);

// ── 9. window.recalculatePaidUntilFromPaidMonths ──────────────────────────
check(
    'main.js có window.recalculatePaidUntilFromPaidMonths',
    mainJs.includes('window.recalculatePaidUntilFromPaidMonths'),
    'Thêm window.recalculatePaidUntilFromPaidMonths vào main.js'
);

// ── 10. getChargeableTuitionMonths kiểm tra paidMonths ────────────────────
check(
    'app.js getChargeableTuitionMonths kiểm tra paidMonths',
    !!appJs && appJs.includes('paidMonths') &&
    appJs.includes('getChargeableTuitionMonths') &&
    (appJs.includes('!paidMonths.includes(cur)') || appJs.includes('paidMonths.includes')),
    'Bổ sung paidMonths check vào window.getChargeableTuitionMonths trong app.js'
);

// ── finance.js checks ──────────────────────────────────────────────────────
if (!finJs) {
    console.error('\n❌ Cannot continue — js/modules/finance.js missing\n');
    process.exit(1);
}

// ── 11. deleteTx gọi analyzeTransactionDeleteImpact ──────────────────────
check(
    'finance.js deleteTx gọi analyzeTransactionDeleteImpact',
    finJs.includes('analyzeTransactionDeleteImpact'),
    'Thêm TransactionDeleteIntegrity.analyzeTransactionDeleteImpact vào deleteTx trong finance.js'
);

// ── 12. deleteTx gọi reconcileStudentTuitionAfterDeletedTransaction ───────
check(
    'finance.js deleteTx gọi reconcileStudentTuitionAfterDeletedTransaction',
    finJs.includes('reconcileStudentTuitionAfterDeletedTransaction'),
    'Thêm reconcileStudentTuitionAfterDeletedTransaction vào deleteTx trong finance.js'
);

// ── 13. deleteTx chặn unsafe bundle inventory delete ─────────────────────
check(
    'finance.js deleteTx chặn unsafe inventory bundle delete',
    finJs.includes('safeToHardDelete') &&
    (finJs.includes('alert(') || finJs.includes('return;')),
    'Thêm blocker alert cho safeToHardDelete === false trong deleteTx'
);

// ── 14. window.debugTransactionDeleteIntegrity ────────────────────────────
check(
    'main.js có window.debugTransactionDeleteIntegrity',
    mainJs.includes('window.debugTransactionDeleteIntegrity'),
    'Thêm window.debugTransactionDeleteIntegrity vào main.js'
);

// ── 15. window.debugStudentTuitionPaymentSources ──────────────────────────
check(
    'main.js có window.debugStudentTuitionPaymentSources',
    mainJs.includes('window.debugStudentTuitionPaymentSources'),
    'Thêm window.debugStudentTuitionPaymentSources vào main.js'
);

// ── 16. window.debugScaleReadiness1500 ───────────────────────────────────
check(
    'main.js có window.debugScaleReadiness1500',
    mainJs.includes('window.debugScaleReadiness1500'),
    'Thêm window.debugScaleReadiness1500 vào main.js'
);

// ── 17. window.debugFirebaseWriteSafety ───────────────────────────────────
check(
    'main.js có window.debugFirebaseWriteSafety',
    mainJs.includes('window.debugFirebaseWriteSafety'),
    'Thêm window.debugFirebaseWriteSafety vào main.js'
);

// ── 18. debugRuntimeSmokeTest includes new debug functions ────────────────
check(
    'main.js debugRuntimeSmokeTest include debugTransactionDeleteIntegrity',
    mainJs.includes('debugTransactionDeleteIntegrity') &&
    mainJs.includes('debugRuntimeSmokeTest'),
    'Thêm safeCall debugTransactionDeleteIntegrity vào debugRuntimeSmokeTest'
);

check(
    'main.js debugRuntimeSmokeTest include debugScaleReadiness1500',
    mainJs.includes('debugScaleReadiness1500'),
    'Thêm safeCall debugScaleReadiness1500 vào debugRuntimeSmokeTest'
);

check(
    'main.js debugRuntimeSmokeTest include debugFirebaseWriteSafety',
    mainJs.includes('debugFirebaseWriteSafety'),
    'Thêm safeCall debugFirebaseWriteSafety vào debugRuntimeSmokeTest'
);

// ── 19. summary có transactionDeleteIntegrityOk ───────────────────────────
check(
    'main.js summary có transactionDeleteIntegrityOk',
    mainJs.includes('transactionDeleteIntegrityOk'),
    'Thêm transactionDeleteIntegrityOk vào summary trong debugRuntimeSmokeTest'
);

check(
    'main.js summary có scaleReadiness1500Ok',
    mainJs.includes('scaleReadiness1500Ok'),
    'Thêm scaleReadiness1500Ok vào summary trong debugRuntimeSmokeTest'
);

check(
    'main.js summary có firebaseWriteSafetyOk',
    mainJs.includes('firebaseWriteSafetyOk'),
    'Thêm firebaseWriteSafetyOk vào summary trong debugRuntimeSmokeTest'
);

// ── 20. Cache bust Phase 4K-6E hoặc mới hơn ──────────────────────────────
check(
    'index.html có cache bust Phase 4K-6E hoặc mới hơn',
    !!idxHtml && (
        idxHtml.includes('scale-readiness-write-safety-20260605') ||
        idxHtml.includes('4K-6E-B-exam-export-belt-sort-20260605') ||
        idxHtml.includes('4K-6E-C-active-new-students-filter-20260605') ||
        idxHtml.includes('4K-6F') ||
        idxHtml.includes('legacy-app-kernel-boundary') ||
        idxHtml.includes('4K-6G') ||
        idxHtml.includes('multiitem-inventory-hydration') ||
        idxHtml.includes('4K-6H') ||
        idxHtml.includes('legacy-render-entrypoint-reduction') ||
        idxHtml.includes('4K-6I') ||
        idxHtml.includes('inline-handler-bridge') ||
        idxHtml.includes('4K-6I-B') ||
        idxHtml.includes('superadmin-quota') ||
        idxHtml.includes('runtime-fallback-fix') ||
        idxHtml.includes('4K-6I-C') ||
        idxHtml.includes('superadmin-aggregation-hard-stop')
    ),
    'Cập nhật cache bust trong index.html: ?v=scale-readiness-write-safety-20260605 hoặc mới hơn'
);

// ── 21. APP_BUILD_VERSION Phase 4K-6E hoặc mới hơn ──────────────────────
check(
    'main.js APP_BUILD_VERSION có Phase 4K-6E hoặc mới hơn',
    mainJs.includes('4K-6E') || mainJs.includes('scale-readiness-write-safety') ||
    mainJs.includes('4K-6F') || mainJs.includes('legacy-app-kernel-boundary') ||
    mainJs.includes('4K-6G') || mainJs.includes('4K-6H') || mainJs.includes('4K-6I') ||
    mainJs.includes('superadmin-aggregation-hard-stop'),
    'Cập nhật APP_BUILD_VERSION trong main.js sang Phase 4K-6E hoặc mới hơn'
);

// ── Summary ───────────────────────────────────────────────────────────────
console.log('');
const total = 22;
if (failures === 0) {
    console.log(`\x1b[32m✅ All checks passed (${total - failures}/${total})\x1b[0m\n`);
    process.exit(0);
} else {
    console.log(`\x1b[31m❌ ${failures} check(s) failed\x1b[0m\n`);
    process.exit(1);
}
