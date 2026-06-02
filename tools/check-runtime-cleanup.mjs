/**
 * tools/check-runtime-cleanup.mjs — Phase 4K-RUNTIME-CLEANUP Overall Check
 * ─────────────────────────────────────────────────────────────────────────────
 * Kiểm tra tổng thể Phase 4K-RUNTIME-CLEANUP:
 * 1. ensureModuleRuntimeReady early fallback dùng __runtimeReadyFallbackWarned (log 1 lần).
 * 2. editProfile bridge dùng multi-candidate pattern.
 * 3. Pagination guards reset trong _patchResetStore khi logout.
 * 4. __runtimeReadyFallbackWarned cũng reset khi logout.
 * 5. window.printClubRuntimeDiagnostics tồn tại.
 * 6. warnUnsafeLimit listenToData có uiOnly: true.
 *
 * Chạy: node tools/check-runtime-cleanup.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

function readFile(p) {
    try { return readFileSync(resolve(root, p), 'utf8'); } catch (_) { return null; }
}

let pass = 0, fail = 0;
const errors = [];

function check(label, condition, hint) {
    if (condition) { console.log('  ✅ ' + label); pass++; }
    else { console.error('  ❌ ' + label); if (hint) console.error('     → ' + hint); fail++; errors.push(label); }
}

console.log('\n══════════════════════════════════════════════════════════');
console.log('  Phase 4K-RUNTIME-CLEANUP Overall Check');
console.log('══════════════════════════════════════════════════════════\n');

const mainJs = readFile('js/main.js');
const appJs  = readFile('app.js');

if (!mainJs) { console.error('  ❌ FATAL: js/main.js not found'); process.exit(1); }

console.log('▸ Section 1: ensureModuleRuntimeReady fallback once-only');
check('Fallback có __runtimeReadyFallbackWarned guard (log 1 lần)',
    mainJs.includes('__runtimeReadyFallbackWarned') && mainJs.includes('fallback active before full runtime ready'),
    "Thêm: if (!window.__runtimeReadyFallbackWarned) { window.__runtimeReadyFallbackWarned = true; console.warn(...) }");

const _fallbackBeforeBootstrap =
    mainJs.indexOf('__runtimeReadyFallbackWarned') < mainJs.indexOf('(async function bootstrap()');
check('__runtimeReadyFallbackWarned guard nằm trước bootstrap IIFE',
    _fallbackBeforeBootstrap,
    'Fallback phải được khai báo trước (async function bootstrap()...)');

console.log();
console.log('▸ Section 2: editProfile multi-candidate bridge');
check('editProfile bridge dùng candidates array',
    mainJs.includes('candidates') && mainJs.includes('__realEditProfile') && mainJs.includes('editProfile'),
    'Bridge nên check: __realEditProfile, openProfile, editStudent, openEditProfile, showStudentModal');
check('Bridge forward đến candidate đầu tiên available',
    /candidates\[0\]\(\.\.\.args\)|candidates\[0\]\.apply/.test(mainJs),
    'Dùng: if (candidates.length) return candidates[0](...args)');

console.log();
console.log('▸ Section 3: Logout guard reset trong _patchResetStore');
const _hasStudentReset = mainJs.includes('__studentPaginationInitialized    = false') ||
    mainJs.includes('__studentPaginationInitialized = false');
check('__studentPaginationInitialized reset khi logout',
    _hasStudentReset,
    'Trong _patchResetStore: window.__studentPaginationInitialized = false;');

const _hasTxReset = mainJs.includes('__transactionPaginationInitialized = false') ||
    mainJs.includes('__transactionPaginationInitialized  = false');
check('__transactionPaginationInitialized reset khi logout',
    _hasTxReset,
    'Trong _patchResetStore: window.__transactionPaginationInitialized = false;');

check('__dbReadyEventDispatched reset khi logout',
    mainJs.includes('__dbReadyEventDispatched') && (
        mainJs.includes('__dbReadyEventDispatched          = false') ||
        mainJs.includes('__dbReadyEventDispatched = false')
    ),
    'Trong _patchResetStore: window.__dbReadyEventDispatched = false;');

check('__runtimeReadyFallbackWarned reset khi logout',
    mainJs.includes('__runtimeReadyFallbackWarned      = false') ||
    mainJs.includes('__runtimeReadyFallbackWarned = false'),
    'Trong _patchResetStore: window.__runtimeReadyFallbackWarned = false;');

console.log();
console.log('▸ Section 4: printClubRuntimeDiagnostics');
check('window.printClubRuntimeDiagnostics defined',
    mainJs.includes('window.printClubRuntimeDiagnostics'),
    'Thêm: window.printClubRuntimeDiagnostics = async function() { ... }');
check('printClubRuntimeDiagnostics là async function',
    mainJs.includes('async function printClubRuntimeDiagnostics'),
    'Phải là async để await getCountFromServer');
check('printClubRuntimeDiagnostics dùng getCountFromServer',
    mainJs.includes('getCountFromServer'),
    'Dùng getCountFromServer để đếm profile mà không đọc full docs');
check('printClubRuntimeDiagnostics có permission-denied handler',
    mainJs.includes('permission-denied'),
    'Bắt lỗi Firestore permission-denied và log rõ ràng');

console.log();
console.log('▸ Section 5: warnUnsafeLimit uiOnly trong listenToData');
if (appJs) {
    check('listenToData warnUnsafeLimit có uiOnly: true',
        /warnUnsafeLimit\s*\([^)]*\{\s*uiOnly\s*:\s*true\s*\}/.test(appJs.replace(/\n/g,' ')),
        "warnUnsafeLimit('transactions:...', 'listenToData:init', { uiOnly: true })");
}

console.log();
console.log('══════════════════════════════════════════════════════════');
console.log('  Total: ' + (pass+fail) + ' | ✅ ' + pass + ' | ❌ ' + fail);
if (fail > 0) {
    errors.forEach(e => console.error('  ❌ ' + e));
    console.log('══════════════════════════════════════════════════════════\n');
    process.exit(1);
} else {
    console.log('\n  🎉 All Phase 4K-RUNTIME-CLEANUP checks passed!');
    console.log('══════════════════════════════════════════════════════════\n');
}
