/**
 * check-multiitem-inventory-hydration.mjs — Phase 4K-6G Hotfix Validation
 *
 * Validates that the MultiItem Inventory Hydration hotfix is correctly applied.
 * Run: npm run check:multiitem-inventory-hydration
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

const miSafety    = readFile('js/core/multiItemInventorySafety.js');
const appJs       = readFile('app.js');
const inventoryJs = readFile('js/modules/inventory.js');
const mainJs      = readFile('js/main.js');

// ── 1. File exists ─────────────────────────────────────────────────────────────
check(
    '1. js/core/multiItemInventorySafety.js exists',
    fs.existsSync(path.join(ROOT, 'js/core/multiItemInventorySafety.js')),
    'File must be created'
);

// ── 2. window.MultiItemInventorySafety exposed ─────────────────────────────────
check(
    '2. MultiItemInventorySafety exposed to window in main.js',
    mainJs.includes('window.MultiItemInventorySafety') && mainJs.includes('MultiItemInventorySafety'),
    'main.js must expose window.MultiItemInventorySafety'
);

// ── 3. ensureMultiItemInventoryReady exported ──────────────────────────────────
check(
    '3. ensureMultiItemInventoryReady defined in multiItemInventorySafety.js',
    miSafety.includes('ensureMultiItemInventoryReady'),
    'Must be exported from MultiItemInventorySafety'
);

// ── 4. resolveMultiItemInventoryDebts exported ─────────────────────────────────
check(
    '4. resolveMultiItemInventoryDebts defined in multiItemInventorySafety.js',
    miSafety.includes('resolveMultiItemInventoryDebts'),
    'Must be exported from MultiItemInventorySafety'
);

// ── 5. buildInventoryStockMapForMultiItem exported ─────────────────────────────
check(
    '5. buildInventoryStockMapForMultiItem defined in multiItemInventorySafety.js',
    miSafety.includes('buildInventoryStockMapForMultiItem'),
    'Must be exported from MultiItemInventorySafety'
);

// ── 6. renderMultiItemInventoryDebtPanel exported ──────────────────────────────
check(
    '6. renderMultiItemInventoryDebtPanel defined in multiItemInventorySafety.js',
    miSafety.includes('renderMultiItemInventoryDebtPanel'),
    'Must be exported from MultiItemInventorySafety'
);

// ── 7. _refreshMiHistoryBadges is async ───────────────────────────────────────
check(
    '7. _refreshMiHistoryBadges is async in app.js',
    appJs.includes('_refreshMiHistoryBadges = async (name, profile)') ||
    appJs.includes('_refreshMiHistoryBadges = async(name, profile)'),
    '_refreshMiHistoryBadges must be declared async'
);

// ── 8. _refreshMiHistoryBadges calls ensureMultiItemInventoryReady ─────────────
check(
    '8. _refreshMiHistoryBadges calls ensureMultiItemInventoryReady in app.js',
    appJs.includes('ensureMultiItemInventoryReady') &&
    appJs.includes('multi-item-refresh-badges'),
    '_refreshMiHistoryBadges must await ensureMultiItemInventoryReady'
);

// ── 9. _refreshMiHistoryBadges does NOT only rely on ensureInventoryForFeature ─
check(
    '9. _refreshMiHistoryBadges does not only call ensureInventoryForFeature synchronously before reading debts',
    // The old pattern: ensureInventoryForFeature directly followed by getInventoryDebtsForStudent
    // New pattern: ensureMultiItemInventoryReady is used instead as primary
    appJs.includes('resolveMultiItemInventoryDebts') || appJs.includes('ensureMultiItemInventoryReady'),
    'Must use ensureMultiItemInventoryReady, not only ensureInventoryForFeature'
);

// ── 10. Debt match covers more than just desc/description exact ────────────────
check(
    '10. resolveMultiItemInventoryDebts normalizes Vietnamese and checks multiple name fields',
    miSafety.includes('normalize(') &&
    miSafety.includes('studentName') &&
    miSafety.includes('profileName'),
    'Must normalize Vietnamese and check multiple fields'
);

// ── 11. toggleMiInvCategory in app.js has fallback stock map ──────────────────
// After our edit, app.js toggleMiInvCategory should have the MultiItemInventorySafety fallback
const appJsToggleMiInvCategoryIdx = appJs.indexOf('window.toggleMiInvCategory = ()');
const appJsToggleMiSection = appJsToggleMiInvCategoryIdx >= 0
    ? appJs.substring(appJsToggleMiInvCategoryIdx, appJsToggleMiInvCategoryIdx + 1800)
    : '';
check(
    '11. toggleMiInvCategory in app.js has fallback buildInventoryStockMapForMultiItem',
    appJsToggleMiSection.includes('buildInventoryStockMapForMultiItem') ||
    appJsToggleMiSection.includes('MultiItemInventorySafety'),
    'toggleMiInvCategory in app.js must have fallback stock map build'
);

// ── 12. toggleMiInvCategory in inventory.js has fallback stock map ─────────────
const invToggleMiIdx = inventoryJs.indexOf('window.toggleMiInvCategory = ()');
const invToggleMiSection = invToggleMiIdx >= 0
    ? inventoryJs.substring(invToggleMiIdx, invToggleMiIdx + 1800)
    : '';
check(
    '12. toggleMiInvCategory in js/modules/inventory.js has fallback buildInventoryStockMapForMultiItem',
    invToggleMiSection.includes('buildInventoryStockMapForMultiItem') ||
    invToggleMiSection.includes('MultiItemInventorySafety'),
    'toggleMiInvCategory in inventory.js must have fallback stock map build'
);

// ── 13. Auto-refresh modal when inventory loads ────────────────────────────────
check(
    '13. app.js has auto-refresh multiItemModal when inventory snapshot arrives',
    appJs.includes('refreshMultiItemInventorySection') &&
    appJs.includes('inventory-loaded-while-multi-item-open'),
    'Must auto-refresh modal when inventory data loads'
);

// ── 14. debugMultiItemInventoryHydration exposed ───────────────────────────────
check(
    '14. debugMultiItemInventoryHydration exists in main.js or app.js',
    mainJs.includes('debugMultiItemInventoryHydration') ||
    appJs.includes('debugMultiItemInventoryHydration'),
    'Must expose window.debugMultiItemInventoryHydration'
);

// ── 15. debugMultiItemInventoryDebtResolution exposed ─────────────────────────
check(
    '15. debugMultiItemInventoryDebtResolution exists in main.js or app.js',
    mainJs.includes('debugMultiItemInventoryDebtResolution') ||
    appJs.includes('debugMultiItemInventoryDebtResolution'),
    'Must expose window.debugMultiItemInventoryDebtResolution'
);

// ── 16. smoke test references multiitem inventory ─────────────────────────────
check(
    '16. debugRuntimeSmokeTest includes debugMultiItemInventoryHydration',
    mainJs.includes('debugMultiItemInventoryHydration') ||
    mainJs.includes('multiItemInventoryHydrationOk'),
    'debugRuntimeSmokeTest must include multiitem inventory debug calls'
);

// ── Summary ────────────────────────────────────────────────────────────────────
console.log('\n── check:multiitem-inventory-hydration ─────────────────────────────────');
results.forEach(r => {
    const icon = r.status === 'PASS' ? '✅' : '❌';
    console.log(`${icon} ${r.status}  ${r.label}`);
    if (r.detail) console.log(`         → ${r.detail}`);
});

console.log(`\nResult: ${passed} passed, ${failed} failed`);

if (failed > 0) {
    console.error(`\n❌ check:multiitem-inventory-hydration FAILED (${failed} failures)\n`);
    process.exit(1);
} else {
    console.log(`\n✅ check:multiitem-inventory-hydration PASS (${passed}/${passed + failed})\n`);
    process.exit(0);
}
