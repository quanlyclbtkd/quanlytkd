/**
 * Phase 4K-6V5U-1 — Student Status Command Cutover
 *
 * Single write owner for student profile/status mutations.
 * IMPORTANT:
 *   - Reuses existing StudentService methods.
 *   - Does not create a parallel Firestore path.
 *   - Commits local stores and invalidates affected domains once after success.
 *   - Finance / inventory / multi-item writes are intentionally out of scope.
 */
import { StudentService } from '../services/students.service.js?v=student-status-command-cutover-20260722-v5u1';

const BUILD = 'student-status-command-cutover-20260722-v5u1';
const PHASE = '4K-6V5U-1';
const inFlight = new Map();
const metrics = {
  build: BUILD,
  phase: PHASE,
  calls: 0,
  completed: 0,
  failed: 0,
  duplicatePrevented: 0,
  byCommand: {},
  history: [],
};

function _service() {
  return (typeof window !== 'undefined' && window.StudentService) || StudentService;
}
function _key(command, identity) {
  return `${command}:${String(identity || '').trim()}`;
}
function _pushHistory(item) {
  metrics.history.push(item);
  if (metrics.history.length > 60) metrics.history.shift();
}
function _track(command, field) {
  const row = metrics.byCommand[command] || (metrics.byCommand[command] = { calls: 0, completed: 0, failed: 0, duplicatePrevented: 0 });
  row[field] = (row[field] || 0) + 1;
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
      _pushHistory({ command, key, ok: false, message: error?.message || String(error), durationMs: Date.now() - startedAt, at: Date.now() });
      throw error;
    })
    .finally(() => {
      if (inFlight.get(key) === promise) inFlight.delete(key);
    });
  inFlight.set(key, promise);
  return promise;
}

function _getProfile(name) {
  const key = String(name || '').trim();
  if (!key || typeof window === 'undefined') return {};
  try {
    const fromCanonical = window.studentProfileStore?.getProfile?.(key);
    if (fromCanonical) return fromCanonical;
  } catch (_) {}
  return window.__store?.profiles?.[key] || window.allProfiles?.[key] || {};
}

function _commitProfilePatch(name, patch, reason) {
  if (typeof window === 'undefined') return;
  const key = String(name || '').trim();
  const previous = _getProfile(key);
  const next = { ...previous, ...(patch || {}) };

  try { window.syncStudentStatusLocal?.(key, patch, reason); } catch (_) {}
  try { window.studentProfileStore?.mergeProfile?.(key, next, reason); } catch (_) {}
  try {
    if (!window.__store) window.__store = {};
    if (!window.__store.profiles) window.__store.profiles = {};
    window.__store.profiles[key] = next;
  } catch (_) {}

  // Attendance does not share the students computation domain; invalidate it explicitly.
  try { window.invalidateList?.('attendance.list', reason); } catch (_) {}
}

function _commitRename(oldName, newName, patch, reason) {
  if (typeof window === 'undefined') return;
  const previous = _getProfile(oldName);
  const next = { ...previous, ...(patch || {}) };
  try { window.studentProfileStore?.removeProfile?.(oldName, `${reason}:remove-old`); } catch (_) {}
  try { window.studentProfileStore?.mergeProfile?.(newName, next, `${reason}:merge-new`); } catch (_) {}
  try {
    if (!window.__store) window.__store = {};
    const map = { ...(window.__store.profiles || {}) };
    delete map[oldName];
    map[newName] = next;
    window.__store.profiles = map;
    window.__store._dataVersion = (window.__store._dataVersion || 0) + 1;
  } catch (_) {}
  try { window.invalidateSearchCache?.('students', reason); } catch (_) {}
  try { window.refreshListsComputation?.(['students.activeList', 'students.quitList', 'students.debtList', 'dashboard.summary'], reason); } catch (_) {}
  try { window.invalidateLists?.(['students.activeList', 'students.quitList', 'students.debtList', 'attendance.list'], reason); } catch (_) {
    try { window.invalidateList?.('students.activeList', reason); } catch (_) {}
    try { window.invalidateList?.('students.quitList', reason); } catch (_) {}
    try { window.invalidateList?.('students.debtList', reason); } catch (_) {}
    try { window.invalidateList?.('attendance.list', reason); } catch (_) {}
  }
  try { window.invalidateDashboard?.(reason); } catch (_) {}
}

function _commitDelete(name, reason) {
  if (typeof window === 'undefined') return;
  const key = String(name || '').trim();
  try { window.studentProfileStore?.removeProfile?.(key, reason); } catch (_) {}
  try {
    if (window.__store?.profiles) delete window.__store.profiles[key];
    if (window.__store) window.__store._dataVersion = (window.__store._dataVersion || 0) + 1;
  } catch (_) {}
  try { window.invalidateSearchCache?.('students', reason); } catch (_) {}
  try { window.refreshListsComputation?.(['students.activeList', 'students.quitList', 'students.debtList', 'dashboard.summary'], reason); } catch (_) {}
  try { window.invalidateLists?.(['students.activeList', 'students.quitList', 'students.debtList', 'attendance.list'], reason); } catch (_) {}
  try { window.invalidateDashboard?.(reason); } catch (_) {}
}

export const StudentStatusCommandBoundary = Object.freeze({
  build: BUILD,
  phase: PHASE,

  async updateProfile({ oldName, newName, updateData, txUpdates = [] }) {
    const oldKey = String(oldName || '').trim();
    const newKey = String(newName || oldName || '').trim();
    if (!oldKey || !newKey) throw new Error('[StudentStatusCommandBoundary] Thiếu tên võ sinh.');
    return _run('student.updateProfile', `${oldKey}|${newKey}`, async () => {
      const svc = _service();
      if (oldKey !== newKey) {
        await svc.renameWithBatch(oldKey, newKey, updateData, txUpdates);
        _commitRename(oldKey, newKey, updateData, 'v5u1-profile-rename');
      } else {
        await svc.updateProfile(oldKey, updateData);
        _commitProfilePatch(oldKey, updateData, 'v5u1-profile-update');
      }
      return { oldName: oldKey, newName: newKey, renamed: oldKey !== newKey };
    });
  },

  async deleteProfile(name) {
    const key = String(name || '').trim();
    if (!key) throw new Error('[StudentStatusCommandBoundary] Thiếu tên võ sinh cần xóa.');
    return _run('student.deleteProfile', key, async () => {
      await _service().deleteProfile(key);
      _commitDelete(key, 'v5u1-profile-delete');
      return { name: key };
    });
  },

  async addSkippedMonth(name, month) {
    const key = String(name || '').trim();
    const m = String(month || '').trim();
    return _run('student.addSkippedMonth', `${key}|${m}`, async () => {
      await _service().addSkippedMonth(key, m);
      try { window.syncStudentSkippedMonthLocal?.(key, m, 'add', 'v5u1-skip-month-add'); } catch (_) {}
      try { window.invalidateList?.('attendance.list', 'v5u1-skip-month-add'); } catch (_) {}
      try { window.removeStudentFromDebtDom?.(key); } catch (_) {}
      return { name: key, month: m };
    });
  },

  async removeSkippedMonth(name, month) {
    const key = String(name || '').trim();
    const m = String(month || '').trim();
    return _run('student.removeSkippedMonth', `${key}|${m}`, async () => {
      await _service().removeSkippedMonth(key, m);
      try { window.syncStudentSkippedMonthLocal?.(key, m, 'remove', 'v5u1-skip-month-remove'); } catch (_) {}
      try { window.invalidateList?.('attendance.list', 'v5u1-skip-month-remove'); } catch (_) {}
      return { name: key, month: m };
    });
  },

  async markQuit(name, quitDate) {
    const key = String(name || '').trim();
    const patch = { status: 'quit', quitDate: quitDate || new Date().toISOString().slice(0, 10) };
    return _run('student.markQuit', key, async () => {
      await _service().updateProfile(key, patch);
      _commitProfilePatch(key, patch, 'v5u1-mark-quit');
      try { window.removeStudentFromDebtDom?.(key); } catch (_) {}
      return { name: key, patch };
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

export function initStudentStatusCommandBoundary() {
  if (typeof window === 'undefined') return StudentStatusCommandBoundary;
  window.StudentService = window.StudentService || StudentService;
  window.StudentStatusCommandBoundary = StudentStatusCommandBoundary;
  window.getStudentStatusCommandMetrics = () => StudentStatusCommandBoundary.getMetrics();
  return StudentStatusCommandBoundary;
}
