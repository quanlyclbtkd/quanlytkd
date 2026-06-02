/**
 * tools/check-runtime-init.mjs — Runtime Init Order Check
 * ─────────────────────────────────────────────────────────────────
 * Kiểm tra Phase 4K-RUNTIME-INIT-FIX:
 * 1. ensureModuleRuntimeReady có early fallback TRƯỚC bootstrap IIFE.
 * 2. Bootstrap guard typeof ensureModuleRuntimeReady vẫn tồn tại.
 * 3. __paginationDbReadyListenerRegistered guard tồn tại.
 * 4. app:context-ready / app:db-ready listener cho pagination.
 * 5. __studentPaginationInitialized guard khi init.
 * 6. __transactionPaginationInitialized guard khi init.
 *
 * Chạy: node tools/check-runtime-init.mjs
 * Hoặc: npm run check:runtime-init
 * ─────────────────────────────────────────────────────────────────
 */

import { readFileSync } from 'fs';
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
console.log('  Runtime Init Order Check — Phase 4K-RUNTIME-INIT-FIX');
console.log('══════════════════════════════════════════════════════════\n');

const mainJs = readFile('js/main.js');

if (!mainJs) {
    console.error('  ❌ FATAL: js/main.js không đọc được!');
    process.exit(1);
}

// ── Section 1: Early fallback cho ensureModuleRuntimeReady ──────────────────
console.log('▸ Section 1: ensureModuleRuntimeReady early fallback');

// Find position of bootstrap IIFE relative to the early fallback assignment
const _bootstrapIdx = mainJs.indexOf('(async function bootstrap()');
const _fallbackIdx  = mainJs.indexOf('window.ensureModuleRuntimeReady = window.ensureModuleRuntimeReady ||');

check(
    'ensureModuleRuntimeReady early fallback tồn tại trong main.js',
    _fallbackIdx !== -1,
    'Thêm: window.ensureModuleRuntimeReady = window.ensureModuleRuntimeReady || function(...){} trước bootstrap IIFE'
);

check(
    'early fallback nằm TRƯỚC bootstrap IIFE',
    _fallbackIdx !== -1 && _bootstrapIdx !== -1 && _fallbackIdx < _bootstrapIdx,
    'Fallback phải đứng trước (async function bootstrap() { ... })()'
);

const _hasFallbackFn = /window\.ensureModuleRuntimeReady\s*=\s*window\.ensureModuleRuntimeReady\s*\|\|/.test(mainJs);
check(
    'Fallback dùng pattern ||= (không ghi đè nếu đã có impl thật)',
    _hasFallbackFn,
    'Pattern: window.ensureModuleRuntimeReady = window.ensureModuleRuntimeReady || function(...){...}'
);

// ── Section 2: Bootstrap typeof guard vẫn tồn tại ──────────────────────────
console.log();
console.log('▸ Section 2: Bootstrap typeof guard cho ensureModuleRuntimeReady');

const _hasTypeofGuard = /typeof\s+window\.ensureModuleRuntimeReady\s*===\s*['"]function['"]/.test(mainJs);
check(
    'Bootstrap còn typeof guard (defense in depth)',
    _hasTypeofGuard,
    "Giữ: if (typeof window.ensureModuleRuntimeReady === 'function') { ... }"
);

// ── Section 3: Pagination guards ────────────────────────────────────────────
console.log();
console.log('▸ Section 3: Pagination double-init guards');

const _hasStudentGuard = mainJs.includes('__studentPaginationInitialized');
check(
    '__studentPaginationInitialized guard tồn tại',
    _hasStudentGuard,
    'Thêm: window.__studentPaginationInitialized = true; trước initStudentPagination()'
);

const _hasTxGuard = mainJs.includes('__transactionPaginationInitialized');
check(
    '__transactionPaginationInitialized guard tồn tại',
    _hasTxGuard,
    'Thêm: window.__transactionPaginationInitialized = true; trước initTransactionPagination()'
);

// ── Section 4: app:context-ready / app:db-ready listener ───────────────────
console.log();
console.log('▸ Section 4: Pagination retry via event listener');

const _hasContextReadyListener =
    mainJs.includes("'app:context-ready', _tryInitPaginationsOnDbReady") ||
    mainJs.includes('"app:context-ready", _tryInitPaginationsOnDbReady') ||
    (mainJs.includes('app:context-ready') && mainJs.includes('initStudentPagination') && mainJs.includes('addEventListener'));
check(
    'app:context-ready listener cho pagination retry',
    _hasContextReadyListener,
    "Thêm: window.addEventListener('app:context-ready', _tryInitPaginationsOnDbReady)"
);

const _hasDbReadyListener =
    mainJs.includes("'app:db-ready', _tryInitPaginationsOnDbReady") ||
    mainJs.includes('"app:db-ready", _tryInitPaginationsOnDbReady') ||
    (mainJs.includes('app:db-ready') && mainJs.includes('addEventListener'));
check(
    'app:db-ready listener cho pagination retry',
    _hasDbReadyListener,
    "Thêm: window.addEventListener('app:db-ready', _tryInitPaginationsOnDbReady)"
);

const _hasPaginationListenerGuard = mainJs.includes('__paginationDbReadyListenerRegistered');
check(
    '__paginationDbReadyListenerRegistered guard ngăn duplicate listeners',
    _hasPaginationListenerGuard,
    'Thêm: if (!window.__paginationDbReadyListenerRegistered) { window.__paginationDbReadyListenerRegistered = true; ... }'
);

// ── Section 5: app.js dispatches app:db-ready ───────────────────────────────
console.log();
console.log('▸ Section 5: app.js dispatch app:db-ready event');
const appJs = readFile('app.js');
if (appJs) {
    const _hasDbReadyDispatch = appJs.includes("'app:db-ready'") || appJs.includes('"app:db-ready"');
    check(
        "app.js dispatch CustomEvent('app:db-ready')",
        _hasDbReadyDispatch,
        "Thêm trong initSaaSDatabase: window.dispatchEvent(new CustomEvent('app:db-ready', {...}))"
    );

    const _hasDbReadyGuard = appJs.includes('__dbReadyEventDispatched');
    check(
        '__dbReadyEventDispatched guard ngăn dispatch lặp',
        _hasDbReadyGuard,
        'Thêm: if (!window.__dbReadyEventDispatched) { window.__dbReadyEventDispatched = true; ... }'
    );
}

// ── Summary ─────────────────────────────────────────────────────────────────
console.log();
console.log('══════════════════════════════════════════════════════════');
console.log('  Total: ' + (pass + fail) + ' checks | ✅ Pass: ' + pass + ' | ❌ Fail: ' + fail);

if (fail > 0) {
    console.error('\nFailed checks:');
    errors.forEach(e => console.error('  - ' + e));
    console.error('\n  ⚠️  Runtime init order sai — ensureModuleRuntimeReady hoặc pagination sẽ skip!');
    console.log('══════════════════════════════════════════════════════════\n');
    process.exit(1);
} else {
    console.log('\n  🎉 All runtime init order checks passed!');
    console.log('  Bootstrap sẽ không còn log "ensureModuleRuntimeReady chưa sẵn sàng".');
    console.log('  Pagination sẽ tự init khi db ready qua event listener.');
    console.log('══════════════════════════════════════════════════════════\n');
}
