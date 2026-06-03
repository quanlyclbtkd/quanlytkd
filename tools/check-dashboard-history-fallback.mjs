/**
 * tools/check-dashboard-history-fallback.mjs
 * ─────────────────────────────────────────────────
 * Fail nếu reportList chỉ build 1 tháng và không có cơ chế history/fallback.
 *
 * Chạy: node tools/check-dashboard-history-fallback.mjs
 */
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

function readFile(p) {
    try { return readFileSync(resolve(root, p), 'utf8'); } catch (_) { return null; }
}

let pass = 0, fail = 0;
const errors = [];

function check(label, condition, hint) {
    if (condition) { console.log('  ✅ ' + label); pass++; }
    else { console.error('  ❌ ' + label); if (hint) console.error('     → ' + hint); fail++; errors.push(label); }
}

console.log('\n══════════════════════════════════════════════════════════');
console.log('  check:dashboard-history-fallback');
console.log('══════════════════════════════════════════════════════════\n');

const dashboardJs    = readFile('js/modules/dashboard.js');
const listCompRefresh = readFile('js/ui/render/listComputationRefresh.js');
const mainJs          = readFile('js/main.js');

console.log('▸ Section 1: fetchHistoricalDashboardFallback tồn tại');
if (dashboardJs) {
    check(
        'fetchHistoricalDashboardFallback được export từ dashboard.js',
        dashboardJs.includes('export async function fetchHistoricalDashboardFallback'),
        'Thêm: export async function fetchHistoricalDashboardFallback(selMonth, reason) {...}'
    );

    check(
        'fetchHistoricalDashboardFallback đọc stats docs theo tháng (6 tháng)',
        dashboardJs.includes('fetchHistoricalDashboardFallback') &&
        (dashboardJs.includes('stats') && dashboardJs.includes('Promise.all')),
        'fetchHistoricalDashboardFallback phải đọc stats docs song song (Promise.all)'
    );

    check(
        'fetchHistoricalDashboardFallback có transaction fallback khi stats doc không tồn tại',
        dashboardJs.includes('txMonth') || dashboardJs.includes('transactions fallback') ||
        (dashboardJs.includes('fetchHistoricalDashboardFallback') && dashboardJs.includes('hasStat')),
        'Nếu stats doc không tồn tại, phải fallback đọc transactions theo tháng'
    );

    check(
        'fetchHistoricalDashboardFallback build reportRows cho nhiều tháng (vòng lặp)',
        dashboardJs.includes('fetchHistoricalDashboardFallback') &&
        (dashboardJs.includes('reportRows') || dashboardJs.includes('reportHtml')) &&
        dashboardJs.includes('Array(6)'),
        'fetchHistoricalDashboardFallback phải build báo cáo nhiều dòng (6 tháng)'
    );

    check(
        'window.fetchHistoricalDashboardFallback được expose trong initDashboard()',
        dashboardJs.includes('window.fetchHistoricalDashboardFallback = fetchHistoricalDashboardFallback'),
        'initDashboard() phải: window.fetchHistoricalDashboardFallback = fetchHistoricalDashboardFallback;'
    );

    check(
        'debugDashboardHistory được register trong initDashboard()',
        dashboardJs.includes('registerDebugDashboardHistory') &&
        dashboardJs.includes('debugDashboardHistory'),
        'initDashboard() phải gọi registerDebugDashboardHistory() để tạo window.debugDashboardHistory'
    );
}

console.log('\n▸ Section 2: refreshDashboardComputation kích hoạt historical fetch');
if (listCompRefresh) {
    check(
        'refreshDashboardComputation gọi fetchHistoricalDashboardFallback (fire-and-forget)',
        listCompRefresh.includes('fetchHistoricalDashboardFallback'),
        'refreshDashboardComputation phải: window.fetchHistoricalDashboardFallback(_selMonth, reason).catch(...)'
    );
}

console.log('\n▸ Section 3: _cacheAndApplyDashboardSummary — guard ordering đúng');
if (listCompRefresh) {
    check(
        'Guard sử dụng biến `prev` (đọc từ đầu hàm, trước khi assign)',
        listCompRefresh.includes('prevLooksNonEmpty') &&
        listCompRefresh.includes('Number(prev.activeCount') &&
        !listCompRefresh.includes('Number(prevSummary.activeCount'),
        'Guard phải dùng `prev` (đọc từ đầu hàm), không phải `prevSummary` sau khi assign'
    );

    check(
        'window.__store._lastSummaryNumbers được gán SAU khi guard pass',
        (function() {
            const guardIdx = listCompRefresh.indexOf('Skip all-zero overwrite');
            const assignIdx = listCompRefresh.indexOf('_lastSummaryNumbers = summaryNumbers');
            return guardIdx !== -1 && assignIdx !== -1 && guardIdx < assignIdx;
        })(),
        '_lastSummaryNumbers = summaryNumbers phải nằm SAU if (incomingLooksEmpty...) guard'
    );
}

console.log('\n══════════════════════════════════════════════════════════');
console.log('  Total: ' + (pass + fail) + ' | ✅ ' + pass + ' | ❌ ' + fail);
if (fail > 0) {
    errors.forEach(e => console.error('  ❌ ' + e));
    console.log('══════════════════════════════════════════════════════════\n');
    process.exit(1);
} else {
    console.log('\n  🎉 Dashboard history fallback checks passed!');
    console.log('══════════════════════════════════════════════════════════\n');
}
