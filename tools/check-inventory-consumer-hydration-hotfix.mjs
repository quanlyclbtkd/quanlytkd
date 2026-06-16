import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const app = read('app.js');
const main = read('js/main.js');
const safetySrc = read('js/core/multiItemInventorySafety.js');
const readOnlySrc = read('js/core/inventoryMultiItemReadOnlyUI.js');
const inventoryModule = read('js/modules/inventory.js');

let pass = 0;
let fail = 0;
function check(name, condition) {
  if (condition) {
    pass++;
    console.log('✅', name);
  } else {
    fail++;
    console.error('❌', name);
  }
}

console.log('\n=== Phase 4K-6V2A — Inventory Consumer Hydration Hotfix ===\n');

check('Runtime exposes Phase 4K-6V2A patch version', main.includes("window.APP_PATCH_VERSION = '4K-6V2A-inventory-consumer-hydration-hotfix-20260616'"));
check('Cache bust deploys the V2A hotfix', read('index.html').includes('inventory-pagination-complete-debt-20260616-v2a-consumer-hotfix'));
check('Canonical stock builder reads inventory_stats', safetySrc.includes('buildStockMapFromInventoryStats'));
check('Stock builder preserves category and size metadata', safetySrc.includes("category + '|||' + size") && safetySrc.includes("source: 'inventory-stats'"));
check('Stock builder overlays inventory_stats over lazy history fallback', safetySrc.includes('const map = { ...historyMap, ...statsMap }'));
check('Admission readiness accepts hydrated inventory_stats', main.includes('isStatsHydrated') && main.includes('inventoryStats !== null'));
check('Admission size lookup force-builds stock map from inventory_stats', main.includes("reason: options.reason || 'admission-uniform-sizes'") && main.includes('force: true'));
check('Admission modal preserves selected size during realtime stats refresh', main.includes('preserveSelection') && main.includes('previousValue'));
check('Inventory stats listener refreshes open Add Student modal', app.includes("renderAdmissionUniformSizeOptions({ preserveSelection: true, reason: 'invstats-snapshot' })"));
check('Inventory stats listener refreshes open MultiItem stock selector', app.includes('_miInvOn') && app.includes('window.toggleMiInvCategory()'));
check('Club switch clears old stock map', app.includes("window.__liveInvMapSource = 'club-context-reset'"));
check('MultiItem read-only UI rebuilds stock map before using _liveInvMap', readOnlySrc.includes('force: true') && readOnlySrc.indexOf('buildInventoryStockMapForMultiItem') < readOnlySrc.indexOf('window._liveInvMap-fallback'));
check('Modern Inventory module force-refreshes MultiItem stock', inventoryModule.includes("reason: 'toggle-mi-category',\n                force: true"));
check('MultiItem debt lookup accepts identity object', safetySrc.includes('resolveMultiItemInventoryDebts(studentOrProfile') && safetySrc.includes('lookupTarget'));
check('MultiItem autocomplete stores profileId/memberId', app.includes('inp.dataset.profileId = nm') && app.includes('inp.dataset.memberId'));
check('MultiItem debt lookup passes selected identity', app.includes('const _miDebtIdentity = {') && app.includes('resolveMultiItemInventoryDebts(_miDebtIdentity'));

// Dynamic module verification: no inventory history is present.
globalThis.document = {
  getElementById() { return null; },
  querySelectorAll() { return []; }
};
globalThis.window = {
  __store: { inventory: [] },
  allInventory: [],
  _liveInvMap: {},
  __inventoryDebtCompleteness: 'complete',
  __inventoryStore: {
    inventoryStats: {
      'Size 1m_balance': 3,
      'Size 1m_out': 2,
      'Áo thun|||M_in': 7,
      'Áo thun|||M_out': 2,
      'Áo thun|||M_balance': 5
    },
    inventoryHistory: [],
    financeInventoryDebts: [],
    inventoryDebtIndexReady: true,
    unpaidDebtQueryLoaded: true,
    getAllInventoryCompat() { return []; }
  },
  resolveInventoryDebtIdentity(input) {
    return {
      profileId: input.profileId || '',
      memberId: input.memberId || '',
      studentName: input.name || input.studentName || ''
    };
  },
  getInventoryDebtsForStudent(identity) {
    if (identity.profileId !== 'profile-A') return [];
    return [{
      id: 'debt-1', profileId: 'profile-A', memberId: 'HV001',
      studentName: 'Nguyễn Văn A', type: 'Xuất bán', unpaid: true,
      category: 'Võ phục', size: 'Size 1m', qty: 1, amount: 350000
    }];
  }
};

const moduleUrl = pathToFileURL(path.join(root, 'js/core/multiItemInventorySafety.js')).href + '?check=' + Date.now();
const { MultiItemInventorySafety } = await import(moduleUrl);
const stockResult = MultiItemInventorySafety.buildInventoryStockMapForMultiItem({ force: true, reason: 'checker' });
const uniform = stockResult.map['Võ phục|||Size 1m'];
const shirt = stockResult.map['Áo thun|||M'];
check('Dynamic: stock loads with zero history documents', stockResult.itemCount === 0 && stockResult.keyCount === 2);
check('Dynamic: legacy uniform stats key maps to Võ phục size', uniform?.category === 'Võ phục' && uniform?.size === 'Size 1m');
check('Dynamic: balance-only + out reconstructs correct stock', uniform?.in === 5 && uniform?.out === 2 && uniform?.balance === 3);
check('Dynamic: custom category stats key maps correctly', shirt?.category === 'Áo thun' && shirt?.size === 'M' && shirt?.balance === 5);
check('Dynamic: _liveInvMap is hydrated without opening Inventory tab', window._liveInvMap['Võ phục|||Size 1m']?.balance === 3);

const debtRows = MultiItemInventorySafety.resolveMultiItemInventoryDebts({
  profileId: 'profile-A', memberId: 'HV001', name: 'Nguyễn Văn A'
}, { reason: 'checker' });
check('Dynamic: debt resolves by profileId from complete listener index', debtRows.length === 1 && debtRows[0].id === 'debt-1');
check('Dynamic: normalized debt row preserves identity', debtRows[0]?.profileId === 'profile-A' && debtRows[0]?.memberId === 'HV001');

const ready = await MultiItemInventorySafety.ensureMultiItemInventoryReady('checker');
check('Dynamic: MultiItem readiness succeeds from stats + debt listener', ready.ok === true && ready.stockReady === true && ready.inventoryStatsLoaded === true);
check('Dynamic: readiness performs no history hydration requirement', ready.inventoryCount === 0 && ready.allInventoryCount === 0 && ready.liveInvMapKeys === 2);

console.log(`\nTotal: ${pass + fail} | PASS: ${pass} | FAIL: ${fail}`);
if (fail) process.exit(1);
console.log('Phase 4K-6V2A inventory consumer hydration hotfix checks passed.\n');
