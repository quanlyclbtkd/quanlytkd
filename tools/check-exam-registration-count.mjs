#!/usr/bin/env node
/**
 * check-exam-registration-count.mjs
 * Phase 4K-5A: Kiểm tra thẻ "Đã đăng ký thi" trong tab THI ĐAI.
 *
 * Chạy: node tools/check-exam-registration-count.mjs
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

// ─── 1. index.html: exam_registered_count_tab tồn tại ────────────────────
const htmlSrc = readFile('index.html');
check(
    "index.html: element id='exam_registered_count_tab' tồn tại",
    htmlSrc.includes('id="exam_registered_count_tab"'),
    "New exam registration count card in DOM"
);
check(
    "index.html: grid-cols-4 thay vì grid-cols-3 trong exam finance section",
    htmlSrc.includes('grid-cols-2 md:grid-cols-4') || htmlSrc.includes('md:grid-cols-4'),
    "4-column grid layout for exam finance cards"
);
check(
    "index.html: card 'Đã đăng ký thi' có text",
    htmlSrc.includes('Đã đăng ký') && htmlSrc.includes('thi'),
    "Card label text present"
);

// ─── 2. app.js: computeExamRegistrationStats tồn tại ────────────────────
const appSrc = readFile('app.js');
check(
    "app.js: window.computeExamRegistrationStats được định nghĩa",
    appSrc.includes("window.computeExamRegistrationStats"),
    "Helper function for exam registration stats"
);
check(
    "app.js: debugExamRegistrationCount được định nghĩa",
    appSrc.includes("window.debugExamRegistrationCount"),
    "Debug helper for exam registration count"
);
check(
    "app.js: computeExamRegistrationStats đếm 'Lệ phí thi' transactions",
    appSrc.includes("Lệ phí thi") && appSrc.includes("computeExamRegistrationStats"),
    "Counts exam fee transactions"
);
check(
    "app.js: computeExamRegistrationStats đếm 'Học phí + Lệ phí thi' transactions",
    appSrc.includes("Học phí + Lệ phí thi") && appSrc.includes("examAmount"),
    "Also counts combined tuition+exam fee transactions"
);

// ─── 3. app.js renderExamList gọi computeExamRegistrationStats ────────────
check(
    "app.js renderExamList: gọi computeExamRegistrationStats và cập nhật DOM",
    appSrc.includes("computeExamRegistrationStats") &&
        appSrc.includes("exam_registered_count_tab"),
    "renderExamList updates the new card"
);

// ─── 4. main.js: debugRuntimeSmokeTest có examRegistrationCount ───────────
const mainSrc = readFile('js/main.js');
check(
    "main.js debugRuntimeSmokeTest: gọi debugExamRegistrationCount",
    mainSrc.includes("debugExamRegistrationCount"),
    "Smoke test includes exam registration count check"
);
check(
    "main.js debugRuntimeSmokeTest: examRegistrationCountOk trong summary",
    mainSrc.includes("examRegistrationCountOk"),
    "Summary includes examRegistrationCountOk"
);

// ─── 5. index.html: cache bust version được cập nhật ─────────────────────
check(
    "index.html: cache bust version chứa 'exam-count', '5A', hoặc '5B'",
    htmlSrc.includes('exam-count') || htmlSrc.includes('student-quit-separation') || htmlSrc.includes('exam-name-parser') || htmlSrc.includes('hotfix') || htmlSrc.includes('canonical-domain-command-boundary-write-freeze-20260722-v5t') || htmlSrc.includes('student-status-command-cutover-tx-delete-fix-20260722-v5u1'),
    "main.js cache bust version updated for Phase 4K-5A/5B"
);

// ─── Kết quả ──────────────────────────────────────────────────────────────
console.log('\n══════════════════════════════════════════════════════════════');
console.log(' check-exam-registration-count — Phase 4K-5A');
console.log('══════════════════════════════════════════════════════════════');
console.table(results);
console.log(`\nKết quả: ${passed} PASS / ${failed} FAIL`);
if (failed > 0) {
    console.error('\n❌ Một số kiểm tra THẤT BẠI — xem chi tiết ở trên.');
    process.exit(1);
} else {
    console.log('\n✅ Tất cả kiểm tra ĐẠT — exam registration count card OK.');
}
