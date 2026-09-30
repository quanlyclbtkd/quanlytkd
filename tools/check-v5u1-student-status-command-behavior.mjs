#!/usr/bin/env node
let failures = 0;
function check(name, condition, details = '') {
  if (condition) console.log(`✅ ${name}`);
  else { failures++; console.error(`❌ ${name}${details ? ` — ${details}` : ''}`); }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

globalThis.window = globalThis;
window.__store = { profiles: { 'A': { status: 'active', skippedMonths: [] }, 'Old': { status: 'quit', quitDate: '2026-01-01' } }, _dataVersion: 0 };
window.allProfiles = window.__store.profiles;
const calls = { update: 0, delete: 0, addSkip: 0, removeSkip: 0, rename: 0 };
window.StudentService = {
  async updateProfile(name, patch) { calls.update++; await sleep(20); window.__lastUpdate = { name, patch }; },
  async deleteProfile(name) { calls.delete++; window.__lastDelete = name; },
  async addSkippedMonth(name, month) { calls.addSkip++; await sleep(20); window.__lastAddSkip = { name, month }; },
  async removeSkippedMonth(name, month) { calls.removeSkip++; window.__lastRemoveSkip = { name, month }; },
  async renameWithBatch(oldName, newName, updateData, txUpdates) { calls.rename++; window.__lastRename = { oldName, newName, updateData, txUpdates }; },
};
const merged = [];
const removed = [];
window.studentProfileStore = {
  getProfile(name) { return window.__store.profiles[name] || null; },
  mergeProfile(name, data, reason) { merged.push({ name, data, reason }); },
  removeProfile(name, reason) { removed.push({ name, reason }); },
};
const invalidated = [];
window.syncStudentStatusLocal = (name, patch, reason) => {
  window.__store.profiles[name] = { ...(window.__store.profiles[name] || {}), ...patch };
  invalidated.push(`sync:${name}:${reason}`, 'students.activeList', 'students.quitList', 'students.debtList', 'dashboard.summary');
};
window.syncStudentSkippedMonthLocal = (name, month, action, reason) => {
  const p = window.__store.profiles[name] || {};
  const old = Array.isArray(p.skippedMonths) ? p.skippedMonths : [];
  p.skippedMonths = action === 'remove' ? old.filter(x => x !== month) : [...new Set([...old, month])];
  window.__store.profiles[name] = p;
  invalidated.push(`skip:${name}:${month}:${action}:${reason}`);
};
window.invalidateList = key => invalidated.push(key);
window.invalidateLists = keys => invalidated.push(...keys);
window.invalidateDashboard = () => invalidated.push('dashboard');
window.invalidateSearchCache = () => invalidated.push('search');
window.refreshListsComputation = keys => invalidated.push(...keys.map(k => `refresh:${k}`));
window.removeStudentFromDebtDom = name => invalidated.push(`debt-dom:${name}`);

const mod = await import(`../js/core/studentStatusCommandBoundary.js?behavior=${Date.now()}`);
mod.initStudentStatusCommandBoundary();
const boundary = window.StudentStatusCommandBoundary;

const p1 = boundary.markQuit('A', '2026-07-22');
const p2 = boundary.markQuit('A', '2026-07-22');
await Promise.all([p1, p2]);
check('identical markQuit commands run one service write', calls.update === 1, `calls=${calls.update}`);
check('markQuit commits local status', window.__store.profiles.A.status === 'quit' && window.__store.profiles.A.quitDate === '2026-07-22');
check('markQuit invalidates active/quit/debt/attendance', ['students.activeList','students.quitList','students.debtList','attendance.list'].every(k => invalidated.includes(k)));

await boundary.addSkippedMonth('A', '2026-08');
check('addSkippedMonth uses service once', calls.addSkip === 1);
check('addSkippedMonth updates local skippedMonths', window.__store.profiles.A.skippedMonths.includes('2026-08'));
await boundary.removeSkippedMonth('A', '2026-08');
check('removeSkippedMonth uses service once', calls.removeSkip === 1);
check('removeSkippedMonth updates local skippedMonths', !window.__store.profiles.A.skippedMonths.includes('2026-08'));

await boundary.updateProfile({ oldName: 'Old', newName: 'New', updateData: { status: 'active', quitDate: null }, txUpdates: [{ txId: 't1', newDesc: 'New' }] });
check('rename delegates once with tx updates', calls.rename === 1 && window.__lastRename.txUpdates.length === 1);
check('rename removes old and commits new local profile', !window.__store.profiles.Old && window.__store.profiles.New?.status === 'active');
check('rename updates canonical store buckets', removed.some(x => x.name === 'Old') && merged.some(x => x.name === 'New'));

await boundary.deleteProfile('New');
check('delete delegates once', calls.delete === 1 && window.__lastDelete === 'New');
check('delete removes local profile', !window.__store.profiles.New);

const metrics = boundary.getMetrics();
check('metrics record duplicate prevention', metrics.duplicatePrevented >= 1);
check('metrics have no failed commands', metrics.failed === 0, JSON.stringify(metrics));

// FinanceService permission error annotation behavior.
window.__store.db = { id: 'db' };
window.__store.clubId = 'clubA';
window._fb_init = {
  doc: (...parts) => parts.join('/'),
  deleteDoc: async () => {
    const e = new Error('Missing or insufficient permissions.');
    e.code = 'permission-denied';
    throw e;
  },
};
const financeMod = await import(`../js/services/finance.service.js?behavior=${Date.now()}`);
let annotated = false;
try { await financeMod.FinanceService.deleteTransaction('tx1'); } catch (e) {
  annotated = e.code === 'permission-denied' && /Firestore Rules cấp quyền xóa giao dịch/.test(e.message);
}
check('FinanceService preserves and annotates permission-denied', annotated);

if (failures) {
  console.error(`\nV5U-1 student status command behavior check FAILED: ${failures}`);
  process.exit(1);
}
console.log('\nV5U-1 student status command behavior check PASS.');
