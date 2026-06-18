#!/usr/bin/env node
/**
 * Phase 4K-6V3F1 runtime transaction regressions.
 * Uses an in-memory Firestore mock to verify atomic collection/edit behavior.
 */
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
let pass = 0;
let fail = 0;
function check(label, condition) {
  if (condition) { pass++; console.log('✅', label); }
  else { fail++; console.error('❌', label); }
}
const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const ref = pathValue => ({ path: pathValue, id: pathValue.split('/').pop() });

function makeMock() {
  const docs = new Map();
  const collectionPrefix = (...parts) => parts.filter(Boolean).join('/');
  const apply = (current, patch, merge = true) => {
    const out = merge ? { ...(current || {}) } : {};
    for (const [key, value] of Object.entries(patch || {})) {
      if (value && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, '__inc')) {
        out[key] = Number(out[key] || 0) + Number(value.__inc || 0);
      } else {
        out[key] = clone(value);
      }
    }
    return out;
  };
  const snap = r => ({
    id: r.id,
    ref: r,
    exists: () => docs.has(r.path),
    data: () => clone(docs.get(r.path) || {}),
  });

  const sdk = {
    doc(base, ...parts) {
      const prefix = base && base.path ? base.path : '';
      return ref([prefix, ...parts].filter(Boolean).join('/'));
    },
    collection(base, ...parts) {
      const prefix = base && base.path ? base.path : '';
      const p = [prefix, ...parts].filter(Boolean).join('/');
      return { path: p, id: p.split('/').pop() };
    },
    query(base, ...constraints) { return { base, constraints }; },
    where(field, op, value) { return { kind: 'where', field, op, value }; },
    limit(value) { return { kind: 'limit', value }; },
    increment(value) { return { __inc: Number(value) }; },
    async getDoc(r) { return snap(r); },
    async getDocs(q) {
      const prefix = q.base.path + '/';
      const wheres = (q.constraints || []).filter(c => c.kind === 'where');
      const lim = (q.constraints || []).find(c => c.kind === 'limit')?.value || Number.MAX_SAFE_INTEGER;
      const rows = [];
      for (const [p, data] of docs.entries()) {
        if (!p.startsWith(prefix)) continue;
        const remainder = p.slice(prefix.length);
        if (!remainder || remainder.includes('/')) continue;
        const matches = wheres.every(w => w.op === '==' ? data[w.field] === w.value : true);
        if (!matches) continue;
        rows.push({ id: p.split('/').pop(), ref: ref(p), data: () => clone(data) });
        if (rows.length >= lim) break;
      }
      return { docs: rows, empty: rows.length === 0 };
    },
    async runTransaction(_db, callback) {
      const writes = [];
      let writeStarted = false;
      const transaction = {
        async get(r) {
          if (writeStarted) throw new Error('mock-read-after-write');
          return snap(r);
        },
        set(r, data, options) { writeStarted = true; writes.push(['set', r, data, options]); },
        update(r, data) { writeStarted = true; writes.push(['update', r, data]); },
        delete(r) { writeStarted = true; writes.push(['delete', r]); },
      };
      const result = await callback(transaction);
      for (const [op, r, data, options] of writes) {
        if (op === 'delete') docs.delete(r.path);
        else if (op === 'update') {
          if (!docs.has(r.path)) throw new Error('mock-missing-update:' + r.path);
          docs.set(r.path, apply(docs.get(r.path), data, true));
        } else {
          docs.set(r.path, apply(docs.get(r.path), data, !!options?.merge));
        }
      }
      return result;
    },
  };

  return { docs, sdk, ref, collectionPrefix };
}

console.log('\n=== Phase 4K-6V3F1 — Runtime Collection/Edit Regression ===\n');

// 1) Inventory debt collection: one transaction only, even when clicked twice.
{
  const mock = makeMock();
  mock.docs.set('clubs/club-1/inventory/inv-1', {
    category: 'Võ phục', size: '170', qty: 1, desc: 'Võ Sinh A', studentName: 'Võ Sinh A',
    branch: 'CS1', amount: 650000, unpaid: true, inventoryDebtStatus: 'pending',
  });
  globalThis.window = {
    __store: {
      db: { id: 'mock-db' }, clubId: 'club-1',
      invRef: { path: 'clubs/club-1/inventory' },
      colRef: { path: 'clubs/club-1/transactions' },
    },
    _fb_init: mock.sdk,
    getLocalToday: () => '2026-06-18',
    canonicalizeTransactionForWrite: value => ({ ...value }),
    canonicalizeTransactionPatch: value => ({ ...value }),
    mergeTransactionIntoRuntimeStore() {},
    mergeInventoryIntoRuntimeStore() {},
    notifyInventoryMutation() {},
    refreshListsComputation() {},
    invalidateList() {},
    invalidateDashboard() {},
  };
  const { InventoryService } = await import(pathToFileURL(path.join(root, 'js/services/inventory.service.js')).href + `?runtime=${Date.now()}`);
  const first = await InventoryService.markPaid('inv-1');
  const second = await InventoryService.markPaid('inv-1');
  const paidInv = mock.docs.get('clubs/club-1/inventory/inv-1');
  const txPaths = [...mock.docs.keys()].filter(p => p.startsWith('clubs/club-1/transactions/'));
  check('Runtime: clicking 💰 Thu marks the inventory debt paid', first.alreadyPaid === false && paidInv.unpaid === false && paidInv.inventoryDebtStatus === 'paid');
  check('Runtime: repeated click is detected as already paid', second.alreadyPaid === true);
  check('Runtime: repeated collection creates exactly one revenue transaction', txPaths.length === 1 && txPaths[0].endsWith('/inventory-debt-inv-1'));
  check('Runtime: collected inventory revenue is categorized as Kho đồ', mock.docs.get(txPaths[0]).revenueCategory === 'inventory' || mock.docs.get(txPaths[0]).revenueCategories?.includes('inventory') || mock.docs.get(txPaths[0]).components?.[0]?.kind === 'inventoryDebt');
}

// 2) Inline editor: updates component totals and linked inventory amount only.
{
  const mock = makeMock();
  mock.docs.set('clubs/club-1/transactions/tx-1', {
    type: 'Học phí', description: 'Võ Sinh B', studentName: 'Võ Sinh B', branch: 'CS1',
    amount: 1100000, date: '2026-06-18', txMonth: '2026-06',
    components: [
      { kind: 'tuition', label: 'Học phí T6/2026', amount: 500000, packageMonths: ['2026-06'] },
      { kind: 'inventory', label: 'Võ phục 170', amount: 600000, relatedInvId: 'inv-2', qty: 1, category: 'Võ phục', size: '170' },
    ],
  });
  mock.docs.set('clubs/club-1/inventory/inv-2', {
    category: 'Võ phục', size: '170', qty: 1, amount: 600000, branch: 'CS1', type: 'Xuất bán',
  });
  globalThis.window = {
    __store: {
      db: { id: 'mock-db' }, clubId: 'club-1',
      colRef: { path: 'clubs/club-1/transactions' },
      transactions: [],
    },
    _fb_init: mock.sdk,
    currentUserEmail: 'admin@example.com',
    buildCanonicalRevenueMetadata(tx) {
      const categories = (tx.components || []).map(c => c.kind === 'inventoryDebt' ? 'inventory' : c.kind).filter(Boolean);
      return { revenueSchemaVersion: 1, revenueCategories: [...new Set(categories)] };
    },
    canonicalizeTransactionPatch: patch => ({ ...patch }),
    mergeTransactionIntoRuntimeStore() {},
    invalidateFinance() {}, invalidateInventory() {}, invalidateDashboard() {},
    refreshListsComputation() {}, invalidateList() {},
  };
  const { FinanceService } = await import(pathToFileURL(path.join(root, 'js/services/finance.service.js')).href + `?runtime=${Date.now()}`);
  const updated = await FinanceService.updateRevenueTransactionAtomic('tx-1', {
    componentAmounts: { 0: 550000, 1: 650000 },
    amount: 1200000,
    note: 'Sửa thao tác nhập nhầm',
  });
  const tx = mock.docs.get('clubs/club-1/transactions/tx-1');
  const inv = mock.docs.get('clubs/club-1/inventory/inv-2');
  check('Runtime: inline editor recomputes the transaction total from components', updated.amount === 1200000 && tx.amount === 1200000);
  check('Runtime: inline editor preserves separate Học phí/Kho components', tx.components[0].amount === 550000 && tx.components[1].amount === 650000);
  check('Runtime: linked Kho amount follows the edited component', inv.amount === 650000);
  check('Runtime: editing money never changes inventory quantity', inv.qty === 1);
  check('Runtime: edited bundle keeps revenue categories separated', tx.revenueCategories.includes('tuition') && tx.revenueCategories.includes('inventory'));
}

console.log(`\nKết quả: ${pass} PASS / ${fail} FAIL`);
if (fail) process.exit(1);
