#!/usr/bin/env node
/**
 * Phase 4K-6V5U6F — Attendance Explicit Shift Authority
 * Static authority contracts plus isolated RAM/runtime races. No Firebase call
 * is executed: AttendanceService methods are replaced with deterministic fakes.
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const attendance = read('js/modules/attendance.js');
const service = read('js/services/attendance.service.js');
const main = read('js/main.js');
const index = read('index.html');
const pkg = JSON.parse(read('package.json'));
const passes = [];
const failures = [];
const check = (condition, message) => (condition ? passes : failures).push(message);
const count = (source, pattern) => (source.match(pattern) || []).length;

console.log('\n🔎 Phase 4K-6V5U6F — Attendance Explicit Shift Authority\n');

// ── Static ownership and guard ordering ─────────────────────────────
check(count(attendance, /async function _requestAttendanceDailyRefresh\s*\(/g) === 1,
    'one canonical daily refresh owner remains');
check(count(attendance, /AttendanceService\.loadByDate\s*\(/g) === 1,
    'daily service invocation count remains exactly one');
check(count(attendance, /async function _loadClubShifts\s*\(/g) === 1 &&
    count(attendance, /AttendanceService\.loadShifts\s*\(/g) === 1,
    'one shifts acquisition owner remains');
check(attendance.includes('const _attendanceShiftAuthority = {') &&
    attendance.includes("status: 'idle'") && attendance.includes('configured: null'),
    'module-local shift authority distinguishes unknown from ready-empty');
check(!attendance.includes('let _clubShiftsLoaded   = false'),
    'legacy loaded boolean no longer represents shift authority');
check(attendance.includes("status: 'loading'") && attendance.includes("status: 'ready'") &&
    attendance.includes("status: 'error'"), 'shift loader has loading/ready/error states');
check(attendance.includes('configured: _clubShifts.length > 0'),
    'successful shift load derives configured state from authoritative list');
check(attendance.includes('_clubShiftsLoadPromise?.clubId === clubId') &&
    attendance.includes('return _clubShiftsLoadPromise.promise'),
    'force/retry calls reuse the same Promise latch');
check(attendance.includes('shiftConfigErrors++') && !/catch\s*\([^)]*\)\s*\{\s*\}/.test(
    attendance.slice(attendance.indexOf('async function _loadClubShifts('), attendance.indexOf('function _commitAttendanceShiftSettingsFromRam'))
), 'shift load errors are explicit and never swallowed as an empty list');

const resolverStart = attendance.indexOf('function _resolveAttendanceShiftAuthority(');
const resolverEnd = attendance.indexOf('function _attendanceContextWithShift(', resolverStart);
const resolver = attendance.slice(resolverStart, resolverEnd);
check(resolverStart >= 0 && resolver.includes("mode: 'legacy-no-shift'") &&
    resolver.includes("mode: 'explicit-shift'") && resolver.includes("mode: 'shift-required'") &&
    resolver.includes("mode: 'shift-config-unavailable'"),
    'one RAM decision helper exposes all canonical shift modes');
check(!/AttendanceService\.|\bgetDoc(?:s)?\s*\(|\bonSnapshot\s*\(|\bsetTimeout\s*\(|\bsetInterval\s*\(|innerHTML/.test(resolver),
    'shift decision helper has no network/render/timer owner');
check(attendance.includes('function _getEligibleAttendanceShifts(context)') &&
    attendance.includes("if (role === 'coach')") && attendance.includes('_sameBranch(shiftBranch, branch)'),
    'eligible shifts reuse canonical branch identity and Coach scope');
check(!attendance.includes('eligibleShifts[0]') && !attendance.includes('_clubShifts[0]'),
    'no implicit first-shift auto selection exists');

const requestStart = attendance.indexOf('async function _requestAttendanceDailyRefresh(');
const dailyLoad = attendance.indexOf('AttendanceService.loadByDate(', requestStart);
const decisionInRequest = attendance.indexOf('_resolveAttendanceShiftAuthority(rawContext)', requestStart);
const blockedInRequest = attendance.indexOf('if (!shiftDecision.allowed)', decisionInRequest);
check(decisionInRequest > requestStart && blockedInRequest > decisionInRequest && blockedInRequest < dailyLoad,
    'configured blank/error is blocked before loadByDate');
check(attendance.includes('blankShiftAllReadPrevented++') && attendance.includes('shiftRequiredBlockedReads++'),
    'blank all-shift read prevention is diagnosed');
check(attendance.includes('legacyNoShiftReads++') && attendance.includes('explicitShiftReads++'),
    'actual daily reads distinguish legacy and explicit shift modes');
check(service.indexOf('options.requireShift === true && !shiftId') < service.indexOf('const snap = await getDocs('),
    'service defense rejects missing required shift before getDocs');
check(!service.includes('(tất cả ca)'), 'blank daily reads are no longer labelled all-shifts');

const toggleStart = attendance.indexOf('window.toggleAttendance = async');
const toggleMutation = attendance.indexOf("_markAttendanceDailyMutation('toggleAttendance')", toggleStart);
const toggleGuard = attendance.indexOf("_resolveAttendanceWriteGuard('toggleAttendance')", toggleStart);
const bulkStart = attendance.indexOf('window.bulkCheckIn = async');
const bulkMutation = attendance.indexOf("_markAttendanceDailyMutation('bulkCheckIn')", bulkStart);
const bulkGuard = attendance.indexOf("_resolveAttendanceWriteGuard('bulkCheckIn')", bulkStart);
check(toggleGuard > toggleStart && toggleGuard < toggleMutation,
    'toggle uses canonical shift guard before optimistic mutation');
check(bulkGuard > bulkStart && bulkGuard < bulkMutation,
    'bulk check-in uses the same guard before optimistic mutation');
check(attendance.includes('function _saveAttOffline(clubId, date, shiftDecision') &&
    attendance.includes('if (!shiftDecision || shiftDecision.allowed !== true'),
    'offline queue creation cannot bypass shift authority');
check(attendance.includes('_isOfflineAttendanceRecordAllowed(entry.record)') &&
    attendance.indexOf('_isOfflineAttendanceRecordAllowed(entry.record)') < attendance.indexOf('AttendanceService.bulkSyncOffline(syncContext.clubId, date, records)'),
    'offline synchronization validates queued shift evidence before write');
check(attendance.includes('getAttendanceDocId(name, writeDate, writeShiftId)') &&
    attendance.includes('...(writeShiftId ? { shiftId: writeShiftId } : {})'),
    'toggle/bulk doc identity and payload use the same captured shift');
check(attendance.includes('invalidSelectedShiftCleared++') && attendance.includes("reason: 'selected-shift-not-eligible'"),
    'invalid branch/deleted selection is cleared without a query');
check(attendance.includes("_requestAttendanceDailyRefresh('shift-config-add'") &&
    attendance.includes("_requestAttendanceDailyRefresh('shift-config-delete'"),
    'first-shift creation and selected-shift deletion re-enter canonical owner');
check(count(attendance, /const _attendanceDailyState\s*=\s*\{/g) === 1 &&
    !attendance.includes('noShiftInFlight') && !attendance.includes('shiftInFlight'),
    'no second daily state or in-flight map is introduced');
check(count(attendance, /\bonSnapshot\s*\(/g) === 0 && count(attendance, /\bsetInterval\s*\(/g) === 0,
    'Attendance orchestration adds no listener or polling');
check(main.includes("window.APP_BUILD_VERSION = '4K-6V5U6G1-attendance-offline-canonical-sync-closure-20260815'") &&
    main.includes("./modules/attendance.js?v=attendance-offline-canonical-sync-closure-20260815-v5u6g1") &&
    index.includes("./js/main.js?v=attendance-offline-canonical-sync-closure-20260815-v5u6g1") &&
    main.includes("APP_BUILD_VERSION = '4K-6V5U6F-attendance-explicit-shift-authority-20260814'"),
    'V5U6F boundary is preserved under the V5U6G1 targeted cache-bust');
check(pkg.scripts?.['check:attendance-explicit-shift-authority'] === 'node tools/check-attendance-explicit-shift-authority.mjs',
    'package exposes the V5U6F gate');

// ── Runtime simulation ──────────────────────────────────────────────
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
    for (let i = 0; i < 80; i++) {
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
    const dateEl = addEl('att_date', '2026-08-14');
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
    const shiftNameEl = addEl('shift_name');
    addEl('shift_start');
    addEl('shift_end');

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
    const navigatorState = { onLine: true };
    Object.defineProperty(globalThis, 'navigator', { value: navigatorState, configurable: true });
    globalThis.addEventListener = () => {};
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
    const profiles = {
        Alice: { status: 'active', branch: 'CS1', belt: 'Đai Đen', trainingShiftId: 'morning', trainingDays: [] },
        Bob: { status: 'active', branch: 'CS2', belt: 'Đai Xanh', trainingShiftId: 'evening', trainingDays: [] },
    };
    globalThis.__store = { db: {}, clubId: 'club-a', currentClubId: 'club-a', userRole: 'admin', coachBranch: '', profiles, clubConfig: {}, clubData: {} };
    globalThis.currentClubId = 'club-a';
    globalThis.userRole = 'admin';
    globalThis.coachBranch = '';
    globalThis.__verifiedAuthContextState = { generation: 1 };
    globalThis._fb_init = {};

    const serviceUrl = pathToFileURL(path.join(root, 'js/services/attendance.service.js')).href + '?v=attendance-offline-canonical-sync-closure-20260815-v5u6g1';
    const { AttendanceService } = await import(serviceUrl);
    let dailyCalls = 0;
    let shiftCalls = 0;
    let saveRecordCalls = 0;
    let deleteRecordCalls = 0;
    let bulkSaveCalls = 0;
    let bulkSyncCalls = 0;
    let saveShiftCalls = 0;
    let lastDailyOptions = null;
    let lastSavedRecord = null;
    let dailyImpl = async () => [];
    let shiftImpl = async () => [];
    AttendanceService.loadByDate = (...args) => {
        dailyCalls++;
        lastDailyOptions = args[1] || {};
        return dailyImpl(...args);
    };
    AttendanceService.loadShifts = (...args) => { shiftCalls++; return shiftImpl(...args); };
    AttendanceService.loadCoachNotes = async () => [];
    AttendanceService.saveRecord = async (...args) => { saveRecordCalls++; lastSavedRecord = args; };
    AttendanceService.deleteRecord = async () => { deleteRecordCalls++; };
    AttendanceService.bulkSaveRecords = async () => { bulkSaveCalls++; };
    AttendanceService.bulkSyncOffline = async () => { bulkSyncCalls++; };
    AttendanceService.saveShifts = async () => { saveShiftCalls++; };
    AttendanceService.updateMemberStats = async () => {};
    AttendanceService._increment = (value) => value;

    const registry = await import(pathToFileURL(path.join(root, 'js/core/globalOwnershipRegistry.js')).href + `?v5u6f=${Date.now()}`);
    registry.initGlobalOwnershipRegistry();
    const module = await import(pathToFileURL(path.join(root, 'js/modules/attendance.js')).href + `?v5u6f=${Date.now()}`);
    const api = module.initAttendance();

    const reset = ({ club = 'club-a', branch = 'all', role = 'admin', auth = 1, online = true } = {}) => {
        globalThis.__store.clubId = club;
        globalThis.__store.currentClubId = club;
        globalThis.__store.userRole = role;
        globalThis.currentClubId = club;
        globalThis.userRole = role;
        globalThis.coachBranch = role === 'coach' ? 'CS1' : '';
        globalThis.__store.coachBranch = globalThis.coachBranch;
        globalThis.__verifiedAuthContextState.generation = auth;
        navigatorState.onLine = online;
        dateEl.value = '2026-08-14';
        branchEl.value = branch;
        beltEl.value = 'all';
        shiftEl.value = '';
        showAllEl.checked = false;
        storage.clear();
        tab.classList.add('active');
        daySubtab.style.display = '';
        monthSubtab.style.display = 'none';
        api.resetForClub(club);
    };
    const record = (name, status, shiftId = '') => ({
        id: `${name}_2026-08-14${shiftId ? `_${shiftId}` : ''}`,
        data: { name, profileId: name, date: '2026-08-14', status, branch: profiles[name]?.branch || 'CS1', ...(shiftId ? { shiftId } : {}) },
    });

    // Configured + blank: no daily query and no stale presentation.
    reset({ club: 'club-configured', auth: 10 });
    shiftImpl = async () => [
        { id: 'morning', name: 'Ca sáng' },
        { id: 'evening', name: 'Ca chiều' },
    ];
    const configuredBlankBefore = dailyCalls;
    const configuredBlank = await api.requestDailyRefresh('configured-blank', { force: true });
    check(configuredBlank?.blocked === true && configuredBlank.mode === 'shift-required',
        'runtime: configured blank resolves to shift-required');
    check(dailyCalls === configuredBlankBefore && elements.get('attendanceGrid').innerHTML.includes('Vui lòng chọn ca tập'),
        'runtime: configured blank performs zero daily reads and renders prompt');
    check(api.getShiftAuthority().status === 'ready' && api.getShiftAuthority().configured === true,
        'runtime: successful non-empty config is authoritative');

    // Explicit shift: one filtered read, correct shift-aware record mapping, TTL reuse.
    dailyImpl = async () => [record('Alice', 1, 'morning')];
    shiftEl.value = 'morning';
    const explicitBefore = dailyCalls;
    const explicit = await globalThis.onShiftChange();
    check(explicit?.applied === true && dailyCalls === explicitBefore + 1 && lastDailyOptions?.shiftId === 'morning',
        'runtime: explicit eligible shift performs exactly one daily read');
    check(lastDailyOptions?.requireShift === true && lastDailyOptions?.shiftAuthorityMode === 'explicit-shift',
        'runtime: canonical owner passes explicit defensive service contract');
    check(globalThis.currentAttendanceData.Alice === 1,
        'runtime: existing name_date_shift record maps to the selected shift card');
    const explicitWarm = dailyCalls;
    await api.requestDailyRefresh('explicit-warm');
    check(dailyCalls === explicitWarm, 'runtime: same explicit shift reuses warm daily snapshot');

    // Online write uses one immutable shift for doc id and document payload.
    const saveBefore = saveRecordCalls;
    await globalThis.toggleAttendance('Alice');
    check(saveRecordCalls === saveBefore + 1 && lastSavedRecord?.[0] === 'Alice_2026-08-14_morning' &&
        lastSavedRecord?.[1]?.shiftId === 'morning',
        'runtime: explicit toggle writes matching shift-aware doc id and payload');

    // No configured shifts: legacy blank remains one normal daily query.
    reset({ club: 'club-legacy', auth: 11 });
    shiftImpl = async () => [];
    dailyImpl = async () => [record('Alice', 1)];
    const legacyBefore = dailyCalls;
    const legacy = await api.requestDailyRefresh('legacy-no-shift', { force: true });
    check(legacy?.applied === true && dailyCalls === legacyBefore + 1 && !lastDailyOptions?.shiftId,
        'runtime: authoritative empty config preserves legacy no-shift read');
    check(api.getShiftAuthority().configured === false && lastDailyOptions?.shiftAuthorityMode === 'legacy-no-shift',
        'runtime: legacy blank is explicitly labelled legacy-no-shift');

    // Shift config error fails closed for read, toggle, bulk, and retry coalesces.
    reset({ club: 'club-error', auth: 12 });
    shiftImpl = async () => { throw new Error('permission-denied'); };
    const errorDailyBefore = dailyCalls;
    const errorRead = await api.requestDailyRefresh('shift-error', { force: true });
    check(errorRead?.blocked === true && errorRead.mode === 'shift-config-unavailable' && dailyCalls === errorDailyBefore,
        'runtime: shift config error performs zero daily reads');
    check(api.getShiftAuthority().status === 'error' && api.getShiftAuthority().configured === null,
        'runtime: shift error is not coerced to empty configuration');
    const writesBeforeError = saveRecordCalls + deleteRecordCalls + bulkSaveCalls;
    const storageBeforeError = storage.size;
    await globalThis.toggleAttendance('Alice');
    await globalThis.bulkCheckIn();
    check(saveRecordCalls + deleteRecordCalls + bulkSaveCalls === writesBeforeError && storage.size === storageBeforeError,
        'runtime: config error blocks toggle/bulk before cache, offline, or Firestore writes');
    const retryFlight = deferred();
    shiftImpl = () => retryFlight.promise;
    dailyImpl = async () => [];
    const retryShiftBefore = shiftCalls;
    const retryA = api.retryShiftConfig();
    const retryB = api.ensureShiftsLoaded({ force: true });
    await waitFor(() => shiftCalls === retryShiftBefore + 1, 'single retry shift flight');
    retryFlight.resolve([]);
    await Promise.all([retryA, retryB]);
    check(shiftCalls === retryShiftBefore + 1,
        'runtime: shift retry and concurrent ensure reuse one shifts point read');

    // Blank cannot create a duplicate beside an existing shift record.
    reset({ club: 'club-duplicate', auth: 13, online: true });
    shiftImpl = async () => [{ id: 'morning', name: 'Ca sáng' }];
    dailyImpl = async () => [record('Alice', 1, 'morning')];
    await api.requestDailyRefresh('duplicate-blank', { force: true });
    const duplicateWritesBefore = saveRecordCalls + deleteRecordCalls + bulkSaveCalls;
    await globalThis.toggleAttendance('Alice');
    await globalThis.bulkCheckIn();
    check(saveRecordCalls + deleteRecordCalls + bulkSaveCalls === duplicateWritesBefore,
        'runtime: configured blank cannot create name_date duplicate through toggle or bulk');

    // Shift A -> blank while A is running: blank intent wins and A is dropped.
    reset({ club: 'club-a-blank', auth: 14 });
    shiftImpl = async () => [
        { id: 'morning', name: 'Ca sáng' },
        { id: 'evening', name: 'Ca chiều' },
    ];
    await api.requestDailyRefresh('a-blank-config', { force: true });
    const lateA = deferred();
    dailyImpl = () => lateA.promise;
    shiftEl.value = 'morning';
    const lateAStart = dailyCalls;
    const requestA = globalThis.onShiftChange();
    await waitFor(() => dailyCalls === lateAStart + 1, 'shift A flight');
    shiftEl.value = '';
    const blankIntent = await globalThis.onShiftChange();
    lateA.resolve([record('Alice', 1, 'morning')]);
    const lateAResult = await requestA;
    check(blankIntent?.blocked === true && lateAResult?.stale === true,
        'runtime: A response is stale-dropped after explicit blank intent');
    check(elements.get('attendanceGrid').innerHTML.includes('Vui lòng chọn ca tập') &&
        Object.keys(globalThis.currentAttendanceData || {}).length === 0,
        'runtime: A cannot overwrite shift-required presentation');

    // Existing A -> B latest-wins remains intact.
    const raceA = deferred();
    const raceB = deferred();
    dailyImpl = (_date, options) => options.shiftId === 'morning' ? raceA.promise : raceB.promise;
    shiftEl.value = 'morning';
    const raceStart = dailyCalls;
    const raceAPromise = globalThis.onShiftChange();
    await waitFor(() => dailyCalls === raceStart + 1, 'race A start');
    shiftEl.value = 'evening';
    const raceBPromise = globalThis.onShiftChange();
    await waitFor(() => dailyCalls === raceStart + 2, 'race B start');
    raceB.resolve([record('Bob', 3, 'evening')]);
    await raceBPromise;
    raceA.resolve([record('Alice', 1, 'morning')]);
    const raceAResult = await raceAPromise;
    check(raceAResult?.stale === true && globalThis.currentAttendanceData.Bob === 3,
        'runtime: A→B latest-wins remains intact');

    // Branch change clears an ineligible selected shift before any query.
    reset({ club: 'club-branch', branch: 'CS1', auth: 15 });
    shiftImpl = async () => [
        { id: 'cs1-a', name: 'CS1 A', branch: 'CS1' },
        { id: 'cs2-b', name: 'CS2 B', branch: 'CS2' },
        { id: 'global', name: 'Global' },
    ];
    dailyImpl = async () => [];
    await api.requestDailyRefresh('branch-config', { force: true });
    shiftEl.value = 'cs1-a';
    await globalThis.onShiftChange();
    const branchReadBefore = dailyCalls;
    const invalidBefore = globalThis.__attendanceDebug.invalidSelectedShiftCleared;
    branchEl.value = 'CS2';
    const branchBlocked = await api.requestDailyRefresh('branch-cs2', { force: true });
    check(branchBlocked?.blocked === true && dailyCalls === branchReadBefore && shiftEl.value === '',
        'runtime: branch change clears incompatible shift and performs zero blank reads');
    check(globalThis.__attendanceDebug.invalidSelectedShiftCleared === invalidBefore + 1,
        'runtime: incompatible branch selection is diagnosed once');
    shiftEl.value = 'cs2-b';
    await globalThis.onShiftChange();
    check(dailyCalls === branchReadBefore + 1 && lastDailyOptions?.shiftId === 'cs2-b',
        'runtime: selecting eligible Branch B shift performs one read');

    // Coach sees assigned/global shifts only and blank remains blocked.
    reset({ club: 'club-coach', role: 'coach', branch: 'CS1', auth: 16 });
    shiftImpl = async () => [
        { id: 'cs1-a', name: 'CS1 A', branch: 'CS1' },
        { id: 'cs2-b', name: 'CS2 B', branch: 'CS2' },
        { id: 'global', name: 'Global' },
    ];
    const coachDailyBefore = dailyCalls;
    const coachBlank = await api.requestDailyRefresh('coach-blank', { force: true });
    const coachIds = api.getEligibleShifts().map((shift) => shift.id).sort();
    check(coachBlank?.blocked === true && dailyCalls === coachDailyBefore,
        'runtime: Coach configured blank performs zero daily reads');
    check(coachIds.join(',') === 'cs1-a,global' && !coachIds.includes('cs2-b'),
        'runtime: Coach eligible shifts are assigned branch plus global only');

    // Delete selected shift while another remains: shift-required, zero all-shift read.
    reset({ club: 'club-delete', branch: 'all', auth: 17 });
    shiftImpl = async () => [
        { id: 'morning', name: 'Ca sáng' },
        { id: 'evening', name: 'Ca chiều' },
    ];
    dailyImpl = async () => [];
    await api.requestDailyRefresh('delete-config', { force: true });
    shiftEl.value = 'morning';
    await globalThis.onShiftChange();
    const deleteDailyBefore = dailyCalls;
    await globalThis.deleteShift('morning');
    check(api.getShiftAuthority().configured === true && api.getShiftAuthority().selectedShiftId === '' &&
        dailyCalls === deleteDailyBefore,
        'runtime: deleting selected shift leaves configured blank blocked with zero daily reads');

    // Creating the first shift closes legacy blank mode immediately.
    reset({ club: 'club-first-shift', auth: 18 });
    shiftImpl = async () => [];
    dailyImpl = async () => [];
    await api.requestDailyRefresh('first-shift-legacy', { force: true });
    const firstShiftDailyBefore = dailyCalls;
    shiftNameEl.value = 'Ca đầu tiên';
    await globalThis.addShift();
    check(api.getShiftAuthority().configured === true && dailyCalls === firstShiftDailyBefore,
        'runtime: first saved shift immediately converts blank to blocked authority');
    const firstShiftWriteBefore = saveRecordCalls + deleteRecordCalls + bulkSaveCalls;
    await globalThis.toggleAttendance('Alice');
    check(saveRecordCalls + deleteRecordCalls + bulkSaveCalls === firstShiftWriteBefore,
        'runtime: no legacy no-shift write is allowed after first shift save');

    // Offline explicit write carries shift; switching blank cannot enqueue more.
    reset({ club: 'club-offline', auth: 19, online: false });
    shiftImpl = async () => [{ id: 'morning', name: 'Ca sáng' }];
    dailyImpl = async () => [record('Alice', 0, 'morning')];
    await api.requestDailyRefresh('offline-config', { force: true });
    shiftEl.value = 'morning';
    await globalThis.onShiftChange();
    await globalThis.toggleAttendance('Alice');
    const offlineKey = Array.from(storage.keys()).find((key) => key.startsWith('offline_att_v2_'));
    const offlinePayload = JSON.parse(storage.get(offlineKey) || 'null');
    check(offlinePayload?.version === 2 && offlinePayload?.shiftId === 'morning' &&
        offlinePayload?.docId === 'Alice_2026-08-14_morning',
        'runtime: allowed offline record carries explicit shift identity');
    const offlineBytesBeforeBlank = storage.get(offlineKey);
    shiftEl.value = '';
    await globalThis.onShiftChange();
    await globalThis.toggleAttendance('Alice');
    await globalThis.bulkCheckIn();
    check(storage.get(offlineKey) === offlineBytesBeforeBlank,
        'runtime: configured blank cannot mutate offline queue');

    check(globalThis.__attendanceDebug.legacyNoShiftReads >= 1 &&
        globalThis.__attendanceDebug.explicitShiftReads >= 1 &&
        globalThis.__attendanceDebug.blankShiftAllReadPrevented >= 1 &&
        globalThis.__attendanceDebug.blankShiftWritePrevented >= 1,
        'runtime: required V5U6F read/write metrics are populated');
    check(bulkSyncCalls === 0, 'runtime simulation creates no unintended offline sync writes');
    check(saveShiftCalls >= 2, 'runtime shift create/delete scenarios use existing settings writer');
} catch (error) {
    failures.push(`runtime simulation failed: ${error?.stack || error}`);
}

for (const message of passes) console.log('✅', message);
if (failures.length) {
    console.error(`\n❌ V5U6F gate failed (${failures.length})`);
    failures.forEach((message) => console.error('FAIL:', message));
    process.exit(1);
}
console.log(`\n✅ V5U6F gate passed (${passes.length}/${passes.length} assertions)\n`);
