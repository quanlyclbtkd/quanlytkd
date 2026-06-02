/**
 * tools/check-tenant-isolation.mjs — Phase 4.0B-4G Tenant Isolation Checker
 * ──────────────────────────────────────────────────────────────────────────
 * Kiểm tra source tĩnh để đảm bảo multi-tenant safety:
 *
 *   1.  App dùng clubs/{clubId} cho primary data path.
 *   2.  Không hard-code clubId cụ thể trong primary path.
 *   3.  Legacy fallback tst_* chỉ là read-only.
 *   4.  Legacy fallback không áp dụng bừa bãi cho mọi CLB.
 *   5.  Firestore rules không có catch-all public read.
 *   6.  Firestore rules kiểm tra clubId hoặc role (isClubMember / myClubId).
 *   7.  Không có code cho phép anonymous đọc toàn bộ clubs.
 *   8.  Không có write/migration trong fallback code.
 *   9.  SuperAdmin không bị mở cho admin thường.
 *
 * Dùng:
 *   node tools/check-tenant-isolation.mjs
 *
 * Exit code:
 *   0 — OK
 *   1 — vi phạm tenant isolation
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT  = join(__dir, '..');

let errors  = 0;
let checked = 0;

function pass(msg)  { console.log(`[TenantIsolation] PASS  ${msg}`); }
function fail(msg)  { console.error(`[TenantIsolation] FAIL  ${msg}`); errors++; }
function warn(msg)  { console.warn(`[TenantIsolation] WARN  ${msg}`); }
function info(msg)  { console.log(`[TenantIsolation] INFO  ${msg}`); }

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

console.log('[TenantIsolation] Kiểm tra multi-tenant isolation (Phase 4.0B-4G)...');
console.log('');

const appSrc   = readSrc('app.js');
const rulesSrc = readSrc('firestore.rules');

if (!appSrc) {
    console.error('[TenantIsolation] ❌ Không đọc được app.js — dừng.');
    process.exit(1);
}
info(`app.js: ${appSrc.length} ký tự`);

// ════════════════════════════════════════════════════════════════
// 1. App dùng clubs/{clubId} cho primary data path
// Chấp nhận cả hai dạng:
//   Dạng A (template literal):   `clubs/${clubId}/...`
//   Dạng B (string concat):      'clubs/' + clubId + '/...'  hoặc  'clubs/' + _clubId
// ════════════════════════════════════════════════════════════════
console.log('');
console.log('[TenantIsolation] [1] Kiểm tra primary data path dùng clubs/{clubId}...');

function checkAnyPattern(src, patterns, label) {
    checked++;
    const found = patterns.some(p =>
        typeof p === 'string' ? src.includes(p) : p.test(src)
    );
    if (found) { pass(label); return true; }
    fail(`${label}  ← KHÔNG TÌM THẤY`);
    return false;
}

checkAnyPattern(appSrc, [
    /clubs\/\$\{[\w.]+clubId[\w.]*\}/,        // template: clubs/${clubId}
    /['"]clubs\/['"]\s*\+\s*\w*[Cc]lub[Ii]d/, // concat:   'clubs/' + clubId / _clubId
    /['"]clubs\/['"]\s*\+\s*_clubId/           // concat:   'clubs/' + _clubId
], 'Primary path dùng clubs/{clubId} dynamic pattern (template hoặc concat)');

checkAnyPattern(appSrc, [
    /clubs\/\$\{/,                             // template literal
    /['"]clubs\/['"]\s*\+/                     // string concatenation
], 'clubs/... được xây dựng dynamic (không hard-code)');

// ════════════════════════════════════════════════════════════════
// 2. Không hard-code clubId cụ thể trong primary path
// ════════════════════════════════════════════════════════════════
console.log('');
console.log('[TenantIsolation] [2] Kiểm tra không hard-code clubId...');
// Các dạng hard-code phổ biến: clubs/abc123, clubs/tst, clubs/test001
checkAbsent(appSrc, /['"`]clubs\/[a-zA-Z0-9_-]{4,}['"`]/,
    'Không có hard-coded clubId trong string literal clubs/...');

// ════════════════════════════════════════════════════════════════
// 3. Legacy fallback tst_* là read-only (không setDoc/updateDoc trong tst_ block)
// ════════════════════════════════════════════════════════════════
console.log('');
console.log('[TenantIsolation] [3] Kiểm tra legacy fallback tst_* read-only...');
// Tìm vùng activateLegacyRootFallback
const legacyStart = appSrc.indexOf('window.activateLegacyRootFallback');
const legacyEnd   = appSrc.indexOf('window.printPilotTabReadiness');
if (legacyStart !== -1 && legacyEnd !== -1) {
    const legacySection = appSrc.slice(legacyStart, legacyEnd);
    const hasWrite = /\bsetDoc\b|\bupdateDoc\b|\baddDoc\b|\bdeleteDoc\b|\bbatch\.set\b|\bbatch\.update\b/.test(legacySection);
    checked++;
    if (!hasWrite) {
        pass('Không có Firestore write trong activateLegacyRootFallback (read-only safe)');
    } else {
        fail('Có Firestore write trong activateLegacyRootFallback — vi phạm read-only');
    }
} else {
    warn('Không tìm được vùng activateLegacyRootFallback để kiểm tra');
}

// ════════════════════════════════════════════════════════════════
// 4. Legacy fallback không áp dụng bừa bãi cho mọi CLB
// ════════════════════════════════════════════════════════════════
console.log('');
console.log('[TenantIsolation] [4] Kiểm tra legacy fallback có guard — không áp dụng cho mọi CLB...');
// Guard đúng: fallback chỉ kích hoạt khi source = 'legacy-root'
checkPattern(appSrc, "source === 'legacy-root'",
    "Guard: fallback chỉ kích hoạt khi source = 'legacy-root'");
checkPattern(appSrc, "'auto-runtime-recovery'",
    "Fallback được gọi có reason='auto-runtime-recovery' (có kiểm soát)");

// ════════════════════════════════════════════════════════════════
// 5. Firestore rules không có catch-all public read
// ════════════════════════════════════════════════════════════════
console.log('');
console.log('[TenantIsolation] [5] Kiểm tra Firestore rules không có public catch-all read...');
if (rulesSrc) {
    const hasPublicCatchAll = /allow\s+read[^;]*true[^;]*;[\s\S]*?match\s*\/\{document=\*\*\}/.test(rulesSrc)
        || (/match\s*\/\{document=\*\*\}/.test(rulesSrc) && /allow\s+read.*true/.test(rulesSrc));
    checked++;
    if (!hasPublicCatchAll) {
        pass('Firestore rules không có catch-all public read');
    } else {
        fail('Firestore rules có catch-all public read — vi phạm tenant isolation');
    }

    // Deny-by-default check
    checkPattern(rulesSrc, /allow\s+read,\s*write\s*:\s*if\s+false/,
        'Deny-by-default rule (allow read, write: if false) tồn tại');
} else {
    warn('firestore.rules không tìm thấy — bỏ qua checks rules');
}

// ════════════════════════════════════════════════════════════════
// 6. Firestore rules kiểm tra clubId hoặc role
// ════════════════════════════════════════════════════════════════
console.log('');
console.log('[TenantIsolation] [6] Kiểm tra Firestore rules có clubId / role guard...');
if (rulesSrc) {
    checkPattern(rulesSrc, /isClubMember|myClubId|isClubAdmin|isAdminOfClub|isMemberOfClub/,
        'Rules có hàm kiểm tra clubId membership (isClubMember/myClubId/isClubAdmin)');
    checkPattern(rulesSrc, /isSuperAdmin/,
        'Rules có hàm isSuperAdmin');
    checkPattern(rulesSrc, /match\s*\/clubs\/\{clubId\}/,
        'Rules có match /clubs/{clubId} với dynamic clubId');
}

// ════════════════════════════════════════════════════════════════
// 7. Không có anonymous read toàn bộ clubs
// ════════════════════════════════════════════════════════════════
console.log('');
console.log('[TenantIsolation] [7] Kiểm tra không có anonymous read clubs...');
if (rulesSrc) {
    // Không có allow read: if true trong clubs
    const clubsBlock = rulesSrc.slice(rulesSrc.indexOf('match /clubs/{clubId}') || 0);
    const hasAnonRead = /allow\s+read\s*:\s*if\s+true/.test(clubsBlock);
    checked++;
    if (!hasAnonRead) {
        pass('Không có allow read: if true trong clubs block');
    } else {
        fail('Có anonymous read (if true) trong clubs block — vi phạm');
    }
}
checkAbsent(appSrc, /signInAnonymously.*\/clubs\//,
    'Không có signInAnonymously kết hợp với clubs/ path trong app.js');

// ════════════════════════════════════════════════════════════════
// 8. Không có write/migration trong fallback
// ════════════════════════════════════════════════════════════════
console.log('');
console.log('[TenantIsolation] [8] Kiểm tra không có migration tự động trong recovery...');
const recovSection = legacyStart !== -1 ? appSrc.slice(legacyStart) : appSrc;
const hasMigration = /\b(?:copyDoc|batchWrite|runMigration|migrateData|migrateAll)\b/.test(recovSection);
checked++;
if (!hasMigration) {
    pass('Không có migration/copy functions trong recovery code');
} else {
    fail('Có migration lệnh trong recovery code — phase này chỉ read-only');
}

// ════════════════════════════════════════════════════════════════
// 9. SuperAdmin không bị mở cho admin thường
// ════════════════════════════════════════════════════════════════
console.log('');
console.log('[TenantIsolation] [9] Kiểm tra SuperAdmin guard...');
if (rulesSrc) {
    // SuperAdmin route phải yêu cầu isSuperAdmin(), không phải isClubAdmin
    checkPattern(rulesSrc, /match\s*\/super_admins\/\{uid\}/,
        'super_admins collection có match rule riêng biệt');
    checkPattern(rulesSrc, /allow\s+read,\s*write\s*:\s*if\s+isSuperAdmin\(\)/,
        'super_admins chỉ cho phép isSuperAdmin() — không phải isClubAdmin');
}
// Trong app.js: SuperAdmin logic được bảo vệ bởi server-side check
checkPattern(appSrc, /isSuperAdmin|superAdmin|super_admin/,
    'SuperAdmin check tồn tại trong app.js');

// ── Kết quả ──────────────────────────────────────────────────────
console.log('');
console.log(`[TenantIsolation] Đã kiểm tra: ${checked} patterns`);

if (errors > 0) {
    console.error(`[TenantIsolation] ❌ FAILED — ${errors} vi phạm tenant isolation.`);
    process.exit(1);
} else {
    console.log('[TenantIsolation] ✅ OK — Multi-tenant isolation checks (Phase 4.0B-4G) an toàn.');
    process.exit(0);
}
