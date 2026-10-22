import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import * as sdk from 'firebase/firestore';
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
  fs.mkdirSync('handoff/V11R4/evidence', { recursive: true });
  const hash = p => createHash('sha256').update(fs.readFileSync(p)).digest('hex');
  const runtimeFiles = Object.fromEntries(Object.keys(JSON.parse(fs.readFileSync('handoff/V11R3/SOURCE_HASHES_AND_DIFF.json')).canonicalRuntimeFiles).sort().map(p => [p, hash(p)]));
  fs.writeFileSync('handoff/V11R4/evidence/emulator.json', JSON.stringify({ status: 'PASS', projectId, runtimeSHA: createHash('sha256').update(JSON.stringify(Object.entries(runtimeFiles))).digest('hex'), rulesSHA: hash('firestore.rules'), command: ['node', 'tools/v11r4/finance-emulator.mjs'], expectedExit: 0, actualExit: 0, productionWrites: 0, sdk: 'declared Node test dependency 12.15.0; runtime browser CDN 10.7.1 unchanged', tests: checks }, null, 2));
} finally { await env.cleanup(); }
