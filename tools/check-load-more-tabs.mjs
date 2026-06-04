/**
 * check-load-more-tabs.mjs
 * Phase 4K-5G — Verify Load More buttons for HỌC PHÍ / ĐANG TẬP / BÁO NỢ tabs.
 *
 * Checks:
 *  1. window.loadMoreTransactionsPage defined in main.js
 *  2. window.loadMoreStudentsPage defined in main.js
 *  3. window.loadMoreDebtRows defined in main.js
 *  4. studentsRenderer.js uses loadMoreStudentsPage for active/quit load more
 *  5. studentsRenderer.js uses loadMoreDebtRows for debt load more
 *  6. studentsRenderer.js handles pgStudentsActive + hasNext case for server-side pagination
 *  7. studentsRenderer.js uses window.__debtRenderLimit for debt row cap
 *  8. main.js resets __debtRenderLimit = 50 on debt tab switch
 */
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

function readFile(rel) {
    try { return readFileSync(resolve(ROOT, rel), 'utf8'); } catch { return null; }
}

const results = [];
let allPassed = true;

function check(name, pass, detail) {
    results.push({ name, pass, detail: detail || '' });
    if (!pass) allPassed = false;
}

const mainJs = readFile('js/main.js') || '';
const studRen = readFile('js/ui/render/computation/studentsRenderer.js') || '';

// ── 1. loadMoreTransactionsPage ────────────────────────────────────────────────
check(
    'window.loadMoreTransactionsPage defined',
    mainJs.includes('window.loadMoreTransactionsPage'),
    'main.js: window.loadMoreTransactionsPage = async function()'
);

// ── 2. loadMoreStudentsPage ─────────────────────────────────────────────────
check(
    'window.loadMoreStudentsPage defined',
    mainJs.includes('window.loadMoreStudentsPage'),
    'main.js: window.loadMoreStudentsPage = async function(kind)'
);

// ── 3. loadMoreDebtRows ────────────────────────────────────────────────────
check(
    'window.loadMoreDebtRows defined',
    mainJs.includes('window.loadMoreDebtRows'),
    'main.js: window.loadMoreDebtRows = async function(increment)'
);

// ── 4. studentsRenderer uses loadMoreStudentsPage for active/quit ──────────
check(
    'studentsRenderer uses loadMoreStudentsPage for active',
    studRen.includes("loadMoreStudentsPage") && studRen.includes("'active'"),
    'studentsRenderer.js: _appendLoadMore active → window.loadMoreStudentsPage'
);
check(
    'studentsRenderer uses loadMoreStudentsPage for quit',
    studRen.includes("loadMoreStudentsPage") && studRen.includes("'quit'"),
    'studentsRenderer.js: _appendLoadMore quit → window.loadMoreStudentsPage'
);

// ── 5. studentsRenderer uses loadMoreDebtRows for debt ────────────────────
check(
    'studentsRenderer uses loadMoreDebtRows for debt',
    studRen.includes('loadMoreDebtRows'),
    'studentsRenderer.js: debt load-more → window.loadMoreDebtRows'
);

// ── 6. pgStudentsActive + hasNext case ─────────────────────────────────────
check(
    'studentsRenderer handles pgStudentsActive + hasNext for server-side pagination',
    studRen.includes('pgStudentsActive') && studRen.includes('pgStudents.hasNext'),
    'studentsRenderer.js: else if (pgStudentsActive && pgStudents && pgStudents.hasNext)'
);

// ── 7. __debtRenderLimit used as render cap ────────────────────────────────
check(
    'studentsRenderer uses window.__debtRenderLimit for debt render limit',
    studRen.includes('__debtRenderLimit'),
    'studentsRenderer.js: const _debtLimit = window.__debtRenderLimit || (debtPage * _PAGE_LIMIT)'
);

// ── 8. main.js resets __debtRenderLimit on debt tab switch ────────────────
check(
    'main.js resets __debtRenderLimit = 50 when entering debt tab',
    mainJs.includes("__debtRenderLimit = 50") && mainJs.includes("tabId === 'debt'"),
    "main.js: switchTab override resets window.__debtRenderLimit = 50 for 'debt'"
);

// ── Results ──────────────────────────────────────────────────────────────────
console.log('\n📊 check:load-more-tabs\n');
for (const r of results) {
    const icon = r.pass ? '✅' : '❌';
    console.log(`  ${icon} ${r.name}`);
    if (r.detail) console.log(`       ${r.detail}`);
}
console.log('');
if (allPassed) {
    console.log('✅ All checks passed.\n');
} else {
    console.error('❌ One or more checks failed.\n');
    process.exit(1);
}
