import fs from 'fs';

function read(path) {
  return fs.existsSync(path) ? fs.readFileSync(path, 'utf8') : '';
}

const files = {
  module: read('js/core/inventoryMultiItemReadOnlyUI.js'),
  main: read('js/main.js'),
  app: read('app.js'),
  safety: read('js/core/multiItemInventorySafety.js'),
  index: read('index.html'),
  pkg: read('package.json'),
};

let failed = false;
function check(label, condition) {
  if (condition) console.log('✅ ' + label);
  else { console.error('❌ ' + label); failed = true; }
}

check('module exists', files.module.length > 1000);
check('module declares 4K-6L phase', files.module.includes('4K-6L-inventory-multiitem-readonly-ui-ownership-20260608'));
check('module declares READ-ONLY UI scope', /READ-ONLY UI ONLY/i.test(files.module));
check('module exports InventoryMultiItemReadOnlyUI', files.module.includes('export const InventoryMultiItemReadOnlyUI'));
check('module exports initInventoryMultiItemReadOnlyUI', files.module.includes('export function initInventoryMultiItemReadOnlyUI'));
check('module has buildMultiItemInventoryStockOptions', files.module.includes('buildMultiItemInventoryStockOptions'));
check('module has renderMultiItemInventoryCategoryOptions', files.module.includes('renderMultiItemInventoryCategoryOptions'));
check('module has renderMultiItemInventoryDebtPanel', files.module.includes('renderMultiItemInventoryDebtPanel'));
check('module has updateMultiItemTotalDisplay', files.module.includes('updateMultiItemTotalDisplay'));
check('module has debugInventoryMultiItemReadOnlyUI', files.module.includes('debugInventoryMultiItemReadOnlyUI'));
check('module has no Firestore write calls', !/\b(addDoc|setDoc|updateDoc|deleteDoc)\s*\(/.test(files.module));
check('module does not own processMultiItem', !/processMultiItem\s*=/.test(files.module) && !/function\s+processMultiItem/.test(files.module));

check('main imports InventoryMultiItemReadOnlyUI', files.main.includes("./core/inventoryMultiItemReadOnlyUI.js"));
check('main calls initInventoryMultiItemReadOnlyUI', files.main.includes('initInventoryMultiItemReadOnlyUI()'));
check('main exposes window.InventoryMultiItemReadOnlyUI', files.main.includes('window.InventoryMultiItemReadOnlyUI'));
check('APP_BUILD_VERSION updated to 4K-6L', files.main.includes("4K-6L-inventory-multiitem-readonly-ui-ownership-20260608"));
check('index cache bust updated to 4K-6L', files.index.includes('main.js?v=inventory-multiitem-readonly-ui-ownership-20260608'));

check('app.js toggleMiInvCategory delegates to read-only UI', /window\.toggleMiInvCategory[\s\S]{0,900}renderMultiItemInventoryCategoryOptions/.test(files.app));
check('app.js calcMiInvTotal delegates to read-only UI', /window\.calcMiInvTotal[\s\S]{0,900}calculateMultiItemInventoryLineTotal/.test(files.app));
check('app.js recalcMiInvDebt delegates to read-only UI', /window\.recalcMiInvDebt[\s\S]{0,900}recalculateMultiItemInventoryDebt/.test(files.app));
check('app.js updateMultiItemTotal delegates to read-only UI', /window\.updateMultiItemTotal[\s\S]{0,1000}updateMultiItemTotalDisplay/.test(files.app));
check('multiItemInventorySafety delegates debt panel UI rendering', /renderMultiItemInventoryDebtPanel\(studentName, items[\s\S]{0,800}InventoryMultiItemReadOnlyUI/.test(files.safety));

const processIdx = files.app.indexOf('window.processMultiItem = async');
const processSegment = processIdx >= 0 ? files.app.slice(processIdx, processIdx + 11000) : '';
check('processMultiItem remains present', processIdx >= 0);
check('processMultiItem not delegated to read-only UI module', !processSegment.includes('InventoryMultiItemReadOnlyUI'));
check('processMultiItem still uses buildMultiItemTuitionPackageMonths', processSegment.includes('buildMultiItemTuitionPackageMonths'));
check('processMultiItem still writes paidUntil when tuition paid', /paidUntil:\s*lastMonth/.test(processSegment));

check('debugRuntimeSmokeTest includes read-only UI debug', files.main.includes('debugInventoryMultiItemReadOnlyUI') && files.main.includes('inventoryMultiItemReadOnlyUIOk'));
check('package has check:inventory-multiitem-readonly-ui', files.pkg.includes('check:inventory-multiitem-readonly-ui'));

if (failed) {
  console.error('\ncheck-inventory-multiitem-readonly-ui FAILED');
  process.exit(1);
}
console.log('\ncheck-inventory-multiitem-readonly-ui PASS');
