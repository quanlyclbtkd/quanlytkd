#!/usr/bin/env node
/** Phase 4K-6V3A — Firestore Read Attribution + Canonical Transaction Read Boundary */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = process.cwd();
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const app = read('app.js');
const main = read('js/main.js');
const index = read('index.html');
const boundary = read('js/core/transactionCanonicalBoundary.js');
const financeService = read('js/services/finance.service.js');
const inventoryService = read('js/services/inventory.service.js');
const studentService = read('js/services/students.service.js');
const offlineQueue = read('js/utils/offline-queue.js');
const profilesListener = read('js/listeners/profiles.listeners.js');
const studentsModule = read('js/modules/students.js');
const dashboard = read('js/modules/dashboard.js');

let pass = 0;
let fail = 0;
function check(name, condition, detail = '') {
  if (condition) { pass++; console.log('✅', name); }
  else { fail++; console.error('❌', name + (detail ? ' — ' + detail : '')); }
}

console.log('\n=== Phase 4K-6V3A — Firestore Read Attribution + Canonical Transaction Read Boundary ===\n');

check('V3A patch marker is active in app and main',
  app.includes('4K-6V3A-firestore-read-attribution-canonical-transaction-boundary') &&
  main.includes('4K-6V3A-firestore-read-attribution-canonical-transaction-boundary'));
check('Canonical boundary script loads before app.js',
  index.indexOf('transactionCanonicalBoundary.js?v=firestore-read-attribution-canonical-tx-boundary-20260616-v3a') >= 0 &&
  index.indexOf('transactionCanonicalBoundary.js') < index.indexOf('app.js?v=firestore-read-attribution-canonical-tx-boundary-20260616-v3a'));
check('Main module cache bust is V3A', index.includes("main.js?v=firestore-read-attribution-canonical-tx-boundary-20260616-v3a"));
check('Boundary exposes canonical create and patch helpers', boundary.includes('canonicalizeCreate') && boundary.includes('canonicalizePatch'));
check('Canonical months include date, txMonth, paymentMonth, packageMonths and components',
  boundary.includes('pushMonth(months, tx.date)') && boundary.includes('pushMonth(months, tx.txMonth)') &&
  boundary.includes('pushMonth(months, tx.paymentMonth)') && boundary.includes('tx.packageMonths') &&
  boundary.includes('tx.components'));
check('Canonical schema fields are written',
  boundary.includes('output.accountingMonths = months') && boundary.includes('output.primaryAccountingMonth') &&
  boundary.includes('output.accountingSchemaVersion = SCHEMA_VERSION'));
check('Boundary contains no realtime listener', !boundary.includes('onSnapshot'));
check('Canonical parity query is manual and uses accountingMonths array-contains',
  boundary.includes("where('accountingMonths', 'array-contains', month)") &&
  boundary.includes('runCanonicalTransactionParityAudit') &&
  !boundary.includes('setInterval('));
check('Parity audit has in-memory TTL cache to avoid repeated reads', boundary.includes('_auditCache') && boundary.includes('ttlMs'));
check('Legacy 3-query production authority remains present',
  app.includes('const qByDate') && app.includes('const qByTxMonth') && app.includes('const qByPackageMonth'));
check('Canonical query is not attached as production listener',
  !app.includes("onSnapshot(query(colRef, where('accountingMonths'") && !boundary.includes('safeRegisterSnapshot'));
check('Source-level transaction snapshots are attributed',
  app.includes("transactions.listener.' + sourceKey") && app.includes("_recordTxSourceSnapshot('byDate'") &&
  app.includes("_recordTxSourceSnapshot('byTxMonth'") && app.includes("_recordTxSourceSnapshot('byPackageMonth'"));
check('Transaction overlap and canonical coverage are measured without extra reads',
  app.includes('recordTransactionQueryOverlap') && boundary.includes('duplicateDocs') && boundary.includes('canonicalCoveragePercent'));
check('Same-month listener duplicate guard remains active',
  app.includes('_activeTxListenerMonth === monthStr') && app.includes('txSameMonthResubscribeSkipped'));
const appTxCreateCount = (app.match(/addDoc\(colRef,/g) || []).length;
const appCanonicalCreateCount = (app.match(/addDoc\(colRef,\s*_canonicalTxPayload/g) || []).length;
check('Direct app transaction creates all pass canonical boundary',
  appTxCreateCount > 0 && appTxCreateCount === appCanonicalCreateCount,
  `all=${appTxCreateCount}, canonical=${appCanonicalCreateCount}`);
check('Bundle builder returns canonical transaction',
  app.includes("return _canonicalTxPayload(transaction, 'payment-bundle-builder')"));
check('Finance service canonicalizes new transactions', financeService.includes("canonicalizeTransactionForWrite(data, 'finance-service-add')"));
check('Student service canonicalizes all transaction writers',
  studentService.includes('student-service-tuition') && studentService.includes('student-service-uniform') && studentService.includes('student-service-generic'));
check('Inventory service canonicalizes transaction create and related updates',
  inventoryService.includes('inventory-service-mark-paid') && inventoryService.includes('inventory-service-add-transaction') &&
  inventoryService.includes('inventory-service-update-related-transaction'));
check('Offline queued transaction writes are canonicalized',
  offlineQueue.includes('offline-queue-add') && offlineQueue.includes('offline-queue-update'));
check('Month matching supports canonical accountingMonths first',
  main.includes('Array.isArray(tx.accountingMonths) && tx.accountingMonths.includes(m)'));
check('Active, quit, fallback and debt profile reads are attributed',
  profilesListener.includes('profiles.activeListener') && (profilesListener.includes('profiles.quitAuthoritativeQuery') || profilesListener.includes('profiles.quitLazyQuery')) &&
  profilesListener.includes('profiles.fullFallbackQuery') && studentsModule.includes('profiles.debtFullScan'));
check('Inventory history and active-debt reads are attributed',
  app.includes('inventory.historyPage') && app.includes('inventory.activeDebtListener'));
check('Dashboard reads are attributed',
  dashboard.includes('dashboard.historicalStatsPointReads') && dashboard.includes('dashboard.monthStatsPointRead') &&
  dashboard.includes('dashboard.transactionFallbackQueries') && dashboard.includes('dashboard.sparkHistoryStatsReads'));
check('Notification reads are attributed',
  app.includes('notifications.initialQuery') && app.includes('notifications.unreadListener'));
check('Read audit warns that metrics are estimates, not billing truth',
  boundary.includes('không thay thế số liệu billing'));

// Dynamic test of the actual classic boundary script.
let getDocsCalls = 0;
const txA = { id: 'a', amount: 100, date: '2026-06-10', txMonth: '2026-05', packageMonths: ['2026-05', '2026-06'] };
const txB = { id: 'b', amount: 200, date: '2026-06-11', paymentMonth: '2026-06', components: [{ month: '2026-07', packageMonths: ['2026-08'] }] };
const docs = [
  { id: 'a', data: () => context.window.canonicalizeTransactionForWrite(txA, 'test-a') },
  { id: 'b', data: () => context.window.canonicalizeTransactionForWrite(txB, 'test-b') },
];
const context = {
  console: { log() {}, info() {}, warn() {}, error() {}, group() {}, groupEnd() {}, table() {} },
  document: { getElementById: () => ({ value: '2026-06' }) },
  setTimeout,
  clearTimeout,
};
context.window = {
  __scaleConfig: { txListenerLimit: 1200 },
  __store: { db: {}, clubId: 'club-test', _activeTxListenerMonth: '2026-06', transactions: [] },
  currentClubId: 'club-test',
  _fb_init: {
    collection: (...args) => ({ args }),
    query: (...args) => ({ args }),
    where: (...args) => ({ where: args }),
    limit: n => ({ limit: n }),
    async getDocs() { getDocsCalls++; return { size: docs.length, docs }; },
  },
  txMatchesSelectedMonth(tx, month) {
    return (Array.isArray(tx.accountingMonths) && tx.accountingMonths.includes(month)) ||
      tx.txMonth === month || tx.paymentMonth === month ||
      (Array.isArray(tx.packageMonths) && tx.packageMonths.includes(month)) ||
      String(tx.date || '').startsWith(month);
  },
};
vm.createContext(context);
vm.runInContext(boundary, context, { filename: 'transactionCanonicalBoundary.js' });

const api = context.window.CanonicalTransactionBoundary;
check('Dynamic: boundary initializes without any Firestore read', !!api && getDocsCalls === 0);
const months = api.deriveAccountingMonths(txB);
check('Dynamic: month union is normalized and complete',
  JSON.stringify(months) === JSON.stringify(['2026-06', '2026-07', '2026-08']));
const canonicalA = api.canonicalizeCreate(txA, 'dynamic-test');
check('Dynamic: create writes schema fields and preserves source data',
  canonicalA.accountingSchemaVersion === 1 && canonicalA.primaryAccountingMonth === '2026-05' &&
  canonicalA.accountingMonths.includes('2026-06') && canonicalA.amount === 100);
const bundle = api.canonicalizeCreate({ date: '2026-06-16', components: [{ month: '2026-07', packageMonths: ['2026-08', '2026-09'] }] }, 'bundle-test');
check('Dynamic: component months enter canonical boundary',
  ['2026-06', '2026-07', '2026-08', '2026-09'].every(m => bundle.accountingMonths.includes(m)));
api.recordRead('test.source', 10, { initial: true, reason: 'initial' });
api.recordRead('test.source', 2, { initial: false, reason: 'changes' });
check('Dynamic: attribution separates initial and changed documents',
  context.window.__firestoreReadAttribution.sources['test.source'].initialDocs === 10 &&
  context.window.__firestoreReadAttribution.sources['test.source'].changedDocs === 2);
const overlap = api.recordTransactionOverlap('2026-06', {
  byDate: [{ id: 'a', accountingMonths: ['2026-06'] }, { id: 'b', accountingMonths: ['2026-06'] }],
  byTxMonth: [{ id: 'a', accountingMonths: ['2026-06'] }],
  byPackageMonth: [{ id: 'a', accountingMonths: ['2026-06'] }],
});
check('Dynamic: overlap detects duplicate source reads', overlap.rawDocs === 4 && overlap.uniqueDocs === 2 && overlap.duplicateDocs === 2);
context.window.__store.transactions = docs.map(d => ({ id: d.id, ...d.data() }));
const parity = await api.runParityAudit('2026-06', { force: true });
check('Dynamic: manual parity audit compares canonical and legacy sets', parity.readyForCanonicalCutover === true && getDocsCalls === 1);
const cachedParity = await api.runParityAudit('2026-06');
check('Dynamic: repeated parity audit uses cache instead of another read', cachedParity.fromCache === true && getDocsCalls === 1);

console.log(`\nTotal: ${pass + fail} | PASS: ${pass} | FAIL: ${fail}`);
if (fail) process.exit(1);
console.log('Phase 4K-6V3A checks passed.\n');
