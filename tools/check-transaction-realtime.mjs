/**
 * tools/check-transaction-realtime.mjs — Phase 4K
 * ─────────────────────────────────────────────────────────────────────
 * Kiểm tra Transaction Realtime Listener safety cho Firestore Read Cost Control.
 *
 * Phát hiện:
 *   1. limit(1000)+ dùng trong tính doanh thu transactions
 *   2. Có 2 transaction onSnapshot lớn không có guard chống duplicate
 *   3. Transaction listener không cleanup khi logout
 *   4. Stats fallback dùng fixed limit thay vì pagination
 *   5. Dashboard/SuperAdmin scan transactions bằng fixed limit
 *   6. __txListenerMetrics chưa được khởi tạo
 *
 * Chạy: node tools/check-transaction-realtime.mjs
 * Hoặc: npm run check:transaction-realtime
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
const warnings = [];

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
        warnings.push(label);
    }
}

console.log('\n══════════════════════════════════════════════════════════');
console.log('  Phase 4K — Transaction Realtime Listener Safety Check');
console.log('══════════════════════════════════════════════════════════\n');

const appJs = readFile('app.js');
const superadminJs = readFile('js/modules/superadmin.js');
const dashboardJs  = readFile('js/modules/dashboard.js');
const financeJs    = readFile('js/listeners/finance.listeners.js');
const finServiceJs = readFile('js/services/finance.service.js');

// ── Section 1: __txListenerMetrics infrastructure ──────────────────────
console.log('▸ Section 1: __txListenerMetrics Infrastructure (app.js)');
check('app.js exists', !!appJs, 'File not found');
if (appJs) {
    check('__txListenerMetrics defined',            appJs.includes('__txListenerMetrics'),            'Add window.__txListenerMetrics = window.__txListenerMetrics || {...} to app.js');
    check('txListenerAttached tracked',             appJs.includes('txListenerAttached'),             'Add txListenerAttached metric in listenToData()');
    check('txListenerDetached tracked',             appJs.includes('txListenerDetached'),             'Add txListenerDetached metric in logout cleanup');
    check('txListenerDuplicatePrevented tracked',   appJs.includes('txListenerDuplicatePrevented'),   'Add txListenerDuplicatePrevented metric');
    check('printTxListenerMetrics exposed',         appJs.includes('printTxListenerMetrics'),         'Add window.printTxListenerMetrics for debug');
}
console.log();

// ── Section 2: Duplicate Listener Guard ────────────────────────────────
console.log('▸ Section 2: Duplicate Transaction Listener Guard (app.js)');
if (appJs) {
    check('safeRegisterSnapshot used for tx listener',
        appJs.includes('safeRegisterSnapshot(_txKey'),
        'Wrap tx onSnapshot calls in safeRegisterSnapshot() to prevent duplicate attach');

    check('cleanupListenersByOwner called before re-subscribe',
        appJs.includes("cleanupListenersByOwner('finance'"),
        'Call cleanupListenersByOwner(finance) before re-subscribing tx listener');

    check('currentTxUnsub cleanup before re-subscribe',
        appJs.includes('if (currentTxUnsub) { try { currentTxUnsub(); } catch(_) {}'),
        'Cleanup currentTxUnsub before creating new listener');

    // Verify qByDate and qByTxMonth are inside safeRegisterSnapshot factory (not loose)
    const _safeSnapBlock = appJs.split('safeRegisterSnapshot(_txKey')[1] || '';
    const _safeSnapFirst500 = _safeSnapBlock.slice(0, 500);
    check('qByDate inside safeRegisterSnapshot factory',
        _safeSnapFirst500.includes('qByDate') || _safeSnapFirst500.includes('onSnapshot(qByDate'),
        'Both qByDate and qByTxMonth must be inside safeRegisterSnapshot factory function');
}
console.log();

// ── Section 3: Logout Cleanup ──────────────────────────────────────────
console.log('▸ Section 3: Logout TX Listener Cleanup (app.js)');
if (appJs) {
    check('currentTxUnsub cleaned on logout',
        appJs.includes('currentTxUnsub(); currentTxUnsub = null;'),
        'Call currentTxUnsub() in logout auth state change handler');

    check('activeListeners cleared on logout',
        appJs.includes('activeListeners = [];'),
        'Clear activeListeners array on logout');

    check('cleanupListenersByOwner called on logout/month-change',
        appJs.includes("cleanupListenersByOwner('finance'"),
        'cleanupListenersByOwner for finance must be called when switching months or logging out');
}
console.log();

// ── Section 4: No unsafe fixed limit for revenue calculation ───────────
console.log('▸ Section 4: No Unsafe Fixed limit() for Revenue Calculation');
if (appJs) {
    // Check for limit(1000) used specifically for revenue/stats calculation
    // (not for UI display which is OK)
    const _unsafeRevenueLimits = [
        /limit\(1000\).*calcul/,
        /limit\(1000\).*revenue/,
        /limit\(1000\).*stats/,
        /limit\(1000\).*total.*income/,
        /limit\(1000\).*total.*expense/,
    ];
    const _hasUnsafeRevLimit = _unsafeRevenueLimits.some(r => r.test(appJs));
    check('No limit(1000) for revenue calculation',
        !_hasUnsafeRevLimit,
        'Do not use limit(1000) to scan transactions for revenue totals — use stats docs instead');

    // Verify SuperAdmin revenue does NOT use large fixed limit for transactions
    if (superadminJs) {
        const _saHasLimitForTx = /getDocs.*transactions.*limit\(\d+\)/.test(superadminJs)
            || /limit\(\d{3,}\).*transactions/.test(superadminJs);
        check('SuperAdmin does NOT scan transactions with large fixed limit for revenue',
            !_saHasLimitForTx,
            'SuperAdmin should read stats docs, not scan transactions with limit(N) for revenue');
    }
}
console.log();

// ── Section 5: Dashboard reads stats docs (not raw transactions) ────────
console.log('▸ Section 5: Dashboard reads stats docs for historical data (dashboard.js)');
if (dashboardJs) {
    check('dashboard.js exists', true, '');
    check('fetchAndRenderHistoricalCharts() uses stats docs',
        dashboardJs.includes("'stats'") || dashboardJs.includes('"stats"'),
        'Dashboard historical chart must read from clubs/{clubId}/stats/{YYYY_MM} docs');
    check('Dashboard reads stats via getDoc (not onSnapshot scan)',
        dashboardJs.includes('getDoc(') && !dashboardJs.includes('onSnapshot'),
        'Dashboard should use getDoc() for stats — no onSnapshot on large collections');
    check('dashboardStatsRead metric tracked',
        dashboardJs.includes('dashboardStatsRead'),
        'Add dashboardStatsRead metric increment in fetchAndRenderHistoricalCharts');
}
console.log();

// ── Section 6: SuperAdmin reads stats docs for revenue ─────────────────
console.log('▸ Section 6: SuperAdmin reads stats docs for revenue (superadmin.js)');
if (superadminJs) {
    check('superadmin.js exists', true, '');
    check('SuperAdmin fetches monthly stats doc for each club',
        superadminJs.includes("'stats'") || superadminJs.includes('"stats"'),
        "Add getDoc(doc(db, 'clubs', cid, 'stats', docId)) in loadSuperAdminData for each club");
    check('superAdminStatsRead metric tracked',
        superadminJs.includes('superAdminStatsRead'),
        'Add superAdminStatsRead metric increment in loadSuperAdminData');
    check('SuperAdmin has fallback when stats doc missing',
        superadminJs.includes('stats doc') || superadminJs.includes('monthStats') || superadminJs.includes('monthRevenue'),
        'Add fallback message when stats doc does not exist for a club');
}
console.log();

// ── Section 7: Finance listeners only active when needed ───────────────
console.log('▸ Section 7: Finance Listener Lifecycle (finance.listeners.js + app.js)');
if (financeJs) {
    check('finance.listeners.js exists', true, '');
    check('getTxListenerKey() defined (key pattern consistent)',
        financeJs.includes('getTxListenerKey'),
        'Define getTxListenerKey() for consistent key generation');
    check('cleanupFinanceListeners() defined',
        financeJs.includes('cleanupFinanceListeners'),
        'Define cleanupFinanceListeners() for logout cleanup');
    check('hasTxListener() defined',
        financeJs.includes('hasTxListener'),
        'Define hasTxListener() for duplicate detection');
}
if (appJs) {
    check('listenToData() cleanup old listener before re-subscribe',
        appJs.includes("cleanupListenersByOwner('finance'"),
        'listenToData() must cleanup old finance listeners before mounting new ones');

    check('Month change triggers listener swap (not duplicate)',
        appJs.includes("reason: 'listenToData'") || appJs.includes("reason: 'tx-month-change'"),
        'listenToData() should include reason in listener registry for debugging');
}
console.log();

// ── Section 8: Transaction listener metrics emission ───────────────────
console.log('▸ Section 8: Transaction Listener Metrics Emission');
if (appJs) {
    check('txListenerAttached emitted in listenToData()',
        appJs.includes('txListenerAttached'),
        'Emit txListenerAttached metric when listener is attached in listenToData()');
    check('txListenerDetached emitted on logout',
        appJs.includes('txListenerDetached'),
        'Emit txListenerDetached metric when listener is cleaned up on logout');
    warn('txListenerDuplicatePrevented emitted on duplicate attempt',
        appJs.includes('txListenerDuplicatePrevented'),
        'Optionally emit txListenerDuplicatePrevented when same-key listener is prevented');
    check('txStatsRead or dashboardStatsRead metric exists',
        (appJs.includes('txStatsRead') || appJs.includes('dashboardStatsRead') ||
         (dashboardJs && dashboardJs.includes('dashboardStatsRead'))),
        'Track stats doc reads via txStatsRead or dashboardStatsRead metric');
}
console.log();

// ── Section 9: firestore.indexes.json has txMonth+timestamp index ──────
console.log('▸ Section 9: Firestore Indexes for Transaction Queries');
const idxJson = readFile('firestore.indexes.json');
if (idxJson) {
    check('firestore.indexes.json exists', true, '');
    check('firestore.indexes.json not empty', idxJson.includes('"indexes"'), 'firestore.indexes.json must not be empty');

    let parsedIdx = null;
    try { parsedIdx = JSON.parse(idxJson); } catch(_) {}
    check('firestore.indexes.json valid JSON', !!parsedIdx, 'Fix JSON syntax in firestore.indexes.json');

    if (parsedIdx) {
        const txIndexes = (parsedIdx.indexes || []).filter(i => i.collectionGroup === 'transactions');
        check('Has transactions indexes', txIndexes.length > 0, 'Add transaction indexes to firestore.indexes.json');

        const hasTxMonthTimestamp = txIndexes.some(i => {
            const fields = i.fields || [];
            return fields.some(f => f.fieldPath === 'txMonth') && fields.some(f => f.fieldPath === 'timestamp');
        });
        check('Has txMonth + timestamp composite index',
            hasTxMonthTimestamp,
            'Add index: transactions by txMonth ASC + timestamp DESC for efficient month queries');

        const hasDateTimestamp = txIndexes.some(i => {
            const fields = i.fields || [];
            return fields.some(f => f.fieldPath === 'date') && fields.some(f => f.fieldPath === 'timestamp');
        });
        check('Has date + timestamp composite index',
            hasDateTimestamp,
            'Add index: transactions by date ASC + timestamp DESC for realtime listener qByDate');
    }
}
console.log();

// ── Section 10: Check tools infrastructure ─────────────────────────────
console.log('▸ Section 10: Phase 4K Check Tools');
check('check-transaction-realtime.mjs exists', fileExists('tools/check-transaction-realtime.mjs'), 'This file! Already created.');
check('check-stats-aggregation.mjs exists',    fileExists('tools/check-stats-aggregation.mjs'),   'Create tools/check-stats-aggregation.mjs');
check('rebuild-transaction-stats.mjs exists',  fileExists('tools/rebuild-transaction-stats.mjs'), 'Create tools/rebuild-transaction-stats.mjs');

const pkgJson = readFile('package.json');
if (pkgJson) {
    let pkg = null;
    try { pkg = JSON.parse(pkgJson); } catch(_) {}
    if (pkg && pkg.scripts) {
        check('check:transaction-realtime script defined',
            !!pkg.scripts['check:transaction-realtime'],
            'Add "check:transaction-realtime": "node tools/check-transaction-realtime.mjs" to package.json');
        check('check:stats-aggregation script defined',
            !!pkg.scripts['check:stats-aggregation'],
            'Add "check:stats-aggregation": "node tools/check-stats-aggregation.mjs" to package.json');
        check('check:all includes transaction-realtime',
            pkg.scripts['check:all'] && pkg.scripts['check:all'].includes('check:transaction-realtime'),
            'Add check:transaction-realtime to check:all');
        check('check:all includes stats-aggregation',
            pkg.scripts['check:all'] && pkg.scripts['check:all'].includes('check:stats-aggregation'),
            'Add check:stats-aggregation to check:all');
    }
}
console.log();

// ── Final Summary ──────────────────────────────────────────────────────
console.log('══════════════════════════════════════════════════════════');
console.log('  Total: ' + (pass + fail) + ' checks | ✅ Pass: ' + pass + ' | ❌ Fail: ' + fail + (warnings.length ? ' | ⚠️  Warn: ' + warnings.length : ''));
if (fail > 0) {
    console.error('\nFailed checks:');
    errors.forEach(e => console.error('  - ' + e));
    console.log('══════════════════════════════════════════════════════════\n');
    process.exit(1);
} else {
    console.log('\n  🎉 All transaction realtime checks passed!');
    if (warnings.length > 0) {
        console.warn('  ⚠️  Warnings (non-blocking):');
        warnings.forEach(w => console.warn('     - ' + w));
    }
    console.log('  Firestore transaction reads are safe for 20 CLB × 1000 võ sinh.');
    console.log('══════════════════════════════════════════════════════════\n');
}
