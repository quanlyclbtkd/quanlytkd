/**
 * tools/check-runtime-bootstrap.mjs — Phase 4.0B-4B/4C Runtime Bootstrap Checker
 * ──────────────────────────────────────────────────────────────────────────────
 * Kiểm tra source tĩnh để đảm bảo js/main.js và app.js có đầy đủ:
 *
 * [4B — js/main.js]
 *   - RUNTIME_HEALTH_CHECKS registry
 *   - window.getRuntimeHealthStatus
 *   - window.printRuntimeHealth
 *   - window.ensureModuleRuntimeReady
 *   - app:context-ready listener cho after-login health check
 *   - Không có `throw` trong health check runtime
 *
 * [4C — app.js]
 *   - dispatchAppContextReady helper
 *   - window.dispatchAppContextReady exposed
 *   - initSaaSDatabase gọi dispatchAppContextReady
 *   - window.__store.currentClubId sync
 *   - window.currentClubId sync
 *   - logout reset __appContextReadyState
 *
 * Dùng:
 *   node tools/check-runtime-bootstrap.mjs
 *
 * Exit code:
 *   0 — tất cả OK
 *   1 — thiếu hoặc sai cấu trúc
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT  = join(__dir, '..');

let errors  = 0;
let checked = 0;

function pass(msg)  { console.log(`[RuntimeBootstrapCheck] PASS  ${msg}`);  }
function fail(msg)  { console.error(`[RuntimeBootstrapCheck] FAIL  ${msg}`); errors++; }
function warn(msg)  { console.warn(`[RuntimeBootstrapCheck] WARN  ${msg}`); }
function info(msg)  { console.log(`[RuntimeBootstrapCheck] INFO  ${msg}`); }

// ── Helper: đọc file source ──────────────────────────────────────
function readSrc(rel) {
    const fullPath = join(ROOT, rel);
    if (!existsSync(fullPath)) {
        fail(`${rel} không tồn tại`);
        return null;
    }
    return readFileSync(fullPath, 'utf-8');
}

// ── Helper: kiểm tra pattern có tồn tại trong source ────────────
function checkPattern(src, pattern, label, required = true) {
    checked++;
    const found = typeof pattern === 'string'
        ? src.includes(pattern)
        : pattern.test(src);

    if (found) {
        pass(label);
        return true;
    }
    if (required) {
        fail(`${label}  ← KHÔNG TÌM THẤY`);
    } else {
        warn(`${label}  ← optional, không tìm thấy`);
    }
    return false;
}

console.log('[RuntimeBootstrapCheck] Kiểm tra runtime bootstrap guard (Phase 4B + 4C)...');
console.log('');

// ══════════════════════════════════════════════════════════════════
// PHẦN A — js/main.js (Phase 4.0B-4B)
// ══════════════════════════════════════════════════════════════════

const mainSrc = readSrc('js/main.js');
if (!mainSrc) {
    console.error('[RuntimeBootstrapCheck] ❌ Không đọc được js/main.js — dừng.');
    process.exit(1);
}
info(`js/main.js: ${mainSrc.length} ký tự`);
console.log('');

// ── A1. RUNTIME_HEALTH_CHECKS registry ──────────────────────────
console.log('[RuntimeBootstrapCheck] [main.js] Kiểm tra health registry...');
checkPattern(mainSrc, 'RUNTIME_HEALTH_CHECKS',       'runtime health registry (RUNTIME_HEALTH_CHECKS)');
checkPattern(mainSrc, "severity: 'critical'",         "severity: 'critical' entry");
checkPattern(mainSrc, "severity: 'warning'",          "severity: 'warning' entry");
checkPattern(mainSrc, "severity: 'info'",             "severity: 'info' entry");
checkPattern(mainSrc, "phase: 'bootstrap'",           "phase: 'bootstrap' entry");
checkPattern(mainSrc, "phase: 'after-login'",         "phase: 'after-login' entry");

// ── A2. getRuntimeHealthStatus ───────────────────────────────────
console.log('');
console.log('[RuntimeBootstrapCheck] [main.js] Kiểm tra getRuntimeHealthStatus...');
checkPattern(mainSrc, 'getRuntimeHealthStatus',       'window.getRuntimeHealthStatus định nghĩa');
checkPattern(mainSrc, 'criticalMissing',              'criticalMissing field trong kết quả');
checkPattern(mainSrc, 'checkedAt',                    'checkedAt timestamp trong kết quả');

// ── A3. printRuntimeHealth ───────────────────────────────────────
console.log('');
console.log('[RuntimeBootstrapCheck] [main.js] Kiểm tra printRuntimeHealth...');
checkPattern(mainSrc, 'printRuntimeHealth',           'window.printRuntimeHealth định nghĩa');
checkPattern(mainSrc, 'console.group',                'console.group trong printRuntimeHealth');
checkPattern(mainSrc, 'console.table',                'console.table trong printRuntimeHealth');

// ── A4. ensureModuleRuntimeReady ─────────────────────────────────
console.log('');
console.log('[RuntimeBootstrapCheck] [main.js] Kiểm tra ensureModuleRuntimeReady...');
checkPattern(mainSrc, 'ensureModuleRuntimeReady',     'window.ensureModuleRuntimeReady định nghĩa');
checkPattern(mainSrc, "ensureModuleRuntimeReady('finance'",    "gọi ensureModuleRuntimeReady cho 'finance'");
checkPattern(mainSrc, "ensureModuleRuntimeReady('inventory'",  "gọi ensureModuleRuntimeReady cho 'inventory'");
checkPattern(mainSrc, "ensureModuleRuntimeReady('students'",   "gọi ensureModuleRuntimeReady cho 'students'");

// ── A5. app:context-ready listener ──────────────────────────────
console.log('');
console.log('[RuntimeBootstrapCheck] [main.js] Kiểm tra app:context-ready listener...');
checkPattern(mainSrc, "app:context-ready",            "listener app:context-ready cho after-login health check");
checkPattern(mainSrc, 'phase: .bootstrap',            'bootstrap health check phase filter', false);

// ── A6. Bootstrap health check setTimeout ───────────────────────
console.log('');
console.log('[RuntimeBootstrapCheck] [main.js] Kiểm tra bootstrap health check call...');
checkPattern(mainSrc, "printRuntimeHealth?.({ phase: 'bootstrap' })", "bootstrap health check setTimeout call");

// ── A7. Không có throw trong health check ───────────────────────
console.log('');
console.log('[RuntimeBootstrapCheck] [main.js] Kiểm tra không có throw trong health check...');
const healthSectionStart = mainSrc.indexOf('RUNTIME_HEALTH_CHECKS');
const healthSectionEnd   = mainSrc.indexOf('window.ensureModuleRuntimeReady = function');
if (healthSectionStart !== -1 && healthSectionEnd !== -1) {
    const healthSection = mainSrc.slice(healthSectionStart, healthSectionEnd + 500);
    const throwInCheck  = /check:\s*\(\)\s*=>\s*[^}]*\bthrow\b/.test(healthSection);
    checked++;
    if (!throwInCheck) {
        pass('Không có throw trong check() functions');
    } else {
        fail('Có throw bên trong check() function — health check không được throw');
    }
} else {
    warn('Không xác định được vùng health check để kiểm tra throw');
}

// ── A8. _runHealthCheck cũ còn guard ────────────────────────────
console.log('');
console.log('[RuntimeBootstrapCheck] [main.js] Kiểm tra health check cũ còn guard...');
checked++;
if (mainSrc.includes('_runHealthCheck') && mainSrc.includes('if (_isDev) _runHealthCheck()')) {
    pass('_runHealthCheck cũ vẫn được guard bởi _isDev (backward compat OK)');
} else if (mainSrc.includes('_runHealthCheck')) {
    warn('_runHealthCheck tồn tại nhưng không có _isDev guard — kiểm tra thủ công');
} else {
    info('_runHealthCheck cũ không tìm thấy — đã được thay thế hoàn toàn');
    checked--;
}

// ══════════════════════════════════════════════════════════════════
// PHẦN B — app.js (Phase 4.0B-4C)
// ══════════════════════════════════════════════════════════════════

console.log('');
console.log('══════════════════════════════════════════════');
console.log('[RuntimeBootstrapCheck] [app.js] Kiểm tra app context ready dispatch (Phase 4C)...');
console.log('══════════════════════════════════════════════');

const appSrc = readSrc('app.js');
if (!appSrc) {
    console.error('[RuntimeBootstrapCheck] ❌ Không đọc được app.js — dừng.');
    process.exit(1);
}
info(`app.js: ${appSrc.length} ký tự`);
console.log('');

// ── B1. dispatchAppContextReady helper ──────────────────────────
console.log('[RuntimeBootstrapCheck] [app.js] Kiểm tra dispatchAppContextReady helper...');
checkPattern(appSrc, 'dispatchAppContextReady',           'hàm dispatchAppContextReady định nghĩa');
checkPattern(appSrc, 'window.dispatchAppContextReady',    'window.dispatchAppContextReady exposed');
checkPattern(appSrc, '__appContextReadyState',            '__appContextReadyState state object');
checkPattern(appSrc, "new CustomEvent('app:context-ready'", "dispatch CustomEvent('app:context-ready')");
checkPattern(appSrc, 'generation',                        'generation counter trong state');

// ── B2. initSaaSDatabase gọi dispatch ───────────────────────────
console.log('');
console.log('[RuntimeBootstrapCheck] [app.js] Kiểm tra initSaaSDatabase dispatch...');
checkPattern(appSrc, "dispatchAppContextReady('initSaaSDatabase-store-synced')", "gọi dispatchAppContextReady sau sync store");

// ── B3. Alias currentClubId ─────────────────────────────────────
console.log('');
console.log('[RuntimeBootstrapCheck] [app.js] Kiểm tra currentClubId aliases...');
checkPattern(appSrc, 'window.__store.currentClubId = clubId', 'window.__store.currentClubId được set');
checkPattern(appSrc, 'window.currentClubId = clubId',         'window.currentClubId được set trong initSaaSDatabase');

// ── B4. currentUser sync ────────────────────────────────────────
console.log('');
console.log('[RuntimeBootstrapCheck] [app.js] Kiểm tra currentUser sync...');
checkPattern(appSrc, 'window.__store.currentUser   = auth.currentUser', 'window.__store.currentUser được sync trong initSaaSDatabase');

// ── B5. Logout reset ────────────────────────────────────────────
console.log('');
console.log('[RuntimeBootstrapCheck] [app.js] Kiểm tra logout reset...');
checkPattern(appSrc, "reason:      'logout'",        "logout reset __appContextReadyState.reason = 'logout'");
checkPattern(appSrc, 'window.currentClubId = null',  'window.currentClubId = null khi logout');
checkPattern(appSrc, 'window.__store.currentClubId = null', 'window.__store.currentClubId = null khi logout');

// ── B6. Guard chống dispatch lặp ────────────────────────────────
console.log('');
console.log('[RuntimeBootstrapCheck] [app.js] Kiểm tra idempotent guard...');
checkPattern(appSrc, '__appContextReadyState.ready &&', 'guard idempotent: ready check');
checkPattern(appSrc, '__appContextReadyState.clubId === clubId', 'guard idempotent: clubId check');

// ══════════════════════════════════════════════════════════════════
// KẾT QUẢ
// ══════════════════════════════════════════════════════════════════
console.log('');
console.log(`[RuntimeBootstrapCheck] Đã kiểm tra: ${checked} patterns trong js/main.js + app.js`);

if (errors > 0) {
    console.error(`[RuntimeBootstrapCheck] ❌ FAILED — ${errors} lỗi.`);
    process.exit(1);
} else {
    console.log('[RuntimeBootstrapCheck] ✅ OK — Runtime bootstrap guard (4B + 4C) đầy đủ và đúng cấu trúc.');
    process.exit(0);
}
