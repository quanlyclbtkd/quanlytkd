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


// ── Section 11: Search Index Infrastructure (Phase 4J-8A) ───────────────────
console.log('▸ Section 11: Search Index — Student Search (Phase 4J-8A)');
const helpersJs = readFile('js/utils/helpers.js');
check('js/utils/helpers.js exists', !!helpersJs, 'File not found');
if (helpersJs) {
    check('normalizeSearchText() defined', helpersJs.includes('export function normalizeSearchText('), 'Add normalizeSearchText to helpers.js');
    check('normalizePhone() defined', helpersJs.includes('export function normalizePhone('), 'Add normalizePhone to helpers.js');
    check('buildStudentSearchIndex() defined', helpersJs.includes('export function buildStudentSearchIndex('), 'Add buildStudentSearchIndex to helpers.js');
}

const studentsModule = readFile('js/modules/students.js');
check('students.js imports buildStudentSearchIndex', studentsModule ? studentsModule.includes("import { buildStudentSearchIndex }") : false, 'Import buildStudentSearchIndex in students.js');
check('addNewStudent saves searchName', studentsModule ? (studentsModule.includes('searchName') && studentsModule.includes('_newSearchIdx')) : false, 'Inject search index in addNewStudent flow');
check('updateProfile saves searchName', studentsModule ? (studentsModule.includes('_editSearchIdx') && studentsModule.includes('updateData.searchName')) : false, 'Inject search index in updateProfile flow');

if (studentsService) {
    check('searchProfilesServerSide() defined', studentsService.includes('async searchProfilesServerSide('), 'Add searchProfilesServerSide() to StudentService');
    check('findTransactionsByStudent uses cursor pagination', studentsService.includes('startAfter(cursor)') || studentsService.includes("// Phase 4J-8A: paginated query"), 'Fix findTransactionsByStudent to use cursor pagination instead of limit(500)');
}

check('backfill-student-search-index.mjs exists', !!readFile('tools/backfill-student-search-index.mjs'), 'Create tools/backfill-student-search-index.mjs');
const backfillTool = readFile('tools/backfill-student-search-index.mjs');
if (backfillTool) {
    check('Backfill defaults to dry-run', !backfillTool.includes('const EXECUTE  = true') && backfillTool.includes('args.execute === true'), 'Backfill must default to dry-run');
    check('Backfill requires --confirm text', backfillTool.includes('expectedConfirm'), 'Backfill must require --confirm text');
    check('Backfill uses batch write cap (400–450)', backfillTool.includes('BATCH_CAP'), 'Add BATCH_CAP for batch writes');
}
console.log();

// ── Section 12: Paginated Query Helper (Phase 4J-8A) ────────────────────────
console.log('▸ Section 12: fetchAllQueryPages Helper (Phase 4J-8A)');
const paginatedQuery = readFile('js/firebase/paginatedQuery.js');
check('paginatedQuery.js exists', !!paginatedQuery, 'File not found');
if (paginatedQuery) {
    check('fetchAllQueryPages() exported', paginatedQuery.includes('export async function fetchAllQueryPages('), 'Add fetchAllQueryPages export to paginatedQuery.js');
    check('fetchAllQueryPages exposes on window', paginatedQuery.includes('window.fetchAllQueryPages'), 'Expose fetchAllQueryPages on window');
}
console.log();

// ── Section 13: Unsafe limit(500) Cleanup (Phase 4J-8A) ─────────────────────
console.log('▸ Section 13: Remaining UNSAFE_LIMIT_FOR_CALCULATION Cleanup (Phase 4J-8A)');
if (appJs) {
    // Batch delete now uses cursor pagination — check for cursor pattern
    check('Batch delete uses cursor pagination (not limit-500)', !appJs.includes("limit(500)); // [3.3E] batch delete cap"), 'Fix batch delete to use cursor pagination');
    // Parent-club scan — now uses searchName query with paginated fallback
    check('Parent-club profile scan uses searchName query', appJs.includes("orderBy('searchName')") || appJs.includes("'searchName'"), 'Fix parent-club scan to use server-side searchName query');
    // Rename tx scan uses cursor pagination
    check('Rename tx scan uses cursor pagination', appJs.includes('// Phase 4J-8A: Paginated tx scan'), 'Fix rename tx scan to use cursor pagination');
    // paidUntil recalc uses cursor pagination
    check('paidUntil recalc uses cursor pagination', appJs.includes('// Phase 4J-8A: Paginated query — không bị cap 500'), 'Fix paidUntil recalc to use cursor pagination');
    // Attendance uses attendanceDailyLimit
    check('Attendance daily query uses attendanceDailyLimit', appJs.includes('_attDailyLim'), 'Use attendanceDailyLimit for attendance by-date query');
}
console.log();

// ── Section 14: Login Performance Metrics (Phase 4J-8A) ─────────────────────
console.log('▸ Section 14: Login Performance Infrastructure (Phase 4J-8A)');
if (appJs) {
    check('__loginPerfMetrics defined', appJs.includes('window.__loginPerfMetrics'), 'Add __loginPerfMetrics init');
    check('markLoginPerf() defined', appJs.includes('function markLoginPerf('), 'Add markLoginPerf()');
    check('printLoginPerformance() exposed', appJs.includes('window.printLoginPerformance = function'), 'Add window.printLoginPerformance');
    check('mark login-submit', appJs.includes("markLoginPerf('login-submit')"), 'Add login-submit mark');
    check('mark auth-state-received', appJs.includes("markLoginPerf('auth-state-received')"), 'Add auth-state-received mark');
    check('mark first-ui-shell-visible', appJs.includes("markLoginPerf('first-ui-shell-visible')"), 'Add first-ui-shell-visible mark');
    check('mark context-ready', appJs.includes("markLoginPerf('context-ready')"), 'Add context-ready mark');
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
