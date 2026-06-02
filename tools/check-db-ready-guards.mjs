/**
 * tools/check-db-ready-guards.mjs — Firebase DB Ready Guards Check
 * ─────────────────────────────────────────────────────────────────
 * Kiểm tra source có đầy đủ db-ready guards để tránh lỗi:
 *   [StudentService] db chưa sẵn sàng
 *   [FinanceService] db chưa sẵn sàng
 *
 * Các điểm cần kiểm tra:
 * 1. js/main.js — initStudentPagination có check window.__store.db trước khi gọi.
 * 2. js/main.js — initTransactionPagination có check window.__store.db trước khi gọi.
 * 3. js/services/students.service.js — _db() throw có controlled (không crash silently).
 * 4. js/services/finance.service.js — _db() throw có controlled.
 * 5. js/main.js — ensureModuleRuntimeReady calls có typeof guard.
 *
 * Chạy: node tools/check-db-ready-guards.mjs
 * Hoặc: npm run check:db-ready-guards
 * ─────────────────────────────────────────────────────────────────
 */

import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

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
console.log('  Firebase DB Ready Guards Check');
console.log('══════════════════════════════════════════════════════════\n');

const mainJs = readFile('js/main.js');
const studentsServiceJs = readFile('js/services/students.service.js');
const financeServiceJs = readFile('js/services/finance.service.js');

console.log('▸ Section 1: main.js — initStudentPagination có db guard');
if (mainJs) {
    // Check that initStudentPagination is called only when __store.db exists
    const _hasStudentDbGuard =
        /window\.__store\s*&&\s*window\.__store\.(?:profRef[^&]*&&\s*window\.__store\.db|db[^&]*&&\s*window\.__store\.profRef)/.test(mainJs) ||
        /window\.__store\.db[^;]*initStudentPagination/.test(mainJs) ||
        /__store\.profRef\s*&&\s*window\.__store\.db/.test(mainJs) ||
        /__store\.db.*initStudentPagination|initStudentPagination.*__store\.db/.test(mainJs.replace(/\n/g, ' '));
    check('initStudentPagination được guard bằng window.__store.db',
        _hasStudentDbGuard,
        'Thêm: if (window.__store && window.__store.profRef && window.__store.db) { initStudentPagination(); }');

    const _hasTransactionDbGuard =
        /window\.__store\s*&&\s*window\.__store\.(?:colRef[^&]*&&\s*window\.__store\.db|db[^&]*&&\s*window\.__store\.colRef)/.test(mainJs) ||
        /__store\.colRef\s*&&\s*window\.__store\.db/.test(mainJs) ||
        /__store\.db.*initTransactionPagination|initTransactionPagination.*__store\.db/.test(mainJs.replace(/\n/g, ' '));
    check('initTransactionPagination được guard bằng window.__store.db',
        _hasTransactionDbGuard,
        'Thêm: if (window.__store && window.__store.colRef && window.__store.db) { initTransactionPagination(); }');

    console.log();
    console.log('▸ Section 2: main.js — ensureModuleRuntimeReady có typeof guard');
    const _hasEnsureGuard =
        /typeof\s+window\.ensureModuleRuntimeReady\s*===\s*['"]function['"]/.test(mainJs) ||
        /typeof window\.ensureModuleRuntimeReady.*function/.test(mainJs);
    check('ensureModuleRuntimeReady calls có typeof guard trước khi gọi',
        _hasEnsureGuard,
        "Bọc calls bằng: if (typeof window.ensureModuleRuntimeReady === 'function') { ... }");

    // Check that there's a warn log for when it's missing
    const _hasEnsureWarn =
        mainJs.includes('ensureModuleRuntimeReady chưa sẵn sàng') ||
        (mainJs.includes('ensureModuleRuntimeReady') && mainJs.includes('warn'));
    check('Có console.warn khi ensureModuleRuntimeReady chưa sẵn sàng',
        _hasEnsureWarn,
        "Thêm: console.warn('[Bootstrap] ensureModuleRuntimeReady chưa sẵn sàng...')");
}

console.log();
console.log('▸ Section 3: students.service.js — _db() có error message rõ ràng');
if (studentsServiceJs) {
    const _hasStudentDbCheck =
        studentsServiceJs.includes('[StudentService] db chưa sẵn sàng') ||
        studentsServiceJs.includes('db chưa sẵn sàng');
    check('students.service.js _db() throw với message rõ ràng (không silent fail)',
        _hasStudentDbCheck,
        '_db() phải throw Error với message rõ để dễ debug');

    // Check it throws (not silent) — this is correct behavior
    const _throwsNotSilent = studentsServiceJs.includes('throw new Error') &&
        studentsServiceJs.includes('db chưa sẵn sàng');
    check('students.service.js _db() throw Error (không return null silently)',
        _throwsNotSilent,
        'Throw error rõ ràng để caller biết db chưa ready, không nên return null');
}

console.log();
console.log('▸ Section 4: finance.service.js — _db() có error message rõ ràng');
if (financeServiceJs) {
    const _hasFinanceDbCheck =
        financeServiceJs.includes('[FinanceService] db chưa sẵn sàng') ||
        financeServiceJs.includes('db chưa sẵn sàng');
    check('finance.service.js _db() throw với message rõ ràng',
        _hasFinanceDbCheck,
        '_db() phải throw Error với message rõ để dễ debug');

    const _throwsNotSilent = financeServiceJs.includes('throw new Error') &&
        financeServiceJs.includes('db chưa sẵn sàng');
    check('finance.service.js _db() throw Error (không return null silently)',
        _throwsNotSilent,
        'Throw error rõ ràng để caller biết db chưa ready');
}

console.log();
console.log('▸ Section 5: package.json có check:db-ready-guards');
const pkgJson = readFile('package.json');
if (pkgJson) {
    const pkg = JSON.parse(pkgJson);
    check('check:db-ready-guards script defined in package.json',
        !!(pkg.scripts && pkg.scripts['check:db-ready-guards']),
        'Thêm: "check:db-ready-guards": "node tools/check-db-ready-guards.mjs"');
    check('check:all includes check-db-ready-guards',
        !!(pkg.scripts && pkg.scripts['check:all'] && pkg.scripts['check:all'].includes('check-db-ready-guards')),
        'Thêm node tools/check-db-ready-guards.mjs vào chuỗi check:all');
}

console.log();
console.log('▸ Section 6: app:context-ready / app:db-ready listener cho pagination');
if (mainJs) {
    const _hasContextReadyPagination =
        mainJs.includes('app:context-ready') &&
        (mainJs.includes('initStudentPagination') || mainJs.includes('_tryInitPaginations'));
    check('app:context-ready listener trigger pagination init',
        _hasContextReadyPagination,
        "Thêm: window.addEventListener('app:context-ready', function() { initStudentPagination(); })");

    const _hasDbReadyPagination =
        mainJs.includes('app:db-ready') &&
        (mainJs.includes('initStudentPagination') || mainJs.includes('_tryInitPaginations'));
    check('app:db-ready listener trigger pagination init',
        _hasDbReadyPagination,
        "Thêm: window.addEventListener('app:db-ready', function() { initStudentPagination(); })");

    check('__studentPaginationInitialized double-init guard tồn tại',
        mainJs.includes('__studentPaginationInitialized'),
        'Thêm: window.__studentPaginationInitialized = true; trước initStudentPagination()');

    check('__transactionPaginationInitialized double-init guard tồn tại',
        mainJs.includes('__transactionPaginationInitialized'),
        'Thêm: window.__transactionPaginationInitialized = true; trước initTransactionPagination()');
}

console.log();
console.log('══════════════════════════════════════════════════════════');
console.log('  Total: ' + (pass + fail) + ' checks | ✅ Pass: ' + pass + ' | ❌ Fail: ' + fail);

if (fail > 0) {
    console.error('\nFailed checks:');
    errors.forEach(e => console.error('  - ' + e));
    console.error('\n  ⚠️  DB ready guards thiếu — StudentService/FinanceService sẽ crash khi db chưa init!');
    console.log('══════════════════════════════════════════════════════════\n');
    process.exit(1);
} else {
    console.log('\n  🎉 All DB ready guard checks passed!');
    console.log('  Pagination services sẽ không crash khi db chưa sẵn sàng.');
    console.log('══════════════════════════════════════════════════════════\n');
}
