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
        check('package.json: check:all includes check:reports-module-syntax',
            pkg.scripts['check:all'] && pkg.scripts['check:all'].includes('check:reports-module-syntax'),
            'Add check:reports-module-syntax to check:all');
        check('package.json: check:all includes check:runtime-month-admission-hydration',
            pkg.scripts['check:all'] && pkg.scripts['check:all'].includes('check:runtime-month-admission-hydration'),
            'Add check:runtime-month-admission-hydration to check:all');
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
console.log('▸ Section 5: StudentService.addTuitionTransaction returns { id, ...data }');
if (svcJs) {
    check('students.service.js: addTuitionTransaction returns docRef.id',
        svcJs.includes('addTuitionTransaction') && svcJs.includes('docRef.id') &&
        svcJs.includes('return { id: docRef.id'),
        'addTuitionTransaction must: const docRef = await addDoc(...); return { id: docRef.id, ...data }');
    check('students.service.js: addUniformTransaction returns docRef.id',
        svcJs.includes('addUniformTransaction') && svcJs.includes('return { id: docRef.id'),
        'addUniformTransaction must also return { id: docRef.id, ...data }');
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

// ── Section 7: students.js addNewStudent ─────────────────────────
console.log('▸ Section 7: js/modules/students.js addNewStudent merge tuitionTx');
if (studentsJs) {
    check('students.js: captures return value of addTuitionTransaction',
        studentsJs.includes('tuitionTx = await StudentService.addTuitionTransaction'),
        'addNewStudent must capture: tuitionTx = await StudentService.addTuitionTransaction(...)');
    check('students.js: calls mergeTransactionIntoRuntimeStore after addTuitionTransaction',
        studentsJs.includes('mergeTransactionIntoRuntimeStore') &&
        studentsJs.includes('admission-tuition-created'),
        'addNewStudent must call mergeTransactionIntoRuntimeStore(tuitionTx, "admission-tuition-created")');
}
console.log();

// ── Section 8: app.js addNewStudent legacy ─────────────────────────
console.log('▸ Section 8: app.js addNewStudent legacy merge tuitionTx');
if (appJs) {
    check('app.js: legacy addNewStudent captures tuitionTx after addDoc',
        appJs.includes('tuitionTx') && appJs.includes('_txDoc.id') &&
        appJs.includes('admission-tuition-created-legacy'),
        'app.js addNewStudent: capture const _txDoc = await addDoc(...); tuitionTx = { id: _txDoc.id, ...txPayload }');
    check('app.js: legacy addNewStudent calls mergeTransactionIntoRuntimeStore',
        appJs.includes('mergeTransactionIntoRuntimeStore') &&
        appJs.includes('admission-tuition-created-legacy'),
        'app.js addNewStudent must call mergeTransactionIntoRuntimeStore(tuitionTx, "admission-tuition-created-legacy")');
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

// ── Section 10: initReports/initSuperAdmin isolation ─────────────
console.log('▸ Section 10: initReports / initSuperAdmin isolation in main.js');
if (mainJs) {
    check('main.js: initReports wrapped in try/catch',
        mainJs.includes('initReports') &&
        (mainJs.includes('initReports()') &&
         /try\s*\{[^}]*initReports\(\)/.test(mainJs.replace(/\n/g, ' '))),
        'Wrap initReports() in try/catch so syntax error does not kill SuperAdmin');
    check('main.js: initSuperAdmin wrapped in try/catch',
        mainJs.includes('initSuperAdmin') &&
        /try\s*\{[^}]*initSuperAdmin\(\)/.test(mainJs.replace(/\n/g, ' ')),
        'Wrap initSuperAdmin() in try/catch so other module errors do not kill it');
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
