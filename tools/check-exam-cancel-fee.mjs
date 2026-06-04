/**
 * tools/check-exam-cancel-fee.mjs — Phase 4K-4H
 *
 * Kiểm tra static: đảm bảo hàm hủy lệ phí thi hoạt động đúng,
 * không dùng deleteTx trực tiếp, và UI cập nhật ngay.
 *
 * Chạy: npm run check:exam-cancel-fee
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

console.log('\n🔍 Phase 4K-4H — Exam Cancel Fee Check\n');

const appJs = readFile('app.js');

check('app.js readable', !!appJs, 'Không tìm thấy app.js');

if (!appJs) {
    console.error('\n❌ Cannot continue — required files missing\n');
    process.exit(1);
}

// ── 1. window.cancelExamPayment tồn tại ──────────────────────────────────
check(
    'app.js có window.cancelExamPayment',
    appJs.includes('window.cancelExamPayment'),
    'Thêm window.cancelExamPayment vào app.js (Phase 6)'
);

// ── 2. renderExamList nút Hủy dùng cancelExamPayment ─────────────────────
check(
    'renderExamList nút Hủy gọi cancelExamPayment thay vì deleteTx',
    (function() {
        // Tìm định nghĩa hàm (assignment), không phải reference đầu tiên
        const idx = appJs.indexOf('window.renderExamList = ');
        if (idx === -1) return false;
        // Hàm ngắn (~80 dòng), dùng 10000 chars để bao toàn bộ
        const block = appJs.slice(idx, idx + 10000);
        const hasCancelBtn = block.includes('cancelExamPayment');
        // Kiểm tra không còn deleteTx trong nút Hủy của renderExamList
        const hasOldDeleteTxBtn = block.includes("onclick=\"deleteTx('${isPaid.id}')\"") ||
                                   block.includes("onclick='deleteTx(");
        return hasCancelBtn && !hasOldDeleteTxBtn;
    })(),
    'Đổi onclick="deleteTx(\'${isPaid.id}\')" thành onclick="cancelExamPayment(\'${isPaid.id}\', \'${safeName}\')"'
);

// ── 3. cancelExamPayment xử lý type 'Lệ phí thi' ─────────────────────────
check(
    'cancelExamPayment xử lý tx.type Lệ phí thi bằng deleteDoc',
    (function() {
        const idx = appJs.indexOf('window.cancelExamPayment');
        if (idx === -1) return false;
        const block = appJs.slice(idx, idx + 10000);
        return block.includes("'Lệ phí thi'") && block.includes('deleteDoc');
    })(),
    'cancelExamPayment phải gọi deleteDoc khi type là "Lệ phí thi"'
);

// ── 4. cancelExamPayment xử lý type 'Học phí + Lệ phí thi' ──────────────
check(
    'cancelExamPayment xử lý tx.type Học phí + Lệ phí thi bằng updateDoc',
    (function() {
        const idx = appJs.indexOf('window.cancelExamPayment');
        if (idx === -1) return false;
        const block = appJs.slice(idx, idx + 10000);
        return block.includes("'Học phí + Lệ phí thi'") && block.includes('updateDoc');
    })(),
    'cancelExamPayment phải gọi updateDoc (không xóa học phí) khi type là "Học phí + Lệ phí thi"'
);

// ── 5. cancelExamPayment cập nhật window.__store.transactions ─────────────
check(
    'cancelExamPayment cập nhật window.__store.transactions ngay',
    (function() {
        const idx = appJs.indexOf('window.cancelExamPayment');
        if (idx === -1) return false;
        const block = appJs.slice(idx, idx + 10000);
        return block.includes('window.__store.transactions');
    })(),
    'cancelExamPayment phải cập nhật window.__store.transactions để UI phản ánh ngay'
);

// ── 6. cancelExamPayment gọi renderExamList sau khi hủy ──────────────────
check(
    'cancelExamPayment gọi renderExamList sau khi hủy',
    (function() {
        const idx = appJs.indexOf('window.cancelExamPayment');
        if (idx === -1) return false;
        const block = appJs.slice(idx, idx + 10000);
        return block.includes('renderExamList');
    })(),
    'cancelExamPayment phải gọi window.renderExamList() sau khi hủy để cập nhật UI'
);

// ── 7. window.debugExamCancelState tồn tại ───────────────────────────────
check(
    'app.js có window.debugExamCancelState',
    appJs.includes('window.debugExamCancelState'),
    'Thêm window.debugExamCancelState vào app.js (Phase 10)'
);

// ── Summary ───────────────────────────────────────────────────────────────
console.log('');
const total = 7;
if (failures === 0) {
    console.log(`\x1b[32m✅ All checks passed (${total}/${total})\x1b[0m\n`);
    process.exit(0);
} else {
    console.log(`\x1b[31m❌ ${failures} check(s) failed\x1b[0m\n`);
    process.exit(1);
}
