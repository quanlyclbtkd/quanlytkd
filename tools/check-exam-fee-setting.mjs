/**
 * tools/check-exam-fee-setting.mjs — Phase 4K-4B
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

console.log('\n🔍 Phase 4K-4B — Club Exam Fee Setting Check\n');

const mainJs    = readFile('js/main.js');
const appJs     = readFile('app.js');
const financeJs = readFile('js/modules/finance.js');
const indexHtml = readFile('index.html');

check('mainJs readable',    !!mainJs,    'Không tìm thấy js/main.js');
check('appJs readable',     !!appJs,     'Không tìm thấy app.js');
check('financeJs readable', !!financeJs, 'Không tìm thấy js/modules/finance.js');
check('indexHtml readable', !!indexHtml, 'Không tìm thấy index.html');

if (!mainJs || !appJs || !financeJs || !indexHtml) {
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

// ── 16. Kiểm tra quickCollectExam không còn hard-code 250000 thuần (app.js) ──
const quickCollectExamBlockApp = (() => {
    const idx = appJs.indexOf('window.quickCollectExam');
    if (idx === -1) return '';
    return appJs.slice(idx, idx + 400);
})();

const hasHardcoded250kApp = (function() {
    const line = quickCollectExamBlockApp.match(/let\s+defaultFee\s*=.*?;/s);
    if (!line) return false;
    const lineStr = line[0];
    const hasGetClubExamFee = lineStr.includes('getClubExamFee');
    const has250k = lineStr.includes('250000');
    if (has250k && hasGetClubExamFee) return false;
    if (has250k && !hasGetClubExamFee) return true;
    return false;
})();

check(
    'app.js quickCollectExam dùng getClubExamFee thay vì hard-code 250000',
    !hasHardcoded250kApp,
    'Đổi || 250000 thành || (window.getClubExamFee ? window.getClubExamFee() : 250000)'
);

// ── 17. Kiểm tra refreshExamFeeUI cập nhật exam_fee_all_actual ───────────
check(
    'refreshExamFeeUI cập nhật exam_fee_all_actual',
    mainJs.includes('exam_fee_all_actual') && mainJs.includes('refreshExamFeeUI'),
    'refreshExamFeeUI phải cập nhật exam_fee_all_actual cho luồng thu lệ phí thi riêng biệt'
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

// ── 20. Kiểm tra version string đã được cập nhật (Phase 4K-4B hoặc mới hơn) ──
check(
    'index.html version đã cập nhật lên github-runtime-pilot-gate-examfee-hardening-20260603',
    indexHtml.includes('github-runtime-pilot-gate-examfee-hardening-20260603')
        || indexHtml.includes('admission-tuition-package-receipt-fix')
        || indexHtml.includes('examfee-hardening')
        || indexHtml.includes('runtime-month-admission-hydration')
        || indexHtml.includes('deploy-gate-tuition-package-coverage')
        || indexHtml.includes('exam-fee-save-vnd-dashboard-history-fix')
        || indexHtml.includes('vnd-dashboard-history-fix')
        || indexHtml.includes('exam-upgrade-finance-separation'),
    "Đổi version string trong index.html thành ?v=github-runtime-pilot-gate-examfee-hardening-20260603 hoặc mới hơn"
);

// ═══════════════════════════════════════════════════════════════════
// Phase 4K-4B — New hardening checks
// ═══════════════════════════════════════════════════════════════════

// ── 21. finance.js quickCollectExam không còn pattern feeEl.value || 250000 ─
const financeQuickCollectBlock = (() => {
    // Search for the actual function definition, not the comment/migration-map
    const idx = financeJs.indexOf('window.quickCollectExam =');
    if (idx === -1) {
        // Fallback: last occurrence of quickCollectExam
        const last = financeJs.lastIndexOf('quickCollectExam');
        if (last === -1) return '';
        return financeJs.slice(last, last + 600);
    }
    return financeJs.slice(idx, idx + 600);
})();

check(
    'finance.js quickCollectExam không còn pattern bare "feeEl.value || 250000"',
    !financeQuickCollectBlock.includes('feeEl.value || 250000') &&
    !financeQuickCollectBlock.includes("feeEl.value || '250000'") &&
    !financeQuickCollectBlock.includes('feeEl.value || "250000"'),
    'Đổi feeEl.value || 250000 thành feeEl && feeEl.value ? feeEl.value : (window.getClubExamFee ? window.getClubExamFee() : DEFAULT_EXAM_FEE)'
);

// ── 22. finance.js quickCollectExam phải gọi getClubExamFee ──────────────
check(
    'finance.js quickCollectExam dùng getClubExamFee làm fallback',
    financeQuickCollectBlock.includes('getClubExamFee'),
    'Thêm window.getClubExamFee fallback vào defaultFee trong quickCollectExam của finance.js'
);

// ── 23. Không có count * 250000 trong app.js hoặc finance.js ─────────────
check(
    'Không có "count * 250000" hoặc tương tự trong app.js',
    !appJs.includes('* 250000') && !appJs.includes('*250000'),
    'Xóa pattern count * 250000 trong app.js — dùng getClubExamFee() thay thế'
);

check(
    'Không có "count * 250000" hoặc tương tự trong finance.js',
    !financeJs.includes('* 250000') && !financeJs.includes('*250000'),
    'Xóa pattern count * 250000 trong finance.js — dùng getClubExamFee() thay thế'
);

// ── 24. Logout/context-ready reset exam fee ───────────────────────────────
check(
    'main.js có xử lý reset examFee khi logout hoặc context-ready',
    (mainJs.includes('logout') || mainJs.includes('signOut')) &&
    mainJs.includes('loadClubExamFeeSetting'),
    'Thêm loadClubExamFeeSetting khi logout/context-ready để tránh dùng nhầm phí CLB khác'
);

// ── Summary ───────────────────────────────────────────────────────────────
console.log('');
const total = 24;
if (failures === 0) {
    console.log(`\x1b[32m✅ All checks passed (${total}/${total})\x1b[0m\n`);
    process.exit(0);
} else {
    console.log(`\x1b[31m❌ ${failures} check(s) failed\x1b[0m\n`);
    process.exit(1);
}
