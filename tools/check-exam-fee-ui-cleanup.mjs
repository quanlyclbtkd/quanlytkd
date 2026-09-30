/**
 * tools/check-exam-fee-ui-cleanup.mjs — Phase 4K-4H
 *
 * Kiểm tra static: đảm bảo UI lệ phí thi chỉ còn 1 ô nhập,
 * exam_fee_all_actual vẫn tồn tại, và refreshExamFeeUI sync đúng.
 *
 * Chạy: npm run check:exam-fee-ui-cleanup
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

console.log('\n🔍 Phase 4K-4H — Exam Fee UI Cleanup Check\n');

const indexHtml = readFile('index.html');
const mainJs    = readFile('js/main.js');
const appJs     = readFile('app.js');
const financeJs = readFile('js/modules/finance.js');

check('index.html readable', !!indexHtml, 'Không tìm thấy index.html');
check('main.js readable',    !!mainJs,    'Không tìm thấy js/main.js');
check('app.js readable',     !!appJs,     'Không tìm thấy app.js');

if (!indexHtml || !mainJs || !appJs) {
    console.error('\n❌ Cannot continue — required files missing\n');
    process.exit(1);
}

// ── 1. exam_fee_all_display bị ẩn (display:none) ─────────────────────────
check(
    'index.html exam_fee_all_display có style display:none',
    (function() {
        const m = indexHtml.match(/id="exam_fee_all_display"[^>]*/);
        if (!m) return false;
        return m[0].includes('display:none') || m[0].includes('display: none');
    })(),
    'Thêm style="display:none" vào input#exam_fee_all_display (Phase 8)'
);

// ── 2. exam_fee_all_actual vẫn tồn tại ───────────────────────────────────
check(
    'index.html có exam_fee_all_actual (hidden input)',
    indexHtml.includes('id="exam_fee_all_actual"'),
    'exam_fee_all_actual phải tồn tại để legacy code đọc được'
);

// ── 3. saveExamFeeBtn vẫn tồn tại ────────────────────────────────────────
check(
    'index.html có saveExamFeeBtn',
    indexHtml.includes('id="saveExamFeeBtn"'),
    'saveExamFeeBtn phải tồn tại để lưu phí theo CLB'
);

// ── 4. examFeeInput vẫn tồn tại ──────────────────────────────────────────
check(
    'index.html có examFeeInput (ô nhập chính)',
    indexHtml.includes('id="examFeeInput"'),
    'examFeeInput phải tồn tại làm ô nhập lệ phí duy nhất'
);

// ── 5. Không đồng thời hiển thị exam_fee_all_display và examFeeInput ──────
check(
    'Không đồng thời hiển thị exam_fee_all_display và examFeeInput',
    (function() {
        // exam_fee_all_display phải bị ẩn nếu examFeeInput hiện
        const mDisplay = indexHtml.match(/id="exam_fee_all_display"[^>]*/);
        if (!mDisplay) return true; // không có element thì ok
        return mDisplay[0].includes('display:none') || mDisplay[0].includes('display: none');
    })(),
    'exam_fee_all_display phải có display:none — chỉ dùng examFeeInput làm ô chính'
);

// ── 6. Có note "lưu riêng cho từng CLB" ─────────────────────────────────
check(
    'index.html có ghi chú "lưu riêng cho từng CLB"',
    indexHtml.includes('lưu riêng cho từng CLB') || indexHtml.includes('riêng cho từng CLB'),
    'Thêm note "Lệ phí này được lưu riêng cho từng CLB." vào UI (Phase 8)'
);

// ── 7. refreshExamFeeUI sync exam_fee_all_actual ─────────────────────────
check(
    'main.js refreshExamFeeUI sync exam_fee_all_actual',
    mainJs.includes('refreshExamFeeUI') && mainJs.includes('exam_fee_all_actual'),
    'refreshExamFeeUI phải cập nhật exam_fee_all_actual để legacy code đọc đúng'
);

// ── 8. quickCollectExam/processBatchUpgrade dùng getClubExamFee hoặc exam_fee_all_actual
check(
    'app.js quickCollectExam dùng getClubExamFee hoặc exam_fee_all_actual',
    (function() {
        const idx = appJs.indexOf('window.quickCollectExam');
        if (idx === -1) return false;
        const block = appJs.slice(idx, idx + 500);
        return block.includes('getClubExamFee') || block.includes('exam_fee_all_actual');
    })(),
    'quickCollectExam phải dùng getClubExamFee() hoặc exam_fee_all_actual làm default fee'
);

// ── Summary ───────────────────────────────────────────────────────────────
console.log('');
const total = 8;
if (failures === 0) {
    console.log(`\x1b[32m✅ All checks passed (${total}/${total})\x1b[0m\n`);
    process.exit(0);
} else {
    console.log(`\x1b[31m❌ ${failures} check(s) failed\x1b[0m\n`);
    process.exit(1);
}
