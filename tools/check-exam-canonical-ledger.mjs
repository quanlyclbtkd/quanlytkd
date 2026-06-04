/**
 * check-exam-canonical-ledger.mjs
 * Phase 4K-5C — Kiểm tra canonical exam payment ledger
 * Chạy: node tools/check-exam-canonical-ledger.mjs
 */
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

console.log('[check-exam-canonical-ledger] Phase 4K-5C static analysis...');

// 1. Verify buildCanonicalExamPaymentLedger exists in app.js
const appJs = readFileSync(join(__dirname, '../app.js'), 'utf8');

const checks = {
    hasBuildCanonicalExamPaymentLedger: appJs.includes('window.buildCanonicalExamPaymentLedger'),
    hasDebugExamCanonicalLedger: appJs.includes('window.debugExamCanonicalLedger'),
    renderExamListUsesLedger: appJs.includes('buildCanonicalExamPaymentLedger') && appJs.includes('examLedger.byName'),
    computeExamStatsUsesLedger: appJs.includes('computeExamRegistrationStats') && appJs.includes('buildCanonicalExamPaymentLedger'),
    dedupeLogicPresent: appJs.includes('ledger.get(name)') && appJs.includes('ledger.set(name'),
    examPaidCancelledGuard: appJs.includes("examPaidCancelled === true") && appJs.includes('buildCanonicalExamPaymentLedger'),
    canonicalLedgerPhaseComment: appJs.includes('Phase 4K-5C — CANONICAL EXAM PAYMENT LEDGER'),
};

let allOk = true;
Object.entries(checks).forEach(([k, v]) => {
    const icon = v ? '✅' : '❌';
    if (!v) allOk = false;
    console.log(`  ${icon} ${k}: ${v}`);
});

// 2. Verify reports.js uses canonical ledger
const reportsJs = readFileSync(join(__dirname, '../js/modules/reports.js'), 'utf8');
const reportsChecks = {
    exportExamPaidListUsesCanonicalLedger: reportsJs.includes('buildCanonicalExamPaymentLedger'),
};
Object.entries(reportsChecks).forEach(([k, v]) => {
    const icon = v ? '✅' : '❌';
    if (!v) allOk = false;
    console.log(`  ${icon} ${k}: ${v}`);
});

// 3. Verify debugRuntimeSmokeTest includes examCanonicalLedger
const mainJs = readFileSync(join(__dirname, '../js/main.js'), 'utf8');
const mainChecks = {
    smokeTestHasExamCanonicalLedger: mainJs.includes('examCanonicalLedger') && mainJs.includes('debugExamCanonicalLedger'),
    smokeTestHasBundleTransactions: mainJs.includes('bundleTransactions') && mainJs.includes('debugBundleTransactions'),
};
Object.entries(mainChecks).forEach(([k, v]) => {
    const icon = v ? '✅' : '❌';
    if (!v) allOk = false;
    console.log(`  ${icon} ${k}: ${v}`);
});

console.log('');
if (allOk) {
    console.log('✅ All canonical ledger checks passed.');
    process.exit(0);
} else {
    console.error('❌ Some checks failed. Review output above.');
    process.exit(1);
}
