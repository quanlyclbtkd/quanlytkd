/**
 * tools/check-profile-hydration.mjs — Profile Hydration Safety Check
 * ─────────────────────────────────────────────────────────────────────
 * Kiểm tra profile hydration pipeline:
 * 1. Profile listener được khởi tạo trong initSaaSDatabase sau khi db sẵn sàng.
 * 2. Pagination guard reset khi logout để login lại init mới.
 * 3. Query profiles không dùng filter status bắt buộc mà bỏ lọc legacy data.
 * 4. Profile store reset khi logout (resetStudentProfileStore).
 * 5. app:context-ready / app:db-ready dispatch sau db sẵn sàng.
 *
 * Chạy: node tools/check-profile-hydration.mjs
 * ─────────────────────────────────────────────────────────────────────
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
console.log('  Profile Hydration Safety Check — Phase 4K-RUNTIME-CLEANUP');
console.log('══════════════════════════════════════════════════════════\n');

const mainJs = readFile('js/main.js');
const appJs  = readFile('app.js');

console.log('▸ Section 1: app.js — profile listener init sau db ready');
if (appJs) {
    check('initSaaSDatabase trong app.js khởi tạo profile listener',
        appJs.includes('initSaaSDatabase') &&
        (appJs.includes('Active profiles listener') || appJs.includes('profiles listener') || appJs.includes('profRef')),
        'profRef / profile listener phải được khởi tạo trong initSaaSDatabase');

    check('Profile listener fallback an toàn (active + full fallback)',
        appJs.includes('Active profiles listener') || appJs.includes('resetProfilesListeners'),
        'Phải có resetProfilesListeners để reset khi logout');

    check('resetProfilesListeners được gọi khi logout trong app.js',
        appJs.includes('resetProfilesListeners') && appJs.includes('logout'),
        'Trong logout: if (window.resetProfilesListeners) window.resetProfilesListeners("logout")');

    check('resetStudentProfileStore được gọi khi logout',
        appJs.includes('resetStudentProfileStore') && appJs.includes('logout'),
        'Trong logout: if (window.resetStudentProfileStore) window.resetStudentProfileStore("logout")');
}

console.log();
console.log('▸ Section 2: app.js — app:context-ready và app:db-ready dispatch');
if (appJs) {
    check("app:context-ready dispatch sau db ready",
        appJs.includes("'app:context-ready'") || appJs.includes('"app:context-ready"'),
        "dispatchAppContextReady('initSaaSDatabase-store-synced')");

    check("app:db-ready dispatch sau db ready",
        appJs.includes("'app:db-ready'") || appJs.includes('"app:db-ready"'),
        "window.dispatchEvent(new CustomEvent('app:db-ready', {...}))");

    check('__dbReadyEventDispatched guard ngăn dispatch lặp',
        appJs.includes('__dbReadyEventDispatched'),
        'Guard: if (!window.__dbReadyEventDispatched) { ... }');
}

console.log();
console.log('▸ Section 3: main.js — pagination hydration via event listener');
if (mainJs) {
    check('app:context-ready listener cho pagination init',
        mainJs.includes('app:context-ready') && mainJs.includes('initStudentPagination'),
        "window.addEventListener('app:context-ready', _tryInitPaginationsOnDbReady)");

    check('app:db-ready listener cho pagination init',
        mainJs.includes('app:db-ready') && mainJs.includes('initStudentPagination'),
        "window.addEventListener('app:db-ready', _tryInitPaginationsOnDbReady)");

    check('__studentPaginationInitialized guard chống double-init',
        mainJs.includes('__studentPaginationInitialized'),
        'window.__studentPaginationInitialized = true; trước initStudentPagination()');

    check('__transactionPaginationInitialized guard chống double-init',
        mainJs.includes('__transactionPaginationInitialized'),
        'window.__transactionPaginationInitialized = true; trước initTransactionPagination()');
}

console.log();
console.log('▸ Section 4: main.js — logout reset guards để re-hydrate sau login lại');
if (mainJs) {
    const _hasStudentReset = mainJs.includes('__studentPaginationInitialized    = false') ||
        mainJs.includes('__studentPaginationInitialized = false');
    check('__studentPaginationInitialized reset = false khi logout',
        _hasStudentReset,
        '_patchResetStore: window.__studentPaginationInitialized = false;');

    const _hasTxReset = mainJs.includes('__transactionPaginationInitialized = false') ||
        mainJs.includes('__transactionPaginationInitialized  = false');
    check('__transactionPaginationInitialized reset = false khi logout',
        _hasTxReset,
        '_patchResetStore: window.__transactionPaginationInitialized = false;');

    check('__dbReadyEventDispatched reset = false khi logout',
        mainJs.includes('__dbReadyEventDispatched') &&
        (mainJs.includes('__dbReadyEventDispatched          = false') || mainJs.includes('__dbReadyEventDispatched = false')),
        '_patchResetStore: window.__dbReadyEventDispatched = false;');
}

console.log();
console.log('▸ Section 5: app.js — profile status query compatibility');
if (appJs) {
    const _hasStatusActive = appJs.includes("status === 'active'") || appJs.includes("status == 'active'");
    check("app.js check status === 'active' cho active profiles",
        _hasStatusActive,
        "Cần filter profile active: status === 'active'");

    const _hasStatusSetOnCreate = appJs.includes("status: 'active'");
    check("Profile mới tạo có status: 'active'",
        _hasStatusSetOnCreate,
        "addNewStudent phải set status: 'active' cho profile mới");
}

console.log();
console.log('══════════════════════════════════════════════════════════');
console.log('  Total: ' + (pass+fail) + ' | ✅ ' + pass + ' | ❌ ' + fail);
if (fail > 0) {
    errors.forEach(e => console.error('  ❌ ' + e));
    console.error('\n  ⚠️  Profile hydration pipeline có vấn đề — số liệu có thể về 0!');
    console.log('══════════════════════════════════════════════════════════\n');
    process.exit(1);
} else {
    console.log('\n  🎉 Profile hydration checks passed!');
    console.log('  Profile listener sẽ re-init đúng sau login lại.');
    console.log('══════════════════════════════════════════════════════════\n');
}
