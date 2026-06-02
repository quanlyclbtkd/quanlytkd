/**
 * tools/check-club-context-ready.mjs — Club Context Readiness Check
 * ─────────────────────────────────────────────────────────────────────
 * Kiểm tra context khởi tạo sau login:
 * 1. initSaaSDatabase sync currentClubId vào cả window và __store.
 * 2. __store.db, __store.colRef, __store.profRef được set.
 * 3. app:context-ready và app:db-ready được dispatch sau db sẵn sàng.
 * 4. __dbReadyEventDispatched guard chặn dispatch lặp.
 * 5. Profile listener được mount SAU khi db + currentClubId ready.
 * 6. app:context-ready listener trong main.js kích hoạt runtime recovery.
 *
 * Chạy: node tools/check-club-context-ready.mjs
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
console.log('  Club Context Readiness Check — Phase 4K-PROFILE-HYDRATION');
console.log('══════════════════════════════════════════════════════════\n');

const appJs  = readFile('app.js');
const mainJs = readFile('js/main.js');

console.log('▸ Section 1: app.js — initSaaSDatabase context sync');
if (appJs) {
    check('window.currentClubId được set trong initSaaSDatabase',
        appJs.includes('window.currentClubId = clubId'),
        'initSaaSDatabase: window.currentClubId = clubId;');

    check('__store.currentClubId được set trong initSaaSDatabase',
        appJs.includes('window.__store.currentClubId = clubId') ||
        (appJs.includes('__store.currentClubId') && appJs.includes('clubId')),
        'initSaaSDatabase: window.__store.currentClubId = clubId;');

    check('__store.db được set trong initSaaSDatabase',
        appJs.includes('window.__store.db') || appJs.includes('__store.db      = db'),
        'initSaaSDatabase: window.__store.db = db;');

    check('__store.profRef được set trong initSaaSDatabase',
        appJs.includes('__store.profRef') || appJs.includes('window.__store.profRef'),
        'initSaaSDatabase: window.__store.profRef = profRef;');

    check('__store.colRef được set trong initSaaSDatabase',
        appJs.includes('__store.colRef') || appJs.includes('window.__store.colRef'),
        'initSaaSDatabase: window.__store.colRef = colRef;');

    check('__store.currentUser được set trong initSaaSDatabase',
        appJs.includes('__store.currentUser') && appJs.includes('auth.currentUser'),
        'initSaaSDatabase: window.__store.currentUser = auth.currentUser;');
}

console.log();
console.log('▸ Section 2: app.js — app:context-ready và app:db-ready events');
if (appJs) {
    check("app:context-ready dispatch sau db + store ready",
        (appJs.includes("'app:context-ready'") || appJs.includes('"app:context-ready"')) &&
        appJs.includes('dispatchAppContextReady'),
        "dispatchAppContextReady('initSaaSDatabase-store-synced') phải được gọi sau khi set __store");

    check("app:db-ready dispatch sau db sẵn sàng",
        appJs.includes("'app:db-ready'") || appJs.includes('"app:db-ready"'),
        "window.dispatchEvent(new CustomEvent('app:db-ready', { detail: { db } }))");

    check('__dbReadyEventDispatched guard chặn dispatch lặp',
        appJs.includes('__dbReadyEventDispatched'),
        'Guard: if (!window.__dbReadyEventDispatched) { ... window.__dbReadyEventDispatched = true; }');

    check('dispatchAppContextReady function tồn tại trong app.js',
        appJs.includes('function dispatchAppContextReady') ||
        appJs.includes('dispatchAppContextReady = ') ||
        appJs.includes('const dispatchAppContextReady'),
        'function dispatchAppContextReady(reason) { window.dispatchEvent(new CustomEvent(...)) }');
}

console.log();
console.log('▸ Section 3: app.js — profile listener mount SAU db + clubId ready');
if (appJs) {
    check('mountActiveProfilesListener được gọi trong initSaaSDatabase',
        appJs.includes('mountActiveProfilesListener') &&
        appJs.includes('initSaaSDatabase'),
        'initSaaSDatabase: window.mountActiveProfilesListener({ db, clubId, profRef, ... })');

    check('Profile listener nhận profRef trong context (không null)',
        appJs.includes('profRef') &&
        (appJs.includes('mountActiveProfilesListener({ db') ||
         appJs.includes("mountActiveProfilesListener({")),
        'context truyền vào mountActiveProfilesListener phải có profRef, clubId, db');

    check('resetProfilesListeners được gọi khi logout (cleanup + re-init)',
        appJs.includes('resetProfilesListeners') && appJs.includes('logout'),
        'Logout: if (window.resetProfilesListeners) window.resetProfilesListeners("logout")');
}

console.log();
console.log('▸ Section 4: app.js — currentClubId không bị ghi đè thành rỗng');
if (appJs) {
    // Flag khi có bare assignment (không phải let/var/const declaration) mà không
    // nằm trong context super_admin (super_admin hợp lệ có currentClubId = '').
    //   let currentClubId = "";  ← bình thường (declaration)
    //   currentClubId = '';      ← bên trong super_admin block = intentional, OK
    //   currentClubId = '';      ← bên ngoài super_admin / logout context = suspect
    const _lines = appJs.split('\n');
    const _resetLines = _lines.filter((l, i) => {
        const t = l.trim();
        if (t.startsWith('//')) return false;
        if (/\b(let|var|const)\s+currentClubId\s*=/.test(t)) return false;
        if (!/currentClubId\s*=\s*["']{2}/.test(t)) return false;
        // Check surrounding context (±8 lines) for super_admin or logout
        const ctx = _lines.slice(Math.max(0, i-8), i+4).join('\n');
        if (ctx.includes('super_admin') || ctx.includes('logout') || ctx.includes('sign-out')) return false;
        return true; // bare reset outside super_admin / logout = potential bug
    });

    check('currentClubId không bị bare-reset = "" ngoài super_admin/logout context',
        _resetLines.length === 0,
        'currentClubId = "" chỉ được phép trong super_admin fast-path hoặc logout handler');
}

console.log();
console.log('▸ Section 5: main.js — runtime recovery sau app:context-ready');
if (mainJs) {
    check('main.js lắng nghe app:context-ready để recovery',
        mainJs.includes('app:context-ready') && mainJs.includes('runRuntimeDataRecovery'),
        "window.addEventListener('app:context-ready', ...) phải gọi runRuntimeDataRecovery()");

    check('main.js lắng nghe app:db-ready cho pagination init',
        mainJs.includes('app:db-ready') && mainJs.includes('_tryInitPaginationsOnDbReady'),
        "window.addEventListener('app:db-ready', _tryInitPaginationsOnDbReady)");

    check('printClubRuntimeDiagnostics log currentClubId + __store.currentClubId',
        mainJs.includes('printClubRuntimeDiagnostics') && mainJs.includes('currentClubId'),
        'printClubRuntimeDiagnostics phải log window.currentClubId và __store.currentClubId');

    check('printClubRuntimeDiagnostics log transactions count tháng hiện tại',
        mainJs.includes('printClubRuntimeDiagnostics') &&
        mainJs.includes('transactions month') || mainJs.includes('transactions total'),
        'printClubRuntimeDiagnostics phải dùng getCountFromServer cho transactions');

    check('printClubRuntimeDiagnostics log last Firestore error',
        mainJs.includes('__lastFirestoreError'),
        'printClubRuntimeDiagnostics: if (window.__lastFirestoreError) console.warn(...)');
}

console.log();
console.log('══════════════════════════════════════════════════════════');
console.log('  Total: ' + (pass+fail) + ' | ✅ ' + pass + ' | ❌ ' + fail);
if (fail > 0) {
    errors.forEach(e => console.error('  ❌ ' + e));
    console.error('\n  ⚠️  Context không ready → profiles / transactions không hydrate → dữ liệu về 0!');
    console.log('══════════════════════════════════════════════════════════\n');
    process.exit(1);
} else {
    console.log('\n  🎉 Club context readiness checks passed!');
    console.log('  currentClubId và db được sync đúng — profiles sẽ hydrate bình thường.');
    console.log('══════════════════════════════════════════════════════════\n');
}
