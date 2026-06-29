#!/usr/bin/env node
/** Phase 4K-6V2C — Inventory Ledger Reconciliation regression gate. */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const app = read('app.js');
const main = read('js/main.js');
const index = read('index.html');
const service = read('js/services/inventory.service.js');
const invModule = read('js/modules/inventory.js');
const financeService = read('js/services/finance.service.js');
const studentService = read('js/services/students.service.js');
const studentModule = read('js/modules/students.js');

let pass = 0;
let fail = 0;
function check(name, condition, detail = '') {
  if (condition) { pass++; console.log('✅', name); }
  else { fail++; console.error('❌', name + (detail ? ' — ' + detail : '')); }
}

console.log('\n=== Phase 4K-6V2C — Inventory Ledger Reconciliation ===\n');

check('Runtime exposes V2C patch marker', main.includes("window.APP_PATCH_VERSION = '4K-6V2C-inventory-ledger-reconciliation-20260616'"));
check('Index deploys V2C cache bust', index.includes('inventory-ledger-reconciliation-20260616-v2c'));
check('Changed inventory/student/finance modules are cache-busted', (main.includes("modules/students.js?v=quit-authoritative-full-sync-20260629-v4d4") || main.includes("modules/students.js?v=quit-mobile-authoritative-local-sync-20260628-v4d3") || main.includes("modules/students.js?v=profile-canonical-store-runtime-recovery-20260628-v4d1a")) && main.includes("modules/finance.js?v=inventory-ledger-reconciliation-20260616-v2c") && main.includes("modules/inventory.js?v=inventory-ledger-reconciliation-20260616-v2c"));
check('Changed service imports are cache-busted', invModule.includes("inventory.service.js?v=inventory-ledger-reconciliation-20260616-v2c") && financeService.includes("inventory.service.js?v=inventory-ledger-reconciliation-20260616-v2c"));
check('History page uses date-desc cursor so repaired legacy rows remain queryable', app.includes("const constraints = [orderBy('date', 'desc')]") && app.includes('startAfter(cursor)'));
check('New inventory writes always provide date and timestamp', service.includes('if (!payload.timestamp) payload.timestamp = Date.now()') && service.includes('if (!payload.date'));
check('Add inventory uses an atomic Firestore batch', service.includes('async addItem(data)') && service.includes('batch.set(itemRef, payload)') && service.includes('batch.set(statsRef, summaryPatch, { merge: true })'));
check('Add inventory does not silently continue after stock-summary failure', !service.slice(service.indexOf('async addItem(data)'), service.indexOf('async updateItem')).includes('catch'));
check('Update reverses previous contribution and applies next contribution', service.includes('{ item: previous, direction: -1 }') && service.includes('{ item: next, direction: 1 }'));
check('Delete reverses inventory contribution atomically', service.includes('async deleteItem') && service.includes("[{ item: previous, direction: -1 }]") && service.includes('batch.delete(itemRef)'));
check('Finance-related inventory deletion delegates to canonical ledger service', financeService.includes('InventoryService.deleteItem(invId'));
check('Add-student inventory write batches history and inventory_stats', studentService.includes('async addInventoryEntry') && studentService.includes('const batch = writeBatch(db)') && studentService.includes("settings', 'inventory_stats'"));
check('Add-student module no longer performs a second stock decrement', !studentModule.includes('decrementInventoryStock(uniformSize)'));
check('Runtime write-through avoids an immediate history read', app.includes('options && options.writeThrough === true') && app.includes('mergeInventoryIntoRuntimeStore'));
check('Manual reconciliation is explicit, not a recurring listener', invModule.includes('window.rebuildInventoryStatsFromHistory') && index.includes('btnRebuildInventoryStats'));
check('Reconciliation reads the inventory collection exactly once', (service.match(/getDocs\(collection\(db, 'clubs', clubId, 'inventory'\)\)/g) || []).length === 1);
check('Reconciliation repairs legacy rows missing date/timestamp', service.includes('function _canonicalTemporalPatch') && service.includes('_legacyTemporalRepairs'));
check('Legacy unknown dates are retained at the end instead of being excluded', service.includes("return '1970-01-01'") && service.includes('legacyDateUnknown'));
check('Temporal repairs are chunked below Firestore batch limit', service.includes('const BATCH_SIZE = 400'));
check('Rebuilt inventory_stats replaces drifted summary', service.includes("setDoc(doc(db, 'clubs', clubId, 'settings', 'inventory_stats'), summary)"));
check('Full rebuild publishes already-read rows without a second query', invModule.includes('replaceInventoryRuntimeStore(result.items'));
check('Inventory service pagination no longer orders by timestamp', !service.slice(service.indexOf('async getInventoryPage'), service.indexOf('// ── TRANSACTIONS')).includes("orderBy('timestamp', 'desc')"));
check('Canonical normal writes contain no full inventory scan', !service.slice(service.indexOf('async addItem(data)'), service.indexOf('async rebuildInventoryStats')).includes("getDocs(collection(db, 'clubs', _clubId(), 'inventory'))"));

// Dynamic service regression with an in-memory Firestore mock.
const inventory = new Map();
let stats = {};
let autoId = 0;
let getDocCalls = 0;
let getDocsCalls = 0;
const applied = [];
const ref = (pathValue, id = pathValue.split('/').pop()) => ({ path: pathValue, id });
const isStats = r => r.path.endsWith('/settings/inventory_stats');
const isInventory = r => r.path.includes('/inventory/');
function applySet(r, data, options = {}) {
  if (isStats(r)) {
    const next = options.merge ? { ...stats } : {};
    for (const [k, v] of Object.entries(data || {})) {
      next[k] = v && v.__inc !== undefined ? Number(next[k] || 0) + v.__inc : v;
    }
    stats = next;
  } else if (isInventory(r)) {
    inventory.set(r.id, options.merge ? { ...(inventory.get(r.id) || {}), ...data } : { ...data });
  }
}
function applyUpdate(r, data) {
  if (!inventory.has(r.id)) throw new Error('missing doc ' + r.id);
  inventory.set(r.id, { ...inventory.get(r.id), ...data });
}
function makeBatch() {
  const ops = [];
  return {
    set(r, data, options) { ops.push(['set', r, data, options]); },
    update(r, data) { ops.push(['update', r, data]); },
    delete(r) { ops.push(['delete', r]); },
    async commit() {
      for (const [kind, r, data, options] of ops) {
        applied.push(kind + ':' + r.path);
        if (kind === 'set') applySet(r, data, options);
        else if (kind === 'update') applyUpdate(r, data);
        else inventory.delete(r.id);
      }
    }
  };
}

globalThis.window = {
  __store: {
    db: { name: 'mock' },
    clubId: 'club-test',
    invRef: ref('clubs/club-test/inventory', 'inventory'),
  },
  _fb_init: {
    collection(_db, ...parts) { return ref(parts.join('/'), parts.at(-1)); },
    doc(base, ...parts) {
      if (base?.path && parts.length === 0) {
        const id = 'auto-' + (++autoId);
        return ref(base.path + '/' + id, id);
      }
      const prefix = base?.path ? base.path : '';
      const p = [prefix, ...parts].filter(Boolean).join('/');
      return ref(p, parts.at(-1) || p.split('/').pop());
    },
    writeBatch() { return makeBatch(); },
    increment(n) { return { __inc: Number(n) }; },
    async getDoc(r) {
      getDocCalls++;
      const data = inventory.get(r.id);
      return { id: r.id, exists: () => !!data, data: () => ({ ...data }) };
    },
    async getDocs() {
      getDocsCalls++;
      return {
        docs: Array.from(inventory.entries()).map(([id, data]) => ({ id, data: () => ({ ...data }) }))
      };
    },
    async setDoc(r, data, options) { applySet(r, data, options); },
  },
  getLocalToday: () => '2026-06-16',
  mergeInventoryIntoRuntimeStore() {},
  removeInventoryFromRuntimeStore() {},
  notifyInventoryMutation() {},
};

try {
  const url = pathToFileURL(path.join(root, 'js/services/inventory.service.js')).href + '?v2c-check=' + Date.now();
  const { InventoryService } = await import(url);
  const inputId = await InventoryService.addItem({ category: 'Võ phục', size: 'Size 1m9', type: 'Nhập kho', qty: 10, desc: 'NCC' });
  const outputId = await InventoryService.addItem({ category: 'Võ phục', size: 'Size 1m9', type: 'Xuất bán', qty: 3, desc: 'A' });
  check('Dynamic: input and output rows are both saved', inventory.size === 2 && inventory.has(inputId) && inventory.has(outputId));
  check('Dynamic: atomic ledger computes correct stock', stats['Võ phục|||Size 1m9_balance'] === 7 && stats['Võ phục|||Size 1m9_in'] === 10 && stats['Võ phục|||Size 1m9_out'] === 3);
  const previousOutput = { id: outputId, ...inventory.get(outputId) };
  await InventoryService.updateItem(outputId, { qty: 5 }, { previous: previousOutput });
  check('Dynamic: editing quantity reverses old out and applies new out', stats['Võ phục|||Size 1m9_balance'] === 5 && stats['Võ phục|||Size 1m9_out'] === 5);
  check('Dynamic: edit with local original performs no document read', getDocCalls === 0);
  await InventoryService.deleteItem(outputId, { previous: { id: outputId, ...inventory.get(outputId) } });
  check('Dynamic: delete reverses stock and removes history row', !inventory.has(outputId) && stats['Võ phục|||Size 1m9_balance'] === 10 && stats['Võ phục|||Size 1m9_out'] === 0);

  inventory.set('legacy-no-date', { category: 'Áo thun', size: 'XL', type: 'Nhập kho', qty: 4 });
  const rebuilt = await InventoryService.rebuildInventoryStats();
  check('Dynamic: rebuild performs one full collection read', getDocsCalls === 1);
  check('Dynamic: rebuild repairs missing temporal fields', inventory.get('legacy-no-date')?.date === '1970-01-01' && inventory.get('legacy-no-date')?.timestamp === 0);
  check('Dynamic: rebuilt summary includes legacy input', rebuilt.summary['Áo thun|||XL_balance'] === 4 && rebuilt.repairedTemporalCount >= 1);
  check('Dynamic: normal mutations required no full collection reads', getDocsCalls === 1);
  check('Dynamic: inventory and summary were committed through batches', applied.some(x => x.includes('/inventory/')) && applied.some(x => x.includes('/settings/inventory_stats')));
} catch (error) {
  check('Dynamic inventory ledger regression', false, error?.stack || String(error));
}

console.log(`\nTotal: ${pass + fail} | PASS: ${pass} | FAIL: ${fail}`);
if (fail) process.exit(1);
console.log('Phase 4K-6V2C inventory ledger reconciliation checks passed.\n');
