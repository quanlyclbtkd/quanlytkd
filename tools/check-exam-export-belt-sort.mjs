/**
 * tools/check-exam-export-belt-sort.mjs — Phase 4K-6E-B
 *
 * Kiểm tra static: đảm bảo js/modules/reports.js có belt-order sort
 * cho exportExamPaidList / buildSheet, và main.js có các marker cần thiết.
 *
 * Chạy: npm run check:exam-export-belt-sort
 *        hoặc: node tools/check-exam-export-belt-sort.mjs
 */

import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root      = resolve(__dirname, '..');

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

console.log('\n🔍 Phase 4K-6E-B — Exam Export Belt Sort Check\n');

const reportsJs = readFile('js/modules/reports.js');
const mainJs    = readFile('js/main.js');
const indexHtml = readFile('index.html');

check('reports.js readable', !!reportsJs, 'Không tìm thấy js/modules/reports.js');
check('main.js readable',    !!mainJs,    'Không tìm thấy js/main.js');

if (!reportsJs || !mainJs) {
    console.error('\n❌ Cannot continue — core files missing\n');
    process.exit(1);
}

// ── 1. Không còn Object.keys(subset).sort() trong buildSheet ───────────────
// Phải không còn pattern: Object.keys(subset).sort() bên trong hàm buildSheet
// Ta kiểm tra toàn bộ file — nếu vẫn còn dòng đó ở vùng buildSheet thì fail
const buildSheetBlock = (() => {
    const start = reportsJs.indexOf('const buildSheet');
    if (start < 0) return '';
    return reportsJs.slice(start, start + 3000);
})();

check(
    'buildSheet không còn Object.keys(subset).sort()',
    !buildSheetBlock.includes('Object.keys(subset).sort()'),
    'Xóa Object.keys(subset).sort() trong buildSheet, thay bằng sortExamExportEntries'
);

// ── 2. Có EXAM_EXPORT_BELT_ORDER ───────────────────────────────────────────
check(
    'reports.js có EXAM_EXPORT_BELT_ORDER',
    reportsJs.includes('EXAM_EXPORT_BELT_ORDER'),
    'Thêm const EXAM_EXPORT_BELT_ORDER = [...] vào js/modules/reports.js'
);

// ── 3. Có getExamExportBeltRank ────────────────────────────────────────────
check(
    'reports.js có getExamExportBeltRank',
    reportsJs.includes('getExamExportBeltRank'),
    'Thêm const getExamExportBeltRank = function(belt) {...} vào js/modules/reports.js'
);

// ── 4. Có alias/fallback cho Cấp X ────────────────────────────────────────
check(
    'getExamExportBeltRank có alias fallback cho cap X',
    reportsJs.includes('cap\\s*') || reportsJs.includes("cap\\\\s*") || reportsJs.includes('/cap\\s*(\\d+)/i'),
    'Thêm regex fallback /cap\\s*(\\d+)/i vào getExamExportBeltRank'
);

// ── 5. Có sortExamExportEntries ───────────────────────────────────────────
check(
    'reports.js có sortExamExportEntries',
    reportsJs.includes('sortExamExportEntries'),
    'Thêm const sortExamExportEntries = function(entries) {...} vào js/modules/reports.js'
);

// ── 6. buildSheet dùng sortExamExportEntries ──────────────────────────────
check(
    'buildSheet gọi sortExamExportEntries',
    buildSheetBlock.includes('sortExamExportEntries'),
    'Thay Object.keys(subset).sort() bằng sortExamExportEntries trong buildSheet'
);

// ── 7. Sort đọc profile.belt hoặc currentBelt ─────────────────────────────
check(
    'sortExamExportEntries đọc profile.belt hoặc currentBelt',
    reportsJs.includes('pA.belt') || reportsJs.includes('currentBeltA'),
    'sortExamExportEntries phải đọc currentBelt || belt || pA.belt'
);

// ── 8. Sort xét targetBelt ───────────────────────────────────────────────
check(
    'sortExamExportEntries xét targetBelt',
    reportsJs.includes('targetBeltA') || reportsJs.includes('targetBelt ||'),
    'sortExamExportEntries phải so sánh targetBelt (getExamExportBeltRank(targetBeltA))'
);

// ── 9. Sort xét branch ──────────────────────────────────────────────────
check(
    'sortExamExportEntries xét branch',
    reportsJs.includes('branchA') && reportsJs.includes('localeCompare'),
    'sortExamExportEntries phải so sánh branch: branchA.localeCompare(branchB)'
);

// ── 10. Có debugExamExportSortPreview ─────────────────────────────────────
check(
    'reports.js có debugExamExportSortPreview',
    reportsJs.includes('debugExamExportSortPreview'),
    'Thêm window.debugExamExportSortPreview = function() {...} vào js/modules/reports.js'
);

// ── 11. debugRuntimeSmokeTest include debugExamExportSortPreview ──────────
check(
    'debugRuntimeSmokeTest references debugExamExportSortPreview',
    mainJs.includes('debugExamExportSortPreview'),
    'Thêm safeCall debugExamExportSortPreview vào window.debugRuntimeSmokeTest trong js/main.js'
);

// ── 12. index.html có cache bust Phase 4K-6E-B ────────────────────────────
check(
    'index.html cache bust có 4K-6E-B hoặc mới hơn',
    !indexHtml || indexHtml.includes('4K-6E-B') || indexHtml.includes('4K-6E-C') ||
    indexHtml.includes('4K-6F') || indexHtml.includes('legacy-app-kernel-boundary') ||
    indexHtml.includes('4K-6G') || indexHtml.includes('multiitem-inventory-hydration') ||
    indexHtml.includes('4K-6H') || indexHtml.includes('legacy-render-entrypoint-reduction') || indexHtml.includes('4K-6I') || indexHtml.includes('inline-handler-bridge'),
    'Cập nhật ?v= trong index.html sang 4K-6E-B-exam-export-belt-sort-20260605 hoặc mới hơn'
);

// ── 13. APP_BUILD_VERSION có Phase 4K-6E-B ───────────────────────────────
check(
    'main.js APP_BUILD_VERSION có 4K-6E-B',
    mainJs.includes('4K-6E-B'),
    "Cập nhật window.APP_BUILD_VERSION = '4K-6E-B-exam-export-belt-sort-20260605' trong js/main.js"
);

// ── Summary ───────────────────────────────────────────────────────────────
console.log('');
const total = 13;
if (failures === 0) {
    console.log(`\x1b[32m✅ All checks passed (${total}/${total})\x1b[0m\n`);
    process.exit(0);
} else {
    console.log(`\x1b[31m❌ ${failures} check(s) failed\x1b[0m\n`);
    process.exit(1);
}
