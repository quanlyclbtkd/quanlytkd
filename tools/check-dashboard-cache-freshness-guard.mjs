#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const dashboard = fs.readFileSync('js/modules/dashboard.js', 'utf8');
const render = fs.readFileSync('js/ui/render.js', 'utf8');
const app = fs.readFileSync('app.js', 'utf8');
const profiles = fs.readFileSync('js/listeners/profiles.listeners.js', 'utf8');
const main = fs.readFileSync('js/main.js', 'utf8');
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => {
  if (ok) { pass++; console.log('✅', name); }
  else { fail++; console.error('❌', name, detail); }
};
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

console.log('\n=== Phase 4K-6V5U6C2 — Dashboard Cache Freshness + Hydration/Backoff Freeze ===\n');

const canonicalStart = dashboard.indexOf('export async function fetchHistoricalDashboardFallback');
const canonicalEnd = dashboard.indexOf('export function scheduleDashboardHistoryFetch', canonicalStart);
const canonicalBlock = dashboard.slice(canonicalStart, canonicalEnd);
const renderDashboardSection = render.slice(render.indexOf('// ── Chart data — 6 tháng gần nhất'), render.indexOf('export function initRender'));

check('cache schema version bumped to v3', /_SPARK_HISTORY_CACHE_VERSION\s*=\s*3\b/.test(dashboard));
check('single module-local mutation freshness state exists', dashboard.includes('const _dashboardStatsFreshness = {') && dashboard.includes('dirtyMonths: new Map()'));
check('canonical dirty API is exported once', dashboard.includes('export function markDashboardStatsDirty') && (dashboard.match(/export function markDashboardStatsDirty/g) || []).length === 1);
check('dirty API performs no Firestore read/render', (() => {
  const a = dashboard.indexOf('export function markDashboardStatsDirty');
  const b = dashboard.indexOf('function _clearDashboardMonthDirtyIfRevision', a);
  const block = dashboard.slice(a, b);
  return !/\bgetDoc(?:s)?\s*\(/.test(block) && !/renderDashboard|renderApp\s*\(/.test(block);
})());
check('dirty API uses existing _moduleDashboard namespace, not new window global', dashboard.includes('markStatsDirty: markDashboardStatsDirty') && !dashboard.includes('window.markDashboardStatsDirty ='));

const txCommit = app.indexOf('window.__store.transactions = allTransactions');
const txDirty = app.indexOf("window._moduleDashboard.markStatsDirty(monthStr, 'transactions-live-mutation', 'finance')");
check('transaction live mutation marks finance dirty after store commit', txCommit >= 0 && txDirty > txCommit);
check('transaction mutation callback does not directly fetch Dashboard stats', (() => {
  const a = app.lastIndexOf('const _mergeAndRender', txDirty);
  const b = app.indexOf('};', txDirty) + 2;
  const block = app.slice(a, b);
  return !block.includes('fetchHistoricalDashboardFallback(') && !block.includes('fetchMonthStats(');
})());
check('initial transaction hydration is reconciled instead of unconditionally dirty', app.includes('_isTxInitialHydrationComplete()') && app.includes('reconcileHydrationEvidence') && app.includes('snapshotMeta.initial === false'));
check('profile snapshot #1 reconciles and only real later docChanges mark dirty', profiles.includes('_state.activeSnapshotCount === 1') && profiles.includes('reconcileHydrationEvidence') && profiles.includes("'profiles-live-mutation', 'members'"));

check('render.js remains zero Dashboard Firestore reads', !/\bgetDoc(?:s)?\s*\(/.test(renderDashboardSection));
check('render.js keeps dirty current chart/report on RAM evidence', renderDashboardSection.includes('selectedMonthDirty') && renderDashboardSection.includes('chartIncome[currentIdx] = tInc'));
check('canonical loader reuses clean per-month cache and targets dirty months', canonicalBlock.includes('monthsToFetch') && canonicalBlock.includes('_isCachedDashboardMonthReusable') && canonicalBlock.includes('Promise.all(monthsToFetch.map'));
check('canonical loader keeps one stats getDoc owner', (canonicalBlock.match(/\bgetDoc\s*\(/g) || []).length === 1);
check('flight token is immutable and old flight token is never relabeled', canonicalBlock.includes('Object.freeze({ ...requestToken })') && !canonicalBlock.includes('flight.token = requestToken'));
check('freshness revision participates in request stale guard', dashboard.includes('freshnessRevision') && dashboard.includes('Number(token.freshnessRevision || 0) === Number(_dashboardStatsFreshness.revision || 0)'));
check('new revision during flight records one bounded follow-up intent', canonicalBlock.includes('pendingRevision') && canonicalBlock.includes('dashboardDirtyFollowupRefresh++') && canonicalBlock.includes("scheduleDashboardHistoryFetch(selMonth, flight.pendingReason || 'freshness-followup'"));
check('current stats rejects stats txCount behind local transaction evidence', dashboard.includes("reason: 'stats-behind-local-count'"));
check('updatedAt normalizer supports Timestamp/Date/seconds', dashboard.includes("typeof value.toMillis === 'function'") && dashboard.includes('value instanceof Date') && dashboard.includes('value.seconds'));
check('member mutation cannot be falsely cleared by transaction count alone', dashboard.includes("reason: 'members-before-dirty-at'") && dashboard.includes("dirtyDomains.has('members')"));
check('Vietnam month helper avoids UTC ISO month authority', dashboard.includes("timeZone: 'Asia/Ho_Chi_Minh'") && dashboard.includes('window.getLocalToday') && !canonicalBlock.includes("new Date().toISOString().slice(0, 7)"));
check('unresolved dirty revalidation is bounded without polling', dashboard.includes('nextRevalidateAt') && dashboard.includes('dashboardDirtyReadBackoffSkipped') && !/setInterval\s*\(/.test(dashboard));
check('main build marker is exact V5U6C2 marker', main.includes("4K-6V5U6C2-dashboard-hydration-mutation-guard-20260812"));
check('freshness metrics extend existing __sparkReadMetrics', ['dashboardDirtyRevision','dashboardDirtyMarks','dashboardTargetedMonthReads','dashboardCurrentStatsRejectedStale','dashboardCurrentRamPreserved','dashboardDirtyFollowupRefresh','dashboardHydrationBaseline','dashboardHydrationMismatch','dashboardDirtyReadBackoffSkipped','dashboardDirtyRevalidationAttempts','dashboardDirtyResolved'].every(k => dashboard.includes(k)) && !dashboard.includes('window.__dashboardFreshnessMetrics'));

function makeEnv({ month = '2026-08', clubId = 'club-A', generation = 1, active = true } = {}) {
  const storage = new Map();
  const elements = new Map();
  const readByMonth = new Map();
  let getDocCount = 0, getDocsCount = 0, renderCount = 0;
  let currentMonth = month;
  let activeDashboard = active;
  let delayedMonth = '';
  let delayGate = null;
  const nowBase = Date.now() - 60_000;
  const statsByMonth = new Map();

  const recentMonths = (sel, count) => {
    const [y0, m0] = sel.split('-').map(Number); const arr = [];
    for (let i = count - 1; i >= 0; i--) {
      let y = y0, m = m0 - i; while (m <= 0) { m += 12; y--; }
      arr.push(`${y}-${String(m).padStart(2, '0')}`);
    }
    return arr;
  };
  for (const m of recentMonths(month, 6)) {
    statsByMonth.set(m, {
      'income.total': m === month ? 20_000_000 : 1_000_000,
      'expense.total': m === month ? 100_000 : 50_000,
      'members.active': 25,
      'members.new': 2,
      'members.quit': 1,
      txCount: m === month ? 100 : 10,
      updatedAt: nowBase,
    });
  }

  const filter = { get value() { return currentMonth; }, set value(v) { currentMonth = v; } };
  const getEl = (id) => {
    if (id === 'filterMonth' || id === 'monthPicker') return filter;
    if (!elements.has(id)) elements.set(id, { innerText: '', innerHTML: '', value: '', style: {}, classList: { add(){}, remove(){} } });
    return elements.get(id);
  };
  globalThis.document = {
    getElementById: getEl,
    querySelector: (sel) => sel === '.tab-content.active' ? { id: activeDashboard ? 'tab_dashboard' : 'tab_active' } : null,
    querySelectorAll: () => [],
  };
  globalThis.localStorage = {
    getItem: k => storage.has(k) ? storage.get(k) : null,
    setItem: (k, v) => storage.set(k, String(v)),
    removeItem: k => storage.delete(k),
  };
  const sdk = {
    doc: (...parts) => ({ parts }),
    getDoc: async (ref) => {
      getDocCount++;
      const raw = String(ref.parts?.[ref.parts.length - 1] || '');
      const m = raw.replace('_', '-');
      readByMonth.set(m, (readByMonth.get(m) || 0) + 1);
      if (delayedMonth === m && delayGate) await delayGate.promise;
      const data = statsByMonth.get(m);
      return data ? { exists: () => true, data: () => ({ ...data }) } : { exists: () => false, data: () => ({}) };
    },
    collection: (...parts) => ({ parts }),
    query: (ref, ...args) => ({ ref, args }),
    where: (...args) => ({ where: args }),
    limit: n => ({ limit: n }),
    getDocs: async () => { getDocsCount++; return { docs: [] }; },
  };
  globalThis.window = {
    _fb_init: sdk,
    __store: {
      db: {}, clubId, currentClubId: clubId, selectedMonth: month,
      tabHtmlCache: { reportList: '<tr><td class="font-black text-primary">RAM</td></tr>' },
      _lastSummaryNumbers: {}, transactions: [],
    },
    __verifiedAuthContextState: { generation },
    __sparkReadMetrics: null,
    formatMonthLabel: m => m,
    getRecentMonths: recentMonths,
    txMatchesSelectedMonth: (tx, m) => String(tx?.txMonth || '').slice(0, 7) === m,
    renderDashboardCharts: () => { renderCount++; },
    computeMonthlyFinanceHistory: () => ({}),
    recordFirestoreReadAttribution: () => {},
  };

  return {
    elements, statsByMonth, storage,
    setActive(v) { activeDashboard = !!v; },
    setMonth(v) { currentMonth = v; window.__store.selectedMonth = v; },
    setClub(id, gen) { window.__store.clubId = id; window.__store.currentClubId = id; window.__verifiedAuthContextState.generation = gen; },
    setDelay(m) { delayedMonth = m; delayGate = deferred(); return delayGate; },
    clearDelay() { delayedMonth = ''; delayGate = null; },
    resetReadCounts() { getDocCount = 0; getDocsCount = 0; readByMonth.clear(); },
    counts() { return { getDocCount, getDocsCount, renderCount, byMonth: Object.fromEntries(readByMonth) }; },
  };
}

function setRamEvidence(env, month, income, expense, count, activeCount = 25) {
  window.__store.transactions = Array.from({ length: count }, (_, i) => ({ id: `tx-${i}`, txMonth: month }));
  const summary = {
    incTuition: income, incExam: 0, incOther: 0, incUniform: 0,
    expTotal: expense, expExamTotal: 0, expUniform: 0,
    activeCount, debtCount: 0, totalDebtEst: 0, txCount: count, selMonth: month, unpaidInvCount: 0,
  };
  window.__store._lastSummaryNumbers = { ...summary };
  window.__store.tabHtmlCache.reportList = '<tr><td class="font-black text-primary">RAM-FRESH</td></tr>';
  return summary;
}

try {
  const env = makeEnv();
  const mod = await import(pathToFileURL(path.resolve('js/modules/dashboard.js')).href + `?freshness-basic=${Date.now()}`);
  mod.initDashboard();
  await mod.fetchHistoricalDashboardFallback('2026-08', 'cold');
  check('dynamic cold Dashboard remains <= 6 stats reads', env.counts().getDocCount === 6, JSON.stringify(env.counts()));

  env.resetReadCounts();
  await mod.fetchHistoricalDashboardFallback('2026-08', 'warm-clean');
  check('dynamic warm clean TTL hit performs zero stats reads', env.counts().getDocCount === 0, JSON.stringify(env.counts()));

  const summary = setRamEvidence(env, '2026-08', 20_500_000, 100_000, 101);
  mod.markDashboardStatsDirty('2026-08', 'payment-test', 'finance');
  mod.updateSummaryNumbers(summary);
  check('dynamic stale cache cannot overwrite newer payment RAM before revalidation', env.elements.get('totalIncomeDashboard')?.innerText === '20.500.000 ₫', env.elements.get('totalIncomeDashboard')?.innerText || '');

  env.resetReadCounts();
  await mod.fetchHistoricalDashboardFallback('2026-08', 'dirty-old-server');
  const oldCounts = env.counts();
  check('dynamic dirty current month revalidates exactly one stats doc', oldCounts.getDocCount === 1 && oldCounts.byMonth['2026-08'] === 1, JSON.stringify(oldCounts));
  check('dynamic clean historical months are reused without reread', ['2026-03','2026-04','2026-05','2026-06','2026-07'].every(m => !oldCounts.byMonth[m]), JSON.stringify(oldCounts.byMonth));
  check('dynamic stats txCount behind local evidence preserves RAM total', env.elements.get('totalIncomeDashboard')?.innerText === '20.500.000 ₫');
  check('dynamic stale stats rejection metrics increment', window.__sparkReadMetrics.dashboardCurrentStatsRejectedStale >= 1 && window.__sparkReadMetrics.dashboardCurrentRamPreserved >= 1);
  check('dynamic dirty remains unresolved while server stats are behind', window._moduleDashboard.getFreshnessState().dirtyMonths.some(x => x.month === '2026-08'));

  const nextRevalidateAt = window._moduleDashboard.getFreshnessState().dirtyMonths.find(x => x.month === '2026-08')?.nextRevalidateAt || 0;
  env.statsByMonth.set('2026-08', {
    'income.total': 20_500_000, 'expense.total': 100_000,
    'members.active': 25, 'members.new': 2, 'members.quit': 1,
    txCount: 101, updatedAt: nextRevalidateAt + 60_000,
  });
  env.resetReadCounts();
  await mod.fetchHistoricalDashboardFallback('2026-08', 'server-caught-up-before-retry');
  check('dynamic server catch-up before retry deadline performs zero reads', env.counts().getDocCount === 0, JSON.stringify(env.counts()));
  check('dynamic dirty remains until an eligible trigger', window._moduleDashboard.getFreshnessState().dirtyMonths.some(x => x.month === '2026-08'));
  const realDateNow = Date.now;
  Date.now = () => nextRevalidateAt + 1;
  env.resetReadCounts();
  try {
    await mod.fetchHistoricalDashboardFallback('2026-08', 'server-caught-up-eligible');
  } finally {
    Date.now = realDateNow;
  }
  check('dynamic server catch-up costs one targeted current-month stats read', env.counts().getDocCount === 1 && env.counts().byMonth['2026-08'] === 1, JSON.stringify(env.counts()));
  check('dynamic server catch-up is accepted and dirty clears', !window._moduleDashboard.getFreshnessState().dirtyMonths.some(x => x.month === '2026-08'));
  check('dynamic server catch-up keeps authoritative current income', env.elements.get('totalIncomeDashboard')?.innerText === '20.500.000 ₫');

  env.resetReadCounts();
  await mod.fetchHistoricalDashboardFallback('2026-08', 'post-catchup-cache-hit');
  check('dynamic clean cache after catch-up returns to zero reads', env.counts().getDocCount === 0);

  delete window.getLocalToday;
  check('dynamic Vietnam boundary 2026-09-01 00:30 => 2026-09', window._moduleDashboard.getLocalMonth(new Date('2026-08-31T17:30:00Z')) === '2026-09');
  check('dynamic Vietnam year boundary 2027-01-01 00:15 => 2027-01', window._moduleDashboard.getLocalMonth(new Date('2026-12-31T17:15:00Z')) === '2027-01');
} catch (e) {
  console.error(e);
  check('basic mutation freshness dynamic simulation completed', false);
}

try {
  const env = makeEnv();
  const mod = await import(pathToFileURL(path.resolve('js/modules/dashboard.js')).href + `?multi-invalidations=${Date.now()}`);
  mod.initDashboard();
  await mod.fetchHistoricalDashboardFallback('2026-08', 'seed');
  setRamEvidence(env, '2026-08', 20_500_000, 100_000, 101);
  env.statsByMonth.set('2026-08', {
    'income.total': 20_500_000, 'expense.total': 100_000,
    'members.active': 25, 'members.new': 2, 'members.quit': 1,
    txCount: 101, updatedAt: Date.now() + 60_000,
  });
  env.resetReadCounts();
  for (let i = 0; i < 5; i++) {
    mod.markDashboardStatsDirty('2026-08', `burst-${i}`, 'finance');
    mod.scheduleDashboardHistoryFetch('2026-08', `burst-${i}`);
  }
  await sleep(420);
  check('dynamic five invalidations coalesce to <= 1 targeted network read', env.counts().getDocCount === 1, JSON.stringify(env.counts()));
  check('dynamic burst targeted read metric increments once', window.__sparkReadMetrics.dashboardTargetedMonthReads === 1, JSON.stringify(window.__sparkReadMetrics));
} catch (e) {
  console.error(e);
  check('multiple invalidation simulation completed', false);
}

try {
  const env = makeEnv({ active: false });
  const mod = await import(pathToFileURL(path.resolve('js/modules/dashboard.js')).href + `?hidden=${Date.now()}`);
  mod.initDashboard();
  // Seed while visible, then switch hidden.
  env.setActive(true);
  await mod.fetchHistoricalDashboardFallback('2026-08', 'seed');
  env.setActive(false);
  setRamEvidence(env, '2026-08', 20_500_000, 100_000, 101);
  mod.markDashboardStatsDirty('2026-08', 'hidden-payment', 'finance');
  env.resetReadCounts();
  await mod.scheduleDashboardHistoryFetch('2026-08', 'hidden-payment');
  await sleep(320);
  check('dynamic hidden Dashboard mutation causes zero immediate stats reads', env.counts().getDocCount === 0, JSON.stringify(env.counts()));
  env.statsByMonth.set('2026-08', {
    'income.total': 20_500_000, 'expense.total': 100_000,
    'members.active': 25, 'members.new': 2, 'members.quit': 1,
    txCount: 101, updatedAt: Date.now() + 60_000,
  });
  env.setActive(true);
  await mod.scheduleDashboardHistoryFetch('2026-08', 'tab-open-after-dirty');
  await sleep(420);
  check('dynamic opening Dashboard after hidden dirty state performs one targeted read', env.counts().getDocCount === 1 && env.counts().byMonth['2026-08'] === 1, JSON.stringify(env.counts()));
} catch (e) {
  console.error(e);
  check('hidden Dashboard simulation completed', false);
}

try {
  const env = makeEnv();
  const mod = await import(pathToFileURL(path.resolve('js/modules/dashboard.js')).href + `?flight-revision=${Date.now()}`);
  mod.initDashboard();
  await mod.fetchHistoricalDashboardFallback('2026-08', 'seed');
  setRamEvidence(env, '2026-08', 20_500_000, 100_000, 101);
  mod.markDashboardStatsDirty('2026-08', 'revision-10', 'finance');
  const gate = env.setDelay('2026-08');
  env.resetReadCounts();
  const oldFlight = mod.fetchHistoricalDashboardFallback('2026-08', 'revision-10');
  await Promise.resolve(); await Promise.resolve();

  // A newer mutation arrives while the old targeted stats read is still in flight.
  setRamEvidence(env, '2026-08', 20_700_000, 100_000, 102);
  mod.markDashboardStatsDirty('2026-08', 'revision-11', 'finance');
  const sameFlight = mod.fetchHistoricalDashboardFallback('2026-08', 'revision-11');
  env.statsByMonth.set('2026-08', {
    'income.total': 20_500_000, 'expense.total': 100_000,
    'members.active': 25, 'members.new': 2, 'members.quit': 1,
    txCount: 101, updatedAt: Date.now(),
  });
  gate.resolve();
  const [oldResult, secondResult] = await Promise.all([oldFlight, sameFlight]);
  check('dynamic newer revision reuses running same-key flight instead of parallel flight', env.counts().getDocCount === 1 && oldResult === secondResult, JSON.stringify(env.counts()));
  check('dynamic old revision result is stale-dropped', oldResult?.stale === true && window.__sparkReadMetrics.dashboardStaleResultDropped >= 1, JSON.stringify(oldResult));
  check('dynamic stale old flight cannot clear newer dirty revision', window._moduleDashboard.getFreshnessState().dirtyMonths.some(x => x.month === '2026-08'));

  env.clearDelay();
  env.statsByMonth.set('2026-08', {
    'income.total': 20_700_000, 'expense.total': 100_000,
    'members.active': 25, 'members.new': 2, 'members.quit': 1,
    txCount: 102, updatedAt: Date.now() + 60_000,
  });
  await sleep(450);
  const counts = env.counts();
  check('dynamic mutation during flight schedules exactly one bounded follow-up read', counts.getDocCount === 2 && window.__sparkReadMetrics.dashboardDirtyFollowupRefresh === 1, JSON.stringify({ counts, metrics: window.__sparkReadMetrics }));
  check('dynamic bounded follow-up clears latest dirty revision after server catches up', !window._moduleDashboard.getFreshnessState().dirtyMonths.some(x => x.month === '2026-08'));
  check('dynamic latest RAM/current summary cannot be overwritten by old flight', env.elements.get('totalIncomeDashboard')?.innerText === '20.700.000 ₫', env.elements.get('totalIncomeDashboard')?.innerText || '');
} catch (e) {
  console.error(e);
  check('mutation-during-flight simulation completed', false);
}

console.log(`\nPASS ${pass}/${pass + fail}`);
if (fail) process.exit(1);
