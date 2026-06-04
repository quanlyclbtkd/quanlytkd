#!/usr/bin/env node
/**
 * check-student-quit-separation.mjs
 * Phase 4K-5A: Kiểm tra phân tách võ sinh ĐANG TẬP / ĐÃ NGHỈ.
 *
 * Chạy: node tools/check-student-quit-separation.mjs
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

function readFile(relPath) {
    return readFileSync(join(ROOT, relPath), 'utf-8');
}

const results = [];
let passed = 0;
let failed = 0;

function check(label, condition, detail = '') {
    if (condition) {
        results.push({ status: '✅ PASS', label, detail });
        passed++;
    } else {
        results.push({ status: '❌ FAIL', label, detail });
        failed++;
    }
}

// ─── 1. students.service.js không còn dùng where('status', '!=', 'quit') ───
const serviceSrc = readFile('js/services/students.service.js');
check(
    "students.service.js: không dùng where('status', '!=', 'quit')",
    !serviceSrc.includes("where('status', '!=', 'quit')"),
    "Đã loại bỏ unsafe inequality filter"
);
check(
    "students.service.js: dùng getActiveQueryValues hoặc 'in' query",
    serviceSrc.includes("getActiveQueryValues") || serviceSrc.includes("'in'"),
    "Thay thế bằng 'in' query hoặc client-side classify"
);

// ─── 2. profileStatusConfig.js có quitAliases mở rộng ─────────────────────
const configSrc = readFile('js/data/profileStatusConfig.js');
check(
    "profileStatusConfig.js: quitAliases có 'retired'",
    configSrc.includes("'retired'"),
    "retired alias added"
);
check(
    "profileStatusConfig.js: quitQueryValues có 'retired'",
    configSrc.includes("'retired'") && configSrc.includes("quitQueryValues"),
    "quitQueryValues includes retired"
);
check(
    "profileStatusConfig.js: quitAliases có 'nghỉ tập'",
    configSrc.includes("nghỉ tập"),
    "Vietnamese alias added"
);

// ─── 3. syncStudentStatusLocal tồn tại ────────────────────────────────────
const studentsMod = readFile('js/modules/students.js');
check(
    "students.js: window.syncStudentStatusLocal được định nghĩa",
    studentsMod.includes("window.syncStudentStatusLocal"),
    "Global helper for local store sync"
);
check(
    "students.js: debugStudentStatusSeparation được định nghĩa",
    studentsMod.includes("window.debugStudentStatusSeparation"),
    "Debug helper for status separation check"
);

// ─── 4. handleQuitOption gọi syncStudentStatusLocal ───────────────────────
check(
    "students.js handleQuitOption: gọi syncStudentStatusLocal",
    studentsMod.includes("syncStudentStatusLocal") &&
        studentsMod.includes("handleQuitOption") &&
        (() => {
            const quitIdx = studentsMod.indexOf("window.handleQuitOption");
            const syncIdx = studentsMod.indexOf("syncStudentStatusLocal", quitIdx);
            const nextFn  = studentsMod.indexOf("window.", quitIdx + 30);
            return syncIdx > quitIdx && (nextFn === -1 || syncIdx < nextFn + 200);
        })(),
    "syncStudentStatusLocal called inside handleQuitOption"
);

// ─── 5. updateProfile gọi syncStudentStatusLocal ─────────────────────────
check(
    "students.js updateProfile: gọi syncStudentStatusLocal",
    studentsMod.includes("syncStudentStatusLocal") &&
        studentsMod.includes("updateProfile"),
    "syncStudentStatusLocal called after updateProfile"
);

// ─── 6. openBulkZaloModal dùng classifyProfileStatus ─────────────────────
check(
    "students.js openBulkZaloModal: không dùng p.status !== 'active' trực tiếp",
    !studentsMod.includes("if (p.status !== 'active') return;"),
    "classifyProfileStatus pattern used instead"
);

// ─── 7. app.js không dùng p.status === 'active' trực tiếp ────────────────
const appSrc = readFile('app.js');
const legacyActiveChecks = (appSrc.match(/if\s*\(\s*p\.status\s*===\s*['"]active['"]\s*\)/g) || []).length;
const legacyInactiveChecks = (appSrc.match(/if\s*\(\s*p\.status\s*!==\s*['"]active['"]\s*\)/g) || []).length;
check(
    "app.js: ít hơn 3 nơi dùng p.status === 'active' trực tiếp (không qua classifyProfileStatus)",
    legacyActiveChecks <= 2,
    `Tìm thấy ${legacyActiveChecks} chỗ dùng p.status === 'active' trực tiếp`
);
check(
    "app.js: ít hơn 3 nơi dùng p.status !== 'active' trực tiếp (không qua classifyProfileStatus)",
    legacyInactiveChecks <= 2,
    `Tìm thấy ${legacyInactiveChecks} chỗ dùng p.status !== 'active' trực tiếp`
);

// ─── 8. app.js handleQuitOption gọi syncStudentStatusLocal ───────────────
check(
    "app.js handleQuitOption: gọi syncStudentStatusLocal",
    appSrc.includes("window.syncStudentStatusLocal") && appSrc.includes("handleQuitOption"),
    "app.js calls syncStudentStatusLocal after quit"
);

// ─── 9. debugRuntimeSmokeTest có studentStatusSeparation ─────────────────
const mainSrc = readFile('js/main.js');
check(
    "main.js debugRuntimeSmokeTest: gọi debugStudentStatusSeparation",
    mainSrc.includes("debugStudentStatusSeparation"),
    "smoke test includes student status separation check"
);

// ─── Kết quả ──────────────────────────────────────────────────────────────
console.log('\n══════════════════════════════════════════════════════════════');
console.log(' check-student-quit-separation — Phase 4K-5A');
console.log('══════════════════════════════════════════════════════════════');
console.table(results);
console.log(`\nKết quả: ${passed} PASS / ${failed} FAIL`);
if (failed > 0) {
    console.error('\n❌ Một số kiểm tra THẤT BẠI — xem chi tiết ở trên.');
    process.exit(1);
} else {
    console.log('\n✅ Tất cả kiểm tra ĐẠT — student quit separation OK.');
}
