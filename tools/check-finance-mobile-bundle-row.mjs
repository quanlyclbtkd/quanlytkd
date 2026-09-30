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

console.log(`\n  ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
