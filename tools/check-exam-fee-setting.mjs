/**
 * tools/check-exam-fee-setting.mjs — Phase 4K-4
 *
 * Kiểm tra static: đảm bảo hệ thống có đầy đủ các thành phần
 * cần thiết cho chức năng tùy chỉnh lệ phí thi đai theo từng CLB.
 *
 * Chạy: npm run check:exam-fee-setting
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

console.log('\n🔍 Phase 4K-4 — Club Exam Fee Setting Check\n');

const mainJs   = readFile('js/main.js');
const appJs    = readFile('app.js');
const indexHtml = readFile('index.html');

check('mainJs readable',   !!mainJs,   'Không tìm thấy js/main.js');
check('appJs readable',    !!appJs,    'Không tìm thấy app.js');
check('indexHtml readable',!!indexHtml,'Không tìm thấy index.html');

if (!mainJs || !appJs || !indexHtml) {
    console.error('\n❌ Cannot continue — required files missing\n');
    process.exit(1);
}

// ── 1. Kiểm tra window.getClubExamFee ──────────────────────────────────────
check(
    'main.js có window.getClubExamFee',
    mainJs.includes('window.getClubExamFee'),
    'Thêm window.getClubExamFee vào _installExamFeeSettingBridges()'
);

// ── 2. Kiểm tra window.saveClubExamFeeSetting ──────────────────────────────
check(
    'main.js có window.saveClubExamFeeSetting',
    mainJs.includes('window.saveClubExamFeeSetting'),
    'Thêm window.saveClubExamFeeSetting vào _installExamFeeSettingBridges()'
);

// ── 3. Kiểm tra window.loadClubExamFeeSetting ─────────────────────────────
check(
    'main.js có window.loadClubExamFeeSetting',
    mainJs.includes('window.loadClubExamFeeSetting'),
    'Thêm window.loadClubExamFeeSetting vào _installExamFeeSettingBridges()'
);

// ── 4. Kiểm tra window.debugExamFeeSetting ────────────────────────────────
check(
    'main.js có window.debugExamFeeSetting',
    mainJs.includes('window.debugExamFeeSetting'),
    'Thêm window.debugExamFeeSetting vào _installExamFeeSettingBridges()'
);

// ── 5. Kiểm tra setClubExamFeeLocal ──────────────────────────────────────
check(
    'main.js có window.setClubExamFeeLocal',
    mainJs.includes('window.setClubExamFeeLocal'),
    'Thêm window.setClubExamFeeLocal vào _installExamFeeSettingBridges()'
);

// ── 6. Kiểm tra refreshExamFeeUI ─────────────────────────────────────────
check(
    'main.js có window.refreshExamFeeUI',
    mainJs.includes('window.refreshExamFeeUI'),
    'Thêm window.refreshExamFeeUI vào _installExamFeeSettingBridges()'
);

// ── 7. Kiểm tra initExamFeeSettingUI ─────────────────────────────────────
check(
    'main.js có window.initExamFeeSettingUI',
    mainJs.includes('window.initExamFeeSettingUI'),
    'Thêm window.initExamFeeSettingUI vào _installExamFeeSettingBridges()'
);

// ── 8. Kiểm tra examFeeInput trong index.html ────────────────────────────
check(
    'index.html có examFeeInput',
    indexHtml.includes('id="examFeeInput"'),
    'Thêm <input id="examFeeInput" ...> vào tab THI ĐAI'
);

// ── 9. Kiểm tra saveExamFeeBtn trong index.html ──────────────────────────
check(
    'index.html có saveExamFeeBtn',
    indexHtml.includes('id="saveExamFeeBtn"'),
    'Thêm <button id="saveExamFeeBtn" ...> vào tab THI ĐAI'
);

// ── 10. Kiểm tra examFeeStatus trong index.html ──────────────────────────
check(
    'index.html có examFeeStatus',
    indexHtml.includes('id="examFeeStatus"'),
    'Thêm <span id="examFeeStatus" ...> vào tab THI ĐAI'
);

// ── 11. Kiểm tra saveClubExamFeeSetting dùng merge:true ──────────────────
check(
    'saveClubExamFeeSetting dùng merge:true',
    mainJs.includes('{ merge: true }'),
    'setDoc(..., { merge: true }) bắt buộc để không ghi đè settings khác'
);

// ── 12. Kiểm tra Firestore path clubs/{id}/settings/general ──────────────
check(
    "saveClubExamFeeSetting lưu vào clubs/.../settings/general",
    mainJs.includes("'clubs', clubId, 'settings', 'general'") ||
    mainJs.includes('"clubs", clubId, "settings", "general"'),
    "Dùng path clubs/{clubId}/settings/general để không xung đột với main_config"
);

// ── 13. Kiểm tra DEFAULT_EXAM_FEE được định nghĩa ───────────────────────
check(
    'main.js định nghĩa DEFAULT_EXAM_FEE = 250000',
    mainJs.includes('DEFAULT_EXAM_FEE = 250000') || mainJs.includes('DEFAULT_EXAM_FEE=250000'),
    'const DEFAULT_EXAM_FEE = 250000; bắt buộc'
);

// ── 14. Kiểm tra app:context-ready listener cho exam fee ─────────────────
check(
    'main.js có app:context-ready listener để load exam fee',
    mainJs.includes('loadClubExamFeeSetting') && mainJs.includes('app:context-ready'),
    'Gọi loadClubExamFeeSetting trong handler app:context-ready'
);

// ── 15. Kiểm tra _installExamFeeSettingBridges được gọi trong bootstrap ──
check(
    'main.js gọi _installExamFeeSettingBridges() trong bootstrap',
    mainJs.includes('_installExamFeeSettingBridges()'),
    'Thêm _installExamFeeSettingBridges() vào hàm bootstrap'
);

// ── 16. Kiểm tra quickCollectExam không còn hard-code 250000 thuần ────────
// Chấp nhận nếu 250000 còn trong fallback expression || (...250000)
const quickCollectExamBlock = (() => {
    const idx = appJs.indexOf('window.quickCollectExam');
    if (idx === -1) return '';
    return appJs.slice(idx, idx + 400);
})();

const hasHardcoded250k = (function() {
    // Lấy dòng có defaultFee
    const line = quickCollectExamBlock.match(/let\s+defaultFee\s*=.*?;/s);
    if (!line) return false;
    const lineStr = line[0];
    // Fail nếu chỉ có || 250000 mà KHÔNG qua getClubExamFee
    const hasGetClubExamFee = lineStr.includes('getClubExamFee');
    const has250k = lineStr.includes('250000');
    // Nếu có 250000 nhưng đã qua getClubExamFee fallback → OK
    if (has250k && hasGetClubExamFee) return false;
    // Nếu có 250000 mà không qua getClubExamFee → FAIL
    if (has250k && !hasGetClubExamFee) return true;
    return false;
})();

check(
    'app.js quickCollectExam dùng getClubExamFee thay vì hard-code 250000',
    !hasHardcoded250k,
    'Đổi || 250000 thành || (window.getClubExamFee ? window.getClubExamFee() : 250000)'
);

// ── 17. Kiểm tra refreshExamFeeUI cập nhật exam_fee_all_actual ───────────
check(
    'refreshExamFeeUI cập nhật exam_fee_all_actual',
    mainJs.includes('exam_fee_all_actual') && mainJs.includes('refreshExamFeeUI'),
    'refreshExamFeeUI phải cập nhật exam_fee_all_actual để legacy processBatchUpgrade đọc đúng'
);

// ── 18. Kiểm tra replay context-ready (GitHub Pages) ────────────────────
check(
    'main.js có replay context-ready cho GitHub Pages',
    mainJs.includes('replay-context-ready') || mainJs.includes('__appContextReadyState'),
    'Cần replay loadClubExamFeeSetting nếu context đã ready trước main.js'
);

// ── 19. Kiểm tra normalizeExamFee ────────────────────────────────────────
check(
    'main.js có hàm normalizeExamFee',
    mainJs.includes('normalizeExamFee'),
    'normalizeExamFee bắt buộc để validate giá trị nhập từ input'
);

// ── 20. Kiểm tra version string đã được cập nhật ────────────────────────
check(
    'index.html version đã cập nhật lên club-exam-fee-setting-fix-20260603',
    indexHtml.includes('club-exam-fee-setting-fix-20260603'),
    "Đổi version string trong index.html thành ?v=club-exam-fee-setting-fix-20260603"
);

// ── Summary ───────────────────────────────────────────────────────────────
console.log('');
if (failures === 0) {
    console.log('\x1b[32m✅ All checks passed (20/20)\x1b[0m\n');
    process.exit(0);
} else {
    console.log(`\x1b[31m❌ ${failures} check(s) failed\x1b[0m\n`);
    process.exit(1);
}
