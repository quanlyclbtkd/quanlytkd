/**
 * tools/check-debt-search-filter.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Kiểm tra BÁO NỢ (debt) search filter đã được áp dụng đúng.
 *
 * Fail nếu:
 *   1. studentsRenderer.js render debtRows nhưng không nằm trong passFilter/debtPassFilter guard.
 *   2. students.js _bindSearchReset() luôn gọi _doLoad() mà không kiểm tra tab active/quit.
 *   3. students.js searchStatusMsg_students được set text không có guard _showStudentSearchStatus.
 *   4. app.js searchInput.oninput chặn legacy search cho mọi tab (không tab-aware).
 *
 * Chạy: node tools/check-debt-search-filter.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

let passed = 0;
let failed = 0;

function pass(msg) {
    console.log(`  ✅ PASS  ${msg}`);
    passed++;
}

function fail(msg) {
    console.error(`  ❌ FAIL  ${msg}`);
    failed++;
}

function readFile(rel) {
    return readFileSync(resolve(root, rel), 'utf8');
}

console.log('\n📋 check-debt-search-filter\n');

// ─── CHECK 1: studentsRenderer.js — debtRows trong passFilter/debtPassFilter ─────
{
    console.log('CHECK 1 — studentsRenderer.js: debtRows áp dụng passFilter/debtPassFilter');
    const src = readFile('js/ui/render/computation/studentsRenderer.js');

    // Pattern: debtPassFilter hoặc passFilter bao quanh debtRows
    const hasDebtPassFilter = /debtPassFilter/.test(src);
    const renderInsideGuard = /if\s*\(\s*debtPassFilter(?:\s*&&[\s\S]{0,120})?\)[\s\S]{0,1200}debtRows\s*\+=/.test(src);

    if (hasDebtPassFilter && renderInsideGuard) {
        pass('debtRows render nằm trong debtPassFilter guard');
    } else if (!hasDebtPassFilter) {
        fail('Không tìm thấy debtPassFilter — debtRows chưa được guard bằng passFilter');
    } else {
        fail('debtPassFilter tồn tại nhưng debtRows += renderDebtRow không nằm trong guard');
    }
}

// ─── CHECK 2: students.js _bindSearchReset() phải tab-aware ───────────────────
{
    console.log('\nCHECK 2 — students.js: _bindSearchReset() phải kiểm tra tab trước _doLoad()');
    const src = readFile('js/modules/students.js');

    // Phải có _getCurrentTabIdSafe
    const hasHelper = /_getCurrentTabIdSafe/.test(src);

    // _doLoad() không được gọi trực tiếp mà không check tab
    // Pattern an toàn: trong setTimeout, phải có kiểm tra tab trước khi gọi _doLoad
    const hasTabCheckBeforeDoLoad = /tab\s*===\s*['"]active['"]\s*\|\|\s*tab\s*===\s*['"]quit['"][\s\S]{0,200}_doLoad/.test(src);

    if (hasHelper) {
        pass('_getCurrentTabIdSafe() helper tồn tại trong students.js');
    } else {
        fail('Thiếu _getCurrentTabIdSafe() trong students.js');
    }

    if (hasTabCheckBeforeDoLoad) {
        pass('_doLoad() chỉ được gọi sau khi kiểm tra tab active/quit');
    } else {
        fail('_bindSearchReset() không kiểm tra tab trước khi gọi _doLoad()');
    }
}

// ─── CHECK 3: students.js searchStatusMsg_students phải có guard tab ──────────
{
    console.log('\nCHECK 3 — students.js: searchStatusMsg_students phải có _showStudentSearchStatus guard');
    const src = readFile('js/modules/students.js');

    const hasShowGuardVar = /_showStudentSearchStatus/.test(src);

    // Không được có _srEl.textContent = 'Tìm thấy' mà không có _showStudentSearchStatus guard
    // Kiểm tra bằng cách tìm pattern: _srEl && _showStudentSearchStatus trước Tìm thấy
    const guardedStatusSet = /if\s*\(\s*_srEl\s*&&\s*_showStudentSearchStatus\s*\)/.test(src);

    // Không có unguarded: if (_srEl) { _srEl.textContent = 'Tìm thấy' hay 'Đang tìm...'
    // (phải không có pattern: if (_srEl) {?\s*_srEl.textContent = 'Tìm thấy')
    const hasUnguardedTìmThấy = /if\s*\(\s*_srEl\s*\)\s*\{?\s*_srEl\.textContent\s*=\s*['"](Tìm thấy|Đang tìm)/.test(src);

    if (hasShowGuardVar) {
        pass('_showStudentSearchStatus variable tồn tại');
    } else {
        fail('Thiếu _showStudentSearchStatus guard trong _doLoad()');
    }

    if (guardedStatusSet) {
        pass('searchStatusMsg_students được set text có guard _showStudentSearchStatus');
    } else {
        fail('Không tìm thấy: if (_srEl && _showStudentSearchStatus)');
    }

    if (!hasUnguardedTìmThấy) {
        pass('Không còn unguarded searchStatusMsg set text');
    } else {
        fail('Vẫn còn unguarded: if (_srEl) _srEl.textContent = "Tìm thấy..." / "Đang tìm..."');
    }
}

// ─── CHECK 4: app.js searchInput.oninput phải tab-aware ───────────────────────
{
    console.log('\nCHECK 4 — app.js: searchInput.oninput phải chỉ chặn legacy ở student tabs');
    const src = readFile('app.js');

    // Phải có tab check trước return
    const hasTabCheck = /const\s+_studentTabs\s*=\s*_curTab\s*===\s*['"]active['"]\s*\|\|/.test(src);

    // Phải có _studentTabs trong if block dẫn đến return
    // Cho phép multiline condition (3 dòng điều kiện)
    const hasStudentTabsGuard = /if\s*\(\s*[\s\S]{0,400}_studentTabs[\s\S]{0,400}return\s*;/.test(src);

    // KHÔNG được có: if (window.__studentSearchControllerMounted ... return; tanpa tab check
    // Tức là không có pattern cũ: mount && !failed) return; ngay lập tức mà không check _studentTabs
    const hasOldDirectReturn = /if\s*\(\s*window\.__studentSearchControllerMounted\s*&&\s*!window\.__studentSearchControllerFailed\s*\)\s*return\s*;/.test(src);

    if (hasTabCheck) {
        pass('app.js có _studentTabs check trong oninput handler');
    } else {
        fail('app.js thiếu _studentTabs check — oninput chặn cho mọi tab');
    }

    if (hasStudentTabsGuard) {
        pass('Legacy search guard chỉ kích hoạt khi _studentTabs === true');
    } else {
        fail('Không tìm thấy if (_studentTabs && ...) return; trong searchInput.oninput');
    }

    if (!hasOldDirectReturn) {
        pass('Không còn pattern cũ: if (mounted && !failed) return; không có tab check');
    } else {
        fail('Vẫn còn pattern cũ chặn toàn bộ tab: if (window.__studentSearchControllerMounted && !window.__studentSearchControllerFailed) return;');
    }
}

// ─── CHECK 5 (bonus): listComputationRefresh.js không lowercase sớm ──────────
{
    console.log('\nCHECK 5 — listComputationRefresh.js: _getSearch() không toLowerCase()');
    const src = readFile('js/ui/render/listComputationRefresh.js');

    const hasLowerCase = /function\s+_getSearch[\s\S]{0,200}\.toLowerCase\(\)/.test(src);

    if (!hasLowerCase) {
        pass('_getSearch() không còn toLowerCase() — giữ raw search value');
    } else {
        fail('_getSearch() vẫn còn .toLowerCase() — sẽ làm hỏng document ID fallback');
    }
}

// ─── Kết quả ──────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(60)}`);
console.log(`Kết quả: ${passed} pass / ${failed} fail\n`);

if (failed > 0) {
    console.error(`❌ ${failed} kiểm tra THẤT BẠI — xem chi tiết bên trên.\n`);
    process.exit(1);
} else {
    console.log(`✅ Tất cả ${passed} kiểm tra ĐẠT — BÁO NỢ search filter đã được sửa đúng.\n`);
    process.exit(0);
}
