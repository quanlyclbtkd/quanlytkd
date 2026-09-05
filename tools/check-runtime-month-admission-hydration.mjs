/**
 * tools/check-runtime-month-admission-hydration.mjs — Phase 4K-4E
 * ─────────────────────────────────────────────────────────────────────
 * Kiểm tra Runtime Month Controller + Admission TX Hydration.
 *
 * Fail nếu:
 *  1. reports.js có function nằm trong import block
 *  2. package.json chưa có check:reports-module-syntax
 *  3. Không có window.handleFilterMonthChange trong main.js
 *  4. Không có window.onFilterMonthChange alias trong main.js
 *  5. Không có window.initFilterMonthController trong main.js
 *  6. app.js filterMonth onchange không bridge qua handleFilterMonthChange trong http-module
 *  7. StudentService.addTuitionTransaction không return { id, ...data }
 *  8. Không có window.mergeTransactionIntoRuntimeStore trong main.js
 *  9. js/modules/students.js không gọi mergeTransactionIntoRuntimeStore sau addTuitionTransaction
 * 10. app.js addNewStudent không merge tx vào runtime store sau addDoc
 * 11. Không có debugMonthRuntime trong main.js
 * 12. Không có debugAdmissionTxHydration trong main.js
 * 13. debugRuntimeSmokeTest không include monthRuntime/admissionTxHydration
 *
 * Chạy: node tools/check-runtime-month-admission-hydration.mjs
 */

import { readFileSync } from 'fs';
import { execSync } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
const __dirname = dirname(fileURLToPath(import.meta.url));
const root      = resolve(__dirname, '..');

function readFile(relPath) {
    try { return readFileSync(resolve(root, relPath), 'utf8'); }
    catch (_) { return null; }
}

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
console.log('  Phase 4K-4E — Runtime Month + Admission Hydration Check');
console.log('══════════════════════════════════════════════════════════\n');

const mainJs      = readFile('js/main.js');
const appJs       = readFile('app.js');
const reportsJs   = readFile('js/modules/reports.js');
const studentsJs  = readFile('js/modules/students.js');
const svcJs       = readFile('js/services/students.service.js');
const reportFacadeJs = readFile('js/modules/reports/reportExportFacade.js');
const releaseGateJs  = readFile('tools/check-release.mjs');
const pkgRaw      = readFile('package.json');

// ── Section 1: reports.js syntax ──────────────────────────────────────
console.log('▸ Section 1: reports.js syntax — no function inside import block');
if (reportsJs) {
    const importBlockRe = /import\s*\{([^}]*)\}\s*from/gs;
    let hasInsideImport = false;
    let m;
    while ((m = importBlockRe.exec(reportsJs)) !== null) {
        if (/function\s+\w+/.test(m[1]) || /^\s*function/m.test(m[1])) {
            hasInsideImport = true; break;
        }
    }
    check('reports.js: no function inside import {} block', !hasInsideImport,
        'Move _classifyInvTxForReport out of import block (PHẦN 1)');

    let syntaxOk = false;
    try {
        execSync('node --check ' + resolve(root, 'js/modules/reports.js'), { stdio: ['pipe','pipe','pipe'] });
        syntaxOk = true;
    } catch (_) {}
    check('reports.js: node --check passes', syntaxOk, 'node --check js/modules/reports.js');
}
console.log();

// ── Section 2: package.json scripts ──────────────────────────────────
console.log('▸ Section 2: package.json scripts');
if (pkgRaw) {
    let pkg = null;
    try { pkg = JSON.parse(pkgRaw); } catch(_) { try { pkg = eval('(' + pkgRaw + ')'); } catch(_2) {} }
    if (pkg && pkg.scripts) {
        check('package.json: check:reports-module-syntax defined',
            !!pkg.scripts['check:reports-module-syntax'],
            'Add "check:reports-module-syntax": "node tools/check-reports-module-syntax.mjs"');
        check('package.json: check:runtime-month-admission-hydration defined',
            !!pkg.scripts['check:runtime-month-admission-hydration'],
            'Add "check:runtime-month-admission-hydration": "node tools/check-runtime-month-admission-hydration.mjs"');
        check('package.json: ONE canonical check:release defined',
            !!pkg.scripts['check:release'] && !pkg.scripts['check:release2'] && !pkg.scripts['check:release-new'],
            'H6 release authority must be one canonical check:release command');
        check('check:release includes reports syntax validation',
            !!releaseGateJs && releaseGateJs.includes("'check:reports-module-syntax'"),
            'Canonical release gate must run check:reports-module-syntax');
        check('check:release includes runtime month/admission validation',
            !!releaseGateJs && releaseGateJs.includes("'check:runtime-month-admission-hydration'"),
            'Canonical release gate must run check:runtime-month-admission-hydration');
    }
}
console.log();

// ── Section 3: main.js Month Change Controller ──────────────────────
console.log('▸ Section 3: main.js Month Change Controller');
if (mainJs) {
    check('main.js: window.handleFilterMonthChange defined',
        mainJs.includes('window.handleFilterMonthChange'),
        'Add window.handleFilterMonthChange = async function(month, reason) {...} to main.js');
    check('main.js: handleFilterMonthChange calls listenToData',
        mainJs.includes('listenToData(selectedMonth)') || mainJs.includes('listenToData(month)'),
        'handleFilterMonthChange must call window.listenToData(selectedMonth)');
    check('main.js: handleFilterMonthChange invalidates finance',
        mainJs.includes("invalidateFinance('filter-month-change')"),
        'handleFilterMonthChange must call window.invalidateFinance("filter-month-change")');
    check('main.js: window.onFilterMonthChange alias defined',
        mainJs.includes('window.onFilterMonthChange'),
        'Add window.onFilterMonthChange = function() {...} alias');
    check('main.js: window.initFilterMonthController defined',
        mainJs.includes('window.initFilterMonthController'),
        'Add window.initFilterMonthController = function() {...} to main.js');
    check('main.js: initFilterMonthController uses __filterMonthControllerBound guard',
        mainJs.includes('__filterMonthControllerBound'),
        'initFilterMonthController must check el.__filterMonthControllerBound to avoid duplicate binding');
}
console.log();

// ── Section 4: app.js filterMonth binding ─────────────────────────
console.log('▸ Section 4: app.js filterMonth binding bridges http-module mode');
if (appJs) {
    check('app.js: filterMonth onchange bridges handleFilterMonthChange in http-module',
        appJs.includes('handleFilterMonthChange') && appJs.includes("'http-module'"),
        "app.js filterMonth onchange: add 'if (window.__RUNTIME_MODE === 'http-module' && ...) return window.handleFilterMonthChange'");
    check('app.js: filterMonth onchange still calls listenToData as fallback',
        appJs.includes('window.listenToData(e.target.value)'),
        'app.js filterMonth onchange must call window.listenToData(e.target.value) as file-mode fallback');
}
console.log();

// ── Section 5: StudentService.addTuitionTransaction ──────────────
console.log('▸ Section 5: StudentService canonical transaction writers return { id, ...data }');
if (svcJs) {
    check('students.service.js: addTuitionTransaction returns docRef.id',
        svcJs.includes('addTuitionTransaction') && svcJs.includes('docRef.id') &&
        svcJs.includes('return { id: docRef.id'),
        'addTuitionTransaction must: const docRef = await addDoc(...); return { id: docRef.id, ...data }');
    check('students.service.js: addUniformTransaction returns docRef.id',
        svcJs.includes('addUniformTransaction') && svcJs.includes('return { id: docRef.id'),
        'addUniformTransaction must also return { id: docRef.id, ...data }');
    check('students.service.js: canonical addGenericTransaction returns docRef.id',
        svcJs.includes('addGenericTransaction') && svcJs.includes("canonicalizeTransactionForWrite(data, 'student-service-generic')") &&
        svcJs.includes('return { id: docRef.id, ...payload }'),
        'Admission bundle writer must return canonical transaction identity for same-write runtime hydration');
}
console.log();

// ── Section 6: mergeTransactionIntoRuntimeStore ───────────────────
console.log('▸ Section 6: main.js mergeTransactionIntoRuntimeStore helper');
if (mainJs) {
    check('main.js: window.mergeTransactionIntoRuntimeStore defined',
        mainJs.includes('window.mergeTransactionIntoRuntimeStore'),
        'Add window.mergeTransactionIntoRuntimeStore = function(tx, reason) {...} to main.js');
    check('mergeTransactionIntoRuntimeStore: uses Map to avoid duplicates',
        mainJs.includes('window.mergeTransactionIntoRuntimeStore') && mainJs.includes('new Map()'),
        'mergeTransactionIntoRuntimeStore must use a Map to deduplicate transactions');
    check('mergeTransactionIntoRuntimeStore: checks packageMonths when matching selected month',
        mainJs.includes('packageMonths') && mainJs.includes('mergeTransactionIntoRuntimeStore'),
        'mergeTransactionIntoRuntimeStore must match by packageMonths for multi-month packages');
    check('mergeTransactionIntoRuntimeStore: calls invalidateFinance or refreshListsComputation',
        mainJs.includes('invalidateFinance') && mainJs.includes('mergeTransactionIntoRuntimeStore'),
        'mergeTransactionIntoRuntimeStore must invalidate renders after merging');
}
console.log();

// ── Section 7: students.js canonical admission bundle ─────────────
console.log('▸ Section 7: js/modules/students.js canonical admission bundle hydration');
if (studentsJs) {
    const admissionStart = studentsJs.indexOf('window.addNewStudent = async');
    const admissionEnd = studentsJs.indexOf('window.updateProfile = async', admissionStart >= 0 ? admissionStart : 0);
    const admissionBody = admissionStart >= 0 ? studentsJs.slice(admissionStart, admissionEnd > admissionStart ? admissionEnd : admissionStart + 40000) : '';
    check('students.js: admission uses existing buildPaymentBundleTransaction authority',
        admissionBody.includes('buildPaymentBundleTransaction') && admissionBody.includes('components: _admComponents'),
        'Admission must construct one canonical payment bundle; do not restore separate transaction truth');
    check('students.js: admission uses generic canonical writer with compatible tuition fallback',
        admissionBody.includes('StudentService.addGenericTransaction') &&
        admissionBody.includes('StudentService.addTuitionTransaction.bind(StudentService)'),
        'Use addGenericTransaction for canonical bundle while retaining current compatible writer fallback');
    check('students.js: captures canonical bundle transaction and hydrates same tx into runtime store',
        admissionBody.includes('tuitionTx = await _addFn(_bundleTx)') &&
        admissionBody.includes("mergeTransactionIntoRuntimeStore(tuitionTx, 'admission-bundle-created')"),
        'The exact created bundle transaction must be merged once into runtime store');
}
console.log();

// ── Section 8: app.js legacy-compatible admission bundle ─────────
console.log('▸ Section 8: app.js legacy-compatible admission bundle hydration');
if (appJs) {
    check('app.js: legacy path prefers existing payment bundle authority',
        appJs.includes('if(_hasFinancialPayment && typeof window.buildPaymentBundleTransaction') &&
        appJs.includes("_canonicalTxPayload(_bundleTx, 'payment-bundle')"),
        'Legacy path must reuse buildPaymentBundleTransaction + canonical transaction writer when available');
    check('app.js: legacy bundle captures created id and hydrates same transaction',
        appJs.includes('tuitionTx = Object.assign({ id: _bundleDoc.id }, _bundleTx)') &&
        appJs.includes("mergeTransactionIntoRuntimeStore(tuitionTx, 'admission-bundle-created')"),
        'Legacy-compatible path must hydrate the exact canonical bundle transaction');
    check('app.js: old direct tuition path remains compatibility fallback only',
        appJs.includes('} else if(fee > 0) {') && appJs.includes("'admission-tuition-created-legacy'"),
        'Direct tuition write may remain only as existing compatibility fallback, not primary admission authority');
}
console.log();

// ── Section 9: debug helpers ──────────────────────────────────────
console.log('▸ Section 9: debug helpers');
if (mainJs) {
    check('main.js: window.debugMonthRuntime defined',
        mainJs.includes('window.debugMonthRuntime'),
        'Add window.debugMonthRuntime = function() {...} to main.js');
    check('main.js: debugMonthRuntime checks filterMonthValue',
        mainJs.includes('filterMonthValue') && mainJs.includes('debugMonthRuntime'),
        'debugMonthRuntime must include filterMonthValue in result');
    check('main.js: window.debugAdmissionTxHydration defined',
        mainJs.includes('window.debugAdmissionTxHydration'),
        'Add window.debugAdmissionTxHydration = function(studentName) {...} to main.js');
    check('main.js: debugAdmissionTxHydration checks packageMonths match',
        mainJs.includes('packageMonths') && mainJs.includes('debugAdmissionTxHydration'),
        'debugAdmissionTxHydration must match transactions by packageMonths');
    check('main.js: debugRuntimeSmokeTest includes monthRuntime',
        mainJs.includes('monthRuntime') && mainJs.includes('debugRuntimeSmokeTest'),
        'debugRuntimeSmokeTest must call debugMonthRuntime and include monthRuntime in summary');
    check('main.js: debugRuntimeSmokeTest includes admissionTxHydration',
        mainJs.includes('admissionTxHydration') && mainJs.includes('debugRuntimeSmokeTest'),
        'debugRuntimeSmokeTest must call debugAdmissionTxHydration and include admissionTxHydrationOk in summary');
}
console.log();

// ── Section 10: lazy reports / SuperAdmin isolation ───────────────
console.log('▸ Section 10: lazy reports / SuperAdmin isolation');
if (mainJs && reportFacadeJs) {
    check('main.js: registers lightweight reportExportFacade rather than eager reports.js',
        mainJs.includes('registerReportExportFacade') &&
        mainJs.includes("from './modules/reports/reportExportFacade.js") &&
        !/from\s+['\"]\.\/modules\/reports\.js/.test(mainJs),
        'Startup may register the facade only; heavy reports.js must not be an eager import');
    check('reportExportFacade: dynamically imports reports.js only on report action',
        /import\(['\"]\.\.\/reports\.js(?:\?[^'\"]*)?['\"]\)/.test(reportFacadeJs) &&
        reportFacadeJs.includes('reportsModulePromise'),
        'Heavy reports module must remain behind the existing lazy facade');
    check('reportExportFacade: initializes loaded reports implementation after lazy import',
        reportFacadeJs.includes("typeof mod.initReports !== 'function'") && reportFacadeJs.includes('mod.initReports()'),
        'initReports belongs inside lazy module resolution, not app startup');
    check('main.js: initSuperAdmin remains isolated by try/catch',
        /try\s*\{\s*initSuperAdmin\(\);\s*\}\s*catch/s.test(mainJs),
        'SuperAdmin init must remain isolated from unrelated module failures');
}
console.log();

// ── Final Summary ─────────────────────────────────────────────────
console.log('══════════════════════════════════════════════════════════');
console.log('  Total: ' + (pass + fail) + ' checks | ✅ Pass: ' + pass + ' | ❌ Fail: ' + fail);
if (fail > 0) {
    console.error('\nFailed checks:');
    errors.forEach(e => console.error('  - ' + e));
    console.log('══════════════════════════════════════════════════════════\n');
    process.exit(1);
} else {
    console.log('\n  🎉 All runtime month + admission hydration checks passed!');
    console.log('  reports.js syntax OK, month controller ready, tx hydration ready.');
    console.log('══════════════════════════════════════════════════════════\n');
}
