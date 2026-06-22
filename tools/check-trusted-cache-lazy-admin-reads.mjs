#!/usr/bin/env node
/** Phase 4K-6V4C1 — Trusted Cache + Lazy Admin Reads */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = process.cwd();
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const index = read('index.html');
const app = read('app.js');
const policy = read('js/core/firestoreCachePolicy.js');
const firebaseConfig = read('js/firebase/config.js');
const profileShadow = read('js/core/profileDeltaSyncShadow.js');
const profilesListener = read('js/listeners/profiles.listeners.js');
const tabs = read('js/ui/tabs.js');
const inventoryStore = read('js/data/inventoryStore.js');
const reports = read('js/modules/reports.js');
const reportFacade = read('js/modules/reports/reportExportFacade.js');

let pass = 0;
let fail = 0;
function check(name, ok, detail = '') {
  if (ok) { pass++; console.log('✅', name); }
  else { fail++; console.error('❌', name + (detail ? ' — ' + detail : '')); }
}

console.log('\n=== Phase 4K-6V4C1 — Trusted Cache + Lazy Admin Reads ===\n');

const build = 'coach-branch-resolution-20260622-v4c2a';
const reportBuild = 'trusted-cache-lazy-admin-20260620-v4c1';
const policySrc = `./js/core/firestoreCachePolicy.js?v=${build}`;
const appSrc = `app.js?v=${build}`;
check('Cache policy loads before app.js',
  index.includes(policySrc) && index.includes(appSrc) && index.indexOf(policySrc) < index.indexOf(appSrc));
check('Firebase CDN exposes persistent and memory cache primitives',
  index.includes('initializeFirestore') && index.includes('persistentLocalCache') &&
  index.includes('persistentMultipleTabManager') && index.includes('memoryLocalCache') &&
  index.includes('clearIndexedDbPersistence') && index.includes('terminate'));
check('Login UI contains trusted-device consent and clear-cache controls',
  index.includes('trustedDeviceCheckbox') && index.includes('trustedDeviceHint') && index.includes('clearTrustedDeviceCacheBtn'));
check('Legacy and module Firebase bootstraps share FirestoreCachePolicy',
  app.includes('window.FirestoreCachePolicy.initialize(app)') &&
  firebaseConfig.includes('window.FirestoreCachePolicy.initialize(app)') &&
  app.includes('window.__primaryFirestoreDb = db'));
check('Cache policy is opt-in and separates persistent from memory-only mode',
  policy.includes("PREF_KEY = 'tst_trusted_device_v1'") &&
  policy.includes("state.mode = 'persistent-multi-tab'") &&
  policy.includes("state.mode = 'memory-only'"));
check('Cache policy exposes clear-cache and optimization diagnostics',
  policy.includes('clearTrustedDeviceData') && policy.includes('clearIndexedDbPersistence') &&
  policy.includes('printFirestoreOptimizationStatus') && policy.includes('getFirestoreOptimizationStatus') &&
  policy.includes('bindAuthenticatedUser') && app.includes('bindFirestoreCacheUser(user.uid)'));

check('Profile delta readiness runs in shadow mode without Firestore operations',
  index.includes(`profileDeltaSyncShadow.js?v=${build}`) &&
  profileShadow.includes('shadowOnly: true') && profileShadow.includes('cutoverAllowed: false') &&
  !/\b(getDocs|onSnapshot|setDoc|updateDoc|addDoc|deleteDoc|writeBatch|runTransaction)\s*\(/.test(profileShadow));
check('Active profile listener feeds only already-loaded maps into shadow diagnostics',
  profilesListener.includes("recordProfileDeltaShadowSnapshot(activeMap") &&
  profilesListener.includes("source: 'active-profiles-snapshot'") &&
  profilesListener.indexOf('setActiveProfiles(activeMap') < profilesListener.indexOf('recordProfileDeltaShadowSnapshot(activeMap'));

const inventoryBoundary = app.slice(
  app.indexOf('// ── Complete active debt listener'),
  app.indexOf('window.printInventoryReadMetrics')
);
check('Inventory debt listener is declared but not mounted before lazy ensure function',
  inventoryBoundary.indexOf('window.ensureInventoryDebtListener') >= 0 &&
  inventoryBoundary.indexOf('window.ensureInventoryDebtListener') < inventoryBoundary.indexOf('onSnapshot(_inventoryDebtQuery'));
check('Inventory debt starts unmounted and tracks one session mount reason',
  app.includes("window.__inventoryDebtCompleteness = 'unmounted'") &&
  app.includes('window.__inventoryDebtListenerMounted = false') &&
  app.includes('window.__inventoryDebtListenerMountReason = reason'));
check('Kho and Báo nợ tabs trigger lazy debt listener in legacy and module controllers',
  app.includes("ensureInventoryDebtListener?.('legacy-enter-inventory-tab')") &&
  app.includes("ensureInventoryDebtListener?.('legacy-enter-debt-tab')") &&
  tabs.includes("tabId === 'inventory' || tabId === 'debt'") &&
  tabs.includes("ensureInventoryDebtListener('module-switch-' + tabId + '-tab')"));
check('Inventory feature gate mounts debts only for debt-dependent features',
  inventoryStore.includes("new Set(['feeReceipt', 'financeDebt', 'debtList', 'debtReport', 'inventoryTab', 'export'])") &&
  inventoryStore.includes("ensureInventoryDebtListener('feature:' + k"));
check('Thu gộp opens lazy source and blocks write until debt completeness',
  app.includes("ensureInventoryDebtListener?.('open-multi-item-modal')") &&
  app.includes("reason: 'process-multi-item'") &&
  app.includes('Chưa đồng bộ đủ công nợ Kho'));
check('Excel export waits for complete inventory debt data',
  reports.includes("reason: 'excel-export'") && reports.includes('waitForInventoryDebtCompleteness') &&
  reports.includes('chưa thể xuất báo cáo chính xác'));
check('Reports lazy import uses current cache-bust without creating duplicate module identities',
  reportFacade.includes(`reports.js?v=${reportBuild}`));

const notifBootstrapPos = app.indexOf('// ── Khởi động thông báo báo cáo HLV');
const notifBootstrap = app.slice(notifBootstrapPos, notifBootstrapPos + 750);
const notifSetupPos = app.indexOf('window.setupNotifListener = () =>');
const notifSetup = app.slice(notifSetupPos, notifSetupPos + 3300);
check('Admin bootstrap no longer runs duplicate getDocs notification query',
  notifBootstrap.includes('setupNotifListener') && !notifBootstrap.includes('checkAdminNotifications'));
check('Notification listener is limited to 50 and stable across duplicate setup calls',
  notifSetup.includes("orderBy('createdAt', 'desc'),\n                limit(50)") &&
  !notifSetup.includes("removeListener(_notifKey, 'notif-reinit')") &&
  notifSetup.includes('if (window._notifUnsubscribe) return true'));
check('Manual notification query remains available but is not called by bootstrap',
  app.includes('window.checkAdminNotifications = async') &&
  app.split('checkAdminNotifications').length === 2);

check('Admin Học phí/Báo nợ/Kho source implementations remain present',
  app.includes('startTransactionListenerAfterSettings(lMonth)') &&
  app.includes('onSnapshot(invStatsRef, _invStatsCb)') &&
  app.includes("query(invRef, where('unpaid', '==', true))") &&
  app.includes('getChargeableTuitionMonths'));
check('Coach Attendance-only boundary remains active',
  app.includes("canMount?.('transactions.month'") &&
  app.includes("canMount?.('inventory.active-debts'") &&
  index.includes(`roleReadBoundary.js?v=${build}`));

{
  const values = new Map();
  const window = {
    localStorage: {
      getItem(key) { return values.get(key) || null; },
      setItem(key, value) { values.set(key, String(value)); },
      removeItem(key) { values.delete(key); },
    },
    FirestoreCachePolicy: { readPreference() { return true; } },
    __store: { clubId: 'club-a', userRole: 'admin' },
    console: { log() {}, group() {}, groupEnd() {}, table() {} },
  };
  const context = { window, console: window.console, Date, Object, Array, String, Number, Math, JSON, Map, Set, Error };
  vm.createContext(context);
  vm.runInContext(profileShadow, context, { filename: 'profileDeltaSyncShadow.js' });
  const result = window.ProfileDeltaSyncShadow.recordSnapshot({
    'Nguyễn Thu Phương': { profileId: 'p-1', status: 'active', branch: 'CS1', updatedAt: '2026-06-20T10:00:00Z', syncVersion: 10 },
    'Võ Sinh B': { profileId: 'p-2', status: 'active', branch: 'CS1' },
  }, { source: 'test', clubId: 'club-a', role: 'admin', branch: 'all' });
  const persisted = [...values.values()].join(' ');
  check('Dynamic: profile shadow measures write-boundary coverage without enabling cutover',
    result.count === 2 && result.updatedAtCoveragePct === 50 && result.syncVersionCoveragePct === 50 &&
    result.cutoverAllowed === false && result.readyForV4C2WriteBoundary === false);
  check('Dynamic: profile shadow persists metadata/fingerprint only, not profile names',
    persisted.length > 0 && !persisted.includes('Nguyễn Thu Phương') && !persisted.includes('Võ Sinh B'));
}

function makePolicyRuntime(trusted, { throwInitialize = false } = {}) {
  const calls = [];
  const values = new Map(trusted ? [['tst_trusted_device_v1', '1']] : []);
  const localStorage = {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
    key(index) { return [...values.keys()][index] || null; },
    get length() { return values.size; },
  };
  const document = {
    readyState: 'complete',
    getElementById() { return null; },
    addEventListener() {},
  };
  const window = {
    localStorage,
    document,
    location: { reload() { calls.push({ op: 'reload' }); } },
    confirm() { return true; },
    console: { log() {}, warn() {}, group() {}, groupEnd() {}, table() {} },
    _fb_init: {
      initializeFirestore(appArg, options) {
        calls.push({ op: 'initializeFirestore', appArg, options });
        if (throwInitialize) throw new Error('forced-init-failure');
        return { kind: 'db', options };
      },
      persistentMultipleTabManager() { return { kind: 'multi-tab' }; },
      persistentLocalCache(options) { return { kind: 'persistent-cache', options }; },
      memoryLocalCache() { return { kind: 'memory-cache' }; },
      getFirestore(appArg) { calls.push({ op: 'getFirestore', appArg }); return { kind: 'fallback-db' }; },
      async terminate(db) { calls.push({ op: 'terminate', db }); },
      async clearIndexedDbPersistence(db) { calls.push({ op: 'clearIndexedDbPersistence', db }); },
    },
  };
  const context = { window, console: window.console, Date, Object, Array, String, Promise, Map, Set, Error };
  vm.createContext(context);
  vm.runInContext(policy, context, { filename: 'firestoreCachePolicy.js' });
  return { window, api: window.FirestoreCachePolicy, calls };
}

{
  const rt = makePolicyRuntime(true);
  const first = rt.api.initialize({ name: 'app' });
  const second = rt.api.initialize({ name: 'app' });
  const initCalls = rt.calls.filter(call => call.op === 'initializeFirestore');
  check('Dynamic: trusted device uses persistent multi-tab cache',
    rt.api.diagnostics().mode === 'persistent-multi-tab' && first.options.localCache.kind === 'persistent-cache');
  check('Dynamic: one primary Firestore instance is reused', first === second && initCalls.length === 1);
}

{
  const rt = makePolicyRuntime(true);
  rt.api.initialize({ name: 'app' });
  const firstBind = await rt.api.bindAuthenticatedUser('uid-admin-a');
  const sameBind = await rt.api.bindAuthenticatedUser('uid-admin-a');
  const switchedBind = await rt.api.bindAuthenticatedUser('uid-coach-b');
  check('Dynamic: persistent cache is reused for the same Auth UID', firstBind === true && sameBind === true);
  check('Dynamic: account switch clears project cache before another UID continues',
    switchedBind === false &&
    rt.calls.some(call => call.op === 'terminate') &&
    rt.calls.some(call => call.op === 'clearIndexedDbPersistence') &&
    rt.calls.some(call => call.op === 'reload'));
}

{
  const rt = makePolicyRuntime(false);
  const db = rt.api.initialize({ name: 'app' });
  check('Dynamic: shared/public device uses memory-only cache',
    rt.api.diagnostics().mode === 'memory-only' && db.options.localCache.kind === 'memory-cache');
}

{
  const rt = makePolicyRuntime(true, { throwInitialize: true });
  const db = rt.api.initialize({ name: 'app' });
  check('Dynamic: cache initialization failure safely falls back to getFirestore',
    db.kind === 'fallback-db' && rt.api.diagnostics().fallbackReason.includes('forced-init-failure'));
}

console.log(`\nTotal: ${pass + fail} | PASS: ${pass} | FAIL: ${fail}`);
if (fail) process.exit(1);
console.log('Phase 4K-6V4C1 checks passed.\n');
