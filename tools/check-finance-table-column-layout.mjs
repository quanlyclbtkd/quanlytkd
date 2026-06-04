/**
 * check-finance-table-column-layout.mjs — Phase 4K-5G
 * Kiểm tra bảng HỌC PHÍ có colgroup, table-layout:fixed, sticky actions.
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

console.log('\n[check-finance-table-column-layout] Phase 4K-5G\n');

const indexHtml       = readFile('index.html');
const styleCss        = readFile('style.css');
const financeRenderer = readFile('js/ui/render/computation/financeRenderer.js');

// 1. index.html: tbl_tx has class="finance-tx-table"
check('index.html: tbl_tx has class finance-tx-table',
    indexHtml.includes('class="finance-tx-table"') ||
    indexHtml.includes("class='finance-tx-table'") ||
    (indexHtml.includes('tbl_tx') && indexHtml.includes('finance-tx-table')));

// 2. index.html: colgroup with tx-col-date
check('index.html: colgroup has tx-col-date',
    indexHtml.includes('tx-col-date'));

// 3. index.html: colgroup with tx-col-branch
check('index.html: colgroup has tx-col-branch',
    indexHtml.includes('tx-col-branch'));

// 4. index.html: colgroup with tx-col-actions
check('index.html: colgroup has tx-col-actions',
    indexHtml.includes('tx-col-actions'));

// 5. style.css: #tbl_tx.finance-tx-table table-layout fixed
check('style.css: #tbl_tx.finance-tx-table table-layout fixed',
    styleCss.includes('#tbl_tx.finance-tx-table') &&
    styleCss.includes('table-layout: fixed'));

// 6. style.css: .tx-col-date defined
check('style.css: .tx-col-date width defined',
    styleCss.includes('.tx-col-date') || styleCss.includes('tx-col-date'));

// 7. style.css: .tx-col-branch defined
check('style.css: .tx-col-branch width defined',
    styleCss.includes('.tx-col-branch') || styleCss.includes('tx-col-branch'));

// 8. style.css: .tx-col-actions defined
check('style.css: .tx-col-actions width defined',
    styleCss.includes('.tx-col-actions') || styleCss.includes('tx-col-actions'));

// 9. style.css: sticky actions for desktop
check('style.css: sticky tx-actions-cell for desktop',
    styleCss.includes('tx-actions-cell') &&
    styleCss.includes('sticky'));

// 10. financeRenderer: no broken regex /^d{4}-d{2}-d{2}$/
check('financeRenderer: regex /^d{4}-d{2}-d{2}$/ is fixed',
    !financeRenderer.includes('/^d{4}-d{2}-d{2}$/'));

// 11. financeRenderer: correct regex /^\d{4}-\d{2}-\d{2}$/
check('financeRenderer: correct regex /^\\d{4}-\\d{2}-\\d{2}$/ present',
    financeRenderer.includes('\\d{4}-\\d{2}-\\d{2}'));

// 12. financeRenderer: _ensureTxCellClass helper defined
check('financeRenderer: _ensureTxCellClass helper defined',
    financeRenderer.includes('function _ensureTxCellClass') ||
    financeRenderer.includes('_ensureTxCellClass ='));

// 13. financeRenderer: _ensureTxCellClass used (not raw .replace)
check('financeRenderer: _ensureTxCellClass used for tx-branch-cell',
    financeRenderer.includes("_ensureTxCellClass(branchTdHTML, 'tx-branch-cell')"));

console.log(`\n  ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
