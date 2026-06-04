/**
 * tools/check-monthly-revenue-allocation.mjs — Phase 4K-4G
 *
 * Kiểm tra static: đảm bảo cơ chế phân bổ doanh thu theo tháng tồn tại đúng.
 * Chạy: npm run check:monthly-revenue-allocation
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
let total = 0;

function check(label, condition, hint) {
    total++;
    if (condition) {
        console.log(`${PASS}  ${label}`);
    } else {
        console.log(`${FAIL}  ${label}`);
        if (hint) console.log(`       💡 ${hint}`);
        failures++;
    }
}

console.log('\n🔍 Phase 4K-4G — Monthly Revenue Allocation Check\n');

const monthlyHelpers   = readFile('js/utils/monthlyHelpers.js');
const mainJs           = readFile('js/main.js');
const dashboardJs      = readFile('js/modules/dashboard.js');
const reportsJs        = readFile('js/modules/reports.js');
const helpersJs        = readFile('functions/src/helpers.js');
const statsAggJs       = readFile('functions/src/statsAggregation.js');

// ── 1. monthlyHelpers.js tồn tại và export đúng ───────────────────────────
console.log('▸ Section 1: js/utils/monthlyHelpers.js');

check('monthlyHelpers.js tồn tại', !!monthlyHelpers,
    'Tạo file js/utils/monthlyHelpers.js với các helper functions');

if (monthlyHelpers) {
    check('export getRecentMonths', monthlyHelpers.includes('export function getRecentMonths'),
        'Thêm: export function getRecentMonths(endMonth, count = 6)');

    check('export getTxAllocatedAmountForMonth', monthlyHelpers.includes('export function getTxAllocatedAmountForMonth'),
        'Thêm: export function getTxAllocatedAmountForMonth(tx, month)');

    check('export loadTransactionsForMonthsInclusive',
        monthlyHelpers.includes('export function loadTransactionsForMonthsInclusive') ||
        monthlyHelpers.includes('export async function loadTransactionsForMonthsInclusive'),
        'Thêm: export [async] function loadTransactionsForMonthsInclusive(months, reason)');

    check('export computeMonthlyFinanceHistory', monthlyHelpers.includes('export function computeMonthlyFinanceHistory'),
        'Thêm: export function computeMonthlyFinanceHistory(transactions, months)');

    check('export getStudentJoinTimestamp', monthlyHelpers.includes('export function getStudentJoinTimestamp'),
        'Thêm: export function getStudentJoinTimestamp(name, profile)');

    check('export debugMonthlyRevenueAllocation',
        monthlyHelpers.includes('export function debugMonthlyRevenueAllocation') ||
        monthlyHelpers.includes('export async function debugMonthlyRevenueAllocation'),
        'Thêm: export [async] function debugMonthlyRevenueAllocation(endMonth)');

    check('export initMonthlyHelpers', monthlyHelpers.includes('export function initMonthlyHelpers'),
        'Thêm: export function initMonthlyHelpers() { window.getRecentMonths = ...; ... }');

    check('initMonthlyHelpers đăng ký window.getRecentMonths',
        monthlyHelpers.includes('window.getRecentMonths'),
        'initMonthlyHelpers phải gán window.getRecentMonths = getRecentMonths');

    check('initMonthlyHelpers đăng ký window.getTxAllocatedAmountForMonth',
        monthlyHelpers.includes('window.getTxAllocatedAmountForMonth'),
        'initMonthlyHelpers phải gán window.getTxAllocatedAmountForMonth = getTxAllocatedAmountForMonth');

    check('getTxAllocatedAmountForMonth xử lý packageMonths',
        monthlyHelpers.includes('packageMonths'),
        'getTxAllocatedAmountForMonth phải kiểm tra Array.isArray(tx.packageMonths)');
}

// ── 2. main.js import và khởi tạo monthlyHelpers ──────────────────────────
console.log('\n▸ Section 2: js/main.js');

if (mainJs) {
    check('main.js import initMonthlyHelpers từ monthlyHelpers.js',
        mainJs.includes("from './utils/monthlyHelpers.js'"),
        "Thêm: import { initMonthlyHelpers } from './utils/monthlyHelpers.js';");

    check('main.js gọi initMonthlyHelpers()',
        mainJs.includes('initMonthlyHelpers()'),
        'Thêm: initMonthlyHelpers(); trước initDashboard()');

    check('debugRuntimeSmokeTest tham chiếu debugMonthlyRevenueAllocation',
        mainJs.includes('debugMonthlyRevenueAllocation'),
        'Thêm safeCall cho debugMonthlyRevenueAllocation vào window.debugRuntimeSmokeTest');

    check('summary có monthlyRevenueAllocationOk',
        mainJs.includes('monthlyRevenueAllocationOk'),
        'Thêm monthlyRevenueAllocationOk: !!out.monthlyRevenueAllocation.ok vào summary');
}

// ── 3. dashboard.js sử dụng getRecentMonths và loadTransactionsForMonthsInclusive ──
console.log('\n▸ Section 3: js/modules/dashboard.js');

if (dashboardJs) {
    check('dashboard.js dùng window.getRecentMonths',
        dashboardJs.includes('window.getRecentMonths'),
        'fetchHistoricalDashboardFallback phải dùng window.getRecentMonths nếu có');

    check('dashboard.js dùng window.loadTransactionsForMonthsInclusive cho fallback',
        dashboardJs.includes('loadTransactionsForMonthsInclusive'),
        'Trong fallback path, dùng window.loadTransactionsForMonthsInclusive([month], ...)');

    check('dashboard.js dùng window.computeMonthlyFinanceHistory',
        dashboardJs.includes('computeMonthlyFinanceHistory'),
        'Dùng window.computeMonthlyFinanceHistory(_fallbackTxs, [month]) để tính income/expense');

    check('dashboard.js dùng window.formatMonthLabel',
        dashboardJs.includes('window.formatMonthLabel'),
        'Labels nên dùng window.formatMonthLabel nếu có');
}

// ── 4. reports.js phân bổ gói học phí đúng ───────────────────────────────
console.log('\n▸ Section 4: js/modules/reports.js');

if (reportsJs) {
    check('reports.js phân bổ packageMonths khi tính incTuition',
        reportsJs.includes('packageMonths') && reportsJs.includes('_allocTuition'),
        'Trong txAll.forEach, dùng packageMonths để phân bổ đúng incTuition cho kỳ báo cáo');

    check('reports.js lọc tháng trong kỳ (_mInPeriod)',
        reportsJs.includes('_mInPeriod') || reportsJs.includes('InPeriod'),
        'Chỉ tính các tháng trong kỳ báo cáo: packageMonths.filter(pm => pm >= _startM && pm <= _endM)');
}

// ── 5. functions/src/helpers.js có allocateTuitionAmountForMonth ──────────
console.log('\n▸ Section 5: functions/src/helpers.js');

if (helpersJs) {
    check('helpers.js có hàm allocateTuitionAmountForMonth',
        helpersJs.includes('function allocateTuitionAmountForMonth'),
        'Thêm function allocateTuitionAmountForMonth(tx, month) vào helpers.js');

    check('helpers.js export allocateTuitionAmountForMonth',
        helpersJs.includes('allocateTuitionAmountForMonth'),
        'Thêm allocateTuitionAmountForMonth vào module.exports');
}

// ── 6. statsAggregation.js xử lý packageMonths trong triggers ────────────
console.log('\n▸ Section 6: functions/src/statsAggregation.js');

if (statsAggJs) {
    check('statsAggregation.js import allocateTuitionAmountForMonth',
        statsAggJs.includes('allocateTuitionAmountForMonth'),
        "import { allocateTuitionAmountForMonth } từ './helpers'");

    check('onTransactionCreate xử lý packageMonths',
        statsAggJs.includes('packageMonths') &&
        statsAggJs.includes('onCreate'),
        'onTransactionCreate: nếu tx.packageMonths tồn tại → cập nhật stats cho từng tháng');

    check('onTransactionDelete xử lý packageMonths',
        (function() {
            const deleteIdx = statsAggJs.indexOf('onDelete');
            return deleteIdx !== -1 && statsAggJs.indexOf('packageMonths', deleteIdx) !== -1;
        })(),
        'onTransactionDelete: nếu tx.packageMonths tồn tại → trừ stats cho từng tháng');
}

// ── Summary ───────────────────────────────────────────────────────────────
console.log('');
if (failures === 0) {
    console.log(`\x1b[32m🎉 Tất cả ${total} checks passed — Monthly Revenue Allocation OK!\x1b[0m\n`);
    process.exit(0);
} else {
    console.log(`\x1b[31m❌ ${failures}/${total} checks FAILED\x1b[0m\n`);
    process.exit(1);
}
