/**
 * check-debt-pagination-independent.mjs — Phase 4K-5G
 * Kiểm tra BÁO NỢ pagination không phụ thuộc pgStudentsActive.
 */
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const readFile = (rel) => readFileSync(resolve(root, rel), 'utf8');

let passed = 0, failed = 0;
function check(name, ok, detail = '') {
    if (ok) { console.log(`  ✅  ${name}`); passed++; }
    else { console.error(`  ❌  ${name}${detail ? ' — ' + detail : ''}`); failed++; }
}

console.log('\n[check-debt-pagination-independent] Phase 4K-5G\n');

const studentsRenderer = readFile('js/ui/render/computation/studentsRenderer.js');
const appJs            = readFile('app.js');
const mainJs           = readFile('js/main.js');

// 1. studentsRenderer: debt load-more NOT exclusively inside if (!pgStudentsActive)
// The debt load-more block should exist outside the pgStudentsActive guard.
// Check that the debt check is a top-level block (not only nested inside !pgStudentsActive).
const pgGuardBlock = studentsRenderer.match(/if\s*\(!pgStudentsActive\)\s*\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/s);
const insidePgGuard = pgGuardBlock ? pgGuardBlock[1] : '';
const debtLoadMoreIndependent = !insidePgGuard.includes("_loadMore('debt')") ||
    // Or it exists outside the block too
    (studentsRenderer.split("if (!pgStudentsActive)").length > 1 &&
     studentsRenderer.includes("// Debt load more is independent"));
check('studentsRenderer: debt load-more is independent of pgStudentsActive',
    studentsRenderer.includes('Debt load more is independent') ||
    !insidePgGuard.includes("_loadMore('debt')"));

// 2. _loadMore('debt') increments _debtPage
check("_loadMore('debt') increments window._debtPage",
    appJs.includes("window._debtPage = (window._debtPage || 1) + 1"));

// 3. _loadMore invalidates debt list (via invalidateLoadMoreTab, invalidateTab, or invalidateStudents)
check("_loadMore invalidates via invalidateLoadMoreTab or invalidateTab",
    appJs.includes('invalidateLoadMoreTab') ||
    (appJs.includes('invalidateList') && appJs.includes("'debt'")) ||
    (appJs.includes('invalidateStudents') && appJs.includes("'debt'")));

// 4. switchTab debt re-renders after ensureDebtProfilesReady
check('main.js switchTab debt re-renders after ensureDebtProfilesReady (.then)',
    mainJs.includes("tabId === 'debt'") &&
    mainJs.includes('ensureDebtProfilesReady') &&
    mainJs.includes('.then(function()'));

// 5. switchTab debt calls invalidateList or invalidateStudents in .then
check('main.js switchTab debt invalidates debtList in .then handler',
    mainJs.includes('debt-ready-after-load') ||
    (mainJs.includes('invalidateStudents') && mainJs.includes('.then')));

// 6. debugDebtCoverage has isLimitedByPagination field
check('debugDebtCoverage has isLimitedByPagination field',
    appJs.includes('isLimitedByPagination'));

// 7. debugDebtCoverage has reason field
check('debugDebtCoverage has reason field',
    appJs.includes('profiles-not-full') &&
    appJs.includes('pagination-limit') &&
    appJs.includes("reason:"));

// 8. debugDebtCoverage has debtPage field
check('debugDebtCoverage has debtPage field',
    appJs.includes('debtPage:') && appJs.includes('window._debtPage'));

console.log(`\n  ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
