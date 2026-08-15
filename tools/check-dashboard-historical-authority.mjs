#!/usr/bin/env node
/**
 * check-dashboard-historical-authority.mjs
 * Phase 4K-5D: Verify dashboard historical data is protected from current-only overwrite
 */
import { readFileSync } from 'fs';

let failures = 0;
function fail(msg) { console.error('  FAIL:', msg); failures++; }
function pass(msg) { console.log('  PASS:', msg); }

const renderJs     = readFileSync('js/ui/render.js',              'utf8');
const mainJs       = readFileSync('js/main.js',                   'utf8');
const dashJs       = readFileSync('js/modules/dashboard.js',      'utf8');

// listComputationRefresh may or may not exist — optional check
let lcr = '';
try { lcr = readFileSync('js/ui/render/listComputationRefresh.js', 'utf8'); } catch (_) {}

console.log('\n=== check-dashboard-historical-authority ===\n');

// 1. V5U6C render.js may build a RAM-only current-month fallback only when the
// canonical snapshot is not ready. It must explicitly consume the canonical snapshot first.
const hasCanonicalGuard = renderJs.includes('getDashboardCanonicalStatsSnapshot(selMonth)') &&
    renderJs.includes('_canonicalDashboard.ready');
if (!hasCanonicalGuard) {
    fail('render.js does not guard current-only RAM fallback with canonical Dashboard snapshot');
} else {
    pass('render.js protects historical authority with canonical Dashboard snapshot guard');
}

// 2. listComputationRefresh.js guard (if file exists)
if (lcr) {
    const lcrBarePattern = /chartIncome\[idx\]\s*=\s*m\s*===\s*selMonth\s*\?\s*tInc\s*:\s*0/;
    if (lcrBarePattern.test(lcr) && !lcr.includes('getDashboardHistoricalSnapshot')) {
        fail('listComputationRefresh.js has unguarded current-only chartIncome overwrite');
    } else {
        pass('listComputationRefresh.js: no unguarded current-only overwrite');
    }
} else {
    pass('listComputationRefresh.js: not present (skipped)');
}

// 3. getDashboardHistoricalSnapshot must exist (main.js or dashboard.js)
if (!mainJs.includes('getDashboardHistoricalSnapshot') && !dashJs.includes('getDashboardHistoricalSnapshot')) {
    fail('getDashboardHistoricalSnapshot not found in main.js or dashboard.js');
} else {
    pass('getDashboardHistoricalSnapshot exists');
}

// 4. refreshDashboardHistory must exist
if (!mainJs.includes('window.refreshDashboardHistory')) {
    fail('window.refreshDashboardHistory not found in main.js');
} else {
    pass('window.refreshDashboardHistory exists');
}

// 5. V5U6C: fallback decision must use field coverage, not zero-value truthiness
if (!dashJs.includes('stats.coverage.income') || !dashJs.includes('stats.coverage.expense')) {
    fail('fetchHistoricalDashboardFallback does not use explicit stats coverage for fallback');
} else {
    pass('fetchHistoricalDashboardFallback uses explicit stats coverage; zero values remain valid');
}

// 6. debugDashboardHistory must report historicalSnapshot
const ddhIdx = dashJs.indexOf('window.debugDashboardHistory');
if (ddhIdx === -1) {
    fail('debugDashboardHistory not found in dashboard.js');
} else {
    const ddhBlock = dashJs.slice(ddhIdx, ddhIdx + 1200);
    if (!ddhBlock.includes('historicalSnapshot') && !ddhBlock.includes('getDashboardHistoricalSnapshot')) {
        fail('debugDashboardHistory does not report historicalSnapshot');
    } else {
        pass('debugDashboardHistory reports historicalSnapshot');
    }
}

// 7. debugRuntimeSmokeTest must include dashboard history
const smokeIdx = mainJs.indexOf('debugRuntimeSmokeTest');
if (smokeIdx === -1) {
    fail('debugRuntimeSmokeTest not found in main.js');
} else {
    const smokeBlock = mainJs.slice(smokeIdx, smokeIdx + 3000);
    if (!smokeBlock.includes('debugDashboardHistory') && !smokeBlock.includes('dashboardHistory')) {
        fail('debugRuntimeSmokeTest does not include dashboard history check');
    } else {
        pass('debugRuntimeSmokeTest includes dashboard history');
    }
    if (!smokeBlock.includes('debugMonthlyRevenueAllocation') && !smokeBlock.includes('monthlyRevenueAllocation')) {
        fail('debugRuntimeSmokeTest does not include monthly revenue allocation');
    } else {
        pass('debugRuntimeSmokeTest includes monthly revenue allocation');
    }
}

// ── Result ────────────────────────────────────────────────────────
console.log('');
if (failures === 0) {
    console.log('ALL CHECKS PASSED — dashboard historical authority is protected');
    process.exit(0);
} else {
    console.log(`${failures} CHECK(S) FAILED`);
    process.exit(1);
}
