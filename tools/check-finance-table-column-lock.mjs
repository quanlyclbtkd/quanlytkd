/**
 * check-finance-table-column-lock.mjs
 * Phase 4K-5G — Verify finance TX table hard column layout + full date display.
 *
 * Checks:
 *  1. .finance-tx-table uses table-layout: fixed
 *  2. .tx-date-cell / .tx-col-date width >= 100px in CSS (fits dd/MM/yyyy full date)
 *  3. _formatDateCompactB and _formatDateCompact no longer truncate to dd/MM
 *  4. THAO TÁC column (.tx-actions-cell / .tx-col-actions) has a width defined
 *  5. window.renderLoadMoreRow is defined in financeRenderer.js
 *  6. Tx load-more block present in computeAndCacheFinance
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

// ── 1. CSS: .finance-tx-table table-layout: fixed ──────────────────────────────
const css = readFile('style.css') || '';
check(
    'finance-tx-table has table-layout:fixed',
    /\.finance-tx-table\s*\{[^}]*table-layout\s*:\s*fixed/s.test(css),
    'style.css: .finance-tx-table { table-layout: fixed }'
);

// ── 2. CSS: date cell width ≥ 100px ──────────────────────────────────────────
// Match the width value for .finance-tx-table .tx-date-cell / .tx-col-date block
const dateCellWidthMatch = css.match(/\.finance-tx-table[^{]*\.tx-(?:date-cell|col-date)[^{]*\{[^}]*width\s*:\s*(\d+)px/s);
const dateCellWidth = dateCellWidthMatch ? parseInt(dateCellWidthMatch[1], 10) : 0;
check(
    'finance-tx-table .tx-date-cell width >= 100px for full date',
    dateCellWidth >= 100,
    `Detected width: ${dateCellWidth}px (need >= 100px to display dd/MM/yyyy)`
);

// ── 3. CSS: THAO TÁC column width defined ─────────────────────────────────────
const actionsWidthMatch = css.match(/\.finance-tx-table[^{]*\.tx-(?:actions-cell|col-actions)[^{]*\{[^}]*width\s*:\s*(\d+)px/s);
const actionsWidth = actionsWidthMatch ? parseInt(actionsWidthMatch[1], 10) : 0;
check(
    'finance-tx-table .tx-actions-cell has explicit width',
    actionsWidth > 0,
    `Detected THAO TÁC column width: ${actionsWidth}px`
);

// ── 4. financeRenderer.js: _formatDateCompactB returns full date ───────────────
const finRen = readFile('js/ui/render/computation/financeRenderer.js') || '';
const hasTruncatedB = /function\s+_formatDateCompactB[^}]*substring\(8,10\)[^}]*return[^}]*substring\(5,7\)/.test(finRen);
check(
    '_formatDateCompactB does NOT truncate to dd/MM',
    !hasTruncatedB,
    hasTruncatedB ? 'FAIL: still uses substring to truncate date in bundle branch' : 'OK: returns formatDate(date) for full display'
);

// ── 5. financeRenderer.js: _formatDateCompact returns full date ────────────────
const hasTruncatedStd = /function\s+_formatDateCompact[^}]*substring\(8,10\)[^}]*return[^}]*substring\(5,7\)/.test(finRen);
check(
    '_formatDateCompact does NOT truncate to dd/MM',
    !hasTruncatedStd,
    hasTruncatedStd ? 'FAIL: still uses substring to truncate date in non-bundle branch' : 'OK: returns formatDate(date) for full display'
);

// ── 6. financeRenderer.js: window.renderLoadMoreRow defined ────────────────────
check(
    'window.renderLoadMoreRow defined in financeRenderer.js',
    finRen.includes('window.renderLoadMoreRow'),
    'Needed for universal Load More row HTML generation'
);

// ── 7. financeRenderer.js: tx load-more appended when hasNext ─────────────────
check(
    'computeAndCacheFinance appends load-more row when transactions.hasNext',
    finRen.includes('loadMoreTxRow') && finRen.includes('loadMoreTransactionsPage'),
    'Required for HỌC PHÍ tab Load More button'
);

// ── Results ──────────────────────────────────────────────────────────────────
console.log('\n📊 check:finance-table-column-lock\n');
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
