#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import vm from 'node:vm';

const root = process.cwd();
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const app = read('app.js');
const main = read('js/main.js');
const index = read('index.html');
const writer = read('js/core/clubStatsAutoCache.js');
const policySource = read('js/core/productionAuthorityPolicy.js');
const serverRefresh = read('js/core/superAdminServerRefresh.js');
const superadmin = read('js/modules/superadmin.js');
const parallel = read('tools/check-parallel-read-authority.mjs');
const rules = read('firestore.rules');
const firebase = JSON.parse(read('firebase.json'));
const functionsConfig = JSON.parse(read('firebase.functions.json'));

let passed = 0;
let failed = 0;
function check(name, condition, detail = '') {
  if (condition) {
    passed++;
    console.log('✅', name);
  } else {
    failed++;
    console.error('❌', name, detail);
  }
}

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`Missing function ${name}`);
  const brace = source.indexOf('{', start);
  let depth = 0;
  for (let i = brace; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') {
      depth--;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`Unclosed function ${name}`);
}

// ── Static authority closure ────────────────────────────────────────────────
check('immutable production authority policy exists', policySource.includes('Object.freeze({') && policySource.includes("mode: 'client-only'"));
check('policy selects exactly the client stats writer', policySource.includes("statsWriter: 'client'") && policySource.includes('superAdminServerRefresh: false'));
check('policy disables legacy runtime recovery', policySource.includes('legacyRuntimeRecovery: false'));
check('policy is exposed read-only', policySource.includes("Object.defineProperty(window, 'ProductionAuthorityPolicy'") && policySource.includes('writable: false'));
check('main installs policy before runtime writers', main.indexOf('initProductionAuthorityPolicy()') < main.indexOf('initClubStatsAutoCache()'));
check('exact V5U6E build marker is active', main.includes("window.APP_BUILD_VERSION = '4K-6V5U6E-production-authority-closure-20260814'"));

check('transaction listener publishes one store coverage object', app.includes('window.__store.transactionCoverage = coverage'));
check('coverage carries club/month/readMode', ['clubId:', 'month:', 'readMode:'].every(x => extractFunction(app, '_buildTransactionCoverage').includes(x)));
check('canonical coverage requires canonical source seen', app.includes("? ['canonical']"));
check('legacy coverage requires all three source snapshots', app.includes("['byDate', 'byTxMonth', 'byPackageMonth']"));
check('limit hit uses >= and never assumes exact limit complete', app.includes('sourceCounts[key] >= limitValue'));
check('coverage resets on club switch', app.includes("_resetTransactionCoverage('club-switch'"));
check('coverage resets on logout', app.includes("_resetTransactionCoverage('logout')"));
check('coverage resets before month/read-mode listener attach', app.includes("reason: 'listener-context-reset'"));
check('legacy root recovery explicitly resets finance coverage', app.includes("_resetTransactionCoverage('explicit-legacy-root-recovery'"));

check('stats writer requires same club and month', writer.includes('sameClub && sameMonth'));
check('stats writer requires ready and complete true', writer.includes('coverage.ready === true && coverage.complete === true'));
check('stats writer fails closed without selected production policy', writer.includes('production-policy-stats-writer-disabled'));
check('incomplete finance is represented by metadata, not zero', writer.includes('financeComplete,') && writer.includes('financeWriteSkipped: !financeComplete'));
check('financial root payload is conditional', writer.includes('if (financeComplete)') && writer.includes('cachedCurrentMonthRevenue'));
check('financial stats payload is conditional', writer.includes('Object.assign(statsPayload') && writer.includes('income: { total: stats.monthlyIncome }'));
check('member cache remains outside finance conditional', writer.indexOf('cachedActiveCount: stats.activeCount') < writer.indexOf('if (financeComplete)'));

check('SuperAdmin auto callable dispatch is removed', !superadmin.includes('maybeAutoRefreshSuperAdminSummaries(clubDataList'));
check('server refresh compatibility API is policy guarded', serverRefresh.includes('_policyAllowsServerRefresh') && serverRefresh.includes('production-policy-client-only'));
check('default client does not load Firebase Functions SDK', !index.includes('firebase-functions.js') && !index.includes('getFunctions, httpsCallable'));
check('default deployment config excludes Functions', !Object.prototype.hasOwnProperty.call(firebase, 'functions'));
check('Functions source has explicit archive-only config', Array.isArray(functionsConfig.functions) && functionsConfig.functions[0]?.source === 'functions');
check('SuperAdmin rejects explicitly incomplete root finance cache', superadmin.includes('_isFinanceCoverageRejected') && superadmin.includes('_rootMonthCache.financeRejected'));
check('incomplete root coverage suppresses targeted stats fallback', superadmin.includes('if (!_rootMonthCache.complete && !_rootMonthCache.financeRejected)'));

check('app-context-ready no longer auto-runs recovery', !main.includes("runRuntimeDataRecovery?.('app-context-ready')"));
check('late main replay no longer auto-runs recovery', !main.includes("runRuntimeDataRecovery('main-replay-context-ready')"));
check('normal resolve call is zero-probe', app.includes('if (opts.probe !== true || _coachRuntime)'));
check('manual source probes require explicit options', app.includes('opts.includeLegacy === true') && app.includes('probed: true'));
check('manual runtime recovery requires explicit probe', app.includes("reason: 'explicit-probe-required'"));
check('legacy activation requires explicit activateLegacy', app.includes("opts.activateLegacy === true"));
check('Coach diagnostic probe is blocked before _hasDoc', app.indexOf('if (opts.probe !== true || _coachRuntime)') < app.indexOf('async function _hasDoc(path)'));
check('parallel gate freezes no automatic source detector', parallel.includes('Normal bootstrap has no automatic legacy recovery owner'));

const saStart = rules.search(/match\s*\/super_admins\/\{uid\}/);
const saEnd = rules.indexOf('match /{document=**}', saStart);
const saRules = rules.slice(saStart, saEnd);
check('tenant rules retain narrow bootstrap get', /allow\s+get\s*:\s*if\s+isSuperAdmin\(\)\s*\|\|\s*isBootstrapSuperAdminIdentity\(uid\)/.test(saRules));
check('tenant rules retain SuperAdmin-only list', /allow\s+list\s*:\s*if\s+isSuperAdmin\(\)/.test(saRules));
check('tenant rules do not grant Club Admin/Viewer/public access', !/isClubAdmin\s*\(|isAdminOrViewer\s*\(|allow\s+read\s*:\s*if\s+true/.test(saRules));

// ── Dynamic transaction coverage ───────────────────────────────────────────
try {
  const coverageFn = vm.runInNewContext(`(${extractFunction(app, '_buildTransactionCoverage')})`);
  const base = { clubId: 'club_A', month: '2026-08', limit: 1200, mergedCount: 700 };
  const canonical700 = coverageFn({ ...base, readMode: 'canonical', sourceSeen: { canonical: true }, sourceCounts: { canonical: 700 } });
  const canonical1200 = coverageFn({ ...base, readMode: 'canonical', mergedCount: 1200, sourceSeen: { canonical: true }, sourceCounts: { canonical: 1200 } });
  const legacyComplete = coverageFn({ ...base, readMode: 'legacy', sourceSeen: { byDate: true, byTxMonth: true, byPackageMonth: true }, sourceCounts: { byDate: 600, byTxMonth: 500, byPackageMonth: 200 } });
  const legacyPackageLimit = coverageFn({ ...base, readMode: 'legacy', sourceSeen: { byDate: true, byTxMonth: true, byPackageMonth: true }, sourceCounts: { byDate: 600, byTxMonth: 500, byPackageMonth: 1200 } });
  const legacyNotReady = coverageFn({ ...base, readMode: 'legacy', sourceSeen: { byDate: true, byTxMonth: true }, sourceCounts: { byDate: 10, byTxMonth: 10, byPackageMonth: 0 } });
  check('dynamic canonical < limit is complete', canonical700.ready === true && canonical700.complete === true && canonical700.hitLimit === false);
  check('dynamic canonical = limit is incomplete', canonical1200.complete === false && canonical1200.hitLimit === true);
  check('dynamic legacy all sources < limit is complete', legacyComplete.complete === true);
  check('dynamic legacy one source = limit is incomplete', legacyPackageLimit.complete === false && legacyPackageLimit.hitLimit === true);
  check('dynamic legacy hydration waits for all three sources', legacyNotReady.ready === false && legacyNotReady.complete === false);
  check('dynamic merged dedup count cannot hide a source limit hit', legacyPackageLimit.mergedCount === 700 && legacyPackageLimit.complete === false);
} catch (error) {
  check('dynamic transaction coverage simulation completed', false, error.message);
}

let importSeq = 0;
const moduleUrl = rel => pathToFileURL(path.join(root, rel)).href + `?v5u6e=${Date.now()}-${++importSeq}`;
const currentMonthVN = () => new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 7);

async function runWriterScenario({ coverageComplete, hitLimit, count, coverageClub = 'club_A', policyWriter = 'client' }) {
  const priorWindow = globalThis.window;
  const month = currentMonthVN();
  const transactions = Array.from({ length: count }, (_, i) => ({
    id: `tx-${i}`,
    txMonth: month,
    type: i === 1 ? 'Chi vận hành' : 'Học phí',
    amount: i === 1 ? 100000 : 500000,
  }));
  const writes = [];
  const db = { name: 'mock-db' };
  globalThis.window = {
    userRole: 'admin',
    ProductionAuthorityPolicy: Object.freeze({ mode: 'client-only', statsWriter: policyWriter, superAdminServerRefresh: false, legacyRuntimeRecovery: false }),
    RoleReadBoundary: { canMount: () => true },
    __store: {
      clubId: 'club_A', currentClubId: 'club_A', db,
      profiles: { p1: { id: 'p1', name: 'Alice', status: 'active' } },
      transactions,
      inventory: [],
      transactionCoverage: {
        clubId: coverageClub,
        month,
        readMode: 'canonical',
        ready: true,
        complete: coverageComplete,
        hitLimit,
        mergedCount: count,
        sourceCounts: { canonical: count },
        limit: 1200,
      },
    },
    getAppContext: () => ({ clubId: 'club_A', currentClubId: 'club_A', db }),
    _fb_init: {
      doc: (_db, ...segments) => ({ path: segments.join('/') }),
      setDoc: async (ref, payload, options) => { writes.push({ path: ref.path, payload, options }); },
    },
  };
  try {
    const mod = await import(moduleUrl('js/core/clubStatsAutoCache.js'));
    const result = await mod.syncClubStatsCache('v5u6e-dynamic');
    return { result, writes, month };
  } finally {
    globalThis.window = priorWindow;
  }
}

// ── Dynamic writer coverage safety ─────────────────────────────────────────
try {
  const incomplete = await runWriterScenario({ coverageComplete: false, hitLimit: true, count: 1200 });
  const rootWrite = incomplete.writes.find(w => w.path === 'clubs/club_A');
  const statsWrite = incomplete.writes.find(w => w.path.startsWith('clubs/club_A/stats/'));
  const forbiddenRoot = ['cachedTxCount', 'cachedCurrentMonthRevenue', 'currentMonthRevenue', 'cachedMonthlyRevenue', 'revenueByMonth', 'superAdminStats'];
  const forbiddenStats = ['income', 'expense', 'profit', 'txCount'];
  check('dynamic high-volume still allows member root cache update', rootWrite?.payload?.cachedActiveCount === 1);
  check('dynamic high-volume root has financeComplete=false metadata', rootWrite?.payload?.cacheCoverage?.financeComplete === false && rootWrite.payload.cacheCoverage.transactionHitLimit === true);
  check('dynamic high-volume root writes zero financial fields', forbiddenRoot.every(k => !Object.prototype.hasOwnProperty.call(rootWrite?.payload || {}, k)));
  check('dynamic high-volume stats doc writes zero financial fields', forbiddenStats.every(k => !Object.prototype.hasOwnProperty.call(statsWrite?.payload || {}, k)));
  check('dynamic high-volume member write does not advance finance updatedAt', !Object.prototype.hasOwnProperty.call(statsWrite?.payload || {}, 'updatedAt'));
  check('dynamic high-volume result reports financial writes skipped', incomplete.result?.financeWriteSkipped === true && incomplete.result?.financialRootWriteOk === false && incomplete.result?.financialStatsWriteOk === false);
  check('dynamic unknown finance is not fabricated as zero', !JSON.stringify(incomplete.writes).includes('"revenueTotal":0') && !JSON.stringify(incomplete.writes).includes('"income":{"total":0}'));

  const complete = await runWriterScenario({ coverageComplete: true, hitLimit: false, count: 900 });
  const completeRoot = complete.writes.find(w => w.path === 'clubs/club_A');
  const completeStats = complete.writes.find(w => w.path.startsWith('clubs/club_A/stats/'));
  check('dynamic complete coverage authorizes root finance', completeRoot?.payload?.cacheCoverage?.financeComplete === true && completeRoot?.payload?.cachedCurrentMonthRevenue === 449500000);
  check('dynamic complete coverage authorizes stats finance', completeStats?.payload?.income?.total === 449500000 && completeStats?.payload?.expense?.total === 100000 && completeStats?.payload?.txCount === 900);
  check('dynamic complete coverage totals are exact', completeRoot?.payload?.superAdminStats?.profit === 449400000 && completeRoot?.payload?.superAdminStats?.monthlyTxCount === 900);

  const wrongClub = await runWriterScenario({ coverageComplete: true, hitLimit: false, count: 3, coverageClub: 'club_B' });
  const wrongClubRoot = wrongClub.writes.find(w => w.path === 'clubs/club_A');
  check('dynamic Club B coverage cannot authorize Club A finance', wrongClubRoot?.payload?.cacheCoverage?.financeComplete === false && !Object.prototype.hasOwnProperty.call(wrongClubRoot?.payload || {}, 'currentMonthRevenue'));

  const policyDisabled = await runWriterScenario({ coverageComplete: true, hitLimit: false, count: 3, policyWriter: 'server' });
  check('dynamic non-client policy blocks all client stats writes', policyDisabled.writes.length === 0 && policyDisabled.result?.reason === 'production-policy-stats-writer-disabled');
} catch (error) {
  check('dynamic coverage-safe writer simulation completed', false, error.stack || error.message);
}

// ── Dynamic policy/callable/unknown presentation ───────────────────────────
try {
  const priorWindow = globalThis.window;
  globalThis.window = {};
  const policyMod = await import(moduleUrl('js/core/productionAuthorityPolicy.js'));
  const installed = policyMod.initProductionAuthorityPolicy();
  const descriptor = Object.getOwnPropertyDescriptor(globalThis.window, 'ProductionAuthorityPolicy');
  check('dynamic installed policy is frozen', Object.isFrozen(installed));
  check('dynamic installed policy property is non-writable', descriptor?.writable === false && descriptor?.configurable === false);
  globalThis.window = priorWindow;
} catch (error) {
  check('dynamic immutable policy simulation completed', false, error.message);
}

try {
  const priorWindow = globalThis.window;
  const priorDocument = globalThis.document;
  const priorStorage = globalThis.localStorage;
  let callableCalls = 0;
  globalThis.localStorage = { getItem: () => null, setItem: () => {} };
  globalThis.document = { getElementById: () => null, createElement: () => ({ style: {} }) };
  globalThis.window = {
    userRole: 'super_admin',
    __store: { userRole: 'super_admin' },
    ProductionAuthorityPolicy: Object.freeze({ mode: 'client-only', statsWriter: 'client', superAdminServerRefresh: false, legacyRuntimeRecovery: false }),
    _fb_init: { getFunctions: () => ({}), httpsCallable: () => async () => { callableCalls++; return { data: {} }; } },
  };
  const mod = await import(moduleUrl('js/core/superAdminServerRefresh.js'));
  const cacheState = mod.hasClubSummaryCache({ data: {
    cachedActiveCount: 10,
    cachedCurrentMonthRevenue: 999,
    superAdminStats: { month: '2026-08', revenueTotal: 999 },
    cacheCoverage: { month: '2026-08', financeComplete: false },
  } }, { month: '2026-08' });
  const auto = await mod.maybeAutoRefreshSuperAdminSummaries([], { month: '2026-08' });
  const manual = await mod.refreshSuperAdminSummaryForClubViaServer('club_A', { month: '2026-08' });
  check('dynamic SuperAdmin treats incomplete preserved revenue as unknown', cacheState.financeRejected === true && cacheState.revenue === null && cacheState.hasRevenue === false);
  check('dynamic SuperAdmin auto refresh is policy-disabled', auto?.reason === 'production-policy-client-only');
  check('dynamic SuperAdmin manual compatibility refresh is policy-disabled', manual?.reason === 'production-policy-client-only');
  check('dynamic client-only SuperAdmin makes zero callable requests', callableCalls === 0);
  globalThis.window = priorWindow;
  globalThis.document = priorDocument;
  globalThis.localStorage = priorStorage;
} catch (error) {
  check('dynamic SuperAdmin authority simulation completed', false, error.stack || error.message);
}

console.log(`\nProduction Authority Closure: ${passed}/${passed + failed} PASS`);
if (failed) process.exit(1);
