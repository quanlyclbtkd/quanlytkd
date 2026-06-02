/**
 * tools/check-ten-club-pilot.mjs — Phase 4.0B-4G Ten-Club Pilot Checker
 * ──────────────────────────────────────────────────────────────────────────
 * Kiểm tra source tĩnh để đảm bảo hệ thống đạt tiêu chí 10-CLB pilot:
 *
 *   1.  Có window.printTenClubPilotReadiness.
 *   2.  readyForTenClubPilot không còn hard-code false.
 *   3.  Có pilotBlockers hoặc blockers array.
 *   4.  check-tenant-isolation.mjs tồn tại.
 *   5.  PILOT_BACKUP_CHECKLIST.md tồn tại.
 *   6.  PILOT_LAUNCH_REPORT_TEMPLATE.md tồn tại.
 *   7.  Không có Firestore writes trong fallback.
 *   8.  Firestore rules không mở public.
 *
 * Dùng:
 *   node tools/check-ten-club-pilot.mjs
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

function pass(msg)  { console.log(`[TenClubPilot] PASS  ${msg}`); }
function fail(msg)  { console.error(`[TenClubPilot] FAIL  ${msg}`); errors++; }
function warn(msg)  { console.warn(`[TenClubPilot] WARN  ${msg}`); }
function info(msg)  { console.log(`[TenClubPilot] INFO  ${msg}`); }

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

function fileExists(rel, label) {
    checked++;
    if (existsSync(join(ROOT, rel))) { pass(label); return true; }
    fail(`${label}  ← FILE KHÔNG TỒN TẠI`);
    return false;
}

console.log('[TenClubPilot] Kiểm tra 10-CLB pilot readiness (Phase 4.0B-4G)...');
console.log('');

const appSrc   = readSrc('app.js');
const rulesSrc = readSrc('firestore.rules');

if (!appSrc) {
    console.error('[TenClubPilot] ❌ Không đọc được app.js — dừng.');
    process.exit(1);
}
info(`app.js: ${appSrc.length} ký tự`);
console.log('');

// ── 1. window.printTenClubPilotReadiness tồn tại ─────────────────
console.log('[TenClubPilot] [1] Kiểm tra printTenClubPilotReadiness...');
checkPattern(appSrc, 'printTenClubPilotReadiness',
    'window.printTenClubPilotReadiness được định nghĩa trong app.js');
checkPattern(appSrc, /window\.printTenClubPilotReadiness\s*=\s*function/,
    'printTenClubPilotReadiness là function assignment');

// ── 2. readyForTenClubPilot không còn hard-code false ────────────
console.log('');
console.log('[TenClubPilot] [2] Kiểm tra readyForTenClubPilot không hard-code false...');
checkAbsent(appSrc, 'readyForTenClubPilot: false',
    'readyForTenClubPilot không còn set cứng false');
checkPattern(appSrc, 'readyForTenClubPilot:',
    'readyForTenClubPilot field vẫn tồn tại (dynamic)');
checkPattern(appSrc, /readyForTenClubPilot:\s*(?!false)\S/,
    'readyForTenClubPilot được gán giá trị động (không phải literal false)');

// ── 3. Có pilotBlockers / blockers ───────────────────────────────
console.log('');
console.log('[TenClubPilot] [3] Kiểm tra pilotBlockers và blockers...');
checkPattern(appSrc, 'pilotBlockers',
    'pilotBlockers array tồn tại trong printPilotLaunchStatus');
checkPattern(appSrc, /blockers\.push/,
    'blockers.push() được dùng để ghi nhận blocker');
checkPattern(appSrc, /blockers\.length === 0/,
    'readyForTenClubPilot = blockers.length === 0 (logic đúng)');

// ── 4. check-tenant-isolation.mjs tồn tại ────────────────────────
console.log('');
console.log('[TenClubPilot] [4] Kiểm tra tools/check-tenant-isolation.mjs...');
fileExists('tools/check-tenant-isolation.mjs', 'tools/check-tenant-isolation.mjs tồn tại');

// ── 5. PILOT_BACKUP_CHECKLIST.md tồn tại ─────────────────────────
console.log('');
console.log('[TenClubPilot] [5] Kiểm tra PILOT_BACKUP_CHECKLIST.md...');
fileExists('PILOT_BACKUP_CHECKLIST.md', 'PILOT_BACKUP_CHECKLIST.md tồn tại');

// ── 6. PILOT_LAUNCH_REPORT_TEMPLATE.md tồn tại ───────────────────
console.log('');
console.log('[TenClubPilot] [6] Kiểm tra PILOT_LAUNCH_REPORT_TEMPLATE.md...');
fileExists('PILOT_LAUNCH_REPORT_TEMPLATE.md', 'PILOT_LAUNCH_REPORT_TEMPLATE.md tồn tại');

// ── 7. Không có Firestore writes trong fallback ───────────────────
console.log('');
console.log('[TenClubPilot] [7] Kiểm tra không có Firestore write trong fallback...');
const fallbackStart = appSrc.indexOf('window.activateLegacyRootFallback');
const fallbackEnd   = appSrc.indexOf('window.printPilotTabReadiness');
if (fallbackStart !== -1 && fallbackEnd !== -1) {
    const fallbackSection = appSrc.slice(fallbackStart, fallbackEnd);
    const hasWrite = /\bsetDoc\b|\bupdateDoc\b|\baddDoc\b|\bdeleteDoc\b|\bbatch\.set\b|\bbatch\.update\b/.test(fallbackSection);
    checked++;
    if (!hasWrite) {
        pass('Không có Firestore write trong activateLegacyRootFallback');
    } else {
        fail('Có Firestore write trong activateLegacyRootFallback — không được phép');
    }
} else {
    warn('Không xác định được vùng fallback');
}

// ── 8. Firestore rules không mở public ───────────────────────────
console.log('');
console.log('[TenClubPilot] [8] Kiểm tra Firestore rules không mở public...');
if (rulesSrc) {
    const hasPublicRead = /allow\s+read.*true(?!\s*\/\/)/.test(rulesSrc)
        && rulesSrc.includes('match /{document=**}');
    checked++;
    if (!hasPublicRead) {
        pass('firestore.rules không có catch-all public read');
    } else {
        warn('firestore.rules có pattern public read — kiểm tra thủ công');
    }
} else {
    warn('firestore.rules không tìm thấy');
}

// ── Kết quả ──────────────────────────────────────────────────────
console.log('');
console.log(`[TenClubPilot] Đã kiểm tra: ${checked} patterns`);

if (errors > 0) {
    console.error(`[TenClubPilot] ❌ FAILED — ${errors} lỗi.`);
    process.exit(1);
} else {
    console.log('[TenClubPilot] ✅ OK — 10-CLB pilot hardening checks (Phase 4.0B-4G) đầy đủ.');
    process.exit(0);
}
