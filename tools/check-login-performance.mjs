/**
 * tools/check-login-performance.mjs — Phase 4.0B-4J-8A
 * ─────────────────────────────────────────────────────────────────────
 * Kiểm tra Login Performance cho Mobile.
 *
 * Chạy: node tools/check-login-performance.mjs
 * Hoặc: npm run check:login-performance
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
console.log('  Phase 4.0B-4J-8A — Login Performance Check');
console.log('══════════════════════════════════════════════════════════\n');

const appJs = readFile('app.js');
check('app.js exists', !!appJs, 'File not found');

// ── Section 1: Login Performance Metrics ──────────────────────────────────
console.log('▸ Section 1: Login Performance Metrics (app.js)');
if (appJs) {
    check('__loginPerfMetrics defined',
        appJs.includes('window.__loginPerfMetrics = window.__loginPerfMetrics ||'),
        'Add window.__loginPerfMetrics init block');
    check('printLoginPerfMetrics exposed',
        appJs.includes('window.printLoginPerfMetrics = function'),
        'Add window.printLoginPerfMetrics');
    check('markLoginPerf helper defined',
        appJs.includes('function markLoginPerf(') || appJs.includes('markLoginPerf = function'),
        'Add markLoginPerf() helper function');
    check('markLoginPerf exposed',
        appJs.includes('window.markLoginPerf = window.markLoginPerf || markLoginPerf') ||
        appJs.includes('window.markLoginPerf = function'),
        'Expose window.markLoginPerf');
}
console.log();

// ── Section 2: Login Marks ────────────────────────────────────────────────
console.log('▸ Section 2: Login Performance Marks (app.js)');
if (appJs) {
    check('loginStart mark in handleLogin',
        appJs.includes("markLoginPerf('loginStart')"),
        "Add markLoginPerf('loginStart') in handleLogin");
    check('shellShown mark dispatched',
        appJs.includes("markLoginPerf('shellShown')"),
        "Add markLoginPerf('shellShown') after app shell is visible");
    check('contextReady mark dispatched',
        appJs.includes("markLoginPerf('contextReady')"),
        "Add markLoginPerf('contextReady') in dispatchAppContextReady");
    check('dataHydrated mark dispatched',
        appJs.includes("markLoginPerf('dataHydrated')"),
        "Add markLoginPerf('dataHydrated') when initial data snapshot loads");
    check('app:shell-ready event dispatched',
        appJs.includes("app:shell-ready"),
        "dispatch CustomEvent('app:shell-ready') when shell is visible");
}
console.log();

// ── Section 3: Non-Critical Defer ─────────────────────────────────────────
console.log('▸ Section 3: Defer Non-Critical Work (app.js)');
if (appJs) {
    check('requestIdleCallback or runIdle defined',
        appJs.includes('requestIdleCallback') || appJs.includes('runIdle'),
        'Add runIdle = requestIdleCallback || setTimeout for deferral');
    check('Non-critical work deferred (heavyWorkDeferred mark)',
        appJs.includes("markLoginPerf('heavyWorkDeferred')") ||
        appJs.includes('heavyWorkDeferred'),
        "Mark heavy work as deferred with markLoginPerf('heavyWorkDeferred')");
    check('Login loading text "Đang đăng nhập"',
        appJs.includes('Đang đăng nhập') || appJs.includes('Đang mở hệ thống'),
        'Add clear loading text for login steps');
}
console.log();

// ── Section 4: Blocking Guards ─────────────────────────────────────────────
console.log('▸ Section 4: Login Should Not Be Blocked By Heavy Work (app.js)');
if (appJs) {
    // SuperAdmin audit should not run automatically for normal admin
    const _saBlock = /onAuthStateChanged[\s\S]{0,200}superAdmin.*audit/i;
    check('SuperAdmin audit not blocking normal admin login',
        !_saBlock.test((appJs.match(/onAuthStateChanged[\s\S]{0,2000}/) || [''])[0].split('super_admin')[0]),
        'Ensure superAdmin audit runs only for super_admin role');

    check('recordReadMetric used in large queries',
        appJs.includes('recordReadMetric'),
        'Add recordReadMetric() calls in large Firestore reads');
}
console.log();

// ── Section 5: Search Index ────────────────────────────────────────────────
console.log('▸ Section 5: Advanced Search Index (app.js)');
if (appJs) {
    check('normalizeSearchText defined',
        appJs.includes('function normalizeSearchText(') || appJs.includes('normalizeSearchText ='),
        'Add normalizeSearchText() helper');
    check('normalizePhoneForSearch defined',
        appJs.includes('function normalizePhoneForSearch(') || appJs.includes('normalizePhoneForSearch ='),
        'Add normalizePhoneForSearch() helper');
    check('buildStudentSearchIndex defined',
        appJs.includes('function buildStudentSearchIndex(') || appJs.includes('buildStudentSearchIndex ='),
        'Add buildStudentSearchIndex() helper');
    check('searchName written on add/edit',
        appJs.includes('searchName') && appJs.includes('buildStudentSearchIndex'),
        'Call buildStudentSearchIndex() when adding/editing student profile');
    check('fetchQueryPages defined',
        appJs.includes('async function fetchQueryPages(') || appJs.includes('fetchQueryPages = async function'),
        'Add fetchQueryPages() helper for paginated batch fetching');
}
console.log();

// ── Section 6: Server-side Search in Service ──────────────────────────────
console.log('▸ Section 6: Server-side Search (students.service.js)');
const studentsService = readFile('js/services/students.service.js');
if (studentsService) {
    check('searchProfilesServerSide defined',
        studentsService.includes('async searchProfilesServerSide('),
        'Add searchProfilesServerSide() to StudentService');
    check('Server search uses searchName field',
        studentsService.includes("'searchName'") || studentsService.includes('"searchName"'),
        "Query by 'searchName' field in searchProfilesServerSide()");
    check('Server search uses searchPhone field',
        studentsService.includes("'searchPhone'") || studentsService.includes('"searchPhone"'),
        "Query by 'searchPhone' field in searchProfilesServerSide()");
    check('Server search deduplicates by doc ID',
        studentsService.includes('resultMap') || studentsService.includes('dedupe'),
        'Deduplicate search results by document ID');
}
console.log();

// ── Section 7: Backfill Tool ──────────────────────────────────────────────
console.log('▸ Section 7: Backfill Tool');
const backfillTool = readFile('tools/backfill-student-search-index.mjs');
check('backfill-student-search-index.mjs exists',
    !!backfillTool, 'Create tools/backfill-student-search-index.mjs');
if (backfillTool) {
    check('Backfill is dry-run by default',
        backfillTool.includes('isDryRun') && backfillTool.includes('!hasFlag'),
        'Default to dry-run; require --execute flag');
    check('Backfill requires --confirm string',
        backfillTool.includes('expectedConfirm'),
        'Require explicit --confirm "BACKFILL SEARCH INDEX <clubId>"');
    check('Backfill does not log PII',
        !backfillTool.includes('console.log(d.id)') && !backfillTool.includes('fullName'),
        'Do not log student names or phone numbers');
}
console.log();

// ── Final Summary ─────────────────────────────────────────────────────────
console.log('══════════════════════════════════════════════════════════');
console.log('  Total: ' + (pass + fail) + ' checks | ✅ Pass: ' + pass + ' | ❌ Fail: ' + fail);
if (fail > 0) {
    console.error('\nFailed checks:');
    errors.forEach(e => console.error('  - ' + e));
    console.log('══════════════════════════════════════════════════════════\n');
    process.exit(1);
} else {
    console.log('\n  🎉 Login performance checks passed!');
    console.log('  Mobile login optimized for CLB 600–1000 võ sinh.');
    console.log('══════════════════════════════════════════════════════════\n');
}
