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
import { FinanceService } from '../services/finance.service.js?v=tuition-command-cutover-20260730-v5u2';
import { getLocalToday, normalizeYYYYMM, formatMonthCompact } from '../utils/format.js';

const BUILD = 'tuition-command-cutover-20260730-v5u2';
const PHASE = '4K-6V5U-2';
const inFlight = new Map();
const metrics = {
  build: BUILD,
  phase: PHASE,
  calls: 0,
  completed: 0,
  failed: 0,
  duplicatePrevented: 0,
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
async function _run(command, identity, task) {
  const key = _key(command, identity);
  const existing = inFlight.get(key);
  if (existing) {
    metrics.duplicatePrevented++;
    _track(command, 'duplicatePrevented');
    return existing;
  }
  metrics.calls++;
  _track(command, 'calls');
  const startedAt = Date.now();
  const promise = Promise.resolve()
    .then(task)
    .then(value => {
      metrics.completed++;
      _track(command, 'completed');
      _pushHistory({ command, key, ok: true, durationMs: Date.now() - startedAt, at: Date.now() });
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
    if (typeof window.guardFinancialWriteIntent === 'function') {
      return window.guardFinancialWriteIntent(action, payload) !== false;
    }
  } catch (_) { return false; }
  return true;
}
function _audit(action, stage, payload) {
  try { window.recordFinancialActionAudit?.(action, stage, payload || {}); } catch (_) {}
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
    const monthsList = _normalizeMonths(months);
    const numericAmount = Number(amount) || 0;
    if (!name) throw new Error('[TuitionCommandBoundary] Thiếu tên võ sinh.');
    if (!monthsList.length) throw new Error('[TuitionCommandBoundary] Thiếu tháng học phí.');
    if (numericAmount <= 0) throw new Error('[TuitionCommandBoundary] Số tiền không hợp lệ.');
    if (String(window.userRole || '').toLowerCase() === 'viewer') throw new Error('[TuitionCommandBoundary] Viewer không có quyền thu học phí.');

    const profile = _profiles()[name] || {};
    const feePerMonth = Number(profile.tuitionFee) || 0;
    let paidMonths = monthsList.slice();
    if (feePerMonth > 0 && monthsList.length > 1) {
      const count = Math.min(Math.floor(numericAmount / feePerMonth), monthsList.length);
      paidMonths = monthsList.slice(0, count > 0 ? count : 1);
    }
    const lastMonth = paidMonths[paidMonths.length - 1];
    const identity = `${name}|${paidMonths.join(',')}|${numericAmount}`;
    const auditPayload = { studentName: name, months: paidMonths, amount: numericAmount, branch: branch || 'CS1', txMonth: lastMonth, source };

    return _run('tuition.collect', identity, async () => {
      if (!_guard('tuition.quickPay', auditPayload)) return { ok: false, cancelled: true, reason: 'financial-write-guard' };
      _audit('tuition.quickPay', 'before', auditPayload);
      const today = getLocalToday();
      const txDate = lastMonth < today.substring(0, 7) ? `${lastMonth}-01` : today;
      const txPayload = {
        branch: branch || 'CS1',
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
        txId = await _service().addTransaction(txPayload);
        const normalizedCurrent = normalizeYYYYMM(profile.paidUntil);
        const paidUntil = lastMonth > (normalizedCurrent || '') ? lastMonth : (normalizedCurrent || lastMonth);
        try {
          await _service().updateStudentPayment(name, {
            paidUntil,
            paidMonths: _service()._arrayUnion(...paidMonths),
          });
        } catch (profileError) {
          profileError.partialWrite = true;
          profileError.transactionId = txId;
          throw profileError;
        }
        await _service().addFeeAuditSilent({
          studentId: name,
          amount: numericAmount,
          date: today,
          type: 'tuition',
          month: paidUntil,
          months: paidMonths,
          by: window.currentUserEmail || 'admin',
          timestamp: Date.now(),
        });
        _commitProfilePayment(name, paidUntil, paidMonths, 'v5u2-tuition-collect');
        _invalidateTuition('v5u2-tuition-collect');
        const result = {
          ok: true,
          txId,
          studentName: name,
          amount: numericAmount,
          branch: branch || 'CS1',
          paidMonths,
          paidUntil,
          txMonth: lastMonth,
          txDate,
          monthLabel: formatMonthCompact(paidMonths.join(',')),
        };
        _audit('tuition.quickPay', 'after', { ...auditPayload, txId, paidUntil });
        return result;
      } catch (error) {
        _audit('tuition.quickPay', 'error', { ...auditPayload, txId, partialWrite: error?.partialWrite === true, error: error?.message || String(error) });
        // If transaction creation succeeded but profile update failed, force the
        // transaction/debt views to refresh so the partial state is visible and
        // can be reconciled instead of being hidden by stale local HTML.
        if (txId) _invalidateTuition('v5u2-tuition-partial-write');
        throw error;
      }
    });
  },

  async deleteTuitionTransaction({ txId, transaction, impact, source = 'tuition-tab' } = {}) {
    const id = String(txId || '').trim();
    const tx = transaction || {};
    const analyzed = impact || window.TransactionDeleteIntegrity?.analyzeTransactionDeleteImpact?.(tx || { id });
    if (!id || id === 'undefined') throw new Error('[TuitionCommandBoundary] Transaction ID không hợp lệ.');
    if (!(analyzed?.hasTuition || tx.type === 'Học phí' || tx.type === 'Học phí + Lệ phí thi')) {
      throw new Error('[TuitionCommandBoundary] Giao dịch không thuộc phạm vi Học phí V5U-2.');
    }
    if (tx.relatedInvId) throw new Error('[TuitionCommandBoundary] Giao dịch có Kho đồ không thuộc phạm vi V5U-2.');

    return _run('tuition.deleteTransaction', id, async () => {
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
      try {
        await _service().deleteTransaction(id);
        transactionDeleted = true;
        // Firestore delete is already authoritative at this point. Remove the
        // local row immediately so a later reconcile failure cannot present a
        // transaction that no longer exists on the server.
        _removeLocalTransaction(id);
        if (analyzed?.requiresProfileReconcile && analyzed.studentName && typeof window.reconcileStudentTuitionAfterDeletedTransaction === 'function') {
          await window.reconcileStudentTuitionAfterDeletedTransaction(
            analyzed.studentName,
            tx,
            { reason: 'v5u2-delete-tuition', skipInvalidate: true }
          );
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
        _audit('transaction.delete', 'after', auditPayload);
        return { ok: true, txId: id, studentName: analyzed?.studentName || tx.description || '', impact: analyzed || null };
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
          error: error?.message || String(error)
        });
        throw error;
      }
    });
  },

  getMetrics() {
    return {
      ...metrics,
      inFlightCount: inFlight.size,
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
