#!/usr/bin/env node
/**
 * Phase 4K-6V2 — Inventory History Pagination + Complete Active Debt Listener
 * Static contract checks + in-memory ownership regression test.
 */
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const read = rel => readFileSync(resolve(root, rel), 'utf8');

const app = read('app.js');
const main = read('js/main.js');
const tabs = read('js/ui/tabs.js');
const renderer = read('js/ui/render/computation/inventoryRenderer.js');
const storeSource = read('js/data/inventoryStore.js');
const invService = read('js/services/inventory.service.js');
const studentService = read('js/services/students.service.js');
const invModule = read('js/modules/inventory.js');
const multiSafety = read('js/core/multiItemInventorySafety.js');

const blockStart = app.indexOf('Phase 4K-6V2 — Inventory History Pagination + Complete Debt Listener');
const blockEnd = blockStart >= 0 ? app.indexOf('const lMonth =', blockStart) : -1;
const phaseBlock = blockStart >= 0 && blockEnd > blockStart ? app.slice(blockStart, blockEnd) : '';
const debtStart = phaseBlock.indexOf('Complete active debt listener');
const debtBlock = debtStart >= 0 ? phaseBlock.slice(debtStart) : '';
const publishStart = phaseBlock.indexOf('const _publishInventoryHistory');
const publishEnd = publishStart >= 0 ? phaseBlock.indexOf('window.getInventoryHistoryPaginationState', publishStart) : -1;
const publishBlock = publishStart >= 0 && publishEnd > publishStart ? phaseBlock.slice(publishStart, publishEnd) : '';

let pass = 0;
let fail = 0;
function check(label, ok, detail = '') {
  if (ok) { console.log('✅ ' + label); pass++; }
  else { console.error('❌ ' + label + (detail ? ' — ' + detail : '')); fail++; }
}

console.log('\n=== Phase 4K-6V2 — Inventory Pagination + Complete Active Debt ===\n');

check('Build marker 4K-6V2 exists', main.includes('4K-6V2-inventory-history-pagination-complete-active-debt'));
check('Phase implementation block exists', phaseBlock.length > 1000);
check('Inventory history page size is 100', phaseBlock.includes('const _INVENTORY_HISTORY_PAGE_SIZE = 100'));
check('History uses date-desc cursor pagination', phaseBlock.includes("orderBy('date', 'desc')") && phaseBlock.includes('startAfter(cursor)') && phaseBlock.includes('limit(_INVENTORY_HISTORY_PAGE_SIZE)'));
check('History is gated by active Inventory tab', phaseBlock.includes('_isInventoryTabActive') && phaseBlock.includes('historySkippedClosedTab'));
check('Inventory tab explicitly starts lazy history load', tabs.includes("tabId === 'inventory'") && tabs.includes('ensureInventoryHistoryLoaded'));
check('Load-more control is rendered', renderer.includes('loadMoreInventoryHistory') && renderer.includes('getInventoryHistoryPaginationState'));
check('Global 500-document inventory history listener is removed from Phase block', !/onSnapshot\s*\(\s*query\s*\(\s*invRef[\s\S]{0,180}limit\s*\(\s*500\s*\)/.test(phaseBlock));
check('Complete debt query is unpaid == true with no limit', debtBlock.includes("where('unpaid', '==', true)") && !/const _inventoryDebtQuery[\s\S]{0,180}limit\s*\(/.test(debtBlock));
check('Debt listener has one club-scoped registry key', debtBlock.includes("'global:inventoryActiveDebts:' + clubId") && debtBlock.includes('safeRegisterSnapshot'));
check('Debt mirror is reset on tenant switch/init', debtBlock.includes('window.__completeInventoryDebts = []') && debtBlock.includes("window.__inventoryDebtCompleteness = 'loading'"));
check('Debt snapshot is authoritative and indexed', debtBlock.includes('setFinanceInventoryDebts') && debtBlock.includes('rebuildInventoryDebtIndex') && debtBlock.includes('markUnpaidDebtQueryLoaded'));
check('Recent history publish never derives/overwrites complete debts', publishBlock.length > 0 && !publishBlock.includes('deriveAndSetFinanceInventoryDebts') && !publishBlock.includes('setFinanceInventoryDebts'));
check('Debt listener failure marks incomplete coverage and blocks unsafe use', debtBlock.includes('markUnpaidDebtQueryFailed') && debtBlock.includes('Không nên Thu gộp'));
check('Debt identity index supports profileId, memberId and normalized name', storeSource.includes('byProfileId') && storeSource.includes('byMemberId') && storeSource.includes('byNormalizedName'));
check('New inventory writes enrich identity', invService.includes('resolveInventoryDebtIdentity') && studentService.includes('resolveInventoryDebtIdentity'));
check('Inventory edit preserves debt identity fields', invModule.includes('invPayload.profileId') && invModule.includes('invPayload.memberId') && invModule.includes('invPayload.studentName'));
check('Legacy/standalone complete-debt mirror is consumed by MultiItem safety', multiSafety.includes('__completeInventoryDebts'));
check('Inventory read metrics are exposed', phaseBlock.includes('printInventoryReadMetrics') && phaseBlock.includes('historyDocsRead') && phaseBlock.includes('debtListenerInitialDocs'));
check('Stock renderer overlays inventory_stats instead of trusting only first page', renderer.includes('inventoryStats') && renderer.includes("endsWith('_balance')"));

// Dynamic ownership regression: 100 recent rows must never replace authoritative debt rows.
global.window = {
  __store: { inventory: [] },
  allInventory: [],
  __inventoryDependencyMetrics: {},
};
try {
  const storeUrl = pathToFileURL(resolve(root, 'js/data/inventoryStore.js')).href + '?phase4k6v2-check=' + Date.now();
  const mod = await import(storeUrl);
  const debts = [
    { id: 'old-900', unpaid: true, type: 'Xuất bán', profileId: 'profile-a', memberId: 'HV001', desc: 'Nguyễn Văn A', amount: 300000 },
    { id: 'old-901', unpaid: true, type: 'Bán nợ', memberId: 'HV002', desc: 'Trần Văn B', amount: 250000 },
    { id: 'old-902', unpaid: true, type: 'Xuất', desc: 'Lê Thị C', amount: 150000 },
  ];
  const authoritative = mod.deriveFinanceInventoryDebts(debts);
  mod.setFinanceInventoryDebts(authoritative, 'test-authoritative');
  mod.rebuildInventoryDebtIndex('test-authoritative');
  mod.markUnpaidDebtQueryLoaded(authoritative.length, 'test-authoritative');

  const recent100 = Array.from({ length: 100 }, (_, i) => ({
    id: 'recent-' + i,
    unpaid: false,
    type: 'Nhập kho',
    timestamp: 1000 - i,
  }));
  mod.setAllInventory(recent100, 'test-recent-page');

  check('Dynamic: recent history page cannot overwrite authoritative debts', mod.getFinanceInventoryDebts().length === 3);
  check('Dynamic: lookup prioritizes profileId', mod.getInventoryDebtsForStudent({ profileId: 'profile-a', name: 'Wrong Name' }).some(x => x.id === 'old-900'));
  check('Dynamic: lookup falls back to memberId', mod.getInventoryDebtsForStudent({ memberId: 'HV002' }).some(x => x.id === 'old-901'));
  check('Dynamic: lookup falls back to normalized name', mod.getInventoryDebtsForStudent('  Lê   Thị C ').some(x => x.id === 'old-902'));
  check('Dynamic: completeness remains complete after history update', mod.inventoryStore.inventoryDebtCompleteness === 'complete');
  mod.resetInventoryStore('test-complete');
} catch (error) {
  check('Dynamic inventory-store ownership regression test', false, error && error.stack ? error.stack : String(error));
}

console.log(`\nTotal: ${pass + fail} | PASS: ${pass} | FAIL: ${fail}`);
if (fail) process.exit(1);
console.log('Phase 4K-6V2 inventory pagination/complete-debt checks passed.\n');
