#!/usr/bin/env node
/** Phase 4K-6V3BC1 — Automatic Canonical Transaction Optimization */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = process.cwd();
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const app = read('app.js');
const index = read('index.html');
const boundary = read('js/core/transactionCanonicalBoundary.js');

let pass = 0;
let fail = 0;
function check(name, condition, detail = '') {
  if (condition) { pass++; console.log('✅', name); }
  else { fail++; console.error('❌', name + (detail ? ' — ' + detail : '')); }
}

console.log('\n=== Phase 4K-6V3BC1 — Automatic Canonical Transaction Optimization ===\n');

const build = 'automatic-canonical-transaction-optimization-20260616-v3bc1';
check('V3BC1 cache-bust is active for boundary, app and main',
  index.includes(`transactionCanonicalBoundary.js?v=${build}`) &&
  index.includes(`app.js?v=${build}`) &&
  index.includes(`main.js?v=${build}`));
check('Manual one-time optimizer button is no longer created',
  !boundary.includes("button.id = 'btnCanonicalTxOptimize'") &&
  !boundary.includes("global.confirm(message)") &&
  boundary.includes('removeOptimizerButton'));
check('Automatic scheduling starts only after safe legacy overlap',
  boundary.includes("scheduleAutomaticCutover(month, 'legacy-snapshots-ready')") &&
  boundary.includes('report.safeForBackfill'));
check('Automatic cutover remains per-club and per-month',
  boundary.includes("AUTO_STORAGE_PREFIX") && boundary.includes("ctx.clubId + ':' + month"));
check('Automatic retry uses cooldown after failure',
  boundary.includes('AUTO_RETRY_COOLDOWN_MS') && boundary.includes("record.status === 'failed'"));
check('Transient offline/write-busy states are deferred, not marked successful',
  boundary.includes("blocked === 'financial-action-in-flight'") && boundary.includes("blocked === 'offline'"));
check('Only authorized club admin roles can auto-optimize',
  boundary.includes('isAdminRuntime()') && boundary.includes("return 'role-not-allowed'"));
check('Backfill plan uses loaded store transactions instead of collection scan',
  boundary.includes('store.transactions') && boundary.includes('estimatedReadsForBackfill: 0'));
check('Backfill writes only canonical fields in chunks of 400',
  boundary.includes('i += 400') && boundary.includes('accountingMonths: canonical.accountingMonths'));
check('Legacy listeners are detached before backfill',
  boundary.indexOf("detachFinanceListener('canonical-cutover-backfill')") < boundary.indexOf('const chunks = []'));
check('Exact parity remains mandatory before config cutover',
  boundary.indexOf('if (!parity.readyForCanonicalCutover') < boundary.indexOf('await persistReadMode(month, true)'));
check('Failure still reattaches legacy listener',
  boundary.includes("reattachMonth(month, 'legacy', 'parity-failed')") &&
  boundary.includes("reattachMonth(month, 'legacy', 'cutover-error')"));
check('Successful mode is persisted in each club main_config',
  boundary.includes("'clubs', ctx.clubId, 'settings', 'main_config'") &&
  boundary.includes('canonicalTransactionReadMonths'));
check('Existing settings listener selects one or three listeners without new config listener',
  app.includes("syncCanonicalTransactionReadModeFromConfig('settings-snapshot')") &&
  !boundary.includes("onSnapshot(") && !boundary.includes('setInterval('));
check('Club switch and logout cancel stale automatic timers',
  app.includes("resetAutomaticCanonicalTransactionOptimization('club-switch')") &&
  app.includes("resetAutomaticCanonicalTransactionOptimization('logout')"));
check('Emergency rollback API remains available without UI button',
  boundary.includes('disableCanonicalRead') && boundary.includes('arrayRemove(month)'));

let getDocsCalls = 0;
let setDocCalls = 0;
let batchCommits = 0;
let cleanupCalls = 0;
let listenCalls = [];
let timerId = 0;
const pendingTimers = new Map();
const storage = new Map();
const dbDocs = new Map();
const legacy = [
  { id: 'a', amount: 300000, date: '2026-06-10', txMonth: '2026-06' },
  { id: 'b', amount: 900000, date: '2026-06-12', txMonth: '2026-08', packageMonths: ['2026-06', '2026-07', '2026-08'] },
];
legacy.forEach(tx => dbDocs.set(tx.id, { ...tx }));

const documentMock = {
  readyState: 'complete',
  getElementById(id) {
    if (id === 'filterMonth') return { value: '2026-06' };
    if (id === 'btnCanonicalTxOptimize') return null;
    return null;
  },
  addEventListener() {},
};
const context = {
  console: { log() {}, info() {}, warn() {}, error() {}, group() {}, groupEnd() {}, table() {} },
  document: documentMock,
  setTimeout(fn) { const id = ++timerId; pendingTimers.set(id, fn); return id; },
  clearTimeout(id) { pendingTimers.delete(id); },
  Map, Set, Date, Number, String, Object, Array, Math, Error, JSON,
};
context.window = {
  document: documentMock,
  userRole: 'admin',
  currentClubId: 'club-test',
  navigator: { onLine: true },
  localStorage: {
    getItem(key) { return storage.has(key) ? storage.get(key) : null; },
    setItem(key, value) { storage.set(key, String(value)); },
    removeItem(key) { storage.delete(key); },
  },
  __scaleConfig: { txListenerLimit: 1200 },
  __store: {
    db: {}, clubId: 'club-test', userRole: 'admin',
    clubConfig: {},
    _activeTxListenerMonth: '2026-06',
    _activeTxReadMode: 'legacy',
    transactions: legacy.map(tx => ({ ...tx })),
  },
  _fb_init: {
    collection: (...args) => ({ kind: 'collection', args }),
    query: (...args) => ({ kind: 'query', args }),
    where: (...args) => ({ kind: 'where', args }),
    limit: n => ({ kind: 'limit', n }),
    doc: (...args) => ({ path: args.slice(1).join('/') }),
    arrayUnion: value => ({ op: 'union', value }),
    arrayRemove: value => ({ op: 'remove', value }),
    writeBatch() {
      const writes = [];
      return {
        set(ref, patch) { writes.push({ ref, patch }); },
        async commit() {
          batchCommits++;
          writes.forEach(({ ref, patch }) => {
            const id = ref.path.split('/').at(-1);
            dbDocs.set(id, { ...(dbDocs.get(id) || {}), ...patch });
          });
        },
      };
    },
    async getDocs() {
      getDocsCalls++;
      const docs = [...dbDocs.entries()]
        .filter(([, tx]) => Array.isArray(tx.accountingMonths) && tx.accountingMonths.includes('2026-06'))
        .map(([id, tx]) => ({ id, data: () => ({ ...tx }) }));
      return { size: docs.length, docs };
    },
    async setDoc(_ref, patch) {
      setDocCalls++;
      const field = patch.canonicalTransactionReadMonths;
      const current = context.window.__store.clubConfig.canonicalTransactionReadMonths || [];
      if (field.op === 'union') context.window.__store.clubConfig.canonicalTransactionReadMonths = [...new Set([...current, field.value])];
      if (field.op === 'remove') context.window.__store.clubConfig.canonicalTransactionReadMonths = current.filter(v => v !== field.value);
    },
  },
  txMatchesSelectedMonth(tx, month) {
    return (Array.isArray(tx.accountingMonths) && tx.accountingMonths.includes(month)) ||
      tx.txMonth === month || tx.paymentMonth === month ||
      (Array.isArray(tx.packageMonths) && tx.packageMonths.includes(month)) ||
      String(tx.date || '').startsWith(month);
  },
  cleanupListenersByOwner() { cleanupCalls++; },
  listenToData(month) {
    const mode = context.window.getCanonicalTransactionReadMode('club-test', month);
    listenCalls.push(mode);
    context.window.__store._activeTxListenerMonth = month;
    context.window.__store._activeTxReadMode = mode;
  },
  addEventListener() {},
  showToast() {},
};
vm.createContext(context);
vm.runInContext(boundary, context, { filename: 'transactionCanonicalBoundary.js' });
const api = context.window.CanonicalTransactionBoundary;

const overlap = api.recordTransactionOverlap('2026-06', {
  byDate: legacy,
  byTxMonth: [legacy[0]],
  byPackageMonth: [legacy[1]],
  sourceSeen: { byDate: true, byTxMonth: true, byPackageMonth: true },
  queryLimit: 1200,
});
check('Dynamic: safe overlap automatically schedules one cutover', overlap.safeForBackfill && api.getAutomaticOptimizationStatus('2026-06').scheduled);
check('Dynamic: scheduling itself performs zero Firestore reads/writes', getDocsCalls === 0 && batchCommits === 0 && setDocCalls === 0);

const autoResult = await api.runAutomaticCutover('2026-06', 'test-auto');
check('Dynamic: automatic cutover succeeds without button or confirm', autoResult.ok && autoResult.cutoverEnabled);
check('Dynamic: auto backfill uses one batch and one parity query', batchCommits === 1 && getDocsCalls === 1);
check('Dynamic: per-club config is persisted after parity', setDocCalls === 1 && api.getReadMode('club-test', '2026-06') === 'canonical');
check('Dynamic: listener lifecycle ends in canonical mode', cleanupCalls >= 1 && listenCalls.at(-1) === 'canonical');
check('Dynamic: automatic status records durable success', api.getAutomaticOptimizationStatus('2026-06').record?.status === 'success');
check('Dynamic: all migrated documents contain selected accounting month', [...dbDocs.values()].every(tx => tx.accountingMonths.includes('2026-06')));

await api.disableCanonicalRead('2026-06');
check('Dynamic: emergency rollback returns to legacy mode', api.getReadMode('club-test', '2026-06') === 'legacy' && listenCalls.at(-1) === 'legacy');

// Viewer must never schedule/write.
api.resetAutomaticOptimization('viewer-test');
context.window.userRole = 'viewer';
context.window.__store.userRole = 'viewer';
api.recordTransactionOverlap('2026-06', {
  byDate: legacy, byTxMonth: [legacy[0]], byPackageMonth: [legacy[1]],
  sourceSeen: { byDate: true, byTxMonth: true, byPackageMonth: true }, queryLimit: 1200,
});
check('Dynamic: viewer account cannot auto-schedule migration writes', !api.getAutomaticOptimizationStatus('2026-06').scheduled);

// Truncation must block automatic scheduling.
context.window.userRole = 'admin';
context.window.__store.userRole = 'admin';
api.resetAutomaticOptimization('truncation-test');
api.recordTransactionOverlap('2026-06', {
  byDate: Array.from({ length: 1200 }, (_, i) => ({ id: 't' + i, date: '2026-06-01' })),
  byTxMonth: [], byPackageMonth: [],
  sourceSeen: { byDate: true, byTxMonth: true, byPackageMonth: true }, queryLimit: 1200,
});
check('Dynamic: source limit blocks unsafe automatic cutover', !api.getAutomaticOptimizationStatus('2026-06').scheduled);

console.log(`\nTotal: ${pass + fail} | PASS: ${pass} | FAIL: ${fail}`);
if (fail) process.exit(1);
console.log('Phase 4K-6V3BC1 checks passed.\n');
