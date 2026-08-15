#!/usr/bin/env node
/**
 * Phase 4K-6V5U6D — Attendance Daily Single Refresh Authority
 *
 * Static ownership assertions plus isolated runtime races. This gate stubs the
 * AttendanceService object, so it performs no Firestore or network operation.
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const attendance = read('js/modules/attendance.js');
const service = read('js/services/attendance.service.js');
const events = read('js/events/attendance.events.js');
const islands = read('js/ui/render/renderAttendance.js');
const profiles = read('js/listeners/profiles.listeners.js');
const attendanceListeners = read('js/listeners/attendance.listeners.js');
const app = read('app.js');
const main = read('js/main.js');
const index = read('index.html');
const pkg = JSON.parse(read('package.json'));

const passes = [];
const failures = [];
const check = (condition, message) => (condition ? passes : failures).push(message);
const count = (source, pattern) => (source.match(pattern) || []).length;

console.log('\n🔎 Phase 4K-6V5U6D — Attendance Daily Single Refresh Authority\n');

// ── Static authority / isolation contracts ────────────────────────────
check(attendance.includes('async function _requestAttendanceDailyRefresh('), 'one canonical daily refresh orchestrator is declared');
check(count(attendance, /AttendanceService\.loadByDate\s*\(/g) === 1, 'loadByDate is called exactly once inside the canonical module path');
check(/window\.renderAttendanceList\s*=\s*async[\s\S]{0,180}_requestAttendanceDailyRefresh/.test(attendance), 'renderAttendanceList delegates to the canonical orchestrator');
check(attendance.includes('const _attendanceDailyState = {') && attendance.includes('inFlight: new Map()'), 'daily owner keeps module-local single-flight state');
check(attendance.includes('_attendanceDailyState.inFlight.get(context.key)') && attendance.includes('_sameAttendanceContext(running.token, token)') && attendance.includes('dailySingleFlightCoalesced++'), 'same-key/same-auth daily requests reuse one running flight');
check(attendance.includes('currentSnapshotKey') && attendance.includes('_ATTENDANCE_DAILY_CACHE_TTL_MS'), 'same-key daily snapshot has bounded short-TTL reuse');
check(attendance.includes('currentSnapshotAuthGeneration') && attendance.includes('Number(context.authGeneration)'), 'daily cache reuse is isolated by auth generation');
check(attendance.includes('function _renderAttendanceDailyFromRam(') && !attendance.slice(attendance.indexOf('function _renderAttendanceDailyFromRam('), attendance.indexOf('function _captureAttendanceDailyToken(')).includes('AttendanceService.'), 'RAM card renderer performs no service read');
check(attendance.includes('clubId,') && attendance.includes('authGeneration: _authGeneration()') && attendance.includes('date,') && attendance.includes('branch:') && attendance.includes('shiftId,'), 'daily context captures club/auth/date/branch/shift identity');
check(attendance.includes('const token = Object.freeze({') && attendance.includes('mutationRevision: _attendanceDailyState.mutationRevision'), 'actual daily request token is immutable and captures mutation revision');
check(attendance.includes('function _isAttendanceDailyTokenCurrent(token)') && attendance.includes('_sameAttendanceContext(token, current)') && attendance.includes('Number(token.generation || 0) === Number(_attendanceDailyState.requestGeneration || 0)'), 'latest-context guard checks immutable identity and generation');
const dailyLoadStart = attendance.indexOf('const attList = await AttendanceService.loadByDate');
const dailyCommit = attendance.indexOf('_attendanceCache = nextCache;', dailyLoadStart);
const dailyGuard = attendance.indexOf('if (!_isAttendanceDailyTokenCurrent(token))', dailyLoadStart);
check(dailyLoadStart >= 0 && dailyGuard > dailyLoadStart && dailyCommit > dailyGuard, 'stale guard runs before daily cache commit');
check(attendance.includes("_markAttendanceDailyMutation('toggleAttendance')") && attendance.includes("_markAttendanceDailyMutation('bulkCheckIn')"), 'toggle and bulk optimistic writes advance the daily mutation revision');
check(attendance.includes('dailyMutationRevisionDropped++'), 'mutation-revision stale drops are diagnosed');
check(!attendance.slice(attendance.indexOf(".catch((error) =>", dailyLoadStart), attendance.indexOf('}).finally(() =>', dailyLoadStart)).includes('_attendanceCache = {}'), 'daily error path preserves the accepted/optimistic cache');
check(attendance.includes('let _clubShiftsLoadPromise = null') && attendance.includes('_clubShiftsLoadPromise?.clubId === clubId'), 'shift settings use a same-club Promise latch');
check(attendance.includes('_clubShiftsLoadedClubId') && attendance.includes("String(_clubId() || '').trim() !== clubId"), 'late shift response cannot commit across clubs/auth generations');
check(attendance.includes('function _isAttendanceDaySubtabActive()') && attendance.includes('function _isAttendanceMonthSubtabActive()'), 'nested Day/Month visibility helpers exist');
check(islands.includes('isDaySubtabActive') && islands.includes('renderDailyFromRam'), 'Day island is guarded and presentation-first');
check(islands.includes('isMonthSubtabActive') && islands.includes('window.renderAttMonthly()'), 'Month island is independently guarded');
check(attendance.includes("return { skipped: 'day-subtab-hidden' }") && attendance.includes("return { skipped: 'month-subtab-hidden' }"), 'inactive nested subtabs return before their network paths');
const cardBlock = attendance.slice(attendance.indexOf('function _renderAttCards()'), attendance.indexOf('function _renderAdminBranchSummary'));
check(!cardBlock.includes('_loadCoachForBranchSummary('), 'card presentation no longer loads admin coach notes');
check(attendance.includes('const _coachNotesState = {') && attendance.includes('_coachNotesState.inFlight.has(key)'), 'coach notes use accepted-context cache/single-flight');
check(app.includes('const _sessionNoteInFlight = new Map()') && app.includes('Object.prototype.hasOwnProperty.call(_sessionNoteCache, key)'), 'session note distinguishes loaded-missing from not-loaded and uses single-flight');
check(app.includes("recordFirestoreReadAttribution('attendance.sessionNote'"), 'session note point reads are attributed without adding a reader');
check(service.includes("recordFirestoreReadAttribution('attendance.daily'") && service.includes("recordFirestoreReadAttribution('attendance.shifts'") && service.includes("recordFirestoreReadAttribution('attendance.coachNotes'"), 'attendance daily/shifts/coach-note reads use existing attribution metrics');
check(events.includes("renderDailyFromRam?.('belt-filter-change')") && events.includes("renderDailyFromRam?.('show-all-filter-change')"), 'belt and show-all handlers are RAM-only');
check(events.includes("requestDailyRefresh?.('date-change', { force: true })") && events.includes("requestDailyRefresh?.('branch-change', { force: true })"), 'date and branch handlers remain network-eligible canonical intents');
check(!profiles.includes('window.renderAttendanceList()'), 'profile snapshots do not invoke a second direct daily render path');
check(attendanceListeners.includes('AttendanceModule?.renderDailyFromRam') && attendanceListeners.includes('presentationOnly: true'), 'attendance pseudo-listener fallback is presentation-only');
check(app.includes("renderDailyFromRam('legacy-renderApp-profile-presentation')") && read('js/ui/render.js').includes("renderDailyFromRam('module-renderApp-profile-presentation')"), 'legacy and module renderApp paths reuse daily RAM');
check(main.includes('initAttendanceEvents()') && main.includes('attendance.events.js?v=attendance-daily-single-refresh-authority-20260813-v5u6d'), 'canonical attendance event layer is mounted once by main');
check(main.includes("./ui/render.js?v=attendance-daily-single-refresh-authority-20260813-v5u6d") && main.includes("./ui/tabs.js?v=attendance-daily-single-refresh-authority-20260813-v5u6d") && read('js/ui/tabs.js').includes("attendance.listeners.js?v=attendance-daily-single-refresh-authority-20260813-v5u6d"), 'every changed nested runtime module has the V5U6D cache key');
check(!/id="(?:att_date|att_branch|att_belt|att_shift|chk_show_all_att)"[^>]*onchange=/.test(index), 'attendance filter controls have no duplicate inline onchange owner');
check(main.includes("window.APP_BUILD_VERSION = '4K-6V5U6D-attendance-daily-single-refresh-authority-20260813'"), 'runtime build version is exactly V5U6D');
check(pkg.scripts?.['check:attendance-daily-single-refresh-authority'] === 'node tools/check-attendance-daily-single-refresh-authority.mjs', 'package exposes the V5U6D gate');
check(pkg.scripts?.precheck?.includes('check:attendance-daily-single-refresh-authority') && pkg.scripts?.['precheck:all']?.includes('check:attendance-daily-single-refresh-authority') && pkg.scripts?.['precheck:all:critical']?.includes('check:attendance-daily-single-refresh-authority'), 'default/full/critical suites include the V5U6D gate through npm pre-hooks');
check(count(attendance, /\bgetDoc(?:s)?\s*\(/g) === 0, 'orchestrator/reconciliation module introduces no Firestore read owner');

// ── Runtime simulation helpers ───────────────────────────────────────
class FakeClassList {
    constructor(...names) { this.names = new Set(names); }
    contains(name) { return this.names.has(name); }
    add(...names) { names.forEach((name) => this.names.add(name)); }
    remove(...names) { names.forEach((name) => this.names.delete(name)); }
}
class FakeElement {
    constructor(id) {
        this.id = id;
        this.value = '';
        this.checked = false;
        this.hidden = false;
        this.disabled = false;
        this.innerHTML = '';
        this.textContent = '';
        this.dataset = {};
        this.style = { display: '', removeProperty(name) { delete this[name]; } };
        this.classList = new FakeClassList();
    }
    addEventListener() {}
    querySelector() { return null; }
    closest() { return null; }
}
const deferred = () => {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
};
const tick = () => new Promise((resolve) => setImmediate(resolve));
async function waitFor(predicate, label) {
    for (let i = 0; i < 60; i++) {
        if (predicate()) return;
        await tick();
    }
    throw new Error('Timed out waiting for ' + label);
}

try {
    const elements = new Map();
    const addEl = (id, value = '') => {
        const el = new FakeElement(id);
        el.value = value;
        elements.set(id, el);
        return el;
    };
    const tab = addEl('tab_attendance');
    tab.classList.add('active', 'tab-content');
    const daySubtab = addEl('att_sub_day');
    const monthSubtab = addEl('att_sub_month');
    monthSubtab.style.display = 'none';
    const dateEl = addEl('att_date', '2026-08-13');
    const branchEl = addEl('att_branch', 'all');
    const beltEl = addEl('att_belt', 'all');
    const shiftEl = addEl('att_shift', '');
    const showAllEl = addEl('chk_show_all_att');
    addEl('attendanceGrid');
    addEl('attendanceSummary');
    addEl('admin_daily_branch_summary');
    addEl('admin_daily_branch_body');
    addEl('shiftModal');
    addEl('shiftList');
    addEl('shift_name');
    addEl('shift_start');
    addEl('shift_end');
    addEl('att_month', '2026-08');
    addEl('att_month_branch', 'all');
    addEl('att_monthly_body');
    addEl('att_monthly_cards');
    addEl('att_monthly_table_wrap');

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
        key(index) { return Array.from(storage.keys())[index] || null; },
        getItem(key) { return storage.has(key) ? storage.get(key) : null; },
        setItem(key, value) { storage.set(key, String(value)); },
        removeItem(key) { storage.delete(key); },
    };
    const navigatorState = { onLine: false };
    Object.defineProperty(globalThis, 'navigator', { value: navigatorState, configurable: true });
    globalThis.addEventListener = () => {};
    globalThis.innerWidth = 1024;
    globalThis.scrollTo = () => {};
    globalThis.showToast = () => {};
    globalThis.getLocalToday = () => '2026-08-13';
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
    const profileMap = {
        Alice: { status: 'active', branch: 'CS1', belt: 'Đai Đen', trainingShiftId: 'shift-a', trainingDays: [] },
        Bob: { status: 'active', branch: 'CS2', belt: 'Đai Xanh', trainingShiftId: 'shift-b', trainingDays: [] },
    };
    globalThis.__store = { db: {}, clubId: 'club-a', currentClubId: 'club-a', userRole: 'viewer', profiles: profileMap, clubConfig: {}, clubData: {} };
    globalThis.currentClubId = 'club-a';
    globalThis.userRole = 'viewer';
    globalThis.coachBranch = '';
    globalThis.__verifiedAuthContextState = { generation: 1 };
    globalThis._fb_init = {};

    const serviceUrl = pathToFileURL(path.join(root, 'js/services/attendance.service.js')).href + '?v=attendance-offline-canonical-sync-closure-20260815-v5u6g1';
    const { AttendanceService } = await import(serviceUrl);
    let dailyCalls = 0;
    let shiftCalls = 0;
    let coachNoteCalls = 0;
    let monthlyCalls = 0;
    let dailyImpl = async () => [];
    let shiftImpl = async () => [];
    let coachNoteImpl = async () => [];
    let monthlyImpl = async () => [];
    AttendanceService.loadByDate = (...args) => { dailyCalls++; return dailyImpl(...args); };
    AttendanceService.loadShifts = (...args) => { shiftCalls++; return shiftImpl(...args); };
    AttendanceService.loadCoachNotes = (...args) => { coachNoteCalls++; return coachNoteImpl(...args); };
    AttendanceService.loadByMonth = (...args) => { monthlyCalls++; return monthlyImpl(...args); };
    AttendanceService.saveRecord = async () => {};
    AttendanceService.deleteRecord = async () => {};
    AttendanceService.bulkSaveRecords = async () => {};
    AttendanceService.bulkSyncOffline = async () => {};
    AttendanceService.updateMemberStats = async () => {};
    AttendanceService._increment = (value) => value;

    const registryModule = await import(pathToFileURL(path.join(root, 'js/core/globalOwnershipRegistry.js')).href + `?v5u6d=${Date.now()}`);
    registryModule.initGlobalOwnershipRegistry();
    const attendanceModule = await import(pathToFileURL(path.join(root, 'js/modules/attendance.js')).href + `?v5u6d=${Date.now()}`);
    const api = attendanceModule.initAttendance();

    const setDayVisible = (visible = true) => {
        daySubtab.style.display = visible ? '' : 'none';
        monthSubtab.style.display = visible ? 'none' : '';
        tab.classList.add('active');
    };
    const reset = ({ club = 'club-a', date = '2026-08-13', branch = 'all', role = 'viewer', auth = 1 } = {}) => {
        globalThis.__store.clubId = club;
        globalThis.__store.currentClubId = club;
        globalThis.__store.userRole = role;
        globalThis.currentClubId = club;
        globalThis.userRole = role;
        globalThis.coachBranch = role === 'coach' ? 'CS1' : '';
        globalThis.__store.coachBranch = globalThis.coachBranch;
        globalThis.__verifiedAuthContextState.generation = auth;
        dateEl.value = date;
        branchEl.value = branch;
        shiftEl.value = '';
        beltEl.value = 'all';
        showAllEl.checked = false;
        setDayVisible(true);
        api.resetForClub(club);
    };
    const record = (name, date, status, shiftId = '') => ({
        id: name + '_' + date + (shiftId ? '_' + shiftId : ''),
        data: { name, profileId: name, date, status, branch: profileMap[name]?.branch || 'CS1', ...(shiftId ? { shiftId } : {}) },
    });

    // Three same-context intents: exactly one daily query.
    reset();
    shiftImpl = async () => [];
    const sameFlight = deferred();
    dailyImpl = () => sameFlight.promise;
    const sameBefore = dailyCalls;
    const coalescedBefore = Number(globalThis.__attendanceDebug.dailySingleFlightCoalesced || 0);
    const samePromises = [
        api.requestDailyRefresh('same-a', { force: true }),
        api.requestDailyRefresh('same-b', { force: true }),
        api.requestDailyRefresh('same-c', { force: true }),
    ];
    await waitFor(() => dailyCalls === sameBefore + 1, 'same-key daily flight');
    sameFlight.resolve([record('Alice', '2026-08-13', 1)]);
    const sameResults = await Promise.all(samePromises);
    check(dailyCalls === sameBefore + 1, 'runtime: three same-key intents perform exactly one daily load');
    check(globalThis.__attendanceDebug.dailySingleFlightCoalesced - coalescedBefore >= 2, 'runtime: two same-key callers are diagnosed as coalesced');
    check(sameResults.every((result) => result?.applied === true) && globalThis.currentAttendanceData.Alice === 1, 'runtime: all same-key callers observe one accepted snapshot');

    // Date A -> B, B resolves first, A must be dropped.
    reset({ date: '2026-08-12' });
    const dateA = deferred();
    const dateB = deferred();
    dailyImpl = (date) => date === '2026-08-12' ? dateA.promise : dateB.promise;
    const dateStart = dailyCalls;
    const staleBeforeDate = globalThis.__attendanceDebug.dailyStaleDropped;
    const requestDateA = api.requestDailyRefresh('date-a', { force: true });
    await waitFor(() => dailyCalls === dateStart + 1, 'date A start');
    dateEl.value = '2026-08-13';
    const requestDateB = api.requestDailyRefresh('date-b', { force: true });
    await waitFor(() => dailyCalls === dateStart + 2, 'date B start');
    dateB.resolve([record('Alice', '2026-08-13', 2)]);
    await requestDateB;
    const afterDateB = globalThis.currentAttendanceData.Alice;
    dateA.resolve([record('Alice', '2026-08-12', 0)]);
    const staleDateResult = await requestDateA;
    check(afterDateB === 2 && globalThis.currentAttendanceData.Alice === 2, 'runtime: late date A cannot overwrite accepted date B');
    check(staleDateResult?.stale === true && globalThis.__attendanceDebug.dailyStaleDropped === staleBeforeDate + 1, 'runtime: late date response is stale-dropped exactly once');
    check(dailyCalls === dateStart + 2, 'runtime: each distinct date intent performs exactly one daily read');
    check(api.getDailyState().currentSnapshotKey.includes('|2026-08-13|'), 'runtime: final daily snapshot identity belongs to the newest date');

    // Branch CS1 -> CS2.
    reset({ branch: 'CS1' });
    const branchA = deferred();
    const branchB = deferred();
    dailyImpl = (_date, options) => options.branch === 'CS1' ? branchA.promise : branchB.promise;
    const branchStart = dailyCalls;
    const requestBranchA = api.requestDailyRefresh('branch-a', { force: true });
    await waitFor(() => dailyCalls === branchStart + 1, 'branch A start');
    branchEl.value = 'CS2';
    const requestBranchB = api.requestDailyRefresh('branch-b', { force: true });
    await waitFor(() => dailyCalls === branchStart + 2, 'branch B start');
    branchB.resolve([record('Bob', '2026-08-13', 3)]);
    await requestBranchB;
    branchA.resolve([record('Alice', '2026-08-13', 1)]);
    await requestBranchA;
    check(globalThis.currentAttendanceData.Bob === 3, 'runtime: late CS1 response cannot overwrite CS2 cards');
    check(dailyCalls === branchStart + 2, 'runtime: each distinct branch intent performs exactly one daily read');
    check(api.getDailyState().currentSnapshotKey.includes('|CS2|'), 'runtime: final daily snapshot identity belongs to the newest branch');

    // Shift A -> B. onShiftChange captures the selected shift before loading.
    reset();
    shiftImpl = async () => [
        { id: 'shift-a', name: 'Ca A' },
        { id: 'shift-b', name: 'Ca B' },
    ];
    const shiftA = deferred();
    const shiftB = deferred();
    dailyImpl = (_date, options) => options.shiftId === 'shift-a' ? shiftA.promise : shiftB.promise;
    const dailyShiftStart = dailyCalls;
    shiftEl.value = 'shift-a';
    const requestShiftA = globalThis.onShiftChange();
    await waitFor(() => dailyCalls === dailyShiftStart + 1, 'shift A start');
    shiftEl.value = 'shift-b';
    const requestShiftB = globalThis.onShiftChange();
    await waitFor(() => dailyCalls === dailyShiftStart + 2, 'shift B start');
    shiftB.resolve([record('Bob', '2026-08-13', 1, 'shift-b')]);
    await requestShiftB;
    shiftA.resolve([record('Alice', '2026-08-13', 2, 'shift-a')]);
    await requestShiftA;
    check(globalThis.currentAttendanceData.Bob === 1, 'runtime: late shift A response cannot overwrite shift B cards');
    check(dailyCalls === dailyShiftStart + 2, 'runtime: each distinct shift intent performs exactly one daily read');
    check(api.getDailyState().currentSnapshotKey.endsWith('|shift-b'), 'runtime: final daily snapshot identity belongs to the newest shift');

    // Club/auth generation switch while Club A is in flight.
    reset({ club: 'club-a', auth: 10 });
    shiftImpl = async () => [];
    const clubA = deferred();
    const clubB = deferred();
    dailyImpl = () => globalThis.__store.clubId === 'club-a' ? clubA.promise : clubB.promise;
    const clubStart = dailyCalls;
    const requestClubA = api.requestDailyRefresh('club-a', { force: true });
    await waitFor(() => dailyCalls === clubStart + 1, 'club A start');
    reset({ club: 'club-b', auth: 11 });
    const requestClubB = api.requestDailyRefresh('club-b', { force: true });
    await waitFor(() => dailyCalls === clubStart + 2, 'club B start');
    clubB.resolve([record('Alice', '2026-08-13', 3)]);
    await requestClubB;
    clubA.resolve([record('Alice', '2026-08-13', 1)]);
    await requestClubA;
    check(globalThis.currentAttendanceData.Alice === 3, 'runtime: late Club A/auth generation response cannot mutate Club B UI');
    check(api.getDailyState().currentSnapshotKey.startsWith('club-b|'), 'runtime: snapshot identity resets to the accepted club');

    // Same club/query key but a newer auth generation must start a new flight.
    reset({ club: 'club-same-auth', auth: 70 });
    const authA = deferred();
    const authB = deferred();
    dailyImpl = () => Number(globalThis.__verifiedAuthContextState.generation) === 70 ? authA.promise : authB.promise;
    const authStart = dailyCalls;
    const requestAuthA = api.requestDailyRefresh('auth-generation-a', { force: true });
    await waitFor(() => dailyCalls === authStart + 1, 'auth generation A start');
    globalThis.__verifiedAuthContextState.generation = 71;
    const requestAuthB = api.requestDailyRefresh('auth-generation-b', { force: true });
    await waitFor(() => dailyCalls === authStart + 2, 'auth generation B start');
    authB.resolve([record('Alice', '2026-08-13', 2)]);
    await requestAuthB;
    authA.resolve([record('Alice', '2026-08-13', 0)]);
    const authAResult = await requestAuthA;
    check(authAResult?.stale === true && globalThis.currentAttendanceData.Alice === 2, 'runtime: same-club old-auth flight is not shared and cannot overwrite new auth');
    check(api.getDailyState().currentSnapshotAuthGeneration === 71, 'runtime: accepted daily cache records the current auth generation');

    // Local toggle during an older read.
    reset({ club: 'club-write', auth: 20 });
    dailyImpl = async () => [];
    await api.requestDailyRefresh('write-baseline', { force: true });
    const oldToggleRead = deferred();
    dailyImpl = () => oldToggleRead.promise;
    const mutationDropBefore = globalThis.__attendanceDebug.dailyMutationRevisionDropped;
    const toggleStart = dailyCalls;
    const toggleRead = api.requestDailyRefresh('pre-toggle-read', { force: true });
    await waitFor(() => dailyCalls === toggleStart + 1, 'toggle read start');
    await globalThis.toggleAttendance('Alice');
    check(globalThis.currentAttendanceData.Alice === 1, 'runtime: local toggle applies optimistically while the old read is running');
    oldToggleRead.resolve([]);
    const toggleReadResult = await toggleRead;
    check(toggleReadResult?.stale === true && globalThis.currentAttendanceData.Alice === 1, 'runtime: pre-toggle read cannot erase optimistic status');
    check(globalThis.__attendanceDebug.dailyMutationRevisionDropped === mutationDropBefore + 1, 'runtime: toggle race is rejected by mutation revision');

    // Bulk write during an older read.
    reset({ club: 'club-bulk', auth: 21 });
    dailyImpl = async () => [];
    await api.requestDailyRefresh('bulk-baseline', { force: true });
    const oldBulkRead = deferred();
    dailyImpl = () => oldBulkRead.promise;
    const bulkStart = dailyCalls;
    const bulkRead = api.requestDailyRefresh('pre-bulk-read', { force: true });
    await waitFor(() => dailyCalls === bulkStart + 1, 'bulk read start');
    await globalThis.bulkCheckIn();
    check(globalThis.currentAttendanceData.Alice === 1 && globalThis.currentAttendanceData.Bob === 1, 'runtime: bulk check-in applies optimistically while the old read is running');
    oldBulkRead.resolve([]);
    const bulkReadResult = await bulkRead;
    check(bulkReadResult?.stale === true && globalThis.currentAttendanceData.Alice === 1 && globalThis.currentAttendanceData.Bob === 1, 'runtime: pre-bulk read cannot erase optimistic statuses');

    // Warm presentation filters/profile changes are zero-read.
    reset({ club: 'club-presentation', auth: 30 });
    dailyImpl = async (date) => [record('Alice', date, 2)];
    await api.requestDailyRefresh('presentation-baseline', { force: true });
    const presentationReadCount = dailyCalls;
    beltEl.value = 'Đen';
    for (let i = 0; i < 5; i++) await api.renderDailyFromRam('belt-filter-' + i);
    showAllEl.checked = true;
    for (let i = 0; i < 5; i++) await api.renderDailyFromRam('show-all-' + i);
    profileMap.Alice.nickname = 'Ace';
    await api.renderDailyFromRam('profile-nickname-update');
    check(dailyCalls === presentationReadCount, 'runtime: belt/show-all/profile presentation storm performs zero daily reads');
    check(elements.get('attendanceGrid').innerHTML.includes('Ace'), 'runtime: profile display changes still rebuild cards from RAM');

    // Daily render + ensure + modal share one shifts point read.
    reset({ club: 'club-shifts', auth: 40 });
    const shiftSettings = deferred();
    shiftImpl = () => shiftSettings.promise;
    dailyImpl = async () => [];
    const shiftReadBefore = shiftCalls;
    const shiftCoalescedBefore = Number(globalThis.__attendanceDebug.shiftsCoalesced || 0);
    const shiftConsumers = [
        api.requestDailyRefresh('shift-consumer-daily', { force: true }),
        api.ensureShiftsLoaded(),
        globalThis.openShiftModal(),
    ];
    await waitFor(() => shiftCalls === shiftReadBefore + 1, 'single shifts flight');
    shiftSettings.resolve([{ id: 'shift-a', name: 'Ca A' }]);
    await Promise.all(shiftConsumers);
    check(shiftCalls === shiftReadBefore + 1, 'runtime: daily/ensure/modal share exactly one shifts read');
    check(globalThis.__attendanceDebug.shiftsCoalesced - shiftCoalescedBefore >= 2, 'runtime: concurrent shifts consumers are diagnosed as coalesced');

    // Accepted admin daily context starts auxiliary reads only once.
    reset({ club: 'club-admin', role: 'admin', auth: 50 });
    shiftImpl = async () => [];
    const adminDaily = deferred();
    dailyImpl = () => adminDaily.promise;
    coachNoteImpl = async () => [];
    const adminCoachBefore = coachNoteCalls;
    const adminShiftBefore = shiftCalls;
    let sessionNoteCalls = 0;
    globalThis.loadSessionNote = async () => { sessionNoteCalls++; return null; };
    const adminDailyBefore = dailyCalls;
    const adminRequests = [
        api.requestDailyRefresh('admin-a', { force: true }),
        api.requestDailyRefresh('admin-b', { force: true }),
    ];
    await waitFor(() => dailyCalls === adminDailyBefore + 1, 'admin daily flight');
    adminDaily.resolve([record('Alice', '2026-08-13', 1)]);
    await Promise.all(adminRequests);
    check(shiftCalls === adminShiftBefore + 1 && dailyCalls === adminDailyBefore + 1 && coachNoteCalls === adminCoachBefore + 1 && sessionNoteCalls === 1, 'runtime: Admin cold daily shape is shifts 1 / daily 1 / coachNotes 1 / sessionNote 1');
    const auxDailyAfterCold = dailyCalls;
    const auxCoachAfterCold = coachNoteCalls;
    const auxSessionAfterCold = sessionNoteCalls;
    for (let i = 0; i < 5; i++) await api.renderDailyFromRam('admin-presentation-' + i);
    check(dailyCalls === auxDailyAfterCold && coachNoteCalls === auxCoachAfterCold && sessionNoteCalls === auxSessionAfterCold, 'runtime: warm card presentation performs zero auxiliary reads');

    // Day/Month read isolation and hidden main-tab isolation.
    monthlyImpl = async () => [];
    const monthBeforeDay = monthlyCalls;
    setDayVisible(true);
    await globalThis.renderAttMonthly();
    check(monthlyCalls === monthBeforeDay, 'runtime: Day subtab prevents hidden monthly load');
    setDayVisible(false);
    const dailyBeforeMonth = dailyCalls;
    const dailySkip = await api.requestDailyRefresh('month-subtab-daily-attempt', { force: true });
    check(dailySkip?.skipped === 'day-subtab-hidden' && dailyCalls === dailyBeforeMonth, 'runtime: Month subtab prevents hidden daily load');
    await globalThis.renderAttMonthly();
    check(monthlyCalls === monthBeforeDay + 1, 'runtime: active Month subtab retains its canonical monthly flow');
    tab.classList.remove('active');
    setDayVisible(true);
    tab.classList.remove('active');
    const hiddenDailyBefore = dailyCalls;
    const hiddenMonthlyBefore = monthlyCalls;
    await api.requestDailyRefresh('main-tab-hidden', { force: true });
    await globalThis.renderAttMonthly();
    check(dailyCalls === hiddenDailyBefore && monthlyCalls === hiddenMonthlyBefore, 'runtime: hidden Attendance main tab performs zero day/month reads');

    // Coach keeps canonical branch scope and skips admin notes.
    reset({ club: 'club-coach', role: 'coach', auth: 60 });
    let coachDailyOptions = null;
    dailyImpl = async (_date, options) => { coachDailyOptions = options; return [record('Alice', '2026-08-13', 1)]; };
    const coachNotesBeforeCoach = coachNoteCalls;
    const coachDailyBefore = dailyCalls;
    const coachShiftBefore = shiftCalls;
    const coachSessionBefore = sessionNoteCalls;
    await api.requestDailyRefresh('coach-cold', { force: true });
    check(coachDailyOptions?.branch === 'CS1', 'runtime: Coach daily request remains server-scoped to canonical assigned branch');
    check(coachNoteCalls === coachNotesBeforeCoach, 'runtime: Coach daily lifecycle never loads admin coach-notes summary');
    check(shiftCalls === coachShiftBefore + 1 && dailyCalls === coachDailyBefore + 1 && sessionNoteCalls === coachSessionBefore + 1, 'runtime: Coach cold daily shape is shifts 1 / daily 1 / sessionNote 1');
} catch (error) {
    failures.push(`runtime simulation failed: ${error?.stack || error}`);
}

for (const message of passes) console.log('✅', message);
if (failures.length) {
    console.error(`\n❌ V5U6D gate failed (${failures.length})`);
    failures.forEach((message) => console.error('FAIL:', message));
    process.exit(1);
}
console.log(`\n✅ V5U6D gate passed (${passes.length}/${passes.length} assertions)\n`);
