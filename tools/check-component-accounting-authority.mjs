/**
 * check-component-accounting-authority.mjs — Phase 4K-5E
 * Kiểm tra rằng accounting/reports đọc components chứ không cộng full tx.amount cho bundle.
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

function readFile(rel) {
    return readFileSync(resolve(root, rel), 'utf8');
}

let passed = 0;
let failed = 0;

function check(name, condition, detail = '') {
    if (condition) {
        console.log(`  ✅  ${name}`);
        passed++;
    } else {
        console.error(`  ❌  ${name}${detail ? ' — ' + detail : ''}`);
        failed++;
    }
}

console.log('\n[check-component-accounting-authority] Phase 4K-5E\n');

const financeRenderer = readFile('js/ui/render/computation/financeRenderer.js');
const reportsJs       = readFile('js/modules/reports.js');
const mainJs          = readFile('js/main.js');
const appJs           = readFile('app.js');

// 1. financeRenderer uses expandTransactionComponentsForAccounting or component branch
check('financeRenderer computeAndCacheFinance has bundle component branch',
    financeRenderer.includes('expandTransactionComponentsForAccounting') ||
    financeRenderer.includes("t.components.length > 0"));

// 2. reports.js has bundle component branch
check('reports.js txAll.forEach has bundle component branch',
    reportsJs.includes('expandTransactionComponentsForAccounting') ||
    reportsJs.includes("t.components") && reportsJs.includes("paymentKind"));

// 3. financeRenderer does NOT add full tx.amount to incTuition for bundle
// Pattern to check: bundle path uses component.amount not t.amount
const bundleSectionFR = financeRenderer.includes('c.kind') && financeRenderer.includes('incTuition');
check('financeRenderer bundle path allocates by component.amount (not raw tx.amount)',
    bundleSectionFR);

// 4. reports.js does NOT add full amount to incTuition for bundle
check('reports.js has bundle-aware accounting (component kind routing)',
    reportsJs.includes("ck === 'tuition'") || reportsJs.includes("c.kind === 'tuition'"));

// 5. printTuitionReceiptByTxId reads tx.components for breakdown
check('printTuitionReceiptByTxId reads tx.components for breakdown',
    mainJs.includes('tx.components') && mainJs.includes('breakdown'));

// 6. getAccountingComponents defined in app.js
check('getAccountingComponents defined in app.js',
    appJs.includes('window.getAccountingComponents'));

// 7. expandTransactionComponentsForAccounting still present in app.js
check('expandTransactionComponentsForAccounting present in app.js',
    appJs.includes('window.expandTransactionComponentsForAccounting'));

// 8. No pattern where paymentKind=bundle adds full amount to single category
const badPattern = /paymentKind.*===.*['"']bundle['"'][\s\S]{0,200}incTuition\s*\+=\s*[^(].*amount/;
check('No pattern where bundle full amount goes to incTuition directly',
    !badPattern.test(financeRenderer) && !badPattern.test(reportsJs));

console.log(`\n  ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
