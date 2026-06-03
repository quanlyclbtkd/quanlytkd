/**
 * check-admission-tuition-package.mjs
 * Phase 4K-4C — Kiểm tra gói học phí nhập học + biên lai chính xác
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

function readFile(rel) {
    try { return readFileSync(resolve(root, rel), 'utf8'); } catch { return null; }
}

let passed = 0, failed = 0;
function check(name, condition, hint = '') {
    if (condition) {
        console.log(`  ✅  ${name}`);
        passed++;
    } else {
        console.error(`  ❌  ${name}`);
        if (hint) console.error(`       → ${hint}`);
        failed++;
    }
}

/** Trích đoạn addNewStudent từ file — dùng chunk lớn để không bỏ sót */
function extractAddNewStudent(src) {
    const start = src.indexOf('window.addNewStudent = async () => {');
    if (start < 0) return '';
    // Lấy 10000 ký tự (đủ bao phủ toàn bộ hàm dài nhất)
    return src.substring(start, start + 10000);
}

console.log('\n📦 Phase 4K-4C — Admission Tuition Package + Receipt Accuracy\n');

const indexHtml  = readFile('index.html');
const appJs      = readFile('app.js');
const studentsJs = readFile('js/modules/students.js');

// Lấy chunk addNewStudent từ app.js (hàm legacy — xuất hiện sau helper code)
const appAddNewStudentIdx = appJs
    ? appJs.indexOf('let _addStudentInProgress = false;\n    window.addNewStudent = async () => {')
    : -1;
const appAddNewChunk = appJs && appAddNewStudentIdx >= 0
    ? appJs.substring(appAddNewStudentIdx, appAddNewStudentIdx + 10000)
    : (appJs ? extractAddNewStudent(appJs) : '');

const stuAddNewChunk = studentsJs ? extractAddNewStudent(studentsJs) : '';

// ── 1. index.html có option 9 Tháng ──────────────────────────────────────
check(
    'index.html — add_package có option value="9" (9 Tháng)',
    indexHtml && indexHtml.includes('<option value="9">9 Tháng</option>'),
    'Thêm <option value="9">9 Tháng</option> vào select#add_package trong index.html'
);

// ── 2. app.js expose window.buildAdmissionTuitionPackage ──────────────────
check(
    'app.js — có window.buildAdmissionTuitionPackage',
    appJs && appJs.includes('window.buildAdmissionTuitionPackage'),
    'Thêm helper window.buildAdmissionTuitionPackage vào app.js'
);

// ── 3. app.js addNewStudent dùng helper, không tự build monthsToRecord thủ công
check(
    'app.js — addNewStudent dùng buildAdmissionTuitionPackage (không inline build)',
    appAddNewChunk && (function() {
        const usesHelper = appAddNewChunk.includes('buildAdmissionTuitionPackage(joinDate');
        // Phải không còn inline build cũ dạng "let monthsToRecord = []"
        const hasOldInline = appAddNewChunk.includes('let monthsToRecord = [];')
            || appAddNewChunk.includes('let startMonth = joinDate.substring(0, 7); let monthsToRecord');
        return usesHelper && !hasOldInline;
    })(),
    'Thay inline monthsToRecord build bằng window.buildAdmissionTuitionPackage(joinDate, packageCount)'
);

// ── 4. js/modules/students.js addNewStudent dùng helper ──────────────────
check(
    'js/modules/students.js — addNewStudent dùng buildAdmissionTuitionPackage (không inline build)',
    stuAddNewChunk && (function() {
        const usesHelper = stuAddNewChunk.includes('buildAdmissionTuitionPackage(joinDate');
        const hasOldInline = stuAddNewChunk.includes('const monthsToRecord = [];')
            || stuAddNewChunk.includes("const startMonth     = joinDate.substring(0, 7);\n            const monthsToRecord = [];");
        return usesHelper && !hasOldInline;
    })(),
    'Thay inline monthsToRecord build bằng window.buildAdmissionTuitionPackage trong students.js'
);

// ── 5. app.js exportReceipt dùng monthsStr / monthsToRecord.join thay vì startMonth ──
check(
    'app.js — addNewStudent exportReceipt dùng tuitionPkg.monthsStr (không dùng startMonth cũ)',
    appAddNewChunk && (function() {
        return appAddNewChunk.includes('tuitionPkg.monthsStr')
            && !appAddNewChunk.includes("exportReceipt(_saveKey, totalPayment, receiptType, joinDate, startMonth,");
    })(),
    'Đổi exportReceipt(..., startMonth, ...) thành exportReceipt(..., tuitionPkg.monthsStr, ...) trong app.js'
);

// ── 6. Breakdown label thể hiện gói nhiều tháng ──────────────────────────
check(
    'app.js — breakdown label dùng tuitionPkg.packageCount/label (không hardcode tháng 1)',
    appAddNewChunk && appAddNewChunk.includes('tuitionPkg.packageCount > 1')
        && !appAddNewChunk.includes("'Học phí tháng ' + startMonth.replace('-', '/')"),
    "Đổi 'Học phí tháng ' + startMonth.replace thành label động theo packageCount"
);

// ── 7. Transaction học phí lưu đủ fields mới ─────────────────────────────
check(
    'app.js — tuition transaction lưu packageMonths, tuitionPackageCount, tuitionStartMonth, tuitionPaidUntil',
    appAddNewChunk && (function() {
        return appAddNewChunk.includes('tuitionPackageCount')
            && appAddNewChunk.includes('tuitionStartMonth')
            && appAddNewChunk.includes('tuitionPaidUntil')
            && appAddNewChunk.includes('packageMonths: monthsToRecord');
    })(),
    'Thêm tuitionPackageCount, tuitionStartMonth, tuitionPaidUntil vào transaction học phí trong addNewStudent'
);

// ── 8. Profile mới lưu tuitionPackageCount, lastAdmissionTuitionStartMonth ─
check(
    'app.js — profile mới lưu tuitionPackageCount, lastAdmissionTuitionStartMonth, lastAdmissionTuitionMonths',
    appJs && appJs.includes('tuitionPackageCount: tuitionPkg.packageCount')
        && appJs.includes('lastAdmissionTuitionStartMonth: startMonth')
        && appJs.includes('lastAdmissionTuitionMonths: monthsToRecord'),
    'Thêm tuitionPackageCount, lastAdmissionTuitionStartMonth, lastAdmissionTuitionMonths vào _newProfileData'
);

// ── 9. exportReceipt hiển thị breakdown khi length > 0 (không phải > 1) ──
check(
    'app.js — exportReceipt hiển thị breakdown khi length > 0 (không chỉ > 1)',
    appJs && appJs.includes('breakdown && breakdown.length > 0 && bdWrap && bdTable')
        && !appJs.includes('breakdown && breakdown.length > 1 && bdWrap && bdTable'),
    "Đổi 'breakdown.length > 1' thành 'breakdown.length > 0' trong exportReceipt function"
);

// ── 10. app.js có debugAdmissionTuitionPackage ────────────────────────────
check(
    'app.js — có window.debugAdmissionTuitionPackage',
    appJs && appJs.includes('window.debugAdmissionTuitionPackage'),
    'Thêm window.debugAdmissionTuitionPackage vào app.js'
);

// ─────────────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(60)}`);
console.log(`Kết quả: ${passed} pass, ${failed} fail\n`);
if (failed > 0) process.exit(1);
