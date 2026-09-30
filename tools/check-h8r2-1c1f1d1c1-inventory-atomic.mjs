import assert from 'node:assert/strict';
import { initFinancialActionAuditGuard } from '../js/core/financialActionAuditGuard.js';
import { FinanceService } from '../js/services/finance.service.js?v=long-term-production-stability-20260917-v5u6h8r2';
import { InventoryService } from '../js/services/inventory.service.js?v=residual-financial-cache-correctness-20260917-v5u6h8r2_1';
import { initInventory } from '../js/modules/inventory.js?v=residual-financial-cache-correctness-20260917-v5u6h8r2_1';

globalThis.window = globalThis;
window.location = { hostname: 'example.test' };
window.userRole = 'admin';
window.__store = { db: {}, clubId: 'club-A', invRef: { path: 'clubs/club-A/inventory' },
  colRef: { path: 'clubs/club-A/transactions' },
  currentUser: { uid: 'u1' }, inventory: [], transactions: [] };
const els = {}, E = (value = '') => ({ value, style: { display: '' }, checked: false,
  dataset: {}, reset() { this.resets = (this.resets || 0) + 1; } });
for (const id of ['inventoryForm','inv_category','inv_size','inv_size_text','inv_type','inv_qty',
  'inv_desc','inv_totalActual','inv_date','inv_unpaid','inv_priceActual',
  'ei_txId','ei_invId','ei_category','ei_size','ei_size_text','ei_type','ei_qty',
  'ei_date','ei_desc','ei_amountActual','editInvModal']) els[id] = E();
globalThis.document = { getElementById: id => els[id] || null, querySelectorAll: () => [] };
globalThis.alert = () => {};
globalThis.confirm = () => true;
window.showToast = () => {};
window.mergeInventoryIntoRuntimeStore = item => { window.__store.inventory =
  window.__store.inventory.filter(i => i.id !== item.id).concat(item); };
window.mergeTransactionIntoRuntimeStore = tx => { window.__store.transactions =
  window.__store.transactions.filter(t => t.id !== tx.id).concat(tx); };
window.notifyInventoryMutation = () => {};
window.canonicalizeTransactionForWrite = data => ({ ...data, accountingSchemaVersion: 'test' });
window.canonicalizeTransactionPatch = data => data;
let seq = 0, commits = 0, failed = false, applied = [], prepared = [], docData = new Map();
const ref = (...parts) => {
  if (parts.length === 1 && parts[0]?.path) return { id: 'new-' + (++seq), path: parts[0].path + '/new-' + seq };
  return { id: parts.at(-1), path: parts.slice(1).join('/') };
};
window._fb_init = {
  doc: ref, increment: n => ({ increment: n }),
  collection: (_db, ...parts) => ({ path: parts.join('/') }),
  writeBatch: () => {
    const ops = []; prepared.push(ops);
    return {
      set(r, data) { ops.push({ op: 'set', r, data }); },
      update(r, data) { ops.push({ op: 'update', r, data }); },
      async commit() {
        if (failed) throw Error('injected rejection');
        commits++; applied.push(ops.slice());
        for (const op of ops) docData.set(op.r.path, { ...(docData.get(op.r.path) || {}), ...op.data });
      }
    };
  },
  getDoc: async r => ({ id: r.id, exists: () => docData.has(r.path), data: () => docData.get(r.path) }),
  getDocs: async () => ({ empty: true, docs: [] }),
  query: (...v) => v, where: (...v) => v
};
window.FinanceService = FinanceService;
initFinancialActionAuditGuard(); initInventory();
const realGuard = window.guardFinancialWriteIntent;
let pass = 0;
const test = async (label, fn) => {
  try { await fn(); pass++; console.log('PASS', label); }
  catch (e) { process.exitCode = 1; console.error('FAIL', label, e); }
};
function reset() {
  commits = 0; failed = false; applied = []; prepared = []; docData = new Map(); seq = 0;
  window.userRole = 'admin'; window.guardFinancialWriteIntent = realGuard;
  window.__store.inventory = []; window.__store.transactions = [];
  delete els.inventoryForm.dataset.atomicSubmitInFlight;
  els.inv_category.value = 'Võ phục'; els.inv_size.value = 'Size 1m5';
  els.inv_size.style.display = ''; els.inv_type.value = 'Xuất bán';
  els.inv_qty.value = '1'; els.inv_desc.value = 'A';
  els.inv_totalActual.value = '100000'; els.inv_date.value = '2026-09-21';
  els.inv_unpaid.checked = false;
}
const submit = () => els.inventoryForm.onsubmit({ preventDefault() {}, target: els.inventoryForm });
await test('D03 paid sale: one commit writes inventory, stats, revenue', async () => {
  reset(); await submit();
  assert.equal(commits, 1);
  assert.deepEqual(applied[0].map(x => x.r.path.split('/').at(-2)), ['inventory', 'settings', 'transactions']);
  assert.equal(window.__store.inventory.length, 1); assert.equal(window.__store.transactions.length, 1);
  assert.equal(window.__store.transactions[0].relatedInvId, window.__store.inventory[0].id);
});
await test('D04 import plus expense: one commit', async () => {
  reset(); els.inv_type.value = 'Nhập kho'; await submit();
  assert.equal(commits, 1); assert.equal(window.__store.transactions[0].type, 'Chi Võ phục');
});
await test('D05 unpaid sale has no revenue document', async () => {
  reset(); els.inv_unpaid.checked = true; await submit();
  assert.equal(commits, 1); assert.equal(applied[0].length, 2);
  assert.equal(window.__store.inventory[0].unpaid, true);
  assert.equal(window.__store.transactions.length, 0);
});
await test('D06 gift preserves zero-amount gift transaction', async () => {
  reset(); els.inv_totalActual.value = '0'; await submit();
  assert.equal(commits, 1); assert.equal(window.__store.transactions[0].type, 'Tặng Võ phục');
});
await test('D01 missing guard blocks every primary effect', async () => {
  reset(); window.guardFinancialWriteIntent = undefined; await submit();
  assert.equal(commits, 0); assert.equal(window.__store.inventory.length, 0);
});
await test('D02 invalid qty blocks every primary effect', async () => {
  reset(); els.inv_qty.value = '-1'; await submit();
  assert.equal(commits, 0); assert.equal(window.__store.inventory.length, 0);
});
await test('D07 rejected batch leaves persisted and local state empty', async () => {
  reset(); failed = true; await submit();
  assert.equal(commits, 0); assert.equal(docData.size, 0);
  assert.equal(window.__store.inventory.length, 0); assert.equal(window.__store.transactions.length, 0);
});
await test('D08 markPaid adds revenue and paid state in one commit', async () => {
  reset(); const inv = { id: 'debt-1', type: 'Xuất bán', unpaid: true,
    inventoryDebtStatus: 'pending', category: 'Võ phục', size: 'Size 1m5', desc: 'A', amount: 100000 };
  docData.set('clubs/club-A/inventory/debt-1', inv);
  await window.markInvPaid('debt-1');
  assert.equal(commits, 1); assert.equal(applied[0].length, 2);
  assert.equal(docData.get('clubs/club-A/inventory/debt-1').unpaid, false);
  assert.equal(window.__store.transactions.length, 1);
  await window.markInvPaid('debt-1');
  assert.equal(commits, 1);
});
await test('D10 amount zero may not be marked paid without revenue', async () => {
  reset(); docData.set('clubs/club-A/inventory/debt-2',
    { id: 'debt-2', type: 'Xuất bán', unpaid: true, amount: 0 });
  await window.markInvPaid('debt-2'); assert.equal(commits, 0);
});
function editSetup() {
  reset();
  const inv = { id:'inv-edit', type:'Xuất bán', unpaid:false, category:'Võ phục',
    size:'Size 1m5', qty:1, amount:100000, desc:'A', date:'2026-09-21' };
  const tx = { id:'tx-edit', relatedInvId:'inv-edit', type:'Thu Võ phục',
    description:'A', amount:100000, date:'2026-09-21' };
  window.__editingInventoryOriginal = inv;
  window.__editingInventoryTransactionOriginal = tx;
  docData.set('clubs/club-A/inventory/inv-edit', inv);
  docData.set('clubs/club-A/transactions/tx-edit', tx);
  for (const [id,value] of Object.entries({
    ei_txId:'tx-edit',ei_invId:'inv-edit',ei_category:'Võ phục',ei_size:'Size 1m5',
    ei_type:'Xuất bán',ei_qty:'2',ei_date:'2026-09-21',ei_desc:'A',ei_amountActual:'100000'
  })) els[id].value=value;
}
await test('D11 supported same-type quantity edit uses one atomic batch', async () => {
  editSetup(); await window.saveEditInv();
  assert.equal(commits, 1);
  assert.deepEqual(applied[0].map(x=>x.op), ['update','set','update']);
  assert.equal(docData.get('clubs/club-A/inventory/inv-edit').qty, 2);
});
await test('D12 unsupported sale to import transition has no writes', async () => {
  editSetup(); els.ei_type.value = 'Nhập kho';
  await window.saveEditInv(); assert.equal(commits, 0);
});
await test('D12b missing related transaction identity has no writes', async () => {
  editSetup(); window.__editingInventoryTransactionOriginal.relatedInvId = 'other';
  await window.saveEditInv(); assert.equal(commits, 0);
});
console.log('D1C1 Inventory:', pass, 'passed');
