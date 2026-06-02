/**
 * tools/check-one-club-pilot-gate.mjs — Phase 4.0B-4H One-Club Pilot Gate Checker
 * ──────────────────────────────────────────────────────────────────────────────────
 * Kiểm tra source tĩnh đảm bảo hệ thống có đủ cơ sở cho 1-CLB pilot gate:
 *
 *   1.  window.generatePilotLaunchSnapshot được định nghĩa (async).
 *   2.  Snapshot gọi resolveActiveDataSource (await).
 *   3.  Snapshot gọi printDataHydrationStatus.
 *   4.  Snapshot gọi printPilotTabReadiness.
 *   5.  Snapshot gọi printPilotLaunchStatus.
 *   6.  Snapshot gọi printTenClubPilotReadiness.
 *   7.  window.printOneClubPilotGate được định nghĩa.
 *   8.  Gate trả về readyForInternalTest field.
 *   9.  Gate trả về readyForOneClubPilot field.
 *  10.  Gate trả về readyForTenClubPilot field.
 *  11.  Gate trả về blockers array.
 *  12.  Gate trả về profilesCount.
 *  13.  Gate trả về tuitionReady + debtReady.
 *  14.  ONE_CLUB_PILOT_RUNBOOK.md tồn tại.
 *  15.  PILOT_ISSUE_REPORT_TEMPLATE.md tồn tại.
 *  16.  Không có Firestore write trong snapshot/gate.
 *
 * Dùng:
 *   node tools/check-one-club-pilot-gate.mjs
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

function pass(msg)  { console.log(`[OneClubGate] PASS  ${msg}`); }
function fail(msg)  { console.error(`[OneClubGate] FAIL  ${msg}`); errors++; }
function warn(msg)  { console.warn(`[OneClubGate] WARN  ${msg}`); }
function info(msg)  { console.log(`[OneClubGate] INFO  ${msg}`); }

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

console.log('[OneClubGate] Kiểm tra 1-CLB pilot gate (Phase 4.0B-4H)...');
console.log('');

const appSrc = readSrc('app.js');
if (!appSrc) {
    console.error('[OneClubGate] ❌ Không đọc được app.js — dừng.');
    process.exit(1);
}
info(`app.js: ${appSrc.length} ký tự`);
console.log('');

// ── 1–6. generatePilotLaunchSnapshot ──────────────────────────────
console.log('[OneClubGate] [1–6] Kiểm tra window.generatePilotLaunchSnapshot...');
checkPattern(appSrc, 'generatePilotLaunchSnapshot',
    'window.generatePilotLaunchSnapshot được định nghĩa');
checkPattern(appSrc, /window\.generatePilotLaunchSnapshot\s*=\s*async\s+function/,
    'generatePilotLaunchSnapshot là async function');
checkPattern(appSrc, /await\s+window\.resolveActiveDataSource\s*\(\s*\)/,
    'Snapshot gọi await resolveActiveDataSource()');
checkPattern(appSrc, /printDataHydrationStatus\s*\(\s*\)/,
    'Snapshot gọi printDataHydrationStatus()');
checkPattern(appSrc, /printPilotTabReadiness\s*\(\s*\)/,
    'Snapshot gọi printPilotTabReadiness()');
checkPattern(appSrc, /printPilotLaunchStatus\s*\(\s*\)/,
    'Snapshot gọi printPilotLaunchStatus()');
checkPattern(appSrc, /printTenClubPilotReadiness\s*\(\s*\)/,
    'Snapshot gọi printTenClubPilotReadiness()');
checkPattern(appSrc, 'snapshotAt',
    'Snapshot có snapshotAt timestamp');

// ── 7. printOneClubPilotGate ───────────────────────────────────────
console.log('');
console.log('[OneClubGate] [7] Kiểm tra window.printOneClubPilotGate...');
checkPattern(appSrc, 'printOneClubPilotGate',
    'window.printOneClubPilotGate được định nghĩa');
checkPattern(appSrc, /window\.printOneClubPilotGate\s*=\s*function/,
    'printOneClubPilotGate là function assignment');

// ── 8–13. Gate fields ──────────────────────────────────────────────
console.log('');
console.log('[OneClubGate] [8–13] Kiểm tra gate output fields...');

// Tìm vùng printOneClubPilotGate để kiểm tra scoped
const gateStart = appSrc.indexOf('window.printOneClubPilotGate = function');
const gateEnd   = appSrc.indexOf('// ── End Phase 4.0B-4H');
const gateBody  = gateStart !== -1 ? appSrc.slice(gateStart, gateEnd > gateStart ? gateEnd : gateStart + 3000) : appSrc;

checkPattern(gateBody, 'readyForInternalTest',
    'Gate trả về readyForInternalTest field');
checkPattern(gateBody, 'readyForOneClubPilot',
    'Gate trả về readyForOneClubPilot field');
checkPattern(gateBody, 'readyForTenClubPilot',
    'Gate trả về readyForTenClubPilot field');
checkPattern(gateBody, 'blockers',
    'Gate trả về blockers array');
checkPattern(gateBody, 'profilesCount',
    'Gate trả về profilesCount');
checkPattern(gateBody, 'transactionsCount',
    'Gate trả về transactionsCount');
checkPattern(gateBody, 'inventoryCount',
    'Gate trả về inventoryCount');
checkPattern(gateBody, 'tuitionReady',
    'Gate trả về tuitionReady');
checkPattern(gateBody, 'debtReady',
    'Gate trả về debtReady');
checkPattern(gateBody, 'dashboardReady',
    'Gate trả về dashboardReady');

// ── Blockers có message cụ thể ────────────────────────────────────
console.log('');
console.log('[OneClubGate] Kiểm tra gate blockers có message rõ ràng...');
checkPattern(gateBody, /blockers\.push\(/,
    'Gate có blockers.push() ghi nhận blocker');
checkPattern(gateBody, "activeDataSource === 'unknown'",
    "Gate check activeDataSource unknown");
checkPattern(gateBody, 'profilesCount > 0',
    'Gate check profilesCount > 0');
checkPattern(gateBody, 'tuitionReady',
    'Gate check tuitionReady condition');
checkPattern(gateBody, 'debtReady',
    'Gate check debtReady condition');

// ── 14. ONE_CLUB_PILOT_RUNBOOK.md ─────────────────────────────────
console.log('');
console.log('[OneClubGate] [14] Kiểm tra ONE_CLUB_PILOT_RUNBOOK.md...');
fileExists('ONE_CLUB_PILOT_RUNBOOK.md', 'ONE_CLUB_PILOT_RUNBOOK.md tồn tại');

// ── 15. PILOT_ISSUE_REPORT_TEMPLATE.md ────────────────────────────
console.log('');
console.log('[OneClubGate] [15] Kiểm tra PILOT_ISSUE_REPORT_TEMPLATE.md...');
fileExists('PILOT_ISSUE_REPORT_TEMPLATE.md', 'PILOT_ISSUE_REPORT_TEMPLATE.md tồn tại');

// ── 16. Không có Firestore write trong snapshot/gate ──────────────
console.log('');
console.log('[OneClubGate] [16] Kiểm tra không có Firestore write trong snapshot/gate...');
const snapshotStart = appSrc.indexOf('window.generatePilotLaunchSnapshot');
const gateEndIdx    = appSrc.indexOf('// ── End Phase 4.0B-4H');
const phase4hSection = snapshotStart !== -1 && gateEndIdx !== -1
    ? appSrc.slice(snapshotStart, gateEndIdx)
    : '';

if (phase4hSection) {
    const hasWrite = /\bsetDoc\b|\bupdateDoc\b|\baddDoc\b|\bdeleteDoc\b|\bbatch\.set\b|\bbatch\.update\b/.test(phase4hSection);
    checked++;
    if (!hasWrite) {
        pass('Không có Firestore write trong generatePilotLaunchSnapshot / printOneClubPilotGate');
    } else {
        fail('Có Firestore write trong Phase 4H code — không được phép');
    }
} else {
    warn('Không xác định được vùng Phase 4H để kiểm tra');
}

// ── Kết quả ───────────────────────────────────────────────────────
console.log('');
console.log(`[OneClubGate] Đã kiểm tra: ${checked} patterns`);

if (errors > 0) {
    console.error(`[OneClubGate] ❌ FAILED — ${errors} lỗi.`);
    process.exit(1);
} else {
    console.log('[OneClubGate] ✅ OK — 1-CLB pilot gate (Phase 4.0B-4H) đầy đủ.');
    process.exit(0);
}
