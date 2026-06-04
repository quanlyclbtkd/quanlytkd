/**
 * check-bundle-display-labels.mjs — Phase 4K-5E
 * Kiểm tra các helper label bundle và financeRenderer không còn "📦 Gộp" generic.
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

console.log('\n[check-bundle-display-labels] Phase 4K-5E\n');

const appJs           = readFile('app.js');
const financeRenderer = readFile('js/ui/render/computation/financeRenderer.js');

// 1. Helper functions present in app.js
check('getPaymentComponentDisplayName defined in app.js',
    appJs.includes('window.getPaymentComponentDisplayName'));

check('getBundleTypeLabel defined in app.js',
    appJs.includes('window.getBundleTypeLabel'));

check('getBundleSummaryLine defined in app.js',
    appJs.includes('window.getBundleSummaryLine'));

// 2. buildPaymentBundleTransaction returns bundleTypeLabel and bundleSummaryLine
check('buildPaymentBundleTransaction returns bundleTypeLabel',
    appJs.includes('bundleTypeLabel:'));

check('buildPaymentBundleTransaction returns bundleSummaryLine',
    appJs.includes('bundleSummaryLine:'));

// 3. financeRenderer does NOT use literal "📦 Gộp" as the main type badge text
check('financeRenderer does NOT have literal 📦 Gộp as main type badge',
    !financeRenderer.includes('📦 Gộp'),
    'Remove >📦 Gộp< from the _typeBadge in the bundle branch');

// 4. financeRenderer does NOT create secondary _summaryNote <tr>
check('financeRenderer does NOT return _summaryNote secondary row',
    !financeRenderer.includes('_summaryNote'),
    'The _summaryNote <tr> must be removed from the bundle branch');

// 5. financeRenderer uses getBundleTypeLabel
check('financeRenderer uses getBundleTypeLabel',
    financeRenderer.includes('getBundleTypeLabel'));

// 6. financeRenderer uses getBundleSummaryLine
check('financeRenderer uses getBundleSummaryLine',
    financeRenderer.includes('getBundleSummaryLine'));

// 7. debugBundleDisplay defined
check('debugBundleDisplay defined in app.js',
    appJs.includes('window.debugBundleDisplay'));

console.log(`\n  ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
