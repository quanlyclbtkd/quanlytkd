// Execute the real listener/projection owners. Transport is a deterministic local port.
import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { listenerSource } from '../v11r5/listener-source.mjs';
import { createActualListenerFixture } from '../v11r5/listener-fixture.mjs';
const root = path.resolve(process.env.REVIEW_SOURCE_ROOT || '.');
const { attachTransactionPageProjection } = await import(pathToFileURL(path.join(root, 'js/modules/finance/finance.pagination.js')));
const results = [];
for (const size of [100, 1000, 1500]) {
 const counts = { callbacks: 0, documentDecodes: 0, controls: 0, finance: 0, students: 0, dashboard: 0, subscriptions: 0 };
 const pg = { enabled: true, currentItems: [], _mergedAllItems: [], _monthComplete: false, _displayContextKey: '2026-10|' };
 const store = { clubId: 'demo-perf', auth: { currentUser: { uid: 'qa' } }, userRole: 'admin', pagination: { transactions: pg }, transactions: [] };
 globalThis.document = { getElementById: () => ({ value: '2026-10' }) };
 globalThis.window = { __store: store, userRole: 'admin', __verifiedAuthContextState: { generation: 1 }, __dataHydrationMetrics: {}, __txListenerMetrics: {},
  invalidateFinance: () => counts.finance++, invalidateStudents: () => counts.students++, invalidateDashboard: () => counts.dashboard++, invalidateList() {}, txMatchesSelectedMonth: () => true };
 attachTransactionPageProjection({ store, pgState: pg, pageSize: 50, getMonth: () => '2026-10', getSearch: () => '', getContext: () => '2026-10|', renderControls: () => counts.controls++ });
 const handlers = {};
 const fixture = createActualListenerFixture(listenerSource(root), store, { onSnapshot: (query, ...args) => { handlers[query.key] = args.at(-1); counts.subscriptions++; return () => {}; } });
 const rows = Array.from({ length: size }, (_, i) => ({ id: 'row-' + i, date: '2026-10-21', txMonth: '2026-10', packageMonths: ['2026-10'], amount: 500000, timestamp: i, description: 'QA ' + i, type: 'Học phí', branch: 'CS1' }));
 const sourceRows = { byDate: rows.slice(-1200), byTxMonth: rows.slice(0, 1200), byPackageMonth: rows.slice(-1200) };
 const emit = (key, metadataOnly, trusted = true) => {
  counts.callbacks++;
  const docs = sourceRows[key].map(row => ({ id: row.id, data: () => { counts.documentDecodes++; return row; } }));
  handlers[key]({ size: docs.length, docs, metadata: { fromCache: !trusted, hasPendingWrites: false }, docChanges: () => metadataOnly ? [] : docs.map(doc => ({ type: 'added', doc })) });
 };
 const all = (metadataOnly, trusted = true) => Object.keys(sourceRows).forEach(k => emit(k, metadataOnly, trusted));
 all(false); pg.reconcile({ rows: [rows.at(-1)] }); all(true);
 const before = { ...counts }, begin = performance.now();
 for (let i = 0; i < 100; i++) all(true);
 const elapsedMs = performance.now() - begin;
 const stable = Object.fromEntries(Object.keys(counts).map(k => [k, counts[k] - before[k]]));
 const beforeReconnect = { ...counts }; all(true, false); all(true, true);
 const reconnect = Object.fromEntries(Object.keys(counts).map(k => [k, counts[k] - beforeReconnect[k]]));
 results.push({ size, sourceDocuments: Object.values(sourceRows).map(r => r.length), retainedDocuments: store.transactions.length, subscriptions: counts.subscriptions, stableMetadata: { ...stable, elapsedMs }, reconnect, finalReconciliation: pg.reconciliation?.byId?.[rows.at(-1).id]?.state || null });
 fixture.stop();
}
if (process.argv.includes('--assert-optimized')) {
 for (const result of results) {
  assert.equal(result.subscriptions, 3);
  assert.equal(result.retainedDocuments, result.size);
  assert.equal(result.stableMetadata.callbacks, 300);
  for (const metric of ['documentDecodes', 'controls', 'finance', 'students', 'subscriptions']) assert.equal(result.stableMetadata[metric], 0, result.size + ': ' + metric);
  assert.equal(result.reconnect.students, 0);
  assert.equal(result.reconnect.subscriptions, 0);
  assert.equal(result.finalReconciliation, result.size === 1500 ? 'needs-review' : 'server-reconciled');
 }
}
const out = process.env.PERF_EVIDENCE || 'handoff/V11R6/evidence/metadata-performance.json'; fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify({ sourceRoot: root, scope: 'Local synthetic callback/projection CPU; not Firestore billing, device acceptance, or real reconnect traffic', optimizedAssertions: process.argv.includes('--assert-optimized'), sdkReadCallsAdded: 0, results }, null, 2));
results.forEach(r => console.log(JSON.stringify(r)));
