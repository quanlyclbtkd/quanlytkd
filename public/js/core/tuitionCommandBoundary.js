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
import { FinanceService } from "../services/finance.service.js?v=a9r18-inventory-stock-authority-r1-20261108";
import { getLocalToday, normalizeYYYYMM, formatMonthCompact } from "../utils/format.js?v=production-security-trust-boundary-release-assurance-20260816-v5u6h";

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
function _sameBranch(left, right) {
  try { if (window.BranchIdentity?.isSameBranch) return window.BranchIdentity.isSameBranch(left, right); } catch (_) {}
  const norm = v => { const s = String(v || '').trim(); return /^(mặc định|default|cs0?1)$/i.test(s) ? 'CS1' : s.toUpperCase().replace(/\s+/g, ''); };
  return norm(left) === norm(right);
}
function _pruneCompletedReplay(now = Date.now()) {
  for (const [key, row] of completedReplay) {
    if (!row || (now - row.at) > COMPLETED_REPLAY_TTL_MS) completedReplay.delete(key);
  }
  while (completedReplay.size > 120) completedReplay.delete(completedReplay.keys().next().value);
}
function _currentReplayContextToken() {
  if (typeof window === 'undefined') return '';
  const verified = window.__verifiedAuthContextState || {}, user = window.__store?.currentUser || window.currentUser || {};
  const uid = String(verified.uid || user.uid || window.currentUserUid || window.currentUserEmail || '').trim();
  return [_clubIdentity(), uid, Number(verified.generation || 0), Number(verified.sessionEpoch || 0), Number(verified.authGeneration || 0)].join('|');
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

function _canonicalSettlementWithEvidence(profile, studentName, months, transactions, allowTransactionFallback = true) {
  const owner = typeof window !== 'undefined' ? window.TuitionDebtCanonical : null;
  if (!owner || typeof owner.areTuitionMonthsSettled !== 'function') {
    const error = new Error('[TuitionCommandBoundary] Canonical tuition settlement helper chưa sẵn sàng.');
    error.code = 'tuition/canonical-settlement-not-ready';
    throw error;
  }
  return owner.areTuitionMonthsSettled(profile, months, {
    name: studentName,
    transactions: Array.isArray(transactions) ? transactions : undefined,
    allowTransactionFallback,
  });
}
function _classifyTuitionWriteSettlement(profile, settlement, meta = {}) {
  const base = {
    source: meta.source || '',
    settlement,
    profile,
    evidenceReadCount: Number(meta.evidenceReadCount || 0),
  };
  if (Array.isArray(meta.rows)) base.rows = meta.rows;
  if (profile?.feeExempt === true) {
    return { ...base, status: 'NON_CHARGEABLE', reason: 'FEE_EXEMPT', code: 'tuition/non-chargeable-fee-exempt' };
  }
  if (Array.isArray(settlement?.skippedMonths) && settlement.skippedMonths.length > 0) {
    return { ...base, status: 'NON_CHARGEABLE', reason: 'SKIPPED_MONTH', code: 'tuition/non-chargeable-skipped-month' };
  }
  if (settlement?.allSettled === true) {
    return { ...base, status: 'PAID', state: 'ALL_SETTLED' };
  }
  if (Array.isArray(settlement?.paidMonths) && settlement.paidMonths.length > 0) {
    return { ...base, status: 'PARTIAL_SETTLED', reason: 'PARTIAL_SETTLED', code: 'tuition/partial-settlement-changed' };
  }
  if (meta.verifiedUnpaid === true) {
    return { ...base, status: 'VERIFIED_UNPAID' };
  }
  return { ...base, status: 'UNRESOLVED' };
}
function _tuitionWriteDecisionError(decision) {
  const d = decision || {};
  let message = 'Chưa xác minh đủ dữ liệu giao dịch. Khoản thu chưa được thực hiện. Vui lòng thử lại khi kết nối ổn định.';
  if (d.status === 'PARTIAL_SETTLED') message = 'Gói học phí đã được thanh toán một phần. Khoản thu chưa được thực hiện; vui lòng chọn lại kỳ học phí hợp lệ.';
  if (d.status === 'NON_CHARGEABLE' && d.reason === 'FEE_EXEMPT') message = 'Võ sinh đang được miễn học phí. Khoản thu học phí không được thực hiện.';
  if (d.status === 'NON_CHARGEABLE' && d.reason === 'SKIPPED_MONTH') message = 'Gói học phí có tháng được bỏ qua. Khoản thu chưa được thực hiện; vui lòng chọn lại kỳ học phí hợp lệ.';
  const error = new Error(message);
  error.code = d.code || (d.status === 'PARTIAL_SETTLED' ? 'tuition/partial-settlement-changed' : d.status === 'NON_CHARGEABLE' ? 'tuition/non-chargeable' : 'TUITION_SETTLEMENT_UNVERIFIED');
  error.writeDecision = d;
  return error;
}
async function _resolveTuitionSettlementForWrite({ profile, studentName, targetMonths, reason = 'tuition-write', expectedContext = null } = {}) {
  const name = String(studentName || '').trim(), months = _normalizeMonths(targetMonths), service = _service();
  const contextCurrent = () => !expectedContext || service.isFinancialWriteContextCurrent?.(expectedContext) === true;
  const stale = (evidenceReadCount = 0) => ({ status: 'UNKNOWN', code: 'FINANCE_EVIDENCE_CONTEXT_STALE', evidenceReadCount });
  if (!contextCurrent()) return stale();
  const startProfile = profile || _profiles()[name] || {}, startProfileId = _profileIdentity(startProfile, name);
  if (!name || !months.length || !startProfileId) return { status: 'UNKNOWN', code: 'TUITION_SETTLEMENT_UNVERIFIED' };

  const profileOnly = _canonicalSettlementWithEvidence(startProfile, name, months, [], false);
  const profileDecision = _classifyTuitionWriteSettlement(startProfile, profileOnly, { source: 'profile-only', evidenceReadCount: 0 });
  if (profileDecision.status !== 'UNRESOLVED') return profileDecision;

  const currentRows = typeof service.getRuntimeTransactionRowsForEvidence === 'function' ? service.getRuntimeTransactionRowsForEvidence() : [];
  const currentSettlement = _canonicalSettlementWithEvidence(startProfile, name, months, currentRows, true);
  const currentDecision = _classifyTuitionWriteSettlement(startProfile, currentSettlement, { source: 'current-evidence', evidenceReadCount: 0 });
  if (currentDecision.status !== 'UNRESOLVED') return currentDecision;

  const rowsById = new Map(); currentRows.forEach((tx, i) => rowsById.set(String(tx?.id || tx?.txId || 'ram:' + i), tx));
  let evidenceReadCount = 0;
  for (const month of months) {
    if (!contextCurrent()) return stale(evidenceReadCount);
    const evidenceContext = service.captureWriteEvidenceContext?.(month, expectedContext) || null;
    if (expectedContext && (!evidenceContext || service.isWriteEvidenceContextCurrent?.(evidenceContext) !== true)) return stale(evidenceReadCount);
    const current = service.getCurrentMonthEvidenceForWrite?.({ month, expectedContext: evidenceContext });
    let evidence = current;
    if (!current?.strictCurrentCoverageComplete) {
      if (!contextCurrent()) return stale(evidenceReadCount);
      evidence = await service.getCompleteMonthEvidence?.({ month, reason: reason + ':' + month, expectedContext: evidenceContext });
      evidenceReadCount++;
      if (!contextCurrent()) return stale(evidenceReadCount);
    }
    if (!evidence?.serverComplete || evidence?.contextStillCurrent !== true) {
      return { status: 'UNKNOWN', code: evidence?.code || 'TUITION_SETTLEMENT_UNVERIFIED', evidence, evidenceReadCount };
    }
    (evidence.rows || []).forEach((tx, i) => rowsById.set(String(tx?.id || tx?.txId || month + ':' + i), tx));
  }

  if (!contextCurrent()) return stale(evidenceReadCount);
  const latestProfile = _profiles()[name] || startProfile;
  if (_profileIdentity(latestProfile, name) !== startProfileId) return stale(evidenceReadCount);
  const latestProfileOnly = _canonicalSettlementWithEvidence(latestProfile, name, months, [], false);
  const latestProfileDecision = _classifyTuitionWriteSettlement(latestProfile, latestProfileOnly, { source: 'profile-only-after-await', evidenceReadCount });
  if (latestProfileDecision.status !== 'UNRESOLVED') return latestProfileDecision;
  const completeRows = Array.from(rowsById.values()), finalSettlement = _canonicalSettlementWithEvidence(latestProfile, name, months, completeRows, true);
  return _classifyTuitionWriteSettlement(latestProfile, finalSettlement, { source: evidenceReadCount ? 'server-complete-evidence' : 'strict-current-coverage', rows: completeRows, evidenceReadCount, verifiedUnpaid: true });
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
function _guardIntent(action, payload) {
  try {
    if (typeof window.guardFinancialWriteIntent === 'function'
      && typeof window.isFinancialWriteAllowed === 'function') {
      const intent = window.guardFinancialWriteIntent(action, payload);
      return window.isFinancialWriteAllowed?.(intent) === true ? intent : null;
    }
  } catch (_) { return null; }
  return null;
}
function _guard(action, payload) { return !!_guardIntent(action, payload); }
function _audit(action, stage, payload, intent = null) {
  try { window.recordFinancialActionAudit?.(action, stage, payload || {}, intent ? { intent } : undefined); } catch (_) {}
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
      // Canonical transactions assignment is the single semantic-epoch owner.
      window.__store.transactions = filter(window.__store.transactions);
      window.__store.allTransactions = filter(window.__store.allTransactions);
    }
  } catch (_) {}
  try { if (Array.isArray(window.allTransactions)) window.allTransactions = filter(window.allTransactions); } catch (_) {}
}
function _beginDebtSyncOperation(action, profileId, affectsDebt = true) {
  try { return window.DebtProfileReadBoundary?.beginSyncOperation?.({ action, profileId, affectsDebt }) || ''; }
  catch (_) { return ''; }
}
function _markDebtSyncOperation(operationId, stage) {
  try { if (operationId) window.DebtProfileReadBoundary?.markSyncStage?.(operationId, stage); } catch (_) {}
}
function _cancelDebtSyncOperation(operationId) {
  try { if (operationId) window.DebtProfileReadBoundary?.cancelSyncOperation?.(operationId); } catch (_) {}
}
function _profileAckOwnsStudentsRefresh(operationId) {
  try { return !!operationId && window.DebtProfileReadBoundary?.isProfileAckOwnedOperation?.(operationId) === true; }
  catch (_) { return false; }
}

function _invalidateTuition(reason, options = {}) {
  if (typeof window === 'undefined') return;
  const profileAckOwned = _profileAckOwnsStudentsRefresh(options.operationId);
  const keys = profileAckOwned
    ? ['tx.txList']
    : ['tx.txList', 'students.debtList', 'students.activeList'];
  try {
    if (typeof window.invalidateLists === 'function') window.invalidateLists(keys, reason);
    else keys.forEach(key => window.invalidateList?.(key, reason));
  } catch (_) {}
  // For a tracked tuition/profile atomic mutation, the existing full profiles
  // listener is the sole Debt/Students post-ACK refresh owner. This removes the
  // command-ACK race without weakening Finance transaction reconciliation.
  if (!profileAckOwned) {
    try { window.refreshListsComputation?.(['students.activeList', 'students.debtList', 'dashboard.summary'], reason); } catch (_) {}
    try { window.invalidateDashboard?.(reason); } catch (_) {}
  }
  if (options.examRefresh) {
    try { window.invalidateList?.('exam.list', reason); } catch (_) {}
    try { window.renderExamList?.(); } catch (_) {}
  }
}

export const TuitionCommandBoundary = Object.freeze({
  build: BUILD,
  phase: PHASE,

  resolveTuitionSettlementForWrite: _resolveTuitionSettlementForWrite,
  async requireTuitionUnpaidForWrite(args = {}) {
    const d = await _resolveTuitionSettlementForWrite(args);
    if (!['PAID', 'VERIFIED_UNPAID'].includes(d?.status)) throw _tuitionWriteDecisionError(d);
    if (d?.status === 'VERIFIED_UNPAID') {
      const p = d.profile || _profiles()[String(args.studentName || '').trim()] || {};
      const c = typeof window !== 'undefined' ? window.TuitionDebtCanonical : null;
      d.paidUntil = c?.reconcilePaidUntilFromMonthEvidence?.(p, [...(Array.isArray(p.paidMonths) ? p.paidMonths : []), ..._normalizeMonths(args.targetMonths)], { allowRegression: false }) || p.paidUntil || '';
    }
    return d;
  },

  async collectTuition({ studentName, months, branch, amount, source = 'quickPay', expectedContext = null, intentProfileId = '', tuitionFeeSnapshot = null } = {}) {
    const name = String(studentName || '').trim(), service = _service();
    const operationContext = expectedContext || service.captureFinancialWriteContext?.();
    if (!operationContext || service.isFinancialWriteContextCurrent?.(operationContext) !== true) return { ok: false, blocked: true, primaryWritePerformed: false, reason: 'finance/write-context-stale' };
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
    const paidMonths = monthsList.slice();
    const lastMonth = paidMonths[paidMonths.length - 1];
    const normalizedBranch = String(branch || profile.branch || 'CS1').trim() || 'CS1';
    const normalizedMonthsForKey = paidMonths.slice().map(String).sort();
    const clubId = operationContext.clubId;
    const profileId = _profileIdentity(profile, name);
    if ((intentProfileId && profileId !== String(intentProfileId)) || clubId !== _clubIdentity()) return { ok: false, blocked: true, primaryWritePerformed: false, reason: 'tuition/intent-context-stale' };
    const profileLaneKey = _profileLaneKey(clubId, profileId);
    const identity = [
      service.financialWriteContextToken?.(operationContext) || [operationContext.clubId, operationContext.uid, operationContext.generation, operationContext.sessionEpoch, operationContext.authGeneration].join('|'),
      profileId,
      normalizedBranch,
      normalizedMonthsForKey.join(','),
      numericAmount,
    ].join('|');
    const auditPayload = { studentName: name, months: paidMonths, amount: numericAmount, branch: normalizedBranch, txMonth: lastMonth, source };
    if (!profileId || !_guard('tuition.quickPay', auditPayload)) return { ok: false, cancelled: true, reason: 'financial-write-guard' };

    return _run('tuition.collect', identity, async (runContext) => _withProfileMutationLane(profileLaneKey, async () => {
      if (service.isFinancialWriteContextCurrent?.(operationContext) !== true) return { ok: false, blocked: true, primaryWritePerformed: false, reason: 'finance/write-context-stale' };
      const replay = runContext?.getCompletedReplay?.();
      if (replay) return replay;
      let latestProfile = _profiles()[name] || profile;
      const writeDecision = await _resolveTuitionSettlementForWrite({ profile: latestProfile, studentName: name, targetMonths: paidMonths, reason: source || 'quickPay', expectedContext: operationContext });
      if (writeDecision.status === 'PAID') {
        const settlement = writeDecision.settlement || _canonicalSettlement(latestProfile, name, paidMonths);
        metrics.duplicatePrevented++;
        metrics.settledStatePrevented++;
        _track('tuition.collect', 'duplicatePrevented');
        return {
          ok: true, alreadySettled: true, duplicatePrevented: true, primaryWritePerformed: false,
          txId: null, studentName: name, amount: numericAmount, branch: normalizedBranch,
          paidMonths, paidUntil: normalizeYYYYMM((writeDecision.profile || latestProfile).paidUntil) || '', txMonth: lastMonth,
          txDate: '', monthLabel: formatMonthCompact(paidMonths.join(',')), settlement
        };
      }
      if (writeDecision.status !== 'VERIFIED_UNPAID') {
        return { ok: false, blocked: true, primaryWritePerformed: false, reason: writeDecision.code || 'TUITION_SETTLEMENT_UNVERIFIED', writeDecision };
      }
      latestProfile = writeDecision.profile || _profiles()[name] || latestProfile;
      if (service.isFinancialWriteContextCurrent?.(operationContext) !== true) return { ok: false, blocked: true, primaryWritePerformed: false, reason: 'finance/write-context-stale' };
      if (_profileIdentity(latestProfile, name) !== profileId) return { ok: false, blocked: true, primaryWritePerformed: false, reason: 'tuition/intent-context-stale' };
      if (!_sameBranch(normalizedBranch, latestProfile.branch || normalizedBranch)) return { ok: false, blocked: true, primaryWritePerformed: false, reason: 'tuition/intent-branch-stale' };
      if (tuitionFeeSnapshot != null && Number.isFinite(Number(tuitionFeeSnapshot)) && Number(latestProfile.tuitionFee || 0) !== Number(tuitionFeeSnapshot)) return { ok: false, blocked: true, primaryWritePerformed: false, reason: 'tuition/intent-fee-stale' };
      const auditIntent = _guardIntent('tuition.quickPay', auditPayload);
      if (!auditIntent) return { ok: false, cancelled: true, reason: 'financial-write-guard' };
      _audit('tuition.quickPay', 'before', auditPayload, auditIntent);
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
      const syncOperationId = _beginDebtSyncOperation('tuition.collect', profileId || name, true);
      try {
        const paidUntil = _canonicalPaidUntilAfterPayment(latestProfile, paidMonths) || lastMonth;
        _markDebtSyncOperation(syncOperationId, 'primaryWriteStart');
        const atomic = await service.commitAtomicWritePlan({
          expectedContext: operationContext,
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
        _markDebtSyncOperation(syncOperationId, 'primaryWriteAckAt');
        const postCommitContextCurrent = service.isFinancialWriteContextCurrent?.(operationContext) === true;
        if (postCommitContextCurrent) {
          _commitProfilePayment(name, paidUntil, paidMonths, 'v5u2-tuition-collect');
          _invalidateTuition('v5u2-tuition-collect', { operationId: syncOperationId });
        }
        const result = {
          ok: true, primaryCommitted: true, postCommitContextCurrent, commitClubId: operationContext.clubId,
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
        if (postCommitContextCurrent) {
          _audit('tuition.quickPay', 'after', { ...auditPayload, txId, paidUntil }, auditIntent);
          void service.addFeeAuditSilent({ studentId: name, amount: numericAmount, date: today, type: 'tuition', month: paidUntil, months: paidMonths, by: window.currentUserEmail || 'admin', timestamp: Date.now() }).then((auditResult) => {
            if (auditResult?.ok === false) _recordTuitionSecondaryFailure('fee-audit-reconcile-required', auditResult.error, { stage: 'fee_audit', studentName: name, txId, paidUntil });
          }).catch((auditError) => _recordTuitionSecondaryFailure('fee-audit-reconcile-required', auditError, { stage: 'fee_audit', studentName: name, txId, paidUntil }));
        }
        return result;
      } catch (error) {
        _cancelDebtSyncOperation(syncOperationId);
        _audit('tuition.quickPay', 'error', { ...auditPayload, txId, partialWrite: error?.partialWrite === true, error: error?.message || String(error) }, auditIntent);
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

    const service = _service();
    const operationContext = service.captureFinancialWriteContext?.();
    const contextCurrent = () => !!operationContext && service.isFinancialWriteContextCurrent?.(operationContext) === true;
    const staleError = () => {
      const error = new Error('[TuitionCommandBoundary] Financial write context stale.');
      error.code = 'finance/write-context-stale';
      return error;
    };
    if (!contextCurrent()) throw staleError();

    const deleteStudentName = String(analyzed?.studentName || tx.studentName || tx.description || '').trim();
    const deleteProfile = _profiles()[deleteStudentName] || {};
    const deleteProfileId = _profileIdentity(deleteProfile, tx.profileId || tx.memberId || deleteStudentName);
    const deleteProfileLaneKey = _profileLaneKey(operationContext.clubId, deleteProfileId);
    const operationToken = service.financialWriteContextToken?.(operationContext)
      || [operationContext.clubId, operationContext.uid, operationContext.generation, operationContext.sessionEpoch, operationContext.authGeneration].join('|');
    const deleteIdentity = `${operationToken}|${id}`;

    return _run('tuition.deleteTransaction', deleteIdentity, async () => _withProfileMutationLane(deleteProfileLaneKey, async () => {
      if (!contextCurrent()) throw staleError();
      const auditPayload = {
        txId: id,
        type: tx.type || '',
        amount: Number(tx.amount) || 0,
        studentName: analyzed?.studentName || tx.studentName || tx.description || '',
        source,
      };
      const auditIntent = _guardIntent('transaction.delete', auditPayload);
      if (!auditIntent) return { ok: false, cancelled: true, reason: 'financial-write-guard' };
      _audit('transaction.delete', 'before', auditPayload, auditIntent);
      let transactionDeleted = false;
      let completedReplayInvalidated = 0;
      const contextStaleSuccess = ({ profileReconcileVerified = false, reconciliationNeeded = true } = {}) => {
        _audit('transaction.delete', 'after', {
          ...auditPayload,
          completedReplayInvalidated,
          transactionDeleted: true,
          profileReconcileVerified,
          reconciliationNeeded,
          postCommitContextCurrent: false,
        }, auditIntent);
        return {
          ok: true,
          txId: id,
          studentName: deleteStudentName,
          impact: analyzed || null,
          transactionDeleted: true,
          primaryCommitted: true,
          commitClubId: operationContext.clubId,
          postCommitContextCurrent: false,
          profileReconcileVerified,
          reconciliationNeeded,
          warning: reconciliationNeeded ? 'TUITION_DELETE_RECONCILE_DEFERRED_CONTEXT_STALE' : 'TUITION_DELETE_CONTEXT_CHANGED_AFTER_RECONCILE',
          completedReplayInvalidated,
        };
      };
      try {
        await service.deleteTransaction(id, { expectedContext: operationContext });
        transactionDeleted = true;
        if (!contextCurrent()) return contextStaleSuccess();

        // Firestore delete is authoritative. Local/current-context projection is
        // allowed only while the original operation context is still current.
        _removeLocalTransaction(id);
        completedReplayInvalidated = _invalidateCompletedReplayForTransaction(id);
        const studentName = deleteStudentName;
        const deletedMonths = _normalizeMonths(Array.isArray(tx.packageMonths) ? tx.packageMonths : (tx.txMonth ? [tx.txMonth] : []));
        let profileReconcileVerified = true;
        let monthsToRemove = [];
        if (analyzed?.requiresProfileReconcile && studentName && deletedMonths.length) {
          const rowsById = new Map();
          for (const month of deletedMonths) {
            if (!contextCurrent()) return contextStaleSuccess();
            const evidenceContext = service.captureWriteEvidenceContext?.(month, operationContext) || null;
            if (!evidenceContext || service.isWriteEvidenceContextCurrent?.(evidenceContext) !== true) return contextStaleSuccess();
            const evidence = await service.getCompleteMonthEvidence({
              month,
              reason: 'tuition-delete-remaining-payment:' + month,
              expectedContext: evidenceContext,
            });
            if (!contextCurrent()) return contextStaleSuccess();
            if (!evidence?.serverComplete || evidence?.contextStillCurrent !== true) { profileReconcileVerified = false; break; }
            (evidence.rows || []).forEach((row, i) => { if (String(row?.id || '') !== id) rowsById.set(String(row?.id || row?.txId || month + ':' + i), row); });
          }
          if (profileReconcileVerified) {
            const canonical = window.TuitionDebtCanonical;
            if (!canonical?.extractTuitionTransactionMonths || !canonical?.reconcilePaidUntilFromMonthEvidence) throw new Error('[TuitionCommandBoundary] Canonical delete reconciliation helper chưa sẵn sàng.');
            if (!contextCurrent()) return contextStaleSuccess();
            const latestProfile = _profiles()[studentName] || deleteProfile;
            if (_profileIdentity(latestProfile, studentName) !== deleteProfileId) profileReconcileVerified = false;
            else {
              const remainingTxMonths = canonical.extractTuitionTransactionMonths(latestProfile, studentName, { transactions: Array.from(rowsById.values()) });
              monthsToRemove = deletedMonths.filter(month => !remainingTxMonths.includes(month));
              if (monthsToRemove.length) {
                const currentPaidMonths = _normalizeMonths(latestProfile.paidMonths || []);
                const remainingProfilePaidMonths = currentPaidMonths.filter(month => !monthsToRemove.includes(month));
                const paidUntil = canonical.reconcilePaidUntilFromMonthEvidence(latestProfile, remainingProfilePaidMonths, { allowRegression: true, removedMonths: monthsToRemove });
                await service.updateProfileAfterTxDelete(studentName, paidUntil, monthsToRemove, { expectedContext: operationContext });
                if (!contextCurrent()) return contextStaleSuccess({ profileReconcileVerified: true, reconciliationNeeded: false });
              }
            }
          }
        }
        if (!profileReconcileVerified) {
          if (contextCurrent()) {
            _invalidateTuition('v5u2-delete-tuition-unverified-reconcile', { examRefresh: analyzed?.requiresExamRefresh === true });
            _audit('transaction.delete', 'after', { ...auditPayload, completedReplayInvalidated, transactionDeleted: true, profileReconcileVerified: false }, auditIntent);
          }
          return { ok: true, txId: id, transactionDeleted: true, primaryCommitted: true, commitClubId: operationContext.clubId, postCommitContextCurrent: contextCurrent(), profileReconcileVerified: false, warning: 'TUITION_DELETE_RECONCILE_UNVERIFIED', studentName, impact: analyzed || null, completedReplayInvalidated };
        }
        if (contextCurrent()) {
          _invalidateTuition('v5u2-delete-tuition', { examRefresh: analyzed?.requiresExamRefresh === true });
          _audit('transaction.delete', 'after', { ...auditPayload, completedReplayInvalidated }, auditIntent);
        }
        return { ok: true, txId: id, studentName: analyzed?.studentName || tx.description || '', impact: analyzed || null, transactionDeleted: true, primaryCommitted: true, commitClubId: operationContext.clubId, postCommitContextCurrent: contextCurrent(), profileReconcileVerified: true, completedReplayInvalidated };
      } catch (error) {
        if (transactionDeleted && (error?.code === 'finance/write-context-stale' || !contextCurrent())) {
          return contextStaleSuccess();
        }
        if (transactionDeleted) {
          error.partialWrite = true;
          error.transactionDeleted = true;
          error.transactionId = id;
          // The transaction is gone but profile reconciliation failed. Keep the
          // deleted row out of local caches only while original context is current.
          if (contextCurrent()) {
            _removeLocalTransaction(id);
            _invalidateTuition('v5u2-delete-tuition-partial-reconcile', { examRefresh: analyzed?.requiresExamRefresh === true });
          }
        }
        _audit('transaction.delete', 'error', {
          ...auditPayload,
          partialWrite: error?.partialWrite === true,
          transactionDeleted: error?.transactionDeleted === true,
          completedReplayInvalidated,
          error: error?.message || String(error)
        }, auditIntent);
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
