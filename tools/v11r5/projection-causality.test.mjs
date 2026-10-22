import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
const root = process.cwd();
const helper = path.resolve('js/modules/finance/finance.pagination.js');
const { attachTransactionPageProjection } = await import(pathToFileURL(helper));
const tests = [];
const test = (name, fn) => { try { fn(); tests.push({ name, status: 'PASS' }); } catch (error) { tests.push({ name, status: 'FAIL', actual: error.message, expected: 'assertion satisfied' }); } };
const tx = { id: 'confirmed-receipt-001', txMonth: '2026-10', date: '2026-10-21', packageMonths: ['2026-10'], timestamp: 1, description: 'QA Receipt', type: 'Học phí', branch: 'CS1', amount: 500000 };
function create(mode = 'legacy') {
  let month = '2026-10', search = '';
  const pg = { enabled: true, currentItems: [], _mergedAllItems: [], _monthComplete: true, _displayContextKey: '2026-10|' };
  const store = { clubId: 'demo-club', auth: { currentUser: { uid: 'admin-A' } }, userRole: 'admin', pagination: { transactions: pg } };
  globalThis.window = { __store: store, userRole: 'admin', __verifiedAuthContextState: { generation: 1 } };
  const api = attachTransactionPageProjection({ store, pgState: pg, pageSize: 50, getMonth: () => month, getSearch: () => search, getContext: () => month + '|' + search, renderControls: () => {} });
  const epoch = {}; store._activeTxProjectionEpoch = epoch;
  const keys = mode === 'canonical' ? ['canonical'] : ['byDate', 'byTxMonth', 'byPackageMonth'];
  const state = { epoch, mode, limit: 1200, rows: Object.fromEntries(keys.map(k => [k, []])), meta: Object.fromEntries(keys.map(k => [k, { revision: 0, trusted: false }])) };
  const evidence = () => ({ ...state, rows: { ...state.rows }, meta: { ...state.meta } });
  const snapshot = () => {
    const map = new Map(); for (const key of keys) for (const row of state.rows[key]) if (!map.has(row.id)) map.set(row.id, row);
    return { rows: [...map.values()], source: 'snapshot', complete: keys.every(k => state.meta[k].trusted && state.rows[k].length < state.limit), month, evidence: evidence() };
  };
  const feed = (key, rows, trusted = true) => { state.rows[key] = rows; state.meta[key] = { revision: state.meta[key].revision + 1, trusted }; const event = snapshot(); pg.reconcile(event); return event; };
  const feedAll = (rows, trusted = true) => { for (const key of keys) feed(key, rows, trusted); };
  return { pg, store, api, state, keys, snapshot, feed, feedAll, ids: () => pg.currentItems.map(t => t.id), commit: row => pg.reconcile({ rows: [row], source: 'commit' }), setMonth(m) { month = m; pg._displayContextKey = month + '|' + search; api.ensureLiveContext(); api.projectPage(); }, setSearch(q) { search = q; pg._displayContextKey = month + '|' + search; api.ensureLiveContext(); api.projectPage(); } };
}
test('ACK -> older complete snapshot without causal evidence keeps receipt', () => { const h = create(); h.commit(tx); h.pg.reconcile({ rows: [], source: 'snapshot', complete: true }); assert.deepEqual(h.ids(), [tx.id]); });
test('three pre-ACK server snapshots cannot remove ACKed ID', () => { const h = create(); h.commit(tx); h.feedAll([]); assert.deepEqual(h.ids(), [tx.id]); assert.ok(h.pg.reconciliation.needsReview.includes(tx.id)); });
test('cache-only presence does not settle ACK fence', () => { const h = create(); h.commit(tx); h.feedAll([tx], false); assert.ok(h.pg.reconciliation.awaitingServer.includes(tx.id)); });
test('pending/untrusted complete input cannot settle ACK', () => { const h = create(); h.commit(tx); h.pg.reconcile({ rows: [tx], source: 'snapshot', complete: true }); assert.ok(h.pg.reconciliation.awaitingServer.includes(tx.id)); });
test('one of three sources is not a complete ACK witness', () => { const h = create(); h.commit(tx); h.feed('byDate', [tx]); assert.ok(h.pg.reconciliation.awaitingServer.includes(tx.id)); });
test('all matching sources witness ACK and settle pending status', () => { const h = create(); h.commit(tx); h.feedAll([tx]); assert.deepEqual(h.pg.reconciliation.awaitingServer, []); assert.deepEqual(h.pg.reconciliation.needsReview, []); assert.deepEqual(h.ids(), [tx.id]); });
test('remote deletion needs subsequent absence in all matching streams', () => { const h = create(); h.commit(tx); h.feedAll([tx]); h.feed('byDate', []); h.feed('byTxMonth', []); assert.deepEqual(h.ids(), [tx.id]); h.feed('byPackageMonth', []); assert.deepEqual(h.ids(), []); assert.deepEqual(h.pg.reconciliation.needsReview, []); });
test('settled ACK is not pinned forever after confirmed remote removal', () => { const h = create(); h.commit(tx); h.feedAll([tx]); h.feedAll([]); h.api.projectPage(); assert.deepEqual(h.ids(), []); assert.ok(!h.pg._mergedAllItems.some(t => t.id === tx.id)); });
test('bare absence after witness stays reviewable without causal proof', () => { const h = create(); h.commit(tx); h.feedAll([tx]); h.pg.reconcile({ rows: [], source: 'snapshot', complete: true }); assert.deepEqual(h.ids(), [tx.id]); assert.ok(h.pg.reconciliation.needsReview.includes(tx.id)); });
test('explicit deletion ACK removes an unwitnessed receipt immediately', () => { const h = create(); h.commit(tx); h.pg.reconcile({ removedIds: [tx.id] }); assert.deepEqual(h.ids(), []); assert.deepEqual(h.pg.reconciliation.awaitingServer || [], []); });
test('overlapping pre-delete snapshot cannot undo confirmed deletion', () => { const h = create(); h.commit(tx); h.pg.reconcile({ removedIds: [tx.id] }); h.feedAll([tx]); assert.deepEqual(h.ids(), []); });
test('genuine recreation after confirmed absence can display', () => { const h = create(); h.commit(tx); h.feedAll([tx]); h.pg.reconcile({ removedIds: [tx.id] }); h.feedAll([]); h.feedAll([{ ...tx, amount: 600000 }]); assert.equal(h.pg.currentItems[0]?.amount, 600000); });
test('same ID with older payload cannot settle a later edit ACK', () => { const h = create(); h.commit({ ...tx, amount: 650000 }); h.feedAll([tx]); assert.equal(h.pg.currentItems[0]?.amount, 650000); assert.ok(h.pg.reconciliation.awaitingServer.includes(tx.id)); });
test('matching edited payload settles; later remote edit updates normally', () => { const h = create(); const latest = { ...tx, amount: 650000 }; h.commit(latest); h.feedAll([latest]); h.feedAll([{ ...latest, amount: 700000 }]); assert.equal(h.pg.currentItems[0]?.amount, 700000); });
test('date-only legacy document requires only its matching stream', () => { const h = create(); const row = { ...tx, txMonth: '2026-09', packageMonths: [] }; h.commit(row); h.feedAll([row]); h.feed('byDate', []); h.feed('byTxMonth', []); h.feed('byPackageMonth', []); assert.deepEqual(h.ids(), []); });
test('canonical reader uses its single existing source', () => { const h = create('canonical'); const row = { ...tx, accountingMonths: ['2026-10'] }; h.commit(row); h.feedAll([row]); assert.deepEqual(h.pg.reconciliation.awaitingServer, []); h.feedAll([]); assert.deepEqual(h.ids(), []); });
test('bounded stream cannot prove absence', () => { const h = create(); h.commit(tx); h.feedAll([tx]); h.state.limit = 1; h.feedAll([{ ...tx, id: 'other' }]); assert.ok(h.ids().includes(tx.id)); });
test('older source revisions are rejected after witness', () => { const h = create(); h.commit(tx); h.feedAll([]); const older = h.snapshot(); h.feedAll([tx]); h.pg.reconcile(older); assert.deepEqual(h.ids(), [tx.id]); });
test('old listener epoch is rejected after rebinding', () => { const h = create(); h.commit(tx); h.feedAll([tx]); const older = h.snapshot(); const next = {}; h.store._activeTxProjectionEpoch = next; h.state.epoch = next; h.feedAll([tx]); assert.equal(h.pg.reconcile(older), false); assert.deepEqual(h.ids(), [tx.id]); });
test('month switch hides out-of-month ACK; returning does not lose its fence', () => { const h = create(); h.commit(tx); h.setMonth('2026-11'); assert.deepEqual(h.ids(), []); h.setMonth('2026-10'); h.pg.reconcile({ rows: [], source: 'snapshot', complete: true }); assert.deepEqual(h.ids(), [tx.id]); });
test('search filtering never reassigns or deletes an ACK', () => { const h = create(); h.commit(tx); h.setSearch('excluded'); assert.deepEqual(h.ids(), []); h.setSearch(''); h.pg.reconcile({ rows: [], source: 'snapshot', complete: true }); assert.deepEqual(h.ids(), [tx.id]); });
for (const [name, mutate] of [
  ['UID', h => { h.store.auth.currentUser.uid = 'admin-B'; }],
  ['role', h => { window.userRole = 'coach'; }],
  ['club', h => { h.store.clubId = 'other'; }],
  ['session generation', h => { window.__verifiedAuthContextState.generation++; }],
]) test(name + ' switch rejects stale projection actions', () => { const h = create(); h.commit(tx); mutate(h); assert.equal(h.pg.reconcile({ rows: [{ ...tx, id: 'leak' }] }), false); assert.ok(!h.ids().includes('leak')); });
test('duplicate ACK/snapshots never duplicate a row', () => { const h = create(); h.commit(tx); h.commit(tx); h.feedAll([tx]); h.feedAll([tx]); assert.deepEqual(h.ids(), [tx.id]); });
test('projection owns no SDK reads, writer, storage or retry timer', () => { const s = fs.readFileSync(helper, 'utf8'); assert.ok(!/\b(?:getDoc|getDocs|onSnapshot|setDoc|addDoc|writeBatch|runTransaction|setTimeout|setInterval|localStorage|indexedDB)\s*[.(]/.test(s)); });
const failures = tests.filter(t => t.status === 'FAIL');
const result = { command: ['node', 'tools/v11r5/projection-causality.test.mjs'], sourceRoot: root, sourceSHA: createHash('sha256').update(fs.readFileSync(helper)).digest('hex'), expectedExit: 0, actualExit: failures.length ? 1 : 0, status: failures.length ? 'FAIL' : 'PASS', tests };
const out = process.env.R5_CAUSALITY_EVIDENCE || 'handoff/V11R5/evidence/projection-causality.json'; fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, JSON.stringify(result, null, 2));
tests.forEach(t => console.log(`${t.status} ${t.name}${t.status === 'FAIL' ? ': ' + t.actual : ''}`));
console.log(`TOTAL ${tests.length}; PASS ${tests.length - failures.length}; FAIL ${failures.length}`);
if (failures.length) process.exitCode = 1;
