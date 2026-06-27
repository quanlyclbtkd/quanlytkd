#!/usr/bin/env node
/**
 * Phase 4K-6V — Attendance Canonical Ownership + Monthly Pagination
 * Static contract checks and isolated runtime simulations. No network calls.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const exists = (rel) => fs.existsSync(path.join(root, rel));
const failures = [];
const passes = [];
const check = (condition, message) => condition ? passes.push(message) : failures.push(message);

const app = read('app.js');
const main = read('js/main.js');
const index = read('index.html');
const pkg = JSON.parse(read('package.json'));
const registry = read('js/core/globalOwnershipRegistry.js');
const attendance = read('js/modules/attendance.js');
const service = read('js/services/attendance.service.js');
const fallbackPath = 'js/legacy/legacyAttendanceFallbacks.js';
const fallback = exists(fallbackPath) ? read(fallbackPath) : '';
const baselineAppBytes = 730409;
const baselineAppLines = 11681;

const ownedNames = [
  '_getClubShifts', '_ensureClubShiftsLoaded', '_renderHomeBirthdayBanner',
  'showAttMemberHistory', 'renderAttendanceList', 'onShiftChange',
  'openShiftModal', 'closeShiftModal', 'addShift', 'deleteShift',
  'toggleAttendance', 'toggleAttendanceStatus', 'bulkCheckIn',
  'syncOfflineAttendance', 'switchAttSubTab', 'renderAttMonthly',
  'printAttendanceStatus', 'printAttendanceSessionCompletion',
  'printAttendanceBranchReport',
];

console.log('\n🔎 Phase 4K-6V — Attendance Canonical Ownership + Monthly Pagination\n');

// ── Packaging / bootstrap ──────────────────────────────────────────────
check(exists(fallbackPath), 'attendance rollback bridge exists');
check(index.includes('js/legacy/legacyAttendanceFallbacks.js?v=attendance-canonical-ownership-20260616'), 'attendance rollback bridge has current cache key');
check(index.indexOf('js/legacy/legacyAttendanceFallbacks.js') < index.indexOf('src="app.js'), 'attendance rollback bridge loads before app.js');
check(index.includes('app.js?v=attendance-canonical-ownership-20260616') || index.includes('app.js?v=inventory-pagination-complete-debt-20260616') || index.includes('app.js?v=inventory-dynamic-size-catalog-20260616-v2b') || index.includes('app.js?v=inventory-ledger-reconciliation-20260616-v2c'), 'app.js cache key is 4K-6V or a later compatible phase');
check(index.includes('main.js?v=attendance-canonical-ownership-20260616') || index.includes('main.js?v=inventory-pagination-complete-debt-20260616') || index.includes('main.js?v=inventory-dynamic-size-catalog-20260616-v2b') || index.includes('main.js?v=inventory-ledger-reconciliation-20260616-v2c'), 'main.js cache key is 4K-6V or a later compatible phase');
check(main.includes("APP_BUILD_VERSION = '4K-6V-attendance-canonical-ownership-pagination-20260616'"), 'main contains 4K-6V compatibility build marker');
check(main.includes("window.APP_BUILD_VERSION = '4K-6V-attendance-canonical-ownership-pagination-20260616'") || main.includes("window.APP_BUILD_VERSION = '4K-6V2-inventory-history-pagination-complete-active-debt-20260616'"), 'active runtime build version is 4K-6V or later compatible phase');
check(main.includes("from './modules/attendance.js'"), 'main imports attendance module');
check(main.indexOf('initGlobalOwnershipRegistry();') < main.indexOf('initAttendance();'), 'ownership registry initializes before attendance module');

// ── Legacy duplicate removal / canonical owner ────────────────────────
for (const name of ownedNames) {
  check(registry.includes(`${name}:`), `ownership manifest includes ${name}`);
  check(fallback.includes(`'${name}'`) || fallback.includes(`"${name}"`), `rollback bridge includes ${name}`);
  const assignment = new RegExp(`window\\.${name.replace('$', '\\$')}\\s*=(?!=)`);
  check(!assignment.test(app), `app.js no longer assigns window.${name}`);
}
check(registry.includes("owner: 'js/modules/attendance.js'"), 'attendance ownership manifest points to attendance.js');
check(registry.includes("phase: '4K-6V-attendance-canonical-ownership'"), 'registry reports current attendance phase');
check(attendance.includes("const ATTENDANCE_OWNER = 'js/modules/attendance.js'"), 'attendance module declares canonical owner');
check(attendance.includes('GlobalOwnershipRegistry.register(name, implementation'), 'attendance module registers canonical globals');
check(attendance.includes('GlobalOwnershipRegistry.restoreCanonical(name)'), 'attendance module can restore canonical globals');
check(!app.includes('_origRenderAttendanceList'), 'legacy renderAttendanceList monkey-patch was removed');
check(!app.includes('const _ATT_STATUS = ['), 'legacy attendance core body was removed from app.js');
check(attendance.includes('await _loadSessionNoteAfterAttendanceRender(_attCurrentDate)'), 'session note loads through explicit attendance lifecycle');
check(app.includes('let _sessionNoteLoadSeq = 0'), 'session note loader has stale-response sequence guard');
check(app.includes('requestSeq !== _sessionNoteLoadSeq'), 'stale session-note response cannot overwrite current date');
check(attendance.includes('if (!_onlineListenerBound)'), 'online synchronization listener is bind-once');
check(attendance.includes("window.addEventListener('online', window.syncOfflineAttendance)"), 'online synchronization listener remains installed');
check(attendance.includes('if (_currentShiftId && _docShift !== _currentShiftId) return;'), 'attendance cache applies correct selected-shift filter');
check(attendance.includes('AttendanceService.loadByDate(_attCurrentDate, {') && attendance.includes('shiftId: _currentShiftId') && attendance.includes('branch: _dailyBranch'), 'daily read passes selected shift and branch to service');
check(service.includes("constraints.push(where('shiftId', '==', shiftId))"), 'daily query filters selected shift server-side');

// ── Monthly pagination correctness / safety ───────────────────────────
const monthlyStart = service.indexOf('async loadByMonth(month, options = {})');
const monthlyEnd = service.indexOf('// ── BULK OPERATIONS', monthlyStart);
const monthlyBody = monthlyStart >= 0 && monthlyEnd > monthlyStart ? service.slice(monthlyStart, monthlyEnd) : '';
check(monthlyBody.length > 0, 'monthly loader implementation is present');
check(monthlyBody.includes("where('month', '==', month)"), 'monthly loader remains scoped to selected month');
check(monthlyBody.includes('_startAfter(cursor)'), 'monthly loader uses cursor pagination');
check(monthlyBody.includes('_limit(pageSize)'), 'monthly loader uses bounded page size');
check(monthlyBody.includes('attendanceMonthlyPageSize'), 'monthly page size is configurable');
check(monthlyBody.includes('attendanceMonthlyMaxPages'), 'monthly safety ceiling is configurable');
check(monthlyBody.includes("error.code = 'attendance/monthly-max-pages'"), 'monthly loader throws instead of returning incomplete data');
check(monthlyBody.includes("error.code = 'attendance/monthly-load-aborted'"), 'monthly loader supports request cancellation');
check(!monthlyBody.includes('limit(10000)'), 'monthly loader removed fixed 10,000-document cap');
for (const forbidden of ['setDoc(', 'updateDoc(', 'addDoc(', 'deleteDoc(', 'writeBatch(', 'runTransaction(', 'onSnapshot(']) {
  check(!monthlyBody.includes(forbidden), `monthly loader has no ${forbidden} write/listener call`);
}
check(attendance.includes('new AbortController()'), 'monthly renderer creates an AbortController');
check(attendance.includes('requestId === _monthlyRenderRequestId') && attendance.includes('if (!_isCurrentRequest()) return;'), 'monthly renderer rejects stale responses');
check(attendance.includes("e.code === 'attendance/monthly-max-pages'"), 'monthly renderer reports safety-ceiling errors clearly');

// ── Protected boundaries remain untouched ────────────────────────────
for (const name of [
  'processMultiItem', 'quickPay', 'deleteTx', 'markInvPaid', 'cancelExamPayment',
  'processBatchUpgrade', 'initSaaSDatabase', 'listenToData', 'renderApp', 'scheduleRender',
]) {
  check(app.includes(name), `protected runtime/financial boundary remains in app.js: ${name}`);
}

const appBytes = Buffer.byteLength(app);
const appLines = app.split('\n').length;
check(appBytes < baselineAppBytes, `app.js reduced from ${baselineAppBytes.toLocaleString()} to ${appBytes.toLocaleString()} bytes`);
check(appLines < baselineAppLines, `app.js reduced from ${baselineAppLines.toLocaleString()} to ${appLines.toLocaleString()} lines`);
check(appBytes <= 700000, `app.js meets Phase 4K-6V4B8 compatible size target (${appBytes.toLocaleString()} <= 700,000 bytes)`);
check(appLines <= 11050, `app.js remains within compatible Phase 4K-6V4B8+ size target (${appLines.toLocaleString()} <= 11,050 lines)`);

check(!!pkg.scripts?.['check:attendance-canonical-ownership'], 'package exposes Phase 4K-6V checker');
check(pkg.scripts?.check?.includes('check:attendance-canonical-ownership'), 'default check includes Phase 4K-6V checker');
check(pkg.scripts?.['check:all']?.includes('check:attendance-canonical-ownership'), 'full check includes Phase 4K-6V checker');
check(pkg.scripts?.['check:all:critical']?.includes('check:attendance-canonical-ownership'), 'critical check includes Phase 4K-6V checker');

// ── Runtime monthly pagination simulation: 10,500 docs ──────────────
try {
  globalThis.window = globalThis;
  globalThis.__store = { db: {}, clubId: 'club-pagination' };
  globalThis.__scaleConfig = { attendanceMonthlyPageSize: 1000, attendanceMonthlyMaxPages: 200 };

  const total = 10500;
  let getDocsCalls = 0;
  let startAfterCalls = 0;
  globalThis._fb_init = {
    collection: (...args) => ({ kind: 'collection', args }),
    where: (...args) => ({ kind: 'where', args }),
    limit: (size) => ({ kind: 'limit', size }),
    startAfter: (cursor) => { startAfterCalls += 1; return { kind: 'startAfter', cursor }; },
    query: (ref, ...constraints) => ({ ref, constraints }),
    getDocs: async (q) => {
      getDocsCalls += 1;
      const limitConstraint = q.constraints.find((item) => item.kind === 'limit');
      const cursorConstraint = q.constraints.find((item) => item.kind === 'startAfter');
      const pageSize = limitConstraint?.size || 1000;
      const start = cursorConstraint ? Number(String(cursorConstraint.cursor.id).split('-')[1]) + 1 : 0;
      const end = Math.min(start + pageSize, total);
      const docs = Array.from({ length: Math.max(0, end - start) }, (_, offset) => {
        const index = start + offset;
        return { id: `doc-${index}`, data: () => ({ month: '2026-06', date: '2026-06-01', status: 1 }) };
      });
      return { docs, empty: docs.length === 0, forEach(cb) { docs.forEach(cb); } };
    },
  };

  const serviceModule = await import(pathToFileURL(path.join(root, 'js/services/attendance.service.js')).href + `?pagination=${Date.now()}`);
  const progress = [];
  const records = await serviceModule.AttendanceService.loadByMonth('2026-06', {
    onPage: (info) => progress.push(info),
  });
  check(records.length === total, 'monthly pagination returns all 10,500 documents');
  check(new Set(records.map((item) => item.id)).size === total, 'monthly pagination returns no duplicate documents');
  check(getDocsCalls === 11, '10,500 documents load in 11 bounded pages');
  check(startAfterCalls === 10, 'cursor is applied after every full page');
  check(progress.length === 11 && progress.at(-1)?.totalDocs === total, 'monthly progress callback reports all pages/documents');
  check(globalThis.__attendanceMonthlyPaginationMetrics?.completed === true, 'monthly pagination records completed metrics');
  check(globalThis.__attendanceMonthlyPaginationMetrics?.docs === total, 'monthly pagination metrics record full document count');

  // Abort after the first page; second page must never be accepted.
  const abortController = new AbortController();
  getDocsCalls = 0;
  let abortError = null;
  try {
    await serviceModule.AttendanceService.loadByMonth('2026-06', {
      pageSize: 1000,
      signal: abortController.signal,
      onPage: ({ page }) => { if (page === 1) abortController.abort(); },
    });
  } catch (error) {
    abortError = error;
  }
  check(abortError?.name === 'AbortError' && abortError?.code === 'attendance/monthly-load-aborted', 'monthly pagination aborts stale requests with explicit code');
  check(globalThis.__attendanceMonthlyPaginationMetrics?.aborted === true, 'aborted monthly request is recorded in metrics');

  // Safety ceiling must throw, never return a partial array.
  const ceilingTotal = 1000;
  globalThis._fb_init.getDocs = async (q) => {
    const limitConstraint = q.constraints.find((item) => item.kind === 'limit');
    const cursorConstraint = q.constraints.find((item) => item.kind === 'startAfter');
    const pageSize = limitConstraint?.size || 100;
    const start = cursorConstraint ? Number(String(cursorConstraint.cursor.id).split('-')[1]) + 1 : 0;
    const end = Math.min(start + pageSize, ceilingTotal);
    const docs = Array.from({ length: Math.max(0, end - start) }, (_, offset) => {
      const index = start + offset;
      return { id: `ceil-${index}`, data: () => ({ month: '2026-06', status: 1 }) };
    });
    return { docs, empty: docs.length === 0, forEach(cb) { docs.forEach(cb); } };
  };
  let ceilingError = null;
  try {
    await serviceModule.AttendanceService.loadByMonth('2026-06', { pageSize: 100, maxPages: 2 });
  } catch (error) {
    ceilingError = error;
  }
  check(ceilingError?.code === 'attendance/monthly-max-pages', 'monthly loader throws at configured safety ceiling');
  check(ceilingError?.partialCount === 200, 'safety error reports partial count for diagnostics');
  check(globalThis.__attendanceMonthlyPaginationMetrics?.completed === false, 'safety-ceiling metrics never claim completion');
} catch (error) {
  failures.push(`monthly pagination runtime simulation failed: ${error?.stack || error}`);
}

// ── Runtime ownership / bind-once / club reset simulation ─────────────
try {
  const storage = new Map();
  let onlineListenerCount = 0;
  globalThis.window = globalThis;
  globalThis.document = {
    getElementById: () => null,
    querySelectorAll: () => [],
    createElement: () => ({ style: {}, classList: { add() {}, remove() {} } }),
    body: { appendChild() {}, removeChild() {} },
  };
  globalThis.localStorage = {
    get length() { return storage.size; },
    key(index) { return Array.from(storage.keys())[index] || null; },
    getItem(key) { return storage.has(key) ? storage.get(key) : null; },
    setItem(key, value) { storage.set(key, String(value)); },
    removeItem(key) { storage.delete(key); },
  };
  Object.defineProperty(globalThis, 'navigator', { value: { onLine: false }, configurable: true });
  globalThis.addEventListener = (name) => { if (name === 'online') onlineListenerCount += 1; };
  globalThis.showToast = () => true;
  globalThis.classifyProfileStatus = () => 'active';
  globalThis.__store = { db: {}, clubId: 'club-a', currentClubId: 'club-a', profiles: {}, clubConfig: {}, clubData: {} };
  globalThis.currentClubId = 'club-a';
  globalThis.userRole = 'admin';
  globalThis._fb_init = {};

  vm.runInThisContext(fallback, { filename: fallbackPath });
  const fallbackRefs = Object.fromEntries(ownedNames.map((name) => [name, globalThis[name]]));
  const registryModule = await import(pathToFileURL(path.join(root, 'js/core/globalOwnershipRegistry.js')).href);
  const attendanceModule = await import(pathToFileURL(path.join(root, 'js/modules/attendance.js')).href);
  registryModule.initGlobalOwnershipRegistry();
  const api = attendanceModule.initAttendance();

  const snapshot = globalThis.GlobalOwnershipRegistry.getSnapshot();
  const attendanceOwners = snapshot.registered.filter((item) => ownedNames.includes(item.name));
  check(!!api && globalThis.AttendanceModule === api, 'attendance init exposes a stable module API');
  check(attendanceOwners.length === 19, 'all 19 attendance globals register at runtime');
  check(attendanceOwners.every((item) => item.owner === 'js/modules/attendance.js' && item.installed), 'all attendance canonical globals are installed');
  check(snapshot.collisions.length === 0, 'attendance ownership creates no collision');
  check(ownedNames.every((name) => globalThis.GlobalOwnershipRegistry.getLegacyFallback(name) === fallbackRefs[name]), 'all attendance rollback references are preserved');
  check(onlineListenerCount === 1, 'attendance online listener binds once during first init');

  attendanceModule.initAttendance();
  check(onlineListenerCount === 1, 'repeated attendance init does not duplicate online listener');
  check(globalThis.GlobalOwnershipRegistry.assertRegisteredOwnership().ok, 'attendance canonical references remain healthy after repeated init');

  globalThis.currentAttendanceData = { staleStudent: 1 };
  globalThis.__store.clubId = 'club-b';
  globalThis.__store.currentClubId = 'club-b';
  globalThis.currentClubId = 'club-b';
  attendanceModule.initAttendance();
  check(Object.keys(globalThis.currentAttendanceData).length === 0, 'club switch resets attendance cache/state');
  check(globalThis.AttendanceModule.getMetrics().clubId === 'club-b', 'attendance metrics track the active club after reset');
  check(onlineListenerCount === 1, 'club switch still does not duplicate online listener');
} catch (error) {
  failures.push(`attendance ownership runtime simulation failed: ${error?.stack || error}`);
}

for (const message of passes) console.log('✅', message);
if (failures.length) {
  console.error(`\n❌ Phase 4K-6V check failed (${failures.length})`);
  failures.forEach((message) => console.error('FAIL:', message));
  process.exit(1);
}
console.log(`\n✅ Phase 4K-6V check passed (${passes.length} assertions)\n`);
