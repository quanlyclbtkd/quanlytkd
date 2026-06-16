#!/usr/bin/env node
import { readFileSync } from 'fs';

const dashboard = readFileSync('js/modules/dashboard.js', 'utf8');
const lcr = readFileSync('js/ui/render/listComputationRefresh.js', 'utf8');
const tabs = readFileSync('js/ui/tabs.js', 'utf8');
const app = readFileSync('app.js', 'utf8');
const main = readFileSync('js/main.js', 'utf8');

let pass = 0;
let fail = 0;
function check(label, condition) {
  if (condition) { console.log('✅ ' + label); pass++; }
  else { console.error('❌ ' + label); fail++; }
}

console.log('\n=== Phase 4K-6V1 — Spark Read Cost Hardening ===\n');

check('Build marker 4K-6V1 exists', main.includes('4K-6V1-spark-read-cost-hardening'));
check('Dashboard history has TTL cache', dashboard.includes('_SPARK_HISTORY_TTL_MS') && dashboard.includes('localStorage.setItem'));
check('TTL is at least one hour', /_SPARK_HISTORY_TTL_MS\s*=\s*6\s*\*\s*60\s*\*\s*60\s*\*\s*1000/.test(dashboard));
check('Dashboard history uses single-flight map', dashboard.includes('_sparkHistoryInFlight') && dashboard.includes('.has(key)'));
check('Hidden dashboard skips network history fetch', dashboard.includes('dashboardHistorySkippedHidden') && dashboard.includes("skipped: 'dashboard-hidden'"));
check('Dashboard history is explicitly scheduled on dashboard tab open', tabs.includes('scheduleDashboardHistoryFetch') && tabs.includes('dashboard-tab-open'));
check('Dashboard recompute routes through scheduler', lcr.includes('scheduleDashboardHistoryFetch'));
check('Legacy direct fetch fallback is visibility-gated', lcr.includes("_active.id === 'tab_dashboard'"));
check('6-month fallback uses one txMonth range loader', dashboard.includes('loadTransactionsForTxMonthRange'));
check('6-month fallback uses one date range loader', dashboard.includes('loadTransactionsForDateRange'));
check('6-month package query uses array-contains-any', dashboard.includes("'array-contains-any'"));
check('Old per-month dashboard transaction fallback removed', !dashboard.includes("loadTransactionsForMonthsInclusive(\n                        [month]"));
check('Read metrics are exposed', dashboard.includes('printSparkReadMetrics') && dashboard.includes('__sparkReadMetrics'));
check('Same-month transaction listener re-subscribe guard exists', app.includes('_activeTxListenerMonth === monthStr') && app.includes('txSameMonthResubscribeSkipped'));
check('Transaction snapshots coalesce dashboard invalidation', app.includes('_invalidateDashboardCoalesced') && app.includes('transactions-snapshot-coalesced'));
check('Financial write flows remain present', app.includes('window.processMultiItem') && app.includes('window.quickPay'));
check('No Cloud Functions dependency added to Spark dashboard path', !dashboard.includes('httpsCallable(') && !lcr.includes('httpsCallable('));

console.log(`\nTotal: ${pass + fail} | PASS: ${pass} | FAIL: ${fail}`);
if (fail) process.exit(1);
console.log('Spark read-cost hardening checks passed.\n');
