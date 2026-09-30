/**
 * Phase 4K-6V5U-2 — Tuition Command Cutover
 *
 * Single write owner for reviewed tuition actions only:
 *   - collectTuition (quickPay)
 *   - deleteTuitionTransaction + paidUntil/paidMonths reconcile
 *
 * Safety boundaries:
 *   - reuses FinanceService and existing TransactionDeleteIntegrity/reconcile helper;
 *   - no Firestore imports and no new collection/schema/path;
 *   - no inventory, family-pay, multi-item, admission or exam-fee ownership;
 *   - one single-flight key, one local commit and one invalidation map per success.
 */
import { FinanceService } from '../services/finance.service.js?v=long-term-production-stability-20260917-v5u6h8r2';
import { getLocalToday, normalizeYYYYMM, formatMonthCompact } from '../utils/format.js';

const BUILD = 'tuition-command-cutover-20260730-v5u2';
const PHASE = '4K-6V5U-2';
const inFlight = new Map();
const completedReplay = new Map();
const profileMutationLanes = new Map();
const COMPLETED_REPLAY_TTL_MS = 30000;
let completedReplayContextToken = '';
const metrics = {
  build: BUILD,
  phase: PHASE,
  calls: 0,
  completed: 0,
  failed: 0,
  duplicatePrevented: 0,
  completedReplayPrevented: 0,
  settledStatePrevented: 0,
  completedReplayInvalidated: 0,
  profileLaneQueued: 0,
  profileLaneCompleted: 0,
  partialWrites: 0,
  byCommand: {},
  history: [],
};

function _pushHistory(row) {
  metrics.history.push(row);
  if (metrics.history.length > 80) metrics.history.shift();
}
function _track(command, field) {
  const row = metrics.byCommand[command] || (metrics.byCommand[command] = {
    calls: 0, completed: 0, failed: 0, duplicatePrevented: 0,
  });
  row[field] = (row[field] || 0) + 1;
}
function _key(command, identity) {
  return `${command}:${String(identity || '').trim()}`;
}
function _clubIdentity() {
  if (typeof window === 'undefined') return '';
  return String(window.__store?.clubId || window.currentClubId || window.currentClub?.id || '').trim();
}
function _profileIdentity(profile, fallback) {
  return String(profile?.profileId || profile?.id || profile?.uid || profile?.memberId || profile?.memberID || profile?.studentId || fallback || '').trim();
}
function _pruneCompletedReplay(now = Date.now()) {
  for (const [key, row] of completedReplay) {
    if (!row || (now - row.at) > COMPLETED_REPLAY_TTL_MS) completedReplay.delete(key);
  }
  while (completedReplay.size > 120) completedReplay.delete(completedReplay.keys().next().value);
}
function _currentReplayContextToken() {
  if (typeof window === 'undefined') return '';
  const verified = window.__verifiedAuthContextState || {};
  const user = window.__store?.currentUser || window.currentUser || {};
  const uid = String(verified.uid || user.uid || window.currentUserUid || window.currentUserEmail || '').trim();
  return [_clubIdentity(), Number(verified.generation || 0), uid].join('|');
}
function _syncCompletedReplayContext() {
  const token = _currentReplayContextToken();
  if (completedReplayContextToken && token !== completedReplayContextToken) completedReplay.clear();
  completedReplayContextToken = token;
}
function _profileLaneKey(clubId, profileId) {
  return [String(clubId || '').trim(), String(profileId || '').trim()].join('|');
}
async function _withProfileMutationLane(laneKey, task) {
  const key = String(laneKey || '').trim();
  if (!key || key === '|') return task();
  const previous = profileMutationLanes.get(key) || Promise.resolve();
  metrics.profileLaneQueued++;
  const current = previous.catch(() => undefined).then(task);
  profileMutationLanes.set(key, current);
  try {
    const result = await current;
    metrics.profileLaneCompleted++;
    return result;
  } finally {
    if (profileMutationLanes.get(key) === current) profileMutationLanes.delete(key);
  }
}
function _canonicalSettlement(profile, studentName, months) {
  const owner = typeof window !== 'undefined' ? window.TuitionDebtCanonical : null;
  if (!owner || typeof owner.areTuitionMonthsSettled !== 'function') {
    const error = new Error('[TuitionCommandBoundary] Canonical tuition settlement helper chưa sẵn sàng.');
    error.code = 'tuition/canonical-settlement-not-ready';
    throw error;
  }
  return owner.areTuitionMonthsSettled(profile, months, { name: studentName });
}
function _canonicalPaidUntilAfterPayment(profile, paidMonths) {
  const owner = typeof window !== 'undefined' ? window.TuitionDebtCanonical : null;
  if (!owner || typeof owner.reconcilePaidUntilFromMonthEvidence !== 'function') {
    const error = new Error('[TuitionCommandBoundary] Canonical paidUntil reconciliation helper chưa sẵn sàng.');
    error.code = 'tuition/canonical-paid-until-not-ready';
    throw error;
  }
  const existing = Array.isArray(profile?.paidMonths) ? profile.paidMonths : [];
  return owner.reconcilePaidUntilFromMonthEvidence(profile, existing.concat(paidMonths || []), { allowRegression: false });
}
function _invalidateCompletedReplayForTransaction(txId) {
  const id = String(txId || '').trim();
  if (!id) return 0;
  let removed = 0;
  for (const [key, row] of completedReplay) {
    if (String(row?.txId || row?.value?.txId || '') === id) {
      completedReplay.delete(key);
      removed++;
    }
  }
  metrics.completedReplayInvalidated += removed;
  return removed;
}
function _getCompletedReplay(command, key, replayTtlMs) {
  if (replayTtlMs <= 0) return null;
  _pruneCompletedReplay();
  const completed = completedReplay.get(key);
  if (!completed) return null;
  if ((Date.now() - completed.at) > replayTtlMs) {
    completedReplay.delete(key);
    return null;
  }
  metrics.duplicatePrevented++;
  metrics.completedReplayPrevented++;
  _track(command, 'duplicatePrevented');
  return { ...completed.value, deduped: true, completedReplay: true };
}
async function _run(command, identity, task, options = {}) {
  _syncCompletedReplayContext();
  const key = _key(command, identity);
  const replayTtlMs = Math.max(0, Number(options.completedReplayTtlMs) || 0);
  const existing = inFlight.get(key);
  if (existing) {
    metrics.duplicatePrevented++;
    _track(command, 'duplicatePrevented');
    return existing;
  }
  if (options.completedReplayAfterLane !== true) {
    const replay = _getCompletedReplay(command, key, replayTtlMs);
    if (replay) return replay;
  }
  metrics.calls++;
  _track(command, 'calls');
  const startedAt = Date.now();
  const promise = Promise.resolve()
    .then(() => task({
      commandKey: key,
      getCompletedReplay: () => _getCompletedReplay(command, key, replayTtlMs),
    }))
    .then(value => {
      metrics.completed++;
      _track(command, 'completed');
      _pushHistory({ command, key, ok: true, durationMs: Date.now() - startedAt, at: Date.now() });
      if (replayTtlMs > 0 && value?.ok === true && value?.alreadySettled !== true && value?.completedReplay !== true) {
        const meta = options.completedReplayMeta || {};
        const completedAt = Date.now();
        completedReplay.set(key, {
          commandKey: key, command, identity, value, at: completedAt, completedAt,
          clubId: String(meta.clubId || ''), profileId: String(meta.profileId || ''),
          operation: String(meta.operation || command), normalizedMonths: Array.isArray(meta.normalizedMonths) ? meta.normalizedMonths.slice() : [],
          normalizedAmount: Number(meta.normalizedAmount) || 0, txId: String(value?.txId || '')
        });
        _pruneCompletedReplay();
      }
      return value;
    })
    .catch(error => {
      metrics.failed++;
      _track(command, 'failed');
      if (error && error.partialWrite === true) metrics.partialWrites++;
      _pushHistory({ command, key, ok: false, partialWrite: error?.partialWrite === true, message: error?.message || String(error), durationMs: Date.now() - startedAt, at: Date.now() });
      throw error;
    })
    .finally(() => {
      if (inFlight.get(key) === promise) inFlight.delete(key);
    });
  inFlight.set(key, promise);
  return promise;
}

function _service() {
  return (typeof window !== 'undefined' && window.FinanceService) || FinanceService;
}
function _profiles() {
  if (typeof window === 'undefined') return {};
  try {
    const all = window.studentProfileStore?.getAllProfilesCompat?.();
    if (all && typeof all === 'object') return all;
  } catch (_) {}
  return window.__store?.profiles || window.allProfiles || {};
}
function _normalizeMonths(input) {
  const raw = Array.isArray(input) ? input : String(input || '').split(',');
  const out = [];
  for (const item of raw) {
    const text = String(item || '').trim();
    if (!text) continue;
    const normalized = normalizeYYYYMM(text) || text;
    if (!out.includes(normalized)) out.push(normalized);
  }
  return out;
}
function _guard(action, payload) {
  try {
    if (typeof window.guardFinancialWriteIntent === 'function'
      && typeof window.isFinancialWriteAllowed === 'function') {
      return window.isFinancialWriteAllowed?.(window.guardFinancialWriteIntent(action, payload)) === true;
    }
  } catch (_) { return false; }
  return false;
}
function _audit(action, stage, payload) {
  try { window.recordFinancialActionAudit?.(action, stage, payload || {}); } catch (_) {}
}

function _recordTuitionSecondaryFailure(classification, error, extra = {}) {
  const resolved = String(classification || 'tuition-secondary-write-failed');
  const details = { classification: resolved, secondaryWrite: true, reconciliationNeeded: true, canonicalPaymentPreserved: true, ...extra };
  console.warn('[TuitionConsistency]', resolved, details, error || '');
  try { window.recordRuntimeError?.('tuition.secondary:' + resolved, error || new Error(resolved), details); } catch (_) {}
}

function _commitProfilePayment(studentName, paidUntil, paidMonths, reason) {
  if (typeof window === 'undefined') return;
  const key = String(studentName || '').trim();
  const source = _profiles()[key] || {};
  const mergedMonths = Array.from(new Set([
    ...(Array.isArray(source.paidMonths) ? source.paidMonths.map(String) : []),
    ...paidMonths.map(String),
  ])).sort();
  const next = { ...source, paidUntil, paidMonths: mergedMonths };
  try { window.studentProfileStore?.mergeProfile?.(key, next, reason); } catch (_) {}
  try {
    if (!window.__store) window.__store = {};
    if (!window.__store.profiles) window.__store.profiles = {};
    window.__store.profiles[key] = next;
    window.__store._dataVersion = (window.__store._dataVersion || 0) + 1;
  } catch (_) {}
  try {
    if (window.allProfiles && typeof window.allProfiles === 'object') window.allProfiles[key] = next;
  } catch (_) {}
}
function _removeLocalTransaction(txId) {
  if (typeof window === 'undefined') return;
  const id = String(txId || '');
  const filter = rows => Array.isArray(rows) ? rows.filter(row => String(row?.id || '') !== id) : rows;
  try {
    if (window.__store) {
      window.__store.transactions = filter(window.__store.transactions);
      window.__store.allTransactions = filter(window.__store.allTransactions);
      window.__store._transactionsVersion = (window.__store._transactionsVersion || 0) + 1;
    }
  } catch (_) {}
  try { if (Array.isArray(window.allTransactions)) window.allTransactions = filter(window.allTransactions); } catch (_) {}
}
function _invalidateTuition(reason, options = {}) {
  if (typeof window === 'undefined') return;
  const keys = ['tx.txList', 'students.debtList', 'students.activeList'];
  try {
    if (typeof window.invalidateLists === 'function') window.invalidateLists(keys, reason);
    else keys.forEach(key => window.invalidateList?.(key, reason));
  } catch (_) {}
  try { window.refreshListsComputation?.(['students.activeList', 'students.debtList', 'dashboard.summary'], reason); } catch (_) {}
  try { window.invalidateDashboard?.(reason); } catch (_) {}
  if (options.examRefresh) {
    try { window.invalidateList?.('exam.list', reason); } catch (_) {}
    try { window.renderExamList?.(); } catch (_) {}
  }
}

export const TuitionCommandBoundary = Object.freeze({
  build: BUILD,
  phase: PHASE,

  async collectTuition({ studentName, months, branch, amount, source = 'quickPay' } = {}) {
    const name = String(studentName || '').trim();
    const rawMonths = Array.isArray(months) ? months : String(months ?? '').split(',');
    const monthsList = _normalizeMonths(months);
    const numericAmount = Number(amount);
    if (!name) throw new Error('[TuitionCommandBoundary] Thiếu tên võ sinh.');
    if (!_clubIdentity() || !_profiles()[name]) throw new Error('[TuitionCommandBoundary] CLB/hồ sơ chưa sẵn sàng.');
    if (!rawMonths.length || rawMonths.some(month => !/^\d{4}-(0[1-9]|1[0-2])$/.test(String(month).trim()))
      || monthsList.length !== rawMonths.length) throw new Error('[TuitionCommandBoundary] Tháng học phí không hợp lệ.');
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) throw new Error('[TuitionCommandBoundary] Số tiền không hợp lệ.');
    if (String(window.userRole || '').toLowerCase() === 'viewer') throw new Error('[TuitionCommandBoundary] Viewer không có quyền thu học phí.');

    const profile = _profiles()[name] || {};
    const feePerMonth = Number(profile.tuitionFee) || 0;
    let paidMonths = monthsList.slice();
    if (feePerMonth > 0 && monthsList.length > 1) {
      const count = Math.min(Math.floor(numericAmount / feePerMonth), monthsList.length);
      paidMonths = monthsList.slice(0, count > 0 ? count : 1);
    }
    const lastMonth = paidMonths[paidMonths.length - 1];
    const normalizedBranch = String(branch || profile.branch || 'CS1').trim() || 'CS1';
    const normalizedMonthsForKey = paidMonths.slice().map(String).sort();
    const clubId = _clubIdentity();
    const profileId = _profileIdentity(profile, name);
    const profileLaneKey = _profileLaneKey(clubId, profileId);
    const identity = [
      clubId,
      profileId,
      normalizedBranch,
      normalizedMonthsForKey.join(','),
      numericAmount,
    ].join('|');
    const auditPayload = { studentName: name, months: paidMonths, amount: numericAmount, branch: normalizedBranch, txMonth: lastMonth, source };
    if (!profileId || !_guard('tuition.quickPay', auditPayload)) return { ok: false, cancelled: true, reason: 'financial-write-guard' };

    return _run('tuition.collect', identity, async (runContext) => _withProfileMutationLane(profileLaneKey, async () => {
      const replay = runContext?.getCompletedReplay?.();
      if (replay) return replay;
      const latestProfile = _profiles()[name] || profile;
      const settlement = _canonicalSettlement(latestProfile, name, paidMonths);
      if (settlement.allSettled) {
        metrics.duplicatePrevented++;
        metrics.settledStatePrevented++;
        _track('tuition.collect', 'duplicatePrevented');
        return {
          ok: true, alreadySettled: true, duplicatePrevented: true, primaryWritePerformed: false,
          txId: null, studentName: name, amount: numericAmount, branch: normalizedBranch,
          paidMonths, paidUntil: normalizeYYYYMM(latestProfile.paidUntil) || '', txMonth: lastMonth,
          txDate: '', monthLabel: formatMonthCompact(paidMonths.join(',')), settlement
        };
      }
      if (!_guard('tuition.quickPay', auditPayload)) return { ok: false, cancelled: true, reason: 'financial-write-guard' };
      _audit('tuition.quickPay', 'before', auditPayload);
      const today = getLocalToday();
      const txDate = lastMonth < today.substring(0, 7) ? `${lastMonth}-01` : today;
      const txPayload = {
        branch: normalizedBranch,
        type: 'Học phí',
        description: name,
        amount: numericAmount,
        date: txDate,
        txMonth: lastMonth,
        packageMonths: paidMonths,
        timestamp: Date.now(),
      };
      let txId = '';
      try {
        const paidUntil = _canonicalPaidUntilAfterPayment(latestProfile, paidMonths) || lastMonth;
        const atomic = await _service().commitAtomicWritePlan({
          transactions: [{ data: txPayload, reason: 'tuition-command-collect' }],
          profileUpdates: [{
            studentName: name,
            data: {
              paidUntil,
              paidMonths: _service()._arrayUnion(...paidMonths),
            },
          }],
        });
        txId = String(atomic?.txIds?.[0] || '');
        _commitProfilePayment(name, paidUntil, paidMonths, 'v5u2-tuition-collect');
        _invalidateTuition('v5u2-tuition-collect');
        const result = {
          ok: true,
          txId,
          studentName: name,
          amount: numericAmount,
          branch: normalizedBranch,
          paidMonths,
          paidUntil,
          txMonth: lastMonth,
          txDate,
          monthLabel: formatMonthCompact(paidMonths.join(',')),
        };
        _audit('tuition.quickPay', 'after', { ...auditPayload, txId, paidUntil });
        void _service().addFeeAuditSilent({
          studentId: name,
          amount: numericAmount,
          date: today,
          type: 'tuition',
          month: paidUntil,
          months: paidMonths,
          by: window.currentUserEmail || 'admin',
          timestamp: Date.now(),
        }).then((auditResult) => {
          if (auditResult?.ok === false) {
            _recordTuitionSecondaryFailure('fee-audit-reconcile-required', auditResult.error, {
              stage: 'fee_audit', studentName: name, txId, paidUntil,
            });
          }
        }).catch((auditError) => {
          _recordTuitionSecondaryFailure('fee-audit-reconcile-required', auditError, {
            stage: 'fee_audit', studentName: name, txId, paidUntil,
          });
        });
        return result;
      } catch (error) {
        _audit('tuition.quickPay', 'error', { ...auditPayload, txId, partialWrite: error?.partialWrite === true, error: error?.message || String(error) });
        // H8R2: transaction + profile are one atomic primary commit. A commit
        // failure leaves no half-paid state to refresh or reconcile.
        throw error;
      }
    }), {
      completedReplayTtlMs: COMPLETED_REPLAY_TTL_MS,
      completedReplayAfterLane: true,
      completedReplayMeta: {
        clubId, profileId, operation: 'tuition.collect',
        normalizedMonths: normalizedMonthsForKey, normalizedAmount: numericAmount
      }
    });
  },

  async deleteTuitionTransaction({ txId, transaction, impact, source = 'tuition-tab' } = {}) {
    const id = String(txId || '').trim();
    const tx = transaction || {};
    if (!id || id === 'undefined' || id === 'null') throw new Error('[TuitionCommandBoundary] Transaction ID không hợp lệ.');
    const analyzer = window.TransactionDeleteIntegrity?.analyzeTransactionDeleteImpact;
    if (typeof analyzer !== 'function') throw new Error('[TuitionCommandBoundary] Transaction delete classifier chưa sẵn sàng.');
    const analyzed = analyzer({ ...tx, id });
    if (!analyzed?.valid || analyzed.failClosed || !analyzed.hasTuition || analyzed.hasInventory || analyzed.requiresInventoryRollback || analyzed.isMixedBundle || !analyzed.isPureTuition) {
      throw new Error('[TuitionCommandBoundary] Chỉ cho phép xóa giao dịch Học phí thuần qua Tuition owner.');
    }

    const deleteStudentName = String(analyzed?.studentName || tx.studentName || tx.description || '').trim();
    const deleteProfile = _profiles()[deleteStudentName] || {};
    const deleteProfileId = _profileIdentity(deleteProfile, tx.profileId || tx.memberId || deleteStudentName);
    const deleteProfileLaneKey = _profileLaneKey(_clubIdentity(), deleteProfileId);

    return _run('tuition.deleteTransaction', id, async () => _withProfileMutationLane(deleteProfileLaneKey, async () => {
      const auditPayload = {
        txId: id,
        type: tx.type || '',
        amount: Number(tx.amount) || 0,
        studentName: analyzed?.studentName || tx.studentName || tx.description || '',
        source,
      };
      if (!_guard('transaction.delete', auditPayload)) return { ok: false, cancelled: true, reason: 'financial-write-guard' };
      _audit('transaction.delete', 'before', auditPayload);
      let transactionDeleted = false;
      let completedReplayInvalidated = 0;
      try {
        await _service().deleteTransaction(id);
        transactionDeleted = true;
        // Firestore delete is already authoritative at this point. Remove the
        // local row immediately so a later reconcile failure cannot present a
        // transaction that no longer exists on the server.
        _removeLocalTransaction(id);
        completedReplayInvalidated = _invalidateCompletedReplayForTransaction(id);
        if (analyzed?.requiresProfileReconcile && analyzed.studentName && typeof window.reconcileStudentTuitionAfterDeletedTransaction === 'function') {
          const reconcileResult = await window.reconcileStudentTuitionAfterDeletedTransaction(
            analyzed.studentName,
            tx,
            { reason: 'v5u2-delete-tuition', skipInvalidate: true }
          );
          if (reconcileResult?.ok === false) {
            const reconcileError = new Error('[TuitionCommandBoundary] Transaction đã xóa nhưng profile học phí chưa reconcile thành công.');
            reconcileError.code = 'tuition/delete-reconcile-failed';
            throw reconcileError;
          }
        } else {
          const studentName = String(tx.description || tx.studentName || '').trim();
          if (studentName) {
            const docs = await _service().getStudentTuitionTxs(studentName);
            const remaining = [];
            docs.forEach(({ id: otherId, data }) => {
              if (otherId === id) return;
              if (data.type !== 'Học phí' && data.type !== 'Học phí + Lệ phí thi') return;
              if (Array.isArray(data.packageMonths)) remaining.push(...data.packageMonths);
              else if (data.txMonth) remaining.push(data.txMonth);
            });
            const sorted = Array.from(new Set(remaining.map(String))).sort();
            const paidUntil = sorted.length ? sorted[sorted.length - 1] : '';
            const deletedMonths = Array.isArray(tx.packageMonths) ? tx.packageMonths : (tx.txMonth ? [tx.txMonth] : []);
            await _service().updateProfileAfterTxDelete(studentName, paidUntil, deletedMonths);
          }
        }
        _invalidateTuition('v5u2-delete-tuition', { examRefresh: analyzed?.requiresExamRefresh === true });
        _audit('transaction.delete', 'after', { ...auditPayload, completedReplayInvalidated });
        return { ok: true, txId: id, studentName: analyzed?.studentName || tx.description || '', impact: analyzed || null, completedReplayInvalidated };
      } catch (error) {
        if (transactionDeleted) {
          error.partialWrite = true;
          error.transactionDeleted = true;
          error.transactionId = id;
          // The transaction is gone but profile reconciliation failed. Keep the
          // deleted row out of local caches and refresh all tuition/debt views so
          // operators see the real partial state instead of retrying the delete.
          _removeLocalTransaction(id);
          _invalidateTuition('v5u2-delete-tuition-partial-reconcile', { examRefresh: analyzed?.requiresExamRefresh === true });
        }
        _audit('transaction.delete', 'error', {
          ...auditPayload,
          partialWrite: error?.partialWrite === true,
          transactionDeleted: error?.transactionDeleted === true,
          completedReplayInvalidated,
          error: error?.message || String(error)
        });
        throw error;
      }
    }));
  },

  invalidateCompletedReplayForTransaction(txId) {
    _syncCompletedReplayContext();
    return _invalidateCompletedReplayForTransaction(txId);
  },

  commitLocalTuitionPaymentState({ studentName = '', paidUntil = '', paidMonths = [], reason = '' } = {}) {
    const name = String(studentName || '').trim();
    if (!name) throw new Error('[TuitionCommandBoundary] Thiếu profile cho local tuition commit.');
    _commitProfilePayment(name, normalizeYYYYMM(paidUntil) || '', _normalizeMonths(paidMonths), reason || 'tuition-local-payment-state');
    return _profiles()[name] || {};
  },

  /**
   * F1D coordination-only API. Reuses the ONE existing per-profile mutation
   * lane so other established command owners that mutate tuition settlement
   * can serialize with QuickPay/delete without becoming tuition writers.
   */
  async runInProfileTuitionMutationLane({ studentName = '', profileId = '', clubId = '', reason = '' } = {}, task) {
    if (typeof task !== 'function') throw new Error('[TuitionCommandBoundary] profile-lane task không hợp lệ.');
    const keyName = String(studentName || '').trim();
    const profile = keyName ? (_profiles()[keyName] || {}) : {};
    const identity = _profileIdentity(profile, profileId || keyName);
    const laneKey = _profileLaneKey(clubId || _clubIdentity(), identity);
    _pushHistory({ command: 'tuition.profileLane', field: 'external-coordinate', laneKey, reason: String(reason || '') });
    return _withProfileMutationLane(laneKey, task);
  },

  async runInProfileTuitionMutationLanes({ profiles = [], clubId = '', reason = '' } = {}, task) {
    if (typeof task !== 'function') throw new Error('[TuitionCommandBoundary] multi-profile-lane task không hợp lệ.');
    const resolved = (Array.isArray(profiles) ? profiles : [])
      .map((row) => {
        const studentName = String(row?.studentName || row?.name || '').trim();
        const profile = studentName ? (_profiles()[studentName] || {}) : {};
        const identity = _profileIdentity(profile, row?.profileId || row?.memberId || studentName);
        return _profileLaneKey(clubId || _clubIdentity(), identity);
      })
      .filter((key) => key && key !== '|');
    const keys = Array.from(new Set(resolved)).sort();
    const enter = (index) => index >= keys.length
      ? task()
      : _withProfileMutationLane(keys[index], () => enter(index + 1));
    _pushHistory({ command: 'tuition.profileLane', field: 'external-multi-coordinate', laneKeys: keys.slice(), reason: String(reason || '') });
    return enter(0);
  },

  getMetrics() {
    return {
      ...metrics,
      inFlightCount: inFlight.size,
      completedReplayCount: completedReplay.size,
      profileMutationLaneCount: profileMutationLanes.size,
      completedReplayContextToken,
      byCommand: JSON.parse(JSON.stringify(metrics.byCommand)),
      history: metrics.history.slice(),
    };
  },
});

export function initTuitionCommandBoundary() {
  if (typeof window === 'undefined') return TuitionCommandBoundary;
  window.FinanceService = window.FinanceService || FinanceService;
  window.TuitionCommandBoundary = TuitionCommandBoundary;
  window.getTuitionCommandMetrics = () => TuitionCommandBoundary.getMetrics();
  return TuitionCommandBoundary;
}
