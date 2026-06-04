/**
 * check-bundled-receipt-transactions.mjs
 * Phase 4K-5C — Kiểm tra bundle transaction system
 * Chạy: node tools/check-bundled-receipt-transactions.mjs
 */
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

console.log('[check-bundled-receipt-transactions] Phase 4K-5C static analysis...');

const appJs           = readFileSync(join(__dirname, '../app.js'), 'utf8');
const financeRenderer = readFileSync(join(__dirname, '../js/ui/render/computation/financeRenderer.js'), 'utf8');
const studentsJs      = readFileSync(join(__dirname, '../js/modules/students.js'), 'utf8');

const checks = {
    // Phase 8: buildPaymentBundleTransaction
    hasBuildPaymentBundleTransaction: appJs.includes('window.buildPaymentBundleTransaction'),
    bundleTxCreatesComponents: appJs.includes("safeComponents") && appJs.includes("componentSummary"),
    bundleTxDetectsType: appJs.includes("hasTuition && hasExam && !hasInv") || appJs.includes("'Học phí + Lệ phí thi'"),
    // Phase 9: processMultiItem uses bundle
    processMultiItemUsesBundleTx: appJs.includes('processMultiItem') && appJs.includes('buildPaymentBundleTransaction') && appJs.includes('mergeTransactionIntoRuntimeStore'),
    processMultiItemHasFallback: appJs.includes('Fallback: ghi riêng từng khoản như cũ') || appJs.includes('Fallback:'),
    // Phase 10: addNewStudent uses bundle
    addNewStudentUsesBundleTx: appJs.includes('admission-bundle-created') && appJs.includes('buildPaymentBundleTransaction'),
    addNewStudentHasFallback: appJs.includes('admission-tuition-created-legacy'),
    // Phase 11: financeRenderer handles bundles
    financeRendererHandlesBundles: financeRenderer.includes("paymentKind === 'bundle'") && financeRenderer.includes('isBundle'),
    financeRendererShowsGopBadge: financeRenderer.includes('📦 Gộp'),
    financeRendererShowsComponentSummary: financeRenderer.includes('componentSummary'),
    // Phase 12: expandTransactionComponentsForAccounting
    hasExpandComponents: appJs.includes('window.expandTransactionComponentsForAccounting'),
    // Phase 13: debugBundleTransactions
    hasDebugBundleTransactions: appJs.includes('window.debugBundleTransactions'),
};

let allOk = true;
Object.entries(checks).forEach(([k, v]) => {
    const icon = v ? '✅' : '❌';
    if (!v) allOk = false;
    console.log(`  ${icon} ${k}: ${v}`);
});

console.log('');
if (allOk) {
    console.log('✅ All bundled receipt transaction checks passed.');
    process.exit(0);
} else {
    console.error('❌ Some checks failed. Review output above.');
    process.exit(1);
}
