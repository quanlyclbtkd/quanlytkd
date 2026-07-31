/**
 * Phase 4K-6V5T — Canonical Domain Command Boundary + Legacy Write Freeze
 *
 * This boundary does NOT implement Firestore business writes. It captures the
 * already-initialized canonical/guarded global handlers and delegates to those
 * exact functions. Its responsibilities are deliberately narrow:
 *   - one registered command id per reviewed public action;
 *   - exact-signature compatibility wrappers for legacy inline handlers;
 *   - single-flight protection for identical high-risk actions;
 *   - diagnostics/ownership metrics;
 *   - no store mutation, no render invalidation, no Firestore import/write.
 *
 * The legacy handler remains the business owner during V5T. Future phases may
 * migrate internals command-by-command only after regression evidence exists.
 */

const PHASE = '4K-6V5T';
const BUILD = 'canonical-domain-command-boundary-write-freeze-20260722-v5t';
const WRAPPER_MARK = Symbol.for('taekwondo.domainCommandBoundary.wrapper');

const state = {
  phase: PHASE,
  build: BUILD,
  initialized: false,
  registeredAt: 0,
  commands: new Map(),
  inFlight: new Map(),
  history: [],
  collisions: [],
  duplicatePrevented: 0,
  errors: [],
};

function _now() { return Date.now(); }
function _isFn(v) { return typeof v === 'function'; }
function _safeString(v, max = 120) {
  if (v == null) return '';
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
    const s = String(v);
    return s.length > max ? s.slice(0, max) : s;
  }
  return '';
}
function _pushLimited(arr, value, max = 120) {
  arr.push(value);
  if (arr.length > max) arr.splice(0, arr.length - max);
}
function _defaultKey(commandId, args) {
  const primitive = Array.from(args || [])
    .map(v => _safeString(v))
    .filter(Boolean)
    .slice(0, 4);
  return `${commandId}:${primitive.join('|') || 'default'}`;
}
function _publicRecord(record) {
  if (!record) return null;
  return {
    id: record.id,
    domain: record.domain,
    action: record.action,
    globalName: record.globalName,
    mode: record.mode,
    risk: record.risk,
    owner: record.owner,
    installed: typeof window !== 'undefined' && window[record.globalName] === record.wrapper,
    hasLegacyHandler: _isFn(record.legacyHandler),
    calls: record.calls,
    completed: record.completed,
    failed: record.failed,
    duplicatePrevented: record.duplicatePrevented,
    registeredAt: record.registeredAt,
  };
}

async function _executeNormalized(commandId, args = [], options = {}) {
  const record = state.commands.get(commandId);
  if (!record || !_isFn(record.legacyHandler)) {
    return { ok: false, commandId, reason: 'command-not-registered', value: undefined };
  }

  const key = options.key || record.key(args) || _defaultKey(commandId, args);
  const existing = state.inFlight.get(key);
  if (existing) {
    state.duplicatePrevented++;
    record.duplicatePrevented++;
    return existing;
  }

  const startedAt = _now();
  record.calls++;
  const task = Promise.resolve()
    .then(() => record.legacyHandler.apply(options.thisArg || window, args))
    .then(value => {
      record.completed++;
      const result = {
        ok: true,
        commandId,
        domain: record.domain,
        action: record.action,
        key,
        value,
        durationMs: _now() - startedAt,
        delegatedTo: record.owner,
      };
      _pushLimited(state.history, { ...result, value: undefined, at: _now() });
      return result;
    })
    .catch(error => {
      record.failed++;
      const result = {
        ok: false,
        commandId,
        domain: record.domain,
        action: record.action,
        key,
        error,
        message: error && error.message ? error.message : String(error),
        durationMs: _now() - startedAt,
        delegatedTo: record.owner,
      };
      _pushLimited(state.errors, { ...result, error: undefined, at: _now() });
      _pushLimited(state.history, { ...result, error: undefined, at: _now() });
      return result;
    })
    .finally(() => {
      if (state.inFlight.get(key) === task) state.inFlight.delete(key);
    });

  state.inFlight.set(key, task);
  return task;
}

async function _executeCompat(commandId, args, thisArg) {
  const result = await _executeNormalized(commandId, args, { thisArg });
  if (result.ok) return result.value;
  if (result.error) throw result.error;
  return undefined;
}

function _makeWrapper(record) {
  const wrapper = function canonicalDomainCommandCompatWrapper(...args) {
    return _executeCompat(record.id, args, this);
  };
  Object.defineProperties(wrapper, {
    [WRAPPER_MARK]: { value: true },
    __domainCommandId: { value: record.id },
    __legacyHandler: { value: record.legacyHandler },
    __domainCommandBuild: { value: BUILD },
    // Preserve source-inspection diagnostics already used by write-safety gates.
    // This does not execute or modify the legacy handler.
    toString: { value: () => record.legacyHandler.toString() },
  });
  return wrapper;
}

function _register(config) {
  const id = String(config.id || '');
  const globalName = String(config.globalName || '');
  if (!id || !globalName || typeof window === 'undefined') {
    return { ok: false, reason: 'invalid-registration', id, globalName };
  }
  const current = window[globalName];
  if (!_isFn(current)) return { ok: false, reason: 'global-handler-missing', id, globalName };

  if (current[WRAPPER_MARK] === true && current.__domainCommandId === id) {
    return { ok: true, reason: 'already-wrapped', record: _publicRecord(state.commands.get(id)) };
  }

  const existing = state.commands.get(id);
  if (existing && existing.legacyHandler !== current) {
    _pushLimited(state.collisions, {
      id,
      globalName,
      reason: 'command-handler-changed',
      previousOwner: existing.owner,
      at: _now(),
    });
    return { ok: false, reason: 'command-handler-changed', id, globalName };
  }

  const record = existing || {
    id,
    domain: config.domain || id.split('.')[0] || 'unknown',
    action: config.action || id.split('.').slice(1).join('.') || id,
    globalName,
    mode: config.mode || 'single-flight-wrapper',
    risk: config.risk || 'reviewed-write',
    owner: config.owner || 'existing-global-handler',
    legacyHandler: current,
    key: _isFn(config.key) ? config.key : args => _defaultKey(id, args),
    calls: 0,
    completed: 0,
    failed: 0,
    duplicatePrevented: 0,
    registeredAt: _now(),
    wrapper: null,
  };

  state.commands.set(id, record);
  if (record.mode === 'observe-only') return { ok: true, record: _publicRecord(record) };

  record.wrapper = _makeWrapper(record);
  window[globalName] = record.wrapper;
  return { ok: true, record: _publicRecord(record) };
}

const REVIEWED_COMMANDS = Object.freeze([
  // Student status/profile commands. Existing StudentService/module handlers stay authoritative.
  { id: 'student.updateProfile', globalName: 'updateProfile', domain: 'student', action: 'updateProfile', owner: 'js/modules/students.js → StudentService', key: () => 'student.updateProfile:profile-modal' },
  { id: 'student.deleteProfile', globalName: 'deleteProfile', domain: 'student', action: 'deleteProfile', owner: 'js/modules/students.js → StudentService', key: () => 'student.deleteProfile:profile-modal' },
  { id: 'student.skipMonth', globalName: 'skipMonth', domain: 'student', action: 'skipMonth', owner: 'js/modules/students.js → StudentService', key: a => `student.skipMonth:${_safeString(a[0])}|${_safeString(a[1])}` },
  { id: 'student.removeSkip', globalName: 'removeSkip', domain: 'student', action: 'removeSkip', owner: 'js/modules/students.js → StudentService', key: a => `student.removeSkip:${_safeString(a[0])}|${_safeString(a[1])}` },
  { id: 'student.markQuitFromDebt', globalName: 'markStudentQuitFromDebt', domain: 'student', action: 'markQuitFromDebt', owner: 'js/modules/students.js → StudentService', key: a => `student.markQuitFromDebt:${_safeString(a[1])}|${_safeString(a[2])}` },
  { id: 'student.skipDebtMonth', globalName: 'skipDebtMonthFromDebt', domain: 'student', action: 'skipDebtMonth', owner: 'js/modules/students.js → StudentService', key: a => `student.skipDebtMonth:${_safeString(a[1])}|${_safeString(a[2])}` },

  // Financial and inventory actions keep their exact existing canonical/guarded implementations.
  { id: 'finance.quickPay', globalName: 'quickPay', domain: 'finance', action: 'quickPay', mode: 'observe-only', risk: 'high-write', owner: 'js/modules/finance.js UI adapter → TuitionCommandBoundary' },
  { id: 'finance.deleteTransaction', globalName: 'deleteTx', domain: 'finance', action: 'deleteTransaction', risk: 'high-write', owner: 'js/modules/finance.js UI adapter → TuitionCommandBoundary/FinanceService', key: a => `finance.deleteTransaction:${_safeString(a[0])}` },
  { id: 'inventory.markPaid', globalName: 'markInvPaid', domain: 'inventory', action: 'markPaid', risk: 'high-write', owner: 'js/modules/inventory.js guarded handler', key: a => `inventory.markPaid:${_safeString(a[0])}` },

  // Registered for ownership visibility only. Existing internal offline/session guards remain untouched.
  { id: 'attendance.toggle', globalName: 'toggleAttendance', domain: 'attendance', action: 'toggle', mode: 'observe-only', owner: 'js/modules/attendance.js' },
  { id: 'attendance.bulkCheckIn', globalName: 'bulkCheckIn', domain: 'attendance', action: 'bulkCheckIn', mode: 'observe-only', owner: 'js/modules/attendance.js' },
  { id: 'attendance.syncOffline', globalName: 'syncOfflineAttendance', domain: 'attendance', action: 'syncOffline', mode: 'observe-only', owner: 'js/modules/attendance.js' },
  { id: 'admission.processMultiItem', globalName: 'processMultiItem', domain: 'admission', action: 'processMultiItem', mode: 'observe-only', risk: 'very-high-write', owner: 'app.js guarded legacy kernel' },
]);

export const CanonicalDomainCommandBoundary = Object.freeze({
  register: _register,
  execute(commandId, args = [], options = {}) {
    return _executeNormalized(commandId, Array.isArray(args) ? args : [args], options);
  },
  executeCompat(commandId, args = [], thisArg = window) {
    return _executeCompat(commandId, Array.isArray(args) ? args : [args], thisArg);
  },
  getCommand(commandId) { return _publicRecord(state.commands.get(commandId)); },
  getSnapshot() {
    return {
      phase: state.phase,
      build: state.build,
      initialized: state.initialized,
      registeredAt: state.registeredAt,
      commandCount: state.commands.size,
      wrappedCount: Array.from(state.commands.values()).filter(r => r.mode !== 'observe-only').length,
      observeOnlyCount: Array.from(state.commands.values()).filter(r => r.mode === 'observe-only').length,
      activeInFlight: state.inFlight.size,
      duplicatePrevented: state.duplicatePrevented,
      collisionCount: state.collisions.length,
      errorCount: state.errors.length,
      commands: Array.from(state.commands.values()).map(_publicRecord),
      recentHistory: state.history.slice(-20),
      collisions: state.collisions.slice(),
      errors: state.errors.slice(-20),
    };
  },
  assertIntegrity() {
    const failures = [];
    for (const record of state.commands.values()) {
      if (record.mode === 'observe-only') {
        if (!_isFn(window[record.globalName])) failures.push({ id: record.id, reason: 'observed-global-missing' });
        continue;
      }
      if (window[record.globalName] !== record.wrapper) failures.push({ id: record.id, reason: 'compat-wrapper-replaced' });
      if (!_isFn(record.legacyHandler)) failures.push({ id: record.id, reason: 'legacy-handler-missing' });
    }
    return { ok: failures.length === 0, failures };
  },
});

export function initCanonicalDomainCommandBoundary() {
  if (typeof window === 'undefined') return CanonicalDomainCommandBoundary;
  if (state.initialized) return CanonicalDomainCommandBoundary;

  for (const config of REVIEWED_COMMANDS) {
    const result = _register(config);
    if (!result.ok && result.reason !== 'global-handler-missing') {
      _pushLimited(state.errors, { stage: 'register', ...result, at: _now() });
    }
  }

  state.initialized = true;
  state.registeredAt = _now();
  window.CanonicalDomainCommandBoundary = CanonicalDomainCommandBoundary;
  window.DomainCommands = CanonicalDomainCommandBoundary;
  window.getDomainCommandMetrics = () => CanonicalDomainCommandBoundary.getSnapshot();
  window.printDomainCommandStatus = () => {
    const snapshot = CanonicalDomainCommandBoundary.getSnapshot();
    const integrity = CanonicalDomainCommandBoundary.assertIntegrity();
    const result = { ok: integrity.ok && snapshot.collisionCount === 0, integrity, snapshot };
    console.log('[CanonicalDomainCommandBoundary]', result);
    if (console.table) console.table(snapshot.commands);
    return result;
  };
  return CanonicalDomainCommandBoundary;
}

export default CanonicalDomainCommandBoundary;
