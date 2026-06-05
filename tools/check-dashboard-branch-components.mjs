/**
 * tools/check-dashboard-branch-components.mjs
 * Phase 4K-5N — Verify branch revenue uses components as primary source
 *
 * Fails if:
 *   1. normalizeBranchCodeForStats is absent
 *   2. getComponentAmountForSelectedMonth is absent
 *   3. financeRenderer branch stats doesn't use getAccountingComponents / expandTransactionComponentsForAccounting
 *   4. financeRenderer branch stats still only relies on t.type (no component path)
 *   5. Double-count risk: incTuition/incExam counted again after component loop
 *   6. debugDashboardBranchRevenue is absent
 *   7. debugRuntimeSmokeTest doesn't include dashboardBranchRevenue
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

console.log('\n🔍 Phase 4K-5N — check-dashboard-branch-components\n');

const dash   = readFile('js/modules/dashboard.js');
const fin    = readFile('js/ui/render/computation/financeRenderer.js');
const mainJs = readFile('js/main.js');

check('dashboard.js readable',    !!dash,   'js/modules/dashboard.js không tìm thấy');
check('financeRenderer.js readable', !!fin, 'js/ui/render/computation/financeRenderer.js không tìm thấy');
check('js/main.js readable',      !!mainJs, 'js/main.js không tìm thấy');

if (!dash || !fin || !mainJs) {
    console.error('\n❌ Cannot continue — required files missing\n');
    process.exit(1);
}

// 1. normalizeBranchCodeForStats
check(
    'window.normalizeBranchCodeForStats được định nghĩa trong dashboard.js',
    dash.includes('window.normalizeBranchCodeForStats'),
    'Thêm window.normalizeBranchCodeForStats = function(branchInput, branchCount) {...} vào initDashboard()'
);

// 2. getComponentAmountForSelectedMonth
check(
    'window.getComponentAmountForSelectedMonth được định nghĩa trong dashboard.js',
    dash.includes('window.getComponentAmountForSelectedMonth'),
    'Thêm window.getComponentAmountForSelectedMonth = function(component, selectedMonth) {...} vào initDashboard()'
);

// 3. financeRenderer uses getAccountingComponents or expandTransactionComponentsForAccounting for branch stats
const finUsesCompFn = fin.includes('getAccountingComponents') || fin.includes('expandTransactionComponentsForAccounting');
check(
    'financeRenderer branch stats dùng getAccountingComponents / expandTransactionComponentsForAccounting',
    finUsesCompFn,
    'Thêm: const _brComps = window.getAccountingComponents(t) || window.expandTransactionComponentsForAccounting(t) || t.components'
);

// 4. financeRenderer has a _usedCompBranch / component branch path (not just t.type)
check(
    'financeRenderer branch stats có component path (không chỉ dùng t.type)',
    fin.includes('_usedCompBranch') || fin.includes('_usedComponentBranch'),
    'Thêm: let _usedCompBranch = false; if (components && components.length > 0) { _usedCompBranch = true; ... }'
);

// 5. Double-count prevention — legacy fallback is guarded by !_usedCompBranch
check(
    'financeRenderer có !_usedCompBranch guard để tránh double count',
    fin.includes('!_usedCompBranch') || fin.includes('!usedComponentBranchAccounting'),
    'Bọc legacy fallback trong: if (!_usedCompBranch) { ... }'
);

// 6. financeRenderer uses normalizeBranchCodeForStats for branch lookup
check(
    'financeRenderer dùng normalizeBranchCodeForStats để normalize branch',
    fin.includes('normalizeBranchCodeForStats'),
    'Thêm: const _normBr = window.normalizeBranchCodeForStats(t.branch || "CS1", bCount)'
);

// 7. debugDashboardBranchRevenue
check(
    'window.debugDashboardBranchRevenue được định nghĩa',
    dash.includes('window.debugDashboardBranchRevenue'),
    'Thêm window.debugDashboardBranchRevenue = function() {...} vào initDashboard()'
);

// 8. debugRuntimeSmokeTest includes dashboardBranchRevenue
check(
    'debugRuntimeSmokeTest references debugDashboardBranchRevenue',
    mainJs.includes('debugDashboardBranchRevenue'),
    'Thêm safeCall("debugDashboardBranchRevenue", window.debugDashboardBranchRevenue) vào window.debugRuntimeSmokeTest'
);

// 9. bExamStats is updated in the component path (examKey / examFeeMap)
check(
    'financeRenderer component branch path cập nhật bExamStats',
    fin.includes('bExamStats[') && fin.includes("ck === 'exam'"),
    "Thêm: bExamStats[cBr] += ca khi ck === 'exam' trong component loop"
);

console.log('');
if (failures === 0) {
    console.log(`\x1b[32m✅ All dashboard branch component checks passed\x1b[0m\n`);
    process.exit(0);
} else {
    console.log(`\x1b[31m❌ ${failures} check(s) failed\x1b[0m\n`);
    process.exit(1);
}
