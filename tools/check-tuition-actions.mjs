/**
 * tools/check-tuition-actions.mjs — Phase 4K-3
 *
 * Kiểm tra static: đảm bảo financeRenderer.js, finance.events.js, và main.js
 * có đầy đủ các thành phần cần thiết cho Tuition Receipt + Student Profile click.
 *
 * Chạy: npm run check:tuition-actions
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

console.log('\n🔍 Phase 4K-3 — Tuition Action Check\n');

// ── 1. financeRenderer.js — data-action="print-tuition-receipt" ───────────
const finRenderer = readFile('js/ui/render/computation/financeRenderer.js');
check(
    'financeRenderer.js — print button has data-action="print-tuition-receipt"',
    finRenderer && finRenderer.includes('data-action="print-tuition-receipt"'),
    'Thêm data-action="print-tuition-receipt" vào nút In trong renderTxRow()'
);
check(
    'financeRenderer.js — print button has class js-print-tuition-receipt',
    finRenderer && finRenderer.includes('js-print-tuition-receipt'),
    'Thêm class js-print-tuition-receipt vào nút In'
);
check(
    'financeRenderer.js — print button has data-tx-id',
    finRenderer && finRenderer.includes('data-tx-id='),
    'Thêm data-tx-id="${tx.id}" vào nút In'
);
check(
    'financeRenderer.js — print button has data-student-name',
    finRenderer && finRenderer.includes('data-student-name='),
    'Thêm data-student-name="${cleanName}" vào nút In'
);

// ── 2. financeRenderer.js — data-action="open-student-profile" ────────────
check(
    'financeRenderer.js — student name has data-action="open-student-profile"',
    finRenderer && finRenderer.includes('data-action="open-student-profile"'),
    'Thêm data-action="open-student-profile" vào tên võ sinh clickable'
);
check(
    'financeRenderer.js — student name has class js-open-student-profile',
    finRenderer && finRenderer.includes('js-open-student-profile'),
    'Thêm class js-open-student-profile vào tên võ sinh'
);

// ── 3. financeRenderer.js — month badge ───────────────────────────────────
check(
    'financeRenderer.js — month badge column present (formatMonth)',
    finRenderer && finRenderer.includes('formatMonth'),
    'Import formatMonth từ utils/format.js và thêm badge tháng vào row'
);

// ── 4. finance.events.js — bridges ────────────────────────────────────────
const finEvents = readFile('js/events/finance.events.js');
check(
    'finance.events.js — event delegation for print-tuition-receipt',
    finEvents && finEvents.includes('closest(\'[data-action="print-tuition-receipt"]')
                || (finEvents && finEvents.includes("closest('[data-action=\"print-tuition-receipt\"]")),
    'Thêm event delegation closest([data-action="print-tuition-receipt"])'
);
check(
    'finance.events.js — event delegation for open-student-profile',
    finEvents && (
        finEvents.includes('closest(\'[data-action="open-student-profile"]')
        || finEvents.includes("closest('[data-action=\"open-student-profile\"]")
        || finEvents.includes('open-student-profile')
    ),
    'Thêm event delegation closest([data-action="open-student-profile"])'
);
check(
    'finance.events.js — initFinanceActionEvents exported',
    finEvents && finEvents.includes('export function initFinanceActionEvents'),
    'Export initFinanceActionEvents từ finance.events.js'
);
check(
    'finance.events.js — __financeActionEventsMounted guard',
    finEvents && finEvents.includes('__financeActionEventsMounted'),
    'Thêm guard window.__financeActionEventsMounted để tránh double-mount'
);

// ── 5. main.js — bridges ──────────────────────────────────────────────────
const mainJs = readFile('js/main.js');
check(
    'main.js — imports initFinanceActionEvents',
    mainJs && mainJs.includes('initFinanceActionEvents'),
    'Import initFinanceActionEvents từ finance.events.js'
);
check(
    'main.js — window.printTuitionReceiptByTxId bridge',
    mainJs && mainJs.includes('printTuitionReceiptByTxId'),
    'Thêm window.printTuitionReceiptByTxId bridge trong main.js'
);
check(
    'main.js — window.openStudentProfileByName bridge',
    mainJs && mainJs.includes('openStudentProfileByName'),
    'Thêm window.openStudentProfileByName bridge trong main.js'
);
check(
    'main.js — calls initFinanceActionEvents()',
    mainJs && mainJs.includes('initFinanceActionEvents()'),
    'Gọi initFinanceActionEvents() trong bootstrap sau initFinanceEvents()'
);
check(
    'main.js — _findTransactionById searches multiple store sources',
    mainJs && mainJs.includes('_findTransactionById'),
    'Thêm _findTransactionById() tìm tx từ nhiều store source'
);
check(
    'main.js — window.debugTuitionActions helper',
    mainJs && mainJs.includes('debugTuitionActions'),
    'Thêm window.debugTuitionActions() debug helper'
);

// ── 6. index.html — cache bust version ────────────────────────────────────
const indexHtml = readFile('index.html');
check(
    'index.html — main.js version updated (tuition-admission-uniform-size-fix)',
    indexHtml && (
        indexHtml.includes('tuition-admission-uniform-size-fix')
        || indexHtml.includes('tuition-actions-profile-click-fix')
    ),
    'Đổi version main.js?v=... trong index.html để bust cache GitHub Pages'
);

// ── Phase 4K-3B Hardening Checks ───────────────────────────────────────────

// ── 7. printTuitionReceiptByTxId không fallback 0 đồng ───────────────────
check(
    'main.js — printTuitionReceiptByTxId không fallback 0 đồng khi tx không tìm thấy',
    mainJs && (
        // Hardened version phải kiểm tra amount > 0 trước khi fallback
        mainJs.includes('Number(opts.amount) > 0')
        || mainJs.includes('opts.amount > 0')
    ),
    'printTuitionReceiptByTxId() phải yêu cầu amount > 0 trước khi fallback — không in 0 đồng'
);

// ── 8. openStudentProfileByName có normalize Vietnamese fallback ───────────
check(
    'main.js — openStudentProfileByName có normalize fallback tiếng Việt',
    mainJs && mainJs.includes('openStudentProfileByName') && (
        mainJs.includes('normalizeVNForSearch') ||
        (mainJs.includes('NFD') && mainJs.includes('openStudentProfileByName'))
    ),
    'openStudentProfileByName() phải dùng normalize tiếng Việt để tìm đúng profile key'
);

// ── 9. debugTuitionActions có firstPrintDataset ───────────────────────────
check(
    'main.js — debugTuitionActions có firstPrintDataset',
    mainJs && mainJs.includes('firstPrintDataset'),
    'debugTuitionActions() phải bao gồm firstPrintDataset từ nút In đầu tiên trong DOM'
);

// ── 10. debugTuitionActions có sampleTxIds ───────────────────────────────
check(
    'main.js — debugTuitionActions có sampleTxIds',
    mainJs && mainJs.includes('sampleTxIds'),
    'debugTuitionActions() phải bao gồm sampleTxIds từ data-tx-id trong DOM'
);

// ── Summary ────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(60)}`);
if (failures === 0) {
    console.log('\x1b[32m🎉 Tất cả kiểm tra PASSED — Phase 4K-3 + 4K-3B ready\x1b[0m\n');
    process.exit(0);
} else {
    console.log(`\x1b[31m💥 ${failures} kiểm tra FAILED — Cần sửa trước khi deploy\x1b[0m\n`);
    process.exit(1);
}
