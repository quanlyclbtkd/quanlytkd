/**
 * check-finance-mobile-bundle-row.mjs — Phase 4K-5F
 * Kiểm tra bundle row không lặp tên, có CSS column classes, không có tr phụ.
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

console.log('\n[check-finance-mobile-bundle-row] Phase 4K-5F\n');

const financeRenderer = readFile('js/ui/render/computation/financeRenderer.js');
const appJs           = readFile('app.js');
const styleCss        = readFile('style.css');

// 1. getBundleDetailSummary defined in app.js
check('getBundleDetailSummary defined in app.js',
    appJs.includes('window.getBundleDetailSummary'));

// 2. financeRenderer uses getBundleDetailSummary (not getBundleSummaryLine) for subtitle
check('financeRenderer uses getBundleDetailSummary for subtitle line',
    financeRenderer.includes('getBundleDetailSummary'));

// 3. No duplicate name — tx-bundle-detail must NOT use getBundleSummaryLine directly
check('tx-bundle-detail does NOT render getBundleSummaryLine directly as content',
    !(financeRenderer.includes('${_escHtml(_bundleSummary)}') &&
      financeRenderer.includes('getBundleSummaryLine')));

// 4. financeRenderer does NOT produce secondary <tr> for bundle
check('financeRenderer does NOT return _summaryNote secondary <tr>',
    !financeRenderer.includes('_summaryNote'));

// 5. tx-bundle-detail CSS class exists in renderer
check('financeRenderer uses tx-bundle-detail CSS class',
    financeRenderer.includes('tx-bundle-detail'));

// 6. tx-name-cell in financeRenderer
check('financeRenderer uses tx-name-cell',
    financeRenderer.includes('tx-name-cell'));

// 7. tx-actions-cell in financeRenderer
check('financeRenderer uses tx-actions-cell',
    financeRenderer.includes('tx-actions-cell'));

// 8. tx-date-cell in financeRenderer
check('financeRenderer uses tx-date-cell',
    financeRenderer.includes('tx-date-cell'));

// 9. style.css has tx-date-cell
check('style.css has .tx-date-cell rule',
    styleCss.includes('.tx-date-cell'));

// 10. style.css has tx-branch-cell
check('style.css has .tx-branch-cell rule',
    styleCss.includes('.tx-branch-cell'));

// 11. style.css has tx-actions-cell
check('style.css has .tx-actions-cell rule',
    styleCss.includes('.tx-actions-cell'));

// 12. style.css has tx-bundle-detail responsive rules
check('style.css has .tx-bundle-detail responsive rules',
    styleCss.includes('.tx-bundle-detail') && styleCss.includes('text-overflow: ellipsis'));

// 13. debugBundleDisplay defined
check('debugBundleDisplay defined in app.js',
    appJs.includes('window.debugBundleDisplay'));

// 14. financeRenderer has compact date helper
check('financeRenderer has _formatDateCompact or compact date logic',
    financeRenderer.includes('_formatDateCompact') || financeRenderer.includes('substring(8,10)'));


// D1C3B mobile semantic density contract (<=767 only).
const d1c3bMobile = styleCss.slice(styleCss.lastIndexOf('/* ══ D1C3B — Tuition mobile row density'));
check('D1C3B mobile amount is centered in right column row 1 for semantic and legacy single-line rows',
    d1c3bMobile.includes('#tbl_tx tbody td.tx-amount-cell') && d1c3bMobile.includes('#tbl_tx tbody td:nth-last-child(2)') && d1c3bMobile.includes('grid-column: 2 !important') && d1c3bMobile.includes('grid-row: 1 !important') && d1c3bMobile.includes('text-align: center !important'));
check('D1C3B mobile month/date occupy left rows 2/3 without overlap',
    d1c3bMobile.includes('#tbl_tx tbody td.tx-month-cell') && d1c3bMobile.includes('grid-row: 2 !important') && d1c3bMobile.includes('#tbl_tx tbody td.tx-date-cell') && d1c3bMobile.includes('grid-row: 3 !important'));
check('D1C3B mobile actions occupy right column rows 2 through 3',
    d1c3bMobile.includes('#tbl_tx tbody td.tx-actions-cell') && d1c3bMobile.includes('grid-row: 2 / 4 !important'));
check('D1C3B mobile transaction action touch target remains at least 44px',
    d1c3bMobile.includes('#tbl_tx tbody td.tx-actions-cell .btn-sm') && d1c3bMobile.includes('min-height: 44px !important'));
check('D1C3B mobile long student/bundle text remains non-truncated',
    d1c3bMobile.includes('overflow-wrap: anywhere') && d1c3bMobile.includes('text-overflow: clip !important'));
check('D1C3B density override is scoped below 768px and desktop block remains present',
    d1c3bMobile.includes('@media (max-width: 767px)') && styleCss.includes('@media (min-width: 768px)'));

console.log(`\n  ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
