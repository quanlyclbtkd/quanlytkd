/**
 * tools/check-scale-readiness.mjs — Phase 4J-8
 * ─────────────────────────────────────────────────────────────────────
 * Kiểm tra Firestore Read Scale Readiness cho CLB 600–1000 võ sinh.
 *
 * Mục tiêu: đảm bảo tất cả limit() calls đã được nâng lên / thay bằng
 * cursor pagination để không bị hard cap 500 gây mất dữ liệu.
 *
 * Chạy: node tools/check-scale-readiness.mjs
 * Hoặc: npm run check:scale
 * ─────────────────────────────────────────────────────────────────────
 */

import { readFileSync } from 'fs';
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

console.log('\n══════════════════════════════════════════════════════════');
console.log('  Phase 4J-8 — Firestore Read Scale Readiness Check');
console.log('══════════════════════════════════════════════════════════\n');

// ── Section 1: Global Scale Config ───────────────────────────────────
console.log('▸ Section 1: window.__scaleConfig (app.js)');
const appJs = readFile('app.js');
check('app.js exists', !!appJs, 'File not found');
if (appJs) {
    check('__scaleConfig defined', appJs.includes('window.__scaleConfig = window.__scaleConfig ||'), 'Add __scaleConfig init block');
    check('profilesPageSize in config', appJs.includes('profilesPageSize'), 'Add profilesPageSize to __scaleConfig');
    check('transactionsPageSize in config', appJs.includes('transactionsPageSize'), 'Add transactionsPageSize to __scaleConfig');
    check('inventoryPageSize in config', appJs.includes('inventoryPageSize'), 'Add inventoryPageSize to __scaleConfig');
    check('attendanceDailyLimit in config', appJs.includes('attendanceDailyLimit'), 'Add attendanceDailyLimit to __scaleConfig');
    check('attendanceMonthlyLimit in config', appJs.includes('attendanceMonthlyLimit'), 'Add attendanceMonthlyLimit to __scaleConfig');
    check('txListenerLimit in config', appJs.includes('txListenerLimit'), 'Add txListenerLimit to __scaleConfig');
    check('legacyFallbackLimit in config', appJs.includes('legacyFallbackLimit'), 'Add legacyFallbackLimit to __scaleConfig');
    check('exportBatchSize in config', appJs.includes('exportBatchSize'), 'Add exportBatchSize to __scaleConfig');
    check('warnThresholdProfiles in config', appJs.includes('warnThresholdProfiles'), 'Add warnThresholdProfiles to __scaleConfig');
}
console.log();

// ── Section 2: Read Metrics Infrastructure ───────────────────────────
console.log('▸ Section 2: Read Metrics (app.js)');
if (appJs) {
    check('__readScaleMetrics defined', appJs.includes('window.__readScaleMetrics = window.__readScaleMetrics ||'), 'Add __readScaleMetrics init');
    check('recordReadMetric() exposed', appJs.includes('window.recordReadMetric = function'), 'Add window.recordReadMetric');
    check('printReadScaleMetrics() exposed', appJs.includes('window.printReadScaleMetrics = function'), 'Add window.printReadScaleMetrics');
    check('printScaleReadiness() exposed', appJs.includes('window.printScaleReadiness = function'), 'Add window.printScaleReadiness');
}
console.log();

// ── Section 3: Profiles Pagination Service ───────────────────────────
console.log('▸ Section 3: Profiles Cursor Pagination (students.service.js)');
const studentsService = readFile('js/services/students.service.js');
check('students.service.js exists', !!studentsService, 'File not found');
if (studentsService) {
    check('getProfilesPage() defined', studentsService.includes('async getProfilesPage('), 'Add getProfilesPage() to StudentService');
    check('Uses cursor pagination (startAfter)', studentsService.includes('startAfter(cursor)'), 'Add startAfter cursor support');
    check('pageSize + 1 trick for hasNext', studentsService.includes('pageSize + 1'), 'Fetch pageSize+1 to detect hasNext');
    check('Search prefix support (startAt/endAt)', studentsService.includes('endAt(q + ') || studentsService.includes("endAt(q + '"), 'Add startAt/endAt prefix search');
}
console.log();

// ── Section 4: Finance Pagination + Export ───────────────────────────
console.log('▸ Section 4: Finance Cursor Pagination + fetchAllPagesForExport (finance.service.js + app.js)');
const financeService = readFile('js/services/finance.service.js');
check('finance.service.js exists', !!financeService, 'File not found');
if (financeService) {
    check('getTransactionsPage() defined', financeService.includes('async getTransactionsPage('), 'Add getTransactionsPage() to FinanceService');
    check('getTransactionsByDatePage() defined', financeService.includes('async getTransactionsByDatePage('), 'Add getTransactionsByDatePage() to FinanceService');
    check('TX page uses pageSize + 1', financeService.includes('pageSize + 1'), 'Fetch pageSize+1 to detect hasNext');
}
if (appJs) {
    check('fetchAllPagesForExport() exposed', appJs.includes('window.fetchAllPagesForExport = async function'), 'Add window.fetchAllPagesForExport');
}
console.log();

// ── Section 5: Inventory Pagination ──────────────────────────────────
console.log('▸ Section 5: Inventory Cursor Pagination (inventory.service.js)');
const invService = readFile('js/services/inventory.service.js');
check('inventory.service.js exists', !!invService, 'File not found');
if (invService) {
    check('getInventoryPage() defined', invService.includes('async getInventoryPage('), 'Add getInventoryPage() to InventoryService');
    check('Inventory page uses pageSize + 1', invService.includes('pageSize + 1'), 'Fetch pageSize+1 to detect hasNext');
    check('Inventory page supports typeFilter', invService.includes('typeFilter'), 'Add typeFilter support to getInventoryPage');
    check('Inventory page supports date range', invService.includes("startDate && endDate"), 'Add date range support to getInventoryPage');
}
console.log();

// ── Section 6: Attendance Scale Safety ───────────────────────────────
console.log('▸ Section 6: Attendance Scale Safety (attendance.service.js)');
const attService = readFile('js/services/attendance.service.js');
check('attendance.service.js exists', !!attService, 'File not found');
if (attService) {
    check('loadByDate limit uses attendanceDailyLimit', attService.includes('attendanceDailyLimit'), 'Bump loadByDate limit to use __scaleConfig.attendanceDailyLimit');
    check('loadByDate limit bumped from 500', !attService.includes('[_lim(500)]'), 'Remove old limit(500) in loadByDate');
    check('loadByMonth has limit guard', attService.includes('attendanceMonthlyLimit'), 'Add limit guard to loadByMonth');
}
console.log();

// ── Section 7: Transactions Listener Scale ───────────────────────────
console.log('▸ Section 7: Transactions Real-time Listener (app.js)');
if (appJs) {
    check('TX listener uses txListenerLimit', appJs.includes('txListenerLimit'), 'Use __scaleConfig.txListenerLimit in transactions listener');
    check('TX listener bumped from 500', appJs.includes('txListenerLimit') && appJs.includes('1200'), 'Bump tx listener limit from 500 to 1200');
    check('TX listener has recordReadMetric', appJs.includes("recordReadMetric('transactions'") || appJs.includes('recordReadMetric("transactions"'), 'Add recordReadMetric call in transactions snapshot');
}
console.log();

// ── Section 8: Inventory Listener Read Metric ─────────────────────────
console.log('▸ Section 8: Inventory Listener Metrics (app.js)');
if (appJs) {
    check('Inventory listener has recordReadMetric', appJs.includes("recordReadMetric('inventory'") || appJs.includes('recordReadMetric("inventory"'), 'Add recordReadMetric call in inventory snapshot callback');
}
console.log();

// ── Section 9: Legacy Fallback Scale Safety ───────────────────────────
console.log('▸ Section 9: Legacy Fallback Scale Safety (app.js)');
if (appJs) {
    check('Legacy fallback uses legacyFallbackLimit', appJs.includes('legacyFallbackLimit'), 'Use __scaleConfig.legacyFallbackLimit in _readLegacy');
    // Make sure it's NOT hard-coded 500 in _readLegacy — check proximity
    const _legacyBlock = appJs.split('async function _readLegacy')[1] || '';
    const _legacyFirst300 = _legacyBlock.slice(0, 300);
    check('Legacy fallback not stuck at limit(500)', !_legacyFirst300.includes('limit(500)'), 'Update _readLegacy to use legacyFallbackLimit instead of hard-coded 500');
}
console.log();

// ── Section 10: Debug Globals ─────────────────────────────────────────
console.log('▸ Section 10: Debug Globals in app.js');
if (appJs) {
    check('recordReadMetric wired to profiles listener', appJs.includes("recordReadMetric('profiles'") || appJs.includes('recordReadMetric("profiles"'), 'Add recordReadMetric call in profiles fallback listener');
}
console.log();

// ── Section 11: Phase 4.0B-4J-8A — Advanced Search Index ────────────
console.log('▸ Section 11: Phase 4.0B-4J-8A — Search Index (app.js + students.service.js)');
if (appJs) {
    check('buildStudentSearchIndex() defined', appJs.includes('function buildStudentSearchIndex'), 'Add buildStudentSearchIndex() helper to app.js closure');
    check('normalizeSearchText() defined',     appJs.includes('function normalizeSearchText'),     'Add normalizeSearchText() helper to app.js closure');
    check('normalizePhoneForSearch() defined', appJs.includes('function normalizePhoneForSearch'), 'Add normalizePhoneForSearch() helper to app.js closure');
    check('fetchQueryPages() defined',         appJs.includes('function fetchQueryPages'),         'Add fetchQueryPages() paginated helper to app.js closure');
    check('searchIndex written in addNewStudent',  appJs.includes('buildStudentSearchIndex(_newProfileData'), 'Add searchIndex to addNewStudent setDoc call');
    check('searchIndex written in updateProfile',  appJs.includes('buildStudentSearchIndex(updateData'),     'Add searchIndex to updateProfile updateData');
    check('markLoginPerf exposed',             appJs.includes('function markLoginPerf'),            'Add markLoginPerf() login performance tracking');
    check('markLoginPerf dataHydrated called', appJs.includes("markLoginPerf('dataHydrated')"),     'Add markLoginPerf(dataHydrated) in profiles/inventory listener');
}
if (studentsService) {
    check('searchProfilesServerSide() defined', studentsService.includes('searchProfilesServerSide'), 'Add searchProfilesServerSide() to StudentService');
    check('Search uses searchName field',        studentsService.includes('searchName'),              'Add searchName field query in searchProfilesServerSide');
}
console.log();

// ── Section 12: Phase 4.0B-4J-8A — Limit(500) Cleanup ───────────────
console.log('▸ Section 12: Phase 4.0B-4J-8A — limit(500) Cleanup (app.js)');
if (appJs) {
    check('deleteTx batch delete fixed (no warnUnsafeLimit)', !appJs.includes("warnUnsafeLimit('deleteTx:batchDelete:limit500'"), 'Fix batch delete to use paginated loop instead of single limit(500)');
    check('rename tx scan fixed (no warnUnsafeLimit)',        !appJs.includes("warnUnsafeLimit('students:renameTxScan:limit500'"),  'Fix rename tx scan to use fetchQueryPages');
    check('paidUntil recalc fixed (no warnUnsafeLimit)',      !appJs.includes("warnUnsafeLimit('deleteTx:paidUntilRecalc:limit500'"), 'Fix paidUntil recalc to use fetchQueryPages');
    check('rename uses _profileRenameBatch (clean 2-step)',   appJs.includes('_profileRenameBatch'),  'Confirm profile rename uses _profileRenameBatch separate from tx batch');
    check('paidUntil recalc uses fetchQueryPages',            appJs.includes('paidUntil-recalc'),     'Confirm paidUntil recalc uses fetchQueryPages');
}
console.log();

// ── Section 13: Phase 4.0B — Login Performance ───────────────────────
console.log('▸ Section 13: Phase 4.0B — Mobile Login Performance (app.js)');
if (appJs) {
    check('__loginPerfMetrics defined',          appJs.includes('window.__loginPerfMetrics'),         'Add __loginPerfMetrics tracking object');
    check('printLoginPerfMetrics() exposed',     appJs.includes('window.printLoginPerfMetrics'),      'Add window.printLoginPerfMetrics for debug');
    check('markLoginPerf loginStart called',     appJs.includes("markLoginPerf('loginStart')"),       'Add markLoginPerf(loginStart) in handleLogin');
    check('markLoginPerf contextReady called',   appJs.includes("markLoginPerf('contextReady')"),     'Add markLoginPerf(contextReady) in dispatchAppContextReady');
    check('markLoginPerf shellShown called',     appJs.includes("markLoginPerf('shellShown')"),       'Add markLoginPerf(shellShown) in initSaaSDatabase');
    check('app:shell-ready event dispatched',    appJs.includes('app:shell-ready'),                   'Add CustomEvent(app:shell-ready) dispatch');
}
console.log();

// ── Section 14: Backfill Tool ─────────────────────────────────────────
console.log('▸ Section 14: Phase 4.0B — Backfill & Check Tools');
const backfillTool = readFile('tools/backfill-student-search-index.mjs');
const loginPerfTool = readFile('tools/check-login-performance.mjs');
check('backfill-student-search-index.mjs exists', !!backfillTool,  'Create tools/backfill-student-search-index.mjs');
check('check-login-performance.mjs exists',       !!loginPerfTool, 'Create tools/check-login-performance.mjs');
const pkgJson = readFile('package.json');
if (pkgJson) {
    const pkg = JSON.parse(pkgJson);
    check('backfill:search-index script defined',    !!(pkg.scripts && pkg.scripts['backfill:search-index']),    'Add backfill:search-index to package.json scripts');
    check('check:login-performance script defined',  !!(pkg.scripts && pkg.scripts['check:login-performance']),  'Add check:login-performance to package.json scripts');
}
console.log();

// ── Final Summary ─────────────────────────────────────────────────────
console.log('══════════════════════════════════════════════════════════');
console.log('  Total: ' + (pass + fail) + ' checks | ✅ Pass: ' + pass + ' | ❌ Fail: ' + fail);
if (fail > 0) {
    console.error('\nFailed checks:');
    errors.forEach(e => console.error('  - ' + e));
    console.log('══════════════════════════════════════════════════════════\n');
    process.exit(1);
} else {
    console.log('\n  🎉 All scale readiness checks passed!');
    console.log('  CLB 600–1000 võ sinh: safe to deploy without read cap issues.');
    console.log('══════════════════════════════════════════════════════════\n');
}
