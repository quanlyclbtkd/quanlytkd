// Phase 4K-6N — Financial Action Audit Trail + Write Intent Guard
// -----------------------------------------------------------------------------
// Purpose: add a small, best-effort audit/intent boundary around high-risk
// financial write actions without taking ownership of their business logic.
// This module MUST NOT mutate payment data, paidMonths, paidUntil, inventory
// state, or Firestore structure beyond optional audit records.
// -----------------------------------------------------------------------------

const PHASE = '4K-6N';
const BUILD = 'financial-action-audit-trail-write-intent-20260608';

const ALLOWED_ACTIONS = new Set([
  'tuition.quickPay',
  'multiitem.pay',
  'transaction.delete',
  'inventory.markPaid',
  'exam.cancelPayment',
  'expense.create',
  'expense.edit',
  'inventory.edit'
]);

const WRITE_ROLES = new Set(['admin', 'super_admin', 'superadmin', 'root_admin', 'root']);

const state = {
  phase: PHASE,
  build: BUILD,
  initialized: false,
  guards: [],
  auditTrail: [],
  blocked: [],
  errors: [],
  persisted: 0,
  skippedPersist: 0,
  lastGuard: null,
  lastAudit: null,
  maxMemoryRows: 250,
  enabled: true,
  persistEnabled: true
};

function _nowIso() {
  try { return new Date().toISOString(); } catch (_) { return String(Date.now()); }
}

function _safeString(v, max = 240) {
  const s = String(v == null ? '' : v);
  return s.length > max ? s.slice(0, max) + '…' : s;
}

function _getStore() {
  return (typeof window !== 'undefined' && window.__store) || {};
}

function _getClubId() {
  const st = _getStore();
  return st.clubId || st.currentClubId || (typeof window !== 'undefined' && window.currentClubId) || '';
}

function _getUserInfo() {
  if (typeof window === 'undefined') return {};
  const st = _getStore();
  const u = st.currentUser || st.user || (window.firebaseUser || null) || {};
  return {
    uid: u.uid || window.currentUserUid || '',
    email: u.email || window.currentUserEmail || '',
    role: window.userRole || st.userRole || '',
    coachBranch: window.coachBranch || st.coachBranch || ''
  };
}

function _sanitizePayload(payload) {
  const src = payload || {};
  const out = {};
  Object.keys(src).forEach((k) => {
    const v = src[k];
    if (typeof v === 'function') return;
    if (v == null) { out[k] = v; return; }
    if (Array.isArray(v)) {
      out[k] = v.slice(0, 30).map((x) => typeof x === 'object' ? _safeString(JSON.stringify(x), 300) : x);
      return;
    }
    if (typeof v === 'object') {
      try { out[k] = _safeString(JSON.stringify(v), 500); }
      catch (_) { out[k] = '[object]'; }
      return;
    }
    if (typeof v === 'string') out[k] = _safeString(v, 300);
    else out[k] = v;
  });
  return out;
}

function _pushLimited(arr, row) {
  arr.push(row);
  while (arr.length > state.maxMemoryRows) arr.shift();
}

function _validateAmount(payload) {
  if (!payload || payload.amount == null && payload.total == null) return { ok: true };
  const value = payload.amount != null ? payload.amount : payload.total;
  const n = Number(String(value).replace(/[^\d.-]/g, ''));
  if (!Number.isFinite(n)) return { ok: false, reason: 'invalid-amount' };
  if (n < 0) return { ok: false, reason: 'negative-amount' };
  return { ok: true, amount: n };
}

function guardFinancialWriteIntent(action, payload = {}, options = {}) {
  const clubId = _getClubId();
  const user = _getUserInfo();
  const cleanPayload = _sanitizePayload(payload);
  const now = Date.now();
  const intentId = `${PHASE}-${action || 'unknown'}-${now}-${Math.random().toString(36).slice(2, 8)}`;
  const amountCheck = _validateAmount(payload);

  const reasons = [];
  if (!state.enabled) reasons.push('guard-disabled');
  if (!action || !ALLOWED_ACTIONS.has(action)) reasons.push('unknown-action');
  if (!clubId) reasons.push('missing-clubId');
  if (!WRITE_ROLES.has(user.role || '')) reasons.push('role-not-allowed:' + (user.role || ''));
  if (!amountCheck.ok) reasons.push(amountCheck.reason);

  const ok = reasons.length === 0 || options.soft === true;
  const row = {
    ok,
    intentId,
    action: action || '',
    reasons,
    clubId,
    user,
    payload: cleanPayload,
    time: _nowIso(),
    timestamp: now,
    soft: !!options.soft
  };

  state.lastGuard = row;
  _pushLimited(state.guards, row);
  if (!ok) _pushLimited(state.blocked, row);

  if (!ok) {
    console.warn('[financial-intent-guard] blocked', row);
  } else if (options.log !== false) {
    console.info('[financial-intent-guard] ok', { action, intentId, clubId, role: user.role });
  }

  return row;
}

function _auditCollectionRef(clubId) {
  if (typeof window === 'undefined') return null;
  const st = _getStore();
  const db = st.db || window.db || window._db || null;
  const sdk = window._fb_init || {};
  if (!db || !clubId || !sdk.collection) return null;
  return sdk.collection(db, 'clubs', clubId, 'financial_audit');
}

async function _persistAuditRecord(record) {
  if (!state.persistEnabled) { state.skippedPersist++; return false; }
  if (typeof window === 'undefined') { state.skippedPersist++; return false; }
  const sdk = window._fb_init || {};
  if (!sdk.addDoc) { state.skippedPersist++; return false; }
  const ref = _auditCollectionRef(record.clubId);
  if (!ref) { state.skippedPersist++; return false; }
  try {
    await sdk.addDoc(ref, record);
    state.persisted++;
    return true;
  } catch (err) {
    state.errors.push({ time: _nowIso(), stage: 'persist', message: err && err.message || String(err) });
    console.warn('[financial-audit] persist skipped:', err);
    return false;
  }
}

function recordFinancialActionAudit(action, stage, payload = {}, options = {}) {
  const clubId = _getClubId();
  const user = _getUserInfo();
  const guard = options.intent || state.lastGuard || null;
  const record = {
    phase: PHASE,
    build: BUILD,
    action: action || '',
    stage: stage || 'event',
    intentId: options.intentId || (guard && guard.intentId) || '',
    clubId,
    user,
    payload: _sanitizePayload(payload),
    clientTime: _nowIso(),
    timestamp: Date.now(),
    url: typeof location !== 'undefined' ? _safeString(location.href, 300) : '',
    userAgent: typeof navigator !== 'undefined' ? _safeString(navigator.userAgent, 300) : ''
  };

  state.lastAudit = record;
  _pushLimited(state.auditTrail, record);

  // best-effort async persistence; never block payment flow
  _persistAuditRecord(record).catch((err) => {
    state.errors.push({ time: _nowIso(), stage: 'audit-record', message: err && err.message || String(err) });
  });

  if (options.log !== false) {
    console.info('[financial-audit]', { action: record.action, stage: record.stage, intentId: record.intentId });
  }
  return record;
}

async function withFinancialWriteIntent(action, payload, fn, options = {}) {
  const intent = guardFinancialWriteIntent(action, payload, options);
  if (!intent.ok) {
    const msg = options.blockMessage || 'Không đủ điều kiện thực hiện thao tác ghi tài chính. Vui lòng kiểm tra quyền và CLB hiện tại.';
    if (typeof window !== 'undefined' && options.alert !== false) alert(msg);
    return options.blockReturn;
  }
  recordFinancialActionAudit(action, 'before', payload, { intent, log: options.log });
  try {
    const result = await fn(intent);
    recordFinancialActionAudit(action, 'after', Object.assign({}, payload, { result: 'ok' }), { intent, log: options.log });
    return result;
  } catch (err) {
    recordFinancialActionAudit(action, 'error', Object.assign({}, payload, { error: err && err.message || String(err) }), { intent, log: options.log });
    throw err;
  }
}

function debugFinancialActionAuditGuard() {
  const result = {
    ok: true,
    phase: PHASE,
    build: BUILD,
    initialized: state.initialized,
    enabled: state.enabled,
    persistEnabled: state.persistEnabled,
    clubId: _getClubId(),
    role: _getUserInfo().role || '',
    guardCount: state.guards.length,
    auditCount: state.auditTrail.length,
    blockedCount: state.blocked.length,
    errorCount: state.errors.length,
    persisted: state.persisted,
    skippedPersist: state.skippedPersist,
    lastGuard: state.lastGuard,
    lastAudit: state.lastAudit,
    hasGuardFn: typeof window !== 'undefined' && typeof window.guardFinancialWriteIntent === 'function',
    hasAuditFn: typeof window !== 'undefined' && typeof window.recordFinancialActionAudit === 'function',
    hasWrapperFn: typeof window !== 'undefined' && typeof window.withFinancialWriteIntent === 'function'
  };
  console.table({
    initialized: result.initialized,
    enabled: result.enabled,
    persistEnabled: result.persistEnabled,
    clubId: result.clubId,
    role: result.role,
    guardCount: result.guardCount,
    auditCount: result.auditCount,
    blockedCount: result.blockedCount,
    persisted: result.persisted,
    skippedPersist: result.skippedPersist
  });
  return result;
}

function debugFinancialActionAuditTrail() {
  const result = {
    ok: true,
    recentGuards: state.guards.slice(-20),
    recentAuditTrail: state.auditTrail.slice(-20),
    blocked: state.blocked.slice(-20),
    errors: state.errors.slice(-20)
  };
  console.table(result.recentAuditTrail.map((r) => ({
    time: r.clientTime,
    action: r.action,
    stage: r.stage,
    intentId: r.intentId,
    student: r.payload && (r.payload.studentName || r.payload.name || ''),
    amount: r.payload && (r.payload.amount || r.payload.total || '')
  })));
  return result;
}

export function initFinancialActionAuditGuard() {
  if (typeof window === 'undefined') return state;
  if (window.__financialActionAuditGuardInitialized) return window.FinancialActionAuditGuard || state;
  window.__financialActionAuditGuardInitialized = true;
  state.initialized = true;

  window.FinancialActionAuditGuard = {
    phase: PHASE,
    build: BUILD,
    state,
    guardFinancialWriteIntent,
    recordFinancialActionAudit,
    withFinancialWriteIntent,
    debugFinancialActionAuditGuard,
    debugFinancialActionAuditTrail
  };

  window.guardFinancialWriteIntent = guardFinancialWriteIntent;
  window.recordFinancialActionAudit = recordFinancialActionAudit;
  window.withFinancialWriteIntent = withFinancialWriteIntent;
  window.debugFinancialActionAuditGuard = debugFinancialActionAuditGuard;
  window.debugFinancialActionAuditTrail = debugFinancialActionAuditTrail;

  return window.FinancialActionAuditGuard;
}

export const FinancialActionAuditGuard = {
  initFinancialActionAuditGuard,
  guardFinancialWriteIntent,
  recordFinancialActionAudit,
  withFinancialWriteIntent,
  debugFinancialActionAuditGuard,
  debugFinancialActionAuditTrail
};

export default FinancialActionAuditGuard;
