/**
 * tools/check-active-new-students-filter.mjs — Phase 4K-6E-C
 *
 * Kiểm tra static: đảm bảo filter võ sinh mới tháng hiện tại được implement đúng
 * trên tab ĐANG TẬP, bao gồm helpers, UI, controller, render, search, và versioning.
 *
 * Chạy: npm run check:active-new-students-filter
 *        hoặc: node tools/check-active-new-students-filter.mjs
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

console.log('\n🔍 Phase 4K-6E-C — Active New Students Filter Check\n');

const monthlyHelpersJs  = readFile('js/utils/monthlyHelpers.js');
const studentsJs        = readFile('js/modules/students.js');
const studentsRendererJs = readFile('js/ui/render/computation/studentsRenderer.js');
const searchRuntimeJs   = readFile('js/modules/searchRuntime.js');
const mainJs            = readFile('js/main.js');
const indexHtml         = readFile('index.html');

check('monthlyHelpers.js readable',    !!monthlyHelpersJs,   'Không tìm thấy js/utils/monthlyHelpers.js');
check('students.js readable',          !!studentsJs,         'Không tìm thấy js/modules/students.js');
check('studentsRenderer.js readable',  !!studentsRendererJs, 'Không tìm thấy js/ui/render/computation/studentsRenderer.js');
check('searchRuntime.js readable',     !!searchRuntimeJs,    'Không tìm thấy js/modules/searchRuntime.js');
check('main.js readable',              !!mainJs,             'Không tìm thấy js/main.js');
check('index.html readable',           !!indexHtml,          'Không tìm thấy index.html');

if (!monthlyHelpersJs || !studentsJs || !studentsRendererJs || !searchRuntimeJs || !mainJs || !indexHtml) {
    console.error('\n❌ Cannot continue — core files missing\n');
    process.exit(1);
}

// ── 1. monthlyHelpers.js: 4 new helpers exported ──────────────────────────
check(
    'monthlyHelpers.js: getCurrentAdmissionMonth exported',
    monthlyHelpersJs.includes('export function getCurrentAdmissionMonth'),
    'Thêm: export function getCurrentAdmissionMonth() trong monthlyHelpers.js'
);
check(
    'monthlyHelpers.js: getStudentJoinMonth exported',
    monthlyHelpersJs.includes('export function getStudentJoinMonth'),
    'Thêm: export function getStudentJoinMonth() trong monthlyHelpers.js'
);
check(
    'monthlyHelpers.js: isCurrentMonthNewStudent exported',
    monthlyHelpersJs.includes('export function isCurrentMonthNewStudent'),
    'Thêm: export function isCurrentMonthNewStudent() trong monthlyHelpers.js'
);
check(
    'monthlyHelpers.js: sortActiveStudentEntries exported',
    monthlyHelpersJs.includes('export function sortActiveStudentEntries'),
    'Thêm: export function sortActiveStudentEntries() trong monthlyHelpers.js'
);

// ── 2. monthlyHelpers.js: 4 helpers registered in initMonthlyHelpers ──────
check(
    'initMonthlyHelpers đăng ký getCurrentAdmissionMonth lên window',
    monthlyHelpersJs.includes('window.getCurrentAdmissionMonth') &&
    monthlyHelpersJs.includes('= getCurrentAdmissionMonth'),
    'Đăng ký window.getCurrentAdmissionMonth = getCurrentAdmissionMonth trong initMonthlyHelpers()'
);
check(
    'initMonthlyHelpers đăng ký sortActiveStudentEntries lên window',
    monthlyHelpersJs.includes('window.sortActiveStudentEntries') &&
    monthlyHelpersJs.includes('= sortActiveStudentEntries'),
    'Đăng ký window.sortActiveStudentEntries = sortActiveStudentEntries trong initMonthlyHelpers()'
);

// ── 3. index.html: filter select + badge injected ─────────────────────────
check(
    'index.html: activeNewStudentFilter select element',
    indexHtml.includes('id="activeNewStudentFilter"'),
    'Thêm <select id="activeNewStudentFilter"> trong tab_active trước nút NHẬP TỪ EXCEL'
);
check(
    'index.html: activeNewStudentCountBadge element',
    indexHtml.includes('id="activeNewStudentCountBadge"'),
    'Thêm <span id="activeNewStudentCountBadge"> kế bên select'
);
check(
    'index.html: activeNewStudentFilterWrap div',
    indexHtml.includes('id="activeNewStudentFilterWrap"'),
    'Bọc select + badge trong div id="activeNewStudentFilterWrap"'
);

// ── 4. students.js: controller globals ────────────────────────────────────
check(
    'students.js: window.__activeStudentNewFilter declared',
    studentsJs.includes('window.__activeStudentNewFilter'),
    'Thêm window.__activeStudentNewFilter = \'all\' trong students.js'
);
check(
    'students.js: shouldShowActiveStudentByNewFilter',
    studentsJs.includes('window.shouldShowActiveStudentByNewFilter'),
    'Thêm window.shouldShowActiveStudentByNewFilter trong students.js'
);
check(
    'students.js: countCurrentMonthNewActiveStudents',
    studentsJs.includes('window.countCurrentMonthNewActiveStudents'),
    'Thêm window.countCurrentMonthNewActiveStudents trong students.js'
);
check(
    'students.js: updateActiveNewStudentCountBadge',
    studentsJs.includes('window.updateActiveNewStudentCountBadge'),
    'Thêm window.updateActiveNewStudentCountBadge trong students.js'
);
check(
    'students.js: bindActiveNewStudentFilterUI',
    studentsJs.includes('window.bindActiveNewStudentFilterUI'),
    'Thêm window.bindActiveNewStudentFilterUI trong students.js'
);
check(
    'students.js: ensureFullProfilesForActiveNewFilter',
    studentsJs.includes('window.ensureFullProfilesForActiveNewFilter'),
    'Thêm window.ensureFullProfilesForActiveNewFilter trong students.js'
);
check(
    'students.js: debugActiveNewStudents',
    studentsJs.includes('window.debugActiveNewStudents'),
    'Thêm window.debugActiveNewStudents trong students.js'
);

// ── 5. students.js: _injectControls dùng _activeFilteredItems ─────────────
check(
    'students.js: _injectControls dùng shouldShowActiveStudentByNewFilter trong remaining calc',
    studentsJs.includes('shouldShowActiveStudentByNewFilter') &&
    studentsJs.includes('_activeFilteredItems'),
    'Cập nhật _injectControls để dùng shouldShowActiveStudentByNewFilter khi tính remaining'
);

// ── 6. students.js: filterStudentItemsForMode active branch ──────────────
check(
    'students.js: filterStudentItemsForMode active branch dùng shouldShowActiveStudentByNewFilter',
    (() => {
        const fnStart = studentsJs.indexOf('function filterStudentItemsForMode');
        if (fnStart < 0) return false;
        const fnBlock = studentsJs.slice(fnStart, fnStart + 1200);
        return fnBlock.includes('shouldShowActiveStudentByNewFilter');
    })(),
    'Cập nhật filterStudentItemsForMode active branch để gọi shouldShowActiveStudentByNewFilter'
);

// ── 7. students.js: bindActiveNewStudentFilterUI called after pagination ──
check(
    'students.js: bindActiveNewStudentFilterUI gọi sau _injectControls() trong _doLoad',
    studentsJs.includes('bindActiveNewStudentFilterUI') &&
    studentsJs.includes('pagination-loaded'),
    'Gọi window.bindActiveNewStudentFilterUI(\'pagination-loaded\') sau _injectControls() trong _doLoad'
);

// ── 8. students.js: sortActiveStudentEntries used in buildStudentsRowsFromPagination ──
check(
    'students.js: buildStudentsRowsFromPagination dùng sortActiveStudentEntries',
    (() => {
        const fnStart = studentsJs.indexOf('function buildStudentsRowsFromPagination');
        if (fnStart < 0) return false;
        const fnBlock = studentsJs.slice(fnStart, fnStart + 800);
        return fnBlock.includes('sortActiveStudentEntries');
    })(),
    'Thêm sort bằng sortActiveStudentEntries trong buildStudentsRowsFromPagination cho mode active'
);

// ── 9. studentsRenderer.js: cache key chứa activeNewFilterKey + admissionMonthKey ──
check(
    'studentsRenderer.js: paramsKey chứa anf: và adm:',
    studentsRendererJs.includes('anf:') && studentsRendererJs.includes('adm:'),
    'Thêm |anf:${activeNewFilterKey}|adm:${admissionMonthKey} vào paramsKey trong studentsRenderer.js'
);

// ── 10. studentsRenderer.js: sort dùng sortActiveStudentEntries ───────────
check(
    'studentsRenderer.js: PASS 1 sort dùng sortActiveStudentEntries',
    studentsRendererJs.includes('sortActiveStudentEntries') &&
    studentsRendererJs.includes('_profileEntriesRaw'),
    'Cập nhật PASS 1 sort để dùng sortActiveStudentEntries trong studentsRenderer.js'
);

// ── 11. studentsRenderer.js: newBadge dùng isCurrentMonthNewStudent ───────
check(
    'studentsRenderer.js: newBadge dùng isCurrentMonthNewStudent (không phải selMonth)',
    studentsRendererJs.includes('isCurrentMonthNewStudent') &&
    !studentsRendererJs.includes('p.createdAt >= selMonth'),
    'Thay thế newBadge logic để dùng isCurrentMonthNewStudent (tháng thực tế) trong studentsRenderer.js'
);

// ── 12. studentsRenderer.js: shouldShowActiveStudentByNewFilter trong passFilter ──
check(
    'studentsRenderer.js: passFilter PASS 1 dùng shouldShowActiveStudentByNewFilter',
    (() => {
        const idx = studentsRendererJs.indexOf('let passFilter = true');
        if (idx < 0) return false;
        const block = studentsRendererJs.slice(idx, idx + 900);
        return block.includes('shouldShowActiveStudentByNewFilter');
    })(),
    'Thêm shouldShowActiveStudentByNewFilter check vào passFilter block trong studentsRenderer.js'
);

// ── 13. main.js: version + switchTab + smokeTest ──────────────────────────
check(
    'main.js: APP_BUILD_VERSION Phase 4K-6E-C hoặc mới hơn',
    mainJs.includes("APP_BUILD_VERSION = '4K-6E-C-active-new-students-filter-20260605'") ||
    mainJs.includes("APP_BUILD_VERSION = '4K-6F-legacy-app-kernel-boundary-20260605'") ||
    mainJs.includes('4K-6F'),
    "Cập nhật APP_BUILD_VERSION = '4K-6E-C-active-new-students-filter-20260605' hoặc mới hơn trong main.js"
);
check(
    'main.js: switchTab gọi bindActiveNewStudentFilterUI cho tab active',
    mainJs.includes('bindActiveNewStudentFilterUI') &&
    mainJs.includes('tab-switch-active'),
    "Thêm bindActiveNewStudentFilterUI call trong switchTab wrapper khi tabId === 'active'"
);
check(
    'main.js: debugRuntimeSmokeTest gọi debugActiveNewStudents',
    mainJs.includes('debugActiveNewStudents'),
    'Thêm safeCall debugActiveNewStudents vào debugRuntimeSmokeTest trong main.js'
);
check(
    'index.html: cache bust Phase 4K-6E-C hoặc mới hơn',
    indexHtml.includes('4K-6E-C-active-new-students-filter-20260605') ||
    indexHtml.includes('4K-6F') ||
    indexHtml.includes('legacy-app-kernel-boundary') ||
    indexHtml.includes('4K-6G') ||
    indexHtml.includes('multiitem-inventory-hydration') ||
    indexHtml.includes('4K-6H') ||
        indexHtml.includes('legacy-render-entrypoint-reduction') ||
        indexHtml.includes('4K-6I') ||
        indexHtml.includes('inline-handler-bridge') ||
        indexHtml.includes('4K-6I-B') ||
        indexHtml.includes('superadmin-quota') ||
        indexHtml.includes('runtime-fallback-fix'),
    "Cập nhật cache bust trong index.html: ?v=4K-6E-C-active-new-students-filter-20260605 hoặc mới hơn"
);

// ── Summary ───────────────────────────────────────────────────────────────
console.log('');
const total = 30;
if (failures === 0) {
    console.log(`\x1b[32m✅ Tất cả ${total} kiểm tra PASS — Phase 4K-6E-C Active New Students Filter OK\x1b[0m\n`);
    process.exit(0);
} else {
    console.log(`\x1b[31m❌ ${failures} / ${total} kiểm tra FAIL\x1b[0m\n`);
    process.exit(1);
}
