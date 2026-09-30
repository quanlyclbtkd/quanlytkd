/**
 * tools/check-tuition-package-month-coverage.mjs — Phase 4K-4F
 * ─────────────────────────────────────────────────────────────────────
 * Kiểm tra tháng giữa gói học phí (packageMonths) được load đúng.
 *
 * Fail nếu:
 *  1.  Không có window.txMatchesSelectedMonth trong main.js
 *  2.  app.js listenToData không có query packageMonths array-contains
 *  3.  app.js _mergeAndRender không merge _byPackageMonth
 *  4.  FinanceService.getTransactionsPage chỉ dùng where txMonth==monthStr, không có inclusive query
 *  5.  Không có getTransactionsForMonthInclusive trong finance.service.js
 *  6.  js/modules/finance.js không xử lý snap._mergedItems
 *  7.  financeRenderer.js không có guard txMatchesSelectedMonth
 *  8.  financeRenderer.js renderTxRow không hiển thị package date range
 *  9.  Không có queryTxByPackageMonths trong finance.service.js
 * 10.  reports.js không merge packageMonths query trong export
 * 11.  Không có debugTuitionPackageCoverage trong main.js
 * 12.  debugRuntimeSmokeTest không include tuitionPackageCoverage
 * 13.  Không có .nojekyll ở root
 * 14.  check:deploy-package chưa pass
 *
 * Chạy: node tools/check-tuition-package-month-coverage.mjs
 */

import { readFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root      = resolve(__dirname, '..');

function readFile(relPath) {
    try { return readFileSync(resolve(root, relPath), 'utf8'); }
    catch (_) { return null; }
}
function exists(relPath) { return existsSync(resolve(root, relPath)); }

let pass = 0, fail = 0;
const errors = [];

function check(label, condition, hint) {
    if (condition) { console.log('  ✅ ' + label); pass++; }
    else {
        console.error('  ❌ ' + label);
        if (hint) console.error('     → ' + hint);
        fail++; errors.push(label);
    }
}

console.log('\n══════════════════════════════════════════════════════════');
console.log('  Phase 4K-4F — Tuition Package Month Coverage Check');
console.log('══════════════════════════════════════════════════════════\n');

const mainJs      = readFile('js/main.js');
const appJs       = readFile('app.js');
const svcJs       = readFile('js/services/finance.service.js');
const financeJs   = readFile('js/modules/finance.js');
const rendererJs  = readFile('js/ui/render/computation/financeRenderer.js');
const reportsJs   = readFile('js/modules/reports.js');
const pkgRaw      = readFile('package.json');
let pkg = null;
try { pkg = JSON.parse(pkgRaw || '{}'); } catch(_) {}

// ── Section 1: .nojekyll ──────────────────────────────────────────
console.log('▸ Section 1: .nojekyll deploy gate');
check('.nojekyll exists at root',
    exists('.nojekyll'),
    'Create empty file .nojekyll in project root (same level as index.html)');
console.log();

// ── Section 2: window.txMatchesSelectedMonth ──────────────────────
console.log('▸ Section 2: window.txMatchesSelectedMonth shared helper');
if (mainJs) {
    check('main.js: window.txMatchesSelectedMonth defined',
        mainJs.includes('window.txMatchesSelectedMonth'),
        'Add window.txMatchesSelectedMonth = function(tx, month) {...} to main.js');
    check('main.js: txMatchesSelectedMonth checks tx.txMonth',
        mainJs.includes('tx.txMonth === m'),
        'txMatchesSelectedMonth must check tx.txMonth === m');
    check('main.js: txMatchesSelectedMonth checks tx.paymentMonth',
        mainJs.includes('tx.paymentMonth === m'),
        'txMatchesSelectedMonth must check tx.paymentMonth === m');
    check('main.js: txMatchesSelectedMonth checks tx.packageMonths array',
        mainJs.includes('tx.packageMonths') && mainJs.includes('.includes(m)'),
        'txMatchesSelectedMonth must check Array.isArray(tx.packageMonths) && tx.packageMonths.includes(m)');
    check('main.js: txMatchesSelectedMonth checks tx.date startsWith',
        mainJs.includes('tx.date') && mainJs.includes('.startsWith(m)'),
        'txMatchesSelectedMonth must check tx.date.startsWith(m)');
}
console.log();

// ── Section 3: app.js listenToData ───────────────────────────────
console.log('▸ Section 3: app.js listenToData — 3rd query packageMonths');
if (appJs) {
    check('app.js: qByPackageMonth query defined',
        appJs.includes('qByPackageMonth') && appJs.includes('array-contains'),
        'Add: const qByPackageMonth = query(colRef, where("packageMonths", "array-contains", monthStr), limit(...))');
    check('app.js: qByPackageMonth does NOT use orderBy (avoid composite index)',
        !(appJs.match(/qByPackageMonth\s*=\s*query\([^;]*orderBy[^;]*;/s)),
        'qByPackageMonth must NOT have orderBy — avoids Firestore composite index requirement');
    check('app.js: _byPackageMonth variable declared',
        appJs.includes('_byPackageMonth'),
        'Declare: let _byDate = [], _byTxMonth = [], _byPackageMonth = [];');
    check('app.js: _mergeAndRender merges _byPackageMonth',
        appJs.includes('..._byPackageMonth'),
        '_mergeAndRender must spread: [..._byDate, ..._byTxMonth, ..._byPackageMonth]');
    check('app.js: _mergeAndRender uses txMatchesSelectedMonth filter',
        appJs.includes('txMatchesSelectedMonth') && appJs.includes('_mergeAndRender'),
        '_mergeAndRender should call window.txMatchesSelectedMonth(t, monthStr) to filter');
    check('app.js: safeRegisterSnapshot includes u3 for qByPackageMonth',
        appJs.includes('u3') && appJs.includes('qByPackageMonth') && appJs.includes('_byPackageMonth'),
        'safeRegisterSnapshot factory: add u3 = onSnapshot(qByPackageMonth, ...)');
    check('app.js: combined unsub includes u3 cleanup',
        appJs.includes('u3()') || (appJs.includes('u3') && appJs.includes('_combinedUnsub')),
        '_combinedUnsub must call u3() to avoid memory leak');
}
console.log();

// ── Section 4: FinanceService inclusive query ─────────────────────
console.log('▸ Section 4: FinanceService.getTransactionsForMonthInclusive');
if (svcJs) {
    check('finance.service.js: getTransactionsForMonthInclusive defined',
        svcJs.includes('getTransactionsForMonthInclusive'),
        'Add async getTransactionsForMonthInclusive({pageSize, monthStr, search}) {...} to FinanceService');
    check('finance.service.js: inclusive query uses where("packageMonths","array-contains",monthStr)',
        svcJs.includes('array-contains') && svcJs.includes('getTransactionsForMonthInclusive'),
        'getTransactionsForMonthInclusive must include: where("packageMonths","array-contains",monthStr)');
    check('finance.service.js: inclusive query returns _mergedItems',
        svcJs.includes('_mergedItems'),
        'getTransactionsForMonthInclusive must return { docs, _mergedItems, _source }');
    check('finance.service.js: getTransactionsPage delegates to inclusive for first page with monthStr',
        svcJs.includes('getTransactionsForMonthInclusive') && svcJs.includes("direction === 'first'"),
        'getTransactionsPage: if monthStr && direction === "first" && !cursor → use getTransactionsForMonthInclusive');
    check('finance.service.js: queryTxByPackageMonths defined for export',
        svcJs.includes('queryTxByPackageMonths'),
        'Add async queryTxByPackageMonths(months=[]) {...} for export/report use');
    check('finance.service.js: queryTxByPackageMonths uses array-contains per month',
        svcJs.includes('queryTxByPackageMonths') && svcJs.includes('array-contains'),
        'queryTxByPackageMonths must loop months and query where("packageMonths","array-contains",m)');
}
console.log();

// ── Section 5: finance.js _doLoad _mergedItems handling ───────────
console.log('▸ Section 5: finance.js _doLoad handles snap._mergedItems');
if (financeJs) {
    check('finance.js: _doLoad checks snap._mergedItems',
        financeJs.includes('_mergedItems'),
        '_doLoad: if (Array.isArray(snap._mergedItems)) { use merged items directly } else { processPage }');
    check('finance.js: _doLoad sets pgState.currentItems from _mergedItems',
        financeJs.includes('_mergedItems') && financeJs.includes('pgState.currentItems'),
        '_doLoad must assign pgState.currentItems from _mergedItems.slice(0, PAGE_SIZE)');
}
console.log();

// ── Section 6: financeRenderer guard ─────────────────────────────
console.log('▸ Section 6: financeRenderer.js txMatchesSelectedMonth guard');
if (rendererJs) {
    check('financeRenderer.js: reads _selectedMonth from filterMonth or store',
        rendererJs.includes('_selectedMonth') && rendererJs.includes('filterMonth'),
        'Add: const _selectedMonth = document.getElementById("filterMonth")?.value || store.selectedMonth');
    check('financeRenderer.js: calls txMatchesSelectedMonth in forEach guard',
        rendererJs.includes('txMatchesSelectedMonth') && rendererJs.includes('_selectedMonth'),
        'In transactions.forEach: if (!txMatchesSelectedMonth(t, _selectedMonth)) return');
    check('financeRenderer.js: renderTxRow monthBadge shows package date range',
        rendererJs.includes('_packageRangeLabel') || rendererJs.includes('packageMonths.length > 1'),
        'renderTxRow: when packageMonths.length > 1, show "06/2026 – 08/2026" range label');
}
console.log();

// ── Section 7: reports.js export ─────────────────────────────────
console.log('▸ Section 7: reports.js export merges packageMonths query');
if (reportsJs) {
    check('reports.js: export calls queryTxByPackageMonths or txByPackage',
        reportsJs.includes('queryTxByPackageMonths') || reportsJs.includes('txByPackage'),
        'In excel export: load txByPackage via FinanceService.queryTxByPackageMonths(months) and merge into txAll');
    check('reports.js: txAll merge includes txByPackage',
        reportsJs.includes('txByPackage') && (reportsJs.includes('dedupeDocsById') || reportsJs.includes('txAll')),
        'txAll = dedupeDocsById([...txByDate, ...txByMonth, ...txByPackage])');
}
console.log();

// ── Section 8: debug helpers ──────────────────────────────────────
console.log('▸ Section 8: debug helpers');
if (mainJs) {
    check('main.js: window.debugTuitionPackageCoverage defined',
        mainJs.includes('window.debugTuitionPackageCoverage'),
        'Add window.debugTuitionPackageCoverage = async function(studentName, month) {...}');
    check('debugTuitionPackageCoverage: checks packageMatchesCount',
        mainJs.includes('packageMatchesCount') && mainJs.includes('debugTuitionPackageCoverage'),
        'debugTuitionPackageCoverage must count packageMatches (packageMonths.includes(selectedMonth))');
    check('main.js: debugRuntimeSmokeTest calls debugTuitionPackageCoverage',
        mainJs.includes('tuitionPackageCoverage') && mainJs.includes('debugRuntimeSmokeTest'),
        'debugRuntimeSmokeTest must call debugTuitionPackageCoverage and add tuitionPackageCoverageOk to summary');
    check('main.js: debugRuntimeSmokeTest summary includes tuitionPackageCoverageOk',
        mainJs.includes('tuitionPackageCoverageOk'),
        'summary.tuitionPackageCoverageOk = !!out.tuitionPackageCoverage.ok');
}
console.log();

// ── Section 9: package.json ───────────────────────────────────────
console.log('▸ Section 9: package.json check script');
if (pkg && pkg.scripts) {
    check('package.json: check:tuition-package-month-coverage defined',
        !!pkg.scripts['check:tuition-package-month-coverage'],
        'Add "check:tuition-package-month-coverage": "node tools/check-tuition-package-month-coverage.mjs"');
    check('package.json: check:all includes check:tuition-package-month-coverage',
        pkg.scripts['check:all'] && pkg.scripts['check:all'].includes('check:tuition-package-month-coverage'),
        'Add check:tuition-package-month-coverage to check:all');
}
console.log();

// ── Section 10: deploy-package check ─────────────────────────────
console.log('▸ Section 10: check:deploy-package result');
let deployOk = false, deployOutput = '';
try {
    deployOutput = execSync('node ' + resolve(root, 'tools/check-deploy-package.mjs'), {
        encoding: 'utf8',
        cwd: root,
    });
    // Deploy check exits 0 on success (no exception thrown = pass)
    deployOk = true;
} catch (e) {
    deployOutput = (e.stdout || '') + (e.stderr || e.message || '');
    deployOk = false;
}
check('check:deploy-package exits 0 (all deploy checks pass)',
    deployOk,
    'Fix deploy package issues: node tools/check-deploy-package.mjs\n     ' + deployOutput.slice(0, 200));
console.log();

// ── Final Summary ──────────────────────────────────────────────────
console.log('══════════════════════════════════════════════════════════');
console.log(`  Total: ${pass + fail} checks | ✅ Pass: ${pass} | ❌ Fail: ${fail}`);
if (fail > 0) {
    console.error('\nFailed checks:');
    errors.forEach(e => console.error('  - ' + e));
    console.log('══════════════════════════════════════════════════════════\n');
    process.exit(1);
} else {
    console.log('\n  🎉 All tuition package month coverage checks passed!');
    console.log('  Tháng giữa gói học phí (2026-07 trong gói 06-08) sẽ load đúng.');
    console.log('══════════════════════════════════════════════════════════\n');
}
