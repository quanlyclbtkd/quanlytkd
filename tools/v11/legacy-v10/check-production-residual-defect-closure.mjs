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
const financeService = read('js/services/finance.service.js');
const financeModule = read('js/modules/finance.js');
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
check(cleanupOffline.includes('const key = _attendanceOfflineMutationKey(record)') &&
    cleanupOffline.includes('localStorage.getItem(key) !== expectedRaw') &&
    cleanupOffline.includes('typeof expectedRaw') &&
    cleanupOffline.includes('localStorage.removeItem(key)') &&
    !cleanupOffline.includes('current?.revision'),
    'C01 scoped cleanup requires canonical key and exact queued raw (revision equality is insufficient)');
check(!attendance.includes("localStorage.removeItem('offline_att_' +") && !attendance.includes('finally {\n            localStorage.removeItem'), 'No whole-day offline cleanup remains');
check(bulkBlock.includes('onChunkCommitted') && bulkBlock.includes('_removeAttOfflineMutation') && bulkBlock.includes('committedIds'), 'Bulk cleanup is scoped to each successfully committed chunk');
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

// ── D1C3B Dashboard true-zero hydration comes from the Admin full snapshot ──
const adminAuthorityBlock = block(profiles, '// D1C3B Admin authority:', "window.scheduleAutomaticDebtProfileCoverage('full-profiles-authoritative-snapshot')");
const coachBranchOwnerBlock = block(profiles, 'export function mountActiveProfilesListener(context)', 'export function cleanupActiveProfilesListener');
check(!/_pG4k\s*\(|fbGetDocs\s*\(/.test(adminAuthorityBlock), 'Admin true-zero hydration uses the full snapshot itself with zero probe/read');
check(adminAuthorityBlock.includes('_state.activeSnapshotCount === 1') && adminAuthorityBlock.includes('coverageComplete: true'), 'Initial Admin full snapshot closes Dashboard members hydration as complete even at zero profiles');
check(adminAuthorityBlock.includes('activeCount,') && adminAuthorityBlock.includes('activeAvailable: true') && adminAuthorityBlock.includes('_state.fullAuthorityComplete = true'), 'Full authoritative evidence publishes active count availability and completeness');
check(!coachBranchOwnerBlock.includes('profiles.activeZeroProbe') && coachBranchOwnerBlock.includes("fbQuery(profRef, fbWhere('branch', '==', coachBranch))") && profiles.includes("_coachRosterReadiness() === 'verified'"), 'Coach branch-complete server roster has no obsolete zero-probe and fallback stays within existing scoped owner');

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
check(app.includes("'inventory-payment-link-reconcile-required'")
    && students.includes('paymentBundleId: feePlan.ref.id')
    && students.includes('paidTxId: feePlan.ref.id')
    && students.includes('batch.set(inventoryPlan.itemRef, inventoryPlan.payload)')
    && students.includes('batch.set(feePlan.ref, feePlan.payload)')
    && students.includes('await batch.commit();')
    && !students.includes('await StudentService.updateInventoryDoc(_invId'),
    'Module admission links inventory and payment in one batch; legacy linkage failure stays observable');
check(financeService.includes("classification: 'fee-audit-write-failed'") && financeService.includes('canonicalPaymentPreserved: true') && financeService.includes("recordRuntimeError?.('secondary-consistency:'") && financeModule.includes('FinanceService.addFeeAuditSilent'), 'Fee audit failure is observable and never invalidates successful payment');
check(app.includes("'attendance-note-notification-projection-failed'") && app.includes('canonicalSessionNotePreserved: true'), 'Session-note notification projection failure is observable while note remains canonical');
const multiItem = block(app, 'window.processMultiItem = async (action) =>', '// ─── Setup currency inputs');
check(multiItem.includes("_batch.update(doc(db, 'clubs', currentClubId, 'inventory', id)") && multiItem.includes('paidTxId: _bundleDocRef.id') && multiItem.includes('_batch.set(_bundleDocRef') && !multiItem.includes('setInterval('), 'Inventory debt/payment links commit in the same canonical multi-item batch, with no retry loop');

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
// H6 reconciliation: H5 intentionally added one bounded listener-registry readiness
// barrier (2 once:true event listeners + 1 bounded timeout). Freeze that exact
// approved delta structurally while keeping the historical runtime outside the
// readiness block at or below its pre-H5 budget.
const readinessBlock = block(app, 'const _waitForListenerRegistryReady = () => {', 'const _commitClubAccessBootstrapState =');
const readinessEventCalls = count(readinessBlock, /\baddEventListener\s*\(/g);
const readinessIntervalCalls = count(readinessBlock, /\bsetInterval\s*\(/g);
const readinessTimeoutCalls = count(readinessBlock, /\bsetTimeout\s*\(/g);
const outsideReadinessText = runtimeText.replace(readinessBlock, '');
const outsideEventCalls = count(outsideReadinessText, /\baddEventListener\s*\(/g);
const outsideIntervalCalls = count(outsideReadinessText, /\bsetInterval\s*\(/g);
const outsideTimeoutCalls = count(outsideReadinessText, /\bsetTimeout\s*\(/g);
check(
    readinessEventCalls === 2 &&
    readinessBlock.includes("window.addEventListener('app:listener-registry-ready', onReady, { once: true })") &&
    readinessBlock.includes("window.addEventListener('app:listener-registry-failed', onFailed, { once: true })"),
    `H5 readiness barrier owns exactly two once:true registry event listeners (${readinessEventCalls})`
);
check(
    readinessTimeoutCalls === 1 &&
    /const _LISTENER_REGISTRY_READY_TIMEOUT_MS = 10000;/.test(app) &&
    /setTimeout\([^;]*_LISTENER_REGISTRY_READY_TIMEOUT_MS\)/s.test(readinessBlock),
    `H5 readiness barrier owns exactly one bounded 10s timeout (${readinessTimeoutCalls})`
);
check(
    readinessIntervalCalls === 0 &&
    !/\b(?:getDoc|getDocs|onSnapshot)\s*\(/.test(readinessBlock) &&
    count(readinessBlock, /_waitForListenerRegistryReady\s*\(/g) === 0,
    'H5 readiness barrier has no polling, Firestore wait, or recursive retry'
);
check(
    outsideEventCalls <= 115 && outsideIntervalCalls <= 1 && outsideTimeoutCalls <= 86 &&
    eventCalls <= 117 && intervalCalls <= 1 && timeoutCalls <= 87,
    `event/timer freeze allows only approved H5 readiness delta (total ${eventCalls}/${intervalCalls}/${timeoutCalls}; outside ${outsideEventCalls}/${outsideIntervalCalls}/${outsideTimeoutCalls})`
);
check(!runtimeText.includes('GlobalAsyncManager') && !runtimeText.includes('FetchCoordinatorV2'), 'No generic global request manager was introduced');
check(!/queueWrite\s*\(/.test(runtimeText.replace(read('js/utils/offline-queue.js'), '')), 'Generic offline queue has no Attendance/business caller overlap');
check(main.includes("window.APP_BUILD_VERSION = '4K-6V5U6G1-attendance-offline-canonical-sync-closure-20260815'"), 'Exact V5U6G1 build version is active while V5U6G boundaries remain frozen');
check(index.includes('app.js?v=production-stability-residual-defect-closure-20260814-v5u6g') && index.includes('./js/main.js?v=attendance-offline-canonical-sync-closure-20260815-v5u6g1'), 'Only changed root runtime main.js receives the V5U6G1 cache-bust; unchanged app.js stays on V5U6G');
const r1CacheSlug = 'profile-display-name-safe-edit-20260916-v5u6h8r1';
const v5u6gFrozenCacheScope =
    main.includes("./listeners/profiles.listeners.js?v=production-stability-residual-defect-closure-20260814-v5u6g") &&
    main.includes("./modules/students.js?v=production-stability-residual-defect-closure-20260814-v5u6g") &&
    main.includes("./modules/attendance.js?v=attendance-offline-canonical-sync-closure-20260815-v5u6g1") &&
    attendance.includes("../services/attendance.service.js?v=attendance-offline-canonical-sync-closure-20260815-v5u6g1");
const h8r1DisplayNameCacheScope =
    main.includes("./listeners/profiles.listeners.js?v=production-stability-residual-defect-closure-20260814-v5u6g") &&
    main.includes(`./modules/students.js?v=${r1CacheSlug}`) &&
    main.includes(`./modules/attendance.js?v=${r1CacheSlug}`) &&
    attendance.includes("../services/attendance.service.js?v=attendance-offline-canonical-sync-closure-20260815-v5u6g1");
const r2CacheSlug = 'long-term-production-stability-20260917-v5u6h8r2';
const h8r2StabilityCacheScope =
    main.includes(`./listeners/profiles.listeners.js?v=${r2CacheSlug}`) &&
    main.includes(`./modules/students.js?v=${r1CacheSlug}`) &&
    main.includes(`./modules/attendance.js?v=${r2CacheSlug}`) &&
    attendance.includes(`../services/attendance.service.js?v=${r2CacheSlug}`);
const r21CacheSlug = 'residual-financial-cache-correctness-20260917-v5u6h8r2_1';
const h8r21ResidualCacheScope =
    main.includes(`./listeners/profiles.listeners.js?v=${r21CacheSlug}`) &&
    main.includes(`./modules/students.js?v=${r1CacheSlug}`) &&
    main.includes(`./modules/attendance.js?v=${r21CacheSlug}`) &&
    attendance.includes(`../services/attendance.service.js?v=${r21CacheSlug}`);
const v9AttendanceCacheScope =
    /s\.src\s*=\s*'\.\/js\/main\.js\?v=qr-v9-attendance-rules-20261020'/.test(index) &&
    /import \{ initAttendance \}\s+from '\.\/modules\/attendance\.js\?v=qr-v9-attendance-rules-20261020'/.test(main) &&
    /import \{ AttendanceService \} from '\.\.\/services\/attendance\.service\.js\?v=qr-v9-attendance-rules-20261020'/.test(attendance);
const v10CoachContextCacheScope =
    /s\.src\s*=\s*'\.\/js\/main\.js\?v=coach-roster-context-v10-20261020'/.test(index) &&
    /from '\.\/listeners\/profiles\.listeners\.js\?v=coach-roster-context-v10-20261020'/.test(main) &&
    /import \{ initAttendance \}\s+from '\.\/modules\/attendance\.js\?v=coach-roster-context-v10-20261020'/.test(main) &&
    /import \{ AttendanceService \} from '\.\.\/services\/attendance\.service\.js\?v=qr-v9-attendance-rules-20261020'/.test(attendance);
check(v5u6gFrozenCacheScope || h8r1DisplayNameCacheScope || h8r2StabilityCacheScope || h8r21ResidualCacheScope || v9AttendanceCacheScope || v10CoachContextCacheScope, 'Changed modules are cache-busted only within the active phase scope');
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
    // Test-only observation of actual runtime classification; never derive permissions
    // from these diagnostics. Distinguish scope guards from malformed-key guards.
    const observedOfflineIssues = [];
    const originalConsoleWarn = console.warn;
    console.warn = (...args) => {
        if (args[0] === '[AttendanceOffline]') {
            observedOfflineIssues.push({ reason: String(args[1]), stage: String(args[2]?.stage || '') });
        }
        originalConsoleWarn(...args);
    };
    const issueAt = () => observedOfflineIssues.length;
    const observedSince = (offset, reason, stage) =>
        observedOfflineIssues.slice(offset).some((entry) => entry.reason === reason && entry.stage === stage);
    const keyForV2 = (record) => 'offline_att_v2_' + [
        record.clubId, record.date,
        record.shiftMode === 'explicit-shift' ? record.shiftId : 'legacy-no-shift',
        record.docId,
    ].map((value) => encodeURIComponent(String(value))).join('~');
    const putV2 = (record) => {
        const key = keyForV2(record);
        storage.set(key, JSON.stringify(record));
        return key;
    };
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
    globalThis.__verifiedAuthContextState = {
        ready: true, uid: 'uid-club-a', clubId: 'club-a', role: 'admin',
        coachBranch: '', generation: 100,
    };
    const roleHolder = {};
    (await import('node:vm')).runInNewContext(read('js/core/roleReadBoundary.js'), { window: roleHolder });
    globalThis.RoleReadBoundary = { normalizeRole: roleHolder.RoleReadBoundary.normalizeRole,
        isCoachAttendanceOnly: () => globalThis.userRole === 'coach', canMount: () => true };

    globalThis._fb_init = {};
    const runtimeErrors = [];
    globalThis.recordRuntimeError = (source, err, extra) => runtimeErrors.push({ source, err, extra });

    const serviceUrl = new URL(read('js/modules/attendance.js').match(/import \{ AttendanceService \} from '([^']+)'/)[1], pathToFileURL(path.join(root, 'js/modules/attendance.js'))).href;
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
        Object.assign(globalThis.__verifiedAuthContextState, {
            ready: true, uid: 'uid-' + club, role, clubId: club, coachBranch,
            generation: Number(globalThis.__verifiedAuthContextState.generation || 0) + 1,
        });
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

    // C02/C05: the actual online toggle uses one service ACK and cannot clear
    // another date/shift's pending mutation. The prior A5 already exercises this.
    await reset({ shifts: [{ id: 'morning', name: 'Ca sáng', branch: 'CS1' }], online: true });
    await selectShift('morning');
    const onlineBefore = saveRecordCalls;
    await globalThis.toggleAttendance('Alice');
    check(saveRecordCalls === onlineBefore + 1 && getV2Entries(storage).length === 0,
        'C02 online single successful ACK cleans exact matching journal through real toggle');

    // C03: an outstanding SDK Promise cannot authorize cleanup before its ACK.
    await reset({ shifts: [{ id: 'morning', name: 'Ca sáng', branch: 'CS1' }], online: true });
    await selectShift('morning');
    const c03 = deferred();
    saveRecordImpl = () => c03.promise;
    const callsC03 = saveRecordCalls;
    const pendingC03 = globalThis.toggleAttendance('Alice');
    try {
        await waitFor(() => saveRecordCalls > callsC03, 'C03 online single writer submission');
        check(getV2Entries(storage).length === 1 && saveRecordCalls === callsC03 + 1,
            'C03 while writer is pending, journal is not removed by UI handler');
    } finally {
        c03.reject(Object.assign(new Error('test-only deny'), { code: 'permission-denied' }));
        await Promise.allSettled([pendingC03]);
    }
    check(getV2Entries(storage).length === 1,
        'C03 rejected online single writer leaves original raw journal pending');

    // C04: two writers can generate equal revision with distinct raw values.
    // The older ACK must not remove the latest raw, even if revision is equal.
    await reset({ shifts: [{ id: 'morning', name: 'Ca sáng', branch: 'CS1' }], online: true });
    await selectShift('morning');
    const c04 = deferred();
    saveRecordImpl = () => c04.promise;
    const callsC04 = saveRecordCalls;
    const pendingC04 = globalThis.toggleAttendance('Alice');
    let newerKey = '', newerRaw = '';
    try {
        await waitFor(() => saveRecordCalls > callsC04, 'C04 pending writer');
        const [[key, record]] = getV2Entries(storage);
        newerKey = key;
        newerRaw = JSON.stringify({ ...record, status: 2, lastUpdatedAt: Number(record.lastUpdatedAt) + 1 });
        check(JSON.parse(newerRaw).revision === record.revision && newerRaw !== storage.get(key),
            'C04 equal-revision raw replacement is a distinct journal intent');
        storage.set(key, newerRaw);
    } finally {
        c04.resolve({ committed: 1 });
        await Promise.allSettled([pendingC04]);
    }
    check(storage.get(newerKey) === newerRaw && saveRecordCalls === callsC04 + 1,
        'C04 ACK of older raw cannot delete newly enqueued equal-revision raw');

    // C06: current-session switch after submission forbids stale ACK cleanup.
    await reset({ shifts: [{ id: 'morning', name: 'Ca sáng', branch: 'CS1' }], online: true });
    await selectShift('morning');
    const c06 = deferred();
    saveRecordImpl = () => c06.promise;
    const callsC06 = saveRecordCalls;
    const pendingC06 = globalThis.toggleAttendance('Alice');
    let preservedC06 = null;
    try {
        await waitFor(() => saveRecordCalls > callsC06, 'C06 submitted prior owner');
        preservedC06 = getV2Entries(storage)[0]?.[0];
        globalThis.__verifiedAuthContextState.uid = 'different-uid';
    } finally {
        c06.resolve({ committed: 1 });
        await Promise.allSettled([pendingC06]);
    }
    check(storage.has(preservedC06) && saveRecordCalls === callsC06 + 1,
        'C06 stale UID cannot cleanup old journal or send another canonical writer');

    // C07: cleanup storage access failure after canonical ACK preserves pending raw.
    await reset({ shifts: [{ id: 'morning', name: 'Ca sáng', branch: 'CS1' }], online: true });
    await selectShift('morning');
    const c07 = deferred();
    saveRecordImpl = () => c07.promise;
    const callsC07 = saveRecordCalls;
    const pendingC07 = globalThis.toggleAttendance('Alice');
    let rawC07, keyC07;
    const originalGet = globalThis.localStorage.getItem;
    try {
        await waitFor(() => saveRecordCalls > callsC07, 'C07 queued journal before ACK');
        [[keyC07, rawC07]] = Array.from(storage.entries());
        globalThis.localStorage.getItem = (key) => {
            if (key === keyC07) throw Error('test-only storage getItem failure');
            return originalGet.call(globalThis.localStorage, key);
        };
        c07.resolve({ committed: 1 });
        await Promise.allSettled([pendingC07]);
    } finally {
        globalThis.localStorage.getItem = originalGet;
        c07.resolve({ committed: 1 });
    }
    check(storage.get(keyC07) === rawC07 && saveRecordCalls === callsC07 + 1,
        'C07 localStorage getItem throw during cleanup never blindly removes journal');

    // C06 variants: Admin club/role/generation are authoritative scalar changes.
    // Coach branch transitions are covered by the existing verified-Coach role gate;
    // changing coachBranch for an Admin is not a change to an assigned Coach scope.
    for (const [label, changed] of [
        ['club', { clubId: 'club-other' }],
        ['role', { role: 'coach' }],
        ['generation', { generation: 999999 }],
    ]) {
        await reset({ shifts: [{ id: 'morning', name: 'Ca sáng', branch: 'CS1' }], online: true });
        await selectShift('morning');
        const gate = deferred();
        saveRecordImpl = () => gate.promise;
        const countBefore = saveRecordCalls;
        const task = globalThis.toggleAttendance('Alice');
        let oldKey;
        try {
            await waitFor(() => saveRecordCalls > countBefore, 'C06 ' + label + ' writer');
            oldKey = getV2Entries(storage)[0][0];
            Object.assign(globalThis.__verifiedAuthContextState, changed);
        } finally {
            gate.resolve({ committed: 1 });
            await Promise.allSettled([task]);
        }
        check(storage.has(oldKey) && saveRecordCalls === countBefore + 1,
            'C06 stale ' + label + ' principal does not erase journal after ACK');
    }

    // C07 negative: removeItem failure after ACK is cleanup-deferred, not blind deletion.
    await reset({ shifts: [{ id: 'morning', name: 'Ca sáng', branch: 'CS1' }], online: true });
    await selectShift('morning');
    const gateRemove = deferred();
    saveRecordImpl = () => gateRemove.promise;
    const countRemove = saveRecordCalls;
    const taskRemove = globalThis.toggleAttendance('Alice');
    const originalRemove = globalThis.localStorage.removeItem;
    let removeKey, removeRaw;
    try {
        await waitFor(() => saveRecordCalls > countRemove, 'C07 removeItem writer');
        [[removeKey, removeRaw]] = Array.from(storage.entries());
        globalThis.localStorage.removeItem = (key) => {
            if (key === removeKey) throw new Error('test-only removeItem failure');
            return originalRemove.call(globalThis.localStorage, key);
        };
        gateRemove.resolve({ committed: 1 });
        await Promise.allSettled([taskRemove]);
    } finally {
        globalThis.localStorage.removeItem = originalRemove;
        gateRemove.resolve({ committed: 1 });
    }
    check(storage.get(removeKey) === removeRaw && saveRecordCalls === countRemove + 1,
        'C07 failed removeItem after ACK leaves exact journal pending');

    // C08: actual bulk callback cleans only the ACKed portion of a partial batch.
    await reset({ shifts: [{ id: 'morning', name: 'Ca sáng', branch: 'CS1' }], online: true });
    await selectShift('morning');
    const beforeC08 = bulkSaveCalls;
    bulkSaveImpl = async (rows, options) => {
        options.onChunkCommitted(rows.slice(0, 1));
        throw Object.assign(new Error('test-only partially committed batch'), {
            code: 'unavailable', committedIds: [rows[0].docId], committed: 1,
        });
    };
    await globalThis.bulkCheckIn();
    const remainingC08 = getV2Entries(storage);
    check(bulkSaveCalls === beforeC08 + 1 && remainingC08.length === 2 &&
        !remainingC08.some(([, row]) => row.name === 'Alice') &&
        remainingC08.some(([, row]) => row.name === 'Bob') &&
        remainingC08.some(([, row]) => row.name === 'Carol'),
        'C08 partial bulk ACK only cleans committed ID; uncommitted journal remains');

    // A7: canonical foreign-club key + payload must be recognized at club-scope.
    await reset({ club: 'club-a', shifts: [], online: true });
    const foreign = { version: 2, clubId: 'club-b', date: '2026-08-14', month: '2026-08', branch: 'CS1', shiftMode: 'legacy-no-shift', shiftId: '', docId: 'Alice_2026-08-14', profileId: 'Alice', name: 'Alice', operation: 'set', status: 1, queuedAt: Date.now(), lastUpdatedAt: Date.now() };
    const foreignKey = putV2(foreign);
    const crossBefore = bulkSyncCalls, foreignIssues = issueAt();
    await globalThis.syncOfflineAttendance();
    check(storage.get(foreignKey) === JSON.stringify(foreign) && bulkSyncCalls === crossBefore &&
        observedSince(foreignIssues, 'wrong-club', 'club-scope-v2') &&
        !observedSince(foreignIssues, 'malformed-payload', 'v2-key-or-club-mismatch'),
        'A7 canonical foreign-club journal is ignored/preserved by actual club-scope guard');

    // A7 positive counterpart: foreign key must not block independently valid club-a V2.
    const ownA7 = { ...foreign, clubId: 'club-a', docId: 'Bob_2026-08-14', name: 'Bob', profileId: 'Bob' };
    const ownA7Key = putV2(ownA7);
    const ownCalls = bulkSyncCalls;
    await globalThis.syncOfflineAttendance();
    check(bulkSyncCalls === ownCalls + 1 && !storage.has(ownA7Key) && storage.has(foreignKey),
        'A7 foreign-club record does not block same-device current-club journal ACK');

    // A8: canonical Coach CS2 key must reach branch authorization, not parse error.
    await reset({ club: 'club-a', role: 'coach', coachBranch: 'CS1', shifts: [{ id: 'evening', name: 'Ca chiều', branch: 'CS2' }], online: true });
    const wrongBranch = { ...foreign, clubId: 'club-a', branch: 'CS2', shiftMode: 'explicit-shift', shiftId: 'evening', docId: 'Alice_2026-08-14_evening' };
    const wrongKey = putV2(wrongBranch);
    const coachBefore = bulkSyncCalls, coachIssues = issueAt();
    await globalThis.syncOfflineAttendance();
    check(storage.get(wrongKey) === JSON.stringify(wrongBranch) && bulkSyncCalls === coachBefore &&
        observedSince(coachIssues, 'wrong-branch', 'v2-guard') &&
        !observedSince(coachIssues, 'malformed-payload', 'v2-key-or-club-mismatch'),
        'A8 canonical wrong-branch Coach journal rejected at branch guard (not malformed key)');

    // A9: valid key with deleted/nonexistent shift must reach shift validator.
    await reset({ club: 'club-a', role: 'admin', shifts: [{ id: 'morning', name: 'Ca sáng', branch: 'CS1' }], online: true });
    const deletedShift = { ...foreign, clubId: 'club-a', shiftMode: 'explicit-shift', shiftId: 'deleted-evening', docId: 'Alice_2026-08-14_deleted-evening' };
    const deletedKey = putV2(deletedShift);
    const deletedBefore = bulkSyncCalls, deletedIssues = issueAt();
    await globalThis.syncOfflineAttendance();
    check(storage.get(deletedKey) === JSON.stringify(deletedShift) && bulkSyncCalls === deletedBefore &&
        observedSince(deletedIssues, 'invalid-shift', 'v2-guard') &&
        !observedSince(deletedIssues, 'malformed-payload', 'v2-key-or-club-mismatch'),
        'A9 canonical journal with deleted shift fails at existing shift validator');

    // N01: malformed key remains denied for its own reason (not counted as A7–A9).
    await reset({ club: 'club-a', shifts: [], online: true });
    const negativeKey = 'offline_att_v2_legacy-malformed-key';
    const negative = { ...foreign, clubId: 'club-a' };
    storage.set(negativeKey, JSON.stringify(negative));
    const negativeBefore = bulkSyncCalls, negativeIssues = issueAt();
    await globalThis.syncOfflineAttendance();
    check(storage.get(negativeKey) === JSON.stringify(negative) && bulkSyncCalls === negativeBefore &&
        observedSince(negativeIssues, 'malformed-payload', 'v2-key-or-club-mismatch'),
        'N01 malformed V2 key is separately rejected at mismatch stage');

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

    // A12: canonical V2 entry reaches REAL sync owner and holds one service ACK.
    await reset({ shifts: [], online: true });
    const v2LatchRecord = { ...foreign, clubId: 'club-a' };
    const latchKey = putV2(v2LatchRecord);
    const latch = deferred();
    bulkSyncImpl = (...args) => latch.promise;
    const sfBefore = bulkSyncCalls;
    let p1, p2, p3;
    try {
        p1 = globalThis.syncOfflineAttendance();
        p2 = globalThis.syncOfflineAttendance();
        p3 = onlineHandlers.length ? onlineHandlers[0]() : globalThis.syncOfflineAttendance();
        check(p1 === p2 && p2 === p3, 'A12 same-session manual/manual/online requests share one Promise identity');
        await waitFor(() => bulkSyncCalls > sfBefore, 'one actual offline sync service call');
        check(bulkSyncCalls === sfBefore + 1 && storage.has(latchKey),
            'A12 precisely one canonical service call while ACK is pending; no early cleanup');
    } catch (err) {
        check(false, 'A12 service ACK latch reached with canonical journal', err?.message || String(err));
    } finally {
        // Always settle the existing flight, even if a pre-ACK assertion fails.
        latch.resolve();
        await Promise.allSettled([p1, p2, p3].filter(Boolean));
    }
    check(bulkSyncCalls === sfBefore + 1 && !storage.has(latchKey),
        'A12 confirmed ACK removes only the exact matched journal');
    const repeatBefore = bulkSyncCalls;
    await globalThis.syncOfflineAttendance();
    check(bulkSyncCalls === repeatBefore,
        'A12 repeated manual sync after confirmed cleanup does not resubmit');

    // A12 negative: reject must not clear journal or start an extra service lane.
    await reset({ shifts: [], online: true });
    const rejected = { ...v2LatchRecord, queuedAt: Date.now() + 1 };
    const rejectedKey = putV2(rejected);
    const rejectedLatch = deferred();
    bulkSyncImpl = () => rejectedLatch.promise;
    const rejectBefore = bulkSyncCalls;
    const rejectedFlight = globalThis.syncOfflineAttendance();
    try {
        await waitFor(() => bulkSyncCalls > rejectBefore, 'rejected offline service call');
        check(bulkSyncCalls === rejectBefore + 1 && storage.has(rejectedKey),
            'A12 rejected writer waits with raw journal unchanged');
    } finally {
        rejectedLatch.reject(Object.assign(new Error('fixture permission-denied'), { code: 'permission-denied' }));
        await Promise.allSettled([rejectedFlight]);
    }
    check(storage.has(rejectedKey) && bulkSyncCalls === rejectBefore + 1,
        'A12 rejected/unknown ACK preserves journal without duplicate service call');

    // Silent failure must be executed even if A12 assertions fail.
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
