// js/core/clubStatsAutoCache.js
// Phase 4K-6I-F — Admin-side automatic SuperAdmin stats cache sync
// Purpose:
// - SuperAdmin must NOT aggregate/count all club subcollections on login.
// - Each Admin client already has profiles/transactions for its own club in memory.
// - This module computes lightweight cached summary fields and writes them to clubs/{clubId}.
// - SuperAdmin then reads O(1) club root cache fields without runAggregationQuery storms.

const CACHE_TTL_MS = 5 * 60 * 1000;
const BOOTSTRAP_ATTEMPTS = 8;
const BOOTSTRAP_DELAY_MS = 3500;

let _started = false;
let _timer = null;
let _lastSyncAt = 0;
let _lastFingerprint = '';
let _lastResult = null;
let _syncInFlight = null;

function _nowVNDate() {
  return new Date(Date.now() + 7 * 3600 * 1000);
}

function getCurrentMonthVN() {
  return _nowVNDate().toISOString().slice(0, 7);
}

function _statsDocId(monthKey) {
  return String(monthKey || getCurrentMonthVN()).replace('-', '_');
}

function _ctx(reason = 'club-stats-auto-cache') {
  return typeof window.getAppContext === 'function' ? (window.getAppContext(reason) || {}) : {};
}

function _isSuperAdminRuntime() {
  try {
    if (typeof window.isSuperAdminRole === 'function' && window.isSuperAdminRole()) return true;
    const st = window.__store || {};
    if (st.currentUser && st.currentUser.isSuperAdmin) return true;
    const role = String(window.userRole || st.userRole || st.role || '').toLowerCase();
    return role === 'super_admin' || role === 'superadmin' || role === 'root';
  } catch (_) {
    return false;
  }
}

function _clubId() {
  const c = _ctx('club-stats-club-id');
  return c.clubId || c.currentClubId || (window.__store && (window.__store.clubId || window.__store.currentClubId)) || window.currentClubId || '';
}

function _profilesMap() {
  const st = window.__store || {};
  return st.profiles || window.allProfiles || {};
}

function _transactionsArray() {
  const st = window.__store || {};
  return Array.isArray(st.transactions) ? st.transactions :
         Array.isArray(st.allTransactions) ? st.allTransactions :
         Array.isArray(window.allTransactions) ? window.allTransactions : [];
}

function _authorityPolicy() {
  return window.ProductionAuthorityPolicy || null;
}

function _clientStatsWriterAllowed() {
  const policy = _authorityPolicy();
  return !!(policy && policy.mode === 'client-only' && policy.statsWriter === 'client');
}

function _transactionFinanceCoverage(monthKey, clubId) {
  const coverage = window.__store?.transactionCoverage;
  const sameClub = !!coverage && String(coverage.clubId || '') === String(clubId || '');
  const sameMonth = !!coverage && String(coverage.month || '') === String(monthKey || '');
  const financeComplete = sameClub && sameMonth && coverage.ready === true && coverage.complete === true &&
    coverage.pageServerComplete === true && coverage.pageEvidence?.epoch === window.__store?._activeTxProjectionEpoch &&
    String(coverage.readMode || '') === String(window.__store?._activeTxReadMode || '');
  return {
    month: monthKey,
    financeComplete,
    transactionReadMode: String(coverage?.readMode || 'unknown'),
    transactionHitLimit: coverage?.hitLimit === true,
    transactionObservedCount: Math.max(0, Number(coverage?.mergedCount) || 0),
    transactionSourceCounts: coverage?.sourceCounts && typeof coverage.sourceCounts === 'object'
      ? { ...coverage.sourceCounts }
      : {},
    transactionLimit: Math.max(0, Number(coverage?.limit) || 0),
    sameClub,
    sameMonth,
    checkedAt: Date.now(),
  };
}

function _inventoryArray() {
  const st = window.__store || {};
  return Array.isArray(st.inventory) ? st.inventory :
         Array.isArray(st.allInventory) ? st.allInventory :
         Array.isArray(window.allInventory) ? window.allInventory : [];
}

function _normalizeStatus(p) {
  if (!p || typeof p !== 'object') return 'unknown';
  if (typeof window.classifyProfileStatus === 'function') {
    try { return window.classifyProfileStatus(p); } catch (_) {}
  }
  const s = String(p.status || p.studentStatus || '').toLowerCase().trim();
  if (s === 'quit' || s === 'nghi' || s === 'nghỉ' || s === 'inactive' || p.active === false || p.isActive === false) return 'quit';
  if (s === 'trial') return 'trial';
  return 'active';
}

function _txMonth(tx) {
  if (!tx || typeof tx !== 'object') return '';
  const candidates = [tx.txMonth, tx.month, tx.revenueMonth, tx.periodMonth, tx.billingMonth, tx.date, tx.createdAt];
  for (const c of candidates) {
    if (!c) continue;
    const s = String(c);
    const m = s.match(/(20\d{2})[-_/](0[1-9]|1[0-2])/);
    if (m) return `${m[1]}-${m[2]}`;
  }
  if (tx.timestamp) {
    const d = new Date(Number(tx.timestamp));
    if (!Number.isNaN(d.getTime())) return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }
  return '';
}

function _isExpenseTx(tx) {
  const type = String(tx?.type || tx?.kind || tx?.category || '').toLowerCase();
  return type.includes('chi') || type.includes('expense') || tx?.isExpense === true || tx?.direction === 'expense';
}

function _isIncomeTx(tx) {
  if (!tx || typeof tx !== 'object') return false;
  const amount = Number(tx.amount || tx.total || tx.value || 0);
  if (!Number.isFinite(amount) || amount <= 0) return false;
  if (_isExpenseTx(tx)) return false;
  const type = String(tx.type || '').toLowerCase();
  // Known income types in this app are usually tuition, exam fee, inventory/uniform, admission, other income.
  if (!type) return true;
  if (type.includes('thu') || type.includes('học phí') || type.includes('hoc phi') || type.includes('thi') || type.includes('võ') || type.includes('vo') || type.includes('admission') || type.includes('income')) return true;
  // Fallback: positive non-expense transaction counts as income for SuperAdmin current month summary.
  return true;
}

function computeClubStatsCache(monthKey = getCurrentMonthVN()) {
  const profiles = _profilesMap();
  const txs = _transactionsArray();
  const inv = _inventoryArray();
  const profileEntries = Object.entries(profiles || {});
  let activeCount = 0;
  let trialCount = 0;
  let quitCount = 0;
  for (const [, p] of profileEntries) {
    const st = _normalizeStatus(p);
    if (st === 'quit') quitCount++;
    else if (st === 'trial') { trialCount++; activeCount++; }
    else activeCount++;
  }

  let monthlyIncome = 0;
  let monthlyExpense = 0;
  let monthlyTxCount = 0;
  const monthTxs = [];
  for (const tx of txs) {
    if (_txMonth(tx) !== monthKey) continue;
    monthTxs.push(tx);
    monthlyTxCount++;
    const amt = Number(tx.amount || tx.total || tx.value || 0);
    if (!Number.isFinite(amt)) continue;
    if (_isExpenseTx(tx)) monthlyExpense += Math.abs(amt);
    else if (_isIncomeTx(tx)) monthlyIncome += amt;
  }

  const transactionCoverage = _transactionFinanceCoverage(monthKey, _clubId());
  return {
    month: monthKey,
    statsDocId: _statsDocId(monthKey),
    activeCount,
    trialCount,
    quitCount,
    profileCount: profileEntries.length,
    txCount: txs.length,
    inventoryCount: inv.length,
    monthlyIncome,
    monthlyExpense,
    monthlyProfit: monthlyIncome - monthlyExpense,
    monthlyTxCount,
    transactionCoverage,
    financeComplete: transactionCoverage.financeComplete,
    source: 'admin-client-auto-cache',
    computedAt: Date.now(),
    ready: transactionCoverage.financeComplete || profileEntries.length > 0 || txs.length > 0 || inv.length > 0,
  };
}

function _fingerprint(stats) {
  return [stats.month, stats.activeCount, stats.profileCount, stats.txCount, stats.inventoryCount, stats.monthlyIncome, stats.monthlyExpense, stats.monthlyTxCount, stats.financeComplete, stats.transactionCoverage?.transactionReadMode, stats.transactionCoverage?.transactionHitLimit].join('|');
}

// Inserted into the existing clubStatsAutoCache owner; no independent writer.
let _pendingRequiredState = null;
let _financeTransition = null;
let _publishedFinancialScope = '';
const _hydratedFinanceScopes = new Set();

function _financeContext(month) {
  const auth = window.__verifiedAuthContextState || {}, c = _ctx('finance-cache-authority');
  const clubId = String(_clubId() || '');
  if (auth.ready !== true || !auth.uid || !['admin', 'owner'].includes(String(auth.role || '')) ||
      String(auth.clubId || '') !== clubId || !_clientStatsWriterAllowed() ||
      window.RoleReadBoundary?.canMount?.('club.stats-cache', { reason: 'finance-cache-authority' }) === false) return null;
  return { uid: auth.uid, role: auth.role, clubId, month: String(month || getCurrentMonthVN()),
    generation: auth.generation, sessionEpoch: auth.sessionEpoch, authGeneration: auth.authGeneration,
    db: c.db || window.__store?.db };
}
function _financeIdentity(c) {
  return c ? JSON.stringify([c.uid,c.role,c.clubId,c.month,c.generation,c.sessionEpoch,c.authGeneration]) : '';
}
function _financeContextCurrent(c) { return !!c && _financeIdentity(c) === _financeIdentity(_financeContext(c.month)) && _financeSelectedMonth() === c.month; }
function _financeSelectedMonth() {
  return String(window.__store?._activeTxListenerMonth || window.__store?.transactionCoverage?.month || '');
}
function _financeScope(c, mode) { return _financeIdentity(c) + '|' + String(mode || 'unknown'); }
function _transitionCurrent(t) {
  return !!t && _financeTransition === t && _financeContextCurrent(t.context) &&
    _financeSelectedMonth() === t.context.month && (!t.targetEpoch ||
      (window.__store?._activeTxProjectionEpoch === t.targetEpoch && window.__store?._activeTxReadMode === t.toMode));
}
function _deferredFinanceBarrier() { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; }
function _markFinanceTransitionDirty(t) {
  if (!t.dirtyMarked && typeof window._moduleDashboard?.markStatsDirty === 'function') {
    window._moduleDashboard.markStatsDirty(t.context.month, 'finance-authority-transition', 'finance');
    t.dirtyMarked = true;
  }
}
function _replaceFinanceTransition(t) {
  if (_financeTransition && _financeTransition !== t) {
    _financeTransition.barrier.resolve({ ok: false, stale: true, reason: 'DROP_STALE' });
  }
  if (t) {
    _hydratedFinanceScopes.delete(_financeScope(t.context, t.fromMode));
    _hydratedFinanceScopes.delete(_financeScope(t.context, t.toMode));
  }
  _financeTransition = t;
}
function _newFinanceTransition(context, fromMode, toMode) {
  return { context, fromMode, toMode, sourceEpoch: window.__store?._activeTxProjectionEpoch,
    targetEpoch: null, phase: 'barrier', barrierAck: false, ready: false, completeQueued: false,
    barrier: _deferredFinanceBarrier(), dirtyMarked: false };
}
function _queueFinanceComplete(t) {
  if (!_transitionCurrent(t) || !t.barrierAck || !t.ready || t.completeQueued || t.phase === 'complete') return;
  t.completeQueued = true;
  _enqueueClubStatsState({ kind: 'complete', token: t, context: t.context, reason: 'finance-target-server-complete' });
}
function _acceptFinanceBarrier(t, result) {
  t.barrierAck = result.ok === true;
  if (result.ok) _publishedFinancialScope = '';
  if (_transitionCurrent(t)) {
    t.phase = result.ok ? 'waiting-target' : 'failed';
    t.barrier.resolve({ ...result, isCurrent: () => _transitionCurrent(t) && t.barrierAck });
    if (result.ok) _queueFinanceComplete(t);
  } else {
    t.barrier.resolve({ ok: false, stale: true, reason: 'DROP_STALE' });
    const next = _financeTransition;
    // Same authority rehydration may adopt an already-sent incomplete ACK.
    // It has its own token/epoch; no old COMPLETE or local result is adopted.
    if (next?.inheritedBarrier === t && _transitionCurrent(next)) _acceptFinanceBarrier(next, result);
  }
}
function _enqueueClubStatsState(request) {
  const pending = _pendingRequiredState;
  if (!(request.kind === 'regular' && pending && pending.kind !== 'regular')) _pendingRequiredState = request;
  if (_syncInFlight) return _syncInFlight;
  let resolveFlight;
  _syncInFlight = new Promise(r => { resolveFlight = r; });
  const flight = _syncInFlight;
  (async () => {
    while (_pendingRequiredState) {
      const req = _pendingRequiredState; _pendingRequiredState = null;
      let result;
      if (!_financeContextCurrent(req.context) || (req.token && !_transitionCurrent(req.token))) {
        result = { ok: false, stale: true, reason: 'DROP_STALE' };
      } else {
        try { result = await _writeClubStatsState(req); }
        catch (error) { result = { ok: false, reason: error?.code || error?.message || 'cache-write-failed' }; }
      }
      _lastResult = result;
      if (req.kind === 'barrier') _acceptFinanceBarrier(req.token, result);
      if (req.kind === 'complete') {
        req.token.completeQueued = false;
        if (_transitionCurrent(req.token) && result.ok) {
          req.token.phase = 'complete';
          _markFinanceTransitionDirty(req.token);
          window.invalidateDashboard?.('finance-authority-complete');
        }
      }
    }
    // Clear synchronously with the final queue check: no finally/microtask gap
    // may swallow a request which joined the previous flight.
    _syncInFlight = null; resolveFlight(_lastResult);
  })().catch(error => {
    _syncInFlight = null; resolveFlight({ ok: false, reason: error?.message || 'cache-queue-failed' });
  });
  return flight;
}
function beginFinanceTransition(input = {}) {
  const context = _financeContext(input.month), fromMode = String(input.fromMode || ''), toMode = String(input.toMode || '');
  if (!context || (input.clubId && input.clubId !== context.clubId) || !/^[0-9]{4}-(0[1-9]|1[0-2])$/.test(context.month) ||
      !['legacy','canonical'].includes(fromMode) || !['legacy','canonical'].includes(toMode)) {
    return Promise.resolve({ ok: false, reason: 'finance-transition-context-unverified' });
  }
  if (fromMode === toMode) return Promise.resolve({ ok: true, skipped: true, reason: 'same-authority-mode' });
  const old = _financeTransition;
  if (old && _financeContextCurrent(old.context) && _financeIdentity(old.context) === _financeIdentity(context) &&
      old.fromMode === fromMode && old.toMode === toMode && !['complete','failed'].includes(old.phase)) return old.barrier.promise;
  const t = _newFinanceTransition(context, fromMode, toMode);
  _replaceFinanceTransition(t); _markFinanceTransitionDirty(t);
  _enqueueClubStatsState({ kind: 'barrier', token: t, context, reason: 'finance-authority-transition' });
  return t.barrier.promise;
}
function bindFinanceContext(input = {}) {
  const context = _financeContext(input.month);
  if (!context || (input.clubId && input.clubId !== context.clubId)) return { ready: false, wait: Promise.resolve({ ok: false, reason: 'finance-context-unverified' }) };
  let t = _financeTransition;
  const sameScope = t && _financeIdentity(t.context) === _financeIdentity(context);
  if (sameScope && (t.phase === 'failed' || (t.phase === 'complete' && t.toMode === input.toMode))) {
    _replaceFinanceTransition(null); t = null;
  }
  if (t && sameScope && (t.toMode === input.toMode || t.barrierAck) && t.phase !== 'failed') {
    if ((t.targetEpoch && t.targetEpoch !== input.epoch) || t.toMode !== input.toMode) {
      const next = _newFinanceTransition(context, t.fromMode, input.toMode);
      next.targetEpoch = input.epoch; next.inheritedBarrier = t; next.dirtyMarked = t.dirtyMarked;
      next.barrierAck = t.barrierAck; next.phase = t.barrierAck ? 'waiting-target' : 'barrier';
      _replaceFinanceTransition(next); t = next;
      if (t.barrierAck) t.barrier.resolve({ ok: true, reason: 'same-authority-barrier-already-acked', isCurrent: () => _transitionCurrent(t) });
    } else t.targetEpoch = input.epoch;
    return { ready: t.barrierAck, wait: t.barrier.promise };
  }
  if (input.fromMode && input.fromMode !== input.toMode && ['legacy','canonical'].includes(input.fromMode)) {
    const wait = beginFinanceTransition(input); t = _financeTransition;
    if (t && _financeIdentity(t.context) === _financeIdentity(context)) t.targetEpoch = input.epoch;
    return { ready: t?.barrierAck === true, wait };
  }
  return { ready: true, wait: Promise.resolve({ ok: true, reason: 'same-authority-context' }) };
}
function _financeSourcesServerSettled(coverage) {
  const keys = coverage?.readMode === 'canonical' ? ['canonical'] : ['byDate','byTxMonth','byPackageMonth'];
  return coverage?.ready === true && coverage.pageEvidence?.epoch === window.__store?._activeTxProjectionEpoch &&
    keys.every(key => coverage.pageEvidence?.meta?.[key]?.trusted === true);
}
function notifyFinanceCoverage(coverage) {
  if (!coverage || coverage !== window.__store?.transactionCoverage) return;
  if (coverage.hitLimit === true && _financeSourcesServerSettled(coverage)) {
    const context = _financeContext(coverage.month), old = _financeTransition;
    if (context && (!_transitionCurrent(old) || old.phase === 'complete')) {
      const t = _newFinanceTransition(context, coverage.readMode, coverage.readMode);
      t.targetEpoch = window.__store._activeTxProjectionEpoch;
      _replaceFinanceTransition(t); _markFinanceTransitionDirty(t);
      _enqueueClubStatsState({ kind: 'barrier', token: t, context, reason: 'finance-server-coverage-hit-limit' });
    }
    return;
  }
  if (coverage.pageServerComplete !== true) return;
  const context = _financeContext(coverage.month);
  if (!context || !_transactionFinanceCoverage(context.month, context.clubId).financeComplete) return;
  const t = _financeTransition;
  if (_transitionCurrent(t) && t.toMode === coverage.readMode && t.phase !== 'complete') {
    t.ready = true; _markFinanceTransitionDirty(t); _queueFinanceComplete(t); return;
  }
  const scope = _financeScope(context, coverage.readMode);
  if (_hydratedFinanceScopes.has(scope)) return;
  _hydratedFinanceScopes.add(scope);
  if (_publishedFinancialScope !== scope) _enqueueClubStatsState({ kind: 'regular', context, reason: 'finance-initial-server-complete' });
}
function isFinanceTransitionPending(clubId, month) {
  const t = _financeTransition;
  return _transitionCurrent(t) && t.context.clubId === clubId && t.context.month === month && t.phase !== 'complete';
}
function syncClubStatsCache(reason = 'manual') {
  if (window.RoleReadBoundary?.canMount?.('club.stats-cache', { reason }) === false) {
    return Promise.resolve({ ok: false, skipped: true, reason: 'coach-attendance-only' });
  }
  if (!_clientStatsWriterAllowed()) return Promise.resolve({ ok: false, skipped: true, reason: 'production-policy-stats-writer-disabled' });
  const coverage = window.__store?.transactionCoverage;
  if (coverage?.hitLimit === true && _financeSourcesServerSettled(coverage)) notifyFinanceCoverage(coverage);
  const context = _financeContext(getCurrentMonthVN());
  if (!context) return Promise.resolve({ ok: false, skipped: true, reason: 'finance-cache-context-unverified' });
  if (_transitionCurrent(_financeTransition) && _financeTransition.phase !== 'complete') {
    return _syncInFlight || Promise.resolve({ ok: false, skipped: true, reason: 'finance-transition-pending' });
  }
  return _enqueueClubStatsState({ kind: 'regular', context, reason });
}

async function _writeClubStatsState(request) {
    const reason = request.reason, cid = request.context.clubId;
    const fb = window._fb_init || {};
    const c = _ctx('club-stats-sync');
    const db = c.db || (window.__store && window.__store.db);
    const writeBatch = fb.writeBatch;
    const doc = fb.doc;

    const blockedReason = !_clientStatsWriterAllowed() ? 'production-policy-stats-writer-disabled' :
      !cid ? 'missing-club-id' :
      !db ? 'missing-db' :
      !writeBatch || !doc ? 'missing-firestore-helpers' :
      _isSuperAdminRuntime() ? 'skip-superadmin-runtime' : '';

    if (blockedReason) {
      _lastResult = { ok: false, reason: blockedReason, at: Date.now() };
      return _lastResult;
    }

    const monthKey = request.context.month;
    const stats = computeClubStatsCache(monthKey);
    if (!stats.ready && request.kind !== 'barrier') {
      _lastResult = { ok: false, reason: 'data-not-ready', clubId: cid, stats, at: Date.now() };
      return _lastResult;
    }

    if (request.kind === 'complete' && (!request.token.barrierAck || !stats.financeComplete)) {
      return { ok: false, skipped: true, reason: 'target-not-server-confirmed' };
    }
    if (request.kind === 'regular' && !stats.financeComplete &&
        (stats.transactionCoverage.sameMonth || !window.__store?.transactionCoverage?.month)) {
      return { ok: false, skipped: true, reason: 'finance-await-server' };
    }
    const memberMetrics = window.getProfilesListenerMetrics?.();
    const membersKnown = memberMetrics ? memberMetrics.fullAuthorityComplete === true && memberMetrics.authorityServerConfirmed === true : stats.profileCount > 0;
    const fp = _financeIdentity(request.context) + '|' + membersKnown + '|' + _fingerprint(stats);
    const now = Date.now();
    if (request.kind !== 'barrier' && fp === _lastFingerprint && now - _lastSyncAt < CACHE_TTL_MS) {
      _lastResult = { ok: true, skipped: true, reason: 'unchanged-ttl', clubId: cid, stats, at: now };
      return _lastResult;
    }

    const statsDocId = stats.statsDocId;
    const financeComplete = request.kind !== 'barrier' && stats.financeComplete === true;
    const coveragePayload = {
      month: monthKey,
      financeComplete,
      transactionReadMode: request.kind === 'barrier' ? request.token.toMode : stats.transactionCoverage.transactionReadMode,
      transactionHitLimit: stats.transactionCoverage.transactionHitLimit,
      transactionObservedCount: request.kind === 'barrier' ? 0 : stats.transactionCoverage.transactionObservedCount,
      transactionSourceCounts: request.kind === 'barrier' ? {} : stats.transactionCoverage.transactionSourceCounts,
      transactionLimit: stats.transactionCoverage.transactionLimit,
      checkedAt: now,
    };
    // Member/root cache remains independently useful. Financial fields are added
    // only when the listener proves full coverage for this exact club + month.
    const payload = membersKnown ? {
      cachedActiveCount: stats.activeCount,
      cachedStudentCount: stats.activeCount,
      activeStudentCount: stats.activeCount,
      totalStudents: stats.profileCount,
      cachedProfileCount: stats.profileCount,
      cachedInvCount: stats.inventoryCount,
      cachedCountUpdatedAt: now,
    } : {};
    if (financeComplete || request.kind === 'barrier') payload.cacheCoverage = coveragePayload;
    if (financeComplete) {
      Object.assign(payload, {
        cachedTxCount: stats.txCount,
        cachedCurrentMonthRevenue: stats.monthlyIncome,
        currentMonthRevenue: stats.monthlyIncome,
        cachedMonthlyRevenue: {
          [monthKey]: stats.monthlyIncome,
          [statsDocId]: stats.monthlyIncome,
        },
        revenueByMonth: {
          [monthKey]: stats.monthlyIncome,
          [statsDocId]: stats.monthlyIncome,
        },
        superAdminStats: {
          month: monthKey,
          activeCount: stats.activeCount,
          profileCount: stats.profileCount,
          txCount: stats.txCount,
          inventoryCount: stats.inventoryCount,
          revenueTotal: stats.monthlyIncome,
          expenseTotal: stats.monthlyExpense,
          profit: stats.monthlyProfit,
          monthlyTxCount: stats.monthlyTxCount,
          updatedAt: now,
          source: stats.source,
        },
        statsUpdatedAt: now,
        statsSource: stats.source,
      });
    }

    if (financeComplete && !membersKnown) { delete payload.superAdminStats.activeCount; delete payload.superAdminStats.profileCount; }

    const statsPayload = membersKnown ? {
      month: monthKey,
      activeCount: stats.activeCount,
      profileCount: stats.profileCount,
      totalStudents: stats.profileCount,
      memberUpdatedAt: now,
    } : { month: monthKey };
    if (financeComplete || request.kind === 'barrier') statsPayload.cacheCoverage = coveragePayload;
    if (financeComplete) {
      Object.assign(statsPayload, {
        income: { total: stats.monthlyIncome },
        expense: { total: stats.monthlyExpense },
        profit: stats.monthlyProfit,
        txCount: stats.monthlyTxCount,
        source: stats.source,
        updatedAt: now,
      });
    }

    if (!_financeContextCurrent(request.context) || (request.token && !_transitionCurrent(request.token))) {
      return { ok: false, stale: true, reason: 'DROP_STALE' };
    }
    // Both documents have active Finance consumers. One canonical batch avoids
    // a root-incomplete / old-stats-complete window and preserves write order.
    let rootWriteOk = false, statsWriteOk = false;
    try {
      const batch = writeBatch(db);
      if (monthKey === getCurrentMonthVN()) batch.set(doc(db, 'clubs', cid), payload, { merge: true });
      batch.set(doc(db, 'clubs', cid, 'stats', statsDocId), statsPayload, { merge: true });
      await batch.commit();
      rootWriteOk = monthKey === getCurrentMonthVN(); statsWriteOk = true;
    } catch (error) {
      console.warn('[ClubStatsAutoCache] atomic cache publication failed:', error?.message || error);
    }
    if (statsWriteOk && _financeContextCurrent(request.context)) {
      _lastFingerprint = request.kind === 'barrier' ? '' : fp;
      _lastSyncAt = now;
      if (financeComplete) _publishedFinancialScope = _financeScope(request.context, stats.transactionCoverage.transactionReadMode);
    }
    _lastResult = {
      ok: statsWriteOk && _financeContextCurrent(request.context),
      rootWriteOk,
      statsWriteOk,
      financialRootWriteOk: rootWriteOk && financeComplete,
      financialStatsWriteOk: statsWriteOk && financeComplete,
      financeWriteSkipped: !financeComplete,
      clubId: cid,
      reason,
      publicationKind: request.kind,
      stats,
      at: now,
    };
    if (rootWriteOk) console.info('[ClubStatsAutoCache] synced cache', {
      cid,
      active: stats.activeCount,
      revenue: financeComplete ? stats.monthlyIncome : 'unknown',
      financeComplete,
      reason,
    });
    return _lastResult;
}

function scheduleClubStatsAutoCacheSync(reason = 'schedule') {
  if (_timer) clearTimeout(_timer);
  _timer = setTimeout(() => {
    syncClubStatsCache(reason).catch(e => console.warn('[ClubStatsAutoCache] sync failed:', e?.message || e));
  }, 800);
}

function initClubStatsAutoCache() {
  const role = String(window.userRole || window.__store?.userRole || '').toLowerCase();
  if (!_clientStatsWriterAllowed()) return false;
  if (!['admin', 'owner', 'super_admin', 'superadmin', 'root', 'root_admin', 'admin_root'].includes(role)) return false;
  if (window.RoleReadBoundary?.canMount?.('club.stats-cache', { reason: 'initClubStatsAutoCache' }) === false) return false;
  if (_started) return;
  _started = true;

  let attempts = 0;
  const tick = () => {
    attempts++;
    scheduleClubStatsAutoCacheSync('bootstrap-attempt-' + attempts);
    if (attempts < BOOTSTRAP_ATTEMPTS) setTimeout(tick, BOOTSTRAP_DELAY_MS);
  };
  setTimeout(tick, 1200);

  const _bindOwned = typeof window.addOwnedEventListener === 'function'
    ? window.addOwnedEventListener
    : function(target, type, handler, key, options) {
        target.addEventListener(type, handler, options);
        return () => target.removeEventListener(type, handler, options);
      };

  _bindOwned(
    window,
    'app-context-ready',
    () => scheduleClubStatsAutoCacheSync('app-context-ready'),
    'clubStatsAutoCache:app-context-ready',
    undefined,
    { owner: 'club-stats-auto-cache', scope: 'global', reason: 'auto-cache-context-ready' }
  );
  _bindOwned(
    window,
    'focus',
    () => scheduleClubStatsAutoCacheSync('window-focus'),
    'clubStatsAutoCache:window-focus',
    undefined,
    { owner: 'club-stats-auto-cache', scope: 'global', reason: 'auto-cache-window-focus' }
  );

  window.computeClubStatsCache = computeClubStatsCache;
  window.syncClubStatsCache = syncClubStatsCache;
  window.debugClubStatsAutoCache = function() {
    const stats = computeClubStatsCache();
    const result = {
      started: _started,
      lastSyncAt: _lastSyncAt,
      lastFingerprint: _lastFingerprint,
      lastResult: _lastResult,
      isSuperAdminRuntime: _isSuperAdminRuntime(),
      clubId: _clubId(),
      currentStatsPreview: stats,
      recommendations: [
        'Admin chỉ cập nhật finance cache khi transaction coverage của đúng CLB/tháng là complete.',
        'Coverage unknown/incomplete vẫn có thể cập nhật member cache nhưng không ghi doanh thu/chi phí/lợi nhuận.',
        'SuperAdmin đọc root cache O(1), không chạy runAggregationQuery hàng loạt.',
      ],
    };
    console.log('[debugClubStatsAutoCache]', result);
    return result;
  };
}


// The existing writer API is available before bootstrap. Correctness never
// depends on a role-timed init call or the incidental bootstrap timer.
syncClubStatsCache.beginFinanceTransition = beginFinanceTransition;
syncClubStatsCache.bindFinanceContext = bindFinanceContext;
syncClubStatsCache.notifyFinanceCoverage = notifyFinanceCoverage;
syncClubStatsCache.isFinanceTransitionPending = isFinanceTransitionPending;
syncClubStatsCache.getFinanceTransitionState = () => ({ phase: _financeTransition?.phase || 'idle',
  month: _financeTransition?.context.month || '', toMode: _financeTransition?.toMode || '',
  barrierAck: _financeTransition?.barrierAck === true, targetReady: _financeTransition?.ready === true,
  inFlight: !!_syncInFlight, pendingRequired: _pendingRequiredState?.kind || '' });
if (typeof window !== 'undefined') window.syncClubStatsCache = syncClubStatsCache;

export { initClubStatsAutoCache, syncClubStatsCache, computeClubStatsCache };
