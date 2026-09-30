#!/usr/bin/env node
/** D1C3B — Debt Profile Coverage Authoritative Read Boundary */
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

console.log('\n=== D1C3B — Debt Profile Authoritative Coverage Guard ===\n');
const debtPos = index.lastIndexOf('debtProfileReadBoundary.js?v=');
const appPos = index.lastIndexOf('app.js?v=');

check('Boundary remains loaded before app.js', debtPos >= 0 && appPos > debtPos);
check('Debt tab compatibility loader contains no cursor full scan',
  students.includes('uses the global active-profile listener') &&
  !students.slice(students.indexOf('window.loadAllProfilesForDebt'), students.indexOf('// debugListPaginationCoverage')).includes('while (true)') &&
  !students.slice(students.indexOf('window.loadAllProfilesForDebt'), students.indexOf('// debugListPaginationCoverage')).includes('getDocs('));
check('app.js delegates debt readiness to shared coverage boundary',
  app.includes('window.ensureDebtProfileCoverage(reason)') && app.includes('_debtProfileCoverageSource'));
check('Automatic verification is scheduled only from settings/full authority lifecycle, not partial active proof',
  app.includes("scheduleAutomaticDebtProfileCoverage('settings-ready')") &&
  profilesListener.includes("scheduleAutomaticDebtProfileCoverage('full-profiles-authoritative-snapshot')") &&
  !profilesListener.includes("scheduleAutomaticDebtProfileCoverage('active-profiles-snapshot')"));
check('Partial active-cache trust marker is removed', !boundary.includes('active-listener-local-trusted-no-aggregation'));
check('Authority readiness requires same club + full snapshot + complete canonical store',
  boundary.includes('authorityClubId') && boundary.includes('fullAuthoritySnapshotSeen') &&
  boundary.includes('fullAuthorityComplete') && boundary.includes('quitComplete') && boundary.includes('sameClub'));
check('Manual count audit remains force-gated diagnostics only',
  boundary.includes('runCountAudit(reason, options)') && boundary.includes('options && options.force === true') && boundary.includes('__ENABLE_DEBT_COUNT_AUDIT'));
check('Automatic verification path contains no runCountAudit',
  !boundary.slice(boundary.indexOf('async function runAutomaticVerification'), boundary.indexOf('async function ensureDebtProfileCoverage')).includes('runCountAudit('));
check('Legacy normalization remains explicit/manual only',
  boundary.includes('async function normalizeLegacyStatuses') &&
  !boundary.slice(boundary.indexOf('async function runAutomaticVerification'), boundary.indexOf('async function ensureDebtProfileCoverage')).includes('normalizeLegacyStatuses('));
check('Resource-exhausted manual aggregation enters cooldown',
  boundary.includes('count-audit-quota-guarded') && boundary.includes('COUNT_AUDIT_COOLDOWN_MS'));
check('Renderer consumes boundary coverage status', renderer.includes('getDebtProfileCoverageStatus') && renderer.includes('coverageReady'));
check('Club switch/logout reset debt boundary state', app.includes("resetDebtProfileReadBoundary('club-switch')") && app.includes("resetDebtProfileReadBoundary('logout')"));
check('Admin normal reader is one unfiltered current-club source', profilesListener.includes('activeQuery = profRef;'));
check('Coach retains status + branch scoped query', /activeQuery\s*=\s*fbQuery\(profRef,\s*statusConstraint,\s*fbWhere\('branch'/.test(profilesListener));
check('Emergency full fallback removes normal listener before getDocs',
  profilesListener.includes("window.removeListener(_state.activeListenerKey, 'full-fallback-takeover:'") &&
  profilesListener.indexOf('window.removeListener(_state.activeListenerKey') < profilesListener.indexOf('const snap    = await fbGetDocs(ctx.profRef)'));

function makeRuntime({ docs, role = 'admin', authority = false, authorityClubId = 'club-1', countThrowsQuota = false }) {
  let countQueries = 0, fallbackRuns = 0, batchCommits = 0, configWrites = 0, lockWrites = 0;
  const dbDocs = new Map(Object.entries(docs).map(([id, data]) => [id, { ...data }]));
  let authorityReady = !!authority;
  const config = {};
  const listenerMetrics = () => authorityReady ? {
    activeLoaded: true,
    activeListenerMounted: true,
    activeSnapshotCount: 1,
    lastProfilesMode: 'full-profiles-authoritative',
    authorityClubId,
    fullAuthoritySnapshotSeen: true,
    fullAuthoritySnapshotCount: dbDocs.size,
    fullAuthorityComplete: true,
    quitComplete: true,
  } : {
    activeLoaded: true,
    activeListenerMounted: true,
    activeSnapshotCount: 1,
    lastProfilesMode: 'active-split',
    authorityClubId: '',
    fullAuthoritySnapshotSeen: false,
    fullAuthoritySnapshotCount: 1,
    fullAuthorityComplete: false,
    quitComplete: false,
  };

  const initialProfiles = authorityReady
    ? Object.fromEntries(dbDocs)
    : Object.fromEntries([...dbDocs.entries()].filter(([, d]) => ['active', 'trial'].includes(String(d.status || '').toLowerCase())));

  const context = {
    console: { log() {}, info() {}, warn() {}, error() {}, group() {}, groupEnd() {}, table() {} },
    setTimeout(fn) { fn(); return 1; }, clearTimeout() {},
    Promise, Map, Set, Date, Number, String, Object, Array, Math, Error, JSON,
  };
  context.window = {
    userRole: role,
    currentClubId: 'club-1',
    __store: {
      db: {}, clubId: 'club-1', currentClubId: 'club-1', userRole: role,
      currentUser: { uid: 'admin-1', email: 'admin@example.com' }, clubConfig: config,
      profiles: initialProfiles,
    },
    studentProfileStore: { activeLoaded: true, quitComplete: authorityReady },
    getProfilesListenerMetrics: listenerMetrics,
    getProfileStatusConfig() { return { activeQueryValues: ['active','trial'], quitQueryValues: ['quit','inactive','retired'] }; },
    classifyProfileStatus(profile) {
      const raw = String(profile?.status || '').toLowerCase().trim();
      if (profile?.active === false || profile?.isActive === false || raw.includes('nghỉ') || raw.includes('nghi') || ['quit','inactive','retired'].includes(raw)) return 'quit';
      return 'active';
    },
    async loadFullProfilesFallback() {
      fallbackRuns++;
      authorityReady = true;
      context.window.__store.profiles = Object.fromEntries(dbDocs);
      context.window.studentProfileStore.quitComplete = true;
      return true;
    },
    _fb_init: {
      collection: (...args) => ({ kind:'collection', path:args.slice(1).join('/') }),
      where: (_field,_op,values) => ({ kind:'where', values:Array.isArray(values)?values:[values] }),
      query: (ref,constraint) => ({ kind:'query', ref, statusValues:constraint.values }),
      doc: (...args) => ({ path:args.slice(1).join('/') }),
      async getCountFromServer(q) {
        countQueries++;
        if (countThrowsQuota) { const e = new Error('429 quota'); e.code='resource-exhausted'; throw e; }
        const vals=q?.statusValues;
        const count=!vals ? dbDocs.size : [...dbDocs.values()].filter(d => vals.includes(String(d.status||'').toLowerCase())).length;
        return { data:() => ({ count }) };
      },
      writeBatch() { return { set() {}, async commit(){ batchCommits++; } }; },
      async setDoc(ref) { if (ref.path.endsWith('/main_config')) configWrites++; else lockWrites++; },
      async runTransaction(_db, cb) { return cb({ async get(){return {exists:()=>false,data:()=>({})};}, set(){lockWrites++;} }); },
    },
  };
  vm.createContext(context);
  vm.runInContext(boundary, context, { filename:'debtProfileReadBoundary.js' });
  return { context, api:context.window.DebtProfileReadBoundary, counters:() => ({countQueries,fallbackRuns,batchCommits,configWrites,lockWrites}) };
}

// Partial status-filtered source A exists: local cache can be audited, never promoted to full coverage.
{
  const rt = makeRuntime({ docs:{ A:{status:'active'}, B:{status:''}, C:{status:'Đang tập'}, D:{status:'legacy-custom'}, E:{status:'quit'} } });
  const status = rt.api.getStatus();
  const audit = rt.api.runLocalCoverageAudit('partial-cache');
  check('Dynamic: partial source is NOT authoritative ready', status.activeSource.ready === false && status.sessionVerified === false);
  check('Dynamic: local audit cannot claim full coverage', audit.noRead === true && audit.covered === false && audit.coveredBy === 'not-authoritative');
}

// Full same-club authority snapshot: immediate no-read readiness.
{
  const rt = makeRuntime({ docs:{ A:{status:'active'}, B:{status:''}, C:{status:'Đang tập'}, D:{status:'legacy-custom'}, E:{status:'quit'} }, authority:true });
  const result = await rt.api.ensureDebtProfileCoverage('full-authority');
  const c = rt.counters();
  check('Dynamic: full same-club authority makes Debt ready without extra read', result.ready === true && result.noRead === true && c.countQueries === 0 && c.fallbackRuns === 0);
  check('Dynamic: full authority is the recorded source', result.source === 'full-profiles-authoritative' && rt.api.getStatus().sessionVerified === true);
}

// Full snapshot for another club must not be trusted.
{
  const rt = makeRuntime({ docs:{ A:{status:'active'} }, authority:true, authorityClubId:'club-OTHER' });
  check('Dynamic: mismatched authority club is NOT ready', rt.api.getStatus().activeSource.ready === false);
}

// Non-admin cannot promote/fallback to full club profile authority.
{
  const rt = makeRuntime({ docs:{ A:{status:'active'}, E:{status:'quit'} }, role:'viewer' });
  const result = await rt.api.ensureDebtProfileCoverage('viewer');
  const c = rt.counters();
  check('Dynamic: non-admin Debt coverage fails closed with zero read/write', result.ready === false && result.blocked === true && result.source === 'role-not-allowed' && c.fallbackRuns === 0 && c.countQueries === 0 && c.configWrites === 0 && c.batchCommits === 0);
}

// Manual force-gated count audit is retained only as diagnostics.
{
  const rt = makeRuntime({ docs:{ A:{status:'active'}, B:{status:'trial'}, E:{status:'quit'} } });
  const result = await rt.api.runCountAudit('manual-force', { force:true });
  check('Dynamic: forced manual count audit performs exactly three aggregations', result.ok === true && result.covered === true && rt.counters().countQueries === 3);
}
{
  const rt = makeRuntime({ docs:{ A:{status:'active'} }, countThrowsQuota:true });
  const first = await rt.api.runCountAudit('manual-quota', { force:true });
  const afterFirst = rt.counters().countQueries;
  const second = await rt.api.runCountAudit('manual-quota-again', { force:true });
  check('Dynamic: quota cooldown suppresses retry storm', first.quotaGuarded === true && second.reason === 'count-audit-cooldown' && afterFirst === 3 && rt.counters().countQueries === 3);
}

console.log(`\nTotal: ${pass + fail} | PASS: ${pass} | FAIL: ${fail}`);
if (fail) process.exit(1);
console.log('D1C3B debt profile boundary checks passed.\n');
