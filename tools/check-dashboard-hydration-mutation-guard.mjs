#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const dashboard = fs.readFileSync('js/modules/dashboard.js', 'utf8');
const app = fs.readFileSync('app.js', 'utf8');
const profiles = fs.readFileSync('js/listeners/profiles.listeners.js', 'utf8');
const main = fs.readFileSync('js/main.js', 'utf8');
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => {
  if (ok) { pass++; console.log('✅', name); }
  else { fail++; console.error('❌', name, detail); }
};

console.log('\n=== Phase 4K-6V5U6C2 — Dashboard Hydration/Mutation Guard + Dirty Backoff ===\n');

const reconcileStart = dashboard.indexOf('export function reconcileDashboardHydrationEvidence');
const reconcileEnd = dashboard.indexOf('function _shouldApplyCanonicalCurrentMonth', reconcileStart);
const reconcileBlock = dashboard.slice(reconcileStart, reconcileEnd);
const canonicalStart = dashboard.indexOf('export async function fetchHistoricalDashboardFallback');
const canonicalEnd = dashboard.indexOf('export function scheduleDashboardHistoryFetch', canonicalStart);
const canonicalBlock = dashboard.slice(canonicalStart, canonicalEnd);

check('cache schema remains v3 because hydration/backoff metadata is RAM-only', /_SPARK_HISTORY_CACHE_VERSION\s*=\s*3\b/.test(dashboard));
check('hydration state extends the existing freshness owner', dashboard.includes('hydration: {') && dashboard.includes('finance: new Map()') && dashboard.includes('members: new Map()'));
check('hydration reconciliation performs no Firestore read', reconcileStart >= 0 && !/\bgetDoc(?:s)?\s*\(/.test(reconcileBlock));
check('hydration API stays on the existing _moduleDashboard namespace', dashboard.includes('reconcileHydrationEvidence: reconcileDashboardHydrationEvidence') && !dashboard.includes('window.reconcileDashboardHydrationEvidence ='));
check('dirty backoff is timestamp-only and has no polling', dashboard.includes('_DASHBOARD_DIRTY_RETRY_BACKOFF_MS = 90 * 1000') && dashboard.includes('nextRevalidateAt') && !/setInterval\s*\(/.test(dashboard));
check('all C2 metrics extend __sparkReadMetrics', [
  'dashboardHydrationBaseline', 'dashboardHydrationMismatch', 'dashboardInitialDirtySkipped',
  'dashboardLiveMutationDirty', 'dashboardDirtyReadBackoffSkipped',
  'dashboardDirtyRevalidationAttempts', 'dashboardDirtyResolved',
].every(key => dashboard.includes(key)) && !dashboard.includes('window.__dashboardHydrationMetrics'));
check('transaction source recorder returns initial/source metadata', app.includes('return { initial, sourceKey };'));
check('canonical transaction snapshot is hydration before mutation', app.includes("_desiredTxReadMode === 'canonical'") && app.includes('_txSourceSnapshotSeen.canonical') && app.includes("'transactions-canonical-initial-hydration'"));
check('legacy hydration requires all three initial sources', app.includes('_txSourceSnapshotSeen.byDate && _txSourceSnapshotSeen.byTxMonth && _txSourceSnapshotSeen.byPackageMonth'));
check('legacy callbacks pass source metadata into one merge owner', ['_mergeAndRender(meta); }).\n', "_recordTxSourceSnapshot('byDate'", "_recordTxSourceSnapshot('byTxMonth'", "_recordTxSourceSnapshot('byPackageMonth'"].slice(1).every(token => app.includes(token)) && (app.match(/_mergeAndRender\(meta\)/g) || []).length === 4);
check('live transaction dirty requires post-hydration fingerprint change', app.includes('snapshotMeta.initial === false') && app.includes('_committedTxFingerprint !== _lastCommittedTxFingerprint') && app.includes("'transactions-live-mutation', 'finance'"));
check('legacy duplicate callbacks coalesce at the transaction owner', app.includes('_fingerprintMergedTransactions') && app.includes('_lastCommittedTxFingerprint = _committedTxFingerprint'));
check('transaction dirty becomes visible before delayed Dashboard invalidation', app.indexOf("markStatsDirty(monthStr, 'transactions-live-mutation', 'finance')") < app.indexOf("_invalidateDashboardCoalesced('transactions-snapshot')"));
check('profile snapshot #1 records member hydration evidence', profiles.includes('_state.activeSnapshotCount === 1') && profiles.includes("domain: 'members'") && profiles.includes("'active-profiles-initial-hydration'"));
check('profile live dirty requires real docChanges', profiles.includes("change.type === 'added'") && profiles.includes("change.type === 'modified'") && profiles.includes("change.type === 'removed'") && profiles.includes("'profiles-live-mutation', 'members'"));
check('Coach is excluded from both profile reconciliation and dirty marks', /if \(!isCoach && _state\.activeSnapshotCount === 1/.test(profiles) && /else if \(!isCoach && _state\.activeSnapshotCount > 1/.test(profiles));
check('logout resets Dashboard hydration identity', app.includes("window._moduleDashboard?.resetFreshness?.('logout')"));
check('all targeted stats reads remain inside canonical loader', (canonicalBlock.match(/\bgetDoc\s*\(/g) || []).length === 1 && !/\bgetDoc(?:s)?\s*\(/.test(reconcileBlock));
check('unresolved dirty skip is evaluated before monthsToFetch', canonicalBlock.indexOf('_isDashboardDirtyBackoffActive') < canonicalBlock.indexOf('Promise.all(monthsToFetch.map'));
check('new dirty revisions reset retry metadata', dashboard.includes('lastAttemptAt: 0') && dashboard.includes('attemptCount: 0') && dashboard.includes('nextRevalidateAt: 0'));
check('build marker is exact C2 marker', main.includes('4K-6V5U6C2-dashboard-hydration-mutation-guard-20260812'));

const realDateNow = Date.now;
let fakeNow = 1_786_588_800_000;
Date.now = () => fakeNow;

function recentMonths(sel, count = 6) {
  const [year, month] = sel.split('-').map(Number);
  const out = [];
  for (let i = count - 1; i >= 0; i--) {
    let y = year, m = month - i;
    while (m <= 0) { m += 12; y--; }
    out.push(`${y}-${String(m).padStart(2, '0')}`);
  }
  return out;
}

function makeEnv({ month = '2026-08', clubId = 'club-A', generation = 1, role = 'viewer' } = {}) {
  const storage = new Map();
  const elements = new Map();
  const statsByMonth = new Map();
  const readsByMonth = new Map();
  let getDocCount = 0;
  let getDocsCount = 0;
  let currentMonth = month;

  for (const m of recentMonths(month)) {
    statsByMonth.set(m, {
      'income.total': m === month ? 20_000_000 : 1_000_000,
      'expense.total': m === month ? 100_000 : 50_000,
      'members.active': m === month ? 100 : 90,
      'members.new': 2,
      'members.quit': 1,
      txCount: m === month ? 100 : 10,
      updatedAt: fakeNow - 60_000,
    });
  }

  const filter = { get value() { return currentMonth; }, set value(v) { currentMonth = v; } };
  const getElementById = id => {
    if (id === 'filterMonth' || id === 'monthPicker') return filter;
    if (!elements.has(id)) elements.set(id, { innerText: '', innerHTML: '', value: '', style: {}, classList: { add() {}, remove() {} } });
    return elements.get(id);
  };
  globalThis.document = {
    getElementById,
    querySelector: selector => selector === '.tab-content.active' ? { id: 'tab_dashboard' } : null,
    querySelectorAll: () => [],
  };
  globalThis.localStorage = {
    getItem: key => storage.has(key) ? storage.get(key) : null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: key => storage.delete(key),
  };
  const sdk = {
    doc: (...parts) => ({ parts }),
    getDoc: async ref => {
      getDocCount++;
      const monthId = String(ref.parts?.[ref.parts.length - 1] || '').replace('_', '-');
      readsByMonth.set(monthId, (readsByMonth.get(monthId) || 0) + 1);
      const data = statsByMonth.get(monthId);
      return data ? { exists: () => true, data: () => ({ ...data }) } : { exists: () => false, data: () => ({}) };
    },
    collection: (...parts) => ({ parts }),
    query: (ref, ...args) => ({ ref, args }),
    where: (...args) => ({ where: args }),
    limit: value => ({ limit: value }),
    getDocs: async () => { getDocsCount++; return { docs: [] }; },
  };
  globalThis.window = {
    _fb_init: sdk,
    __store: {
      db: {}, clubId, currentClubId: clubId, selectedMonth: month, userRole: role,
      transactions: [], tabHtmlCache: { reportList: '<tr><td class="font-black text-primary">RAM</td></tr>' },
      _lastSummaryNumbers: {},
    },
    userRole: role,
    __verifiedAuthContextState: { generation },
    __sparkReadMetrics: null,
    getRecentMonths: recentMonths,
    getLocalToday: () => `${month}-13`,
    formatMonthLabel: value => value,
    txMatchesSelectedMonth: (tx, value) => String(tx?.txMonth || '').slice(0, 7) === value,
    computeMonthlyFinanceHistory: (transactions, months) => Object.fromEntries(months.map(value => [value, {
      income: transactions.reduce((sum, tx) => sum + Number(tx.income || 0), 0),
      expense: transactions.reduce((sum, tx) => sum + Number(tx.expense || 0), 0),
    }])),
    renderDashboardCharts: () => {},
    recordFirestoreReadAttribution: () => {},
  };

  const setRam = ({ income, expense, count, active = 100 }) => {
    window.__store.transactions = Array.from({ length: count }, (_, index) => ({ id: `tx-${index}`, txMonth: month }));
    const summary = {
      incTuition: income, incExam: 0, incOther: 0, incUniform: 0,
      expTotal: expense, expExamTotal: 0, expUniform: 0,
      activeCount: active, debtCount: 0, totalDebtEst: 0, txCount: count,
      selMonth: month, unpaidInvCount: 0,
    };
    window.__store._lastSummaryNumbers = summary;
    return summary;
  };

  return {
    month, statsByMonth, elements, setRam,
    resetReads() { getDocCount = 0; getDocsCount = 0; readsByMonth.clear(); },
    counts() { return { getDocCount, getDocsCount, byMonth: Object.fromEntries(readsByMonth) }; },
    switchClub(nextClubId, nextGeneration) {
      window.__store.clubId = nextClubId;
      window.__store.currentClubId = nextClubId;
      window.__verifiedAuthContextState.generation = nextGeneration;
    },
  };
}

async function loadDashboard(tag) {
  const mod = await import(pathToFileURL(path.resolve('js/modules/dashboard.js')).href + `?c2=${tag}-${Math.random()}`);
  mod.initDashboard();
  return mod;
}

try {
  const env = makeEnv();
  const mod = await loadDashboard('initial-match-viewer');
  await mod.fetchHistoricalDashboardFallback(env.month, 'seed-cache');
  env.setRam({ income: 20_000_000, expense: 100_000, count: 100, active: 100 });
  const finance = mod.reconcileDashboardHydrationEvidence({
    domain: 'finance', month: env.month, reason: 'finance-initial-match',
    evidence: { localMonthTxCount: 100, incomeTotal: 20_000_000, expenseTotal: 100_000, hasFinanceTotals: true, coverageComplete: true },
  });
  const members = mod.reconcileDashboardHydrationEvidence({
    domain: 'members', month: env.month, reason: 'members-initial-match',
    evidence: { activeCount: 100, activeAvailable: true, coverageComplete: true },
  });
  check('finance initial match establishes CLEAN hydration baseline', finance.status === 'match' && window._moduleDashboard.getFreshnessState().dirtyMonths.length === 0, finance.status);
  check('member initial match establishes CLEAN hydration baseline', members.status === 'match' && window._moduleDashboard.getFreshnessState().dirtyMonths.length === 0, members.status);
  env.resetReads();
  for (let i = 0; i < 5; i++) await mod.fetchHistoricalDashboardFallback(env.month, `viewer-open-${i}`);
  check('Viewer opens Dashboard five times with matching cache and zero stats reads', env.counts().getDocCount === 0, JSON.stringify(env.counts()));
  check('matching hydration records no false dirty revision', window._moduleDashboard.getFreshnessState().revision === 0);
} catch (error) {
  console.error(error);
  check('initial-match/viewer simulation completed', false);
}

try {
  const env = makeEnv();
  const mod = await loadDashboard('finance-mismatch-backoff');
  await mod.fetchHistoricalDashboardFallback(env.month, 'seed-cache');
  const summary = env.setRam({ income: 20_500_000, expense: 100_000, count: 101, active: 100 });
  const mismatch = mod.reconcileDashboardHydrationEvidence({
    domain: 'finance', month: env.month, reason: 'finance-initial-mismatch',
    evidence: { localMonthTxCount: 101, incomeTotal: 20_500_000, expenseTotal: 100_000, hasFinanceTotals: true, coverageComplete: true },
  });
  mod.updateSummaryNumbers(summary);
  let state = window._moduleDashboard.getFreshnessState();
  check('initial finance mismatch marks dirty exactly once', mismatch.marked === true && state.revision === 1 && state.dirtyMonths.length === 1, JSON.stringify(state));
  env.resetReads();
  await mod.fetchHistoricalDashboardFallback(env.month, 'first-targeted-revalidation');
  state = window._moduleDashboard.getFreshnessState();
  check('unresolved finance dirty performs one targeted current-month read', env.counts().getDocCount === 1 && env.counts().byMonth[env.month] === 1, JSON.stringify(env.counts()));
  check('unresolved finance dirty preserves RAM and sets retry eligibility', state.dirtyMonths[0]?.nextRevalidateAt > fakeNow && env.elements.get('totalIncomeDashboard')?.innerText === '20.500.000 ₫', JSON.stringify({ dirty: state.dirtyMonths[0], incomeText: env.elements.get('totalIncomeDashboard')?.innerText }));
  env.resetReads();
  for (let i = 0; i < 10; i++) await mod.fetchHistoricalDashboardFallback(env.month, `before-retry-${i}`);
  check('ten Dashboard triggers before retry deadline perform zero extra reads', env.counts().getDocCount === 0, JSON.stringify(env.counts()));
  const nextRetry = window._moduleDashboard.getFreshnessState().dirtyMonths[0].nextRevalidateAt;
  fakeNow = nextRetry + 1;
  env.statsByMonth.set(env.month, {
    'income.total': 20_500_000, 'expense.total': 100_000, 'members.active': 100,
    'members.new': 2, 'members.quit': 1, txCount: 101, updatedAt: fakeNow,
  });
  env.resetReads();
  await mod.fetchHistoricalDashboardFallback(env.month, 'eligible-server-catchup');
  check('next eligible trigger performs one targeted read', env.counts().getDocCount === 1 && env.counts().byMonth[env.month] === 1, JSON.stringify(env.counts()));
  check('server catch-up resolves hydration dirty', window._moduleDashboard.getFreshnessState().dirtyMonths.length === 0);

  const summary102 = env.setRam({ income: 20_700_000, expense: 100_000, count: 102, active: 100 });
  const revision102 = mod.markDashboardStatsDirty(env.month, 'payment-102', 'finance');
  mod.updateSummaryNumbers(summary102);
  env.resetReads();
  await mod.fetchHistoricalDashboardFallback(env.month, 'payment-102-unresolved');
  const cooled = window._moduleDashboard.getFreshnessState().dirtyMonths[0];
  check('real mutation after hydration increments one live dirty revision', revision102?.eventType === 'live-mutation' && cooled?.revision === revision102.revision);
  const summary103 = env.setRam({ income: 20_900_000, expense: 100_000, count: 103, active: 100 });
  const revision103 = mod.markDashboardStatsDirty(env.month, 'payment-103-during-backoff', 'finance');
  mod.updateSummaryNumbers(summary103);
  check('new mutation resets the old retry cooldown', revision103?.revision === revision102.revision + 1 && revision103.nextRevalidateAt === 0 && revision103.attemptCount === 0, JSON.stringify(revision103));
  env.resetReads();
  await mod.fetchHistoricalDashboardFallback(env.month, 'new-revision-immediate-eligibility');
  check('new revision is immediately eligible for one targeted read', env.counts().getDocCount === 1, JSON.stringify(env.counts()));
  check('RAM current-month authority remains protected during backoff', env.elements.get('totalIncomeDashboard')?.innerText === '20.900.000 ₫', env.elements.get('totalIncomeDashboard')?.innerText || '');
} catch (error) {
  console.error(error);
  check('finance mismatch/backoff simulation completed', false);
}

try {
  fakeNow += 200_000;
  const env = makeEnv();
  const mod = await loadDashboard('member-mismatch');
  await mod.fetchHistoricalDashboardFallback(env.month, 'seed-cache');
  env.setRam({ income: 20_000_000, expense: 100_000, count: 100, active: 101 });
  const mismatch = mod.reconcileDashboardHydrationEvidence({
    domain: 'members', month: env.month, reason: 'members-initial-mismatch',
    evidence: { activeCount: 101, activeAvailable: true, coverageComplete: true },
  });
  env.resetReads();
  await mod.fetchHistoricalDashboardFallback(env.month, 'member-targeted-revalidation');
  const snap = mod.getDashboardCanonicalStatsSnapshot(env.month);
  const selectedIndex = snap.months.indexOf(env.month);
  check('initial member mismatch marks dirty once', mismatch.marked === true && window._moduleDashboard.getFreshnessState().revision === 1);
  check('unresolved member mismatch costs one targeted read', env.counts().getDocCount === 1, JSON.stringify(env.counts()));
  check('member RAM authority protects selected chart point', selectedIndex >= 0 && snap.chartData.active[selectedIndex] === 101, JSON.stringify(snap.chartData.active));
} catch (error) {
  console.error(error);
  check('member mismatch simulation completed', false);
}

try {
  fakeNow += 200_000;
  const env = makeEnv();
  const mod = await loadDashboard('cold-hydration-mismatch');
  env.setRam({ income: 20_500_000, expense: 100_000, count: 101, active: 100 });
  const pending = mod.reconcileDashboardHydrationEvidence({
    domain: 'finance', month: env.month, reason: 'cold-finance-hydration',
    evidence: { localMonthTxCount: 101, incomeTotal: 20_500_000, expenseTotal: 100_000, hasFinanceTotals: true, coverageComplete: true },
  });
  check('hydration without canonical payload stays clean and pending', pending.status === 'pending-canonical' && window._moduleDashboard.getFreshnessState().dirtyMonths.length === 0, pending.status);
  env.resetReads();
  await mod.fetchHistoricalDashboardFallback(env.month, 'cold-canonical-load');
  check('cold mismatch uses the normal six-read canonical flight only', env.counts().getDocCount === 6, JSON.stringify(env.counts()));
  check('cold canonical response detects mismatch and preserves dirty once', window._moduleDashboard.getFreshnessState().revision === 1 && window._moduleDashboard.getFreshnessState().dirtyMonths.length === 1);
} catch (error) {
  console.error(error);
  check('cold hydration simulation completed', false);
}

try {
  const env = makeEnv({ role: 'coach' });
  const mod = await loadDashboard('coach-exclusion');
  const coachResult = mod.reconcileDashboardHydrationEvidence({
    domain: 'members', month: env.month, reason: 'coach-profile-initial',
    evidence: { activeCount: 20, activeAvailable: true, coverageComplete: true },
  });
  check('Coach hydration reconciliation is skipped with zero Dashboard dirty marks', coachResult.status === 'skipped' && window._moduleDashboard.getFreshnessState().dirtyMonths.length === 0);
  check('Coach hydration reconciliation performs zero stats reads', env.counts().getDocCount === 0);
} catch (error) {
  console.error(error);
  check('Coach exclusion simulation completed', false);
}

try {
  const env = makeEnv();
  const mod = await loadDashboard('identity-reset');
  mod.markDashboardStatsDirty(env.month, 'club-a-mutation', 'finance');
  env.switchClub('club-B', 2);
  mod.reconcileDashboardHydrationEvidence({
    domain: 'members', month: env.month, reason: 'club-b-hydration',
    evidence: { activeCount: 50, activeAvailable: true, coverageComplete: true },
  });
  const state = window._moduleDashboard.getFreshnessState();
  check('club/auth switch clears Club A dirty and hydration state', state.identity.clubId === 'club-B' && state.identity.authGeneration === 2 && state.dirtyMonths.length === 0 && state.hydration.finance.length === 0, JSON.stringify(state));
} catch (error) {
  console.error(error);
  check('identity reset simulation completed', false);
}

Date.now = realDateNow;
console.log(`\nPASS ${pass}/${pass + fail}`);
if (fail) process.exit(1);
