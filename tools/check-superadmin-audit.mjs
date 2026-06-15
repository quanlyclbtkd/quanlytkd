/**
 * tools/check-superadmin-audit.mjs — Phase 4.0B-4J SuperAdmin Audit Checker
 * ──────────────────────────────────────────────────────────────────────────────
 * Kiểm tra source tĩnh đảm bảo SuperAdmin audit đầy đủ và an toàn:
 *
 *   1.  window.runSuperAdminAudit được định nghĩa (async).
 *   2.  probeClubDataReadOnly helper được định nghĩa (async).
 *   3.  window.printSuperAdminAudit được định nghĩa (async).
 *   4.  window.generateSuperAdminAuditReportText được định nghĩa (async).
 *   5.  runSuperAdminAudit có option clubIds.
 *   6.  runSuperAdminAudit có option limit.
 *   7.  runSuperAdminAudit có option includeLegacyCheck.
 *   8.  Có blockers handling (blockersSummary).
 *   9.  Có permission-denied handling trong probe.
 *  10.  Có SuperAdmin role warning/check.
 *  11.  Không có Firestore write trong SuperAdmin audit section.
 *  12.  Không có migration tự động.
 *  13.  Firestore rules không mở public.
 *  14.  probeClubDataReadOnly dùng limit(1).
 *  15.  Không log PII (không log name/phone/email học viên trong audit).
 *  16.  Output có clubs array.
 *  17.  Output có readyForPilotCount.
 *  18.  Output có blockedCount.
 *  19.  printSuperAdminAudit dùng console.table.
 *  20.  generateSuperAdminAuditReportText trả markdown heading.
 *  21.  SUPERADMIN_AUDIT_REPORT_TEMPLATE.md tồn tại.
 *
 * Dùng:
 *   node tools/check-superadmin-audit.mjs
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

function pass(msg) { console.log(`[SuperAdminAudit] PASS  ${msg}`); }
function fail(msg) { console.error(`[SuperAdminAudit] FAIL  ${msg}`); errors++; }
function warn(msg) { console.warn(`[SuperAdminAudit] WARN  ${msg}`); }
function info(msg) { console.log(`[SuperAdminAudit] INFO  ${msg}`); }

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

console.log('[SuperAdminAudit] Kiểm tra SuperAdmin multi-club audit (Phase 4.0B-4J)...');
console.log('');

const appSrc = readSrc('app.js');
const auditSrc = readSrc('js/diagnostics/superAdminAuditDiagnostics.js');
if (!appSrc || !auditSrc) {
    console.error('[SuperAdminAudit] ❌ Không đọc được app.js hoặc superAdminAuditDiagnostics.js — dừng.');
    process.exit(1);
}
info(`app.js: ${appSrc.length} ký tự`);
console.log('');

// ── 1–4. Functions chính ──────────────────────────────────────────
console.log('[SuperAdminAudit] [1–4] Kiểm tra functions chính...');
checkPattern(auditSrc, 'runSuperAdminAudit',
    'window.runSuperAdminAudit được định nghĩa');
checkPattern(auditSrc, /export async function runSuperAdminAudit/,
    'runSuperAdminAudit là async function');
checkPattern(auditSrc, 'probeClubDataReadOnly',
    'probeClubDataReadOnly helper được định nghĩa');
checkPattern(auditSrc, /export async function probeClubDataReadOnly/,
    'probeClubDataReadOnly là async function');
checkPattern(auditSrc, 'printSuperAdminAudit',
    'window.printSuperAdminAudit được định nghĩa');
checkPattern(auditSrc, /export async function printSuperAdminAudit/,
    'printSuperAdminAudit là async function');
checkPattern(auditSrc, 'generateSuperAdminAuditReportText',
    'window.generateSuperAdminAuditReportText được định nghĩa');
checkPattern(auditSrc, /export async function generateSuperAdminAuditReportText/,
    'generateSuperAdminAuditReportText là async function');

// ── Xác định vùng audit để check scoped ──────────────────────────
const auditStart = auditSrc.indexOf('export async function runSuperAdminAudit');
const auditEnd   = auditSrc.length;
const auditBody  = auditStart !== -1 && auditEnd > auditStart
    ? auditSrc.slice(auditStart, auditEnd)
    : appSrc;

const probeStart = auditSrc.indexOf('export async function probeClubDataReadOnly');
const probeEnd   = auditSrc.indexOf('export async function runSuperAdminAudit');
const probeBody  = probeStart !== -1 && probeEnd > probeStart
    ? auditSrc.slice(probeStart, probeEnd)
    : appSrc;

// ── 5–7. Options ──────────────────────────────────────────────────
console.log('');
console.log('[SuperAdminAudit] [5–7] Kiểm tra options...');
checkPattern(auditBody, 'clubIds',
    'runSuperAdminAudit có option clubIds');
checkPattern(auditBody, 'limit',
    'runSuperAdminAudit có option limit');
checkPattern(auditBody, 'includeLegacyCheck',
    'runSuperAdminAudit có option includeLegacyCheck');

// ── 8. Blockers handling ──────────────────────────────────────────
console.log('');
console.log('[SuperAdminAudit] [8] Kiểm tra blockers handling...');
checkPattern(auditBody, 'blockersSummary',
    'runSuperAdminAudit có blockersSummary output');
checkPattern(auditBody, /blockers.*push|clubBlockers.*push/,
    'Có blockers.push() trong audit');

// ── 9. Permission-denied handling ────────────────────────────────
console.log('');
console.log('[SuperAdminAudit] [9] Kiểm tra permission-denied handling...');
checkPattern(probeBody, 'permission-denied',
    'probeClubDataReadOnly xử lý permission-denied');
checkPattern(probeBody, /PERMISSION_DENIED|permission.denied/i,
    'Có regex check cho permission denied error');
checkPattern(auditBody, 'permission-denied while probing',
    'runSuperAdminAudit propagates permission-denied blocker');

// ── 10. SuperAdmin role check ─────────────────────────────────────
console.log('');
console.log('[SuperAdminAudit] [10] Kiểm tra SuperAdmin role warning...');
checkPattern(auditBody, 'SuperAdmin role not confirmed',
    'Có warning SuperAdmin role not confirmed');
checkPattern(auditBody, /isSuperAdmin|superAdmin/,
    'Có kiểm tra isSuperAdmin / superAdmin role');

// ── 11. Không có Firestore write ──────────────────────────────────
console.log('');
console.log('[SuperAdminAudit] [11] Kiểm tra không có Firestore write...');
const phase4jSection = auditStart !== -1 && auditEnd > auditStart
    ? auditSrc.slice(auditStart, auditEnd)
    : '';

if (phase4jSection) {
    checked++;
    const hasWrite = /\bsetDoc\b|\bupdateDoc\b|\baddDoc\b|\bdeleteDoc\b|\bbatch\.set\b|\bbatch\.update\b/.test(phase4jSection);
    if (!hasWrite) {
        pass('Không có Firestore write trong SuperAdmin audit section');
    } else {
        fail('Có Firestore write trong Phase 4J code — không được phép');
    }
}

// ── 12. Không có migration tự động ───────────────────────────────
checked++;
const hasMigration = phase4jSection
    ? /\bcopyDoc\b|\bmigrateData\b|\bbatchWrite\b|\bmigrationRun\b/.test(phase4jSection)
    : false;
if (!hasMigration) {
    pass('Không có migration tự động trong SuperAdmin audit');
} else {
    fail('Có migration tự động trong Phase 4J code');
}

// ── 13. Firestore rules ───────────────────────────────────────────
console.log('');
console.log('[SuperAdminAudit] [13] Kiểm tra Firestore rules...');
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

// ── 14. probeClubDataReadOnly dùng limit(1) ───────────────────────
console.log('');
console.log('[SuperAdminAudit] [14] Kiểm tra probe dùng limit(1)...');
checkPattern(probeBody, /limit\s*\(\s*1\s*\)/,
    'probeClubDataReadOnly dùng limit(1)');

// ── 15. Không log PII ─────────────────────────────────────────────
console.log('');
console.log('[SuperAdminAudit] [15] Kiểm tra không log PII...');
// kiểm tra không có console.log trực tiếp các field PII trong probe/audit
const noPiiInProbe = !(/console\.log\s*\(.*\b(name|phone|email|address)\b/.test(probeBody));
checked++;
if (noPiiInProbe) {
    pass('Không log PII field trực tiếp trong probeClubDataReadOnly');
} else {
    fail('Có log PII field trong probe — không được phép');
}

// ── 16–18. Output fields ──────────────────────────────────────────
console.log('');
console.log('[SuperAdminAudit] [16–18] Kiểm tra output fields...');
checkPattern(auditBody, 'clubs:',
    'Output có clubs array');
checkPattern(auditBody, 'readyForPilotCount',
    'Output có readyForPilotCount');
checkPattern(auditBody, 'blockedCount',
    'Output có blockedCount');
checkPattern(auditBody, 'warningCount',
    'Output có warningCount');
checkPattern(auditBody, 'totalClubs',
    'Output có totalClubs');
checkPattern(auditBody, 'checkedAt',
    'Output có checkedAt');

// ── 19. printSuperAdminAudit dùng console.table ───────────────────
console.log('');
console.log('[SuperAdminAudit] [19] Kiểm tra printSuperAdminAudit...');
const printFnStart = auditSrc.indexOf('export async function printSuperAdminAudit');
const printFnEnd   = auditSrc.indexOf('export async function generateSuperAdminAuditReportText');
const printBody    = printFnStart !== -1
    ? auditSrc.slice(printFnStart, printFnEnd > printFnStart ? printFnEnd : printFnStart + 1500)
    : '';
checkPattern(printBody, 'console.table',
    'printSuperAdminAudit dùng console.table');

// ── 20. generateSuperAdminAuditReportText markdown ────────────────
console.log('');
console.log('[SuperAdminAudit] [20] Kiểm tra generateSuperAdminAuditReportText...');
checkPattern(auditBody, '# SuperAdmin Multi-Club Audit Report',
    'generateSuperAdminAuditReportText trả markdown heading');
checkPattern(auditBody, '## Summary',
    'Report markdown có Summary section');
checkPattern(auditBody, '## Club Results',
    'Report markdown có Club Results section');
checkPattern(auditBody, '## Blockers Summary',
    'Report markdown có Blockers Summary section');

// ── 21. Template file ─────────────────────────────────────────────
console.log('');
console.log('[SuperAdminAudit] [21] Kiểm tra SUPERADMIN_AUDIT_REPORT_TEMPLATE.md...');
fileExists('SUPERADMIN_AUDIT_REPORT_TEMPLATE.md', 'SUPERADMIN_AUDIT_REPORT_TEMPLATE.md tồn tại');

// ── Kết quả ───────────────────────────────────────────────────────
console.log('');
console.log(`[SuperAdminAudit] Đã kiểm tra: ${checked} patterns`);

if (errors > 0) {
    console.error(`[SuperAdminAudit] ❌ FAILED — ${errors} lỗi.`);
    process.exit(1);
} else {
    console.log('[SuperAdminAudit] ✅ OK — SuperAdmin multi-club audit (Phase 4.0B-4J) đầy đủ.');
    process.exit(0);
}
