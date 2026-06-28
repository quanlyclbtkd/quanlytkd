#!/usr/bin/env node
/** Phase 4K-6V3D — Debt Profile Coverage Read Boundary */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = process.cwd();
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const boundary = read('js/core/debtProfileReadBoundary.js');
const students = read('js/modules/students.js');
const profilesListener = read('js/listeners/profiles.listeners.js');
const renderer = read('js/ui/render/computation/studentsRenderer.js');
const app = read('app.js');
const index = read('index.html');

let pass = 0, fail = 0;
function check(name, ok, detail = '') {
  if (ok) { pass++; console.log('✅', name); }
  else { fail++; console.error('❌', name + (detail ? ' — ' + detail : '')); }
}

console.log('\n=== Phase 4K-6V4C1 — Debt Profile Coverage Spark Aggregation Guard ===\n');
const debtPos = index.lastIndexOf('debtProfileReadBoundary.js?v=');
const appPos = index.lastIndexOf('app.js?v=');

check('V3D boundary remains loaded before app.js with current cache-bust',
  debtPos >= 0 && appPos > debtPos);
check('Firebase bridge exposes runTransaction for distributed lock',
  index.includes('getCountFromServer, runTransaction') && index.includes('window._fb_init'));
check('Debt tab compatibility loader no longer contains cursor full scan',
  students.includes('uses the global active-profile listener') &&
  !students.slice(students.indexOf('window.loadAllProfilesForDebt'), students.indexOf('// debugListPaginationCoverage')).includes('while (true)') &&
  !students.slice(students.indexOf('window.loadAllProfilesForDebt'), students.indexOf('// debugListPaginationCoverage')).includes('getDocs('));
check('app.js delegates debt readiness to shared coverage boundary',
  app.includes("window.ensureDebtProfileCoverage(reason)") && app.includes('_debtProfileCoverageSource'));
check('Automatic verification is scheduled from settings and active snapshot',
  app.includes("scheduleAutomaticDebtProfileCoverage('settings-ready')") &&
  profilesListener.includes("scheduleAutomaticDebtProfileCoverage('active-profiles-snapshot')"));
check('Automatic debt readiness suppresses client aggregation by default',
  boundary.includes('count-audit-disabled-spark-guard') &&
  boundary.includes('active-listener-local-trusted-no-aggregation') &&
  boundary.includes('countAggregationSuppressed'));
check('Manual count audit remains force-gated for diagnostics only',
  boundary.includes('runCountAudit(reason, options)') &&
  boundary.includes('options && options.force === true') &&
  boundary.includes('__ENABLE_DEBT_COUNT_AUDIT'));
check('Resource-exhausted aggregation errors enter cooldown instead of retry storm',
  boundary.includes('count-audit-quota-guarded') &&
  boundary.includes('COUNT_AUDIT_COOLDOWN_MS') &&
  boundary.includes('countAuditDisabledUntil'));
check('Manual count audit still uses at most three count aggregations when explicitly forced',
  boundary.includes('getCountFromServer') && boundary.includes('countAggregationQueries += 3'));
check('Legacy normalization helper remains explicit/manual and is not called automatically on tab open',
  boundary.includes('async function normalizeLegacyStatuses') &&
  boundary.includes("loadFullProfilesFallback('debt-profile-coverage:") &&
  !boundary.slice(boundary.indexOf('async function runAutomaticVerification'), boundary.indexOf('async function ensureDebtProfileCoverage')).includes('normalizeLegacyStatuses('));
check('Normalization helper writes canonical status in chunks below batch limit when explicitly used',
  boundary.includes('BATCH_SIZE = 400') && boundary.includes('profileStatusSchemaVersion'));
check('Automatic verification path contains no runCountAudit call',
  !boundary.slice(boundary.indexOf('async function runAutomaticVerification'), boundary.indexOf('async function ensureDebtProfileCoverage')).includes('runCountAudit('));
check('Per-club verification is stored in existing main_config',
  boundary.includes("'settings', 'main_config'") && boundary.includes('debtProfileCoverageVerifiedAt'));
check('Distributed lock prevents two devices normalizing together',
  boundary.includes("'settings', 'debt_profile_coverage_lock'") && boundary.includes('runTransaction'));
check('Renderer uses boundary readiness instead of pagination-size heuristic alone',
  renderer.includes('getDebtProfileCoverageStatus') && renderer.includes('coverageReady'));
check('Club switch and logout reset debt boundary state',
  app.includes("resetDebtProfileReadBoundary('club-switch')") && app.includes("resetDebtProfileReadBoundary('logout')"));

function makeRuntime({ docs, role = 'admin', verified = false, lockBusy = false, countThrowsQuota = false }) {
  let countQueries = 0, fallbackRuns = 0, batchCommits = 0, configWrites = 0, lockWrites = 0;
  const dbDocs = new Map(Object.entries(docs).map(([id, data]) => [id, { ...data }]));
  const config = verified ? {
    debtProfileCoverageVersion: 1,
    debtProfileCoverageVerified: true,
    debtProfileCoverageVerifiedAt: Date.now(),
  } : {};
  const lockData = lockBusy ? { status: 'running', owner: 'other', expiresAt: Date.now() + 60000 } : {};

  const countForQuery = q => {
    const vals = q && q.statusValues;
    if (!vals) return dbDocs.size;
    return [...dbDocs.values()].filter(d => vals.includes(String(d.status || '').toLowerCase())).length;
  };

  const context = {
    console: { log() {}, info() {}, warn() {}, error() {}, group() {}, groupEnd() {}, table() {} },
    setTimeout(fn) { fn(); return 1; },
    clearTimeout() {},
    Promise, Map, Set, Date, Number, String, Object, Array, Math, Error, JSON,
  };
  context.window = {
    userRole: role,
    currentClubId: 'club-1',
    __store: {
      db: {}, clubId: 'club-1', currentClubId: 'club-1', userRole: role,
      currentUser: { uid: 'admin-1', email: 'admin@example.com' },
      clubConfig: config,
      profiles: Object.fromEntries([...dbDocs.entries()].filter(([, d]) => ['active', 'trial'].includes(String(d.status || '').toLowerCase()))),
    },
    studentProfileStore: { activeLoaded: true },
    getProfilesListenerMetrics() {
      return { activeLoaded: true, activeListenerMounted: true, activeSnapshotCount: 1, lastProfilesMode: 'active-split' };
    },
    getProfileStatusConfig() {
      return { activeQueryValues: ['active', 'trial'], quitQueryValues: ['quit', 'inactive', 'retired'] };
    },
    classifyProfileStatus(profile) {
      const raw = String(profile?.status || '').toLowerCase().trim();
      if (profile?.active === false || profile?.isActive === false || raw.includes('nghỉ') || raw.includes('nghi') || ['quit', 'inactive', 'retired'].includes(raw)) return 'quit';
      return 'active';
    },
    async loadFullProfilesFallback() {
      fallbackRuns++;
      context.window.__store.profiles = Object.fromEntries([...dbDocs.entries()].map(([id, d]) => [id, { ...d }]));
      return true;
    },
    _fb_init: {
      collection: (...args) => ({ kind: 'collection', path: args.slice(1).join('/') }),
      where: (_field, _op, values) => ({ kind: 'where', values: Array.isArray(values) ? values : [values] }),
      query: (ref, constraint) => ({ kind: 'query', ref, statusValues: constraint.values }),
      doc: (...args) => ({ path: args.slice(1).join('/') }),
      async getCountFromServer(q) {
        countQueries++;
        if (countThrowsQuota) { const e = new Error('429 quota'); e.code = 'resource-exhausted'; throw e; }
        return { data: () => ({ count: countForQuery(q) }) };
      },
      writeBatch() {
        const writes = [];
        return {
          set(ref, patch) { writes.push({ ref, patch }); },
          async commit() {
            batchCommits++;
            for (const { ref, patch } of writes) {
              const id = ref.path.split('/').at(-1);
              dbDocs.set(id, { ...(dbDocs.get(id) || {}), ...patch });
            }
          },
        };
      },
      async setDoc(ref, patch) {
        if (ref.path.endsWith('/main_config')) {
          configWrites++;
          Object.assign(config, patch);
          Object.assign(context.window.__store.clubConfig, patch);
        } else if (ref.path.endsWith('/debt_profile_coverage_lock')) {
          lockWrites++;
          Object.assign(lockData, patch);
        }
      },
      async runTransaction(_db, callback) {
        return callback({
          async get() { return { exists: () => Object.keys(lockData).length > 0, data: () => ({ ...lockData }) }; },
          set(_ref, patch) { lockWrites++; Object.assign(lockData, patch); },
        });
      },
    },
  };
  vm.createContext(context);
  vm.runInContext(boundary, context, { filename: 'debtProfileReadBoundary.js' });
  return {
    context, api: context.window.DebtProfileReadBoundary, dbDocs, config,
    counters: () => ({ countQueries, fallbackRuns, batchCommits, configWrites, lockWrites }),
  };
}

// Already verified/source ready: zero aggregation and zero full scan.
{
  const rt = makeRuntime({ docs: { a: { status: 'active' }, b: { status: 'quit' } }, verified: true });
  const result = await rt.api.ensureDebtProfileCoverage('verified-test');
  const c = rt.counters();
  check('Dynamic: debt readiness uses active listener cache with zero aggregation',
    result.ready && result.noRead === true && c.countQueries === 0 && c.fallbackRuns === 0);
}

// Clean but not marked: no automatic count aggregation, no full scan, no marker write.
{
  const rt = makeRuntime({ docs: { a: { status: 'active' }, b: { status: 'trial' }, c: { status: 'quit' } } });
  const result = await rt.api.ensureDebtProfileCoverage('clean-audit');
  const c = rt.counters();
  check('Dynamic: unverified club still avoids automatic runAggregationQuery',
    result.ready && result.source === 'active-listener-local-trusted-no-aggregation' && c.countQueries === 0 && c.fallbackRuns === 0);
  check('Dynamic: local readiness does not write verification marker',
    c.configWrites === 0 && rt.config.debtProfileCoverageVerified !== true);
}

// Missing/legacy status: no automatic normalization/write storm; debt tab stays readable from existing cache.
{
  const rt = makeRuntime({ docs: {
    a: { status: 'active' },
    b: { status: 'quit' },
    c: { status: 'Đang tập' },
    d: { status: 'Đã nghỉ' },
    e: {},
    f: { status: 'Active' },
  } });
  const result = await rt.api.ensureDebtProfileCoverage('legacy-gap');
  const c = rt.counters();
  check('Dynamic: legacy coverage path does not auto-count or auto-normalize on tab open',
    result.ready && c.countQueries === 0 && c.fallbackRuns === 0 && c.batchCommits === 0 && c.configWrites === 0);
}

// Non-admin clean session never triggers client aggregation or writes.
{
  const rt = makeRuntime({ docs: { a: { status: 'active' }, b: { status: 'quit' } }, role: 'viewer' });
  const result = await rt.api.ensureDebtProfileCoverage('viewer-audit');
  const c = rt.counters();
  check('Dynamic: viewer readiness is no-read/no-write',
    result.ready && result.noRead === true && c.countQueries === 0 && c.configWrites === 0 && c.batchCommits === 0);
}

// Manual force-gated count audit remains available for diagnostics.
{
  const rt = makeRuntime({ docs: { a: { status: 'active' }, b: { status: 'trial' }, c: { status: 'quit' } } });
  const result = await rt.api.runCountAudit('manual-force', { force: true });
  const c = rt.counters();
  check('Dynamic: forced manual count audit performs exactly three aggregation queries',
    result.ok && result.covered && c.countQueries === 3);
}

// Quota errors are cooled down; next manual attempt is skipped without another RPC.
{
  const rt = makeRuntime({ docs: { a: { status: 'active' } }, countThrowsQuota: true });
  const first = await rt.api.runCountAudit('manual-quota', { force: true });
  const afterFirst = rt.counters().countQueries;
  const second = await rt.api.runCountAudit('manual-quota-again', { force: true });
  const afterSecond = rt.counters().countQueries;
  check('Dynamic: resource-exhausted count audit enters cooldown and suppresses retry storm',
    first.quotaGuarded === true && second.reason === 'count-audit-cooldown' && afterFirst === 3 && afterSecond === 3);
}

console.log(`\nTotal: ${pass + fail} | PASS: ${pass} | FAIL: ${fail}`);
if (fail) process.exit(1);
console.log('Phase 4K-6V4C1 checks passed.\n');
