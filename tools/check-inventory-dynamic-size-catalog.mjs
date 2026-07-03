import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const safetySrc = read('js/core/multiItemInventorySafety.js');
const readOnlySrc = read('js/core/inventoryMultiItemReadOnlyUI.js');
const mainSrc = read('js/main.js');
const appSrc = read('app.js');
const inventoryModuleSrc = read('js/modules/inventory.js');
const serviceSrc = read('js/services/inventory.service.js');
const indexSrc = read('index.html');

let pass = 0;
let fail = 0;
function check(name, condition) {
  if (condition) { pass++; console.log('✅', name); }
  else { fail++; console.error('❌', name); }
}

console.log('\n=== Phase 4K-6V2B — Dynamic Inventory Size Catalog ===\n');

check('Runtime exposes V2B patch version', mainSrc.includes("window.APP_PATCH_VERSION = '4K-6V2B-dynamic-inventory-size-catalog-20260616'") || mainSrc.includes("window.APP_PATCH_VERSION = '4K-6V2C-inventory-ledger-reconciliation-20260616'"));
check('Index cache-bust deploys V2B', indexSrc.includes('inventory-dynamic-size-catalog-20260616-v2b') || indexSrc.includes('inventory-ledger-reconciliation-20260616-v2c'));
check('Safety module defines normalized category identity', safetySrc.includes('function categoryIdentity'));
check('Safety module defines normalized size identity', safetySrc.includes('function sizeIdentity'));
check('Safety module canonicalizes history + stats maps', safetySrc.includes('canonicalizeStockMaps(historyMap, statsMap)'));
check('Safety module exposes dynamic category size builder', safetySrc.includes('buildInventoryCategorySizeOptions(category'));
check('Safety module exposes normalized stock lookup', safetySrc.includes('resolveInventoryStockEntry(stockMap, category, size)'));
check('Read-only MultiItem UI uses dynamic size builder', readOnlySrc.includes('buildInventoryCategorySizeOptions'));
check('Admission size bridge uses dynamic data-backed sizes', mainSrc.includes("buildInventoryCategorySizeOptions('Võ phục'"));
check('Legacy render cannot overwrite admission list with only hardcoded sizes', appSrc.includes('const _admissionStockRows = window.MultiItemInventorySafety?.buildInventoryCategorySizeOptions'));
check('Modular render cannot overwrite admission list with only hardcoded sizes', read('js/ui/render.js').includes('const _admissionStockRows = window.MultiItemInventorySafety?.buildInventoryCategorySizeOptions'));
check('Inventory module delegates MultiItem selector to read-only dynamic renderer', inventoryModuleSrc.includes("renderer({ reason: 'inventory-module-toggle-category' })"));
check('Category dropdown includes categories discovered from stock map', inventoryModuleSrc.includes('const stockNames = Object.values(window._liveInvMap || {})'));
check('Legacy category dropdown includes stock-map categories', appSrc.includes('const stockNames = Object.values(window._liveInvMap || {})'));
check('New inventory items maintain inventory_stats using increments', serviceSrc.includes('function _buildLedgerIncrementPatch') && serviceSrc.includes("patch[base + '_balance'] = incrementFn") && serviceSrc.includes('batch.set(statsRef, summaryPatch, { merge: true })'));
check('Summary maintenance adds no getDocs/read query', !serviceSrc.slice(serviceSrc.indexOf('async addItem'), serviceSrc.indexOf('async updateItem')).includes('getDocs('));
check('Legacy inventory writer also maintains summary with no reads', appSrc.includes("window.InventoryService && typeof window.InventoryService.addItem === 'function'"));
check('Changed nested modules are cache-busted', (mainSrc.includes("multiItemInventorySafety.js?v=audit-gate-superadmin-hardening-20260703-v5e") || mainSrc.includes("multiItemInventorySafety.js?v=inventory-dynamic-size-catalog-20260616-v2b") || mainSrc.includes("multiItemInventorySafety.js?v=inventory-ledger-reconciliation-20260616-v2c")) && (inventoryModuleSrc.includes("inventory.service.js?v=audit-gate-superadmin-hardening-20260703-v5e") || inventoryModuleSrc.includes("inventory.service.js?v=inventory-dynamic-size-catalog-20260616-v2b") || inventoryModuleSrc.includes("inventory.service.js?v=inventory-ledger-reconciliation-20260616-v2c")));

// Dynamic verification. No Firestore loader/query is available in this environment.
globalThis.document = {
  getElementById() { return null; },
  querySelectorAll() { return []; },
  createElement() { return { value: '', textContent: '', disabled: false }; }
};
globalThis.window = {
  __store: {
    inventory: [
      { category: 'Võ phục', size: 'Size 1m 9', type: 'Nhập kho', qty: 10 },
      { category: 'Võ phục', size: 'Size 1m 9', type: 'Xuất bán', qty: 2 },
      { category: 'Bảo Hộ', size: 'Giáp Số 2', type: 'Nhập kho', qty: 4 },
      { category: 'Găng tay', size: 'L', type: 'Nhập kho', qty: 3 }
    ]
  },
  allInventory: [],
  _liveInvMap: {},
  __inventoryStore: {
    inventoryStats: {
      // Different case/spacing from history. Stats must replace the history total.
      'VÕ PHỤC|||size 1M9_balance': 5,
      'Áo thun|||XXL_balance': 7
    },
    inventoryHistory: [],
    financeInventoryDebts: [],
    getAllInventoryCompat() { return window.__store.inventory; }
  }
};

const safetyUrl = pathToFileURL(path.join(root, 'js/core/multiItemInventorySafety.js')).href + '?v2b=' + Date.now();
const { MultiItemInventorySafety } = await import(safetyUrl);
window.MultiItemInventorySafety = MultiItemInventorySafety;

const built = MultiItemInventorySafety.buildInventoryStockMapForMultiItem({ force: true, reason: 'v2b-check' });
check('Dynamic: stock map built without any Firestore read API', built.keyCount >= 4);

const uniformRows = MultiItemInventorySafety.buildInventoryCategorySizeOptions('Võ phục', {
  stockMap: built.map,
  defaultSizes: ['Size 1m', 'Size 1m1', 'Size 1m8'],
  configuredSizes: []
});
const dynamicUniform = uniformRows.find(r => MultiItemInventorySafety.normalizeInventorySizeIdentity(r.size) === 'size1m9');
check('Dynamic: non-hardcoded uniform size is included', !!dynamicUniform);
check('Dynamic: case/spacing aliases merge into one size', uniformRows.filter(r => MultiItemInventorySafety.normalizeInventorySizeIdentity(r.size) === 'size1m9').length === 1);
check('Dynamic: inventory_stats remains authoritative for normalized alias', dynamicUniform?.balance === 5);

const protectionRows = MultiItemInventorySafety.buildInventoryCategorySizeOptions('Bảo hộ', {
  stockMap: built.map,
  defaultSizes: [],
  configuredSizes: []
});
check('Dynamic: data-backed size appears even without category size config', protectionRows.some(r => r.size === 'Giáp Số 2' && r.balance === 4));

const gloveRows = MultiItemInventorySafety.buildInventoryCategorySizeOptions('Găng tay', {
  stockMap: built.map,
  defaultSizes: [],
  configuredSizes: ['S', 'M']
});
check('Dynamic: configured sizes are preserved', gloveRows.some(r => r.size === 'S') && gloveRows.some(r => r.size === 'M'));
check('Dynamic: stock-only size is appended to configured sizes', gloveRows.some(r => r.size === 'L' && r.balance === 3));

const shirtRows = MultiItemInventorySafety.buildInventoryCategorySizeOptions('áo THUN', {
  stockMap: built.map,
  defaultSizes: [],
  configuredSizes: []
});
check('Dynamic: category casing aliases resolve correctly', shirtRows.some(r => r.size === 'XXL' && r.balance === 7));

const uiUrl = pathToFileURL(path.join(root, 'js/core/inventoryMultiItemReadOnlyUI.js')).href + '?v2b=' + Date.now();
const { InventoryMultiItemReadOnlyUI } = await import(uiUrl);
const uiPlan = InventoryMultiItemReadOnlyUI.buildMultiItemInventoryStockOptions('Găng tay', {
  stockMap: built.map,
  customCategories: [{ name: 'Găng Tay', sizes: ['S', 'M'] }]
});
check('Dynamic: Thu gộp UI receives complete configured + live size list', uiPlan.options.some(r => r.value === 'L') && uiPlan.options.some(r => r.value === 'S'));
check('Dynamic: positive stock option remains enabled', uiPlan.options.find(r => r.value === 'L')?.disabled === false);

console.log(`\nTotal: ${pass + fail} | PASS: ${pass} | FAIL: ${fail}`);
if (fail) process.exit(1);
console.log('Phase 4K-6V2B dynamic inventory size catalog checks passed.\n');
