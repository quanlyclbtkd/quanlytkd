// H8R2 compatibility marker: attendance.service.js?v=long-term-production-stability-20260917-v5u6h8r2
/**
 * modules/attendance.js — Phase 2h (Đầy đủ)
 * ────────────────────────────────────────────────────────────────
 * Quản lý điểm danh buổi tập: điểm danh ngày, thống kê tháng,
 * quản lý ca tập, lịch sử thành viên, offline mode.
 *
 * Extracted từ app.js (lines 6763–8300+)
 *
 * BRIDGE PATTERN:
 *   - Đọc db, currentClubId, allProfiles từ window.__store tại call-time
 *   - Đọc Firebase SDK functions từ window._fb_init
 *   - Giữ state local (closure): _attCurrentProfiles, _attendanceCache, _clubShifts...
 *
 * /// NEW ARCHITECTURE — Phase 2h (Attendance Module)
 * ────────────────────────────────────────────────────────────────
 */

import { AttendanceService } from "../services/attendance.service.js?v=qr-v11r6-a9r17-mobile-layout-qr-20261026";
import { GlobalOwnershipRegistry } from '../core/globalOwnershipRegistry.js';
import { escapeHtml } from '../utils/helpers.js';
import { AttendanceJournal } from "../data/attendanceJournal.js?v=qr-v11r6-a9r17-mobile-layout-qr-20261026";
import { HISTORY_AUTHORITY, HISTORY_COACH_ACCESS, attendanceServerVersion, attendanceIntentId } from "../core/attendanceContract.js?v=qr-v11r6-a9r17-mobile-layout-qr-20261026";
import { shiftAuthority, classifyShiftScope, resolveTrainingShift, isShiftEligibleForBranch, inspectTrainingRegistration } from "../core/trainingRegistration.js?v=qr-v11r6-a9r17-mobile-layout-qr-20261026";

const ATTENDANCE_OWNER = 'js/modules/attendance.js';
const ATTENDANCE_OWNED_GLOBALS = Object.freeze([
    '_getClubShifts', '_ensureClubShiftsLoaded', '_renderHomeBirthdayBanner',
    'showAttMemberHistory', 'renderAttendanceList', 'onShiftChange',
    'openShiftModal', 'closeShiftModal', 'addShift', 'deleteShift',
    'toggleAttendance', 'toggleAttendanceStatus', 'bulkCheckIn',
    'syncOfflineAttendance', 'switchAttSubTab', 'renderAttMonthly',
    'printAttendanceStatus', 'printAttendanceSessionCompletion',
    'printAttendanceBranchReport'
]);

// ── Bridge helpers (đọc tại call-time — không cache lúc init) ──
function _db()       { return (window.__store || {}).db; }
function _clubId()   { return (window.__store || {}).clubId || (window.currentClubId || ''); }
function _profiles() { return (window.__store || {}).profiles || window.allProfiles || {}; }
function _config()   { return (window.__store || {}).clubConfig || {}; }
function _clubData() { return (window.__store || {}).clubData || {}; }
function _getLocalToday()  { return window.getLocalToday ? window.getLocalToday() : new Date().toISOString().slice(0, 10); }
function _sameBranch(left, right) {
    if (window.BranchIdentity?.isSameBranch) return window.BranchIdentity.isSameBranch(left, right);
    const normalize = (value) => {
        const raw = String(value || '').trim();
        return /^(Mặc định|mac dinh|default)$/i.test(raw) ? 'CS1' : raw.toUpperCase();
    };
    const a = normalize(left), b = normalize(right);
    return !!a && a === b;
}
/** @deprecated Phase 3.1 — Firebase calls đã chuyển sang AttendanceService */

// ── Module-local state (closure — giống biến cũ trong app.js) ──
let _attCurrentProfiles = [];
let _attCurrentDate     = '';
let _attendanceCache    = {};
let _attendanceServerVersions = {};
let _attendanceServerContext = '';
// Owned intents actually shown in this view. Their IDs express causality;
// pending/inflight entries never imply a server ACK.
let _attendanceIntentStates = new Map();
const _attendanceDerivedStats = new Map();
// Short-lived presentation of writes still awaiting the existing IDB owner.
// Never treated as a persisted intent or server ACK.
const _attendanceSavingEdits = new Map();
let _memberHistoryRequestId = 0;
function _memberHistoryAuthoritySnapshot() {
    const auth = window.__verifiedAuthContextState || {};
    return JSON.stringify([_clubId(),auth.uid,auth.role,auth.generation,auth.branchGeneration,auth.assignmentVersion,
        auth.allowedBranches,auth.activeBranch,auth.coachBranch,auth.ready,auth.branchSelectionPending,HISTORY_AUTHORITY]);
}
const _attendanceSyncOwner = attendanceIntentId();
let _attendanceSyncRequested = false;
let _clubShifts         = [];
let _clubShiftsLoadedClubId = '';
let _clubShiftsLoadPromise = null;
let _attendanceShiftRefreshRequested = false;
let _currentShiftId     = '';
let _attendanceInitialized = false;
let _attendanceInitializedClubId = '';
let _attendanceInitializedPrincipal = '';
let _onlineListenerBound = false;
let _offlineAttendanceSyncPromise = null;
let _offlineAttendanceActiveContext = null;
let _offlineAttendancePendingContext = null;
const _ATTENDANCE_OFFLINE_V2_PREFIX = 'offline_att_v2_';
const _ATTENDANCE_OFFLINE_SYNC_CHUNK = 400;
let _monthlyRenderRequestId = 0;
let _monthlyAbortController = null;
let _ownedAttendanceImplementations = null;

const _ATTENDANCE_DAILY_CACHE_TTL_MS = 20 * 1000;
const _ATTENDANCE_AUX_CACHE_TTL_MS = 30 * 1000;
const _attendanceDailyState = {
    requestGeneration: 0,
    currentSnapshotKey: '',
    currentSnapshotAuthGeneration: -1,
    currentSnapshotAt: 0,
    inFlight: new Map(),
    latestIntent: null,
    mutationRevision: 0,
    cacheReady: false,
};
// V5U6F: one module-local authority distinguishes an authoritative empty
// shifts document from loading/error/unknown. Blank shift is only legacy-safe
// after this state reaches ready + configured=false.
const _attendanceShiftAuthority = {
    clubId: '',
    authGeneration: 0,
    status: 'idle', // idle | loading | ready | error
    configured: null,
    eligibleCount: 0,
    selectedShiftId: '',
    lastError: '',
    updatedAt: 0,
};
const _coachNotesState = {
    cache: new Map(),
    inFlight: new Map(),
};

function _attendanceDebug() {
    const debug = window.__attendanceDebug = window.__attendanceDebug || {};
    const defaults = {
        dailyIntentCount: 0,
        dailyNetworkLoads: 0,
        dailySingleFlightCoalesced: 0,
        dailyCacheHits: 0,
        dailyStaleDropped: 0,
        dailyMutationRevisionDropped: 0,
        dailyPresentationOnlyRenders: 0,
        dailyLastKey: '',
        shiftsLoads: 0,
        shiftsCoalesced: 0,
        coachNotesLoads: 0,
        coachNotesCoalesced: 0,
        sessionNoteLoads: 0,
        sessionNoteCacheHits: 0,
        daySubtabMonthlyReadPrevented: 0,
        monthSubtabDailyReadPrevented: 0,
        shiftRequiredBlockedReads: 0,
        shiftRequiredBlockedWrites: 0,
        shiftConfigErrors: 0,
        shiftConfigRetryCount: 0,
        legacyNoShiftReads: 0,
        explicitShiftReads: 0,
        invalidSelectedShiftCleared: 0,
        blankShiftAllReadPrevented: 0,
        blankShiftWritePrevented: 0,
        offlineJournalQueued: 0,
        offlineJournalCoalesced: 0,
        offlineScopedCleanup: 0,
        offlineSyncFlights: 0,
        offlineSyncCoalesced: 0,
        offlineSyncErrors: 0,
        offlineSyncCrossClubBlocked: 0,
        offlineSyncInvalidShiftBlocked: 0,
        offlineSyncMalformedBlocked: 0,
        offlineSyncLegacyV1: 0,
        offlineCanonicalPayloadSanitized: 0,
        offlineJournalMetadataStripped: 0,
        offlineSyncContextCaptured: 0,
        offlineSyncContextStaleStops: 0,
        offlineSyncDifferentContextQueued: 0,
        offlineSyncDifferentContextFollowups: 0,
        offlineSyncPendingContextReplaced: 0,
        offlineSyncStaleUiRefreshDropped: 0,
        offlineSyncCommittedChunkCleanup: 0,
        offlineSyncUncommittedChunkPreserved: 0,
        offlineSyncLastErrorType: '',
    };
    Object.entries(defaults).forEach(([key, value]) => {
        if (!Number.isFinite(debug[key]) && typeof value === 'number') debug[key] = value;
        else if (debug[key] === undefined) debug[key] = value;
    });
    return debug;
}

function _authGeneration() {
    return Number(window.__verifiedAuthContextState?.generation || 0);
}

// RAM-only verified session identity. No new auth owner or persisted token.
function _captureOfflineAttendanceSyncContext() {
    const verified = window.__verifiedAuthContextState;
    const role = _attendanceCanonicalRole(verified?.role);
    const uid = String(verified?.uid || '').trim();
    const generation = Number(verified?.generation);
    const clubId = String(_clubId() || '').trim();
    const verifiedClub = String(verified?.clubId || '').trim();
    const coachBranch = role === 'coach' ? _canonicalAttendanceBranch(verified?.coachBranch, '') : '';
    const uiRole = _attendanceCanonicalRole(window.userRole);
    const storeRole = _attendanceCanonicalRole(window.__store?.userRole);
    const currentUserUid = String(window.__store?.currentUser?.uid || '').trim();
    const selectedClub = String(window.__store?.currentClubId || clubId).trim();
    const currentClub = String(window.currentClubId || clubId).trim();
    const mirrorBranch = _canonicalAttendanceBranch(window.coachBranch || '', '');
    const storeBranch = _canonicalAttendanceBranch(window.__store?.coachBranch || '', '');
    const allowed = verified && Object.prototype.hasOwnProperty.call(verified,'allowedBranches') ? verified.allowedBranches : [coachBranch];
    const valid = verified?.branchSelectionPending !== true && verified?.ready === true && !!uid &&
        Number.isSafeInteger(generation) && generation > 0 && !!clubId &&
        ['admin', 'super_admin', 'coach'].includes(role) &&
        uiRole === role && storeRole === role &&
        (!currentUserUid || currentUserUid === uid) &&
        selectedClub === clubId && currentClub === clubId &&
        (role === 'super_admin' || verifiedClub === clubId) &&
        (role !== 'coach' || (!!coachBranch && Array.isArray(allowed) && allowed.includes(coachBranch) &&
            (!mirrorBranch || _sameBranch(mirrorBranch, coachBranch)) &&
            (!storeBranch || _sameBranch(storeBranch, coachBranch))));
    const context = Object.freeze({
        clubId: valid ? clubId : '', authGeneration: generation,
        uid, role, coachBranch, branchGeneration:Number(verified?.branchGeneration||0), verifiedClub,
    });
    _attendanceDebug().offlineSyncContextCaptured++;
    return context;
}

function _sameOfflineAttendanceSyncContext(left, right) {
    return !!left && !!right && !!left.clubId && !!right.clubId &&
        String(left.clubId) === String(right.clubId) &&
        String(left.uid || '') === String(right.uid || '') &&
        String(left.role || '') === String(right.role || '') &&
        String(left.coachBranch || '') === String(right.coachBranch || '') &&
        Number(left.branchGeneration||0) === Number(right.branchGeneration||0) &&
        Number(left.authGeneration) === Number(right.authGeneration);
}

function _isOfflineAttendanceSyncContextCurrent(context) {
    if (!context?.clubId) return false;
    // Same verified principal AND still-canonical UI/store/selected-club mirrors.
    const verified = window.__verifiedAuthContextState;
    if (verified?.branchSelectionPending === true || Number(verified?.branchGeneration||0)!==Number(context.branchGeneration||0) || verified?.ready !== true || String(verified.uid || '') !== String(context.uid || '') ||
        _attendanceCanonicalRole(verified.role) !== context.role ||
        Number(verified.generation) !== Number(context.authGeneration) ||
        String(_clubId() || '') !== context.clubId ||
        _attendanceCanonicalRole(window.userRole) !== context.role ||
        _attendanceCanonicalRole(window.__store?.userRole) !== context.role ||
        (window.__store?.currentUser?.uid && String(window.__store.currentUser.uid) !== context.uid)) return false;
    if (context.role === 'super_admin') {
        return String(window.__store?.currentClubId || context.clubId) === context.clubId &&
            String(window.currentClubId || context.clubId) === context.clubId;
    }
    if (String(verified.clubId || '') !== context.clubId) return false;
    if (context.role === 'coach') {
        return (!Object.prototype.hasOwnProperty.call(verified,'allowedBranches') || (Array.isArray(verified.allowedBranches) && verified.allowedBranches.includes(context.coachBranch))) && _sameBranch(verified.coachBranch, context.coachBranch) &&
            (!window.coachBranch || _sameBranch(window.coachBranch, context.coachBranch)) &&
            (!window.__store?.coachBranch || _sameBranch(window.__store.coachBranch, context.coachBranch));
    }
    return true;
}

function _canonicalAttendanceBranch(value, fallback = '') {
    if (window.BranchIdentity?.normalize) return window.BranchIdentity.normalize(value, { fallback });
    const raw = String(value || '').trim();
    if (!raw) return fallback;
    return /^(Mặc định|mac dinh|default)$/i.test(raw) ? 'CS1' : raw;
}

function _isAttendanceMainTabActive() {
    const tab = document.getElementById('tab_attendance');
    return !!tab && tab.classList.contains('active');
}

function _isVisibleSubtab(el) {
    if (!el) return false;
    return el.style.display !== 'none' && !el.hidden;
}

function _isAttendanceDaySubtabActive() {
    return _isAttendanceMainTabActive() && _isVisibleSubtab(document.getElementById('att_sub_day'));
}

function _isAttendanceMonthSubtabActive() {
    return _isAttendanceMainTabActive() && _isVisibleSubtab(document.getElementById('att_sub_month'));
}

function _captureAttendanceDailyContext() {
    const dateEl = document.getElementById('att_date');
    const branchEl = document.getElementById('att_branch');
    const shiftEl = document.getElementById('att_shift');
    const role = _attendanceCanonicalRole(window.userRole || window.__store?.userRole || 'viewer');
    const coachBranch = role === 'coach'
        ? _canonicalAttendanceBranch(window.coachBranch || window.__store?.coachBranch || '', '')
        : '';
    const selectedBranch = branchEl && branchEl.value !== 'all' ? branchEl.value : '';
    const branch = role === 'coach'
        ? coachBranch
        : _canonicalAttendanceBranch(selectedBranch, selectedBranch ? '' : 'all');
    const date = String(dateEl?.value || _getLocalToday()).slice(0, 10);
    const shiftId = String(shiftEl?.value ?? _currentShiftId ?? '');
    const clubId = String(_clubId() || '').trim();
    return Object.freeze({
        clubId,
        authGeneration: _authGeneration(),
        role,
        date,
        branch: branch || (role === 'coach' ? '' : 'all'),
        shiftId,
        coachBranch,
        key: [clubId, date, branch || (role === 'coach' ? '' : 'all'), shiftId].join('|'),
    });
}

// Pure RAM helper. A branch-specific view receives its branch shifts plus
// global shifts; Coach can never see a shift owned by another branch.
function _getEligibleAttendanceShifts(context) {
    const ctx = context && typeof context === 'object' ? context : {};
    const role = String(ctx.role || '').toLowerCase();
    const branch = role === 'coach'
        ? _canonicalAttendanceBranch(ctx.coachBranch || ctx.branch || '', '')
        : _canonicalAttendanceBranch(ctx.branch || '', ctx.branch === 'all' ? 'all' : '');
    return _clubShifts.filter((shift) => {
        if (resolveTrainingShift(shift?.id,_clubShifts) !== shift || !classifyShiftScope(shift).resolved) return false;
        if (role === 'coach') return !!branch && isShiftEligibleForBranch(shift,branch);
        if (branch && branch !== 'all') return isShiftEligibleForBranch(shift,branch);
        return true;
    });
}

// Canonical read/write decision. This function only inspects module RAM and
// immutable context: no Firestore, DOM render, timer or polling authority.
function _resolveAttendanceShiftAuthority(context) {
    const ctx = context && typeof context === 'object' ? context : {};
    const selectedShiftId = String(ctx.shiftId || '');
    const identityMatches = _attendanceShiftAuthority.clubId === String(ctx.clubId || '') &&
        Number(_attendanceShiftAuthority.authGeneration || 0) === Number(ctx.authGeneration || 0);
    if (!identityMatches || _attendanceShiftAuthority.status !== 'ready') {
        return Object.freeze({
            allowed: false,
            mode: 'shift-config-unavailable',
            shiftId: '',
            eligibleShifts: [],
            invalidSelected: false,
            reason: _attendanceShiftAuthority.status === 'error'
                ? (_attendanceShiftAuthority.lastError || 'shift-config-error')
                : 'shift-config-not-ready',
        });
    }

    const eligibleShifts = _getEligibleAttendanceShifts(ctx);
    if (_attendanceShiftAuthority.configured === false) {
        return Object.freeze({
            allowed: true,
            mode: 'legacy-no-shift',
            shiftId: '',
            eligibleShifts,
            invalidSelected: !!selectedShiftId,
            reason: 'authoritative-empty-shift-list',
        });
    }
    if (!selectedShiftId) {
        return Object.freeze({
            allowed: false,
            mode: 'shift-required',
            shiftId: '',
            eligibleShifts,
            invalidSelected: false,
            reason: eligibleShifts.length ? 'explicit-shift-required' : 'no-eligible-shift-for-branch',
        });
    }
    if (!eligibleShifts.some((shift) => String(shift?.id || '') === selectedShiftId)) {
        return Object.freeze({
            allowed: false,
            mode: 'shift-required',
            shiftId: '',
            eligibleShifts,
            invalidSelected: true,
            reason: 'selected-shift-not-eligible',
        });
    }
    return Object.freeze({
        allowed: true,
        mode: 'explicit-shift',
        shiftId: selectedShiftId,
        eligibleShifts,
        invalidSelected: false,
        reason: 'eligible-explicit-shift',
    });
}

function _attendanceContextWithShift(context, shiftId, mode = '') {
    const resolvedShiftId = String(shiftId || '');
    return Object.freeze({
        ...context,
        shiftId: resolvedShiftId,
        shiftAuthorityMode: mode,
        key: [context.clubId, context.date, context.branch || (context.role === 'coach' ? '' : 'all'), resolvedShiftId].join('|'),
    });
}

function _normalizeAttendanceShiftDecision(context, decision) {
    if (decision.invalidSelected) {
        const shiftEl = document.getElementById('att_shift');
        if (shiftEl) shiftEl.value = '';
        _currentShiftId = '';
        _attendanceDebug().invalidSelectedShiftCleared++;
    }
    _attendanceShiftAuthority.eligibleCount = decision.eligibleShifts.length;
    _attendanceShiftAuthority.selectedShiftId = decision.shiftId;
    return _attendanceContextWithShift(context, decision.shiftId, decision.mode);
}

function _sameAttendanceContext(left, right) {
    return !!left && !!right && left.clubId === right.clubId &&
        Number(left.authGeneration || 0) === Number(right.authGeneration || 0) &&
        left.date === right.date && left.branch === right.branch && left.shiftId === right.shiftId;
}

function _isAttendanceDailyTokenCurrent(token) {
    if (!token || !_attendanceDailyState.latestIntent) return false;
    const current = _captureAttendanceDailyContext();
    return _isAttendanceDaySubtabActive() &&
        _sameAttendanceContext(token, current) &&
        _sameAttendanceContext(token, _attendanceDailyState.latestIntent) &&
        Number(token.generation || 0) === Number(_attendanceDailyState.requestGeneration || 0) &&
        Number(token.mutationRevision || 0) === Number(_attendanceDailyState.mutationRevision || 0);
}

function _markAttendanceDailyMutation(reason) {
    _attendanceDailyState.mutationRevision += 1;
    _attendanceDebug().dailyLastMutationReason = String(reason || 'local-write');
    return _attendanceDailyState.mutationRevision;
}

function _closeMemberHistory(remove = false) {
    _memberHistoryRequestId++;
    const modal = document.getElementById('attHistModal');
    if (!modal) return false;
    if (remove) modal.remove();
    else {
        modal.style.display = 'none';
        modal.querySelector('#attHistBody')?.replaceChildren();
    }
    return true;
}

function _resetAttendanceModuleState(nextClubId) {
    _closeMemberHistory(true);
    document.getElementById('attendanceReviewSheet')?.remove();
    document.getElementById('attendanceJournalControls')?.remove();
    _attCurrentProfiles = [];
    _attCurrentDate = '';
    _attendanceCache = {};
    _attendanceServerVersions = {};
    _attendanceServerContext = '';
    _attendanceIntentStates.clear();
    _attendanceDerivedStats.clear();
    _attendanceSavingEdits.clear();
    _clubShifts = [];
    _clubShiftsLoadedClubId = '';
    _clubShiftsLoadPromise = null;
    _attendanceShiftRefreshRequested = false;
    _currentShiftId = '';
    Object.assign(_attendanceShiftAuthority, {
        clubId: nextClubId || '',
        authGeneration: _authGeneration(),
        status: 'idle',
        configured: null,
        eligibleCount: 0,
        selectedShiftId: '',
        lastError: '',
        updatedAt: Date.now(),
    });
    _attendanceDailyState.requestGeneration += 1;
    _attendanceDailyState.currentSnapshotKey = '';
    _attendanceDailyState.currentSnapshotAuthGeneration = -1;
    _attendanceDailyState.currentSnapshotAt = 0;
    _attendanceDailyState.inFlight.clear();
    _attendanceDailyState.latestIntent = null;
    _attendanceDailyState.mutationRevision = 0;
    _attendanceDailyState.cacheReady = false;
    _coachNotesState.cache.clear();
    _coachNotesState.inFlight.clear();
    _attendanceInitializedClubId = nextClubId || '';
    window.currentAttendanceData = {};
    if (_monthlyAbortController) {
        try { _monthlyAbortController.abort(); } catch (_) {}
        _monthlyAbortController = null;
    }
    _monthlyRenderRequestId++;
}

async function _loadSessionNoteAfterAttendanceRender(context) {
    const date = context?.date || '';
    if (!date || !_isAttendanceDailyTokenCurrent(context) || (window.userRole !== 'coach' && window.userRole !== 'admin')) return;
    if (typeof window.loadSessionNote !== 'function') return;
    try {
        await Promise.resolve(window.loadSessionNote(date, { attendanceContext: context }));
    } catch (error) {
        console.warn('[Attendance] Không thể tải ghi chú buổi tập:', error && error.message || error);
    }
}

function _registerAttendanceOwnership(legacyFallbacks = {}) {
    if (!_ownedAttendanceImplementations) {
        _ownedAttendanceImplementations = Object.fromEntries(
            ATTENDANCE_OWNED_GLOBALS.map((name) => [name, window[name]])
        );
    }
    const results = [];
    for (const [name, implementation] of Object.entries(_ownedAttendanceImplementations)) {
        if (typeof implementation !== 'function') {
            results.push({ ok: false, name, reason: 'missing-implementation' });
            continue;
        }
        // Preserve the classic-script bridge before installing the canonical
        // implementation. The module builds its functions on window for inline
        // handler compatibility, so without this temporary restore the registry
        // would see only the canonical function and lose the rollback reference.
        const legacyFallback = legacyFallbacks[name];
        if (typeof legacyFallback === 'function' && legacyFallback !== implementation) {
            window[name] = legacyFallback;
        }
        const result = GlobalOwnershipRegistry.register(name, implementation, {
            owner: ATTENDANCE_OWNER,
            risk: name.startsWith('print') ? 'attendance-diagnostics-readonly' : 'attendance-core',
            policy: 'module-primary'
        });
        if (!result.ok) window[name] = implementation;
        results.push(result);
    }
    return results;
}

function _restoreAttendanceOwnership() {
    ATTENDANCE_OWNED_GLOBALS.forEach((name) => {
        const result = GlobalOwnershipRegistry.restoreCanonical(name);
        if (!result.ok && result.reason !== 'not-registered') {
            console.warn('[Attendance] Không thể phục hồi canonical global:', result);
        }
    });
}

// ── Phase 4.0B-4J-5 Helpers ──────────────────────────────────────

/** Tạo docId cho bản ghi điểm danh — shift-aware */
function getAttendanceDocId(name, date, shiftId) {
    return shiftId ? name + '_' + date + '_' + shiftId : name + '_' + date;
}

/** Kiểm tra võ sinh active — tương thích legacy (thiếu status) */
function isActiveProfileForAttendance(p) {
    if (!p) return false;
    if (typeof window.classifyProfileStatus === 'function') {
        return window.classifyProfileStatus(p) === 'active';
    }
    if (!p.status) return true; // legacy: thiếu status → coi là đang tập
    return p.status === 'active' || p.status === 'trial' || p.status === 'đang tập';
}

// ── Trạng thái điểm danh (4 mức) ────────────────────────────────
const _ATT_STATUS = [
    { label: 'Chưa điểm danh', bg: '#f8fafc', text: '#64748b', border: '#cbd5e1', icon: '—'  },
    { label: 'Có mặt',         bg: '#f0fdf4', text: '#16a34a', border: '#22c55e', icon: '✅' },
    { label: 'Vắng mặt',       bg: '#fef2f2', text: '#dc2626', border: '#ef4444', icon: '❌' },
    { label: 'Có phép',        bg: '#fefce8', text: '#ca8a04', border: '#eab308', icon: '📝' },
];

function _mapLegacyStatus(s) {
    return (s >= 0 && s <= 3) ? s : 0;
}

// ── Phase 4.0B-4J-6 — SCHEDULED SESSION CALCULATION ─────────────────────────

/**
 * Tính danh sách ngày phải tập trong tháng dựa vào lịch học của võ sinh.
 * Không ghi Firestore.
 *
 * @param {Object} profile   — profile object của võ sinh
 * @param {string} monthStr  — YYYY-MM
 * @param {Object} options   — { branch, shiftId, scheduleDays }
 * @returns {Array<{date, weekday, shiftId, branch, expected}>}
 */
function getScheduledTrainingDatesForProfile(profile, monthStr, options) {
    options = options || {};
    if (!profile || !monthStr) return [];
    const scheduleDays = options.scheduleDays
        || (Array.isArray(profile.trainingDays) ? profile.trainingDays : null)
        || (Array.isArray(profile.scheduleDays)  ? profile.scheduleDays  : null);
    if (!scheduleDays || scheduleDays.length === 0) {
        // Không có lịch — trả [] với warning nhẹ (không log PII)
        return [];
    }
    const parts = monthStr.split('-');
    const yr = parseInt(parts[0], 10);
    const mo = parseInt(parts[1], 10);
    if (!yr || !mo || mo < 1 || mo > 12) return [];
    const daysInMonth = new Date(yr, mo, 0).getDate();
    const branch  = options.branch  || profile.branch  || '';
    const shiftId = options.shiftId || profile.trainingShiftId || '';
    const result  = [];
    for (let day = 1; day <= daysInMonth; day++) {
        const dow = new Date(yr, mo - 1, day).getDay(); // 0=CN,1=T2,...,6=T7
        if (scheduleDays.includes(dow)) {
            const dateStr = yr + '-' + String(mo).padStart(2, '0') + '-' + String(day).padStart(2, '0');
            result.push({ date: dateStr, weekday: dow, shiftId, branch, expected: true });
        }
    }
    return result;
}

/**
 * Tính thống kê chuyên cần chuẩn theo lịch học thực tế.
 * Không ghi Firestore.
 *
 * @param {Object} profile       — profile object của võ sinh
 * @param {string} monthStr      — YYYY-MM
 * @param {Object} attendanceMap — { 'YYYY-MM-DD': status }  (1=có mặt, 2=vắng, 3=phép, undefined=chưa ĐD)
 * @param {Object} options       — tuỳ chọn ghi đè lịch
 * @returns {{expectedSessions, presentCount, absentCount, excusedCount,
 *            missingAttendanceCount, lateCount, attendanceRate, completionRate}}
 */
function computeMonthlyAttendanceAccuracy(profile, monthStr, attendanceMap, options) {
    options = options || {};
    attendanceMap = attendanceMap || {};
    // [4J-6A] Tên võ sinh để tra key shift-aware (tuỳ chọn)
    const profileName = options.profileName || '';
    const scheduledDates = getScheduledTrainingDatesForProfile(profile, monthStr, options);
    const expectedSessions = scheduledDates.length;
    let presentCount = 0, absentCount = 0, excusedCount = 0, missingAttendanceCount = 0;
    scheduledDates.forEach(function(entry) {
        // [4J-6A] Tra theo thứ tự ưu tiên: shiftId key → name+date key → date key
        const entryShiftId = entry.shiftId || profile.trainingShiftId || '';
        let raw =
            (profileName && entryShiftId
                ? attendanceMap[profileName + '_' + entry.date + '_' + entryShiftId]
                : undefined) ||
            (profileName
                ? attendanceMap[profileName + '_' + entry.date]
                : undefined) ||
            attendanceMap[entry.date];
        // Nếu raw là object (từ loadByMonth), lấy .status; nếu là số, dùng trực tiếp
        const st = (raw !== null && raw !== undefined)
            ? (typeof raw === 'object' ? (raw.status || 0) : raw)
            : undefined;
        if      (st === 1) presentCount++;
        else if (st === 2) absentCount++;
        else if (st === 3) excusedCount++;
        else               missingAttendanceCount++; // có lịch nhưng chưa có bản ghi
    });
    const attendanceRate  = expectedSessions > 0 ? presentCount / expectedSessions : null;
    const completionRate  = expectedSessions > 0 ? (presentCount + absentCount + excusedCount) / expectedSessions : null;
    return {
        expectedSessions,
        presentCount,
        absentCount,
        excusedCount,
        missingAttendanceCount,
        lateCount: 0,
        attendanceRate,
        completionRate
    };
}

// ── Lấy danh sách võ sinh đã lọc theo branch/belt/ngày/ca ────────
function _getFilteredAttProfiles() {
    const branchEl  = document.getElementById('att_branch');
    const beltEl    = document.getElementById('att_belt');
    const allProfs  = _profiles();
    let selBranch   = branchEl ? branchEl.value : 'all';
    const verified = window.__verifiedAuthContextState;
    if (_attendanceCanonicalRole(verified?.role) === 'coach') {
        if (verified?.ready !== true ||
            _attendanceCanonicalRole(window.userRole) !== 'coach' ||
            _attendanceCanonicalRole(window.__store?.userRole) !== 'coach' ||
            !String(verified.coachBranch || '').trim()) return [];
        selBranch = _canonicalAttendanceBranch(verified.coachBranch, '');
    } else if (_attendanceCanonicalRole(window.userRole) === 'coach') {
        // Unknown/stale Coach principal must not use the DOM's `all` selector.
        return [];
    }
    const selBelt   = beltEl ? beltEl.value : 'all';
    const selDateVal = document.getElementById('att_date') ? document.getElementById('att_date').value : '';
    const dayOfWeek  = selDateVal ? new Date(selDateVal + 'T00:00:00').getDay() : -1;
    const showAllEl  = document.getElementById('chk_show_all_att');
    const isShowAll  = showAllEl ? showAllEl.checked : false;

    return Object.entries(allProfs)
        .filter(([, p]) => isActiveProfileForAttendance(p))
        .filter(([, p]) => selBranch === 'all' || _sameBranch(p.branch, selBranch))
        .filter(([, p]) => inspectTrainingRegistration(p, _clubShifts).issues.length === 0)
        .filter(([, p]) => {
            if (selBelt === 'all') return true;
            return (p.belt || '').toLowerCase().includes(selBelt.toLowerCase());
        })
        .filter(([, p]) => {
            if (isShowAll) return true;
            if (!Array.isArray(p.trainingDays) || p.trainingDays.length === 0) return true;
            return p.trainingDays.includes(dayOfWeek);
        })
        .filter(([, p]) => {
            if (isShowAll) return true;
            if (!_currentShiftId) return true;
            if (!p.trainingShiftId) return true;
            return p.trainingShiftId === _currentShiftId;
        })
        .filter(([, p]) => {
            if (isShowAll) return true;
            if (!selDateVal) return true;
            const selMon = selDateVal.substring(0, 7);
            return !(Array.isArray(p.skippedMonths) && p.skippedMonths.includes(selMon));
        })
        .sort((a, b) => a[0].localeCompare(b[0], 'vi'));
}

// ── Render lưới thẻ điểm danh ────────────────────────────────────
function _renderAttCards() {
    const gridEl = document.getElementById('attendanceGrid');
    if (!gridEl) return;
    const allProfs = _profiles();
    // B7: Coach roster currently uses status-filtered queries; a one-shot
    // fallback is only provisional. Never present a partial "0 students" as a
    // verified branch-wide count. This is presentation-only, no new reads.
    const _coachRosterState = (_attendanceCanonicalRole(window.__verifiedAuthContextState?.role) === 'coach' ||
        _attendanceCanonicalRole(window.userRole) === 'coach')
        ? (window.getProfilesListenerMetrics?.().coachRosterReadiness || 'pending') : 'verified';
    const _coachRosterWarning = _coachRosterState !== 'verified'
        ? '<div role="status" aria-live="polite" style="grid-column:1/-1;padding:10px 12px;background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;color:#9a3412;font-size:0.83rem;line-height:1.4;">⚠️ Danh sách võ sinh đang chờ xác minh đầy đủ theo cơ sở. Số lượng hiển thị chỉ là tạm thời; cần kiểm tra trước khi kết luận vắng mặt.</div>'
        : '';
    if (_attCurrentProfiles.length === 0) {
        gridEl.innerHTML = _coachRosterWarning + '<div style="grid-column:1/-1;text-align:center;padding:48px 16px;color:#94a3b8;font-style:italic;font-size:0.88rem;">' + (_coachRosterState === 'verified' ? 'Không có võ sinh nào phù hợp bộ lọc' : 'Chưa có dữ liệu võ sinh đã được xác minh đầy đủ') + '</div>';
        _updateAttSummary([0,0,0,0,0]);
        return;
    }
    const _attStripSuffix = (k) => k.replace(/\s*\([^)]*\)\s*$/, '').replace(/\s*\[[^\]]*\]\s*$/, '').trim().toLowerCase();
    const _attDisplayName = (profileKey, profile) => {
        const raw = (window.ProfileCanonicalStore && typeof window.ProfileCanonicalStore.resolveDisplayName === 'function')
            ? window.ProfileCanonicalStore.resolveDisplayName(profileKey, profile)
            : String(profile?.displayName || profile?.name || profile?.fullName || profile?.studentName || profileKey || '').trim();
        return raw.replace(/\s*\([^)]*\)\s*$/, '').replace(/\s*\[[^\]]*\]\s*$/, '').trim();
    };
    const _attNCount = {};
    Object.keys(allProfs || {}).forEach(n => {
        const k = _attStripSuffix(n);
        _attNCount[k] = (_attNCount[k] || 0) + 1;
    });
    let html = _coachRosterWarning;
    const savingProjection = _attendanceSavingProjection();
    window.currentAttendanceData = {};
    _attCurrentProfiles.forEach(([name]) => {
        const docId = _currentShiftId ? name + '_' + _attCurrentDate + '_' + _currentShiftId : name + '_' + _attCurrentDate;
        const saving = savingProjection.get(docId);
        window.currentAttendanceData[name] = _mapLegacyStatus(saving ? saving.status : (_attendanceCache[docId] || 0));
    });
    const _attCurMonth = _attCurrentDate ? _attCurrentDate.substring(0, 7) : '';
    const summary = [0, 0, 0, 0];
    _attCurrentProfiles.forEach(([name, p], idx) => {
        const docId   = _currentShiftId ? name + '_' + _attCurrentDate + '_' + _currentShiftId : name + '_' + _attCurrentDate;
        const status  = window.currentAttendanceData[name] ?? 0;
        const cfg     = _ATT_STATUS[status];
        const saving = savingProjection.get(docId);
        const journalState = _attendanceIntentStates.get(docId)?.state;
        const permissionBlocked = String(_attendanceIntentStates.get(docId)?.lastError || '').includes('permission-denied');
        const journalLabel = saving ? 'Đang lưu trên thiết bị' : journalState ? (['pending','inflight'].includes(journalState) ? 'Chờ máy chủ xác nhận' : permissionBlocked ? 'Bị chặn quyền lưu' : 'Cần đối soát') : '';
        const beltShort = (p.belt || 'Đai Trắng')
            .replace(/\s*\(Cấp \d+\)/g, '').replace('Đai ', '').replace(' - cấp', '').trim();
        summary[status]++;
        const _derived = _attendanceDerivedStats.get(name);
        const _consAbsent = _derived?.consecutiveAbsences || 0;
        const churnWarn2 = _consAbsent === 2;
        const churnWarn3 = _consAbsent >= 3;
        const sessAttended = _derived?.present || 0;
        const sessRequired = _derived?.total || 1;
        const sessPercent = Math.min(100, Math.round(sessAttended / sessRequired * 100));
        const sessColor = sessPercent >= 100 ? '#16a34a' : sessPercent >= 60 ? '#2563eb' : '#f97316';
        const tuitionBadge = (p.tuitionStatus === 'unpaid' || p.tuitionStatus === 'overdue')
            ? '<span class="att-tuition-warn" title="Nợ học phí" style="display:inline-block;margin-left:3px;font-size:0.68rem;animation:attWarnPulse 1.4s ease-in-out infinite;">⚠️</span>' : '';
        const _churnIcon  = churnWarn3 ? '🔴' : churnWarn2 ? '🟡' : '';
        const _churnClass = churnWarn3 ? 'abs-warn-red' : churnWarn2 ? 'abs-warn-yellow' : '';
        const _churnTitle = churnWarn3
            ? 'Nghỉ ' + _consAbsent + ' buổi không phép liên tiếp — cần báo phụ huynh!'
            : churnWarn2 ? 'Nghỉ 2 buổi không phép liên tiếp — chú ý theo dõi!' : '';
        const churnBadge = '<span data-churn-icon class="' + _churnClass + '"'
            + ' title="' + _churnTitle + '"'
            + ' style="margin-left:3px;font-size:0.72rem;' + ((!churnWarn2 && !churnWarn3) ? 'display:none;' : '') + '">'
            + _churnIcon + '</span>';
        const _attDob = p.dob || '';
        let _attYr = _attDob.includes('/') ? _attDob.split('/')[2] : (_attDob.includes('-') ? _attDob.split('-')[0] : '');
        if (!_attYr) { const _ym = name.match(/\((\d{4})/); if (_ym) _attYr = _ym[1]; }
        const _attIsDup = (_attNCount[_attStripSuffix(name)] || 0) > 1;
        const attYearBadge = (_attIsDup && _attYr)
            ? '<sup style="font-size:0.55rem;color:#94a3b8;font-weight:700;margin-left:2px;vertical-align:super;line-height:0;">' + _attYr + '</sup>' : '';
        const _attJoinM = p.createdAt ? p.createdAt.substring(0, 7) : '';
        const attNewBadge = (_attJoinM && _attCurMonth && _attJoinM === _attCurMonth)
            ? '<span style="font-size:0.58rem;background:#dcfce7;color:#15803d;border:1px solid #bbf7d0;border-radius:4px;padding:1px 4px;font-weight:900;margin-left:3px;vertical-align:middle;">MỚI</span>' : '';
        const _nickname = (p.nickname || '').trim();
        const _safeNameHtml = escapeHtml(name);
        const _historyProfileToken = encodeURIComponent(name).replace(/'/g,'%27');
        const _safeDisplayNameHtml = escapeHtml(_attDisplayName(name, p));
        const _safeNicknameHtml = escapeHtml(_nickname);
        const _safeBeltHtml = escapeHtml(beltShort);
        const _cardWarnClass = churnWarn3 ? 'att-card-warn-red' : churnWarn2 ? 'att-card-warn-yellow' : '';
        html += '<div id="att_card_' + idx + '"'
            + (_cardWarnClass ? ' class="' + _cardWarnClass + '"' : '')
            + ' onclick="window.toggleAttendance(' + idx + ')"'
            + ' style="background:' + cfg.bg + ';color:' + cfg.text + ';border:1.5px solid ' + cfg.border + ';border-radius:10px;padding:8px 10px;cursor:pointer;user-select:none;display:flex;flex-direction:column;gap:5px;transition:transform 0.12s;box-shadow:0 1px 3px rgba(0,0,0,0.06);-webkit-tap-highlight-color:transparent;min-height:74px;"'
            + ' onpointerdown="this.style.transform=\'scale(0.94)\'" onpointerup="this.style.transform=\'\'" onpointercancel="this.style.transform=\'\'">'
            + '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:4px;">'
            + '<div style="flex:1;min-width:0;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">'
            + '<span data-hidx="' + idx + '" onclick="event.stopPropagation();window.showAttMemberHistory(decodeURIComponent(\'' + _historyProfileToken + '\'))" title="' + _safeNameHtml + ' — Xem lịch sử" style="font-weight:800;font-size:clamp(0.83rem,3.8vw,0.97rem);line-height:1.25;word-break:break-word;text-decoration:underline dotted;text-underline-offset:2px;cursor:pointer;">'
            + _safeDisplayNameHtml + attYearBadge + attNewBadge + tuitionBadge + churnBadge
            + '</span></div>'
            + '<div style="font-size:1.15rem;flex-shrink:0;line-height:1;margin-top:1px;">' + cfg.icon + '</div>'
            + '</div>'
            + (_nickname ? '<div style="font-size:0.58rem;font-weight:800;color:#7c3aed;background:#ede9fe;border:1px solid #ddd6fe;border-radius:5px;padding:2px 7px;display:inline-block;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:-1px;">🏷 ' + _safeNicknameHtml + '</div>' : '')
            + '<div style="display:flex;align-items:center;justify-content:space-between;gap:3px;">'
            + '<div style="font-size:0.68rem;font-weight:700;opacity:0.85;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">🥋 ' + _safeBeltHtml + '</div>'
            + '<div id="att_lbl_' + idx + '" style="font-size:0.65rem;font-weight:800;opacity:0.8;white-space:nowrap;flex-shrink:0;">' + cfg.icon + ' ' + cfg.label + '</div>'
            + '</div>'
            + '<div style="font-size:0.63rem;color:#64748b">' + (_derived ? sessAttended + '/' + _derived.total + ' buổi có mặt · ' + escapeHtml(_derived.label) : 'Chạm tên để xem chuyên cần đã xác minh') + '</div>'
            + (journalLabel ? '<div data-att-pending style="font-size:0.66rem;color:#92400e;font-weight:700">' + journalLabel + '</div>' : '')
            + '<div title="' + (_derived ? sessAttended + '/' + _derived.total + ' buổi có mặt trong ' + _derived.label : 'Xem lịch sử để tải chuyên cần đã xác minh') + '" style="height:2px;background:rgba(0,0,0,0.1);border-radius:2px;overflow:hidden;">'
            + '<div data-attbar="' + idx + '" style="width:' + sessPercent + '%;height:2px;background:' + sessColor + ';border-radius:2px;transition:width 0.4s;"></div>'
            + '</div>'
            + '</div>';
    });
    gridEl.innerHTML = html;
    _updateAttSummary(summary);
    _renderAdminBranchSummary(summary);
    _renderAttendanceJournalControls();
}

function _renderAdminBranchSummary(totalSummary) {
    const wrapEl = document.getElementById('admin_daily_branch_summary');
    const bodyEl = document.getElementById('admin_daily_branch_body');
    if (!wrapEl || !bodyEl) return;
    if (window.userRole !== 'admin' && window.userRole !== 'super_admin') { wrapEl.style.display = 'none'; return; }
    const branchStats = {};
    _attCurrentProfiles.forEach(([name, p]) => {
        const branch = p.branch || 'Chung';
        if (!branchStats[branch]) branchStats[branch] = { present: 0, absent: 0, excused: 0, pending: 0, total: 0 };
        const st = window.currentAttendanceData[name] ?? 0;
        branchStats[branch].total++;
        if (st === 1) branchStats[branch].present++;
        else if (st === 2) branchStats[branch].absent++;
        else if (st === 3) branchStats[branch].excused++;
        else branchStats[branch].pending++;
    });
    const branches = Object.keys(branchStats);
    if (branches.length === 0) { wrapEl.style.display = 'none'; return; }
    wrapEl.style.display = 'block';
    let html = '';
    if (branches.length > 1) {
        html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:8px;">';
        branches.sort().forEach(br => {
            const s = branchStats[br];
            const brName = window.getBranchNameDisplay ? window.getBranchNameDisplay(br) : br;
            const _safeBrName = escapeHtml(brName);
            const _safeBrId = escapeHtml(br);
            const pct = s.total > 0 ? Math.round(s.present / s.total * 100) : 0;
            const pctColor = pct >= 80 ? '#16a34a' : pct >= 60 ? '#d97706' : '#dc2626';
            html += `<div style="background:#f8fafc;border-radius:10px;padding:10px 12px;border:1.5px solid #e2e8f0;">
                <div style="font-size:0.7rem;font-weight:900;color:#0033A0;margin-bottom:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">📍 ${_safeBrName}</div>
                <div style="display:flex;gap:6px;flex-wrap:wrap;">
                    <span style="font-size:0.7rem;background:#f0fdf4;color:#16a34a;padding:2px 7px;border-radius:99px;font-weight:800;border:1px solid #22c55e;">✅ ${s.present}</span>
                    <span style="font-size:0.7rem;background:#fef2f2;color:#dc2626;padding:2px 7px;border-radius:99px;font-weight:800;border:1px solid #ef4444;">❌ ${s.absent}</span>
                    <span style="font-size:0.7rem;background:#fefce8;color:#ca8a04;padding:2px 7px;border-radius:99px;font-weight:800;border:1px solid #eab308;">📝 ${s.excused}</span>
                </div>
                <div style="margin-top:6px;height:4px;background:#e2e8f0;border-radius:2px;overflow:hidden;">
                    <div style="width:${pct}%;height:4px;background:${pctColor};border-radius:2px;transition:width 0.4s;"></div>
                </div>
                <div style="font-size:0.65rem;color:#64748b;margin-top:3px;font-weight:700;">${pct}% chuyên cần · ${s.total} VS</div>
                <div id="coach_info_${_safeBrId}" style="margin-top:5px;min-height:13px;"><span style="font-size:0.6rem;color:#cbd5e1;">⏳</span></div>
            </div>`;
        });
        html += '</div>';
    } else {
        const _onlyBr = branches[0];
        const _safeOnlyBrId = escapeHtml(_onlyBr);
        const s = Object.values(branchStats)[0];
        const pct = s.total > 0 ? Math.round(s.present / s.total * 100) : 0;
        const pctColor = pct >= 80 ? '#16a34a' : pct >= 60 ? '#d97706' : '#dc2626';
        html = `<div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
                <span style="font-size:0.78rem;background:#f0fdf4;color:#16a34a;padding:4px 12px;border-radius:99px;font-weight:800;border:1.5px solid #22c55e;">✅ Có mặt: ${s.present}</span>
                <span style="font-size:0.78rem;background:#fef2f2;color:#dc2626;padding:4px 12px;border-radius:99px;font-weight:800;border:1.5px solid #ef4444;">❌ Vắng: ${s.absent}</span>
                <span style="font-size:0.78rem;background:#fefce8;color:#ca8a04;padding:4px 12px;border-radius:99px;font-weight:800;border:1.5px solid #eab308;">📝 Có phép: ${s.excused}</span>
                <span style="font-size:0.78rem;font-weight:900;color:${pctColor};">${pct}% chuyên cần</span>
            </div>
            <div id="coach_info_${_safeOnlyBrId}" style="margin-top:6px;min-height:13px;"><span style="font-size:0.6rem;color:#cbd5e1;">⏳</span></div>
        </div>`;
    }
    bodyEl.innerHTML = html;
}

function _applyCoachNotesToBranchSummary(_notesList, context) {
    if (!_isAttendanceDailyTokenCurrent(context)) return false;
    try {
        const _nSnap = { forEach: (fn) => _notesList.forEach(item => fn({ data: () => item.data, id: item.id })) };
        const _brData = {};
        _nSnap.forEach(d => {
            const nd = d.data();
            const _br = nd.branch || '_noBranch';
            const _cn = nd.coachName || '';
            const _nt = (nd.note || '').trim();
            if (!_brData[_br]) _brData[_br] = { coaches: [], notes: [] };
            if (_cn && !_brData[_br].coaches.includes(_cn)) _brData[_br].coaches.push(_cn);
            if (_nt) _brData[_br].notes.push({ coach: _cn, note: _nt });
        });
        Object.entries(_brData).forEach(([br, data]) => {
            const el = document.getElementById('coach_info_' + br);
            if (!el) return;
            const multiCoach = data.coaches.length > 1;
            const coachLine = data.coaches.length
                ? `<div style="font-size:0.62rem;font-weight:800;color:#0033A0;margin-bottom:3px;">👨‍🏫 ${data.coaches.map(escapeHtml).join(', ')}</div>` : '';
            const notesHtml = data.notes.map(n => {
                const pfx = multiCoach && n.coach ? `<span style="color:#0052cc;font-weight:800;">${escapeHtml(n.coach)}: </span>` : '';
                return `<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:6px 9px;margin-top:4px;">
                    <div style="font-size:0.6rem;color:#15803d;font-weight:700;margin-bottom:2px;">✏️ Ghi chú buổi tập</div>
                    <div style="font-size:0.75rem;color:#1e293b;line-height:1.55;white-space:pre-line;">${pfx}${escapeHtml(n.note)}</div>
                </div>`;
            }).join('');
            el.innerHTML = coachLine + (notesHtml || '<span style="font-size:0.6rem;color:#94a3b8;">HLV chưa để lại nội dung ghi chú</span>');
            el.style.marginTop = '7px';
        });
        document.querySelectorAll('[id^="coach_info_"]').forEach(el => {
            if (el.innerHTML.includes('⏳')) {
                el.innerHTML = '<span style="font-size:0.6rem;color:#cbd5e1;">Chưa có ghi chú hôm nay</span>';
            }
        });
        return true;
    } catch(_e) {
        document.querySelectorAll('[id^="coach_info_"]').forEach(el => {
            if (el.innerHTML.includes('⏳')) el.innerHTML = '';
        });
        return false;
    }
}

function _applyCachedCoachNotes(context) {
    if (!context || (context.role !== 'admin' && context.role !== 'super_admin')) return false;
    const key = context.clubId + '|' + context.date;
    const cached = _coachNotesState.cache.get(key);
    return cached ? _applyCoachNotesToBranchSummary(cached.items, context) : false;
}

async function _loadCoachForBranchSummary(context, options = {}) {
    if (!context?.date || !context.clubId) return null;
    if (context.role !== 'admin' && context.role !== 'super_admin') return null;
    const key = context.clubId + '|' + context.date;
    const cached = _coachNotesState.cache.get(key);
    if (!options.force && cached && (Date.now() - cached.loadedAt) <= _ATTENDANCE_AUX_CACHE_TTL_MS) {
        _applyCoachNotesToBranchSummary(cached.items, context);
        return cached.items;
    }
    if (_coachNotesState.inFlight.has(key)) {
        _attendanceDebug().coachNotesCoalesced++;
        const items = await _coachNotesState.inFlight.get(key);
        if (_isAttendanceDailyTokenCurrent(context)) {
            _coachNotesState.cache.set(key, { items, loadedAt: Date.now() });
        }
        _applyCoachNotesToBranchSummary(items, context);
        return items;
    }
    const promise = (async () => {
        _attendanceDebug().coachNotesLoads++;
        const items = await AttendanceService.loadCoachNotes(context.date);
        if (_isAttendanceDailyTokenCurrent(context)) {
            _coachNotesState.cache.set(key, { items, loadedAt: Date.now() });
        }
        return items;
    })().finally(() => {
        if (_coachNotesState.inFlight.get(key) === promise) _coachNotesState.inFlight.delete(key);
    });
    _coachNotesState.inFlight.set(key, promise);
    try {
        const items = await promise;
        _applyCoachNotesToBranchSummary(items, context);
        return items;
    } catch (_e) {
        if (_isAttendanceDailyTokenCurrent(context)) {
            document.querySelectorAll('[id^="coach_info_"]').forEach(el => {
                if (el.innerHTML.includes('⏳')) el.innerHTML = '';
            });
        }
        return null;
    }
}

async function _loadAcceptedAttendanceAuxiliary(context) {
    if (!_isAttendanceDailyTokenCurrent(context)) return;
    await Promise.all([
        _loadCoachForBranchSummary(context),
        _loadSessionNoteAfterAttendanceRender(context),
    ]);
}

function _updateAttSummary(summary) {
    const el = document.getElementById('attendanceSummary');
    if (!el) return;
    if (!summary) {
        summary = [0,0,0,0];
        _attCurrentProfiles.forEach(([name]) => { summary[_attendanceCache[getAttendanceDocId(name, _attCurrentDate, _currentShiftId)] || 0]++; });
    }
    el.innerHTML =
        '<span style="font-size:0.7rem;background:#f0fdf4;color:#16a34a;padding:3px 10px;border-radius:99px;font-weight:800;border:1.5px solid #22c55e;">✅ ' + (summary[1]||0) + '</span>' +
        '<span style="font-size:0.7rem;background:#fef2f2;color:#dc2626;padding:3px 10px;border-radius:99px;font-weight:800;border:1.5px solid #ef4444;">❌ ' + (summary[2]||0) + '</span>' +
        '<span style="font-size:0.7rem;background:#fefce8;color:#ca8a04;padding:3px 10px;border-radius:99px;font-weight:800;border:1.5px solid #eab308;">📝 ' + (summary[3]||0) + '</span>' +
        '<span style="font-size:0.7rem;background:#f1f5f9;color:#475569;padding:3px 10px;border-radius:99px;font-weight:700;">— ' + (summary[0]||0) + '</span>';
}

async function _loadClubShifts(options = {}) {
    const clubId = String(_clubId() || '').trim();
    const authGeneration = _authGeneration();
    if (!clubId) {
        Object.assign(_attendanceShiftAuthority, {
            clubId: '', authGeneration, status: 'idle', configured: null,
            eligibleCount: 0, selectedShiftId: '', lastError: '', updatedAt: Date.now(),
        });
        return [];
    }
    if (options.force === true) _attendanceDebug().shiftConfigRetryCount++;
    if (!options.force && _attendanceShiftAuthority.status === 'ready' &&
        _attendanceShiftAuthority.clubId === clubId &&
        Number(_attendanceShiftAuthority.authGeneration || 0) === authGeneration &&
        _clubShiftsLoadedClubId === clubId) {
        _renderShiftSelector();
        return _clubShifts;
    }
    if (_clubShiftsLoadPromise?.clubId === clubId &&
        Number(_clubShiftsLoadPromise.authGeneration || 0) === authGeneration) {
        _attendanceDebug().shiftsCoalesced++;
        return _clubShiftsLoadPromise.promise;
    }
    const holder = { clubId, authGeneration, promise: null };
    _attendanceDailyState.requestGeneration += 1;
    Object.assign(_attendanceShiftAuthority, {
        clubId,
        authGeneration,
        status: 'loading',
        configured: null,
        eligibleCount: 0,
        selectedShiftId: _currentShiftId,
        lastError: '',
        updatedAt: Date.now(),
    });
    _renderShiftSelector();
    holder.promise = (async () => {
        _attendanceDebug().shiftsLoads++;
        const shifts = await AttendanceService.loadShifts();
        if (String(_clubId() || '').trim() !== clubId || _authGeneration() !== authGeneration) {
            const staleError = new Error('Stale shift settings response');
            staleError.code = 'attendance/stale-shift-config';
            throw staleError;
        }
        _clubShifts = Array.isArray(shifts) ? shifts.slice() : [];
        _clubShiftsLoadedClubId = clubId;
        Object.assign(_attendanceShiftAuthority, {
            clubId,
            authGeneration,
            status: 'ready',
            configured: _clubShifts.length > 0,
            eligibleCount: 0,
            selectedShiftId: '',
            lastError: '',
            updatedAt: Date.now(),
        });
        _renderShiftSelector();
        return _clubShifts;
    })().catch((error) => {
        const stillCurrent = String(_clubId() || '').trim() === clubId && _authGeneration() === authGeneration;
        if (stillCurrent) {
            _clubShifts = [];
            _clubShiftsLoadedClubId = '';
            _currentShiftId = '';
            _attendanceDebug().shiftConfigErrors++;
            Object.assign(_attendanceShiftAuthority, {
                clubId,
                authGeneration,
                status: 'error',
                configured: null,
                eligibleCount: 0,
                selectedShiftId: '',
                lastError: String(error?.message || 'shift-config-error'),
                updatedAt: Date.now(),
            });
            _renderShiftSelector();
        }
        throw error;
    }).finally(() => {
        if (_clubShiftsLoadPromise === holder) _clubShiftsLoadPromise = null;
    });
    _clubShiftsLoadPromise = holder;
    return holder.promise;
}

function _commitAttendanceShiftSettingsFromRam(reason) {
    const clubId = String(_clubId() || '').trim();
    const authGeneration = _authGeneration();
    _clubShiftsLoadedClubId = clubId;
    _attendanceDailyState.requestGeneration += 1;
    Object.assign(_attendanceShiftAuthority, {
        clubId,
        authGeneration,
        status: 'ready',
        configured: _clubShifts.length > 0,
        eligibleCount: 0,
        selectedShiftId: _currentShiftId,
        lastError: '',
        updatedAt: Date.now(),
    });
    _attendanceDebug().dailyLastShiftConfigMutation = String(reason || 'shift-settings-save');
    _renderShiftSelector();
}

function _renderShiftSelector() {
    const sel = document.getElementById('att_shift');
    if (!sel) return;
    const stateIsCurrent = _attendanceShiftAuthority.clubId === String(_clubId() || '').trim() &&
        Number(_attendanceShiftAuthority.authGeneration || 0) === _authGeneration();
    if (!stateIsCurrent || _attendanceShiftAuthority.status !== 'ready') {
        const isError = stateIsCurrent && _attendanceShiftAuthority.status === 'error';
        const pendingShiftId = String(_currentShiftId || sel.value || '');
        sel.innerHTML = '<option value="">' + (isError
            ? '⚠️ Không tải được cấu hình ca'
            : '⏳ Đang tải cấu hình ca...') + '</option>';
        sel.value = '';
        sel.disabled = true;
        _currentShiftId = isError ? '' : pendingShiftId;
        _attendanceShiftAuthority.selectedShiftId = _currentShiftId;
        return;
    }
    sel.disabled = false;
    const context = _captureAttendanceDailyContext();
    const shifts = _getEligibleAttendanceShifts(context);
    sel.replaceChildren(new Option('⏰ -- Chọn ca tập --',''));
    shifts.forEach(s => {
        const _t = s.timeStart && s.timeEnd ? ' (' + s.timeStart + '–' + s.timeEnd + ')' : '';
        sel.add(new Option(String(s.name || '') + _t, String(s.id || '')));
    });
    const selected = String(_currentShiftId || context.shiftId || '');
    if (selected && shifts.some(s => String(s.id || '') === selected)) {
        sel.value = selected;
        _currentShiftId = selected;
    } else {
        if (selected) _attendanceDebug().invalidSelectedShiftCleared++;
        sel.value = '';
        _currentShiftId = '';
    }
    _attendanceShiftAuthority.eligibleCount = shifts.length;
    _attendanceShiftAuthority.selectedShiftId = _currentShiftId;
    ['add_shift', 'm_shift'].forEach(function(sid) {
        const _ss = document.getElementById(sid);
        if (!_ss) return;
        // Registration controls belong to the student editor, not the day selector.
        _ss.dispatchEvent?.(new Event('training-shifts-changed'));
    });
}

function _renderShiftListInModal() {
    const listEl = document.getElementById('shiftList');
    if (!listEl) return;
    if (_attendanceShiftAuthority.status === 'error') {
        listEl.innerHTML = '<div style="text-align:center;padding:20px;color:#b45309;font-size:0.82rem;font-weight:700;">⚠️ Chưa tải được cấu hình ca tập. Vui lòng thử lại.</div>';
        return;
    }
    if (_clubShifts.length === 0) {
        listEl.innerHTML = '<div style="text-align:center;padding:20px;color:#94a3b8;font-size:0.82rem;">Chưa có ca tập nào. Thêm ca phía trên để bắt đầu.</div>';
        return;
    }
    listEl.innerHTML = _clubShifts.map(s => {
        const time = s.timeStart && s.timeEnd ? s.timeStart + ' – ' + s.timeEnd : 'Chưa đặt giờ';
        const authority = classifyShiftScope(s);
        const branchLabel = authority.scope === 'LEGACY_GLOBAL' ? 'Ca dùng chung cũ'
            : authority.resolved ? 'Cơ sở ' + authority.branch.slice(2) : 'SHIFT_AUTHORITY_UNRESOLVED — Cần Admin xác minh cơ sở';
        const token = encodeURIComponent(String(s.id || '')).replace(/'/g, '%27');
        return '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;margin-bottom:6px;">'
            + '<div style="min-width:0;"><div style="font-size:0.85rem;font-weight:800;color:#1e293b;">' + escapeHtml(String(s.name || '')) + '</div>'
            + '<div style="font-size:0.72rem;color:#64748b;margin-top:1px;">🕐 ' + escapeHtml(String(time)) + '</div>'
            + '<div style="font-size:0.78rem;color:#92400e;margin-top:4px;">' + escapeHtml(branchLabel) + '</div></div>'
            + '<button onclick="window.deleteShift(decodeURIComponent(\'' + token + '\'))" type="button"'
            + ' style="flex-shrink:0;padding:6px 11px;background:#fee2e2;color:#dc2626;border:1px solid #fca5a5;border-radius:8px;font-size:0.72rem;font-weight:800;cursor:pointer;">🗑️ Xóa</button>'
            + '</div>';
    }).join('');
}

function _renderAttendanceShiftBlocked(context, decision) {
    if (!context || !_isAttendanceDaySubtabActive() || !_isAttendanceDailyTokenCurrent(context)) {
        return { blocked: true, mode: decision.mode, rendered: false };
    }
    const gridEl = document.getElementById('attendanceGrid');
    _attCurrentDate = context.date;
    _currentShiftId = '';
    _attCurrentProfiles = [];
    window.currentAttendanceData = {};
    if (gridEl) {
        if (decision.mode === 'shift-config-unavailable') {
            gridEl.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px 16px;color:#b45309;font-size:0.86rem;font-weight:700;">'
                + '⚠️ Chưa tải được cấu hình ca tập.<br><span style="font-weight:500;">Vui lòng thử lại.</span>'
                + '<div style="margin-top:12px;"><button type="button" onclick="window.AttendanceModule?.retryShiftConfig?.()" '
                + 'style="border:1px solid #f59e0b;background:#fffbeb;color:#92400e;border-radius:8px;padding:7px 12px;font-weight:800;cursor:pointer;">Thử tải lại ca tập</button></div></div>';
        } else {
            const noEligible = decision.reason === 'no-eligible-shift-for-branch';
            gridEl.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px 16px;color:#475569;font-size:0.86rem;font-weight:700;">'
                + (noEligible
                    ? (_clubShifts.some(shift => !classifyShiftScope(shift).resolved)
                        ? 'Có ca tập chưa xác minh cơ sở. Admin cần kiểm tra ca tập và đăng ký của võ sinh.'
                        : '⏰ Chưa có ca tập phù hợp với cơ sở này.')
                    : '⏰ Vui lòng chọn ca tập để điểm danh.')
                + '</div>';
        }
    }
    _updateAttSummary([0,0,0,0]);
    const branchWrap = document.getElementById('admin_daily_branch_summary');
    const branchBody = document.getElementById('admin_daily_branch_body');
    if (branchWrap) branchWrap.style.display = 'none';
    if (branchBody) branchBody.innerHTML = '';
    _attendanceDebug().dailyLastShiftAuthorityMode = decision.mode === 'shift-config-unavailable' &&
        _attendanceShiftAuthority.status === 'error' ? 'shift-config-error' : decision.mode;
    return { blocked: true, mode: decision.mode, rendered: true, key: context.key };
}

function _recordAttendanceShiftReadBlocked(decision) {
    const debug = _attendanceDebug();
    debug.shiftRequiredBlockedReads++;
    if (decision.mode === 'shift-required') {
        debug.blankShiftAllReadPrevented++;
    }
}

// R2: Coach roster proof is bound to the SAME verified auth principal and
// active listener generation. Metrics are read-only output from existing owner.
// This is not a new writer/reader or cache authority.
// Read-only canonical role resolution from the existing security boundary.
// Missing script/order is fail-closed; never create an alternate auth authority.
function _attendanceCanonicalRole(value) {
    return typeof window.RoleReadBoundary?.normalizeRole === 'function'
        ? window.RoleReadBoundary.normalizeRole(value) : '';
}

function _coachAttendanceWriteAuthorized(context) {
    const verified = window.__verifiedAuthContextState;
    const role = _attendanceCanonicalRole(verified?.role);
    const uiRole = _attendanceCanonicalRole(window.userRole);
    const storeRole = _attendanceCanonicalRole(window.__store?.userRole);
    const clickedRole = _attendanceCanonicalRole(context?.role);
    const uid = String(verified?.uid || '').trim();
    const generation = Number(verified?.generation);
    const currentUserUid = String(window.__store?.currentUser?.uid || '').trim();
    // A mismatched UI/store role must never inherit Admin or anonymous privileges.
    if (!verified || verified.ready !== true || !uid ||
        !Number.isSafeInteger(generation) || generation <= 0 ||
        !['coach', 'admin', 'super_admin'].includes(role) ||
        uiRole !== role || storeRole !== role || clickedRole !== role ||
        Number(context?.authGeneration) !== generation ||
        !String(context?.clubId || '').trim() ||
        String(context.clubId) !== String(window.__store?.clubId || '') ||
        (currentUserUid && currentUserUid !== uid)) return false;

    if (role === 'super_admin') {
        // Verified SuperAdmin may select a club; verified.clubId can be empty.
        // The existing selected-club and shift authority remain compulsory.
        const selectedMirror = String(window.__store?.currentClubId || '').trim();
        const currentMirror = String(window.currentClubId || '').trim();
        if ((selectedMirror && selectedMirror !== String(context.clubId)) ||
            (currentMirror && currentMirror !== String(context.clubId))) return false;
        return true;
    }
    if (String(context.clubId) !== String(verified.clubId || '')) return false;
    if (role === 'admin') return true; // Existing Admin shift guard remains authoritative.

    const coachBranch = _canonicalAttendanceBranch(verified.coachBranch, '');
    if (!coachBranch ||
        (!!context.coachBranch && !_sameBranch(context.coachBranch, coachBranch)) ||
        (window.coachBranch && !_sameBranch(window.coachBranch, coachBranch)) ||
        (window.__store?.coachBranch && !_sameBranch(window.__store.coachBranch, coachBranch))) return false;
    const metrics = window.getProfilesListenerMetrics?.();
    // A verified same-session roster may authorize the existing local journal
    // during a network-only metadata demotion. No server write is made offline.
    // Every click now enters the durable queue. navigator.onLine is not proof
    // that Firestore is reachable; only a confirmed transaction can ACK it.
    const offlineQueueReady = metrics?.coachOfflineRosterReady === true;
    if (!metrics || String(metrics.activeOwnerUid || '') !== uid ||
        Number(metrics.authoritySessionEpoch) !== generation ||
        String(metrics.authorityClubId || metrics.clubId || '') !== String(context.clubId) ||
        _attendanceCanonicalRole(metrics.role) !== 'coach' ||
        !_sameBranch(metrics.coachBranch, coachBranch) ||
        (metrics.coachRosterReadiness !== 'verified' && !offlineQueueReady) ||
        metrics.activeListenerMounted !== true ||
        (!offlineQueueReady && metrics.coachPrimaryServerSeen !== true) ||
        metrics.coachPrimaryFailed === true || metrics.coachLegacyFailed === true ||
        (coachBranch === 'CS1' &&
          ((!offlineQueueReady && metrics.coachLegacyServerSeen !== true) || !metrics.coachLegacyListenerKey))) return false;
    return String(metrics.activeListenerKey || '') ===
        'students:profiles:active:' + String(context.clubId) + ':coach:' + coachBranch;
}

function _resolveAttendanceWriteGuard(reason) {
    const rawContext = _captureAttendanceDailyContext();
    // Guard first: _normalizeAttendanceShiftDecision itself mutates selected
    // shift state, so it MUST NOT run for an unverified Coach roster.
    if (!_coachAttendanceWriteAuthorized(rawContext)) {
        window.showToast?.('⚠️ Danh sách Điểm danh chưa được xác minh cho tài khoản/cơ sở này.', 3000);
        return null;
    }
    // The write path uses the verified principal, not raw role/branch mirrors.
    const verified = window.__verifiedAuthContextState;
    const canonicalRole = _attendanceCanonicalRole(verified.role);
    const coachBranch = canonicalRole === 'coach'
        ? _canonicalAttendanceBranch(verified.coachBranch, '') : '';
    const writeContext = Object.freeze({
        ...rawContext, role: canonicalRole, coachBranch,
        branch: canonicalRole === 'coach' ? coachBranch : rawContext.branch,
        key: [rawContext.clubId, rawContext.date,
            canonicalRole === 'coach' ? coachBranch : rawContext.branch,
            rawContext.shiftId].join('|'),
    });
    const decision = _resolveAttendanceShiftAuthority(writeContext);
    const context = _normalizeAttendanceShiftDecision(writeContext, decision);
    if (decision.allowed) {
        if (!_attendanceDailyState.cacheReady || _attendanceDailyState.currentSnapshotKey !== context.key ||
            Number(_attendanceDailyState.currentSnapshotAuthGeneration) !== Number(context.authGeneration)) {
            window.showToast?.('Danh sách ngày/cơ sở/ca này chưa tải xong. Hãy chờ danh sách hiển thị rồi điểm danh.',3000);
            return null;
        }
        _currentShiftId = decision.shiftId;
        _attendanceShiftAuthority.selectedShiftId = decision.shiftId;
        return { context, decision };
    }
    const token = _captureAttendanceDailyToken(context);
    const debug = _attendanceDebug();
    debug.shiftRequiredBlockedWrites++;
    if (decision.mode === 'shift-required') debug.blankShiftWritePrevented++;
    debug.dailyLastBlockedWriteReason = String(reason || 'attendance-write');
    _renderAttendanceShiftBlocked(token, decision);
    window.showToast(decision.mode === 'shift-config-unavailable'
        ? '⚠️ Chưa tải được cấu hình ca tập. Vui lòng thử lại.'
        : '⚠️ Vui lòng chọn ca tập trước khi điểm danh.', 3000);
    return null;
}

function _attendanceOfflineKeyPart(value) {
    return encodeURIComponent(String(value == null ? '' : value));
}

function _attendanceOfflineMutationKey(record) {
    const shiftToken = record?.shiftMode === 'explicit-shift'
        ? String(record.shiftId || '')
        : 'legacy-no-shift';
    return _ATTENDANCE_OFFLINE_V2_PREFIX + [
        record?.clubId || '', record?.date || '', shiftToken, record?.docId || ''
    ].map(_attendanceOfflineKeyPart).join('~');
}

function _classifyAttendanceOfflineError(error, fallback = 'unknown') {
    const code = String(error?.code || '').toLowerCase();
    const message = String(error?.message || error || '').toLowerCase();
    if (code.includes('permission-denied') || message.includes('permission-denied') || message.includes('permission denied')) return 'permission-denied';
    if (code.includes('unavailable') || code.includes('network') || message.includes('network') || message.includes('offline')) return 'network';
    return fallback || 'unknown';
}

function _recordAttendanceOfflineIssue(kind, error, extra = {}) {
    const debug = _attendanceDebug();
    const resolved = String(kind || _classifyAttendanceOfflineError(error, 'unknown'));
    debug.offlineSyncErrors++;
    debug.offlineSyncLastErrorType = resolved;
    if (resolved === 'wrong-club') debug.offlineSyncCrossClubBlocked++;
    if (resolved === 'invalid-shift') debug.offlineSyncInvalidShiftBlocked++;
    if (resolved === 'malformed-payload') debug.offlineSyncMalformedBlocked++;
    const details = { classification: resolved, attendanceOffline: true, ...extra, ...error?.attendanceDiagnostic };
    console.warn('[AttendanceOffline]', resolved, details, error || '');
    // Guard outcomes are expected and remain pending; actual failures are also recorded
    // in the existing runtime error store. No second diagnostics authority is created.
    if (!['wrong-club', 'invalid-shift'].includes(resolved) && typeof window.recordRuntimeError === 'function') {
        window.recordRuntimeError('attendance.offline-sync:' + resolved, error || new Error(resolved), details);
    }
}

function _recordAttendanceSecondaryFailure(classification, error, extra = {}) {
    const resolved = String(classification || 'attendance-secondary-write-failed');
    const details = { classification: resolved, secondaryWrite: true, reconciliationNeeded: true, ...extra };
    console.warn('[AttendanceConsistency]', resolved, details, error || '');
    if (typeof window.recordRuntimeError === 'function') {
        window.recordRuntimeError('attendance.secondary:' + resolved, error || new Error(resolved), details);
    }
}

function _beginAttendanceSaving(context, principal, records) {
    return records.map(record => {
        const key = JSON.stringify([principal.clubId,record.docId]);
        let group = _attendanceSavingEdits.get(key);
        if (!group || !_sameOfflineAttendanceSyncContext(group.principal,principal) ||
            !_sameAttendanceContext(group.context,context)) {
            group = {key,principal,context,docId:record.docId,edits:[]};
            _attendanceSavingEdits.set(key,group);
        }
        const edit = {status:Number(record.status),state:'saving'};
        group.edits.push(edit);return {group,edit};
    });
}

function _attendanceSavingProjection() {
    const projection = new Map();
    if (!_attendanceSavingEdits.size) return projection;
    const context = _captureAttendanceDailyContext();
    for (const group of _attendanceSavingEdits.values()) {
        if (!_isOfflineAttendanceSyncContextCurrent(group.principal) || !_sameAttendanceContext(group.context,context)) continue;
        const visible = group.edits.filter(edit=>edit.state!=='failed');
        const latest = visible[visible.length-1];
        if (latest) projection.set(group.docId,{status:latest.status});
    }
    return projection;
}

function _finishAttendanceSaving(tokens,saved) {
    const persisted = new Set(saved.map(row=>row.record.docId));
    const groups = new Set();
    for (const {group,edit} of tokens) {
        edit.state = persisted.has(group.docId) ? 'saved' : 'failed';groups.add(group);
    }
    let render = false;
    for (const group of groups) {
        if (_attendanceSavingEdits.get(group.key)!==group) continue;
        const current = _isOfflineAttendanceSyncContextCurrent(group.principal) &&
            _sameAttendanceContext(group.context,_captureAttendanceDailyContext());
        // Commit only durable local state to the normal RAM cache. Failed taps
        // never become the rollback baseline for a later tap.
        if (current) {
            const durable = group.edits.filter(edit=>edit.state==='saved');
            const lastSaved = durable[durable.length-1];
            if (lastSaved) _attendanceCache[group.docId] = lastSaved.status;
            render = true;
        }
        if (!group.edits.some(edit=>edit.state==='saving')) _attendanceSavingEdits.delete(group.key);
    }
    if (render) _renderAttCards();
}

async function _saveAttOffline(clubId, date, shiftDecision, changedRecords = []) {
    if (!shiftDecision?.allowed || !changedRecords.length) return [];
    const principal = _captureOfflineAttendanceSyncContext();
    if (!_isOfflineAttendanceSyncContextCurrent(principal) || principal.clubId !== clubId) return [];
    const context = _captureAttendanceDailyContext();
    const serverKey = context.key + '|' + context.authGeneration;
    const records = changedRecords.map(entry => {
        const name = String(entry.name || ''), profile = entry.profile || {}, shiftId = String(shiftDecision.shiftId || '');
        const docId = getAttendanceDocId(name,date,shiftId || null), status = Number(entry.status);
        const visibleIntent = _attendanceIntentStates.get(docId);
        const visibleVersion = ['pending','inflight'].includes(visibleIntent?.state) ? visibleIntent.id : '';
        return {version:3, clubId, date, month:date.slice(0,7), name, profileId:name,
            branch:profile.branch || entry.branch || '', belt:profile.belt || '', shiftId,
            shiftMode:shiftId ? 'explicit-shift' : 'legacy-no-shift', docId, status,
            operation:status === 0 ? 'delete' : 'set',
            baseVersion:visibleVersion || (_attendanceServerContext === serverKey
                ? (_attendanceServerVersions[docId] || 'absent') : 'unknown')};
    });
    try {
        const saved = await AttendanceJournal.enqueue(records,principal);
        if (_isOfflineAttendanceSyncContextCurrent(principal)) saved.forEach(row=>_attendanceIntentStates.set(row.record.docId,{state:row.state,id:row.id}));
        _attendanceDebug().offlineJournalQueued += saved.length;
        _attendanceSyncRequested = true;
        return saved;
    } catch (error) {
        _recordAttendanceOfflineIssue('journal-unavailable',error,{stage:'enqueue'});
        return [];
    }
}

function _isOfflineAttendanceRecordAllowed(record) {
    if (!record || typeof record !== 'object' || Array.isArray(record) ||
        String(record.clubId || '') !== String(_clubId() || '')) return { allowed: false, reason: 'wrong-club' };
    const name = String(record.name || '').trim();
    const date = String(record.date || '');
    const shiftId = String(record.shiftId || '').trim();
    const status = Number(record.status);
    const operation = String(record.operation || '').trim().toLowerCase();
    if (!name || !_validAttendanceOfflineDate(date) ||
        !Number.isInteger(status) || ![0, 1, 2, 3].includes(status) ||
        (operation && operation !== 'set' && operation !== 'delete') ||
        (operation === 'delete' && status !== 0) ||
        (operation === 'set' && status === 0) ||
        (record.docId && String(record.docId) !== getAttendanceDocId(name, date, shiftId || null)) ||
        !_canonicalAttendanceBranch(record.branch || '', '')) {
        return { allowed: false, reason: 'malformed-attendance-record' };
    }
    if (_attendanceShiftAuthority.status !== 'ready' ||
        _attendanceShiftAuthority.clubId !== String(_clubId() || '') ||
        Number(_attendanceShiftAuthority.authGeneration || 0) !== _authGeneration()) {
        return { allowed: false, reason: 'shift-config-unavailable' };
    }
    const principal = _captureOfflineAttendanceSyncContext();
    if (!_isOfflineAttendanceSyncContextCurrent(principal) || principal.clubId !== String(record.clubId || '')) {
        return { allowed: false, reason: 'unverified-sync-principal' };
    }
    const role = principal.role;
    const verified = window.__verifiedAuthContextState;
    const verifiedRole = _attendanceCanonicalRole(verified?.role);
    if (role === 'coach' || verifiedRole === 'coach') {
        const coachBranch = _canonicalAttendanceBranch(verified?.coachBranch || '', '');
        if (verified?.ready !== true || verifiedRole !== 'coach' || role !== 'coach' ||
            _attendanceCanonicalRole(window.__store?.userRole) !== 'coach' ||
            String(verified.clubId || '') !== String(record.clubId || '') ||
            !coachBranch || !_sameBranch(record.branch, coachBranch)) {
            return { allowed: false, reason: 'wrong-branch' };
        }
    }
    // V2 persisted mode and identifier must describe the SAME authority.
    // Never reclassify an explicit-shift entry without an ID as legacy.
    // The V1 envelope validator derives the explicit mode independently.
    if (typeof record.shiftId !== 'string' || record.shiftId !== shiftId ||
        !['legacy-no-shift', 'explicit-shift'].includes(record.shiftMode)) {
        return { allowed: false, reason: 'invalid-shift-contract' };
    }
    if (_attendanceShiftAuthority.configured === false) {
        return record.shiftMode === 'legacy-no-shift' && shiftId === ''
            ? { allowed: true, mode: 'legacy-no-shift' }
            : { allowed: false, reason: 'invalid-shift-contract' };
    }
    if (record.shiftMode !== 'explicit-shift' || !shiftId) {
        return { allowed: false, reason: 'invalid-shift-contract' };
    }
    const coachBranch = role === 'coach'
        ? _canonicalAttendanceBranch(window.coachBranch || window.__store?.coachBranch || '', '')
        : '';
    const branch = role === 'coach' ? coachBranch : _canonicalAttendanceBranch(record.branch || '', '');
    const context = {
        clubId: String(record.clubId || ''),
        authGeneration: _authGeneration(),
        role,
        coachBranch,
        branch: branch || (role === 'coach' ? '' : 'all'),
        shiftId: String(record.shiftId || ''),
    };
    const decision = _resolveAttendanceShiftAuthority(context);
    return decision.allowed === true && decision.mode === 'explicit-shift' && decision.shiftId === shiftId
        ? { allowed: true, mode: 'explicit-shift' }
        : { allowed: false, reason: 'invalid-shift' };
}

function _validAttendanceOfflineDate(value) {
    const d = String(value || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
    const date = new Date(d + 'T00:00:00Z');
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === d;
}

function _isOfflineAttendancePayloadAllowed(payload) {
    // V1 envelope may provide date/clubId; an individual row need not repeat them.
    if (!payload || !String(payload.clubId || '').trim() ||
        String(payload.clubId) !== String(_clubId() || '') ||
        !_validAttendanceOfflineDate(payload.date)) return false;
    if (_attendanceShiftAuthority.status !== 'ready' ||
        _attendanceShiftAuthority.clubId !== String(_clubId() || '') ||
        Number(_attendanceShiftAuthority.authGeneration || 0) !== _authGeneration()) return false;
    const principal = _captureOfflineAttendanceSyncContext();
    if (!_isOfflineAttendanceSyncContextCurrent(principal)) return false;
    if (!payload.records || typeof payload.records !== 'object' || Array.isArray(payload.records)) return false;
    const entries = Object.entries(payload.records);
    if (entries.length === 0 || entries.length > _ATTENDANCE_OFFLINE_SYNC_CHUNK) return false;
    return entries.every(([id, row]) => {
        if (!row || typeof row !== 'object' || Array.isArray(row)) return false;
        const name = String(row.name || '').trim();
        const date = String(row.date || payload.date);
        const shiftId = String(row.shiftId || '').trim();
        const operation = String(row.operation || '').trim().toLowerCase();
        const status = Number(row.status);
        if (!name || !_validAttendanceOfflineDate(date) || date !== payload.date ||
            (row.clubId && String(row.clubId) !== principal.clubId) ||
            (row.month && String(row.month) !== date.slice(0, 7)) ||
            !Number.isInteger(status) || ![0,1,2,3].includes(status) ||
            (operation && operation !== 'set' && operation !== 'delete') ||
            (operation === 'delete' && status !== 0) ||
            (operation === 'set' && status === 0)) return false;
        // The current V1 writer derives docId from name/date/shift. Never let
        // caller-controlled docId target a different attendance document.
        const expectedId = getAttendanceDocId(name, date, shiftId || null);
        if (row.docId && String(row.docId) !== expectedId) return false;
        const branch = _canonicalAttendanceBranch(row.branch || '', '');
        if (!branch || branch === 'all') return false;
        if (principal.role === 'coach') {
            if (!_sameBranch(branch, principal.coachBranch)) return false;
            // A V1 journal row is not proof of the existing resource's branch.
            // Existing Firestore Rules check resource branch on delete; until an
            // authoritative target is available, retain Coach deletes for review.
            if (status === 0) return false;
        }
        if (_attendanceShiftAuthority.configured === false) {
            if (shiftId || row.shiftMode === 'explicit-shift') return false;
        } else if (!_isOfflineAttendanceRecordAllowed({
            ...row, version: 1, clubId: principal.clubId, date,
            shiftMode: shiftId ? 'explicit-shift' : 'legacy-no-shift', branch,
        }).allowed) return false;
        return true;
    });
}

function _renderAttendanceDailyFromRam(context, reason = 'presentation-only') {
    if (!context || !_isAttendanceDaySubtabActive()) return { skipped: 'day-subtab-hidden' };
    const current = _captureAttendanceDailyContext();
    if (!_sameAttendanceContext(context, current)) return { skipped: 'context-changed' };
    const shiftDecision = _resolveAttendanceShiftAuthority(context);
    if (!shiftDecision.allowed) return _renderAttendanceShiftBlocked(context, shiftDecision);
    _attCurrentDate = context.date;
    _currentShiftId = shiftDecision.shiftId;
    _attCurrentProfiles = _getFilteredAttProfiles();
    if (typeof window.trackLargeListRender === 'function') {
        window.trackLargeListRender('attendance.list', _attCurrentProfiles.length, { reason });
    }
    _attendanceDebug().dailyPresentationOnlyRenders++;
    _renderAttCards();
    _applyCachedCoachNotes(context);
    return { rendered: true, key: context.key, profiles: _attCurrentProfiles.length };
}

function _captureAttendanceDailyToken(context) {
    const previous = _attendanceDailyState.latestIntent;
    if (!_sameAttendanceContext(previous, context)) _attendanceDailyState.requestGeneration += 1;
    const token = Object.freeze({
        ...context,
        generation: _attendanceDailyState.requestGeneration,
        mutationRevision: _attendanceDailyState.mutationRevision,
    });
    _attendanceDailyState.latestIntent = token;
    const debug = _attendanceDebug();
    debug.dailyIntentCount++;
    debug.dailyLastKey = token.key;
    return token;
}

function _recordAttendanceDailyStale(token) {
    const debug = _attendanceDebug();
    debug.dailyStaleDropped++;
    if (Number(token?.mutationRevision || 0) !== Number(_attendanceDailyState.mutationRevision || 0)) {
        debug.dailyMutationRevisionDropped++;
    }
}

async function _requestAttendanceDailyRefresh(reason = 'compatibility-render', options = {}) {
    const coachMaintenance=_attendanceCanonicalRole(window.__verifiedAuthContextState?.role)==='coach' && !HISTORY_COACH_ACCESS;
    // A9R4: visual controls must reflect the deliberate cutover lock.
    // This changes presentation only: no shift/roster read, listener or write.
    for(const id of ['att_shift','att_bulk_btn','att_date','att_belt','att_sub_btn_month']){
        const el=document.getElementById(id);if(!el)continue;
        if(coachMaintenance){el.disabled=true;el.dataset.coachMaintenance='1';if(id==='att_bulk_btn')el.style.display='none';}
        else if(el.dataset.coachMaintenance==='1'){el.disabled=false;delete el.dataset.coachMaintenance;if(id==='att_bulk_btn')el.style.display='';}
    }
    if (coachMaintenance) {
        const grid=document.getElementById('attendanceGrid');if(grid)grid.textContent='Điểm danh HLV đang bảo trì để xác minh lịch sử S01 và Journal. Chưa tải Ca tập hoặc danh sách võ sinh; không có thao tác điểm danh được thực hiện. Nhật ký trên thiết bị được giữ nguyên.';
        _renderAttendanceJournalControls();return {blocked:true,reason:'attendance-maintenance'};
    }
    if (!_isAttendanceDaySubtabActive()) {
        _attendanceDebug().monthSubtabDailyReadPrevented++;
        return { skipped: 'day-subtab-hidden' };
    }
    const dateEl = document.getElementById('att_date');
    const gridEl = document.getElementById('attendanceGrid');
    if (!gridEl) return { skipped: 'grid-missing' };
    if (dateEl && !dateEl.value) dateEl.value = _getLocalToday();

    try {
        await _loadClubShifts({ force: options.forceShiftConfig === true });
    } catch (error) {
        // The loader has already committed an explicit error/unknown state.
        // Continue only to publish a blocked intent; never fall open as [].
        _attendanceDebug().dailyLastShiftLoadError = String(error?.message || error || 'shift-config-error');
    }
    if (!_isAttendanceDaySubtabActive()) {
        _attendanceDebug().monthSubtabDailyReadPrevented++;
        return { skipped: 'day-subtab-changed' };
    }

    const rawContext = _captureAttendanceDailyContext();
    const shiftDecision = _resolveAttendanceShiftAuthority(rawContext);
    const context = _normalizeAttendanceShiftDecision(rawContext, shiftDecision);
    const token = _captureAttendanceDailyToken(context);
    if (!shiftDecision.allowed) {
        _recordAttendanceShiftReadBlocked(shiftDecision);
        return _renderAttendanceShiftBlocked(token, shiftDecision);
    }
    const sameSnapshot = _attendanceDailyState.cacheReady &&
        _attendanceDailyState.currentSnapshotKey === context.key &&
        Number(_attendanceDailyState.currentSnapshotAuthGeneration) === Number(context.authGeneration);
    const cacheFresh = sameSnapshot && (Date.now() - _attendanceDailyState.currentSnapshotAt) <= _ATTENDANCE_DAILY_CACHE_TTL_MS;
    const presentationOnly = options.presentationOnly === true;
    if (sameSnapshot && (presentationOnly || (!options.force && cacheFresh))) {
        _attendanceDebug().dailyCacheHits++;
        const rendered = _renderAttendanceDailyFromRam(token, reason + ':ram-cache');
        if (!presentationOnly) await _loadAcceptedAttendanceAuxiliary(token);
        return { ...rendered, cacheHit: true };
    }
    if (presentationOnly && options.allowInitialLoad !== true) {
        return _renderAttendanceDailyFromRam(token, reason + ':ram-only-no-snapshot');
    }

    const running = _attendanceDailyState.inFlight.get(context.key);
    if (running && _sameAttendanceContext(running.token, token) &&
        Number(running.token.mutationRevision || 0) === Number(token.mutationRevision || 0)) {
        _attendanceDebug().dailySingleFlightCoalesced++;
        return running.promise;
    }

    if (_isAttendanceDailyTokenCurrent(token)) {
        gridEl.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px 16px;color:#94a3b8;font-size:0.85rem;">⏳ Đang tải dữ liệu điểm danh...</div>';
    }

    const flight = { token, promise: null };
    flight.promise = (async () => {
        const debug = _attendanceDebug();
        debug.dailyNetworkLoads++;
        if (shiftDecision.mode === 'explicit-shift') debug.explicitShiftReads++;
        else debug.legacyNoShiftReads++;
        const attList = await AttendanceService.loadByDate(token.date, {
            shiftId: token.shiftId,
            branch: token.branch === 'all' ? '' : token.branch,
            shiftAuthorityMode: shiftDecision.mode,
            requireShift: shiftDecision.mode === 'explicit-shift',
            isCurrent: () => _isAttendanceDailyTokenCurrent(token),
        });
        if (!_isAttendanceDailyTokenCurrent(token)) {
            _recordAttendanceDailyStale(token);
            return { stale: true, key: token.key };
        }
        const nextCache = {};
        attList.forEach(({ id, data }) => {
            const docShift = data.shiftId || '';
            if (token.shiftId && docShift !== token.shiftId) return;
            nextCache[id] = _mapLegacyStatus(data.status || 0);
        });
        const nextServerVersions = attList.serverConfirmed === true
            ? Object.fromEntries(attList.map(({id,data}) => [id,attendanceServerVersion(data)])) : null;
        // Overlay unresolved durable intents; never present a pending mark as ACK.
        let pending=[];
        try {pending=await AttendanceJournal.list(_captureOfflineAttendanceSyncContext());}
        catch(error) {_attendanceDebug().journalStorageUnavailable=true;}
        if (!_isAttendanceDailyTokenCurrent(token)) return {stale:true,key:token.key};
        _attendanceIntentStates = new Map(pending.filter(row=>['pending','inflight','conflict','needs-review'].includes(row.state) && row.record.date===token.date && row.record.shiftId===token.shiftId).map(row=>[row.record.docId,{state:row.state,id:row.id,lastError:row.lastError}]));
        pending.filter(row => ['pending','inflight'].includes(row.state) &&
            row.record.date === token.date && row.record.shiftId === token.shiftId)
            .forEach(row => {nextCache[row.record.docId] = Number(row.record.status);});
        // Publish the snapshot's values and CAS bases together, after the last
        // await and current-token check. Hidden query results are not authority
        // for a user action still based on the previously displayed view.
        if (nextServerVersions) {
            _attendanceServerVersions = nextServerVersions;
            _attendanceServerContext = token.key + '|' + token.authGeneration;
        }
        _attendanceCache = nextCache;
        _attendanceDailyState.currentSnapshotKey = token.key;
        _attendanceDailyState.currentSnapshotAuthGeneration = token.authGeneration;
        _attendanceDailyState.currentSnapshotAt = Date.now();
        _attendanceDailyState.cacheReady = true;
        _renderAttendanceDailyFromRam(token, reason + ':network-accepted');
        await _loadAcceptedAttendanceAuxiliary(token);
        return { applied: true, key: token.key, records: attList.length };
    })().catch((error) => {
        if (!_isAttendanceDailyTokenCurrent(token)) {
            _recordAttendanceDailyStale(token);
            return { stale: true, error: true, key: token.key };
        }
        console.warn('[Attendance] loadByDate failed:', error && error.message || error);
        const deniedCode = String(error?.code || '');
        const coachRole = _attendanceCanonicalRole(window.__verifiedAuthContextState?.role) === 'coach';
        if (coachRole && (deniedCode === 'permission-denied' || deniedCode === 'firestore/permission-denied')) {
            window.showToast?.('⚠️ Firestore chưa cho phép tải trạng thái Điểm danh HLV cho cơ sở/ca này. Cần đồng bộ Rules A9R12 rồi đăng nhập lại.', 5000);
        }
        if (error?.code === 'attendance/daily-coverage-incomplete') {
            window.showToast('⚠️ Dữ liệu điểm danh vượt giới hạn an toàn và chưa tải đủ. Hệ thống giữ dữ liệu cũ thay vì hiển thị thiếu.', 5000);
        }
        _renderAttendanceDailyFromRam(token, reason + ':current-error-ram-preserved');
        return { error: true, key: token.key };
    }).finally(() => {
        if (_attendanceDailyState.inFlight.get(token.key) === flight) {
            _attendanceDailyState.inFlight.delete(token.key);
        }
    });
    _attendanceDailyState.inFlight.set(context.key, flight);
    return flight.promise;
}

// These controls belong to the existing AttendanceModule. They never create
// a second Firestore writer or auto-approve old data on the user's behalf.
function _renderAttendanceJournalControls() {
    const grid=document.getElementById('attendanceGrid');
    if (!grid?.parentNode) return;
    let bar=document.getElementById('attendanceJournalControls');
    if (!bar) {
        bar=document.createElement('div');bar.id='attendanceJournalControls';
        bar.style.cssText='padding:10px;margin:8px 0;border:1px solid #cbd5e1;border-radius:8px;font-size:0.82rem;line-height:1.5';
        grid.parentNode.insertBefore(bar,grid);
    }
    const principal=_captureOfflineAttendanceSyncContext();
    bar.replaceChildren();
    const info=document.createElement('div');info.id='attendanceJournalStatus';info.setAttribute('role','status');
    info.textContent='Nhật ký trên thiết bị: đang kiểm tra…';bar.append(info);
    if (principal.role==='coach' && !HISTORY_COACH_ACCESS) {
        const maintenance=document.createElement('p');maintenance.dataset.attendanceMaintenance='true';
        maintenance.textContent='Điểm danh đang bảo trì để xác minh lịch sử. HLV tạm dừng đọc/ghi và đồng bộ; nhật ký trên thiết bị được giữ nguyên.';bar.append(maintenance);
    }
    const explanation=document.createElement('div');explanation.textContent='Trạng thái có nhãn chờ xác nhận hoặc cần đối soát chưa được máy chủ xác nhận; số lượng trên màn hình là tạm tính.';bar.append(explanation);
    const button=(label,handler)=>{const b=document.createElement('button');b.type='button';b.textContent=label;b.style.cssText='margin:6px 8px 0 0;padding:8px';b.onclick=handler;bar.append(b);};
    button('Đồng bộ lại',()=>window.syncOfflineAttendance?.().catch(error=>window.showToast?.(error.message,4000)));
    button('Kiểm tra nhật ký',()=>_openAttendancePendingReview().catch(error=>window.showToast?.(error.message,4000)));
    if (HISTORY_COACH_ACCESS && ['admin','super_admin'].includes(principal.role))
        button('Đối soát lịch sử cũ',()=>_openAttendanceHistoryAudit().catch(error=>window.showToast?.(error.message,4000)));
    else if (principal.role==='coach') {
        const note=document.createElement('div');note.textContent='HLV chỉ xem lịch sử đã xác minh theo cơ sở lúc điểm danh. Lịch sử cũ chưa xác minh cần Admin đối soát.';bar.append(note);
    }
    Promise.all([AttendanceJournal.list(principal),AttendanceJournal.legacyReviewSummary(principal)]).then(([rows,legacy])=>{
        if (!_isOfflineAttendanceSyncContextCurrent(principal)||!info.isConnected) return;
        const pending=rows.filter(x=>['pending','inflight'].includes(x.state)).length;
        const review=rows.filter(x=>['conflict','needs-review'].includes(x.state)).length;
        info.textContent=pending+' bản ghi chờ gửi · '+review+' bản ghi cần đối soát'+(legacy.count?' · '+legacy.count+' mục cũ chưa xác minh chủ dữ liệu (chỉ đối soát)':'');
    }).catch(()=>{if (_isOfflineAttendanceSyncContextCurrent(principal)&&info.isConnected) info.textContent='Chưa đọc được nhật ký trên thiết bị. Chưa thể xác nhận đã đồng bộ.';});
}

function _attendanceReviewSheet(title) {
    document.getElementById('attendanceReviewSheet')?.remove();
    const overlay=document.createElement('div');overlay.id='attendanceReviewSheet';overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');
    overlay.style.cssText='position:fixed;inset:0;background:#0f172a99;z-index:10030;display:flex;align-items:flex-end;justify-content:center';
    const body=document.createElement('div');body.style.cssText='background:white;border-radius:16px 16px 0 0;padding:18px;width:100%;max-width:680px;max-height:85vh;overflow:auto;box-sizing:border-box;color:#0f172a';
    const close=document.createElement('button');close.type='button';close.textContent='Đóng';close.onclick=()=>overlay.remove();body.append(close);
    const heading=document.createElement('h3');heading.textContent=title;body.append(heading);overlay.append(body);
    // Inherit the attendance pane's auth/tab visibility instead of outliving logout.
    (document.getElementById('tab_attendance')||document.body).append(overlay);
    return {overlay,body};
}
const _attendanceStatusLabel=status=>['Chưa điểm danh','Có mặt','Vắng','Có phép'][Number(status)]||'Chưa có bản ghi';

async function _openAttendancePendingReview() {
    const principal=_captureOfflineAttendanceSyncContext();
    if (!_isOfflineAttendanceSyncContextCurrent(principal)) throw new Error('Phiên điểm danh chưa được xác minh.');
    await AttendanceJournal.importLegacy(principal);
    const rows=(await AttendanceJournal.list(principal)).filter(x=>['pending','inflight','conflict','needs-review'].includes(x.state));
    const legacy=await AttendanceJournal.legacyReviewSummary(principal);
    if (!_isOfflineAttendanceSyncContextCurrent(principal)) return;
    const {body,overlay}=_attendanceReviewSheet('Nhật ký điểm danh trên thiết bị');
    const intro=document.createElement('p');intro.textContent='Các thao tác của tài khoản này chưa rõ xác nhận hoặc bị xung đột được giữ lại. Mỗi lần chỉ hiện tối đa 100 mục.';body.append(intro);
    if (legacy.count) {
        const quarantine=document.createElement('p');quarantine.dataset.legacyReview='true';
        quarantine.textContent=legacy.count+' mục nhật ký cũ/chưa rõ chủ dữ liệu đang được bảo toàn trên thiết bị. Chưa được gửi hoặc gán cho tài khoản hiện tại. Cần xác minh chủ dữ liệu và phê duyệt phương án phục hồi riêng.';body.append(quarantine);
    }
    if (!rows.length) {intro.textContent='Không có bản ghi chờ gửi hoặc đối soát trong tài khoản/cơ sở này.';return;}
    for (const row of rows.slice(0,100)) {
        const item=document.createElement('section');item.style.cssText='padding:12px 0;border-top:1px solid #cbd5e1';
        const text=document.createElement('p');text.textContent=row.record.name+' · '+row.record.date+' · '+(row.record.branch||'Chưa rõ cơ sở')+' · trên thiết bị: '+_attendanceStatusLabel(row.record.status);item.append(text);
        const status=document.createElement('div');status.textContent=String(row.lastError||'').includes('permission-denied')
            ? 'Máy chủ chặn quyền đọc/lưu bản ghi. Có thể trùng lịch sử cũ bị khóa hoặc Rules chưa đồng bộ; cần Admin kiểm tra. Thao tác trên thiết bị được giữ nguyên.'
            : row.state==='inflight'?'Đang chờ xác nhận; hãy đồng bộ lại sau một phút nếu phiên cũ đã đóng.':row.state==='pending'?'Đang chờ gửi.':'Cần đối soát trước khi gửi.';item.append(status);
        let inspectedVersion = '';
        const button=(label,fn)=>{const b=document.createElement('button');b.type='button';b.textContent=label;b.style.cssText='padding:8px;margin:6px 8px 0 0';b.onclick=async()=>{
            b.disabled=true;
            try {if (!_isOfflineAttendanceSyncContextCurrent(principal)) {overlay.remove();throw new Error('Tài khoản/cơ sở đã thay đổi. Hãy mở lại nhật ký.');}await fn();}
            catch(error){if (!_isOfflineAttendanceSyncContextCurrent(principal)) overlay.remove();status.textContent=error.code==='permission-denied'?'Không đủ quyền xem bản ghi này. Cần Admin đối soát lịch sử cũ.':error.message;}
            finally{b.disabled=false;}
        };item.append(b);return b;};
        if (row.state!=='inflight') {
            button('Giữ dữ liệu máy chủ',async()=>{
                if (!window.confirm('Bỏ thao tác trên thiết bị cho '+row.record.name+' ngày '+row.record.date+' và giữ dữ liệu máy chủ?')) return;
                await AttendanceJournal.keepServer(row.id,principal);item.remove();_renderAttendanceJournalControls();
                _markAttendanceDailyMutation('review-keep-server');await _requestAttendanceDailyRefresh('review-keep-server',{force:true});
            });
            button('Xem máy chủ để đối soát',async()=>{
                inspectedVersion = '';
                const previousApply = item.querySelector('[data-reapply]');
                if (previousApply) previousApply.disabled = true;
                const current=await AttendanceService.inspectIntent(row.record);
                if (!_isOfflineAttendanceSyncContextCurrent(principal)||!overlay.isConnected) return;
                inspectedVersion = current.version;
                status.textContent='Máy chủ: '+_attendanceStatusLabel(current.data?.status)+'; thiết bị: '+_attendanceStatusLabel(row.record.status)+'.';
                if (!item.querySelector('[data-reapply]')) {
                    const apply=button('Áp dụng trạng thái trên thiết bị',async()=>{
                        if (!inspectedVersion) throw new Error('Cần xem lại dữ liệu máy chủ trước khi áp dụng.');
                        const verdict=_isOfflineAttendanceRecordAllowed(row.record);
                        if (!verdict.allowed) throw new Error('Thông tin võ sinh/ca tập đã thay đổi; cần Admin kiểm tra.');
                        if (!window.confirm('Áp dụng '+_attendanceStatusLabel(row.record.status)+' cho '+row.record.name+' ngày '+row.record.date+'? Nếu máy chủ thay đổi tiếp, hệ thống sẽ yêu cầu đối soát lại.')) return;
                        await AttendanceJournal.rebase(row.id,inspectedVersion,principal);item.remove();
                        await window.syncOfflineAttendance();_renderAttendanceJournalControls();
                    });apply.dataset.reapply='true';
                }
                item.querySelector('[data-reapply]').disabled = false;
            });
        }
        body.append(item);
    }
}

async function _openAttendanceHistoryAudit() {
    if (!HISTORY_COACH_ACCESS) throw new Error('Đối soát lịch sử chỉ mở sau khi chủ hệ thống duyệt cutover. Dữ liệu cũ chưa được gắn marker mới.');
    const principal=_captureOfflineAttendanceSyncContext();
    if (!_isOfflineAttendanceSyncContextCurrent(principal)||!['admin','super_admin'].includes(principal.role)) throw new Error('Chỉ Admin được xác minh lịch sử cũ.');
    const {body,overlay}=_attendanceReviewSheet('Đối soát cơ sở tại ngày điểm danh');
    const intro=document.createElement('p');intro.textContent='Đối chiếu chứng từ hoặc lịch học gốc cho từng bản ghi. Cơ sở hiện tại của võ sinh chỉ là thông tin tham khảo; không tự xác minh hàng loạt.';body.append(intro);
    const month=document.createElement('input');month.type='month';month.value=document.getElementById('att_month')?.value||document.getElementById('att_date')?.value?.slice(0,7)||_getLocalToday().slice(0,7);body.append(month);
    const exactId=document.createElement('input');exactId.type='text';exactId.placeholder='Dán mã bản ghi trong Console để kiểm tra đúng một mục';exactId.setAttribute('aria-label','Mã bản ghi điểm danh cần kiểm tra');exactId.style.cssText='display:block;width:100%;box-sizing:border-box;margin-top:8px;padding:8px';body.append(exactId);
    const load=document.createElement('button');load.textContent='Tải tháng để đối soát';load.type='button';load.style.cssText='padding:8px;margin:8px';body.append(load);
    const content=document.createElement('div');body.append(content);
    load.onclick=async()=>{
        load.disabled=true;content.textContent='Đang tải…';
        try {
            if (!_isOfflineAttendanceSyncContextCurrent(principal)) throw new Error('Phiên đã thay đổi.');
            const target=exactId.value.trim();
            let rows;
            if (target) {
                // Reuse the existing read-only CAS inspector. A precise lookup
                // avoids loading a whole month to diagnose one denied slot.
                const inspected=await AttendanceService.inspectIntent({clubId:principal.clubId,docId:target});
                rows=inspected.data?[{id:target,data:inspected.data}]:[];
            } else rows=await AttendanceService.loadByMonth(month.value);
            if (!_isOfflineAttendanceSyncContextCurrent(principal)||!overlay.isConnected) return;
            const old=rows.filter(x=>x.data.historyAuthority!==HISTORY_AUTHORITY);content.replaceChildren();
            if (!old.length) {
                content.textContent=target
                    ? rows.length ? 'Bản ghi đã được xác minh: '+(rows[0].data.name||rows[0].data.profileId||'')+' · '+(rows[0].data.date||'')+' · cơ sở '+(rows[0].data.branch||'chưa rõ')+'. Nếu HLV vẫn bị chặn, kiểm tra cơ sở được cấp và Rules trên máy chủ.'
                        : 'Không tìm thấy bản ghi này. Nếu HLV vẫn bị chặn, kiểm tra phiên đăng nhập, cơ sở được cấp và Rules trên máy chủ.'
                    : 'Không có bản ghi cũ chưa xác minh trong tháng này.';
                return;
            }
            const summary=document.createElement('p');summary.textContent=old.length+' bản ghi cần đối soát; hiện tối đa 100 mục. Tải lại để xem tiếp.';content.append(summary);
            for (const entry of old.slice(0,100)) {
                const record={...entry.data,clubId:principal.clubId,docId:entry.id},item=document.createElement('section');item.style.cssText='border-top:1px solid #cbd5e1;padding:12px 0';
                const text=document.createElement('p'),currentProfile=_profiles()[record.profileId];
                text.textContent=record.name+' · '+record.date+' · '+_attendanceStatusLabel(record.status)+' · cơ sở hiện tại: '+(currentProfile?.branch||'không có hồ sơ hiện tại');item.append(text);
                const label=document.createElement('label');label.textContent='Cơ sở tại ngày điểm danh: ';const branch=document.createElement('input');branch.value=record.branch||'';branch.setAttribute('aria-label','Cơ sở tại ngày điểm danh');label.append(branch);item.append(label);
                const verify=document.createElement('button');verify.type='button';verify.textContent='Xác minh bản ghi này';verify.style.cssText='padding:8px;margin:8px';item.append(verify);
                const result=document.createElement('div');item.append(result);
                verify.onclick=async()=>{
                    verify.disabled=true;
                    try {
                        if (!_isOfflineAttendanceSyncContextCurrent(principal)) throw new Error('Phiên đã thay đổi.');
                        const historicalBranch=branch.value.trim();if(!historicalBranch||historicalBranch==='all')throw new Error('Cần xác định cơ sở từ chứng từ gốc.');
                        if (!window.confirm('Xác nhận đã đối chiếu '+record.name+' ngày '+record.date+' thuộc cơ sở '+historicalBranch+' tại lúc điểm danh?')) return;
                        await AttendanceService.attestHistory({...record,branch:historicalBranch},attendanceServerVersion(entry.data));
                        if (!_isOfflineAttendanceSyncContextCurrent(principal)) return;
                        result.textContent='Đã xác minh.';verify.remove();branch.disabled=true;
                    } catch(error) {result.textContent=error.message;} finally {verify.disabled=false;}
                };content.append(item);
            }
        } catch(error) {content.textContent=error.message;} finally {load.disabled=false;}
    };
}

// ════════════════════════════════════════════════════════════════
// PUBLIC: initAttendance() — mount tất cả window.X
// ════════════════════════════════════════════════════════════════
export function initAttendance() {
    const activeClubId = _clubId();
    const principal=_captureOfflineAttendanceSyncContext();
    const principalKey=JSON.stringify([principal.uid,principal.role,principal.clubId,principal.coachBranch,principal.authGeneration]);
    const legacyFallbacksAtInit = Object.fromEntries(
        ATTENDANCE_OWNED_GLOBALS.map((name) => [name, window[name]])
    );
    if (_attendanceInitialized) {
        if (activeClubId !== _attendanceInitializedClubId || principalKey !== _attendanceInitializedPrincipal) {
            _resetAttendanceModuleState(activeClubId);
        }
        _attendanceInitializedPrincipal=principalKey;
        _restoreAttendanceOwnership();
        if (typeof window.syncOfflineAttendance === 'function') {
            Promise.resolve(window.syncOfflineAttendance()).catch(() => {});
        }
        return window.AttendanceModule || null;
    }
    _attendanceInitialized = true;
    _attendanceInitializedClubId = activeClubId;
    _attendanceInitializedPrincipal=principalKey;

    // Expose getters cho các module khác (students.js dùng khi openAddModal)
    window._getClubShifts = function() { return _clubShifts; };
    window._ensureClubShiftsLoaded = async function(options = {}) {
        return _loadClubShifts(options);
    };
    window.currentAttendanceData = {};

    // ── Banner sinh nhật hôm nay ────────────────────────────────
    window._renderHomeBirthdayBanner = function() {
        const bannerEl = document.getElementById('home_birthday_banner');
        if (!bannerEl) return;
        const todayStr = _getLocalToday();
        const parts = todayStr.split('-');
        const tYear = parts[0], tMon = parts[1], tDay = parts[2];
        if (!tMon || !tDay) { bannerEl.style.display = 'none'; return; }
        const coachBr = (window.userRole === 'coach' && window.coachBranch) ? window.coachBranch : null;
        const cfg = _config();
        const byBranch = {};
        Object.entries(_profiles() || {}).forEach(([name, p]) => {
            if (!isActiveProfileForAttendance(p)) return;
            if (coachBr && !_sameBranch(p.branch, coachBr)) return;
            // Phase 4K-6V4D1A: birthday banner must accept all legacy DOB fields.
            // Some profiles imported from Excel use birthDate/birthday/ngaySinh instead
            // of dob, so the banner was hidden even though birthday data existed.
            const dob = p.dob || p.birthDate || p.birthday || p.dateOfBirth || p.ngaySinh || p.ngay_sinh || '';
            if (!dob) return;
            let dobDay, dobMon, dobYear;
            if (dob.includes('/')) { const dp = dob.split('/'); dobDay = (dp[0]||'').padStart(2,'0'); dobMon = (dp[1]||'').padStart(2,'0'); dobYear = dp[2]||''; }
            else if (dob.includes('-')) { const dp = dob.split('-'); dobYear = dp[0]||''; dobMon = dp[1]||''; dobDay = dp[2]||''; }
            else return;
            if (dobDay !== tDay || dobMon !== tMon) return;
            const branch = p.branch || 'Chung';
            if (!byBranch[branch]) byBranch[branch] = [];
            const age = dobYear && tYear ? parseInt(tYear) - parseInt(dobYear) : null;
            byBranch[branch].push({ name, age });
        });
        const branches = Object.keys(byBranch);
        if (branches.length === 0) { bannerEl.style.display = 'none'; return; }
        const hideBranchLabel = (cfg.branchCount === 1) || !!coachBr;
        let html = '<div style="background:linear-gradient(135deg,#fffbeb,#fef3c7);border:1.5px solid #fde68a;border-radius:12px;padding:10px 13px;">';
        html += '<div style="font-size:0.73rem;font-weight:900;color:#92400e;margin-bottom:7px;display:flex;align-items:center;gap:6px;"><span style="font-size:1.05rem;">🎂</span>SINH NHẬT HÔM NAY — ' + tDay + '/' + tMon + '</div>';
        branches.sort().forEach(br => {
            const brName = window.getBranchNameDisplay ? window.getBranchNameDisplay(br) : br;
            const _safeBrName = escapeHtml(brName);
            const people = byBranch[br];
            html += '<div style="display:flex;align-items:baseline;flex-wrap:wrap;gap:4px;margin-bottom:3px;">';
            if (!hideBranchLabel) html += '<span style="font-size:0.64rem;font-weight:900;background:#fcd34d;color:#78350f;padding:1px 7px;border-radius:99px;flex-shrink:0;">📍 ' + _safeBrName + '</span>';
            html += '<span style="font-size:0.78rem;font-weight:700;color:#92400e;">' + people.map(pr => escapeHtml(pr.name) + (pr.age ? ' (' + pr.age + ' tuổi)' : '')).join(', ') + '</span></div>';
        });
        html += '</div>';
        bannerEl.innerHTML = html;
        bannerEl.style.display = 'block';
    };

    // ── Render lịch sử điểm danh 1 thành viên ──────────────────
    window.showAttMemberHistory = async (idxOrName, overrideMonth) => {
        if (_attendanceCanonicalRole(window.__verifiedAuthContextState?.role)==='coach' && !HISTORY_COACH_ACCESS) {window.showToast?.('Lịch sử Điểm danh đang bảo trì để xác minh dữ liệu.',4000);return {blocked:true,reason:'attendance-maintenance'};}
        let name, p;
        if (typeof idxOrName === 'number') {
            const entry = _attCurrentProfiles[idxOrName];
            if (!entry) return;
            [name, p] = entry;
        } else {
            name = idxOrName;
            p = (_profiles() || {})[name] || {};
        }
        const historyOwner = _captureOfflineAttendanceSyncContext();
        const historyAuthoritySnapshot = _memberHistoryAuthoritySnapshot();
        const historyBranchSelector = document.getElementById(overrideMonth ? 'att_month_branch' : 'att_branch');
        const historyBranch = historyOwner.role === 'coach' ? historyOwner.coachBranch
            : _canonicalAttendanceBranch(historyBranchSelector?.value === 'all' ? p.branch : historyBranchSelector?.value, _canonicalAttendanceBranch(p.branch,''));
        const requestId = ++_memberHistoryRequestId;
        const month = overrideMonth || _attCurrentDate.substring(0, 7);
        const [yr, mo] = month.split('-').map(Number);
        const monthDisplay = String(mo).padStart(2,'0') + '/' + yr;
        let modalEl = document.getElementById('attHistModal');
        if (!modalEl) {
            modalEl = document.createElement('div');
            modalEl.id = 'attHistModal';
            modalEl.style.cssText = 'display:flex;position:fixed;inset:0;background:rgba(15,23,42,0.65);z-index:10010;backdrop-filter:blur(4px);align-items:flex-end;justify-content:center;';
            modalEl.innerHTML = '<div id="attHistSheet" style="position:relative;background:#fff;width:100%;max-width:640px;border-radius:20px 20px 0 0;box-shadow:0 -10px 40px rgba(0,0,0,0.18);">'
                + '<button type="button" aria-label="Đóng lịch sử điểm danh" onclick="window.AttendanceModule?.closeMemberHistory?.()" style="position:absolute;top:10px;right:12px;z-index:1;background:#f1f5f9;border:none;border-radius:50%;width:44px;height:44px;font-size:1rem;cursor:pointer;color:#475569;">✕</button>'
                + '<div id="attHistContent" style="width:100%;border-radius:20px 20px 0 0;padding:20px 18px;max-height:82vh;overflow-y:auto;overscroll-behavior:contain;padding-bottom:calc(20px + env(safe-area-inset-bottom));animation:slideUpSheet 0.3s cubic-bezier(0.16,1,0.3,1);"><div id="attHistBody"></div></div></div>';
            modalEl.addEventListener('click', (e) => { if (e.target === modalEl) _closeMemberHistory(); });
            // The tab has layout containment; a fixed child is positioned at
            // the bottom of the full roster instead of the viewport.
            document.body.appendChild(modalEl);
        } else { modalEl.style.display = 'flex'; }
        const bodyEl = document.getElementById('attHistBody');
        const isCurrent = () => requestId === _memberHistoryRequestId &&
            historyAuthoritySnapshot === _memberHistoryAuthoritySnapshot() &&
            _isOfflineAttendanceSyncContextCurrent(historyOwner) && modalEl.isConnected &&
            modalEl.style.display !== 'none';
        bodyEl.innerHTML = '<div style="text-align:center;padding:32px;color:#94a3b8;">⏳ Đang tải dữ liệu tháng ' + monthDisplay + '...</div>';
        // A fast response may replace the placeholder before layout clamps the
        // old scroll offset. Reset once for this open, before awaiting data;
        // never move the user's scroll on a primary/page response.
        document.getElementById('attHistContent').scrollTop = 0;
        try {
            const quarterNum = Math.ceil(mo / 3);
            const quarterStartMo = (quarterNum - 1) * 3 + 1;
            const quarterMonths = [];
            for (let qi = 0; qi < 3; qi++) quarterMonths.push(yr + '-' + String(quarterStartMo + qi).padStart(2, '0'));
            const quarterLabel = 'Quý ' + quarterNum + '/' + yr + ' (T' + quarterStartMo + '–T' + (quarterStartMo + 2) + ')';
            const histList = await AttendanceService.loadMemberHistory(name, quarterMonths);
            if (!isCurrent()) return;
            const snapQ = { forEach: (fn) => histList.forEach(item => fn({ data: () => item.data, id: item.id })) };
            const dayMap = {};
            let present = 0, excused = 0, absent = 0, qPresent = 0, qExcused = 0, qAbsent = 0;
            snapQ.forEach(d => {
                const data = d.data(); const s = data.status || 0;
                if (s === 1) qPresent++; else if (s === 2) qAbsent++; else if (s === 3) qExcused++;
                if (data.month === month) {
                    const dateStr = data.date || ''; const day = parseInt((dateStr.split('-')[2] || '0'), 10);
                    if (day) dayMap[day] = s;
                    if (s === 1) present++; else if (s === 2) absent++; else if (s === 3) excused++;
                }
            });
            const orderedHistory = histList.map(x=>x.data).sort((a,b)=>String(b.date).localeCompare(String(a.date)) || String(b.shiftId||'').localeCompare(String(a.shiftId||'')));
            let consecutiveAbsences=0;
            for (const row of orderedHistory) {if (Number(row.status)!==2) break;consecutiveAbsences++;}
            _attendanceDerivedStats.set(name,{present:qPresent,total:qPresent+qExcused+qAbsent,consecutiveAbsences,label:quarterLabel});
            _renderAttCards();
            const mTotal = present + excused + absent, mRate = mTotal > 0 ? Math.round(present / mTotal * 100) : null;
            const qTotal = qPresent + qExcused + qAbsent, qRate = qTotal > 0 ? Math.round(qPresent / qTotal * 100) : null;
            const _rCol = (r) => r >= 80 ? '#166534' : r >= 60 ? '#92400e' : '#991b1b';
            const _rBg  = (r) => r >= 80 ? '#dcfce7' : r >= 60 ? '#fef3c7' : '#fee2e2';
            const _rIcon= (r) => r >= 80 ? '🟢' : r >= 60 ? '🟡' : '🔴';
            const rateBox = (rate, sessions, total, label) =>
                '<div style="background:#fff;border-radius:10px;padding:10px 12px;border:1px solid #e2e8f0;text-align:center;">'
                + '<div style="font-size:0.65rem;font-weight:700;color:#64748b;margin-bottom:5px;">' + label + '</div>'
                + (rate !== null
                    ? '<div style="font-size:1.45rem;font-weight:900;color:' + _rCol(rate) + ';background:' + _rBg(rate) + ';border-radius:8px;padding:5px 0;">' + _rIcon(rate) + ' ' + rate + '%</div>'
                      + '<div style="font-size:0.6rem;color:#94a3b8;margin-top:3px;">' + sessions + '/' + total + ' buổi có mặt</div>'
                    : '<div style="font-size:0.82rem;color:#94a3b8;padding:5px 0;">Chưa có dữ liệu</div>')
                + '</div>';
            const daysInMonth = new Date(yr, mo, 0).getDate();
            const firstDow    = new Date(yr, mo - 1, 1).getDay();
            const DOW = ['CN','T2','T3','T4','T5','T6','T7'];
            const _hasSched = Array.isArray(p.trainingDays) && p.trainingDays.length > 0;
            const _p_shift_obj = resolveTrainingShift(p.trainingShiftId,_clubShifts);
            const _p_shift_name = _p_shift_obj ? (_p_shift_obj.name + (_p_shift_obj.timeStart && _p_shift_obj.timeEnd ? ' (' + _p_shift_obj.timeStart + '–' + _p_shift_obj.timeEnd + ')' : '')) : '';
            let scheduleHtml = '';
            if (_hasSched || _p_shift_obj) {
                const _dayNames = (_hasSched ? [...p.trainingDays] : []).sort((a,b)=>a-b).map(d => '<span style="font-size:0.74rem;background:#dbeafe;color:#1e40af;padding:3px 9px;border-radius:99px;font-weight:800;">' + (DOW[d]||d) + '</span>');
                scheduleHtml = '<div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:9px 12px;margin-bottom:12px;">'
                    + '<div style="font-size:0.65rem;font-weight:900;color:#1d4ed8;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px;">📅 Lịch học đã đăng ký</div>'
                    + '<div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:4px;">' + (_hasSched ? _dayNames.join('') : '<span style="font-size:0.74rem;color:#475569;">Chưa chọn ngày tập cụ thể.</span>') + '</div>'
                    + (_p_shift_name ? '<div style="margin-top:4px;"><span style="font-size:0.68rem;background:#e0f2fe;color:#0369a1;padding:2px 8px;border-radius:99px;font-weight:700;">⏰ ' + escapeHtml(_p_shift_name) + '</span></div>' : '')
                    + '<div style="font-size:0.61rem;color:#64748b;">🔄 Ô tím trong lịch = ngày <b>học bù</b></div></div>';
            }
            let calHtml = '<div style="font-size:0.72rem;font-weight:800;color:#334155;margin-bottom:8px;">📅 Lịch tháng ' + monthDisplay + '</div>';
            calHtml += '<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:3px;margin-bottom:5px;">';
            DOW.forEach(d => { calHtml += '<div style="text-align:center;font-size:0.6rem;font-weight:800;color:#94a3b8;padding:2px 0;">' + d + '</div>'; });
            calHtml += '</div><div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px;">';
            for (let i = 0; i < firstDow; i++) calHtml += '<div></div>';
            for (let day = 1; day <= daysInMonth; day++) {
                const st = dayMap[day]; const _dow = new Date(yr, mo - 1, day).getDay();
                const _isSchDay = !_hasSched || p.trainingDays.includes(_dow);
                const _isMakeup = (st === 1) && _hasSched && !p.trainingDays.includes(_dow);
                let bg, col, icon;
                if (_isMakeup)     { bg='#f3e8ff';col='#7c3aed';icon='🔄'; }
                else if (st===1)   { bg='#dcfce7';col='#166534';icon='✅'; }
                else if (st===2)   { bg='#fee2e2';col='#991b1b';icon='❌'; }
                else if (st===3)   { bg='#dbeafe';col='#1e40af';icon='📝'; }
                else if (_isSchDay){ bg='#f0f9ff';col='#93c5fd';icon='·'; }
                else               { bg='#f8fafc';col='#cbd5e1';icon=''; }
                calHtml += '<div title="' + day + '/' + monthDisplay + (_isMakeup?' – Học bù':'') + '" style="background:'+bg+';color:'+col+';border-radius:6px;padding:4px 2px;text-align:center;min-height:40px;display:flex;flex-direction:column;align-items:center;justify-content:center;">'
                    + '<div style="font-size:0.72rem;font-weight:700;">' + day + '</div>'
                    + '<div style="font-size:0.78rem;line-height:1;">' + icon + '</div></div>';
            }
            calHtml += '</div>';
            bodyEl.innerHTML =
                '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px;padding-right:44px;">'
                + '<div><div style="font-size:1rem;font-weight:900;color:#0033A0;">' + escapeHtml((window.ProfileCanonicalStore?.resolveDisplayName?.(name, p)) || p.displayName || p.name || p.fullName || p.studentName || name) + '</div>'
                + '<div style="font-size:0.72rem;color:#64748b;margin-top:3px;">🥋 ' + escapeHtml(p.belt||'Đai Trắng') + '</div></div>'
                + '</div>' + scheduleHtml
                + '<div style="display:flex;gap:7px;margin-bottom:12px;flex-wrap:wrap;">'
                + '<span style="background:#dcfce7;color:#166534;padding:5px 12px;border-radius:99px;font-size:0.75rem;font-weight:800;">✅ ' + present + ' buổi</span>'
                + '<span style="background:#dbeafe;color:#1e40af;padding:5px 12px;border-radius:99px;font-size:0.75rem;font-weight:800;">📝 ' + excused + ' phép</span>'
                + '<span style="background:#fee2e2;color:#991b1b;padding:5px 12px;border-radius:99px;font-size:0.75rem;font-weight:800;">❌ ' + absent + ' vắng</span>'
                + '</div>'
                + '<div style="background:#f8fafc;border-radius:12px;padding:12px;margin-bottom:14px;border:1px solid #e2e8f0;">'
                + '<div style="font-size:0.65rem;font-weight:900;color:#475569;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px;">📊 Tỷ lệ chuyên cần</div>'
                + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">'
                + rateBox(mRate,present,mTotal,'Tháng '+monthDisplay)
                + rateBox(qRate,qPresent,qTotal,quarterLabel)
                + '</div></div><div id="attHistoryActionSlot" style="margin:12px 0;"></div><div id="attHistoryCalendar">' + calHtml + '</div>'
                + '<div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;font-size:0.62rem;color:#64748b;">'
                + '<span>⬜ Chưa ĐD</span>'
                + (_hasSched ? '<span style="background:#f0f9ff;padding:1px 5px;border-radius:4px;color:#93c5fd;">· Ngày có lịch</span>' : '')
                + '<span style="background:#f3e8ff;padding:1px 5px;border-radius:4px;color:#7c3aed;">🔄 Học bù</span></div>';
            const historySection = document.createElement('section');
            historySection.style.cssText = 'margin-top:18px;border-top:1px solid #cbd5e1;padding-top:14px;min-width:0;';
            const title = document.createElement('h3');title.textContent = 'Lịch sử Điểm danh đã xác minh';
            const actionSlot = document.getElementById('attHistoryActionSlot');
            title.style.cssText = 'font-size:16px;font-weight:800;line-height:1.4;margin:0;';actionSlot.append(title);
            const coverage = document.createElement('p');
            coverage.textContent = 'Cơ sở: ' + (window.getBranchNameDisplay?.(historyBranch) || historyBranch || 'chưa chọn') + '. Duyệt các năm theo trang, từ cũ đến mới; tối đa 40 bản ghi/trang. Dữ liệu cũ chưa xác minh cần Admin đối soát.';
            coverage.style.cssText = 'font-size:13px;color:#475569;line-height:1.5;margin:8px 0;';actionSlot.append(coverage);
            const rowsEl = document.createElement('div');rowsEl.id = 'attVerifiedHistoryRows';historySection.append(rowsEl);
            const statusEl = document.createElement('p');statusEl.setAttribute('role','status');statusEl.style.cssText = 'font-size:13px;line-height:1.5;margin:8px 0;';historySection.append(statusEl);
            const more = document.createElement('button');more.id = 'attHistoryLoadMore';more.type = 'button';more.textContent = 'Mở lịch sử đã xác minh';
            more.style.cssText = 'font-size:16px;min-height:44px;padding:10px 14px;max-width:100%;border:1px solid #93c5fd;border-radius:10px;color:#1e40af;background:#eff6ff;cursor:pointer;';actionSlot.append(more);
            bodyEl.append(historySection);
            let cursor = null,loading = false,done = false,pageCount = 0;
            const seen = new Set(); // Presentation only; discarded when modal/session closes.
            more.disabled = !/^CS(?:[1-9]|10)$/.test(historyBranch || '');
            more.onclick = async () => {
                if (loading || done || !isCurrent()) return;
                loading = true;more.disabled = true;statusEl.textContent = 'Đang tải trang lịch sử từ máy chủ…';
                try {
                    const page = await AttendanceService.loadMemberHistory(name,null,{page:true,branch:historyBranch,cursor});
                    if (!isCurrent()) return;
                    for (const row of page.rows) {
                        if (seen.has(row.id)) continue;seen.add(row.id);
                        const item = document.createElement('article');item.dataset.historyId = row.id;
                        item.style.cssText = 'border:1px solid #e2e8f0;border-radius:10px;padding:10px;margin:8px 0;font-size:14px;line-height:1.6;overflow-wrap:anywhere;';
                        const data = row.data,shift = resolveTrainingShift(data.shiftId,_clubShifts);
                        const date = document.createElement('strong');date.textContent = data.date + ' · ' + ({1:'Có mặt',2:'Vắng',3:'Có phép'}[Number(data.status)] || 'Chưa điểm danh');
                        const detail = document.createElement('div');detail.textContent = 'Tháng ' + data.month + ' · Ca: ' + (shift?.name || data.shiftId || 'Không gán ca') + ' · ' + (window.getBranchNameDisplay?.(data.branch) || data.branch);
                        item.append(date,detail);rowsEl.append(item);
                    }
                    cursor = page.cursor;done = page.complete;pageCount++;
                    historySection.append(more); // Same control follows the loaded rows; no second CTA/handler.
                    statusEl.textContent = done ? (seen.size ? 'Đã duyệt hết lịch sử đã xác minh của cơ sở này (' + seen.size + ' buổi).' : 'Chưa có lịch sử đã xác minh tại cơ sở này.')
                        : 'Đã tải trang ' + pageCount + ' (' + seen.size + ' buổi đã ghi nhận).';
                    more.textContent = done ? 'Đã hết lịch sử đã xác minh' : 'Tải thêm lịch sử';
                } catch (error) {
                    if (!isCurrent()) return;
                    statusEl.textContent = error.code === 'permission-denied' ? 'Quyền xem lịch sử đã thay đổi. Vui lòng xác minh lại cơ sở.' : error.message;
                    window.recordRuntimeError?.('attendance.member-history.page',error,{branch:historyBranch,stage:'member-history-page'});
                    if (error.code === 'permission-denied') {rowsEl.replaceChildren();seen.clear();done = true;window.invalidateCoachBranchAuthority?.('history-page-denied');}
                    more.textContent = 'Thử tải lại lịch sử';
                } finally {
                    loading = false;if (isCurrent()) more.disabled = done;
                }
            };
        } catch(e) {
            if (!isCurrent()) return;
            const permissionDenied = _classifyAttendanceOfflineError(e) === 'permission-denied';
            bodyEl.textContent = permissionDenied
                ? 'Không đủ quyền tải lịch sử Điểm danh. Cần Admin kiểm tra cơ sở được cấp và Rules trên máy chủ.'
                : 'Lỗi tải dữ liệu. Vui lòng thử lại.';
            window.recordRuntimeError?.('attendance.member-history',e,{stage:'member-history-read',branch:historyOwner.coachBranch||'',month});
        }
    };

    // ── Render danh sách điểm danh ngày ────────────────────────
    // Backward-compatible entry only. The canonical orchestration owner below
    // owns cache reuse, same-key single-flight and latest-context apply.
    window.renderAttendanceList = async (reason = 'legacy-renderAttendanceList', options = {}) =>
        _requestAttendanceDailyRefresh(reason, options);

    // ── Ca tập ─────────────────────────────────────────────────
    window.onShiftChange = () => {
        const sel = document.getElementById('att_shift');
        _currentShiftId = sel ? sel.value : '';
        _attendanceShiftAuthority.selectedShiftId = _currentShiftId;
        return _requestAttendanceDailyRefresh('shift-change', { force: true });
    };

    window.openShiftModal = async () => {
        const modal = document.getElementById('shiftModal');
        if (!modal) return;
        modal.style.display = 'flex';
        ['shift_name','shift_start','shift_end'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
        const branchSelect = document.getElementById('shift_branch');
        if (branchSelect) {
            const source = document.getElementById('att_branch');
            branchSelect.replaceChildren(new Option('-- Chọn cơ sở --',''));
            for (const option of Array.from(source?.options || [])) if (/^CS(?:[1-9]|10)$/.test(option.value)) branchSelect.add(new Option(option.textContent,option.value));
            branchSelect.value = ''; // Require an explicit authority; blank is never global.
        }
        try { await _loadClubShifts(); } catch (_) {}
        _renderShiftListInModal();
    };

    window.closeShiftModal = () => {
        const modal = document.getElementById('shiftModal');
        if (modal) modal.style.display = 'none';
    };

    window.addShift = async () => {
        if (_attendanceShiftAuthority.status !== 'ready') {
            window.showToast('⚠️ Chưa tải được cấu hình ca tập. Vui lòng thử lại.', 3000);
            return { blocked: true };
        }
        const nameEl  = document.getElementById('shift_name');
        const startEl = document.getElementById('shift_start');
        const endEl   = document.getElementById('shift_end');
        const sName = nameEl ? nameEl.value.trim() : '';
        if (!sName) { window.showToast('⚠️ Vui lòng nhập tên ca tập!', 2000); return; }
        const shiftBranch = document.getElementById('shift_branch')?.value || '';
        if (!shiftAuthority({branch:shiftBranch}).resolved) {window.showToast('Vui lòng chọn Cơ sở của ca tập.',3000);return {blocked:true,reason:'SHIFT_AUTHORITY_UNRESOLVED'};}
        const newShift = {
            id: 'shift_' + Date.now(), name: sName,
            timeStart: startEl ? startEl.value : '',
            timeEnd:   endEl   ? endEl.value   : '',
            branch: shiftBranch
        };
        _clubShifts.push(newShift);
        try {
            await AttendanceService.saveShifts(_clubShifts);
        } catch(e) {
            _clubShifts.pop();
            window.showToast('⚠️ Lỗi thêm ca: ' + (e.message || ''), 3000);
            return;
        }
        _commitAttendanceShiftSettingsFromRam('add-shift');
        if (nameEl) nameEl.value = ''; if (startEl) startEl.value = ''; if (endEl) endEl.value = '';
        _renderShiftListInModal();
        window.showToast('✅ Đã thêm ca: ' + sName, 2000);
        if (_isAttendanceDaySubtabActive()) {
            try { await _requestAttendanceDailyRefresh('shift-config-add', { force: false }); } catch (_) {}
        }
    };

    window.deleteShift = async (shiftId) => {
        if (_attendanceShiftAuthority.status !== 'ready') {
            window.showToast('⚠️ Chưa tải được cấu hình ca tập. Vui lòng thử lại.', 3000);
            return { blocked: true };
        }
        const idx = _clubShifts.findIndex(s => s.id === shiftId);
        if (idx === -1) return;
        const removed = _clubShifts.splice(idx, 1)[0];
        try {
            await AttendanceService.saveShifts(_clubShifts);
        } catch(e) {
            _clubShifts.splice(idx, 0, removed);
            window.showToast('⚠️ Lỗi xóa ca: ' + (e.message || ''), 3000);
            return;
        }
        if (_currentShiftId === shiftId) {
            _currentShiftId = '';
            const sel = document.getElementById('att_shift');
            if (sel) sel.value = '';
        }
        _commitAttendanceShiftSettingsFromRam('delete-shift');
        _renderShiftListInModal();
        window.showToast('🗑️ Đã xóa ca: ' + removed.name, 2000);
        if (_isAttendanceDaySubtabActive()) {
            try { await _requestAttendanceDailyRefresh('shift-config-delete', { force: false }); } catch (_) {}
        }
    };

    // ── Toggle điểm danh (xoay vòng 4 trạng thái) ──────────────
    window.toggleAttendance = async (idxOrName) => {
        if (_attendanceCanonicalRole(window.__verifiedAuthContextState?.role)==='coach' && !HISTORY_COACH_ACCESS) {window.showToast?.('Điểm danh đang bảo trì để xác minh lịch sử; nhật ký được giữ nguyên.',4000);return {blocked:true,reason:'attendance-maintenance'};}
        const guard = _resolveAttendanceWriteGuard('toggleAttendance');
        if (!guard) return {blocked:true};
        const entry = typeof idxOrName === 'number' ? _attCurrentProfiles[idxOrName] : _attCurrentProfiles.find(([n])=>n===idxOrName);
        if (!entry) return {blocked:true};
        const [name,p] = entry;
        if (guard.context.role === 'coach' && (!_profiles()[name] ||
            !isActiveProfileForAttendance(_profiles()[name]) ||
            !_sameBranch(_profiles()[name].branch,guard.context.coachBranch) ||
            !_getFilteredAttProfiles().some(([id])=>id===name))) return {blocked:true};
        const owner = _captureOfflineAttendanceSyncContext();
        const date = guard.context.date, shiftId = guard.decision.shiftId;
        const id = getAttendanceDocId(name,date,shiftId), oldStatus = window.currentAttendanceData[name] ?? 0;
        const status = (oldStatus+1)%4;
        _attCurrentDate=date; _currentShiftId=shiftId;
        _markAttendanceDailyMutation('toggleAttendance');
        const saving = _beginAttendanceSaving(guard.context,owner,[{docId:id,status}]);
        _renderAttCards();
        const saved = await _saveAttOffline(owner.clubId,date,guard.decision,[{name,profile:p,status,docId:id}]);
        _finishAttendanceSaving(saving,saved);
        if (!saved.length) {
            window.showToast?.('⚠️ Không lưu được nhật ký trên thiết bị. Hãy thử lại.',3500);
            return {blocked:true,reason:'enqueue-failed'};
        }
        if (!_isOfflineAttendanceSyncContextCurrent(owner)) return {queued:true,stale:true};
        _attendanceDerivedStats.delete(name);
        if (navigator.onLine === false) {
            window.showToast?.('📴 Đã lưu trên thiết bị, đang chờ đồng bộ.',3000);
            return {queued:true};
        }
        return window.syncOfflineAttendance();
    };
    window.toggleAttendanceStatus = window.toggleAttendance;

    // ── Điểm danh hàng loạt ────────────────────────────────────
    window.bulkCheckIn = async () => {
        if (_attendanceCanonicalRole(window.__verifiedAuthContextState?.role)==='coach' && !HISTORY_COACH_ACCESS) {window.showToast?.('Điểm danh đang bảo trì để xác minh lịch sử; nhật ký được giữ nguyên.',4000);return {blocked:true,reason:'attendance-maintenance'};}
        const shiftGuard = _resolveAttendanceWriteGuard('bulkCheckIn');
        if (!shiftGuard) return { blocked: true };
        const writeDate = shiftGuard.context.date;
        const writeShiftId = shiftGuard.decision.shiftId;
        _attCurrentDate = writeDate;
        _currentShiftId = writeShiftId;
        if (!writeDate) { window.showToast('⚠️ Vui lòng chọn ngày điểm danh!', 2500); return; }
        if (shiftGuard.context.role === 'coach') {
            const currentIds = new Set(_getFilteredAttProfiles().map(([id]) => id));
            if (_attCurrentProfiles.some(([name,p]) => !currentIds.has(name) ||
                !_profiles()?.[name] || !isActiveProfileForAttendance(_profiles()[name]) ||
                !_sameBranch(_profiles()[name].branch, shiftGuard.context.coachBranch))) {
                window.showToast?.('⚠️ Danh sách võ sinh đã thay đổi. Vui lòng mở lại Điểm danh.', 3000);
                return { blocked: true };
            }
        }
        const unmarked = _attCurrentProfiles.filter(([name]) => (window.currentAttendanceData[name] ?? 0) === 0);
        if (unmarked.length === 0) { window.showToast('ℹ️ Tất cả võ sinh đã được điểm danh!', 2500); return; }
        const owner = _captureOfflineAttendanceSyncContext();
        _markAttendanceDailyMutation('bulkCheckIn');
        const saving = _beginAttendanceSaving(shiftGuard.context,owner,
            unmarked.map(([name])=>({docId:getAttendanceDocId(name,writeDate,writeShiftId),status:1})));
        _renderAttCards();
        const saved = await _saveAttOffline(owner.clubId,writeDate,shiftGuard.decision,
            unmarked.map(([name,p])=>({name,profile:p,status:1})));
        _finishAttendanceSaving(saving,saved);
        if (saved.length !== unmarked.length) {
            window.showToast?.('⚠️ Không lưu được nhật ký hàng loạt trên thiết bị. Hãy thử lại.',3500);
            return {blocked:true,reason:'enqueue-failed'};
        }
        if (!_isOfflineAttendanceSyncContextCurrent(owner)) return {queued:true,stale:true};
        unmarked.forEach(([name])=>_attendanceDerivedStats.delete(name));
        if (navigator.onLine === false) {
            window.showToast?.('📴 Đã lưu '+saved.length+' bản ghi trên thiết bị, đang chờ đồng bộ.',3500);
            return {queued:true};
        }
        return window.syncOfflineAttendance();
    };

    // ── Offline sync ────────────────────────────────────────────
    const _runOfflineAttendanceSync = async (syncContext) => {
        if (!_isOfflineAttendanceSyncContextCurrent(syncContext)) return {skipped:'stale-context'};
        // Pause before import/claim: no lease/ACK/raw changes during maintenance.
        if (syncContext.role==='coach' && !HISTORY_COACH_ACCESS) return {skipped:'attendance-maintenance'};
        try {await AttendanceJournal.importLegacy(syncContext);}
        catch(error) {_recordAttendanceOfflineIssue('journal-unavailable',error,{stage:'open-journal'});return {error:'attendance/journal-unavailable'};}
        if (navigator.onLine === false) return {skipped:'offline'};
        const refreshShifts = async () => {
            const force = _attendanceShiftRefreshRequested;
            await _loadClubShifts({force});
            if (force) _attendanceShiftRefreshRequested = false;
        };
        try {await refreshShifts();} catch(error) {
            if (_isOfflineAttendanceSyncContextCurrent(syncContext)) window.showToast?.(
                'Chưa xác minh được ca tập; nhật ký trên thiết bị được giữ nguyên. Khi kết nối ổn định, chọn Đồng bộ lại.',4500);
            return {skipped:'shift-config-unavailable',error:error?.code||'attendance/shift-config-unavailable'};
        }
        let synced=0, lastError=null;
        const acknowledged = new Map();
        do {
            _attendanceSyncRequested=false;
            while (_isOfflineAttendanceSyncContextCurrent(syncContext)) {
                if (_attendanceShiftRefreshRequested) {
                    try {await refreshShifts();} catch(error) {return {synced,skipped:'shift-config-unavailable'};}
                }
                let claims=await AttendanceJournal.claim(syncContext,_attendanceSyncOwner,syncContext.role==='coach'?10:400);
                if (!claims.length) break;
                const invalid=claims.filter(row=>!_isOfflineAttendanceRecordAllowed(row.record).allowed);
                if (invalid.length) {
                    await AttendanceJournal.release(invalid,{code:'attendance/validation-review',reviewIds:invalid.map(x=>x.id)});
                    lastError={code:'attendance/validation-review'};
                    const rejected = new Set(invalid.map(row=>row.id));
                    claims = claims.filter(row=>!rejected.has(row.id));
                    if (!claims.length) continue;
                }
                try {
                    const result=await AttendanceService.bulkSyncOffline(syncContext.clubId,'',claims);
                    await AttendanceJournal.acknowledge(claims,result.acknowledgedIds);
                    synced+=result.acknowledgedIds.length;
                    _attendanceDebug().offlineSyncCommittedChunkCleanup+=result.acknowledgedIds.length;
                    if (_isOfflineAttendanceSyncContextCurrent(syncContext)) {
                        claims.forEach(row=>{
                            acknowledged.set(row.record.docId,row);
                            if (row.record.date===_attCurrentDate && row.record.shiftId===_currentShiftId) _attendanceServerVersions[row.record.docId]=row.id;
                            _attendanceDerivedStats.delete(row.record.profileId);
                        });
                    }
                } catch(error) {
                    const ack=error.acknowledgedIds||[];
                    await AttendanceJournal.acknowledge(claims,ack); synced+=ack.length;
                    claims.filter(row=>ack.includes(row.id)).forEach(row=>acknowledged.set(row.record.docId,row));
                    await AttendanceJournal.release(claims,error);
                    _recordAttendanceOfflineIssue(_classifyAttendanceOfflineError(error),error,{stage:'intent-commit'});
                    lastError=error; break;
                }
            }
        } while (!lastError && _attendanceSyncRequested && _isOfflineAttendanceSyncContextCurrent(syncContext));
        const rows=await AttendanceJournal.list(syncContext);
        const pending=rows.filter(x=>['pending','inflight'].includes(x.state)).length;
        const review=rows.filter(x=>['conflict','needs-review'].includes(x.state)).length;
        Object.assign(_attendanceDebug(),{journalPending:pending,journalReview:review,journalAcked:rows.filter(x=>x.state==='acked').length});
        if (_isOfflineAttendanceSyncContextCurrent(syncContext)) {
            const context=_captureAttendanceDailyContext();
            const currentRows=rows.filter(row=>row.record.date===context.date && row.record.shiftId===context.shiftId &&
                (context.branch==='all'||_sameBranch(row.record.branch,context.branch)));
            _attendanceIntentStates=new Map(currentRows.filter(row=>['pending','inflight','conflict','needs-review'].includes(row.state)).map(row=>[row.record.docId,{state:row.state,id:row.id,lastError:row.lastError}]));
            if (synced) {
                _markAttendanceDailyMutation('intent-ack');
                // The CAS ACK is authoritative for these exact documents.
                // Merge in RAM; never add a full-day read for every online click.
                for (const [docId,row] of acknowledged) if (row.record.date===context.date && row.record.shiftId===context.shiftId &&
                    (context.branch==='all'||_sameBranch(row.record.branch,context.branch))) {
                    _attendanceServerVersions[docId]=row.id;
                    if (!_attendanceIntentStates.has(docId)) _attendanceCache[docId]=Number(row.record.status);
                }
            }
            _renderAttendanceDailyFromRam(context,'intent-result');
            if (_classifyAttendanceOfflineError(lastError) === 'permission-denied') {
                window.showToast?.('Máy chủ chặn quyền đọc/lưu Điểm danh. Nhật ký được giữ trên thiết bị; cần Admin kiểm tra bản ghi lịch sử cũ và Rules.',6000);
            } else if (synced||pending||review) window.showToast?.(
                'Đã xác nhận '+synced+'; còn '+pending+' chờ gửi, '+review+' cần đối soát.',4000);
            _renderAttendanceJournalControls();
        }
        return {synced,pending,review,error:lastError?.code||null};
    };

    const _startOfflineAttendanceSyncFlight = (syncContext) => {
        _attendanceDebug().offlineSyncFlights++;
        _offlineAttendanceActiveContext = syncContext;
        const flight = _runOfflineAttendanceSync(syncContext).finally(() => {
            if (_offlineAttendanceSyncPromise !== flight) return;
            _offlineAttendanceSyncPromise = null;
            _offlineAttendanceActiveContext = null;
            const pendingContext = _offlineAttendancePendingContext;
            _offlineAttendancePendingContext = null;
            if (pendingContext && _isOfflineAttendanceSyncContextCurrent(pendingContext)) {
                _attendanceDebug().offlineSyncDifferentContextFollowups++;
                _startOfflineAttendanceSyncFlight(pendingContext).catch((error) => {
                    _recordAttendanceOfflineIssue(_classifyAttendanceOfflineError(error, 'unknown'), error, { stage: 'context-follow-up' });
                });
            }
        });
        _offlineAttendanceSyncPromise = flight;
        return flight;
    };

    window.syncOfflineAttendance = () => {
        const requestedContext = _captureOfflineAttendanceSyncContext();
        if (!requestedContext.clubId) return Promise.resolve({ skipped: 'no-club' });
        if (_offlineAttendanceSyncPromise) {
            if (_sameOfflineAttendanceSyncContext(requestedContext, _offlineAttendanceActiveContext)) {
                _attendanceDebug().offlineSyncCoalesced++;
                _attendanceSyncRequested = true;
                _offlineAttendancePendingContext = requestedContext;
                return _offlineAttendanceSyncPromise;
            }
            if (_sameOfflineAttendanceSyncContext(_offlineAttendancePendingContext, requestedContext)) {
                _attendanceDebug().offlineSyncCoalesced++;
                return _offlineAttendanceSyncPromise;
            }
            if (_offlineAttendancePendingContext) _attendanceDebug().offlineSyncPendingContextReplaced++;
            _offlineAttendancePendingContext = requestedContext;
            _attendanceDebug().offlineSyncDifferentContextQueued++;
            return _offlineAttendanceSyncPromise;
        }
        return _startOfflineAttendanceSyncFlight(requestedContext);
    };
    if (!_onlineListenerBound) {
        // Connectivity alone is not settings authority. Reuse the same shift
        // loader and serial sync flight; native events must contain rejection.
        const onReconnect = () => {
            _attendanceShiftRefreshRequested = true;
            window.syncOfflineAttendance().catch(error=>_recordAttendanceOfflineIssue(
                _classifyAttendanceOfflineError(error,'unknown'),error,{stage:'online-sync'}));
        };
        window.addEventListener('online', onReconnect);
        _onlineListenerBound = true;
    }
    window.syncOfflineAttendance().catch((error) => {
        _recordAttendanceOfflineIssue(_classifyAttendanceOfflineError(error, 'unknown'), error, { stage: 'startup-sync' });
    });

    // ── Sub-tab chuyển Ngày / Tháng ─────────────────────────────
    window.switchAttSubTab = (tab) => {
        const dayDiv=document.getElementById('att_sub_day'), monDiv=document.getElementById('att_sub_month');
        const btnDay=document.getElementById('att_sub_btn_day'), btnMon=document.getElementById('att_sub_btn_month');
        if (!dayDiv || !monDiv) return;
        const isDay = tab === 'day';
        dayDiv.style.display = isDay ? '' : 'none';
        monDiv.style.display = isDay ? 'none' : '';
        if (btnDay) { btnDay.style.background=isDay?'#0033A0':'#fff'; btnDay.style.color=isDay?'#fff':'#64748b'; btnDay.style.borderColor=isDay?'#0033A0':'#e2e8f0'; btnDay.style.boxShadow=isDay?'0 4px 12px rgba(0,51,160,0.2)':'none'; }
        if (btnMon) { btnMon.style.background=isDay?'#fff':'#0033A0'; btnMon.style.color=isDay?'#64748b':'#fff'; btnMon.style.borderColor=isDay?'#e2e8f0':'#0033A0'; btnMon.style.boxShadow=isDay?'none':'0 4px 12px rgba(0,51,160,0.2)'; }
        if (isDay && _monthlyAbortController) {
            try { _monthlyAbortController.abort(); } catch (_) {}
            _monthlyAbortController = null;
            _monthlyRenderRequestId++;
        }
        if (isDay) {
            _requestAttendanceDailyRefresh('attendance-subtab-day', { allowInitialLoad: true }).catch(() => {});
        } else {
            const attMon = document.getElementById('att_month');
            if (attMon && !attMon.value) { const now=new Date(); attMon.value=now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0'); }
            window.renderAttMonthly();
        }
    };

    // ── Thống kê tháng ─────────────────────────────────────────
    window.renderAttMonthly = async () => {
        if (_attendanceCanonicalRole(window.__verifiedAuthContextState?.role)==='coach' && !HISTORY_COACH_ACCESS) {window.showToast?.('Lịch sử Điểm danh đang bảo trì để xác minh dữ liệu.',4000);return {blocked:true,reason:'attendance-maintenance'};}
        if (!_isAttendanceMonthSubtabActive()) {
            _attendanceDebug().daySubtabMonthlyReadPrevented++;
            return { skipped: 'month-subtab-hidden' };
        }
        const monthEl  = document.getElementById('att_month');
        const branchEl = document.getElementById('att_month_branch');
        const tbody    = document.getElementById('att_monthly_body');
        if (!tbody) return;
        const requestId = ++_monthlyRenderRequestId;
        if (_monthlyAbortController) {
            try { _monthlyAbortController.abort(); } catch (_) {}
        }
        _monthlyAbortController = typeof AbortController === 'function' ? new AbortController() : null;
        const requestSignal = _monthlyAbortController ? _monthlyAbortController.signal : null;
        const _isCurrentRequest = () => requestId === _monthlyRenderRequestId && !(requestSignal && requestSignal.aborted);
        const _isMobile = window.innerWidth <= 639;
        const _cardsEl  = document.getElementById('att_monthly_cards');
        const _tableWrap= document.getElementById('att_monthly_table_wrap');
        const _showMsg  = (msg, isError) => {
            const color=isError?'#dc2626':'#94a3b8';
            if (_isMobile && _cardsEl) { _cardsEl.style.display='block'; if(_tableWrap)_tableWrap.style.display='none'; _cardsEl.innerHTML=`<div style="text-align:center;padding:40px 16px;color:${color};font-size:0.88rem;">${msg}</div>`; }
            else { if(_cardsEl)_cardsEl.style.display='none'; if(_tableWrap)_tableWrap.style.display=''; tbody.innerHTML=`<tr><td colspan="10" style="text-align:center;padding:40px;color:${color};font-size:0.88rem;">${msg}</td></tr>`; }
        };
        const selMonth = monthEl ? monthEl.value : '';
        let selBranch  = branchEl ? branchEl.value : 'all';
        const monthlyOwner = _captureOfflineAttendanceSyncContext();
        if (!_isOfflineAttendanceSyncContextCurrent(monthlyOwner)) {
            _showMsg('⚠️ Phiên đăng nhập chưa được xác minh.', true);
            return { blocked: 'unverified-owner' };
        }
        if (monthlyOwner.role === 'coach') selBranch = monthlyOwner.coachBranch;
        if (!selMonth) { _showMsg('Vui lòng chọn tháng để xem thống kê'); return; }
        _showMsg('⏳ Đang tải dữ liệu...');
        try {
            const monthRecords = await AttendanceService.loadByMonth(selMonth, {
                branch: selBranch === 'all' ? '' : selBranch,
                signal: requestSignal,
                onPage: ({ totalDocs, page }) => {
                    if (_isCurrentRequest() && page > 1) {
                        _showMsg('⏳ Đang tải dữ liệu... ' + Number(totalDocs || 0).toLocaleString('vi-VN') + ' bản ghi');
                    }
                }
            });
            if (!_isCurrentRequest()) return;
            if (!_isOfflineAttendanceSyncContextCurrent(monthlyOwner)) return;
            const snap = { forEach: (fn) => monthRecords.forEach(item => fn({ data: () => item.data, id: item.id })) };
            const grouped = {};
            snap.forEach(d => {
                const data=d.data(), pid=data.profileId||data.name||d.id.split('_')[0];
                if (!grouped[pid]) grouped[pid]={name:pid,belt:data.belt||'',branch:data.branch||'',present:0,excused:0,absent:0,dateMap:{}};
                if (data.status===1) grouped[pid].present++;
                if (data.status===2) grouped[pid].absent++;
                if (data.status===3) grouped[pid].excused++;
                if (data.date) grouped[pid].dateMap[data.date] = data.status; // [4J-6] per-date map để tính chuyên cần lịch
            });
            let rows = Object.values(grouped).filter(r => selBranch === 'all' || _sameBranch(r.branch, selBranch));
            Object.entries(_profiles()||{}).forEach(([pid,p]) => {
                if (!isActiveProfileForAttendance(p)) return;
                if (selBranch !== 'all' && !_sameBranch(p.branch, selBranch)) return;
                if (!grouped[pid]) rows.push({name:pid,belt:p.belt||'',branch:p.branch||'',present:0,excused:0,absent:0});
            });
            rows.sort((a,b)=>a.name.localeCompare(b.name,'vi'));
            if (rows.length===0) { _showMsg('Không có dữ liệu điểm danh trong tháng này'); return; }
            const monthDisplay = selMonth.split('-').reverse().join('/');
            const _mkBeltBadge = (belt) => window.getBeltBadge ? window.getBeltBadge(belt||'Trắng') : `<span class="badge" style="background:#f0f4ff;color:#0033A0;">${escapeHtml((belt||'Trắng').replace(/^Đai /i,''))}</span>`;
            const _rateColor = (r) => r>=80?'#16a34a':r>=60?'#d97706':'#dc2626';
            const _rateBg    = (r) => r>=80?'#f0fdf4':r>=60?'#fefce8':'#fff1f2';
            const isMobile   = window.innerWidth <= 639;
            const cardsEl    = document.getElementById('att_monthly_cards');
            const tableWrap  = document.getElementById('att_monthly_table_wrap');
            if (isMobile && cardsEl) {
                cardsEl.style.display='block'; if(tableWrap)tableWrap.style.display='none';
                let cardsHtml='';
                rows.forEach(r => {
                    const _nameToken=encodeURIComponent(String(r.name || '')).replace(/'/g,'%27');
                    const _mTot=r.present+r.excused+r.absent, _mRate=_mTot>0?Math.round(r.present/_mTot*100):null;
                    const _rateStr=_mRate!==null?`${_mRate}%`:'—', _rColor=_mRate!==null?_rateColor(_mRate):'#94a3b8', _rBg=_mRate!==null?_rateBg(_mRate):'#f8fafc';
                    const _mProfile=(_profiles()||{})[r.name]||{}, _mConsAbs=_mProfile.consecutiveAbsences||0;
                    const _mWarnHtml=_mConsAbs>=3?'<span class="abs-warn-red" style="margin-left:5px;font-size:0.75rem;">🔴</span>':_mConsAbs===2?'<span class="abs-warn-yellow" style="margin-left:5px;font-size:0.75rem;">🟡</span>':'';
                    // [4J-6] Tính thống kê lịch học chuẩn
                    const _acc = computeMonthlyAttendanceAccuracy(_mProfile, selMonth, r.dateMap || {});
                    const _hasSchedule = _acc.expectedSessions > 0;
                    const _accRate = _acc.attendanceRate !== null ? Math.round(_acc.attendanceRate * 100) : null;
                    const _compRate = _acc.completionRate !== null ? Math.round(_acc.completionRate * 100) : null;
                    const _accColor = _accRate !== null ? _rateColor(_accRate) : '#94a3b8';
                    const _accBg    = _accRate !== null ? _rateBg(_accRate) : '#f8fafc';
                    const _schedBlock = _hasSchedule
                        ? `<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px;margin-top:7px;padding-top:7px;border-top:1.5px dashed #e2e8f0;">
                            <div style="text-align:center;background:#f0f9ff;border-radius:8px;padding:5px 2px;">
                                <div style="font-size:1rem;font-weight:900;color:#0369a1;">${_acc.expectedSessions}</div>
                                <div style="font-size:0.45rem;font-weight:800;color:#0369a1;margin-top:1px;">📅 PHẢI HỌC</div>
                            </div>
                            <div style="text-align:center;background:#fff7ed;border-radius:8px;padding:5px 2px;">
                                <div style="font-size:1rem;font-weight:900;color:#ea580c;">${_acc.missingAttendanceCount}</div>
                                <div style="font-size:0.45rem;font-weight:800;color:#ea580c;margin-top:1px;">⏳ CHƯA ĐD</div>
                            </div>
                            <div style="text-align:center;background:${_accBg};border-radius:8px;padding:5px 2px;">
                                <div style="font-size:1rem;font-weight:900;color:${_accColor};">${_accRate !== null ? _accRate + '%' : '—'}</div>
                                <div style="font-size:0.45rem;font-weight:800;color:${_accColor};margin-top:1px;">📊 CC LỊCH</div>
                            </div>
                        </div>
                        <div style="margin-top:4px;font-size:0.58rem;color:#64748b;text-align:right;">🏁 Hoàn tất: ${_compRate !== null ? _compRate + '%' : '—'}</div>`
                        : `<div style="margin-top:7px;padding-top:7px;border-top:1.5px dashed #e2e8f0;font-size:0.6rem;color:#94a3b8;font-style:italic;">📅 Chưa có lịch học để tính chuyên cần chuẩn</div>`;
                    cardsHtml+=`<div style="background:#fff;border-radius:14px;border:1px solid #e8edf5;padding:12px 14px;margin-bottom:8px;box-shadow:0 1px 4px rgba(0,0,0,0.05);">
                        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:9px;">
                            <div style="flex:1;min-width:0;overflow:hidden;"><span onclick="window.showAttMemberHistory(decodeURIComponent('${_nameToken}'),'${selMonth}')" style="font-weight:800;font-size:0.9rem;color:#0033A0;cursor:pointer;text-decoration:underline dotted;">${escapeHtml((window.ProfileCanonicalStore?.resolveDisplayName?.(r.name, _mProfile)) || _mProfile.displayName || _mProfile.name || _mProfile.fullName || _mProfile.studentName || r.name)}</span>${_mWarnHtml}</div>
                            <div style="flex-shrink:0;max-width:45%;">${_mkBeltBadge(r.belt)}</div>
                        </div>
                        <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:5px;margin-bottom:5px;">
                            <div style="text-align:center;background:#f0fdf4;border-radius:10px;padding:6px 3px;"><div style="font-size:1.05rem;font-weight:900;color:#16a34a;">${r.present}</div><div style="font-size:0.5rem;font-weight:800;color:#16a34a;margin-top:2px;">✅ CÓ MẶT</div></div>
                            <div style="text-align:center;background:#eff6ff;border-radius:10px;padding:6px 3px;"><div style="font-size:1.05rem;font-weight:900;color:#2563eb;">${r.excused}</div><div style="font-size:0.5rem;font-weight:800;color:#2563eb;margin-top:2px;">📝 NGHỈ CP</div></div>
                            <div style="text-align:center;background:#fff1f2;border-radius:10px;padding:6px 3px;"><div style="font-size:1.05rem;font-weight:900;color:#dc2626;">${r.absent}</div><div style="font-size:0.5rem;font-weight:800;color:#dc2626;margin-top:2px;">❌ NGHỈ KP</div></div>
                            <div style="text-align:center;background:${_rBg};border-radius:10px;padding:6px 3px;"><div style="font-size:1.05rem;font-weight:900;color:${_rColor};">${_rateStr}</div><div style="font-size:0.5rem;font-weight:800;color:${_rColor};margin-top:2px;">📊 CC</div></div>
                        </div>
                        ${_schedBlock}
                        <button onclick="event.stopPropagation();window.copyAttReport(decodeURIComponent('${_nameToken}'),${r.present},${r.excused},${r.absent},'${monthDisplay}')" style="width:100%;padding:8px;background:#0068FF;color:#fff;border:none;border-radius:10px;font-size:0.75rem;font-weight:800;cursor:pointer;margin-top:7px;">📋 Copy báo cáo Zalo gửi phụ huynh</button>
                    </div>`;
                });
                cardsEl.innerHTML=cardsHtml;
            } else {
                if(cardsEl)cardsEl.style.display='none'; if(tableWrap)tableWrap.style.display='';
                let html='';
                rows.forEach((r,i) => {
                    const _nameToken=encodeURIComponent(String(r.name || '')).replace(/'/g,'%27');
                    const rowBg=i%2===0?'':'background:#f8fafc;', _mTot=r.present+r.excused+r.absent, _mRate=_mTot>0?Math.round(r.present/_mTot*100):null;
                    const _rateHtml=_mRate!==null?`<span style="font-weight:900;font-size:0.88rem;color:${_rateColor(_mRate)};">${_mRate}%</span>`:`<span style="color:#94a3b8;font-size:0.75rem;">—</span>`;
                    const _dtProfile=(_profiles()||{})[r.name]||{}, _dtConsAbs=_dtProfile.consecutiveAbsences||0;
                    const _dtWarn=_dtConsAbs>=3?'<span class="abs-warn-red" style="margin-left:4px;font-size:0.72rem;">🔴</span>':_dtConsAbs===2?'<span class="abs-warn-yellow" style="margin-left:4px;font-size:0.72rem;">🟡</span>':'';
                    // [4J-6] Tính chuyên cần theo lịch học
                    const _acc2 = computeMonthlyAttendanceAccuracy(_dtProfile, selMonth, r.dateMap || {});
                    const _hasS = _acc2.expectedSessions > 0;
                    const _expHtml = _hasS ? `<span style="font-weight:800;color:#0369a1;">${_acc2.expectedSessions}</span>` : `<span style="color:#cbd5e1;font-size:0.7rem;">—</span>`;
                    const _misHtml = _hasS ? (_acc2.missingAttendanceCount > 0 ? `<span style="font-weight:800;color:#ea580c;">${_acc2.missingAttendanceCount}</span>` : `<span style="font-weight:800;color:#16a34a;">0</span>`) : `<span style="color:#cbd5e1;font-size:0.7rem;">—</span>`;
                    const _accR2 = _acc2.attendanceRate !== null ? Math.round(_acc2.attendanceRate * 100) : null;
                    const _cmpR2 = _acc2.completionRate !== null ? Math.round(_acc2.completionRate * 100) : null;
                    const _accHtml2 = _accR2 !== null ? `<span style="font-weight:900;font-size:0.85rem;color:${_rateColor(_accR2)};">${_accR2}%</span>` : `<span style="color:#94a3b8;font-size:0.72rem;">${_hasS ? '' : 'Chưa có lịch'}</span>`;
                    const _cmpHtml2 = _cmpR2 !== null ? `<span style="font-size:0.75rem;color:#475569;">${_cmpR2}%</span>` : `<span style="color:#cbd5e1;font-size:0.7rem;">—</span>`;
                    html+=`<tr style="${rowBg}"><td><span onclick="window.showAttMemberHistory(decodeURIComponent('${_nameToken}'),'${selMonth}')" style="font-weight:700;color:#0033A0;cursor:pointer;text-decoration:underline dotted;">${escapeHtml((window.ProfileCanonicalStore?.resolveDisplayName?.(r.name, _dtProfile)) || _dtProfile.displayName || _dtProfile.name || _dtProfile.fullName || _dtProfile.studentName || r.name)}</span>${_dtWarn}</td><td>${_mkBeltBadge(r.belt)}</td><td style="text-align:center;"><span style="font-weight:800;color:#16a34a;font-size:1rem;">${r.present}</span></td><td style="text-align:center;"><span style="font-weight:800;color:#2563eb;font-size:1rem;">${r.excused}</span></td><td style="text-align:center;"><span style="font-weight:800;color:#dc2626;font-size:1rem;">${r.absent}</span></td><td style="text-align:center;">${_rateHtml}</td><td style="text-align:center;">${_expHtml}</td><td style="text-align:center;">${_misHtml}</td><td style="text-align:center;">${_accHtml2}<br><span style="font-size:0.6rem;color:#94a3b8;">HT:${_cmpHtml2}</span></td><td style="text-align:center;"><button onclick="event.stopPropagation();window.copyAttReport(decodeURIComponent('${_nameToken}'),${r.present},${r.excused},${r.absent},'${monthDisplay}')" style="background:#0068FF;color:#fff;border:none;padding:5px 9px;border-radius:8px;font-size:0.7rem;font-weight:700;cursor:pointer;">📋 Zalo</button></td></tr>`;
                });
                tbody.innerHTML=html;
            }
            if (window.userRole==='admin'||window.userRole==='super_admin') {
                if (typeof window.loadAllSessionNotes === 'function') window.loadAllSessionNotes(selMonth);
            }
        } catch(e) {
            const isAborted = e && (e.name === 'AbortError' || e.code === 'attendance/monthly-load-aborted');
            if (isAborted || !_isCurrentRequest()) return;
            const message = e && e.code === 'attendance/monthly-max-pages'
                ? '⚠️ Dữ liệu điểm danh vượt ngưỡng an toàn. Hệ thống đã dừng để tránh hiển thị thiếu dữ liệu.'
                : '⚠️ Lỗi tải dữ liệu. Vui lòng thử lại.';
            const cardsEl=document.getElementById('att_monthly_cards');
            if (cardsEl && cardsEl.style.display!=='none') cardsEl.innerHTML='<div style="text-align:center;padding:32px;color:#dc2626;font-size:0.88rem;">'+message+'</div>';
            else tbody.innerHTML='<tr><td colspan="10" style="text-align:center;padding:40px;color:#dc2626;font-size:0.88rem;">'+message+'</td></tr>';
        } finally {
            if (requestId === _monthlyRenderRequestId) _monthlyAbortController = null;
        }
    };

    // exportAttendanceExcel vẫn dùng app.js (phụ thuộc xlsx-js-style context)
    // sẽ được extract trong Phase 3

    // ── Phase 4.0B-4J-5: Attendance debug helpers ─────────────────────────
    window.__attendanceDebug = window.__attendanceDebug || {};

    window.printAttendanceStatus = function printAttendanceStatus() {
        // [4J-6A] Đếm offline queue và số records có shiftId
        let offlineQueueCount = 0;
        let offlineShiftRecordsCount = 0;
        try {
            for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                if (k && k.startsWith('offline_att_')) {
                    offlineQueueCount++;
                    try {
                        const payload = JSON.parse(localStorage.getItem(k) || 'null');
                        if (payload && payload.records) {
                            Object.values(payload.records).forEach(function(rec) {
                                if (rec.shiftId && rec.shiftId !== '') offlineShiftRecordsCount++;
                            });
                        }
                    } catch(_) {}
                }
            }
        } catch(_) {}

        const result = {
            currentDate:               window.__attendanceDebug.currentDate || '',
            currentShiftId:            window.__attendanceDebug.currentShiftId || '',
            currentProfilesCount:      window.__attendanceDebug.currentProfilesCount || 0,
            cacheCount:                window.__attendanceDebug.cacheCount || 0,
            offlineQueueCount,
            offlineShiftRecordsCount,
            hasShift:                  !!window.__attendanceDebug.currentShiftId
        };
        console.table(result);
        return result;
    };

    // ── Phase 4.0B-4J-6: Session completion warning ───────────────────────────

    /**
     * Kiểm tra ca tập hôm nay đã điểm danh đủ chưa.
     * Không ghi Firestore. Không log PII.
     *
     * @returns {{date, branch, shiftId, expectedProfilesCount, markedCount, missingCount, completed}}
     */
    window.printAttendanceSessionCompletion = function printAttendanceSessionCompletion() {
        const date     = _getLocalToday();
        const shiftId  = _currentShiftId || '';
        const branchEl = document.getElementById('att_branch');
        const branch   = (window.userRole === 'coach' && window.coachBranch)
            ? window.coachBranch
            : (branchEl ? branchEl.value : 'all');

        const profiles = _attCurrentProfiles.length > 0
            ? _attCurrentProfiles
            : Object.entries(_profiles() || {}).filter(([, p]) => isActiveProfileForAttendance(p));

        const expectedProfilesCount = profiles.length;
        let markedCount = 0;
        profiles.forEach(([name]) => {
            const st = (window.currentAttendanceData || {})[name];
            if (st !== undefined && st !== 0) markedCount++;
        });
        const missingCount = expectedProfilesCount - markedCount;
        const completed    = missingCount === 0;

        const result = { date, branch, shiftId, expectedProfilesCount, markedCount, missingCount, completed };
        console.table(result);
        if (!completed && missingCount > 0) {
            console.warn('[Điểm danh] ⚠️ Còn ' + missingCount + ' võ sinh trong ca này chưa được điểm danh.');
        } else if (completed) {
            console.info('[Điểm danh] ✅ Ca tập đã được điểm danh đầy đủ (' + markedCount + '/' + expectedProfilesCount + ').');
        }
        return result;
    };

    /**
     * Báo cáo nhẹ điểm danh theo cơ sở (và ca tập nếu có) trong một tháng.
     * Không log tên võ sinh. Không ghi Firestore.
     *
     * @param {string} monthStr — YYYY-MM (mặc định tháng hiện tại)
     * @returns {Object} report theo branch/shiftId
     */
    // [4J-6A] Hàm helper: xây map attendanceMap cho một võ sinh từ mảng records loadByMonth
    function _buildAttendanceMapForProfile(monthRecords, profileName) {
        const map = {};
        monthRecords.forEach(function(rec) {
            // rec là { id, data } từ AttendanceService.loadByMonth
            const d = rec.data || rec;
            if (!d || d.name !== profileName) return;
            const date    = d.date || '';
            const shiftId = d.shiftId || '';
            if (!date) return;
            // Key shift-aware (mới)
            if (shiftId) map[profileName + '_' + date + '_' + shiftId] = d;
            // Key không có shift (fallback)
            map[profileName + '_' + date] = d;
            // Key chỉ theo ngày (cho computeMonthlyAttendanceAccuracy date-only lookup)
            if (!map[date]) map[date] = d;
        });
        return map;
    }

    window.printAttendanceBranchReport = async function printAttendanceBranchReport(monthStr) {
        if (!monthStr) {
            const now = new Date();
            monthStr = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
        }
        const allProfs = _profiles() || {};
        const branchStats = {};

        // [4J-6A] Load dữ liệu điểm danh tháng thật từ Firestore
        let monthRecords = [];
        try {
            monthRecords = await AttendanceService.loadByMonth(monthStr);
        } catch(e) {
            console.warn('[BranchReport] Không thể load dữ liệu tháng ' + monthStr + '. Báo cáo dùng schedule-only.');
        }

        Object.entries(allProfs).forEach(([name, p]) => {
            if (!isActiveProfileForAttendance(p)) return;
            const br  = p.branch || 'Chung';
            const sid = p.trainingShiftId || '';
            const key = sid ? br + '::' + sid : br;
            if (!branchStats[key]) {
                branchStats[key] = {
                    branch: br, shiftId: sid,
                    expectedSessions: 0, presentCount: 0, absentCount: 0,
                    excusedCount: 0, missingAttendanceCount: 0, attendanceRate: null,
                    _profileCount: 0
                };
            }
            // [4J-6A] Dùng map thật thay vì {} rỗng
            const attendanceMap = _buildAttendanceMapForProfile(monthRecords, name);
            const acc = computeMonthlyAttendanceAccuracy(p, monthStr, attendanceMap, { profileName: name });
            branchStats[key].expectedSessions      += acc.expectedSessions;
            branchStats[key].presentCount          += acc.presentCount;
            branchStats[key].absentCount           += acc.absentCount;
            branchStats[key].excusedCount          += acc.excusedCount;
            branchStats[key].missingAttendanceCount+= acc.missingAttendanceCount;
            branchStats[key]._profileCount++;
        });

        Object.values(branchStats).forEach(s => {
            s.attendanceRate = s.expectedSessions > 0
                ? Math.round(s.presentCount / s.expectedSessions * 100) + '%'
                : null;
        });

        const report = { month: monthStr, byBranch: branchStats };
        console.log('[BranchReport] Tháng ' + monthStr + ' (dữ liệu thật: ' + monthRecords.length + ' bản ghi)');
        Object.entries(branchStats).forEach(([key, s]) => {
            console.log(
                '  [' + key + '] phải học:' + s.expectedSessions +
                ' | có mặt:' + s.presentCount +
                ' | vắng:' + s.absentCount +
                ' | phép:' + s.excusedCount +
                ' | chưa ĐD:' + s.missingAttendanceCount +
                ' | CC:' + (s.attendanceRate || '—')
            );
        });
        return report;
    };

    const ownershipResults = _registerAttendanceOwnership(legacyFallbacksAtInit);
    const failedOwnership = ownershipResults.filter((item) => !item.ok);
    if (failedOwnership.length) {
        console.error('[Attendance] Canonical ownership registration failed:', failedOwnership);
    }

    window.AttendanceModule = Object.freeze({
        ..._ownedAttendanceImplementations,
        openPendingReview: _openAttendancePendingReview,
        openHistoryAudit: _openAttendanceHistoryAudit,
        requestDailyRefresh(reason, options = {}) {
            return _requestAttendanceDailyRefresh(reason || 'AttendanceModule.requestDailyRefresh', options);
        },
        renderDailyFromRam(reason = 'AttendanceModule.presentation') {
            return _requestAttendanceDailyRefresh(reason, { presentationOnly: true, allowInitialLoad: true });
        },
        isDaySubtabActive: _isAttendanceDaySubtabActive,
        isMonthSubtabActive: _isAttendanceMonthSubtabActive,
        ensureShiftsLoaded(options = {}) {
            return _loadClubShifts(options);
        },
        retryShiftConfig() {
            return _requestAttendanceDailyRefresh('shift-config-retry', {
                force: true,
                forceShiftConfig: true,
            });
        },
        getShiftAuthority() {
            return { ..._attendanceShiftAuthority };
        },
        getEligibleShifts() {
            return _getEligibleAttendanceShifts(_captureAttendanceDailyContext()).map((shift) => ({ ...shift }));
        },
        resolveShiftAuthority(context) {
            const resolved = _resolveAttendanceShiftAuthority(context || _captureAttendanceDailyContext());
            return { ...resolved, eligibleShifts: resolved.eligibleShifts.map((shift) => ({ ...shift })) };
        },
        getDailyState() {
            return {
                requestGeneration: _attendanceDailyState.requestGeneration,
                currentSnapshotKey: _attendanceDailyState.currentSnapshotKey,
                currentSnapshotAuthGeneration: _attendanceDailyState.currentSnapshotAuthGeneration,
                currentSnapshotAt: _attendanceDailyState.currentSnapshotAt,
                inFlightKeys: Array.from(_attendanceDailyState.inFlight.keys()),
                latestIntent: _attendanceDailyState.latestIntent ? { ..._attendanceDailyState.latestIntent } : null,
                mutationRevision: _attendanceDailyState.mutationRevision,
                cacheReady: _attendanceDailyState.cacheReady,
                cacheTtlMs: _ATTENDANCE_DAILY_CACHE_TTL_MS,
                serverConfirmedContext: _attendanceServerContext,
                serverVersionCount: Object.keys(_attendanceServerVersions).length,
                shiftAuthority: { ..._attendanceShiftAuthority },
            };
        },
        resetForClub(clubId) {
            _resetAttendanceModuleState(clubId || _clubId());
            return true;
        },
        closeMemberHistory() {
            return _closeMemberHistory();
        },
        getMetrics() {
            return {
                phase: '4K-6V5U6G-production-stability-residual-defect-closure',
                initialized: _attendanceInitialized,
                clubId: _attendanceInitializedClubId,
                ownedGlobals: ATTENDANCE_OWNED_GLOBALS.slice(),
                ownershipFailures: failedOwnership.slice(),
                monthlyPagination: window.__attendanceMonthlyPaginationMetrics || null,
                daily: window.__attendanceDebug || null,
                onlineListenerBound: _onlineListenerBound
            };
        }
    });

    console.info('[attendance.js] ✅ Phase 4K-6V5U6G residual closure: explicit shift + V3 transactional journal ready');
    return window.AttendanceModule;
}
