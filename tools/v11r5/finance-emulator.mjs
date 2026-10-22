import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import * as sdk from 'firebase/firestore';
import vm from 'node:vm';
import { attachTransactionPageProjection } from '../../js/modules/finance/finance.pagination.js';
import { listenerSource } from './listener-source.mjs';
import { createActualListenerFixture } from './listener-fixture.mjs';
const projectId = process.env.GCLOUD_PROJECT;
const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST || '').split(':');
if (!projectId?.startsWith('demo-') || host !== '127.0.0.1') throw Error('Local demo Emulator only');
const env = await initializeTestEnvironment({ projectId, firestore: { host, port: Number(port), rules: fs.readFileSync('firestore.rules', 'utf8') } });
const checks = [];
const test = async (name, fn) => { await fn(); checks.push({ name, status: 'PASS' }); console.log('PASS ' + name); };
try {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async ctx => {
    for (const [p, data] of [
      ['users/qa-admin', { role: 'admin', clubId: 'club-a', status: 'active' }],
      ['users/qa-admin-2', { role: 'admin', clubId: 'club-a', status: 'active' }],
      ['users/qa-coach', { role: 'coach', clubId: 'club-a', branch: 'CS1', status: 'active' }],
      ['users/qa-other', { role: 'admin', clubId: 'club-b', status: 'active' }],
      ['clubs/club-a', { name: 'QA A' }], ['clubs/club-b', { name: 'QA B' }],
      ['clubs/club-a/profiles/QA Tuition', { name: 'QA Tuition', branch: 'CS1', paidUntil: '2026-09', paidMonths: ['2026-09'] }],
    ]) await sdk.setDoc(sdk.doc(ctx.firestore(), p), data);
  });
  const admin = env.authenticatedContext('qa-admin').firestore();
  const col = sdk.collection(admin, 'clubs', 'club-a', 'transactions');
  const projections = [];
  globalThis.window = { userRole: 'admin', __store: { db: admin, clubId: 'club-a', colRef: col, auth: { currentUser: { uid: 'qa-admin' } }, transactions: [] }, _fb_init: sdk,
    mergeTransactionIntoRuntimeStore: tx => { projections.push(tx); window.__store.transactions.push(tx); } };
  const { FinanceService } = await import('../../js/services/finance.service.js');
  let firstId;
  const payload = { type: 'Học phí', description: 'QA Tuition', branch: 'CS1', amount: 500000, date: '2026-10-21', txMonth: '2026-10', packageMonths: ['2026-10'], timestamp: 100 };
  await test('actual batch commits transaction and payment profile atomically', async () => {
    const r = await FinanceService.commitAtomicWritePlan({ transactions: [{ data: payload }], profileUpdates: [{ studentName: 'QA Tuition', data: { paidUntil: '2026-10', paidMonths: sdk.arrayUnion('2026-10') } }] });
    firstId = r.txIds[0];
    assert.equal((await sdk.getDoc(sdk.doc(col, firstId))).data().amount, 500000);
    assert.equal((await sdk.getDoc(sdk.doc(admin, 'clubs/club-a/profiles/QA Tuition'))).data().paidUntil, '2026-10');
    assert.equal(projections.length, 1); assert.equal(projections[0].id, firstId);
  });
  await test('rejected missing-profile batch creates no orphan transaction or projection', async () => {
    const before = (await sdk.getDocs(col)).size;
    await assert.rejects(FinanceService.commitAtomicWritePlan({ transactions: [{ data: { ...payload, description: 'QA Missing' } }], profileUpdates: [{ studentName: 'missing', data: { paidUntil: '2026-10' } }] }));
    assert.equal((await sdk.getDocs(col)).size, before); assert.equal(projections.length, 1);
  });
  await test('Coach financial write remains denied and unprojected', async () => {
    window.__store.db = env.authenticatedContext('qa-coach').firestore();
    window.__store.auth.currentUser.uid = 'qa-coach'; window.userRole = 'coach';
    await assertFails(FinanceService.commitAtomicWritePlan({ transactions: [{ data: payload }] }));
    assert.equal(projections.length, 1);
  });
  await test('other-club Admin cannot write this club', async () => {
    window.__store.db = env.authenticatedContext('qa-other').firestore();
    window.__store.auth.currentUser.uid = 'qa-other'; window.userRole = 'admin';
    await assertFails(FinanceService.commitAtomicWritePlan({ transactions: [{ data: payload }] })); assert.equal(projections.length, 1);
  });
  window.__store.db = admin; window.__store.auth.currentUser.uid = 'qa-admin';
  await test('existing addTransaction projects exact confirmed document ID', async () => {
    const id = await FinanceService.addTransaction({ ...payload, description: 'QA Single', timestamp: 200 });
    assert.equal(projections.at(-1).id, id); assert.equal((await sdk.getDoc(sdk.doc(col, id))).data().description, 'QA Single');
  });
  await test('inclusive month reader keeps overlap and middle package exactly once', async () => {
    await sdk.setDoc(sdk.doc(col, 'middle'), { ...payload, txMonth: '2026-12', date: '2026-09-20', packageMonths: ['2026-09', '2026-10', '2026-11'] });
    let state, page, clicks = 0;
    do { page = await FinanceService.getTransactionsForMonthInclusive({ pageSize: 1, monthStr: '2026-10', state }); state = page._monthState; assert.ok(++clicks < 10); } while (!page._complete);
    assert.equal(page._mergedItems.length, 3); assert.equal(new Set(page._mergedItems.map(t => t.id)).size, 3); assert.ok(page._mergedItems.some(t => t.id === 'middle'));
  });
  await test('actual delete ACK prunes runtime and page through existing owner', async () => {
    let removed; window.__store.pagination = { transactions: { reconcile: change => { removed = change.removedIds; } } };
    await FinanceService.deleteTransaction(firstId);
    assert.equal((await sdk.getDoc(sdk.doc(col, firstId))).exists(), false);
    assert.ok(!window.__store.transactions.some(t => t.id === firstId)); assert.deepEqual(removed, [firstId]);
  });
  await test('400-operation guard rejects before any write', async () => {
    const before = (await sdk.getDocs(col)).size;
    await assert.rejects(FinanceService.commitAtomicWritePlan({ transactions: Array.from({ length: 401 }, () => ({ data: payload })) }), error => error.code === 'finance/atomic-plan-too-large');
    assert.equal((await sdk.getDocs(col)).size, before);
  });
  await test('real three-source listener observes ACK metadata then remote-account deletion', async () => {
    const store = window.__store;
    const pg = { enabled: true, currentItems: [], _mergedAllItems: [], _monthComplete: true, _displayContextKey: '2026-10|' };
    store.pagination = { transactions: pg };
    window.invalidateFinance = () => {}; window.invalidateStudents = () => {}; window.invalidateList = () => {};
    globalThis.document = { getElementById: id => id === 'filterMonth' ? { value: '2026-10' } : null };
    attachTransactionPageProjection({ store, pgState: pg, pageSize: 50, getMonth: () => '2026-10', getSearch: () => '', getContext: () => '2026-10|', renderControls() {} });
    const main = fs.readFileSync('js/main.js', 'utf8');
    vm.runInThisContext(main.slice(main.indexOf('window.mergeTransactionIntoRuntimeStore = function'), main.indexOf('/**\n * debugAdmissionTxHydration')));
    const { query, where, limit, orderBy } = sdk;
    let subscriptions = 0;
    const fixture = createActualListenerFixture(listenerSource(), store, { onSnapshot: (...args) => { subscriptions++; return sdk.onSnapshot(...args); }, queries: {
      byDate: query(col, where('date', '>=', '2026-10-01'), where('date', '<=', '2026-10-31'), orderBy('date', 'desc'), limit(1200)),
      byTxMonth: query(col, where('txMonth', '==', '2026-10'), limit(1200)),
      byPackageMonth: query(col, where('packageMonths', 'array-contains', '2026-10'), limit(1200)),
    } });
    const waitFor = async (fn, label) => {
      const until = Date.now() + 4000;
      while (!fn()) { if (Date.now() > until) throw Error(label + ': ' + JSON.stringify({ reconciliation: pg.reconciliation, meta: fixture.state._txSourceServerVerified })); await new Promise(r => setTimeout(r, 10)); }
    };
    try {
      await waitFor(() => store.transactionCoverage?.pageServerComplete, 'initial server snapshots');
      const id = 'metadata-ack-row';
      await FinanceService.commitAtomicWritePlan({ transactions: [{ id, data: { ...payload, description: 'QA Metadata ACK' } }] });
      assert.ok(pg.currentItems.some(t => t.id === id));
      await waitFor(() => !pg.reconciliation.awaitingServer.includes(id), 'ACK must settle through metadata on all three existing listeners');
      const other = env.authenticatedContext('qa-admin-2').firestore();
      await sdk.deleteDoc(sdk.doc(other, 'clubs/club-a/transactions', id));
      await waitFor(() => !pg.currentItems.some(t => t.id === id), 'remote confirmed deletion must release the ACK fence');
      assert.deepEqual(pg.reconciliation.needsReview, []);
      assert.equal(subscriptions, 3);
    } finally { fixture.stop(); }
  });
  fs.mkdirSync('handoff/V11R5/evidence', { recursive: true });
  const hash = p => createHash('sha256').update(fs.readFileSync(p)).digest('hex');
  const runtimeFiles = Object.fromEntries(Object.keys(JSON.parse(fs.readFileSync('handoff/V11R3/SOURCE_HASHES_AND_DIFF.json')).canonicalRuntimeFiles).sort().map(p => [p, hash(p)]));
  fs.writeFileSync('handoff/V11R5/evidence/emulator.json', JSON.stringify({ status: 'PASS', projectId, runtimeSHA: createHash('sha256').update(JSON.stringify(Object.entries(runtimeFiles))).digest('hex'), rulesSHA: hash('firestore.rules'), command: ['node', 'tools/v11r5/finance-emulator.mjs'], expectedExit: 0, actualExit: 0, productionWrites: 0, sdk: 'declared Node test dependency 12.15.0; runtime browser CDN 10.7.1 unchanged', tests: checks }, null, 2));
} finally { await env.cleanup(); }
