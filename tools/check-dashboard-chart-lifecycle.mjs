/**
 * tools/check-dashboard-chart-lifecycle.mjs
 * Phase 4K-5N — Verify Chart.js lifecycle safety in dashboard.js
 *
 * Fails if:
 *   1. dashboard.js doesn't use Chart.getChart
 *   2. dashboard.js creates new Chart without destroying orphan first
 *   3. debugDashboardCharts is absent
 *   4. fetchHistoricalDashboardFallback calls renderDashboardCharts twice directly
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

console.log('\n🔍 Phase 4K-5N — check-dashboard-chart-lifecycle\n');

const dash = readFile('js/modules/dashboard.js');
check('dashboard.js readable', !!dash, 'File không tìm thấy: js/modules/dashboard.js');

if (!dash) {
    console.error('\n❌ Cannot continue — dashboard.js missing\n');
    process.exit(1);
}

// 1. Uses Chart.getChart to detect orphan instances
check(
    'dashboard.js uses Chart.getChart (orphan detection)',
    dash.includes('Chart.getChart'),
    'Thêm _getCanvasChart helper dùng Chart.getChart(canvas) vào dashboard.js'
);

// 2. Destroys orphan chart before creating new Chart instance
check(
    'dashboard.js destroys orphan before new Chart()',
    dash.includes('_safeDestroyChart') && dash.includes('orphan'),
    'Thêm: const orphan = _getCanvasChart(Chart, finEl); if (orphan) _safeDestroyChart(orphan);'
);

// 3. debugDashboardCharts is exposed
check(
    'window.debugDashboardCharts được export',
    dash.includes('window.debugDashboardCharts'),
    'Thêm window.debugDashboardCharts = function() {...} vào initDashboard()'
);

// 4. fetchHistoricalDashboardFallback does NOT call renderDashboardCharts twice directly
// Both of these should NOT coexist as separate calls:
const hasBothDirectCalls = dash.includes('try { renderDashboardCharts(chartData)') &&
    dash.includes('try { window.renderDashboardCharts(chartData)');
check(
    'fetchHistoricalDashboardFallback không gọi renderDashboardCharts 2 lần trực tiếp',
    !hasBothDirectCalls,
    'Deduplicate: dùng 1 biến _renderChartsFn = window.renderDashboardCharts || renderDashboardCharts, gọi 1 lần'
);

// 5. normalizeBranchCodeForStats exists
check(
    'window.normalizeBranchCodeForStats được định nghĩa',
    dash.includes('window.normalizeBranchCodeForStats'),
    'Thêm window.normalizeBranchCodeForStats = function(branchInput, branchCount) {...}'
);

// 6. getComponentAmountForSelectedMonth exists
check(
    'window.getComponentAmountForSelectedMonth được định nghĩa',
    dash.includes('window.getComponentAmountForSelectedMonth'),
    'Thêm window.getComponentAmountForSelectedMonth = function(component, selectedMonth) {...}'
);

// 7. _destroyDashboardCharts clears store chart instances
check(
    '_destroyDashboardCharts clear cả store chart instances khi logout',
    dash.includes('_destroyDashboardCharts') && dash.includes('_setFinChart(null)') && dash.includes('_setMemChart(null)'),
    'Trong _destroyDashboardCharts: gọi _setFinChart(null) và _setMemChart(null)'
);

console.log('');
if (failures === 0) {
    console.log(`\x1b[32m✅ All dashboard chart lifecycle checks passed\x1b[0m\n`);
    process.exit(0);
} else {
    console.log(`\x1b[31m❌ ${failures} check(s) failed\x1b[0m\n`);
    process.exit(1);
}
