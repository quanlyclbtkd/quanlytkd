#!/usr/bin/env node
/**
 * check-per-tab-load-more.mjs
 * Phase 4K-5G — Kiểm tra Load More cho từng tab:
 *   1. window.renderLoadMoreRow global helper (students.js)
 *   2. window.loadMoreTuitionTransactions (finance.js) → gọi _pgNext_transactions
 *   3. window.loadMoreActiveStudents (students.js) → gọi _pgNext_students
 *   4. window.loadMoreDebtRows (students.js) → tăng __debtRenderLimit + re-render
 *   5. window.__debtRenderLimit initialized (students.js)
 *   6. window.ensureDebtProfilesReady (students.js)
 *   7. studentsRenderer.js dùng window.__debtRenderLimit cho _debtLimit
 *   8. debugListPaginationCoverage (students.js)
 *   9. debugRuntimeSmokeTest tham chiếu listPaginationCoverage và examExportReadiness
 */
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

let passed = 0, failed = 0, warned = 0;

function check(label, condition, fix, isWarn = false) {
    if (condition) {
        console.log(`  ✅ ${label}`);
        passed++;
    } else if (isWarn) {
        console.warn(`  ⚠️  ${label}`);
        if (fix) console.warn(`     → ${fix}`);
        warned++;
    } else {
        console.error(`  ❌ ${label}`);
        if (fix) console.error(`     → ${fix}`);
        failed++;
    }
}

function readFile(rel) {
    const p = resolve(ROOT, rel);
    if (!existsSync(p)) return null;
    return readFileSync(p, 'utf8');
}

const studentsJs = readFile('js/modules/students.js') || '';
const financeJs  = readFile('js/modules/finance.js')  || '';
const rendererJs = readFile('js/ui/render/computation/studentsRenderer.js') || '';
const mainJs     = readFile('js/main.js') || '';

console.log('\n▸ Section 1: students.js — renderLoadMoreRow global');
check('window.renderLoadMoreRow defined',
    studentsJs.includes('window.renderLoadMoreRow'),
    'Thêm window.renderLoadMoreRow vào js/modules/students.js');

console.log('\n▸ Section 2: finance.js — loadMoreTuitionTransactions');
check('window.loadMoreTuitionTransactions defined',
    financeJs.includes('window.loadMoreTuitionTransactions'),
    'Thêm window.loadMoreTuitionTransactions vào js/modules/finance.js');
check('loadMoreTuitionTransactions gọi _pgNext_transactions',
    financeJs.includes('_pgNext_transactions') && financeJs.includes('loadMoreTuitionTransactions'),
    'loadMoreTuitionTransactions phải gọi window._pgNext_transactions()');
check('window.loadNextTransactionsPage alias',
    financeJs.includes('window.loadNextTransactionsPage'),
    'Thêm window.loadNextTransactionsPage = window.loadMoreTuitionTransactions', true);

console.log('\n▸ Section 3: students.js — loadMoreActiveStudents');
check('window.loadMoreActiveStudents defined',
    studentsJs.includes('window.loadMoreActiveStudents'),
    'Thêm window.loadMoreActiveStudents vào js/modules/students.js');
check('loadMoreActiveStudents gọi _pgNext_students',
    studentsJs.includes('_pgNext_students') && studentsJs.includes('loadMoreActiveStudents'),
    'loadMoreActiveStudents phải gọi window._pgNext_students()');

console.log('\n▸ Section 4: students.js — loadMoreDebtRows và __debtRenderLimit');
check('window.__debtRenderLimit initialized',
    studentsJs.includes('window.__debtRenderLimit'),
    'Thêm window.__debtRenderLimit = 50 vào js/modules/students.js');
check('window.loadMoreDebtRows defined',
    studentsJs.includes('window.loadMoreDebtRows'),
    'Thêm window.loadMoreDebtRows vào js/modules/students.js');
check('loadMoreDebtRows tăng __debtRenderLimit',
    /loadMoreDebtRows[\s\S]*?__debtRenderLimit/.test(studentsJs),
    'loadMoreDebtRows phải tăng window.__debtRenderLimit');
check('window.ensureDebtProfilesReady defined',
    studentsJs.includes('window.ensureDebtProfilesReady'),
    'Thêm window.ensureDebtProfilesReady vào js/modules/students.js');

console.log('\n▸ Section 5: studentsRenderer.js — _debtLimit dùng window.__debtRenderLimit');
check('studentsRenderer dùng window.__debtRenderLimit cho _debtLimit',
    rendererJs.includes('window.__debtRenderLimit'),
    'Đổi `const _debtLimit = debtPage * _PAGE_LIMIT` thành `const _debtLimit = window.__debtRenderLimit || debtPage * _PAGE_LIMIT`');

console.log('\n▸ Section 6: students.js — debugListPaginationCoverage');
check('window.debugListPaginationCoverage defined',
    studentsJs.includes('window.debugListPaginationCoverage'),
    'Thêm window.debugListPaginationCoverage vào js/modules/students.js');

console.log('\n▸ Section 7: main.js — debugRuntimeSmokeTest tham chiếu mới');
check('debugRuntimeSmokeTest tham chiếu listPaginationCoverage',
    mainJs.includes('listPaginationCoverage') && mainJs.includes('debugListPaginationCoverage'),
    'Thêm safeCall cho debugListPaginationCoverage vào window.debugRuntimeSmokeTest');
check('debugRuntimeSmokeTest tham chiếu examExportReadiness',
    mainJs.includes('examExportReadiness') && mainJs.includes('debugExamExportReadiness'),
    'Thêm safeCall cho debugExamExportReadiness vào window.debugRuntimeSmokeTest');

console.log(`\n══════════════════════════════════════════════`);
console.log(`Kết quả: ${passed} ✅  ${warned} ⚠️   ${failed} ❌`);
if (failed > 0) {
    console.error('❌ check:per-tab-load-more FAILED');
    process.exit(1);
}
console.log('✅ check:per-tab-load-more PASSED');
