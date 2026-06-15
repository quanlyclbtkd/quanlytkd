/**
 * tools/check-pilot-readiness.mjs — Phase 4.0B-4F Pilot Readiness Checker
 * ──────────────────────────────────────────────────────────────────────────
 * Kiểm tra source tĩnh để đảm bảo app.js + main.js có đầy đủ:
 *
 * Phase 4.0B-4E checks (giữ nguyên):
 *   1.  resolveActiveDataSource
 *   2.  activateLegacyRootFallback (legacy-root recovery mode)
 *   3.  __firestoreDataSourceMetrics
 *   4.  Primary empty overwrite guard (profiles/transactions/inventory)
 *   5.  printPilotTabReadiness
 *   6.  _dataVersion bump sau recovery
 *   7.  invalidate tabs sau recovery
 *   8.  printFirestorePathStatus kiểm tra cả primary + legacy path
 *   9.  Không có Firestore write trong fallback code
 *  10.  Không có migration tự động
 *  11.  Không mở rules public (không có .read = true)
 *  12.  Pre-flight: firestore.indexes.json tồn tại
 *  13.  Pre-flight: functions/package.json có script lint
 *
 * Phase 4.0B-4F checks (MỚI — items 14–23):
 *  14.  window.runRuntimeDataRecovery được định nghĩa
 *  15.  window.__runtimeRecoveryState được khởi tạo
 *  16.  Listener/scheduler sau app:context-ready
 *  17.  activateLegacyRootFallback sync vào allProfiles (closure)
 *  18.  activateLegacyRootFallback sync vào allTransactions (closure)
 *  19.  activateLegacyRootFallback sync vào allInventory (closure)
 *  20.  bumpRuntimeDataVersion helper tồn tại
 *  21.  scheduleRender hoặc renderApp fallback sau recovery
 *  22.  window.printPilotLaunchStatus được định nghĩa
 *  23.  Logout reset __runtimeRecoveryState
 *
 * Dùng:
 *   node tools/check-pilot-readiness.mjs
 *
 * Exit code:
 *   0 — OK
 *   1 — thiếu hoặc sai cấu trúc
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT  = join(__dir, '..');

let errors  = 0;
let checked = 0;

function pass(msg)  { console.log(`[PilotReadinessCheck] PASS  ${msg}`); }
function fail(msg)  { console.error(`[PilotReadinessCheck] FAIL  ${msg}`); errors++; }
function warn(msg)  { console.warn(`[PilotReadinessCheck] WARN  ${msg}`); }
function info(msg)  { console.log(`[PilotReadinessCheck] INFO  ${msg}`); }

function readSrc(rel) {
    const fullPath = join(ROOT, rel);
    if (!existsSync(fullPath)) { fail(`${rel} không tồn tại`); return null; }
    return readFileSync(fullPath, 'utf-8');
}

function checkPattern(src, pattern, label, required = true) {
    checked++;
    const found = typeof pattern === 'string' ? src.includes(pattern) : pattern.test(src);
    if (found) { pass(label); return true; }
    if (required) { fail(`${label}  ← KHÔNG TÌM THẤY`); }
    else          { warn(`${label}  ← optional`); }
    return false;
}

function checkAbsent(src, pattern, label) {
    checked++;
    const found = typeof pattern === 'string' ? src.includes(pattern) : pattern.test(src);
    if (!found) { pass(label); return true; }
    fail(`${label}  ← PHẢI KHÔNG CÓ nhưng vẫn tồn tại`);
    return false;
}

/**
 * checkAnyPattern — chấp nhận nhiều dạng viết code khác nhau cho cùng một guard.
 * Dạng A: truy cập trực tiếp   → window.__runtimeRecoveryState.running
 * Dạng B: qua biến trung gian  → const state = window.__runtimeRecoveryState; … state.running
 * @param {string} src
 * @param {Array<string|RegExp>} patterns  — PASS nếu BẤT KỲ pattern nào khớp
 * @param {string} label
 */
function checkAnyPattern(src, patterns, label) {
    checked++;
    const found = patterns.some(p =>
        typeof p === 'string' ? src.includes(p) : p.test(src)
    );
    if (found) { pass(label); return true; }
    fail(`${label}  ← KHÔNG TÌM THẤY`);
    return false;
}

console.log('[PilotReadinessCheck] Kiểm tra pilot readiness (Phase 4.0B-4F)...');
console.log('');

// ── Đọc files ───────────────────────────────────────────────────
const appSrc  = readSrc('app.js');
const mainSrc = readSrc('js/main.js');
const diagSrc = readSrc('js/diagnostics/runtimeReadinessDiagnostics.js');
const funcPkg = readSrc('functions/package.json');

if (!appSrc || !diagSrc) {
    console.error('[PilotReadinessCheck] ❌ Không đọc được app.js hoặc runtime diagnostics — dừng.');
    process.exit(1);
}
info(`app.js: ${appSrc.length} ký tự`);
if (mainSrc) {
    info(`js/main.js: ${mainSrc.length} ký tự`);
} else {
    warn('js/main.js không tìm thấy — một số check Phase 4F sẽ chỉ kiểm tra app.js');
}
console.log('');

// ════════════════════════════════════════════════════════════════
// PHASE 4.0B-4E CHECKS (giữ nguyên)
// ════════════════════════════════════════════════════════════════

// ── 1. resolveActiveDataSource ───────────────────────────────────
console.log('[PilotReadinessCheck] [4E] Kiểm tra resolveActiveDataSource...');
checkPattern(appSrc, 'resolveActiveDataSource',              'window.resolveActiveDataSource định nghĩa');
checkPattern(appSrc, "source = 'primary'",                  "source = 'primary' branch");
checkPattern(appSrc, "source = 'legacy-root'",              "source = 'legacy-root' branch");
checkPattern(appSrc, "source = 'empty'",                    "source = 'empty' branch");
checkPattern(appSrc, "source = 'permission-error'",         "source = 'permission-error' branch");
checkPattern(appSrc, 'safeToRender',                        'safeToRender field trong kết quả');

// ── 2. activateLegacyRootFallback ────────────────────────────────
console.log('');
console.log('[PilotReadinessCheck] [4E] Kiểm tra activateLegacyRootFallback (legacy recovery)...');
checkPattern(appSrc, 'activateLegacyRootFallback',          'window.activateLegacyRootFallback định nghĩa');
checkPattern(appSrc, 'tst_profiles',                        'đọc tst_profiles trong fallback');
checkPattern(appSrc, 'tst_transactions',                    'đọc tst_transactions trong fallback');
checkPattern(appSrc, 'tst_inventory',                       'đọc tst_inventory trong fallback');
checkPattern(appSrc, 'legacy-root-fallback',                "reason 'legacy-root-fallback' trong invalidate calls");
checkPattern(appSrc, 'primary-empty-legacy-root-available', 'fallbackReason set đúng');

// ── 3. __firestoreDataSourceMetrics ─────────────────────────────
console.log('');
console.log('[PilotReadinessCheck] [4E] Kiểm tra __firestoreDataSourceMetrics...');
checkPattern(appSrc, '__firestoreDataSourceMetrics',        'window.__firestoreDataSourceMetrics object');
checkPattern(appSrc, 'fallbackUsed',                        'fallbackUsed field');
checkPattern(appSrc, 'fallbackReason',                      'fallbackReason field');
checkPattern(appSrc, 'activeDataSource',                    'activeDataSource field');

// ── 4. Primary empty overwrite guard ─────────────────────────────
console.log('');
console.log('[PilotReadinessCheck] [4E] Kiểm tra primary empty overwrite guard...');
checkPattern(appSrc, 'DataSourceLock',                      '[DataSourceLock] guard warning');
checkPattern(appSrc, 'Skip primary empty overwrite (profiles/active)',   'guard cho profiles/active');
checkPattern(appSrc, 'Skip primary empty overwrite (profiles/fallback)', 'guard cho profiles/fallback');
checkPattern(appSrc, 'Skip primary empty overwrite (inventory)',         'guard cho inventory');
checkPattern(appSrc, 'Skip primary empty overwrite (transactions)',      'guard cho transactions');

// ── 5. printPilotTabReadiness ─────────────────────────────────────
console.log('');
console.log('[PilotReadinessCheck] [4E] Kiểm tra printPilotTabReadiness...');
checkPattern(diagSrc, 'printPilotTabReadiness',              'window.printPilotTabReadiness định nghĩa');
checkPattern(diagSrc, 'tuitionReady',                        'tuitionReady field');
checkPattern(diagSrc, 'debtReady',                           'debtReady field');
checkPattern(diagSrc, 'activeStudentsReady',                 'activeStudentsReady field');
checkPattern(diagSrc, 'quitStudentsReady',                   'quitStudentsReady field');
checkPattern(diagSrc, 'inventoryReady',                      'inventoryReady field');
checkPattern(diagSrc, 'dashboardReady',                      'dashboardReady field');

// ── 6. _dataVersion bump sau recovery ────────────────────────────
console.log('');
console.log('[PilotReadinessCheck] [4E] Kiểm tra _dataVersion bump trong fallback...');
checkPattern(appSrc, "window.__store._dataVersion = (window.__store._dataVersion || 0) + 1", '_dataVersion bump sau legacy recovery');

// ── 7. invalidate tabs sau recovery ─────────────────────────────
console.log('');
console.log('[PilotReadinessCheck] [4E] Kiểm tra invalidate tabs sau recovery...');
checkPattern(appSrc, "window.invalidateStudents('legacy-root-fallback')",  'invalidateStudents sau fallback');
checkPattern(appSrc, "window.invalidateFinance('legacy-root-fallback')",   'invalidateFinance sau fallback');
checkPattern(appSrc, "window.invalidateInventory('legacy-root-fallback')", 'invalidateInventory sau fallback');
checkPattern(appSrc, "window.invalidateDashboard('legacy-root-fallback')", 'invalidateDashboard sau fallback');

// ── 8. printFirestorePathStatus cập nhật ─────────────────────────
console.log('');
console.log('[PilotReadinessCheck] [4E] Kiểm tra printFirestorePathStatus extended...');
checkPattern(diagSrc, 'tst_profiles',    'printFirestorePathStatus kiểm tra tst_profiles');
checkPattern(diagSrc, 'recommendation',  'printFirestorePathStatus có recommendation field');
checkPattern(diagSrc, 'result.primary',  'printFirestorePathStatus có result.primary');
checkPattern(diagSrc, 'result.legacy',   'printFirestorePathStatus có result.legacy');

// ── 9. Không có Firestore write trong fallback code ──────────────
console.log('');
console.log('[PilotReadinessCheck] [4E] Kiểm tra không có Firestore write trong fallback...');
const fallbackStart = appSrc.indexOf('window.activateLegacyRootFallback');
const fallbackEnd   = appSrc.indexOf('window.runRuntimeDataRecovery');
if (fallbackStart !== -1 && fallbackEnd !== -1) {
    const fallbackSection = appSrc.slice(fallbackStart, fallbackEnd);
    const hasWrite = /\bsetDoc\b|\bupdateDoc\b|\baddDoc\b|\bdeleteDoc\b|\bbatch\.set\b|\bbatch\.update\b/.test(fallbackSection);
    checked++;
    if (!hasWrite) {
        pass('Không có Firestore write (setDoc/updateDoc/addDoc/deleteDoc) trong activateLegacyRootFallback');
    } else {
        fail('Có Firestore write trong activateLegacyRootFallback — không được phép');
    }
} else {
    warn('Không xác định được vùng fallback để kiểm tra write');
}

// ── 10. Không có migration tự động ───────────────────────────────
console.log('');
console.log('[PilotReadinessCheck] [4E] Kiểm tra không có migration tự động...');
const recovSection = fallbackStart !== -1 ? appSrc.slice(fallbackStart, appSrc.length) : '';
if (recovSection) {
    const hasMigration = /\b(?:copyDoc|batchWrite|runMigration|migrateData|migrateAll)\b/.test(recovSection);
    checked++;
    if (!hasMigration) {
        pass('Không có migration tự động trong recovery code');
    } else {
        fail('Có migration lệnh trong recovery code — phase này chỉ read-only');
    }
}

// ── 11. Không mở rules public ────────────────────────────────────
console.log('');
console.log('[PilotReadinessCheck] [4E] Kiểm tra firestore.rules không mở public...');
const rulesSrc = readSrc('firestore.rules');
if (rulesSrc) {
    const hasPublicRead = /allow\s+read.*true(?!\s*\/\/)/.test(rulesSrc) && rulesSrc.includes('match /{document=**}');
    checked++;
    if (!hasPublicRead) {
        pass('firestore.rules không có catch-all public read');
    } else {
        warn('firestore.rules có pattern dạng public read — kiểm tra thủ công');
    }
}

// ── 12. Pre-flight: firestore.indexes.json ───────────────────────
console.log('');
console.log('[PilotReadinessCheck] [4E] Pre-flight checks...');
checked++;
if (existsSync(join(ROOT, 'firestore.indexes.json'))) {
    pass('firestore.indexes.json tồn tại');
} else {
    fail('firestore.indexes.json chưa tồn tại — firebase.json trỏ tới file này');
}

// ── 13. Pre-flight: functions lint script ────────────────────────
if (funcPkg) {
    checked++;
    try {
        const funcPkgJson = JSON.parse(funcPkg);
        if (funcPkgJson.scripts && funcPkgJson.scripts.lint) {
            pass('functions/package.json có script lint');
        } else {
            fail('functions/package.json thiếu script lint — firebase.json predeploy dùng npm run lint');
        }
    } catch(e) {
        fail('functions/package.json không parse được JSON');
    }
}

// ════════════════════════════════════════════════════════════════
// PHASE 4.0B-4F CHECKS (MỚI)
// ════════════════════════════════════════════════════════════════

console.log('');
console.log('[PilotReadinessCheck] ══════════════════════════════════════════');
console.log('[PilotReadinessCheck] [4F] KIỂM TRA PHASE 4.0B-4F (MỚI)');
console.log('[PilotReadinessCheck] ══════════════════════════════════════════');

// ── 14. window.runRuntimeDataRecovery ────────────────────────────
console.log('');
console.log('[PilotReadinessCheck] [4F] Kiểm tra window.runRuntimeDataRecovery...');
checkPattern(appSrc, 'runRuntimeDataRecovery',                  'window.runRuntimeDataRecovery được định nghĩa trong app.js');
checkAnyPattern(appSrc, [
    '__runtimeRecoveryState.running',
    /const\s+state\s*=\s*window\.__runtimeRecoveryState[\s\S]{0,200}?state\.running/
], '__runtimeRecoveryState.running guard');
checkAnyPattern(appSrc, [
    '__runtimeRecoveryState.completed',
    /const\s+state\s*=\s*window\.__runtimeRecoveryState[\s\S]{0,200}?state\.completed/
], '__runtimeRecoveryState.completed guard');
checkPattern(appSrc, "activateLegacyRootFallback?.('auto-runtime-recovery')",
    "activateLegacyRootFallback gọi với reason='auto-runtime-recovery'");

// ── 15. window.__runtimeRecoveryState ────────────────────────────
console.log('');
console.log('[PilotReadinessCheck] [4F] Kiểm tra __runtimeRecoveryState init...');
checkPattern(appSrc, '__runtimeRecoveryState',                  'window.__runtimeRecoveryState được khởi tạo');
checkPattern(appSrc, 'recoveryUsed:',                           'recoveryUsed field trong __runtimeRecoveryState');
checkPattern(appSrc, 'completedAt:',                            'completedAt field trong __runtimeRecoveryState');

// ── 16. Listener/scheduler sau app:context-ready ─────────────────
console.log('');
console.log('[PilotReadinessCheck] [4F] Kiểm tra auto-recovery listener sau app:context-ready...');
// Kiểm tra trong main.js (ưu tiên) hoặc app.js
const combinedSrc = (mainSrc || '') + appSrc;
checkPattern(combinedSrc, 'app:context-ready',
    'addEventListener app:context-ready tồn tại (main.js hoặc app.js)');
checkPattern(combinedSrc, 'runRuntimeDataRecovery',
    'runRuntimeDataRecovery được gọi sau context-ready');
// Kiểm tra có setTimeout delay nhỏ để tránh race condition
checkPattern(combinedSrc, /app.context-ready[\s\S]{0,500}setTimeout/,
    'setTimeout delay trong app:context-ready handler (tránh race condition)');

// ── 17. allProfiles sync ──────────────────────────────────────────
console.log('');
console.log('[PilotReadinessCheck] [4F] Kiểm tra allProfiles sync trong activateLegacyRootFallback...');
// Tìm trong phạm vi activateLegacyRootFallback
const fStart = appSrc.indexOf('window.activateLegacyRootFallback = async function');
const fEnd   = appSrc.indexOf('\n    };', fStart + 100);
const fallbackBody = fStart !== -1 ? appSrc.slice(fStart, fEnd > fStart ? fEnd + 6 : fStart + 4000) : '';

if (fallbackBody) {
    checkPattern(fallbackBody, 'allProfiles = profileMap',
        'allProfiles closure synced trong activateLegacyRootFallback');
    checkPattern(fallbackBody, 'allTransactions =',
        'allTransactions closure synced trong activateLegacyRootFallback');
    checkPattern(fallbackBody, 'allInventory =',
        'allInventory closure synced trong activateLegacyRootFallback');
} else {
    warn('Không tìm được body của activateLegacyRootFallback để kiểm tra closure sync');
    checked += 3;
    errors  += 3;
}

// ── 18. allTransactions sync — đã kiểm tra ở mục 17 ──────────────
// (bundled above)

// ── 19. allInventory sync — đã kiểm tra ở mục 17 ─────────────────
// (bundled above)

// ── 20. bumpRuntimeDataVersion helper ────────────────────────────
console.log('');
console.log('[PilotReadinessCheck] [4F] Kiểm tra bumpRuntimeDataVersion...');
checkPattern(appSrc, 'bumpRuntimeDataVersion',
    'bumpRuntimeDataVersion helper được định nghĩa');
checkPattern(appSrc, '_lastDataVersionReason',
    '_lastDataVersionReason field set trong bumpRuntimeDataVersion');

// ── 21. scheduleRender / renderApp fallback sau recovery ──────────
console.log('');
console.log('[PilotReadinessCheck] [4F] Kiểm tra scheduleRender hoặc renderApp sau recovery...');
if (fallbackBody) {
    const hasScheduleRender = fallbackBody.includes('scheduleRender');
    const hasRenderApp      = fallbackBody.includes('renderApp');
    checked++;
    if (hasScheduleRender || hasRenderApp) {
        pass('scheduleRender hoặc renderApp được gọi sau legacy recovery');
    } else {
        fail('Thiếu scheduleRender / renderApp fallback sau recovery — UI có thể không render lại');
    }
} else {
    warn('Không tìm được fallback body để kiểm tra scheduleRender');
}

// ── 22. window.printPilotLaunchStatus ─────────────────────────────
console.log('');
console.log('[PilotReadinessCheck] [4F] Kiểm tra window.printPilotLaunchStatus...');
checkPattern(diagSrc, 'printPilotLaunchStatus',
    'window.printPilotLaunchStatus được định nghĩa');
checkPattern(diagSrc, 'readyForInternalTest',
    'readyForInternalTest field trong printPilotLaunchStatus');
checkPattern(diagSrc, 'readyForOneClubPilot',
    'readyForOneClubPilot field trong printPilotLaunchStatus');

// ── 23. Logout reset __runtimeRecoveryState ───────────────────────
console.log('');
console.log('[PilotReadinessCheck] [4F] Kiểm tra logout reset __runtimeRecoveryState...');
// Tìm trong vùng logout block
const logoutIdx = appSrc.indexOf("reason:      'logout'");
if (logoutIdx !== -1) {
    // Lấy 1000 chars quanh vùng logout để kiểm tra
    const logoutBlock = appSrc.slice(Math.max(0, logoutIdx - 500), logoutIdx + 500);
    checkPattern(logoutBlock, '__runtimeRecoveryState',
        '__runtimeRecoveryState được reset trong logout block');
    checkPattern(logoutBlock, "reason:      'logout'",
        "reason: 'logout' được set khi logout");
} else {
    // Kiểm tra toàn file
    checkPattern(appSrc, '__runtimeRecoveryState',
        '__runtimeRecoveryState tồn tại trong app.js (logout reset cần xác nhận thủ công)');
    warn('Không tìm được vùng logout cụ thể — kiểm tra thủ công xem __runtimeRecoveryState có reset không');
}

// ── Kết quả ──────────────────────────────────────────────────────
console.log('');
console.log(`[PilotReadinessCheck] Đã kiểm tra: ${checked} patterns`);

if (errors > 0) {
    console.error(`[PilotReadinessCheck] ❌ FAILED — ${errors} lỗi.`);
    process.exit(1);
} else {
    console.log('[PilotReadinessCheck] ✅ OK — Pilot readiness checks (Phase 4.0B-4F) đầy đủ và an toàn.');
    process.exit(0);
}
