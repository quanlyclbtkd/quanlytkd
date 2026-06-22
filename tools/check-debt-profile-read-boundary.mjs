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

console.log('\n=== Phase 4K-6V3D — Debt Profile Coverage Read Boundary ===\n');
const build = 'coach-branch-resolution-20260622-v4c2a';

check('V3D boundary remains loaded before app.js with current cache-bust',
  index.includes(`debtProfileReadBoundary.js?v=${build}`) &&
  index.indexOf('debtProfileReadBoundary.js') < index.indexOf(`app.js?v=${build}`));
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
check('Coverage audit uses three count aggregations instead of document scan',
  boundary.includes('getCountFromServer') && boundary.includes('countAggregationQueries += 3'));
check('Legacy normalization runs only after coverage gap and guarded full fallback',
  boundary.indexOf('if (audit.covered)') < boundary.indexOf('const normalized = await normalizeLegacyStatuses') &&
  boundary.includes("loadFullProfilesFallback('debt-profile-coverage:"));
check('Normalization writes canonical status in chunks below batch limit',
  boundary.includes('BATCH_SIZE = 400') && boundary.includes('profileStatusSchemaVersion'));
check('Exact count parity is required before config verification',
  boundary.includes("const parity = await runCountAudit('post-normalization-parity')") &&
  boundary.indexOf('if (!parity.ok || !parity.covered)') < boundary.indexOf("persistVerified(parity, 'legacy-status-normalization')"));
check('Per-club verification is stored in existing main_config',
  boundary.includes("'settings', 'main_config'") && boundary.includes('debtProfileCoverageVerifiedAt'));
check('Distributed lock prevents two devices normalizing together',
  boundary.includes("'settings', 'debt_profile_coverage_lock'") && boundary.includes('runTransaction'));
check('Renderer uses boundary readiness instead of pagination-size heuristic alone',
  renderer.includes('getDebtProfileCoverageStatus') && renderer.includes('coverageReady'));
check('Club switch and logout reset debt boundary state',
  app.includes("resetDebtProfileReadBoundary('club-switch')") && app.includes("resetDebtProfileReadBoundary('logout')"));

function makeRuntime({ docs, role = 'admin', verified = false, lockBusy = false }) {
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

// Already verified: zero aggregation and zero full scan.
{
  const rt = makeRuntime({ docs: { a: { status: 'active' }, b: { status: 'quit' } }, verified: true });
  const result = await rt.api.ensureDebtProfileCoverage('verified-test');
  const c = rt.counters();
  check('Dynamic: verified club reuses active listener with zero Firestore query',
    result.ready && result.source === 'active-listener-verified' && c.countQueries === 0 && c.fallbackRuns === 0);
}

// Clean but not marked: 3 count aggregations, no full scan, persist marker.
{
  const rt = makeRuntime({ docs: { a: { status: 'active' }, b: { status: 'trial' }, c: { status: 'quit' } } });
  const result = await rt.api.runAutomaticVerification('clean-audit');
  const c = rt.counters();
  check('Dynamic: clean legacy coverage is verified without full document scan',
    result.ready && c.countQueries === 3 && c.fallbackRuns === 0 && c.batchCommits === 0);
  check('Dynamic: clean coverage marker persists per club',
    rt.config.debtProfileCoverageVerified === true && c.configWrites === 1);
}

// Missing/legacy status: count gap -> one full fallback -> normalize -> parity -> marker.
{
  const rt = makeRuntime({ docs: {
    a: { status: 'active' },
    b: { status: 'quit' },
    c: { status: 'Đang tập' },
    d: { status: 'Đã nghỉ' },
    e: {},
    f: { status: 'Active' },
  } });
  const result = await rt.api.runAutomaticVerification('legacy-gap');
  const c = rt.counters();
  check('Dynamic: legacy gap triggers exactly one guarded full fallback', result.ready && c.fallbackRuns === 1);
  check('Dynamic: legacy statuses are normalized in one batch', c.batchCommits === 1 && c.countQueries === 9);
  check('Dynamic: all documents become query-compatible after parity',
    [...rt.dbDocs.values()].every(d => ['active', 'trial', 'quit', 'inactive', 'retired'].includes(String(d.status || '').toLowerCase())));
  check('Dynamic: config is persisted only after successful parity', rt.config.debtProfileCoverageVerified === true && c.configWrites === 1);
}

// Non-admin clean session can audit and render but does not write config.
{
  const rt = makeRuntime({ docs: { a: { status: 'active' }, b: { status: 'quit' } }, role: 'viewer' });
  const result = await rt.api.ensureDebtProfileCoverage('viewer-audit');
  const c = rt.counters();
  check('Dynamic: viewer can verify session coverage without migration writes',
    result.ready && result.source === 'active-listener-session-verified' && c.countQueries === 3 && c.configWrites === 0 && c.batchCommits === 0);
}

console.log(`\nTotal: ${pass + fail} | PASS: ${pass} | FAIL: ${fail}`);
if (fail) process.exit(1);
console.log('Phase 4K-6V3D checks passed.\n');
