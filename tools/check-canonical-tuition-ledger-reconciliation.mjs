#!/usr/bin/env node
/** Phase 4K-6V3D1 — Canonical Tuition Month Ledger + Targeted Profile Reconciliation */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = process.cwd();
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const ledgerSource = read('js/core/tuitionMonthLedger.js');
const index = read('index.html');
const app = read('app.js');
const finance = read('js/modules/finance.js');
const financeService = read('js/services/finance.service.js');
const students = read('js/modules/students.js');
const renderer = read('js/ui/render/computation/studentsRenderer.js');
const reports = read('js/modules/reports.js');
const profilesListener = read('js/listeners/profiles.listeners.js');

let pass = 0;
let fail = 0;
function check(name, ok, detail = '') {
  if (ok) { pass++; console.log('✅', name); }
  else { fail++; console.error('❌', name + (detail ? ' — ' + detail : '')); }
}
function eq(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

console.log('\n=== Phase 4K-6V3D1 — Canonical Tuition Month Ledger ===\n');

const build = 'canonical-tuition-ledger-20260618-v3d1';
check('Canonical ledger loads before debt boundary and app.js',
  index.includes(`tuitionMonthLedger.js?v=${build}`) &&
  index.indexOf('tuitionMonthLedger.js') < index.indexOf('debtProfileReadBoundary.js') &&
  index.indexOf('tuitionMonthLedger.js') < index.indexOf(`app.js?v=${build}`));
check('Active profile snapshot schedules zero-read targeted reconciliation',
  profilesListener.includes("scheduleTuitionProfileReconciliation('active-profiles-snapshot')"));
check('Module finance routes quick, family and form tuition through atomic service',
  finance.includes("reason: 'module-quick-pay-tuition'") &&
  finance.includes("addTuitionPaymentsAtomic(familyEntries") &&
  finance.includes("reason: 'module-transaction-form'"));
check('Legacy finance routes quick, family, form, admission and multi-item tuition through atomic boundary',
  app.includes("reason: 'quick-pay-tuition'") &&
  app.includes("reason: 'family-tuition-payment'") &&
  app.includes("reason: 'transaction-form'") &&
  app.includes("reason: 'admission-payment-bundle'") &&
  app.includes("reason: 'processMultiItem-bundle'"));
check('Finance and student services expose canonical atomic ledger methods',
  financeService.includes('addTuitionPaymentAtomic') && financeService.includes('addTuitionPaymentsAtomic') &&
  read('js/services/students.service.js').includes('removeSkippedTuitionMonthAtomic'));
check('Debt renderer no longer trusts legacy isOwed flags as authority',
  !renderer.includes('if (p.isOwed !== undefined)') &&
  !renderer.includes('if (item.isOwed !== undefined)') &&
  renderer.includes("reason: 'debt-list'") && renderer.includes("reason: 'debt-pagination-summary'"));
check('Profile, Zalo, parent lookup and Excel use canonical ledger',
  students.includes('getEffectivePaidUntil') && students.includes("reason: 'module-bulk-zalo'") &&
  app.includes("reason: 'parent-payment-lookup'") &&
  reports.includes("reason: 'excel-debt-report'"));
check('Profile rename preserves paidMonths and canonical paid-through fields',
  app.includes('updateData.paidMonths = _oldProfileForRename.paidMonths') &&
  students.includes('updateData.paidMonths = oldProfileForRename.paidMonths'));
check('Admission creates an unpaid profile first, then commits tuition evidence atomically',
  app.includes("ledgerStartMonth: startMonth, paidUntil: '', paidThroughMonth: '', paidMonths: []") &&
  students.includes("paidThroughMonth: ''") && students.includes("reason: 'module-admission-payment-bundle'"));
check('Atomic multi-payment transaction reads every profile before writes',
  ledgerSource.indexOf('snapshots.push(await transaction.get') < ledgerSource.indexOf('transaction.set(item.txRef'));
check('Targeted repair has bounded writes and uses loaded profiles',
  ledgerSource.includes('MAX_REPAIR_WRITES_PER_SESSION = 20') &&
  ledgerSource.includes('REPAIR_BATCH_SIZE = 8') &&
  !ledgerSource.slice(ledgerSource.indexOf('async function reconcileLoadedProfiles'), ledgerSource.indexOf('function scheduleReconciliation')).includes('getDocs('));

function makeRuntime({ role = 'admin', profiles = {} } = {}) {
  const events = [];
  const profileDb = new Map(Object.entries(profiles).map(([name, data]) => [name, { ...data }]));
  const txDb = new Map();
  let autoId = 0;
  let batchCommits = 0;
  let readCount = 0;

  const context = {
    console: { log() {}, info() {}, warn() {}, error() {}, group() {}, groupEnd() {}, table() {} },
    setTimeout(fn) { return { fn }; },
    clearTimeout() {},
    Promise, Map, Set, Date, Number, String, Object, Array, Math, Error, JSON,
  };
  const window = {
    userRole: role,
    currentClubId: 'club-1',
    allProfiles: Object.fromEntries([...profileDb.entries()].map(([k, v]) => [k, { ...v }])),
    __store: {
      db: { id: 'db' }, clubId: 'club-1', currentClubId: 'club-1', userRole: role,
      profiles: Object.fromEntries([...profileDb.entries()].map(([k, v]) => [k, { ...v }])),
      colRef: { kind: 'collection', path: 'clubs/club-1/transactions' },
    },
    canonicalizeTransactionForWrite(data) { return { ...data, canonical: true }; },
    mergeTransactionIntoRuntimeStore(data, reason) { events.push({ op: 'merge', data, reason }); },
    invalidateLists() {}, invalidateFinance() {},
  };
  const sdk = {
    collection(_db, ...parts) { return { kind: 'collection', path: parts.join('/') }; },
    doc(...args) {
      if (args.length === 1 && args[0]?.kind === 'collection') {
        autoId++;
        return { kind: 'doc', path: `${args[0].path}/tx-${autoId}`, id: `tx-${autoId}` };
      }
      const parts = args.slice(1).map(String);
      return { kind: 'doc', path: parts.join('/'), id: parts.at(-1) };
    },
    arrayUnion(...items) { return { __op: 'arrayUnion', items }; },
    arrayRemove(...items) { return { __op: 'arrayRemove', items }; },
    async runTransaction(_db, callback) {
      const pending = [];
      let wrote = false;
      await callback({
        async get(ref) {
          if (wrote) throw new Error('read-after-write');
          readCount++;
          events.push({ op: 'get', path: ref.path });
          const name = ref.id;
          const data = profileDb.get(name);
          return { exists: () => !!data, data: () => ({ ...data }) };
        },
        set(ref, data) { wrote = true; events.push({ op: 'set', path: ref.path }); pending.push({ op: 'set', ref, data }); },
        update(ref, patch) { wrote = true; events.push({ op: 'update', path: ref.path }); pending.push({ op: 'update', ref, patch }); },
      });
      for (const item of pending) {
        if (item.op === 'set') txDb.set(item.ref.id, { ...item.data });
        else {
          const current = profileDb.get(item.ref.id) || {};
          const patch = { ...item.patch };
          if (patch.paidMonths?.__op === 'arrayUnion') {
            patch.paidMonths = [...new Set([...(current.paidMonths || []), ...patch.paidMonths.items])];
          }
          if (patch.skippedMonths?.__op === 'arrayRemove') {
            const removed = new Set(patch.skippedMonths.items);
            patch.skippedMonths = (current.skippedMonths || []).filter(value => !removed.has(value));
          }
          profileDb.set(item.ref.id, { ...current, ...patch });
        }
      }
    },
    writeBatch() {
      const pending = [];
      return {
        set(ref, data) { pending.push({ op: 'set', ref, data }); },
        update(ref, patch) { pending.push({ op: 'update', ref, patch }); },
        async commit() {
          batchCommits++;
          for (const item of pending) {
            if (item.op === 'set') txDb.set(item.ref.id, { ...item.data });
            else {
              const current = profileDb.get(item.ref.id) || {};
              const patch = { ...item.patch };
              if (patch.skippedMonths?.__op === 'arrayRemove') {
                const removed = new Set(patch.skippedMonths.items);
                patch.skippedMonths = (current.skippedMonths || []).filter(value => !removed.has(value));
              }
              profileDb.set(item.ref.id, { ...current, ...patch });
            }
          }
        },
      };
    },
  };
  window._fb_init = sdk;
  context.window = window;
  vm.createContext(context);
  vm.runInContext(ledgerSource, context, { filename: 'tuitionMonthLedger.js' });
  return { window, api: window.CanonicalTuitionMonthLedger, profileDb, txDb, events, counters: () => ({ batchCommits, readCount }) };
}

{
  const rt = makeRuntime();
  const p = { paidUntil: '2026-04', paidMonths: ['2026-05'], createdAt: '2026-01-10', status: 'active' };
  check('Nguyễn Thu Phương case: effective paid-through advances from April to May',
    rt.api.derivePaidThroughMonth(p) === '2026-05');
  check('Nguyễn Thu Phương case: Debt tab reports only June',
    eq(rt.api.getChargeableMonths(p, '2026-06'), ['2026-06']));
}

{
  const rt = makeRuntime();
  const gap = { paidUntil: '2026-04', paidMonths: ['2026-06'], createdAt: '2026-01-10', status: 'active' };
  check('Gap safety: paying June does not falsely advance paid-through over unpaid May',
    rt.api.derivePaidThroughMonth(gap) === '2026-04');
  check('Gap safety: May remains debt while June is recognized as paid',
    eq(rt.api.getChargeableMonths(gap, '2026-06'), ['2026-05']));
  const skipped = { ...gap, skippedMonths: ['2026-05'] };
  check('Skipped month is excluded without being converted into a paid month',
    rt.api.derivePaidThroughMonth(skipped) === '2026-04' && eq(rt.api.getChargeableMonths(skipped, '2026-06'), []));
}

{
  const rt = makeRuntime();
  const profile = { paidUntil: '2026-06', paidThroughMonth: '2026-06', paidMonths: ['2026-05', '2026-06'], createdAt: '2026-01-10', status: 'active' };
  check('Delete safety: removing May rewinds paid-through to April and keeps June as separate paid evidence',
    rt.api.derivePaidThroughAfterRemoval(profile, ['2026-06'], ['2026-05']) === '2026-04');
}

{
  const rt = makeRuntime({ profiles: {
    'Nguyễn Thu Phương': { paidUntil: '2026-04', paidMonths: ['2026-05'], createdAt: '2026-01-10', status: 'active' },
    'Võ Sinh B': { paidUntil: '2026-04', paidMonths: [], createdAt: '2026-01-10', status: 'active' },
  }});
  const result = await rt.api.commitTuitionPaymentsAtomic([
    { studentName: 'Nguyễn Thu Phương', months: ['2026-06'], profile: rt.window.__store.profiles['Nguyễn Thu Phương'], txData: { type: 'Học phí', amount: 300000, txMonth: '2026-06' } },
    { studentName: 'Võ Sinh B', months: ['2026-05'], profile: rt.window.__store.profiles['Võ Sinh B'], txData: { type: 'Học phí', amount: 300000, txMonth: '2026-05' } },
  ], { reason: 'test-family' });
  const firstWrite = rt.events.findIndex(e => e.op === 'set' || e.op === 'update');
  const lastRead = rt.events.reduce((idx, e, i) => e.op === 'get' ? i : idx, -1);
  check('Atomic family payment reads all profiles before any Firestore write', lastRead < firstWrite);
  check('Atomic family payment writes both transactions and both profiles', rt.txDb.size === 2 && result.length === 2);
  check('Atomic payment advances only contiguous months',
    rt.profileDb.get('Nguyễn Thu Phương').paidUntil === '2026-06' && rt.profileDb.get('Võ Sinh B').paidUntil === '2026-05');
  check('Atomic payment stores canonical paidMonths evidence',
    rt.profileDb.get('Nguyễn Thu Phương').paidMonths.includes('2026-06') && rt.profileDb.get('Võ Sinh B').paidMonths.includes('2026-05'));
}

{
  const rt = makeRuntime({ profiles: {
    'Skip Legacy': { paidUntil: '2026-06', paidThroughMonth: '2026-06', paidMonths: ['2026-06'], skippedMonths: ['2026-05'], createdAt: '2026-01-10', status: 'active' },
    'Skip Paid': { paidUntil: '2026-06', paidThroughMonth: '2026-06', paidMonths: ['2026-05', '2026-06'], skippedMonths: ['2026-05'], createdAt: '2026-01-10', status: 'active' },
  }});
  await rt.api.removeSkippedMonthAtomic({ studentName: 'Skip Legacy', month: '2026-05' });
  await rt.api.removeSkippedMonthAtomic({ studentName: 'Skip Paid', month: '2026-05' });
  check('Remove-skip safety: a legacy jump across skipped May rewinds paid-through to April',
    rt.profileDb.get('Skip Legacy').paidUntil === '2026-04');
  check('Remove-skip safety: removed May reappears as debt while paid June stays recognized',
    eq(rt.api.getChargeableMonths(rt.profileDb.get('Skip Legacy'), '2026-06'), ['2026-05']));
  check('Remove-skip safety: real paid evidence for May preserves paid-through June',
    rt.profileDb.get('Skip Paid').paidUntil === '2026-06');
}

{
  const rt = makeRuntime({ profiles: {
    'Nguyễn Thu Phương': { paidUntil: '2026-04', paidMonths: ['2026-05'], createdAt: '2026-01-10', status: 'active' },
    'Clean': { paidUntil: '2026-05', paidMonths: ['2026-05'], createdAt: '2026-01-10', status: 'active' },
  }});
  const result = await rt.api.reconcileLoadedProfiles('test-loaded-snapshot');
  check('Targeted reconciliation repairs only the stale profile', result.repaired === 1 && result.remaining === 0);
  check('Targeted reconciliation performs zero Firestore reads', rt.counters().readCount === 0);
  check('Targeted reconciliation updates paidUntil to May', rt.profileDb.get('Nguyễn Thu Phương').paidUntil === '2026-05');
}

console.log(`\nTotal: ${pass + fail} | PASS: ${pass} | FAIL: ${fail}`);
if (fail) process.exit(1);
console.log('Phase 4K-6V3D1 checks passed.\n');
