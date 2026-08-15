#!/usr/bin/env node
/**
 * Phase 4K-6V5U6G — Production Stability Sweep + Residual Runtime Defect Closure
 *
 * Hard gate for the residual defects fixed in this phase. This test never calls
 * Firebase. Attendance runtime tests replace AttendanceService with deterministic
 * fakes and exercise the real module/localStorage journal.
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const attendance = read('js/modules/attendance.js');
const attendanceService = read('js/services/attendance.service.js');
const profiles = read('js/listeners/profiles.listeners.js');
const students = read('js/modules/students.js');
const app = read('app.js');
const main = read('js/main.js');
const index = read('index.html');
const pkg = JSON.parse(read('package.json'));
const passes = [];
const failures = [];
const check = (ok, message, detail = '') => {
    (ok ? passes : failures).push({ message, detail });
    console.log(ok ? '✅' : '❌', message, ok || !detail ? '' : `— ${detail}`);
};
const count = (src, re) => (src.match(re) || []).length;
const block = (src, startNeedle, endNeedle) => {
    const start = src.indexOf(startNeedle);
    if (start < 0) return '';
    const end = src.indexOf(endNeedle, start + startNeedle.length);
    return src.slice(start, end < 0 ? src.length : end);
};

console.log('\n🔎 Phase 4K-6V5U6G — Production Residual Defect Closure\n');

// ── Attendance V2 offline journal contracts ────────────────────────────────
const saveOffline = block(attendance, 'function _saveAttOffline(', 'function _removeAttOfflineMutation(');
const cleanupOffline = block(attendance, 'function _removeAttOfflineMutation(', 'function _buildOfflineRecordForWrite(');
const bulkBlock = block(attendance, 'window.bulkCheckIn = async', '// ── Offline sync');
const syncBlock = block(attendance, 'const _runOfflineAttendanceSync = async', '// ── Sub-tab chuyển Ngày / Tháng');
check(attendance.includes("const _ATTENDANCE_OFFLINE_V2_PREFIX = 'offline_att_v2_';"), 'Attendance V2 journal prefix exists');
check(saveOffline.includes('changedRecords.forEach') && !saveOffline.includes('_attCurrentProfiles.forEach'), 'Attendance V2 journal is per-record, never whole-class snapshot');
check(attendance.includes("record?.clubId || '', record?.date || '', shiftToken, record?.docId || ''"), 'Attendance journal identity includes club/date/shift/docId');
check(saveOffline.includes("operation: status === 0 ? 'delete' : 'set'") && saveOffline.includes('profileId:'), 'Attendance journal records mutation operation and profile identity');
check(saveOffline.includes('previous?.version === 2') && saveOffline.includes('record.queuedAt = previous.queuedAt'), 'Repeated toggle coalesces into one same-doc journal mutation');
check(cleanupOffline.includes('const key = _attendanceOfflineMutationKey(record)') && cleanupOffline.includes('current?.revision') && cleanupOffline.includes('localStorage.removeItem(key)'), 'Successful single write cleanup is scoped to its own mutation and matching revision');
check(!attendance.includes("localStorage.removeItem('offline_att_' +") && !attendance.includes('finally {\n            localStorage.removeItem'), 'No whole-day offline cleanup remains');
check(bulkBlock.includes('pendingBulkMutations.forEach(_removeAttOfflineMutation)') && bulkBlock.indexOf('await AttendanceService.bulkSaveRecords') < bulkBlock.indexOf('pendingBulkMutations.forEach(_removeAttOfflineMutation)'), 'Bulk cleanup occurs only after successful canonical bulk commit');
check(!block(bulkBlock, '} catch(e) {', '} finally {').includes('removeItem'), 'Bulk failure preserves pending journal mutations');
check(attendance.includes('let _offlineAttendanceSyncPromise = null;') && syncBlock.includes('if (_offlineAttendanceSyncPromise)') && syncBlock.includes('return _offlineAttendanceSyncPromise'), 'Attendance offline synchronization is single-flight');
check(syncBlock.includes("key.startsWith(_ATTENDANCE_OFFLINE_V2_PREFIX)") && syncBlock.includes('legacyEntries.push'), 'V2 journal and V1 compatibility share one sync owner');
check(syncBlock.includes("_recordAttendanceOfflineIssue('wrong-club'") && syncBlock.includes("_recordAttendanceOfflineIssue('invalid-shift'"), 'Cross-club and invalid/deleted shift entries fail closed and remain pending');
check(syncBlock.includes("_recordAttendanceOfflineIssue('malformed-payload'") && syncBlock.includes("_classifyAttendanceOfflineError(error, 'unknown')"), 'Offline sync failures are classified/observable, not swallowed');
check(!/setInterval\s*\(/.test(syncBlock) && !/setTimeout\s*\(/.test(syncBlock), 'Attendance sync adds no polling or blind retry loop');


// V5U6G1 Attendance offline canonical payload + cross-context closure.
const canonicalOfflineBuilder = block(attendanceService, 'function _toCanonicalAttendanceWrite(', 'export const AttendanceService');
check(canonicalOfflineBuilder.includes('const payload = {') && !canonicalOfflineBuilder.includes('...rec') && !canonicalOfflineBuilder.includes('...record'), 'V5U6G1 offline Firestore payload is whitelist-built, never journal-spread');
check(!['version','clubId','operation','shiftMode','queuedAt','lastUpdatedAt','revision','docId'].some((key) => new RegExp('\\b' + key + '\\s*:').test(canonicalOfflineBuilder)), 'V5U6G1 journal metadata cannot enter canonical Attendance payload');
check(attendance.includes('let _offlineAttendanceActiveContext = null;') && attendance.includes('let _offlineAttendancePendingContext = null;'), 'V5U6G1 retains max-one active flight context plus max-one latest pending context');
check(syncBlock.includes('_sameOfflineAttendanceSyncContext(requestedContext, _offlineAttendanceActiveContext)') && syncBlock.includes('_offlineAttendancePendingContext = requestedContext'), 'V5U6G1 same-context coalesces while different-context request is bounded/pending');
check(syncBlock.includes('_startOfflineAttendanceSyncFlight(pendingContext)') && syncBlock.includes('offlineSyncDifferentContextFollowups++'), 'V5U6G1 pending active context receives exactly one bounded follow-up path');
check(syncBlock.includes('break v2Dates') && syncBlock.includes('_isOfflineAttendanceSyncContextCurrent(syncContext)'), 'V5U6G1 stale flight cannot start later uncommitted chunks');
check(syncBlock.includes('offlineSyncStaleUiRefreshDropped++') && syncBlock.indexOf('_isOfflineAttendanceSyncContextCurrent(syncContext)') < syncBlock.indexOf("_requestAttendanceDailyRefresh('offline-sync-complete'"), 'V5U6G1 stale flight cannot refresh the new club Attendance UI');
check(pkg.scripts?.['check:attendance-offline-canonical-sync-guard'] === 'node tools/check-attendance-offline-canonical-sync-guard.mjs', 'package exposes the V5U6G1 canonical offline sync guard');

// ── Dashboard true-zero hydration reuses the existing probe ────────────────
const zeroProbeBlock = block(profiles, 'if (activeCount === 0 && _state.activeSnapshotCount === 1)', '// V5R: a document removed');
check(count(zeroProbeBlock, /_pG4k\s*\(/g) === 1, 'True-zero path reuses exactly the existing zero probe');
check(zeroProbeBlock.includes('if (!_probe.empty)') && zeroProbeBlock.includes("reason: 'active-profiles-zero-probe-empty'") && zeroProbeBlock.includes('coverageComplete: true'), 'Empty zero-probe closes Dashboard members hydration as complete active=0');
check(zeroProbeBlock.includes("activeCount: 0") && zeroProbeBlock.includes('activeAvailable: true'), 'True-zero evidence explicitly publishes active=0 as available');
check(zeroProbeBlock.includes("classification: 'profile-zero-probe-failed'"), 'Zero-probe failure remains incomplete and is observable');

// ── Profile fallback ownership ──────────────────────────────────────────────
const mountProfiles = block(profiles, 'export function mountActiveProfilesListener(context)', 'export function cleanupActiveProfilesListener');
const takeoverRemove = mountProfiles.indexOf("window.removeListener(emergencyFallbackKey, 'profiles-active-module-takeover')");
const activeRegister = mountProfiles.indexOf('window.safeRegisterSnapshot(');
check(mountProfiles.includes("const emergencyFallbackKey = 'global:profiles:' + clubId"), 'Active profile owner recognizes the Admin emergency full fallback key');
check(takeoverRemove >= 0 && activeRegister > takeoverRemove, 'Fallback is unsubscribed before active-module listener creation');
check(mountProfiles.includes('window.hasListener(emergencyFallbackKey)') && mountProfiles.includes('fallback-cleanup-verification-failed') && mountProfiles.includes('return false;'), 'Fallback takeover verifies cleanup and fails closed if verification fails');
const appFallback = block(app, '// [Phase 3.7B] Mount active-only realtime listener', '// Phase 4K-6V2 — Inventory History Pagination');
check(appFallback.includes("RoleReadBoundary?.isCoachAttendanceOnly?.() === true") && appFallback.indexOf("RoleReadBoundary?.isCoachAttendanceOnly?.() === true") < appFallback.indexOf('const _u_profiles = onSnapshot'), 'Coach can never enter the full-club profile fallback');
check(appFallback.includes("registerListener('global:profiles:' + clubId"), 'Admin emergency fallback remains registered in the existing listener registry for explicit takeover');

// ── Silent secondary/projection write closure ──────────────────────────────
const memberStatsBlock = block(attendanceService, 'async updateMemberStats(name, data)', '_increment(n)');
check(memberStatsBlock.includes('await updateDoc(') && !/catch\s*\(/.test(memberStatsBlock), 'Attendance derived stats service propagates failure to the existing caller');
check(attendance.includes("'attendance-member-stats-reconcile-required'") && attendance.includes('canonicalAttendancePreserved: true'), 'Attendance stats failure emits reconciliation diagnostic without rolling back canonical attendance');
check(app.includes("'inventory-payment-link-reconcile-required'") && students.includes("'inventory-payment-link-reconcile-required'"), 'Inventory payment linkage failure is observable in legacy and module admission paths');
check(app.includes("'fee-audit-write-failed'") && app.includes('canonicalPaymentPreserved: true'), 'Fee audit failure is observable and never invalidates successful payment');
check(app.includes("'attendance-note-notification-projection-failed'") && app.includes('canonicalSessionNotePreserved: true'), 'Session-note notification projection failure is observable while note remains canonical');
const multiItem = block(app, '// 5. Tạo 1 bundle transaction duy nhất', "if (typeof window.recordFinancialActionAudit === 'function') window.recordFinancialActionAudit('multiitem.pay'");
check(multiItem.includes('await Promise.all(invDebtIds.map(async function(id)') && multiItem.includes("'inventory-payment-link-reconcile-required'") && !multiItem.includes('setInterval('), 'Post-transaction inventory links cannot surface as false primary failure or start retry loops');

// ── No new runtime authority/read/polling budget ────────────────────────────
function walkJs(dir, out = []) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) {
            if (['migrations', 'diagnostics'].includes(e.name)) continue;
            walkJs(full, out);
        } else if (e.name.endsWith('.js')) out.push(full);
    }
    return out;
}
const runtimeFiles = [path.join(root, 'app.js'), ...walkJs(path.join(root, 'js'))];
const callPatterns = {
    getDoc: /(?<![A-Za-z0-9_$])(?:getDoc|_getDoc|fbGetDoc)\s*\(/g,
    getDocs: /(?<![A-Za-z0-9_$])(?:getDocs|_getDocs|fbGetDocs|_pG4k)\s*\(/g,
    onSnapshot: /(?<![A-Za-z0-9_$])(?:onSnapshot|fbOnSnapshot)\s*\(/g,
};
const readCounts = { getDoc: 0, getDocs: 0, onSnapshot: 0 };
let runtimeText = '';
for (const file of runtimeFiles) {
    const src = fs.readFileSync(file, 'utf8');
    runtimeText += '\n' + src;
    for (const line of src.split('\n')) {
        const t = line.trim();
        if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) continue;
        for (const [name, re] of Object.entries(callPatterns)) {
            re.lastIndex = 0;
            if (re.test(line)) readCounts[name]++;
        }
    }
}
check(readCounts.getDoc <= 31, `getDoc call-site budget unchanged (${readCounts.getDoc} <= 31)`);
check(readCounts.getDocs <= 56, `getDocs call-site budget unchanged (${readCounts.getDocs} <= 56)`);
check(readCounts.onSnapshot <= 16, `onSnapshot call-site budget unchanged (${readCounts.onSnapshot} <= 16)`);
const appWindowAssignments = count(app, /window\.[A-Za-z_$][A-Za-z0-9_$]*\s*=/g);
check(appWindowAssignments <= 534, `legacy app window assignment budget does not increase (${appWindowAssignments} <= 534)`);
const eventCalls = count(runtimeText, /\baddEventListener\s*\(/g);
const intervalCalls = count(runtimeText, /\bsetInterval\s*\(/g);
const timeoutCalls = count(runtimeText, /\bsetTimeout\s*\(/g);
check(eventCalls <= 115 && intervalCalls <= 1 && timeoutCalls <= 87, `event/timer call-sites do not increase (${eventCalls}/${intervalCalls}/${timeoutCalls})`);
check(!runtimeText.includes('GlobalAsyncManager') && !runtimeText.includes('FetchCoordinatorV2'), 'No generic global request manager was introduced');
check(!/queueWrite\s*\(/.test(runtimeText.replace(read('js/utils/offline-queue.js'), '')), 'Generic offline queue has no Attendance/business caller overlap');
check(main.includes("window.APP_BUILD_VERSION = '4K-6V5U6G1-attendance-offline-canonical-sync-closure-20260815'"), 'Exact V5U6G1 build version is active while V5U6G boundaries remain frozen');
check(index.includes('app.js?v=production-stability-residual-defect-closure-20260814-v5u6g') && index.includes('./js/main.js?v=attendance-offline-canonical-sync-closure-20260815-v5u6g1'), 'Only changed root runtime main.js receives the V5U6G1 cache-bust; unchanged app.js stays on V5U6G');
check(main.includes("./listeners/profiles.listeners.js?v=production-stability-residual-defect-closure-20260814-v5u6g") && main.includes("./modules/students.js?v=production-stability-residual-defect-closure-20260814-v5u6g") && main.includes("./modules/attendance.js?v=attendance-offline-canonical-sync-closure-20260815-v5u6g1") && attendance.includes("../services/attendance.service.js?v=attendance-offline-canonical-sync-closure-20260815-v5u6g1"), 'Changed Attendance modules are cache-busted; frozen Profiles/Students modules are not mass-busted');
check(pkg.scripts?.['check:production-residual-defect-closure'] === 'node tools/check-production-residual-defect-closure.mjs', 'package exposes the V5U6G master gate');

// ── Runtime Attendance offline test matrix (real module, fake service) ─────
class FakeClassList {
    constructor(...names) { this.names = new Set(names); }
    contains(name) { return this.names.has(name); }
    add(...names) { names.forEach((n) => this.names.add(n)); }
    remove(...names) { names.forEach((n) => this.names.delete(n)); }
}
class FakeElement {
    constructor(id) {
        this.id = id; this.value = ''; this.checked = false; this.disabled = false;
        this.innerHTML = ''; this.textContent = ''; this.dataset = {}; this.hidden = false;
        this.style = { display: '', removeProperty(name) { delete this[name]; } };
        this.classList = new FakeClassList();
    }
    addEventListener() {}
    querySelector() { return null; }
    querySelectorAll() { return []; }
    closest() { return null; }
}
const deferred = () => {
    let resolve, reject;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
};
const tick = () => new Promise((resolve) => setImmediate(resolve));
async function waitFor(predicate, label) {
    for (let i = 0; i < 100; i++) { if (predicate()) return; await tick(); }
    throw new Error('Timed out waiting for ' + label);
}
const getV2Entries = (storage) => Array.from(storage.entries())
    .filter(([key]) => key.startsWith('offline_att_v2_'))
    .map(([key, raw]) => [key, JSON.parse(raw)]);

try {
    const elements = new Map();
    const addEl = (id, value = '') => { const el = new FakeElement(id); el.value = value; elements.set(id, el); return el; };
    const tab = addEl('tab_attendance'); tab.classList.add('active', 'tab-content');
    const day = addEl('att_sub_day'); const month = addEl('att_sub_month'); month.style.display = 'none';
    const dateEl = addEl('att_date', '2026-08-14');
    const branchEl = addEl('att_branch', 'all'); const beltEl = addEl('att_belt', 'all');
    const shiftEl = addEl('att_shift', ''); const showAll = addEl('chk_show_all_att'); showAll.checked = true;
    ['attendanceGrid','attendanceSummary','admin_daily_branch_summary','admin_daily_branch_body','shiftModal','shiftList','shift_name','shift_start','shift_end','att_bulk_btn'].forEach((id) => addEl(id));

    globalThis.window = globalThis;
    globalThis.document = {
        getElementById: (id) => elements.get(id) || null,
        querySelector: (selector) => selector === '.tab-content.active' && tab.classList.contains('active') ? tab : null,
        querySelectorAll: () => [],
        createElement: () => new FakeElement('created'),
        body: { appendChild() {}, removeChild() {} },
    };
    const storage = new Map();
    globalThis.localStorage = {
        get length() { return storage.size; },
        key(i) { return Array.from(storage.keys())[i] || null; },
        getItem(key) { return storage.has(key) ? storage.get(key) : null; },
        setItem(key, value) { storage.set(key, String(value)); },
        removeItem(key) { storage.delete(key); },
    };
    const navigatorState = { onLine: true };
    Object.defineProperty(globalThis, 'navigator', { value: navigatorState, configurable: true });
    const onlineHandlers = [];
    globalThis.addEventListener = (type, fn) => { if (type === 'online') onlineHandlers.push(fn); };
    globalThis.innerWidth = 1024;
    globalThis.scrollTo = () => {};
    globalThis.showToast = () => {};
    globalThis.getLocalToday = () => '2026-08-14';
    globalThis.getBranchNameDisplay = (value) => value;
    globalThis.classifyProfileStatus = (profile) => profile?.status || 'active';
    globalThis.BranchIdentity = {
        normalize(value, options = {}) {
            const raw = String(value || '').trim();
            if (!raw) return Object.prototype.hasOwnProperty.call(options, 'fallback') ? options.fallback : 'CS1';
            if (/^(mặc định|mac dinh|default)$/i.test(raw)) return 'CS1';
            if (raw === 'all') return options.allowAll ? 'all' : (options.fallback ?? '');
            return /^CS\d+$/i.test(raw) ? raw.toUpperCase() : (options.fallback ?? '');
        },
        aliases(value) { return String(value) === 'CS1' ? ['CS1', 'Mặc định'] : [String(value)]; },
        isSameBranch(left, right) { return this.normalize(left, { fallback: '' }) === this.normalize(right, { fallback: '' }); },
    };
    const profilesMap = {
        Alice: { status: 'active', branch: 'CS1', belt: 'Đai Đen', trainingDays: [] },
        Bob: { status: 'active', branch: 'CS1', belt: 'Đai Xanh', trainingDays: [] },
        Carol: { status: 'active', branch: 'CS1', belt: 'Đai Vàng', trainingDays: [] },
    };
    globalThis.__store = { db: {}, clubId: 'club-a', currentClubId: 'club-a', userRole: 'admin', coachBranch: '', profiles: profilesMap, clubConfig: {}, clubData: {} };
    globalThis.currentClubId = 'club-a'; globalThis.userRole = 'admin'; globalThis.coachBranch = '';
    globalThis.__verifiedAuthContextState = { generation: 100 };
    globalThis._fb_init = {};
    const runtimeErrors = [];
    globalThis.recordRuntimeError = (source, err, extra) => runtimeErrors.push({ source, err, extra });

    const serviceUrl = pathToFileURL(path.join(root, 'js/services/attendance.service.js')).href + '?v=attendance-offline-canonical-sync-closure-20260815-v5u6g1';
    const { AttendanceService } = await import(serviceUrl);
    const realUpdateMemberStats = AttendanceService.updateMemberStats.bind(AttendanceService);
    let shiftImpl = async () => [];
    let dailyImpl = async () => [];
    let bulkSyncImpl = async () => {};
    let saveRecordImpl = async () => {};
    let deleteRecordImpl = async () => {};
    let bulkSaveImpl = async () => {};
    let bulkSyncCalls = 0, saveRecordCalls = 0, deleteRecordCalls = 0, bulkSaveCalls = 0;
    AttendanceService.loadShifts = (...args) => shiftImpl(...args);
    AttendanceService.loadByDate = (...args) => dailyImpl(...args);
    AttendanceService.loadCoachNotes = async () => [];
    AttendanceService.saveRecord = async (...args) => { saveRecordCalls++; return saveRecordImpl(...args); };
    AttendanceService.deleteRecord = async (...args) => { deleteRecordCalls++; return deleteRecordImpl(...args); };
    AttendanceService.bulkSaveRecords = async (...args) => { bulkSaveCalls++; return bulkSaveImpl(...args); };
    AttendanceService.bulkSyncOffline = async (...args) => { bulkSyncCalls++; return bulkSyncImpl(...args); };
    AttendanceService.saveShifts = async () => {};
    AttendanceService.updateMemberStats = async () => {};
    AttendanceService._increment = (n) => n;

    const registry = await import(pathToFileURL(path.join(root, 'js/core/globalOwnershipRegistry.js')).href);
    registry.initGlobalOwnershipRegistry();
    const attendanceModule = await import(pathToFileURL(path.join(root, 'js/modules/attendance.js')).href + `?v5u6g=${Date.now()}`);
    const api = attendanceModule.initAttendance();

    const reset = async ({ club = 'club-a', role = 'admin', coachBranch = '', shifts = [], online = true } = {}) => {
        storage.clear();
        navigatorState.onLine = online;
        globalThis.__store.clubId = club; globalThis.__store.currentClubId = club; globalThis.currentClubId = club;
        globalThis.__store.userRole = role; globalThis.userRole = role;
        globalThis.__store.coachBranch = coachBranch; globalThis.coachBranch = coachBranch;
        globalThis.__verifiedAuthContextState.generation++;
        dateEl.value = '2026-08-14'; branchEl.value = role === 'coach' ? coachBranch : 'all'; beltEl.value = 'all'; shiftEl.value = '';
        showAll.checked = true; day.style.display = ''; month.style.display = 'none'; tab.classList.add('active');
        shiftImpl = async () => shifts;
        dailyImpl = async () => [];
        bulkSyncImpl = async () => {};
        saveRecordImpl = async () => {};
        deleteRecordImpl = async () => {};
        bulkSaveImpl = async () => {};
        api.resetForClub(club);
        await api.ensureShiftsLoaded({ force: true });
    };
    const selectShift = async (id) => { shiftEl.value = id; await globalThis.onShiftChange(); };

    // A1 + A3: single shift, repeated same-profile toggles coalesce.
    await reset({ shifts: [{ id: 'morning', name: 'Ca sáng', branch: 'CS1' }], online: false });
    await selectShift('morning');
    await globalThis.toggleAttendance('Alice');
    let v2 = getV2Entries(storage);
    check(v2.length === 1 && v2[0][1].docId === 'Alice_2026-08-14_morning' && v2[0][1].status === 1, 'A1 single-shift offline queues exactly one Alice mutation');
    const firstQueuedAt = v2[0][1].queuedAt;
    await globalThis.toggleAttendance('Alice');
    await globalThis.toggleAttendance('Alice');
    v2 = getV2Entries(storage);
    check(v2.length === 1 && v2[0][1].status === 3 && v2[0][1].queuedAt === firstQueuedAt, 'A3 repeated Alice toggles coalesce to one latest journal record');

    // A2: Morning + Evening same date never collide.
    await selectShift('evening'); // currently invalid because config only morning → replace config via reset preserving concept below
    await reset({ shifts: [{ id: 'morning', name: 'Ca sáng', branch: 'CS1' }, { id: 'evening', name: 'Ca chiều', branch: 'CS1' }], online: false });
    await selectShift('morning'); await globalThis.toggleAttendance('Alice');
    await selectShift('evening'); await globalThis.toggleAttendance('Alice'); await globalThis.toggleAttendance('Alice');
    v2 = getV2Entries(storage);
    const docsA2 = new Set(v2.map(([, r]) => r.docId));
    check(v2.length === 2 && docsA2.has('Alice_2026-08-14_morning') && docsA2.has('Alice_2026-08-14_evening'), 'A2 Morning and Evening same-date mutations coexist without key collision');

    // A4: bulk queues only currently unmarked records.
    await reset({ shifts: [{ id: 'morning', name: 'Ca sáng', branch: 'CS1' }], online: false });
    await selectShift('morning');
    globalThis.currentAttendanceData.Alice = 1;
    globalThis.currentAttendanceData.Bob = 0;
    globalThis.currentAttendanceData.Carol = 1;
    await globalThis.bulkCheckIn();
    v2 = getV2Entries(storage);
    check(v2.length === 1 && v2[0][1].name === 'Bob', 'A4 bulk offline queues only changed/unmarked profiles');

    // A5: successful online write removes only its own pending mutation.
    await reset({ shifts: [{ id: 'morning', name: 'Ca sáng', branch: 'CS1' }, { id: 'evening', name: 'Ca chiều', branch: 'CS1' }], online: false });
    await selectShift('evening'); await globalThis.toggleAttendance('Bob');
    const unrelatedKey = getV2Entries(storage)[0][0];
    navigatorState.onLine = true;
    await selectShift('morning'); await globalThis.toggleAttendance('Alice');
    check(storage.has(unrelatedKey) && getV2Entries(storage).length === 1, 'A5 online success clears only its own mutation and preserves unrelated shift/profile pending data');

    // A6: failed online primary write leaves pending mutation intact.
    await reset({ shifts: [{ id: 'morning', name: 'Ca sáng', branch: 'CS1' }], online: true });
    await selectShift('morning');
    saveRecordImpl = async () => { throw Object.assign(new Error('network down'), { code: 'unavailable' }); };
    await globalThis.toggleAttendance('Alice');
    check(getV2Entries(storage).length === 1 && getV2Entries(storage)[0][1].name === 'Alice', 'A6 failed online attendance write preserves its pending mutation');

    // A7: cross-club queue is neither written nor deleted.
    await reset({ club: 'club-a', shifts: [], online: true });
    const foreign = { version: 2, clubId: 'club-b', date: '2026-08-14', month: '2026-08', branch: 'CS1', shiftMode: 'legacy-no-shift', shiftId: '', docId: 'Alice_2026-08-14', profileId: 'Alice', name: 'Alice', operation: 'set', status: 1, queuedAt: Date.now(), lastUpdatedAt: Date.now() };
    storage.set('offline_att_v2_club-b~2026-08-14~legacy-no-shift~Alice', JSON.stringify(foreign));
    const crossBefore = bulkSyncCalls;
    await globalThis.syncOfflineAttendance();
    check(storage.size === 1 && bulkSyncCalls === crossBefore, 'A7 cross-club pending queue is retained and never synced under another club');

    // A8: Coach wrong branch is blocked/pending.
    await reset({ club: 'club-a', role: 'coach', coachBranch: 'CS1', shifts: [{ id: 'evening', name: 'Ca chiều', branch: 'CS2' }], online: true });
    const wrongBranch = { ...foreign, clubId: 'club-a', branch: 'CS2', shiftMode: 'explicit-shift', shiftId: 'evening', docId: 'Alice_2026-08-14_evening' };
    storage.set('offline_att_v2_coach-wrong-branch', JSON.stringify(wrongBranch));
    const coachBefore = bulkSyncCalls;
    await globalThis.syncOfflineAttendance();
    check(storage.size === 1 && bulkSyncCalls === coachBefore, 'A8 Coach wrong-branch queued record fails closed and remains pending');

    // A9: deleted/nonexistent shift stays blocked/pending.
    await reset({ club: 'club-a', role: 'admin', shifts: [{ id: 'morning', name: 'Ca sáng', branch: 'CS1' }], online: true });
    const deletedShift = { ...foreign, clubId: 'club-a', shiftMode: 'explicit-shift', shiftId: 'deleted-evening', docId: 'Alice_2026-08-14_deleted-evening' };
    storage.set('offline_att_v2_deleted-shift', JSON.stringify(deletedShift));
    const deletedBefore = bulkSyncCalls;
    await globalThis.syncOfflineAttendance();
    check(storage.size === 1 && bulkSyncCalls === deletedBefore, 'A9 deleted shift cannot sync and pending mutation is preserved');

    // A10: legacy no-shift club writes a V2 legacy-no-shift journal record.
    await reset({ shifts: [], online: false });
    await api.requestDailyRefresh('a10-legacy', { force: true });
    await globalThis.toggleAttendance('Alice');
    v2 = getV2Entries(storage);
    check(v2.length === 1 && v2[0][1].shiftMode === 'legacy-no-shift' && v2[0][1].shiftId === '' && v2[0][1].docId === 'Alice_2026-08-14', 'A10 true legacy no-shift club uses V2 journal without inventing a shift');

    // A11: V1 payload compatibility syncs once and deletes only after success.
    await reset({ shifts: [], online: true });
    const legacyKey = 'offline_att_club-a_2026-08-14';
    storage.set(legacyKey, JSON.stringify({ clubId: 'club-a', date: '2026-08-14', records: { Alice: { name: 'Alice', profileId: 'Alice', date: '2026-08-14', month: '2026-08', branch: 'CS1', status: 1 } } }));
    const legacyBefore = bulkSyncCalls;
    await globalThis.syncOfflineAttendance();
    check(!storage.has(legacyKey) && bulkSyncCalls === legacyBefore + 1, 'A11 legacy V1 payload syncs once and is removed only after successful commit');
    storage.set(legacyKey, JSON.stringify({ clubId: 'club-a', date: '2026-08-14', records: { Alice: { name: 'Alice', profileId: 'Alice', date: '2026-08-14', month: '2026-08', branch: 'CS1', status: 1 } } }));
    bulkSyncImpl = async () => { throw new Error('legacy commit failed'); };
    await globalThis.syncOfflineAttendance();
    check(storage.has(legacyKey), 'A11 failed V1 compatibility commit preserves legacy queue key');

    // A12: concurrent startup/manual/online-style triggers reuse one Promise flight.
    await reset({ shifts: [], online: true });
    const v2LatchRecord = { ...foreign, clubId: 'club-a' };
    storage.set('offline_att_v2_single-flight', JSON.stringify(v2LatchRecord));
    const latch = deferred();
    bulkSyncImpl = () => latch.promise;
    const sfBefore = bulkSyncCalls;
    const p1 = globalThis.syncOfflineAttendance();
    const p2 = globalThis.syncOfflineAttendance();
    const p3 = onlineHandlers.length ? onlineHandlers[0]() : globalThis.syncOfflineAttendance();
    check(p1 === p2 && p2 === p3, 'A12 all concurrent Attendance sync triggers receive the same Promise latch');
    await waitFor(() => bulkSyncCalls === sfBefore + 1, 'one offline sync service call');
    check(bulkSyncCalls === sfBefore + 1, 'A12 concurrent sync triggers perform exactly one canonical sync flight');
    latch.resolve(); await Promise.all([p1, p2, p3]);

    // Silent failure runtime evidence: derived stats service rejects to caller.
    let statsRejected = false;
    const oldSdk = globalThis._fb_init;
    globalThis._fb_init = { doc: () => ({}), updateDoc: async () => { throw new Error('stats fail'); } };
    try { await realUpdateMemberStats('Alice', { totalSessionsAttended: 1 }); } catch { statsRejected = true; }
    globalThis._fb_init = oldSdk;
    check(statsRejected, 'Silent-failure matrix: attendance derived stats rejection is observable to caller');

} catch (error) {
    check(false, 'Attendance V2 runtime matrix executed without harness failure', error?.stack || error?.message || String(error));
}

console.log(`\nTotal: ${passes.length + failures.length} | PASS: ${passes.length} | FAIL: ${failures.length}`);
if (failures.length) {
    console.error('\nV5U6G residual closure gate FAILED:');
    failures.forEach(({ message, detail }) => console.error(' -', message, detail || ''));
    process.exit(1);
}
console.log('Phase 4K-6V5U6G residual defect closure gate passed.\n');
