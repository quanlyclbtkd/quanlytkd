/**
 * tools/check-exam-payment-identity.mjs — Phase 4K-4H
 *
 * Kiểm tra static: đảm bảo hệ thống nhận đúng tên võ sinh
 * khi thu gộp lệ phí thi (Exam Combo Payment Identity).
 *
 * Chạy: npm run check:exam-payment-identity
 */

import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

function readFile(relPath) {
    const abs = resolve(root, relPath);
    if (!existsSync(abs)) return null;
    return readFileSync(abs, 'utf-8');
}

const PASS = '\x1b[32m✅ PASS\x1b[0m';
const FAIL = '\x1b[31m❌ FAIL\x1b[0m';
let failures = 0;

function check(label, condition, hint) {
    if (condition) {
        console.log(`${PASS}  ${label}`);
    } else {
        console.log(`${FAIL}  ${label}`);
        if (hint) console.log(`       💡 ${hint}`);
        failures++;
    }
}

console.log('\n🔍 Phase 4K-4H — Exam Payment Identity Check\n');

const appJs     = readFile('app.js');
const reportsJs = readFile('js/modules/reports.js');
const financeJs = readFile('js/modules/finance.js');

check('app.js readable',     !!appJs,     'Không tìm thấy app.js');
check('reports.js readable', !!reportsJs, 'Không tìm thấy js/modules/reports.js');
check('financeJs readable',  !!financeJs, 'Không tìm thấy js/modules/finance.js');

if (!appJs || !reportsJs || !financeJs) {
    console.error('\n❌ Cannot continue — required files missing\n');
    process.exit(1);
}

// ── 1. window.extractExamStudentName tồn tại ──────────────────────────────
check(
    'app.js có window.extractExamStudentName',
    appJs.includes('window.extractExamStudentName'),
    'Thêm window.extractExamStudentName vào app.js (Phase 1)'
);

// ── 2. window.getExamTargetBeltFromTx tồn tại ─────────────────────────────
check(
    'app.js có window.getExamTargetBeltFromTx',
    appJs.includes('window.getExamTargetBeltFromTx'),
    'Thêm window.getExamTargetBeltFromTx vào app.js (Phase 1)'
);

// ── 3. processMultiItem lưu studentName ───────────────────────────────────
// Tìm block processMultiItem rộng hơn (hàm dài ~200 dòng)
check(
    'processMultiItem lưu studentName trong giao dịch Lệ phí thi',
    (function() {
        const idx = appJs.indexOf('window.processMultiItem');
        if (idx === -1) return false;
        // Hàm processMultiItem dài, dùng window đủ rộng
        const block = appJs.slice(idx, idx + 50000);
        const endIdx = block.indexOf('};') + idx;
        return block.includes('studentName: name') || block.includes("studentName:name");
    })(),
    'processMultiItem phải lưu studentName: name khi tạo giao dịch Lệ phí thi'
);

// ── 4. processMultiItem lưu profileName ───────────────────────────────────
check(
    'processMultiItem lưu profileName trong giao dịch Lệ phí thi',
    (function() {
        const idx = appJs.indexOf('window.processMultiItem');
        if (idx === -1) return false;
        const block = appJs.slice(idx, idx + 50000);
        return block.includes('profileName: name') || block.includes("profileName:name");
    })(),
    'processMultiItem phải lưu profileName: name khi tạo giao dịch Lệ phí thi'
);

// ── 5. processMultiItem lưu examTargetBelt ────────────────────────────────
check(
    'processMultiItem lưu examTargetBelt trong giao dịch Lệ phí thi',
    (function() {
        const idx = appJs.indexOf('window.processMultiItem');
        if (idx === -1) return false;
        const block = appJs.slice(idx, idx + 50000);
        return block.includes('examTargetBelt');
    })(),
    'processMultiItem phải lưu examTargetBelt khi tạo giao dịch Lệ phí thi'
);

// ── 6. processMultiItem lưu currentBeltAtPayment ──────────────────────────
check(
    'processMultiItem lưu currentBeltAtPayment trong giao dịch Lệ phí thi',
    (function() {
        const idx = appJs.indexOf('window.processMultiItem');
        if (idx === -1) return false;
        const block = appJs.slice(idx, idx + 50000);
        return block.includes('currentBeltAtPayment');
    })(),
    'processMultiItem phải lưu currentBeltAtPayment khi tạo giao dịch Lệ phí thi'
);

// ── 7. quickCollectExam trong app.js lưu studentName ─────────────────────
check(
    'app.js quickCollectExam lưu studentName',
    (function() {
        const idx = appJs.indexOf('window.quickCollectExam');
        if (idx === -1) return false;
        const block = appJs.slice(idx, idx + 5000);
        return block.includes('studentName: name') || block.includes("studentName:name");
    })(),
    'quickCollectExam trong app.js phải lưu studentName: name'
);

// ── 8. quickCollectExam trong app.js lưu examTargetBelt ──────────────────
check(
    'app.js quickCollectExam lưu examTargetBelt',
    (function() {
        const idx = appJs.indexOf('window.quickCollectExam');
        if (idx === -1) return false;
        const block = appJs.slice(idx, idx + 5000);
        return block.includes('examTargetBelt');
    })(),
    'quickCollectExam trong app.js phải lưu examTargetBelt'
);

// ── 9. finance.js quickCollectExam lưu studentName ───────────────────────
check(
    'finance.js quickCollectExam lưu studentName',
    (function() {
        // Tìm định nghĩa hàm (assignment), không phải reference đầu tiên
        const idx = financeJs.indexOf('window.quickCollectExam = async');
        if (idx === -1) return false;
        const block = financeJs.slice(idx, idx + 5000);
        return block.includes('studentName: name') || block.includes("studentName:name");
    })(),
    'quickCollectExam trong finance.js phải lưu studentName: name'
);

// ── 10. exportExamPaidList dùng extractExamStudentName ───────────────────
check(
    'reports.js exportExamPaidList dùng extractExamStudentName',
    reportsJs.includes('extractExamStudentName'),
    'exportExamPaidList phải dùng window.extractExamStudentName để lấy tên võ sinh'
);

// ── 11. exportExamPaidList dùng getExamTargetBeltFromTx ──────────────────
check(
    'reports.js exportExamPaidList dùng getExamTargetBeltFromTx',
    reportsJs.includes('getExamTargetBeltFromTx'),
    'exportExamPaidList phải dùng window.getExamTargetBeltFromTx để lấy đai mục tiêu'
);

// ── 12. exportExamPaidList không còn stuName = t.description.trim() cho combo
check(
    'reports.js exportExamPaidList không còn "stuName = t.description ? t.description.trim()"',
    !reportsJs.includes("stuName    = t.description ? t.description.trim() : \"\";"),
    'Xóa dòng stuName = t.description.trim() cho Học phí + Lệ phí thi — dùng extractExamStudentName'
);

// ── 13. renderExamList dùng extractExamStudentName ────────────────────────
check(
    'app.js renderExamList dùng extractExamStudentName',
    (function() {
        // Tìm định nghĩa hàm (assignment), không phải reference đầu tiên
        const idx = appJs.indexOf('window.renderExamList = ');
        if (idx === -1) return false;
        const block = appJs.slice(idx, idx + 5000);
        return block.includes('extractExamStudentName');
    })(),
    'renderExamList phải dùng extractExamStudentName thay vì parse description thủ công'
);

// ── 14. window.debugExamPaymentIdentity tồn tại ──────────────────────────
check(
    'app.js có window.debugExamPaymentIdentity',
    appJs.includes('window.debugExamPaymentIdentity'),
    'Thêm window.debugExamPaymentIdentity vào app.js (Phase 9)'
);

// ── Summary ───────────────────────────────────────────────────────────────
console.log('');
const total = 14;
if (failures === 0) {
    console.log(`\x1b[32m✅ All checks passed (${total}/${total})\x1b[0m\n`);
    process.exit(0);
} else {
    console.log(`\x1b[31m❌ ${failures} check(s) failed\x1b[0m\n`);
    process.exit(1);
}
