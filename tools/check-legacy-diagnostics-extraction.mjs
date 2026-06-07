/**
 * check-legacy-diagnostics-extraction.mjs — Phase 4K-6G
 *
 * Validates that the legacy diagnostics extraction is correct and
 * the app.js kernel functions are still intact.
 * Run: npm run check:legacy-diagnostics-extraction
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

let passed = 0;
let failed = 0;
const results = [];

function check(label, ok, detail = '') {
    if (ok) {
        passed++;
        results.push({ status: 'PASS', label });
    } else {
        failed++;
        results.push({ status: 'FAIL', label, detail });
    }
}

function readFile(rel) {
    try { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
    catch (_) { return ''; }
}

const legacyDiag  = readFile('js/diagnostics/legacyDiagnostics.js');
const legacyAudit = readFile('js/core/legacyAppAudit.js');
const mainJs      = readFile('js/main.js');
const appJs       = readFile('app.js');

// ── 1. LegacyDiagnostics exported from legacyDiagnostics.js ───────────────────
check(
    '1. LegacyDiagnostics object exported from legacyDiagnostics.js',
    legacyDiag.includes('export const LegacyDiagnostics'),
    'Must export LegacyDiagnostics object'
);

// ── 2. initLegacyDiagnostics exported ─────────────────────────────────────────
check(
    '2. initLegacyDiagnostics exported from legacyDiagnostics.js',
    legacyDiag.includes('export function initLegacyDiagnostics'),
    'Must export initLegacyDiagnostics function'
);

// ── 3. initLegacyDiagnostics sets window.LegacyDiagnostics ────────────────────
check(
    '3. initLegacyDiagnostics assigns window.LegacyDiagnostics',
    legacyDiag.includes('window.LegacyDiagnostics'),
    'initLegacyDiagnostics must expose window.LegacyDiagnostics'
);

// ── 4. initLegacyDiagnostics imported and called in main.js ───────────────────
check(
    '4. initLegacyDiagnostics imported in main.js',
    mainJs.includes('initLegacyDiagnostics'),
    'main.js must import and call initLegacyDiagnostics'
);

// ── 5. debugAppJsReductionPlan mentions 4K-6G MultiItem fix ───────────────────
check(
    '5. legacyAppAudit.js getAppJsReductionPlan mentions 4K-6G MultiItem Inventory Hydration fix',
    legacyAudit.includes('4K-6G') && legacyAudit.includes('MultiItem Inventory Hydration'),
    'getAppJsReductionPlan must mention 4K-6G MultiItem Inventory Hydration'
);

// ── 6. processMultiItem still exists in app.js ────────────────────────────────
check(
    '6. processMultiItem still exists in app.js (not moved or deleted)',
    appJs.includes('processMultiItem'),
    'processMultiItem must remain in app.js'
);

// ── 7. initSaaSDatabase still exists in app.js ────────────────────────────────
check(
    '7. initSaaSDatabase still exists in app.js (not removed)',
    appJs.includes('initSaaSDatabase'),
    'initSaaSDatabase must remain in app.js'
);

// ── 8. listenToData still exists in app.js ────────────────────────────────────
check(
    '8. listenToData still exists in app.js (not removed)',
    appJs.includes('listenToData'),
    'listenToData must remain in app.js'
);

// ── 9. renderApp still exists in app.js ───────────────────────────────────────
check(
    '9. renderApp still exists in app.js (not removed)',
    appJs.includes('renderApp'),
    'renderApp must remain in app.js'
);

// ── 10. scheduleRender still exists in app.js ─────────────────────────────────
check(
    '10. scheduleRender still exists in app.js (not removed)',
    appJs.includes('scheduleRender'),
    'scheduleRender must remain in app.js'
);

// ── Summary ────────────────────────────────────────────────────────────────────
console.log('\n── check:legacy-diagnostics-extraction ─────────────────────────────────');
results.forEach(r => {
    const icon = r.status === 'PASS' ? '✅' : '❌';
    console.log(`${icon} ${r.status}  ${r.label}`);
    if (r.detail) console.log(`         → ${r.detail}`);
});

console.log(`\nResult: ${passed} passed, ${failed} failed`);

if (failed > 0) {
    console.error(`\n❌ check:legacy-diagnostics-extraction FAILED (${failed} failures)\n`);
    process.exit(1);
} else {
    console.log(`\n✅ check:legacy-diagnostics-extraction PASS (${passed}/${passed + failed})\n`);
    process.exit(0);
}
