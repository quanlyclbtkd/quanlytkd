/**
 * check-finance-table-hard-layout.mjs — Phase 4K-5G
 * Kiểm tra colgroup, CSS hard layout, th classes, regex compact date, debugFinanceTableLayout.
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

console.log('\n[check-finance-table-hard-layout] Phase 4K-5G\n');

const financeRenderer = readFile('js/ui/render/computation/financeRenderer.js');
const styleCss        = readFile('style.css');
const appJs           = readFile('app.js');
const indexHtml       = readFile('index.html');

// 1. financeRenderer has NO broken regex (missing backslash)
check('financeRenderer: no broken /^d{4}-d{2}-d{2}$/ regex (missing backslash)',
    !financeRenderer.includes('/^d{4}-d{2}-d{2}$/') &&
    !financeRenderer.includes('/^d{4}-d{2}-d{2}$/'));

// 2. financeRenderer has correct regex with backslash
check('financeRenderer: has correct /^\\d{4}-\\d{2}-\\d{2}$/ regex',
    financeRenderer.includes('\\d{4}-\\d{2}-\\d{2}') ||
    financeRenderer.includes('\\\\d{4}-\\\\d{2}-\\\\d{2}'));

// 3. getFinanceTxColgroup defined
check('getFinanceTxColgroup defined in financeRenderer.js',
    financeRenderer.includes('window.getFinanceTxColgroup'));

// 4. _formatBranchCompact defined in financeRenderer
check('_formatBranchCompact defined in financeRenderer.js',
    financeRenderer.includes('_formatBranchCompact'));

// 5. tbl_tx has finance-tx-table class in index.html
check('index.html: tbl_tx has class="finance-tx-table"',
    indexHtml.includes('id="tbl_tx" class="finance-tx-table"') ||
    indexHtml.includes('class="finance-tx-table" id="tbl_tx"') ||
    (indexHtml.includes('id="tbl_tx"') && indexHtml.includes('finance-tx-table')));

// 6. index.html has colgroup for txList
check('index.html: colgroup present in tbl_tx',
    indexHtml.includes('txTableColgroup') ||
    (indexHtml.includes('tx-col-date') && indexHtml.includes('tx-col-actions')));

// 7. index.html th elements have tx-date-cell
check('index.html: thead th has tx-date-cell class',
    indexHtml.includes('tx-date-cell'));

// 8. index.html th elements have tx-branch-cell
check('index.html: thead th has tx-branch-cell class',
    indexHtml.includes('tx-branch-cell'));

// 9. index.html th elements have tx-actions-cell
check('index.html: thead th has tx-actions-cell class',
    indexHtml.includes('tx-actions-cell'));

// 10. style.css has .finance-tx-table { table-layout: fixed
check('style.css: .finance-tx-table has table-layout: fixed',
    styleCss.includes('.finance-tx-table') && styleCss.includes('table-layout: fixed'));

// 11. style.css has tx-col-date
check('style.css: has .tx-col-date rule',
    styleCss.includes('tx-col-date'));

// 12. style.css has tx-col-branch
check('style.css: has .tx-col-branch rule',
    styleCss.includes('tx-col-branch'));

// 13. style.css has tx-col-actions
check('style.css: has .tx-col-actions rule',
    styleCss.includes('tx-col-actions'));

// 14. style.css has media query for finance-tx-table mobile
check('style.css: media query with min-width for finance-tx-table',
    styleCss.includes('.finance-tx-table') && styleCss.includes('min-width: 760px'));

// 15. debugFinanceTableLayout defined in app.js
check('debugFinanceTableLayout defined in app.js',
    appJs.includes('window.debugFinanceTableLayout'));

// 16. debugFinanceTableLayout checks tableLayout computedStyle
check('debugFinanceTableLayout checks getComputedStyle tableLayout',
    appJs.includes('getComputedStyle') && appJs.includes('tableLayout'));

console.log(`\n  ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
