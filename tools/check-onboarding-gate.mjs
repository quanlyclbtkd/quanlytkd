/**
 * tools/check-onboarding-gate.mjs — Phase 4.0B-4I Automated Onboarding Gate Checker
 * ──────────────────────────────────────────────────────────────────────────────────────
 * Kiểm tra source tĩnh đảm bảo hệ thống có đủ cơ sở cho automated onboarding gate:
 *
 *   1.  window.runOnboardingGate được định nghĩa (async).
 *   2.  window.printOnboardingGate được định nghĩa (async).
 *   3.  window.generateOnboardingReportText được định nghĩa (async).
 *   4.  runOnboardingGate gọi resolveActiveDataSource.
 *   5.  runOnboardingGate gọi printDataHydrationStatus.
 *   6.  runOnboardingGate gọi printPilotTabReadiness.
 *   7.  runOnboardingGate gọi printOneClubPilotGate.
 *   8.  runOnboardingGate gọi printTenClubPilotReadiness.
 *   9.  Có blockers array với push().
 *  10.  Có kiểm tra clubId missing.
 *  11.  Có kiểm tra activeDataSource unknown.
 *  12.  Có kiểm tra profilesCount = 0.
 *  13.  Có kiểm tra tuitionReady / debtReady / dashboardReady.
 *  14.  Có kiểm tra permission-error.
 *  15.  Có kiểm tra runtimeRecovery.error.
 *  16.  Có kiểm tra critical health missing.
 *  17.  Output có trường checkedAt.
 *  18.  Output có trường warnings.
 *  19.  generateOnboardingReportText trả markdown text.
 *  20.  Không có Firestore write trong onboarding gate.
 *  21.  Không có migration tự động.
 *  22.  Firestore rules không mở public.
 *  23.  ONBOARDING_CHECKLIST_TEMPLATE.md tồn tại.
 *  24.  ONBOARDING_REPORT_TEMPLATE.md tồn tại.
 *
 * Dùng:
 *   node tools/check-onboarding-gate.mjs
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

function pass(msg)  { console.log(`[OnboardingGate] PASS  ${msg}`); }
function fail(msg)  { console.error(`[OnboardingGate] FAIL  ${msg}`); errors++; }
function warn(msg)  { console.warn(`[OnboardingGate] WARN  ${msg}`); }
function info(msg)  { console.log(`[OnboardingGate] INFO  ${msg}`); }

function readSrc(rel) {
    const p = join(ROOT, rel);
    if (!existsSync(p)) { fail(`${rel} không tồn tại`); return null; }
    return readFileSync(p, 'utf-8');
}

function checkPattern(src, pattern, label, required = true) {
    checked++;
    const found = typeof pattern === 'string' ? src.includes(pattern) : pattern.test(src);
    if (found) { pass(label); return true; }
    if (required) { fail(`${label}  ← KHÔNG TÌM THẤY`); }
    else          { warn(`${label}  ← optional`); }
    return false;
}

function fileExists(rel, label) {
    checked++;
    if (existsSync(join(ROOT, rel))) { pass(label); return true; }
    fail(`${label}  ← FILE KHÔNG TỒN TẠI`);
    return false;
}

console.log('[OnboardingGate] Kiểm tra automated onboarding gate (Phase 4.0B-4I)...');
console.log('');

const appSrc = readSrc('app.js');
if (!appSrc) {
    console.error('[OnboardingGate] ❌ Không đọc được app.js — dừng.');
    process.exit(1);
}
info(`app.js: ${appSrc.length} ký tự`);
console.log('');

// ── 1–3. Các functions chính ──────────────────────────────────────
console.log('[OnboardingGate] [1–3] Kiểm tra functions chính...');
checkPattern(appSrc, 'runOnboardingGate',
    'window.runOnboardingGate được định nghĩa');
checkPattern(appSrc, /window\.runOnboardingGate\s*=\s*async\s+function/,
    'runOnboardingGate là async function');
checkPattern(appSrc, 'printOnboardingGate',
    'window.printOnboardingGate được định nghĩa');
checkPattern(appSrc, /window\.printOnboardingGate\s*=\s*async\s+function/,
    'printOnboardingGate là async function');
checkPattern(appSrc, 'generateOnboardingReportText',
    'window.generateOnboardingReportText được định nghĩa');
checkPattern(appSrc, /window\.generateOnboardingReportText\s*=\s*async\s+function/,
    'generateOnboardingReportText là async function');

// ── 4–8. runOnboardingGate gọi các diagnostics ───────────────────
// Tìm vùng runOnboardingGate để check scoped
const gateStart = appSrc.indexOf('window.runOnboardingGate = async function');
const gateEnd   = appSrc.indexOf('window.printOnboardingGate = async function');
const gateBody  = gateStart !== -1 && gateEnd > gateStart
    ? appSrc.slice(gateStart, gateEnd)
    : appSrc;

console.log('');
console.log('[OnboardingGate] [4–8] Kiểm tra runOnboardingGate gọi diagnostics...');
checkPattern(gateBody, /resolveActiveDataSource\s*\(\s*\)/,
    'runOnboardingGate gọi resolveActiveDataSource()');
checkPattern(gateBody, /printDataHydrationStatus\s*\(\s*\)/,
    'runOnboardingGate gọi printDataHydrationStatus()');
checkPattern(gateBody, /printPilotTabReadiness\s*\(\s*\)/,
    'runOnboardingGate gọi printPilotTabReadiness()');
checkPattern(gateBody, /printOneClubPilotGate\s*\(\s*\)/,
    'runOnboardingGate gọi printOneClubPilotGate()');
checkPattern(gateBody, /printTenClubPilotReadiness\s*\(\s*\)/,
    'runOnboardingGate gọi printTenClubPilotReadiness()');

// ── 9–16. Blockers ────────────────────────────────────────────────
console.log('');
console.log('[OnboardingGate] [9–16] Kiểm tra blockers...');
checkPattern(gateBody, /blockers\s*\.push\s*\(/,
    'Có blockers.push() trong runOnboardingGate');
checkPattern(gateBody, /clubId.*missing/i,
    'Có kiểm tra clubId missing');
checkPattern(gateBody, "activeDataSource === 'unknown'",
    "Có kiểm tra activeDataSource unknown");
checkPattern(gateBody, /profilesCount.*>\s*0/,
    'Có kiểm tra profilesCount > 0');
checkPattern(gateBody, 'tuitionReady',
    'Có kiểm tra tuitionReady');
checkPattern(gateBody, 'debtReady',
    'Có kiểm tra debtReady');
checkPattern(gateBody, 'dashboardReady',
    'Có kiểm tra dashboardReady');
checkPattern(gateBody, 'permission-error',
    'Có kiểm tra permission-error từ Firestore');
checkPattern(gateBody, '__runtimeRecoveryState',
    'Có kiểm tra runtimeRecovery.error');
checkPattern(gateBody, 'criticalMissing',
    'Có kiểm tra critical runtime health missing');

// ── 17–18. Output fields ──────────────────────────────────────────
console.log('');
console.log('[OnboardingGate] [17–18] Kiểm tra output fields...');
checkPattern(gateBody, 'checkedAt',
    'Output có trường checkedAt');
checkPattern(gateBody, 'warnings',
    'Output có trường warnings');
checkPattern(gateBody, 'readyForInternalTest',
    'Output có trường readyForInternalTest');
checkPattern(gateBody, 'readyForOneClubPilot',
    'Output có trường readyForOneClubPilot');
checkPattern(gateBody, 'readyForTenClubPilot',
    'Output có trường readyForTenClubPilot');

// ── 19. generateOnboardingReportText trả markdown ────────────────
console.log('');
console.log('[OnboardingGate] [19] Kiểm tra generateOnboardingReportText...');
const reportFnStart = appSrc.indexOf('window.generateOnboardingReportText = async function');
const reportFnEnd   = appSrc.indexOf('// ── End Phase 4.0B-4I');
const reportBody    = reportFnStart !== -1
    ? appSrc.slice(reportFnStart, reportFnEnd > reportFnStart ? reportFnEnd : reportFnStart + 2000)
    : appSrc;

checkPattern(reportBody, '# Onboarding Gate Report',
    'generateOnboardingReportText trả markdown có heading');
checkPattern(reportBody, 'Profiles Count',
    'Report markdown có Profiles Count');
checkPattern(reportBody, 'Blockers',
    'Report markdown có Blockers');
checkPattern(reportBody, 'Checked At',
    'Report markdown có Checked At');

// ── 20. Không có Firestore write trong onboarding gate ────────────
console.log('');
console.log('[OnboardingGate] [20] Kiểm tra không có Firestore write...');
const phase4iStart = appSrc.indexOf('window.runOnboardingGate = async function');
const phase4iEnd   = appSrc.indexOf('// ── End Phase 4.0B-4I');
const phase4iSection = phase4iStart !== -1 && phase4iEnd > phase4iStart
    ? appSrc.slice(phase4iStart, phase4iEnd)
    : '';

if (phase4iSection) {
    checked++;
    const hasWrite = /\bsetDoc\b|\bupdateDoc\b|\baddDoc\b|\bdeleteDoc\b|\bbatch\.set\b|\bbatch\.update\b/.test(phase4iSection);
    if (!hasWrite) {
        pass('Không có Firestore write trong onboarding gate section');
    } else {
        fail('Có Firestore write trong Phase 4I code — không được phép');
    }
} else {
    warn('Không xác định được vùng Phase 4I để kiểm tra Firestore write');
}

// ── 21. Không có migration tự động ───────────────────────────────
checked++;
const hasMigration = phase4iSection
    ? /\bcopyDoc\b|\bmigrateData\b|\bbatchWrite\b|\bmigrationRun\b/.test(phase4iSection)
    : false;
if (!hasMigration) {
    pass('Không có migration tự động trong onboarding gate');
} else {
    fail('Có migration tự động trong Phase 4I code — không được phép');
}

// ── 22. Firestore rules không mở public ──────────────────────────
console.log('');
console.log('[OnboardingGate] [22] Kiểm tra Firestore rules...');
const rulesSrc = readSrc('firestore.rules');
if (rulesSrc) {
    checked++;
    const hasPublicRead = /allow\s+read\s*:\s*if\s+true/.test(rulesSrc)
        && !/isClubMember|isSuperAdmin|myClubId/.test(rulesSrc.slice(0, 500));
    if (!hasPublicRead) {
        pass('Firestore rules không có catch-all public read');
    } else {
        fail('Firestore rules có catch-all public read — không an toàn');
    }
}

// ── 23–24. Template files ─────────────────────────────────────────
console.log('');
console.log('[OnboardingGate] [23–24] Kiểm tra template files...');
fileExists('ONBOARDING_CHECKLIST_TEMPLATE.md', 'ONBOARDING_CHECKLIST_TEMPLATE.md tồn tại');
fileExists('ONBOARDING_REPORT_TEMPLATE.md',    'ONBOARDING_REPORT_TEMPLATE.md tồn tại');

// ── Kết quả ───────────────────────────────────────────────────────
console.log('');
console.log(`[OnboardingGate] Đã kiểm tra: ${checked} patterns`);

if (errors > 0) {
    console.error(`[OnboardingGate] ❌ FAILED — ${errors} lỗi.`);
    process.exit(1);
} else {
    console.log('[OnboardingGate] ✅ OK — Automated onboarding gate (Phase 4.0B-4I) đầy đủ.');
    process.exit(0);
}
