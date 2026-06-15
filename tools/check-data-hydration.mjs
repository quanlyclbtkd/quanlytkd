/**
 * tools/check-data-hydration.mjs — Phase 4.0B-4D Data Hydration Diagnostics Checker
 * ──────────────────────────────────────────────────────────────────────────────────
 * Kiểm tra source tĩnh để đảm bảo app.js có đầy đủ:
 *
 *   1. window.__dataHydrationMetrics
 *   2. window.printDataHydrationStatus
 *   3. window.printTabDataStatus
 *   4. window.printFirestorePathStatus
 *   5. Cập nhật metrics trong profiles listener
 *   6. Cập nhật metrics trong transactions listener
 *   7. Cập nhật metrics trong inventory listener
 *   8. Cập nhật metrics khi club/settings loaded
 *   9. Không có Firestore write trong diagnostic code
 *  10. Không log PII (tên/SĐT/email)
 *
 * Dùng:
 *   node tools/check-data-hydration.mjs
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

function pass(msg)  { console.log(`[DataHydrationCheck] PASS  ${msg}`);  }
function fail(msg)  { console.error(`[DataHydrationCheck] FAIL  ${msg}`); errors++; }
function warn(msg)  { console.warn(`[DataHydrationCheck] WARN  ${msg}`); }
function info(msg)  { console.log(`[DataHydrationCheck] INFO  ${msg}`); }

function readSrc(rel) {
    const fullPath = join(ROOT, rel);
    if (!existsSync(fullPath)) {
        fail(`${rel} không tồn tại`);
        return null;
    }
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

console.log('[DataHydrationCheck] Kiểm tra data hydration diagnostics trong app.js...');
console.log('');

const appSrc = readSrc('app.js');
const diagSrc = readSrc('js/diagnostics/runtimeReadinessDiagnostics.js');
if (!appSrc || !diagSrc) {
    console.error('[DataHydrationCheck] ❌ Không đọc được app.js hoặc runtimeReadinessDiagnostics.js — dừng.');
    process.exit(1);
}
info(`app.js: ${appSrc.length} ký tự`);
console.log('');

// ── 1. __dataHydrationMetrics ────────────────────────────────────
console.log('[DataHydrationCheck] Kiểm tra __dataHydrationMetrics...');
checkPattern(appSrc, '__dataHydrationMetrics',            'window.__dataHydrationMetrics object');
checkPattern(appSrc, 'profilesSnapshotCount',             'profilesSnapshotCount field');
checkPattern(appSrc, 'transactionsSnapshotCount',         'transactionsSnapshotCount field');
checkPattern(appSrc, 'inventorySnapshotCount',            'inventorySnapshotCount field');
checkPattern(appSrc, 'profilesDocCount',                  'profilesDocCount field');
checkPattern(appSrc, 'transactionsDocCount',              'transactionsDocCount field');
checkPattern(appSrc, 'inventoryDocCount',                 'inventoryDocCount field');
checkPattern(appSrc, 'settingsLoaded',                    'settingsLoaded field');
checkPattern(appSrc, 'clubLoaded',                        'clubLoaded field');
checkPattern(appSrc, '_updateHydrationMetrics',           '_updateHydrationMetrics helper');

// ── 2. printDataHydrationStatus ──────────────────────────────────
console.log('');
console.log('[DataHydrationCheck] Kiểm tra printDataHydrationStatus...');
checkPattern(diagSrc, 'printDataHydrationStatus',          'window.printDataHydrationStatus định nghĩa');
checkPattern(diagSrc, 'storeProfilesCount',                'storeProfilesCount trong result');
checkPattern(diagSrc, 'storeTransactionsCount',            'storeTransactionsCount trong result');
checkPattern(diagSrc, 'storeInventoryCount',               'storeInventoryCount trong result');

// ── 3. printTabDataStatus ────────────────────────────────────────
console.log('');
console.log('[DataHydrationCheck] Kiểm tra printTabDataStatus...');
checkPattern(diagSrc, 'printTabDataStatus',                'window.printTabDataStatus định nghĩa');
checkPattern(diagSrc, 'tuitionTabCanRender',               'tuitionTabCanRender field');
checkPattern(diagSrc, 'debtTabCanRender',                  'debtTabCanRender field');
checkPattern(diagSrc, 'inventoryTabCanRender',             'inventoryTabCanRender field');
checkPattern(diagSrc, 'dashboardCanRender',                'dashboardCanRender field');
checkPattern(diagSrc, 'transactionsInSelectedMonth',       'transactionsInSelectedMonth field');

// ── 4. printFirestorePathStatus ──────────────────────────────────
console.log('');
console.log('[DataHydrationCheck] Kiểm tra printFirestorePathStatus...');
checkPattern(diagSrc, 'printFirestorePathStatus',              'window.printFirestorePathStatus định nghĩa');
checkPattern(diagSrc, 'limit(1)',                              'giới hạn limit(1) — không đọc toàn bộ collection');
checkPattern(appSrc, "clubs/' + _clubId + '/profiles",        'kiểm tra path clubs/{clubId}/profiles');
checkPattern(appSrc, "clubs/' + _clubId + '/transactions",    'kiểm tra path clubs/{clubId}/transactions');
checkPattern(appSrc, "clubs/' + _clubId + '/inventory",       'kiểm tra path clubs/{clubId}/inventory');

// ── 5. Metrics cập nhật trong profiles listener ──────────────────
console.log('');
console.log('[DataHydrationCheck] Kiểm tra metrics update trong profiles listener...');
checkPattern(appSrc, "lastReason:            'profiles-snapshot-legacy-fallback'",
    'update metrics trong profiles fallback listener');
checkPattern(appSrc, "lastReason:            'profiles-sync-active'",
    'update metrics trong _syncAllProfilesLegacy (active path)');

// ── 6. Metrics cập nhật trong transactions listener ──────────────
console.log('');
console.log('[DataHydrationCheck] Kiểm tra metrics update trong transactions listener...');
checkPattern(appSrc, "lastReason:               'transactions-merge-render'",
    'update metrics trong _mergeAndRender (transactions)');

// ── 7. Metrics cập nhật trong inventory listener ─────────────────
console.log('');
console.log('[DataHydrationCheck] Kiểm tra metrics update trong inventory listener...');
checkPattern(appSrc, "lastReason:             'inventory-snapshot'",
    'update metrics trong _invCb (inventory)');

// ── 8. Metrics cập nhật khi club/settings loaded ─────────────────
console.log('');
console.log('[DataHydrationCheck] Kiểm tra metrics update club/settings...');
checkPattern(appSrc, "lastReason: 'club-snapshot'",      'update clubLoaded trong _clubCb');
checkPattern(appSrc, "lastReason: 'settings-snapshot'",  'update settingsLoaded trong _settingsCb');

// ── 9. Không có Firestore WRITE trong diagnostic code ────────────
console.log('');
console.log('[DataHydrationCheck] Kiểm tra không có Firestore write trong diagnostic...');
// Tìm vùng diagnostic (từ printDataHydrationStatus đến hết file)
const diagStart = diagSrc.indexOf('export function printDataHydrationStatus');
if (diagStart !== -1) {
    const diagSection = diagSrc.slice(diagStart);
    const hasWrite = /\bsetDoc\b|\bupdateDoc\b|\baddDoc\b|\bdeleteDoc\b|\bbatch\.set\b|\bbatch\.update\b/.test(diagSection);
    checked++;
    if (!hasWrite) {
        pass('Không có Firestore write (setDoc/updateDoc/addDoc/deleteDoc) trong diagnostic globals');
    } else {
        fail('Có Firestore write bên trong diagnostic globals — không được phép');
    }
} else {
    warn('Không tìm thấy vùng diagnostic để kiểm tra write');
}

// ── 10. Không log PII trong diagnostic code ───────────────────────
console.log('');
console.log('[DataHydrationCheck] Kiểm tra không log PII trong diagnostic...');
if (diagStart !== -1) {
    const diagSection = diagSrc.slice(diagStart);
    // Kiểm tra console.log không có .name, .phone, .email field access
    const piiPattern = /console\.(log|table|info|warn|error)\([^)]*\.(name|phone|email|sdt|ho_ten|hoTen)\b/i;
    checked++;
    if (!piiPattern.test(diagSection)) {
        pass('Không log trực tiếp field PII (name/phone/email) trong diagnostic');
    } else {
        fail('Có log field PII trong diagnostic — chỉ được log count/status');
    }
} else {
    warn('Không tìm thấy vùng diagnostic để kiểm tra PII');
}

// ── Kết quả ──────────────────────────────────────────────────────
console.log('');
console.log(`[DataHydrationCheck] Đã kiểm tra: ${checked} patterns trong app.js + runtimeReadinessDiagnostics.js`);

if (errors > 0) {
    console.error(`[DataHydrationCheck] ❌ FAILED — ${errors} lỗi.`);
    process.exit(1);
} else {
    console.log('[DataHydrationCheck] ✅ OK — Data hydration diagnostics đầy đủ và an toàn.');
    process.exit(0);
}
