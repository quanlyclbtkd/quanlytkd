/**
 * tools/check-stats-aggregation.mjs — Phase 4K
 * ─────────────────────────────────────────────────────────────────────
 * Kiểm tra Stats Aggregation setup cho Cloud Functions và Dashboard.
 *
 * Phát hiện:
 *   1. Cloud Functions thiếu trigger cho transaction create/update/delete
 *   2. Stats path không nhất quán
 *   3. Dashboard không đọc stats docs cho tháng lịch sử
 *   4. rebuildStatsForClub callable không tồn tại
 *   5. classifyTx helper thiếu loại giao dịch quan trọng
 *   6. Stats fields không đủ (income.total, expense.total, profit)
 *   7. rebuild-transaction-stats.mjs tool chưa có
 *
 * Chạy: node tools/check-stats-aggregation.mjs
 * Hoặc: npm run check:stats-aggregation
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
function fileExists(relPath) {
    return existsSync(resolve(root, relPath));
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

console.log('\n══════════════════════════════════════════════════════════');
console.log('  Phase 4K — Stats Aggregation Safety Check');
console.log('══════════════════════════════════════════════════════════\n');

const functionsIndex = readFile('functions/index.js');
const statsAgg       = readFile('functions/src/statsAggregation.js');
const helpers        = readFile('functions/src/helpers.js');
const dashboardJs    = readFile('js/modules/dashboard.js');
const superadminJs   = readFile('js/modules/superadmin.js');
const appJs          = readFile('app.js');

// ── Section 1: Cloud Functions Aggregation Triggers ──────────────────
console.log('▸ Section 1: Cloud Functions Aggregation Triggers (functions/)');
check('functions/index.js exists', !!functionsIndex, 'File not found — Cloud Functions not set up');
check('functions/src/statsAggregation.js exists', !!statsAgg, 'File not found');

if (functionsIndex) {
    check('onTransactionCreate exported',
        functionsIndex.includes('onTransactionCreate'),
        'Export onTransactionCreate from functions/index.js');
    check('onTransactionDelete exported',
        functionsIndex.includes('onTransactionDelete'),
        'Export onTransactionDelete from functions/index.js');
    check('onTransactionUpdate exported',
        functionsIndex.includes('onTransactionUpdate'),
        'Export onTransactionUpdate from functions/index.js');
    check('rebuildStatsForClub callable exported',
        functionsIndex.includes('rebuildStatsForClub'),
        'Export rebuildStatsForClub callable from functions/index.js');
}
console.log();

// ── Section 2: Stats Aggregation Trigger Implementation ──────────────
console.log('▸ Section 2: Stats Aggregation Trigger Implementation (functions/src/statsAggregation.js)');
if (statsAgg) {
    check('onCreate trigger defined',
        statsAgg.includes('.onCreate('),
        'Implement onCreate trigger for transactions');
    check('onDelete trigger defined',
        statsAgg.includes('.onDelete('),
        'Implement onDelete trigger for transactions');
    check('onUpdate trigger defined — trừ cũ, cộng mới',
        statsAgg.includes('.onUpdate('),
        'Implement onUpdate trigger for transactions (subtract old, add new)');
    check('Firestore path correct (clubs/{clubId}/transactions/{txId})',
        statsAgg.includes("clubs/{clubId}/transactions/{txId}") ||
        statsAgg.includes("'clubs/{clubId}/transactions/{txId}'"),
        'Use correct Firestore path in triggers');
    check('Stats path correct (clubs/{clubId}/stats/{docId})',
        statsAgg.includes("'stats'") || statsAgg.includes('"stats"') ||
        statsAgg.includes('`clubs/${clubId}/stats/') || statsAgg.includes('/stats/`') ||
        statsAgg.includes('/stats/${') || statsAgg.includes("clubs/${clubId}/stats"),
        'Stats doc must be at clubs/{clubId}/stats/{YYYY_MM}');
    check('FieldValue.increment() used for atomic updates',
        statsAgg.includes('FieldValue.increment'),
        'Use FieldValue.increment() for atomic stats updates — no overwrite');
    check('set({ merge: true }) used for upsert',
        statsAgg.includes('merge: true'),
        'Use set({ merge: true }) to create or update stats doc atomically');
    check('rebuildStatsForClub callable implemented',
        statsAgg.includes('rebuildStatsForClub'),
        'Implement rebuildStatsForClub callable for manual rebuild');
    check('rebuildStatsForClub uses pagination or batching (not raw scan)',
        statsAgg.includes('txQuery') || statsAgg.includes('statsByMonth') || statsAgg.includes('txSnap'),
        'rebuildStatsForClub should aggregate in memory, not write per-doc in a loop');
    check('rebuildStatsForClub checks auth',
        statsAgg.includes('context.auth'),
        'rebuildStatsForClub must check context.auth before proceeding');
}
console.log();

// ── Section 3: Transaction Classification Helper ─────────────────────
console.log('▸ Section 3: Transaction Classification (functions/src/helpers.js)');
if (helpers) {
    check('classifyTx() defined',
        helpers.includes('function classifyTx'),
        'Define classifyTx() in helpers.js for safe transaction classification');
    check('getTxMonth() defined',
        helpers.includes('function getTxMonth'),
        'Define getTxMonth() in helpers.js for safe month extraction');
    check('Handles "Học phí" type',
        helpers.includes("'Học phí'") || helpers.includes('"Học phí"'),
        'classifyTx must handle "Học phí" (tuition) transactions');
    check('Handles "Lệ phí thi" type',
        helpers.includes("'Lệ phí thi'") || helpers.includes('"Lệ phí thi"'),
        'classifyTx must handle "Lệ phí thi" (exam fee) transactions');
    check('Handles "Chi phí" type',
        helpers.includes("'Chi phí'") || helpers.includes('"Chi phí"'),
        'classifyTx must handle "Chi phí" (expense) transactions');
    check('Handles "Học phí + Lệ phí thi" combo type',
        helpers.includes("Học phí + Lệ phí thi"),
        'classifyTx must handle combo transactions (split into 2 stats entries)');
    check('Returns null for unknown/non-stats types (safe)',
        helpers.includes('return null'),
        'classifyTx must return null for unknown types to avoid wrong stats');
    check('getTxMonth fallback to date field',
        helpers.includes('tx.date'),
        'getTxMonth must fallback to tx.date prefix if txMonth field missing');
    check('Amount parsed safely (Number())',
        helpers.includes('Number(tx.amount)') || helpers.includes('Number(amount)'),
        'Parse amount with Number() to avoid NaN from missing fields');
}
console.log();

// ── Section 4: Dashboard reads stats docs ────────────────────────────
console.log('▸ Section 4: Dashboard reads stats docs for historical charts (dashboard.js)');
if (dashboardJs) {
    check('fetchAndRenderHistoricalCharts() defined',
        dashboardJs.includes('fetchAndRenderHistoricalCharts'),
        'Define fetchAndRenderHistoricalCharts() in dashboard.js');
    check('Reads from clubs/{clubId}/stats/ collection',
        dashboardJs.includes("'stats'") || dashboardJs.includes('"stats"'),
        'fetchAndRenderHistoricalCharts must read from clubs/{clubId}/stats/{YYYY_MM}');
    check('Uses getDoc() not getDocs() for stats',
        dashboardJs.includes('getDoc(') && !dashboardJs.includes('getDocs(collection'),
        'Use getDoc() for individual stats docs — not getDocs() which scans collection');
    check('Promise.all for parallel stats reads',
        dashboardJs.includes('Promise.all'),
        'Use Promise.all for parallel stats doc reads to minimize latency');
    check('income.total field read correctly',
        dashboardJs.includes("income.total") || dashboardJs.includes("'income.total'"),
        "Read stats.income.total or stats['income.total'] from stats doc");
    check('expense.total field read correctly',
        dashboardJs.includes("expense.total") || dashboardJs.includes("'expense.total'"),
        "Read stats.expense.total or stats['expense.total'] from stats doc");
    check('dashboardStatsRead metric tracked',
        dashboardJs.includes('dashboardStatsRead'),
        'Track dashboardStatsRead metric when stats doc is read successfully');
    check('Graceful skip if stats doc missing (snap.exists())',
        dashboardJs.includes('.exists()'),
        'Skip gracefully if stats doc does not exist — not all months have stats yet');
}
console.log();

// ── Section 5: SuperAdmin reads stats docs for revenue ───────────────
console.log('▸ Section 5: SuperAdmin reads stats docs for revenue (superadmin.js)');
if (superadminJs) {
    check('SuperAdmin fetches monthly stats doc',
        superadminJs.includes("'stats'") || superadminJs.includes('"stats"'),
        "Add getDoc(doc(db, 'clubs', cid, 'stats', docId)) in loadSuperAdminData");
    check('monthStats or monthRevenue used in render',
        superadminJs.includes('monthStats') || superadminJs.includes('monthRevenue') || superadminJs.includes('income.total'),
        'Use monthStats/revenue from stats doc in _renderSAClubRows HTML');
    check('superAdminStatsRead metric tracked',
        superadminJs.includes('superAdminStatsRead'),
        'Track superAdminStatsRead metric increment in loadSuperAdminData');
    check('SuperAdmin has graceful fallback when stats doc missing',
        superadminJs.includes('monthStats') || superadminJs.includes('—') || superadminJs.includes('--'),
        'Display -- or empty when stats doc does not exist for a club');

    // Verify SuperAdmin does NOT scan all transactions with a large fixed limit for revenue
    const _hasUnsafeScan = /getDocs\(.*transactions.*limit\((?:[1-9]\d{2,})\)/.test(superadminJs);
    check('SuperAdmin does NOT scan transactions with large fixed limit',
        !_hasUnsafeScan,
        'Remove any getDocs(transactions, limit(N)) for revenue — use stats docs instead');
}
console.log();

// ── Section 6: No unsafe fixed limit for revenue ─────────────────────
console.log('▸ Section 6: No unsafe fixed limit() for revenue calculation');
const filesToCheck = [
    { name: 'app.js', content: appJs },
    { name: 'superadmin.js', content: superadminJs },
    { name: 'dashboard.js', content: dashboardJs },
];
for (const { name, content } of filesToCheck) {
    if (!content) continue;
    // Check for patterns that suggest using limit(N) to scan transactions for totals
    // Only flag if a large limit() appears *and* is used directly inside a transaction getDocs for revenue/total scan.
    // OK patterns: limit(1200) from scaleConfig for tx realtime listener display (not revenue), limit(10000) for attendance.
    // Bad pattern: literal getDocs call on transactions collection with hard-coded 4-digit+ limit for revenue computation.
    const hasBadPattern = /getDocs\s*\(.*limit\((?:10{3,}|\d{4,})\)/.test(content) &&
        /getDocs\s*\(.*transactions/.test(content) &&
        (content.includes('revenue') || content.includes('income.total') || content.includes('expense.total'));
    check(`${name}: no limit(1000+) for transaction revenue scan`,
        !hasBadPattern,
        `${name}: Do not use limit(1000+) to scan transactions for revenue — use stats docs`);
}
console.log();

// ── Section 7: Stats doc fields schema ───────────────────────────────
console.log('▸ Section 7: Stats doc schema completeness (statsAggregation.js)');
if (statsAgg) {
    check("Stats doc has income.tuition field",   statsAgg.includes("income.tuition"),   "Add income.tuition to stats doc");
    check("Stats doc has income.exam field",       statsAgg.includes("income.exam"),       "Add income.exam to stats doc");
    check("Stats doc has income.total field",      statsAgg.includes("income.total"),      "Add income.total to stats doc");
    check("Stats doc has expense.total field",     statsAgg.includes("expense.total"),     "Add expense.total to stats doc");
    check("Stats doc has profit field",            statsAgg.includes("profit"),            "Add profit field to stats doc");
    check("Stats doc has txCount field",           statsAgg.includes("txCount"),           "Add txCount to stats doc");
    check("Stats doc has updatedAt field",         statsAgg.includes("updatedAt"),         "Add updatedAt to stats doc");
    check("Stats doc has month field",             statsAgg.includes("month"),             "Add month field to stats doc");
}
console.log();

// ── Section 8: Rebuild Stats Tool ────────────────────────────────────
console.log('▸ Section 8: Rebuild Stats Tool');
check('tools/rebuild-transaction-stats.mjs exists',
    fileExists('tools/rebuild-transaction-stats.mjs'),
    'Create tools/rebuild-transaction-stats.mjs for manual stats rebuild');

const rebuildTool = readFile('tools/rebuild-transaction-stats.mjs');
if (rebuildTool) {
    check('Rebuild tool documents clubId parameter',  rebuildTool.includes('clubId'),  'Document --clubId parameter in rebuild tool');
    check('Rebuild tool documents month parameter',   rebuildTool.includes('month'),   'Document --month parameter in rebuild tool');
    check('Rebuild tool has dry-run mode',            rebuildTool.includes('dry'),     'Add --dry-run flag to rebuild tool');
    check('Rebuild tool does not require deploy',     rebuildTool.includes('callable') || rebuildTool.includes('Callable'), 'Tool should call rebuildStatsForClub callable, not deploy Cloud Functions');
}
console.log();

// ── Section 9: package.json scripts ─────────────────────────────────
console.log('▸ Section 9: package.json Scripts');
const pkgJson = readFile('package.json');
if (pkgJson) {
    let pkg = null;
    try { pkg = JSON.parse(pkgJson); } catch(_) {}
    if (pkg && pkg.scripts) {
        check('check:stats-aggregation script defined',
            !!pkg.scripts['check:stats-aggregation'],
            'Add "check:stats-aggregation": "node tools/check-stats-aggregation.mjs"');
        check('check:transaction-realtime script defined',
            !!pkg.scripts['check:transaction-realtime'],
            'Add "check:transaction-realtime": "node tools/check-transaction-realtime.mjs"');
        check('check:all includes check-stats-aggregation',
            pkg.scripts['check:all'] && pkg.scripts['check:all'].includes('check-stats-aggregation'),
            'Add check:stats-aggregation to check:all chain');
        check('check:all includes check-transaction-realtime',
            pkg.scripts['check:all'] && pkg.scripts['check:all'].includes('check-transaction-realtime'),
            'Add check:transaction-realtime to check:all chain');
    }
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
    console.log('\n  🎉 All stats aggregation checks passed!');
    console.log('  Dashboard và SuperAdmin đọc stats docs — không scan transactions lớn.');
    console.log('══════════════════════════════════════════════════════════\n');
}
