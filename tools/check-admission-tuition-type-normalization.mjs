#!/usr/bin/env node
import fs from 'node:fs';

const files = {
  app: fs.readFileSync('app.js', 'utf8'),
  main: fs.readFileSync('js/main.js', 'utf8'),
  index: fs.readFileSync('index.html', 'utf8'),
  financeRenderer: fs.readFileSync('js/ui/render/computation/financeRenderer.js', 'utf8'),
  monthlyHelpers: fs.readFileSync('js/utils/monthlyHelpers.js', 'utf8'),
  finance: fs.readFileSync('js/modules/finance.js', 'utf8'),
  reports: fs.readFileSync('js/modules/reports.js', 'utf8'),
  functionsHelpers: fs.readFileSync('functions/src/helpers.js', 'utf8'),
  statsAggregation: fs.readFileSync('functions/src/statsAggregation.js', 'utf8'),
};

const checks = [];
function check(name, ok, detail = '') { checks.push({ name, ok: !!ok, detail }); }

check('APP_BUILD_VERSION updated', files.main.includes("4K-6K-G-admission-tuition-type-normalization-20260608"));
check('index cache bust updated', files.index.includes('main.js?v=admission-tuition-type-normalization-20260608'));
check('normalizer exists', files.app.includes('window.normalizeFinanceTransactionType'));
check('Thu nhập học maps to Học phí', files.app.includes("return 'Học phí';") && files.app.includes('isAdmissionTuitionType'));
check('buildPaymentBundleTransaction no longer uses receiptType as accounting type first', !files.app.includes("if (receiptType) type = receiptType;"));
check('buildPaymentBundleTransaction preserves receiptType field', files.app.includes('receiptType: safeReceiptType'));
check('buildPaymentBundleTransaction forces tuition components to Học phí', files.app.includes("else if (hasTuition) type = 'Học phí';"));
check('financeRenderer uses normalized type', files.financeRenderer.includes('normalizeFinanceTransactionType') && files.financeRenderer.includes('getFinanceTransactionDisplayType'));
check('monthly history uses normalized type', files.monthlyHelpers.includes('_normFinanceType') && files.monthlyHelpers.includes('Thu nhập học'));
check('monthly history uses component accounting', files.monthlyHelpers.includes('components là nguồn kế toán chính') && files.monthlyHelpers.includes('_componentAllocatedAmountForMonth'));
check('canonical report export uses normalized/component accounting', files.reports.includes('normalizeFinanceTransactionType') && files.reports.includes('components làm nguồn chính') && !files.finance.includes("ensureXlsxReady?.('finance-excel-export')"));
check('reports export displays normalized type', files.reports.includes('getFinanceTransactionDisplayType') && files.reports.includes("Thu nhập học' ? 'Học phí"));
check('debugAdmissionTuitionTypeNormalization exists', files.app.includes('debugAdmissionTuitionTypeNormalization'));
check('runtime smoke includes admission normalization', files.main.includes('admissionTuitionTypeNormalization'));
check('functions normalize Thu nhập học as Học phí', files.functionsHelpers.includes('function normalizeFinanceType') && files.functionsHelpers.includes("raw === 'Thu nhập học' ? 'Học phí'"));
check('functions classify components as accounting authority', files.functionsHelpers.includes('function classifyComponentForStats') && files.functionsHelpers.includes("c.kind === 'tuition'") && files.functionsHelpers.includes("c.kind === 'inventory'"));
check('statsAggregation uses component-aware update expansion', files.statsAggregation.includes('function getStatsUpdateItems') && files.statsAggregation.includes('updateStatsExpanded'));
check('statsAggregation no longer allocates whole bundle amount as tuition package', !files.statsAggregation.includes("if (tx.type === 'Học phí' && Array.isArray(tx.packageMonths)"));
check('statsAggregation rebuild uses getStatsUpdateItems', files.statsAggregation.includes('const updateItems = getStatsUpdateItems(tx)'));
check('processMultiItem not removed', files.app.includes('window.processMultiItem'));
check('buildPaymentBundleTransaction not removed', files.app.includes('window.buildPaymentBundleTransaction = function'));

const failed = checks.filter(c => !c.ok);
console.table(checks);
if (failed.length) {
  console.error('\n❌ check-admission-tuition-type-normalization failed:');
  failed.forEach(f => console.error('-', f.name, f.detail || ''));
  process.exit(1);
}
console.log('\n✅ check-admission-tuition-type-normalization passed (' + checks.length + '/' + checks.length + ')');
