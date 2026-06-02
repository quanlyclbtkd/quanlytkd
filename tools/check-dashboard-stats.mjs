/**
 * tools/check-dashboard-stats.mjs — Phase 4K-FIX
 * ─────────────────────────────────────────────────────────────────────
 * Kiểm tra Dashboard tháng hiện tại ưu tiên stats doc thay vì allTransactions.
 *
 * Phát hiện:
 *   1. Dashboard không có tryApplyCurrentMonthStats()
 *   2. render.js không gọi tryApplyCurrentMonthStats
 *   3. Dashboard tháng hiện tại chỉ tính từ allTransactions với limit cứng
 *   4. Dashboard không đọc stats doc cho tháng hiện tại
 *   5. limit(1000) dùng để tính doanh thu dashboard
 *
 * Chạy: node tools/check-dashboard-stats.mjs
 * Hoặc: npm run check:dashboard-stats
 * ─────────────────────────────────────────────────────────────────────
 */

import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root      = resolve(__dirname, '..');

function readFile(relPath) {
    try { return readFileSync(resolve(root, relPath), 'utf8'); }
    catch (_) { return null; }
}

let pass = 0;
let fail = 0;
const errors = [];

function check(label, condition, hint) {
    if (condition) {
        console.log('  ✅ ' + label);
        pass++;
    } else {
        console.error('  ❌ ' + label);
        if (hint) console.error('     → ' + hint);
        fail++;
        errors.push(label);
    }
}

function warn(label, condition, hint) {
    if (condition) {
        console.log('  ✅ ' + label);
        pass++;
    } else {
        console.warn('  ⚠️  ' + label + (hint ? ' — ' + hint : ''));
    }
}

console.log('\n══════════════════════════════════════════════════════════');
console.log('  Phase 4K-FIX — Dashboard Stats Priority Check');
console.log('══════════════════════════════════════════════════════════\n');

const dashboardJs = readFile('js/modules/dashboard.js');
const renderJs    = readFile('js/ui/render.js');
const appJs       = readFile('app.js');

// ── Section 1: tryApplyCurrentMonthStats defined ──────────────────────
console.log('▸ Section 1: tryApplyCurrentMonthStats() defined (dashboard.js)');
if (dashboardJs) {
    check('dashboard.js exists', true, '');

    check('tryApplyCurrentMonthStats() exported from dashboard.js',
        dashboardJs.includes('export async function tryApplyCurrentMonthStats') ||
        dashboardJs.includes('export function tryApplyCurrentMonthStats'),
        'Add: export async function tryApplyCurrentMonthStats(selMonth) in dashboard.js');

    check('tryApplyCurrentMonthStats reads income.total',
        dashboardJs.includes('income.total') && dashboardJs.includes('tryApplyCurrentMonthStats'),
        'tryApplyCurrentMonthStats must read income.total from stats doc');

    check('tryApplyCurrentMonthStats reads expense.total',
        dashboardJs.includes('expense.total') && dashboardJs.includes('tryApplyCurrentMonthStats'),
        'tryApplyCurrentMonthStats must read expense.total from stats doc');

    check('tryApplyCurrentMonthStats updates totalIncomeDashboard DOM element',
        dashboardJs.includes('totalIncomeDashboard'),
        'tryApplyCurrentMonthStats must update totalIncomeDashboard element with stats data');

    check('tryApplyCurrentMonthStats updates totalExpenseDashboard DOM element',
        dashboardJs.includes('totalExpenseDashboard'),
        'tryApplyCurrentMonthStats must update totalExpenseDashboard element');

    check('tryApplyCurrentMonthStats has safe fallback (returns if no stats)',
        dashboardJs.includes('if (!stats) return') ||
        dashboardJs.includes('if (!stats)'),
        'Must return early if stats doc does not exist — keep allTransactions-based numbers');

    check('tryApplyCurrentMonthStats exposed on window',
        dashboardJs.includes('window.tryApplyCurrentMonthStats'),
        'Expose via window.tryApplyCurrentMonthStats = tryApplyCurrentMonthStats in initDashboard()');

    check('dashboardCurrentMonthStatsRead metric tracked',
        dashboardJs.includes('dashboardCurrentMonthStatsRead'),
        'Track dashboardCurrentMonthStatsRead metric when stats doc is successfully applied');
}
console.log();

// ── Section 2: render.js calls tryApplyCurrentMonthStats ──────────────
console.log('▸ Section 2: render.js calls tryApplyCurrentMonthStats');
if (renderJs) {
    check('render.js exists', true, '');

    check('render.js imports tryApplyCurrentMonthStats from dashboard.js',
        renderJs.includes('tryApplyCurrentMonthStats'),
        'Add tryApplyCurrentMonthStats to import from ../modules/dashboard.js');

    check('render.js calls tryApplyCurrentMonthStats after sync render',
        renderJs.includes('tryApplyCurrentMonthStats(selMonth)'),
        'Call window.tryApplyCurrentMonthStats(selMonth) after updateSummaryNumbers() in renderApp()');

    check('render.js call is async safe (catch handler)',
        renderJs.includes('tryApplyCurrentMonthStats(selMonth).catch'),
        'Wrap tryApplyCurrentMonthStats call in .catch(() => {}) to prevent crashing renderApp');
}
console.log();

// ── Section 3: No unsafe fixed limit for dashboard revenue ────────────
console.log('▸ Section 3: No unsafe fixed limit() for current month dashboard revenue');
if (appJs) {
    check('app.js exists', true, '');

    // Check for limit(1000) used specifically for revenue/income calculation (not for UI display)
    const _unsafeRevenueLimits = [
        /limit\(1000\).*income/,
        /limit\(1000\).*revenue/,
        /limit\(1000\).*totalIncome/,
    ];
    const _hasUnsafeLimit = _unsafeRevenueLimits.some(r => r.test(appJs));
    check('No limit(1000) for income/revenue calculation in app.js',
        !_hasUnsafeLimit,
        'Do not use limit(1000) to calculate revenue — use stats docs via tryApplyCurrentMonthStats');
}
if (dashboardJs) {
    const _hasBadLimit = /getDocs.*limit\(\d{4,}\).*transactions/.test(dashboardJs);
    check('dashboard.js does not scan transactions with large limit',
        !_hasBadLimit,
        'dashboard.js should read stats docs, not scan transactions with large limit');
}
console.log();

// ── Section 4: Stats doc fields read compatibility ────────────────────
console.log('▸ Section 4: Stats field read compatibility (dashboard.js)');
if (dashboardJs) {
    // Both nested and flat key patterns for income.total
    check("Reads income.total flat key (Cloud Functions format)",
        dashboardJs.includes("'income.total'") || dashboardJs.includes('"income.total"'),
        "Read stats['income.total'] — this is how Cloud Functions FieldValue.increment writes it");

    check("Reads income?.total nested (safe optional chaining)",
        dashboardJs.includes("income?.total") || dashboardJs.includes("income.total"),
        "Also read stats.income.total with optional chaining for nested format");

    // fetchMonthStats must be called for current month
    check("fetchMonthStats() used inside tryApplyCurrentMonthStats",
        dashboardJs.includes('fetchMonthStats(selMonth)') ||
        dashboardJs.includes('fetchMonthStats('),
        'tryApplyCurrentMonthStats must call fetchMonthStats() to read stats doc');
}
console.log();

// ── Final Summary ────────────────────────────────────────────────────
console.log('══════════════════════════════════════════════════════════');
console.log('  Total: ' + (pass + fail) + ' checks | ✅ Pass: ' + pass + ' | ❌ Fail: ' + fail);
if (fail > 0) {
    console.error('\nFailed checks:');
    errors.forEach(e => console.error('  - ' + e));
    console.log('══════════════════════════════════════════════════════════\n');
    process.exit(1);
} else {
    console.log('\n  🎉 All dashboard stats checks passed!');
    console.log('  Dashboard tháng hiện tại ưu tiên stats doc — không phụ thuộc allTransactions limit.');
    console.log('══════════════════════════════════════════════════════════\n');
}
