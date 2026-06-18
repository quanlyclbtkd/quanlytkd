#!/usr/bin/env node
/** Phase 4K-6V3F — Per-Club Inventory Sale Policy + Pending Stock Reconciliation */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const index = read('index.html');
const app = read('app.js');
const main = read('js/main.js');
const policySource = read('js/core/inventorySalePolicy.js');
const pending = read('js/services/inventoryPending.service.js');
const inventoryService = read('js/services/inventory.service.js');
const students = read('js/modules/students.js');
const financeIntegrity = read('js/core/transactionDeleteIntegrity.js');
const rules = read('firestore.rules');

let pass = 0, fail = 0;
function check(name, ok, detail = '') {
  if (ok) { pass++; console.log('✅', name); }
  else { fail++; console.error('❌', name + (detail ? ' — ' + detail : '')); }
}

console.log('\n=== Phase 4K-6V3F — Inventory Sale Policy + Pending Reconciliation ===\n');

globalThis.window = { __store: { clubConfig: {} } };
const policy = await import(pathToFileURL(path.join(root, 'js/core/inventorySalePolicy.js')).href + '?test=' + Date.now());
check('Policy defaults to strict and recognizes all three modes',
  policy.normalizeInventorySalePolicy('unknown') === 'strict' &&
  policy.resolveInventoryPostingMode({ policy: 'strict', requestPending: true }) === 'posted' &&
  policy.resolveInventoryPostingMode({ policy: 'allow_pending', requestPending: true }) === 'pending' &&
  policy.resolveInventoryPostingMode({ policy: 'disabled' }) === 'not_applicable');

check('Per-club setting and all required UI controls exist exactly once',
  ['cfg_inventorySalePolicy','add_uniform_pending','add_uniform_pending_reason','add_uniform_size_manual',
   'mi_inv_pending','mi_inv_pending_reason','inventoryPendingSection','inventoryPendingList','inventoryPendingStatus']
    .every(id => (index.match(new RegExp(`id="${id}"`, 'g')) || []).length === 1) &&
  index.includes('value="strict"') && index.includes('value="allow_pending"') && index.includes('value="disabled"'));

check('Existing and newly-created clubs default to strict',
  app.includes('inventorySalePolicy: "strict"') && app.includes('inventorySalePolicy = window.InventorySalePolicy'));

check('Admission and combined-payment paths use the shared atomic boundary',
  app.includes('InventoryPendingService.commitFinancialTransaction') &&
  students.includes('InventoryPendingService.commitFinancialTransaction') &&
  app.includes('getMultiItemInventorySelection') && students.includes('getAdmissionInventorySelection'));

check('Pending sale is financial-first without stock decrement and has a dedicated record',
  pending.includes("mode === 'pending'") && pending.includes("inventoryPendingIssues") &&
  pending.includes("affectsInventory: false") && pending.includes("pendingIssueCount: increment(1)") &&
  !pending.slice(pending.indexOf("if (mode === 'pending')"), pending.indexOf("const invRef", pending.indexOf("if (mode === 'pending')"))).includes("_balance`]: increment(-"));

check('Strict posted sale validates current stock inside a Firestore transaction',
  pending.includes("type: 'inventory-stock'") && pending.includes('await transaction.get(check.ref)') &&
  inventoryService.includes('const available = Number(stats[info.base + \'_balance\'] || 0)') &&
  inventoryService.includes('await runTransaction(db'));

check('Reconciliation is stock-only and never creates revenue twice',
  pending.includes('reconciliationOnly: true') && pending.includes('affectsRevenue: false') &&
  pending.includes("pendingIssueCount: increment(-1)") &&
  pending.includes("inventoryPostingStatus: 'posted'") &&
  !pending.slice(pending.indexOf('async reconcile(issueId)'), pending.indexOf('async markNotApplicable')).includes('transaction.set(txRef'));

check('Reconciliation updates both top-level transaction and matching component state',
  pending.includes('resolvePendingComponentState') &&
  pending.includes('component.pendingIssueId !== issueId') &&
  pending.includes('saleTxSnap') && pending.includes('transaction.set(saleTxRef'));

check('Pending list is lazy, bounded to 50 by UI, and has no realtime bootstrap listener',
  pending.includes('async loadPendingIssues(limitCount = 50)') &&
  pending.includes('Math.min(100') &&
  app.includes("refreshInventoryPendingIssues?.()") &&
  !pending.includes('onSnapshot('));

check('Transactions with unresolved pending inventory cannot be hard-deleted',
  financeIntegrity.includes('resolve-pending-inventory-before-delete') &&
  financeIntegrity.includes('hasPendingInventoryPosting'));

check('Tuition/payment + inventory side writes share the same atomic transaction',
  read('js/core/tuitionMonthLedger.js').includes('sideChecks') &&
  read('js/core/tuitionMonthLedger.js').includes('sideWrites') &&
  pending.includes('sideWrites: [...plan.writes, ...debtWrites]'));

check('Firestore rules explicitly cover pending inventory records',
  rules.includes('match /inventoryPendingIssues/{issueId}') &&
  rules.includes('allow create, update, delete: if isSuperAdmin() || isClubAdmin(clubId)'));

check('V3F modules initialize from main and cache-bust marker is present',
  main.includes('initInventorySalePolicy()') && main.includes('initInventoryPendingService()') &&
  index.includes('per-club-inventory-policy-20260618-v3f'));


// Dynamic Firestore transaction regression for strict / pending / disabled modes.
const docs = new Map();
let autoId = 0;
const events = [];
const ref = (pathValue, id = pathValue.split('/').pop()) => ({ path: pathValue, id });
const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const applyTransform = (base, data, merge = false) => {
  const out = merge ? { ...(base || {}) } : {};
  for (const [key, value] of Object.entries(data || {})) {
    out[key] = value && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, '__inc')
      ? Number(out[key] || 0) + Number(value.__inc || 0)
      : clone(value);
  }
  return out;
};
const makeSnap = r => ({ id: r.id, exists: () => docs.has(r.path), data: () => clone(docs.get(r.path) || {}) });
const sdk = {
  collection(_db, ...parts) { return ref(parts.join('/'), parts.at(-1)); },
  doc(base, ...parts) {
    if (base?.path && parts.length === 0) {
      const id = 'auto-' + (++autoId);
      return ref(base.path + '/' + id, id);
    }
    const prefix = base?.path || '';
    const p = [prefix, ...parts].filter(Boolean).join('/');
    return ref(p, parts.at(-1) || p.split('/').pop());
  },
  increment(n) { return { __inc: Number(n) }; },
  arrayUnion(...values) { return { __arrayUnion: values }; },
  query(base, ...constraints) { return { base, constraints }; },
  where(field, op, value) { return { kind: 'where', field, op, value }; },
  limit(value) { return { kind: 'limit', value }; },
  async getDocs(q) {
    const prefix = q.base.path + '/';
    const whereStatus = q.constraints.find(x => x.kind === 'where');
    const lim = q.constraints.find(x => x.kind === 'limit')?.value || 50;
    const rows = [...docs.entries()]
      .filter(([path, data]) => path.startsWith(prefix) && (!whereStatus || data[whereStatus.field] === whereStatus.value))
      .slice(0, lim)
      .map(([path, data]) => ({ id: path.split('/').pop(), data: () => clone(data) }));
    return { docs: rows };
  },
  async runTransaction(_db, callback) {
    const writes = [];
    let writeStarted = false;
    const transaction = {
      async get(r) {
        if (writeStarted) throw new Error('mock-read-after-write');
        return makeSnap(r);
      },
      set(r, data, options) { writeStarted = true; writes.push(['set', r, data, options]); },
      update(r, data) { writeStarted = true; writes.push(['update', r, data]); },
      delete(r) { writeStarted = true; writes.push(['delete', r]); },
    };
    const result = await callback(transaction);
    for (const [op, r, data, options] of writes) {
      if (op === 'delete') docs.delete(r.path);
      else if (op === 'update') {
        if (!docs.has(r.path)) throw new Error('missing update doc ' + r.path);
        docs.set(r.path, applyTransform(docs.get(r.path), data, true));
      } else docs.set(r.path, applyTransform(docs.get(r.path), data, !!options?.merge));
    }
    return result;
  },
};

globalThis.CustomEvent = class CustomEvent { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } };
globalThis.window = {
  __store: {
    db: { id: 'mock-db' }, clubId: 'club-1',
    colRef: ref('clubs/club-1/transactions', 'transactions'),
    clubConfig: { inventorySalePolicy: 'allow_pending' },
  },
  _fb_init: sdk,
  getLocalToday: () => '2026-06-18',
  canonicalizeTransactionForWrite: tx => ({ ...tx }),
  mergeTransactionIntoRuntimeStore() {},
  mergeInventoryIntoRuntimeStore() {},
  notifyInventoryMutation() {},
  dispatchEvent(event) { events.push(event); },
};
docs.set('clubs/club-1/settings/inventory_stats', { 'Võ phục|||170_balance': 2, 'Võ phục|||170_out': 0 });
const pendingModule = await import(pathToFileURL(path.join(root, 'js/services/inventoryPending.service.js')).href + '?test=' + Date.now());
const svc = pendingModule.InventoryPendingService;
const txBase = {
  type: 'Võ phục', amount: 500000, description: 'Võ sinh A', date: '2026-06-18',
  components: [{ kind: 'inventory', amount: 500000, category: 'Võ phục', size: '170', qty: 1 }],
};

const pendingResult = await svc.commitFinancialTransaction({
  txData: txBase,
  inventory: { category: 'Võ phục', size: '170', qty: 1, amount: 500000, studentName: 'Võ sinh A' },
  postingMode: 'pending', reason: 'dynamic-pending-test'
});
const statsAfterPending = docs.get('clubs/club-1/settings/inventory_stats');
check('Dynamic pending sale writes finance + pending issue without decrementing stock',
  !!docs.get(`clubs/club-1/transactions/${pendingResult.id}`) &&
  !!docs.get(`clubs/club-1/inventoryPendingIssues/${pendingResult.pendingIssueId}`) &&
  statsAfterPending['Võ phục|||170_balance'] === 2 && statsAfterPending.pendingIssueCount === 1);

const strictResult = await svc.commitFinancialTransaction({
  txData: { ...txBase, description: 'Võ sinh B' },
  inventory: { category: 'Võ phục', size: '170', qty: 1, amount: 500000, studentName: 'Võ sinh B' },
  postingMode: 'posted', reason: 'dynamic-strict-test'
});
check('Dynamic strict sale decrements exactly one unit and creates a stock history row',
  docs.get('clubs/club-1/settings/inventory_stats')['Võ phục|||170_balance'] === 1 &&
  !!docs.get(`clubs/club-1/inventory/${strictResult.relatedInvId}`));

let rejected = false;
try {
  await svc.commitFinancialTransaction({
    txData: { ...txBase, description: 'Võ sinh C' },
    inventory: { category: 'Võ phục', size: '170', qty: 2, amount: 1000000, studentName: 'Võ sinh C' },
    postingMode: 'posted', reason: 'dynamic-insufficient-test'
  });
} catch (error) { rejected = /Kho không đủ/.test(String(error?.message)); }
check('Dynamic strict sale fails closed when stock is insufficient', rejected && docs.get('clubs/club-1/settings/inventory_stats')['Võ phục|||170_balance'] === 1);

await svc.reconcile(pendingResult.pendingIssueId);
const reconciledIssue = docs.get(`clubs/club-1/inventoryPendingIssues/${pendingResult.pendingIssueId}`);
const reconciledTx = docs.get(`clubs/club-1/transactions/${pendingResult.id}`);
check('Dynamic reconciliation consumes stock once and resolves the pending issue',
  docs.get('clubs/club-1/settings/inventory_stats')['Võ phục|||170_balance'] === 0 &&
  reconciledIssue.status === 'reconciled' && reconciledTx.inventoryPostingStatus === 'posted' &&
  Array.isArray(reconciledTx.pendingInventoryIssueIds) && reconciledTx.pendingInventoryIssueIds.length === 0 &&
  reconciledTx.components[0].pendingIssueId === '');
check('Dynamic reconciliation preserves original revenue and marks inventory history non-revenue',
  reconciledTx.amount === 500000 &&
  [...docs.entries()].some(([path, data]) => path.startsWith('clubs/club-1/inventory/') && data.pendingIssueId === pendingResult.pendingIssueId && data.affectsRevenue === false));

const pendingNoStockResult = await svc.commitFinancialTransaction({
  txData: { ...txBase, paymentKind: 'bundle', description: 'Võ sinh E' },
  inventory: { category: 'Võ phục', size: '180', qty: 1, amount: 450000, studentName: 'Võ sinh E' },
  postingMode: 'pending', reason: 'dynamic-not-applicable-resolution-test'
});
const balanceBeforeNotApplicable = docs.get('clubs/club-1/settings/inventory_stats')['Võ phục|||170_balance'];
await svc.markNotApplicable(pendingNoStockResult.pendingIssueId);
const noStockTx = docs.get(`clubs/club-1/transactions/${pendingNoStockResult.id}`);
const integrityModule = await import(pathToFileURL(path.join(root, 'js/core/transactionDeleteIntegrity.js')).href + '?test=' + Date.now());
const noStockImpact = integrityModule.TransactionDeleteIntegrity.analyzeTransactionDeleteImpact({ id: pendingNoStockResult.id, ...noStockTx });
check('Dynamic not-applicable resolution clears pending flags without changing stock',
  noStockTx.inventoryPostingStatus === 'not_applicable' &&
  noStockTx.pendingInventoryIssueIds.length === 0 && noStockTx.components[0].pendingIssueId === '' &&
  docs.get('clubs/club-1/settings/inventory_stats')['Võ phục|||170_balance'] === balanceBeforeNotApplicable);
check('Resolved not-applicable bundle is no longer permanently blocked from safe deletion',
  noStockImpact.hasPendingInventoryPosting === false && noStockImpact.safeToHardDelete === true);

const disabledResult = await svc.commitFinancialTransaction({
  txData: { ...txBase, description: 'Võ sinh D' },
  inventory: { category: 'Võ phục', size: '190', qty: 1, amount: 500000, studentName: 'Võ sinh D' },
  postingMode: 'not_applicable', reason: 'dynamic-disabled-test'
});
check('Dynamic disabled mode records finance only and creates no pending/stock row',
  disabledResult.postingStatus === 'not_applicable' && disabledResult.txData.inventoryPostingStatus === 'not_applicable' && !disabledResult.pendingIssueId && !disabledResult.relatedInvId &&
  !!docs.get(`clubs/club-1/transactions/${disabledResult.id}`));

console.log(`\nKết quả: ${pass} PASS / ${fail} FAIL\n`);
if (fail) process.exit(1);
