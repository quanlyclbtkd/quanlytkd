/**
 * js/listeners/profiles.listeners.js — Phase 3.7C
 * ────────────────────────────────────────────────────────────────
 * Active Profiles Listener + Lazy Quit Profiles + Split Hardening
 *
 * PHASE 3.7C UPGRADES (vs 3.7B):
 *   - Import status values từ profileStatusConfig.js (không hardcode)
 *   - Coverage guard: phát hiện active query trả về ít hơn mong đợi
 *   - Fallback loop guard: maxFallbackPerSession + fallbackInProgress
 *   - ensureAllProfilesForExport(): helper export/report cần full data
 *   - Cải thiện quitLoadingInProgress guard — không chạy parallel
 *   - Mở rộng metrics: coverageWarnings, fallbackGuard, exportCount...
 *
 * LISTENER KEYS:
 *   students:profiles:active:{clubId}:{role}:{branch?} — role-scoped active snapshot
 *   (quit dùng getDocs một lần — không có listener key)
 *
 * KHÔNG:
 *   - Mutate DOM
 *   - Gọi renderApp / scheduleRender trực tiếp
 *   - Đổi Firestore schema / status field
 *   - Ghi ngược database
 *
 * TODO Phase 3.8:
 *   - Pagination cho active profiles nếu > 1000 VS
 *   - Realtime cho quit nếu cần cập nhật liên tục
 * ────────────────────────────────────────────────────────────────
 */

import {
    setActiveProfiles,
    setQuitProfiles,
    syncLegacyAllProfiles,
    getProfileScaleMetrics,
    markActiveLoaded,
    markQuitLoaded,
    markQuitComplete,
    isQuitComplete,
    getQuitProfiles,
} from '../data/studentProfileStore.js';

import {
    getActiveQueryValues,
    getQuitQueryValues,
    getProfileStatusConfig,
    classifyProfileStatus,
} from '../data/profileStatusConfig.js';

// ── Backward compat aliases (Phase 3.7B callers dùng tên cũ) ──────────────
export { getActiveQueryValues as getActiveStatusValues };
export { getQuitQueryValues   as getQuitStatusValues  };

// ─────────────────────────────────────────────────────────────────────────────
// INTERNAL STATE — Phase 3.7C (mở rộng từ 3.7B)
// ─────────────────────────────────────────────────────────────────────────────

const _state = {
    // ── Listener registry ─────────────────────────────────────────────────────
    activeListenerKey:      null,
    quitListenerKey:        null,      // getDocs — chưa có listener key

    // ── Active listener ───────────────────────────────────────────────────────
    activeListenerMounted:  false,
    activeSnapshotCount:    0,
    activeQueryErrorCount:  0,
    role:                   '',
    coachBranch:            '',
    coachBranchFallbackCount: 0,
    coachLegacyListenerKey: null,
    coachCanonicalActiveMap: {},
    coachLegacyActiveMap: {},

    // ── Quit load ─────────────────────────────────────────────────────────────
    quitLoaded:             false,
    quitLoadCount:          0,
    quitQueryErrorCount:    0,
    quitLoadLastReason:     '',
    /** Guard: prevent parallel quit load calls */
    quitLoadingInProgress:  false,
    /** Phase 4K-6V4B3: full authoritative reconciliation for Admin quit tab */
    quitCompletenessReconciled: false,
    quitAuthorityState:     'none', // none|loading|complete|dirty|error
    quitAuthorityDocsRead:  0,
    quitAuthorityError:     '',
    quitAuthorityClubId:    '',
    quitAuthorityLoadedAt:  0,
    quitAuthorityDirtyReason: '',
    /** Phase 4K-6V5S: context wait/recovery diagnostics (no console spam). */
    quitMissingContextCount: 0,
    quitContextRecoveryCount: 0,
    quitContextRetryCount: 0,
    quitContextRetryMax: 5,
    quitContextLastMissingAt: 0,
    quitContextLastRecoveredAt: 0,

    // ── Full fallback loop guard (Phase 3.7C) ─────────────────────────────────
    /** Đang chạy fallback → chặn concurrent call */
    fallbackInProgress:     false,
    /** Đã hoàn thành ít nhất 1 fallback */
    fallbackCompleted:      false,
    fallbackCount:          0,
    fullFallbackReason:     '',
    /** Tối đa số lần fallback / session — chặn loop */
    maxFallbackPerSession:  3,

    // ── Coverage guard (Phase 3.7C) ───────────────────────────────────────────
    /**
     * Flag: đã trigger fallback do coverage suspicious chưa.
     * Mỗi session chỉ cho phép 1 lần auto-fallback vì coverage.
     */
    hasTriggeredActiveCoverageFallback: false,
    activeCoverageWarnings:             0,
    suspiciousActiveCountEvents:        0,
    activeCoverageLastReason:           '',
    /**
     * Compat count được capture TRƯỚC khi active listener mount.
     * Làm baseline để phát hiện active query trả về ít bất thường.
     */
    previousCompatCount:    0,
    /** Active count ở snapshot trước */
    previousActiveCount:    -1,

    // ── Mode ──────────────────────────────────────────────────────────────────
    /**
     * 'none'         — chưa khởi tạo
     * 'active-split' — active-only listener + lazy quit
     * 'full-fallback'— full profiles load (fallback khi query lỗi)
     */
    lastProfilesMode:       'none',

    // ── Export helpers ────────────────────────────────────────────────────────
    exportEnsureAllProfilesCount: 0,
};

/** Context: lưu từ mountActiveProfilesListener, dùng cho lazy quit + fallback */
let _ctx = null;
let _quitAuthorityPromise = null;
let _quitContextRetryArmed = false;
let _quitContextRetryTimer = null;
let _quitContextRetryHandlers = [];

function _normalizeRole(value) {
    const role = String(value || '').trim().toLowerCase().replace(/-/g, '_');
    return role === 'hlv' ? 'coach' : (role === 'superadmin' ? 'super_admin' : role);
}

function _contextRole(context = _ctx) {
    return _normalizeRole((context && context.role) || _state.role || window.userRole || window.__store?.userRole || '');
}

function _isCoachContext(context = _ctx) {
    return _contextRole(context) === 'coach';
}

function _coachBranch(context = _ctx) {
    const raw = (context && context.coachBranch) || _state.coachBranch || window.coachBranch || window.__store?.coachBranch || '';
    if (window.BranchIdentity?.normalize) return window.BranchIdentity.normalize(raw, { fallback: '' });
    const value = String(raw || '').trim();
    return /^(Mặc định|mac dinh|default)$/i.test(value) ? 'CS1' : value;
}

function _coachBranchAliases(context = _ctx) {
    const branch = _coachBranch(context);
    if (window.BranchIdentity?.aliases) return window.BranchIdentity.aliases(branch);
    return branch === 'CS1' ? ['CS1', 'Mặc định'] : (branch ? [branch] : []);
}

function _mergedCoachActiveMap() {
    return Object.assign({}, _state.coachLegacyActiveMap || {}, _state.coachCanonicalActiveMap || {});
}

// Phase 4K-6V5S: recover the profile context from the canonical runtime bridge.
// V5R stored context only when mountActiveProfilesListener() ran. If the user
// opened Đã nghỉ before that mount completed, ensureQuitAuthority() repeatedly
// returned false and the renderer invalidated itself forever. The resolver below
// never adds a read; it only reuses already-created db/profRef/clubId references.
function _resolveProfilesContext(contextOverride) {
    const explicit = (contextOverride && typeof contextOverride === 'object') ? contextOverride : {};
    const store = window.__store || {};
    let appContext = {};
    try {
        appContext = (typeof window.getAppContext === 'function')
            ? (window.getAppContext('quit-authority-context-recovery') || {})
            : {};
    } catch (_) {}

    const base = Object.assign({}, appContext || {}, _ctx || {}, explicit);
    const clubId = String(
        base.clubId || base.currentClubId ||
        store.currentClubId || store.clubId ||
        window.currentClubId || ''
    ).trim();
    const db = base.db || store.db || appContext.db || window.db || window._db || null;
    let profRef = base.profRef || store.profRef || appContext.profRef || null;

    if (!profRef && db && clubId) {
        try {
            const fbCollection = (window._fb_init || {}).collection;
            if (typeof fbCollection === 'function') {
                profRef = fbCollection(db, 'clubs', clubId, 'profiles');
            }
        } catch (_) {}
    }

    return Object.assign({}, base, {
        db,
        clubId,
        currentClubId: clubId,
        profRef,
        role: base.role || store.userRole || window.userRole || '',
        coachBranch: base.coachBranch || store.coachBranch || window.coachBranch || '',
    });
}

function _hasQuitContext(context) {
    return !!(context && context.profRef && String(context.clubId || '').trim());
}

function _quitDebugEnabled() {
    try {
        return window.__QUIT_AUTHORITY_DEBUG === true || localStorage.getItem('quitAuthorityDebug') === '1';
    } catch (_) {
        return window.__QUIT_AUTHORITY_DEBUG === true;
    }
}

function _clearQuitContextRetry() {
    _quitContextRetryArmed = false;
    if (_quitContextRetryTimer) clearTimeout(_quitContextRetryTimer);
    _quitContextRetryTimer = null;
    try {
        _quitContextRetryHandlers.forEach(([name, fn]) => window.removeEventListener(name, fn));
    } catch (_) {}
    _quitContextRetryHandlers = [];
}

function _armQuitContextRetry(reason) {
    if (_quitContextRetryArmed) return;
    if (_state.quitContextRetryCount >= _state.quitContextRetryMax) return;

    const activeTab = typeof window.getCurrentActiveTabId === 'function'
        ? window.getCurrentActiveTabId()
        : '';
    if (activeTab && activeTab !== 'quit') return;

    _quitContextRetryArmed = true;
    _state.quitContextRetryCount++;
    const delay = Math.min(8000, 400 * Math.pow(2, Math.max(0, _state.quitContextRetryCount - 1)));

    const retry = () => {
        _clearQuitContextRetry();
        const recovered = _resolveProfilesContext();
        if (_hasQuitContext(recovered)) {
            _ctx = recovered;
            _state.quitContextRecoveryCount++;
            _state.quitContextLastRecoveredAt = Date.now();
            _state.quitContextRetryCount = 0;
            loadQuitProfilesIfNeeded('quit-context-recovered:' + (reason || 'unknown'), recovered)
                .then(ok => {
                    if (ok === true && typeof window.renderQuitList === 'function' && window.getCurrentActiveTabId?.() === 'quit') {
                        window.renderQuitList({ reason: 'quit-context-recovered' });
                    }
                })
                .catch(() => {});
            return;
        }
        _armQuitContextRetry(reason);
    };

    try {
        ['app:context-ready', 'app:db-ready'].forEach(name => {
            window.addEventListener(name, retry, { once: true });
            _quitContextRetryHandlers.push([name, retry]);
        });
    } catch (_) {}
    _quitContextRetryTimer = setTimeout(retry, delay);
}

// ─────────────────────────────────────────────────────────────────────────────
// PRIVATE HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Sync allProfiles closure trong app.js qua window bridge.
 * @private
 */
function _syncLegacy() {
    if (typeof window._syncAllProfilesLegacy === 'function') {
        window._syncAllProfilesLegacy();
    }
}

/**
 * Invalidate students + dashboard + attendance + exam + tuition + debt render.
 *
 * Phase 4K-DATA-HYDRATION: Thêm tuition + debt + finance — đảm bảo Học Phí (0) /
 * Báo Nợ (0) tự cập nhật khi profiles hydrate về sau login.
 * @private
 */
function _invalidateAll(reason) {
    if (_isCoachContext()) {
        if (typeof window.invalidateByDomain === 'function') window.invalidateByDomain('attendance', reason);
        return;
    }
    // [GITHUB-FIX] Task 5: Dùng invalidateLists cho tất cả student lists nếu có
    // Đảm bảo BÁO NỢ, HỌC PHÍ, ĐANG TẬP, ĐÃ NGHỈ đều refresh khi profiles load xong
    if (typeof window.invalidateLists === 'function') {
        window.invalidateLists([
            'students.activeList',
            'students.debtList',
            'students.quitList',
        ], reason);
    } else if (typeof window.invalidateStudents === 'function') {
        window.invalidateStudents(reason);
    }

    if (typeof window.invalidateDashboard === 'function') window.invalidateDashboard(reason);
    if (typeof window.invalidateByDomain  === 'function') {
        window.invalidateByDomain('attendance', reason);
        window.invalidateByDomain('exam',       reason);
        // Phase 4K-DATA-HYDRATION: tuition + debt cần re-calc khi profile count thay đổi
        window.invalidateByDomain('tuition',    reason);
        window.invalidateByDomain('debt',       reason);
    }
    // Finance tab (Học Phí) — tính lại tóm tắt doanh thu + báo nợ khi profiles thay đổi
    if (typeof window.invalidateFinance === 'function') window.invalidateFinance(reason);
    // students.activeList — cập nhật counter "Đang Tập (N)" (fallback nếu invalidateLists không có)
    if (typeof window.invalidateList === 'function' && typeof window.invalidateLists !== 'function') {
        window.invalidateList('students.activeList', reason);
    }
}

/**
 * Cập nhật window.__profileScaleMetrics — Phase 3.7C version.
 * @private
 */
function _updateWindowMetrics() {
    if (!window.__profileScaleMetrics) return;
    const storeM = (typeof window.getProfileScaleMetrics === 'function')
        ? window.getProfileScaleMetrics()
        : getProfileScaleMetrics();
    const cfg = getProfileStatusConfig();

    Object.assign(window.__profileScaleMetrics, storeM, {
        // Listener
        activeListenerMounted:              _state.activeListenerMounted,
        activeSnapshotCount:                _state.activeSnapshotCount,
        activeQueryErrorCount:              _state.activeQueryErrorCount,
        role:                               _state.role,
        coachBranch:                        _state.coachBranch,
        coachBranchFallbackCount:           _state.coachBranchFallbackCount,
        // Quit
        quitLoaded:                         _state.quitLoaded,
        quitLoadCount:                      _state.quitLoadCount,
        quitQueryErrorCount:                _state.quitQueryErrorCount,
        quitLoadInProgress:                 _state.quitLoadingInProgress,
        quitLoadLastReason:                 _state.quitLoadLastReason,
        quitCompletenessReconciled:          _state.quitCompletenessReconciled,
        quitAuthorityState:                  _state.quitAuthorityState,
        quitAuthorityDocsRead:               _state.quitAuthorityDocsRead,
        quitAuthorityError:                  _state.quitAuthorityError,
        quitAuthorityClubId:                 _state.quitAuthorityClubId,
        quitAuthorityLoadedAt:               _state.quitAuthorityLoadedAt,
        quitAuthorityDirtyReason:             _state.quitAuthorityDirtyReason,
        quitMissingContextCount:              _state.quitMissingContextCount,
        quitContextRecoveryCount:             _state.quitContextRecoveryCount,
        quitContextRetryCount:                _state.quitContextRetryCount,
        quitContextLastMissingAt:              _state.quitContextLastMissingAt,
        quitContextLastRecoveredAt:            _state.quitContextLastRecoveredAt,
        // Fallback guard
        fallbackInProgress:                 _state.fallbackInProgress,
        fallbackCompleted:                  _state.fallbackCompleted,
        fallbackCount:                      _state.fallbackCount,
        fullProfilesFallbackCount:          _state.fallbackCount,
        fullProfilesFallbackReason:         _state.fullFallbackReason,
        fallbackMaxPerSession:              _state.maxFallbackPerSession,
        lastFallbackReason:                 _state.fullFallbackReason,
        lastSyncReason:                     _state.lastSyncReason,
        // Coverage guard
        activeCoverageWarnings:             _state.activeCoverageWarnings,
        activeCoverageFallbackTriggered:    _state.hasTriggeredActiveCoverageFallback,
        activeCoverageLastReason:           _state.activeCoverageLastReason,
        suspiciousActiveCountEvents:        _state.suspiciousActiveCountEvents,
        previousActiveCount:                _state.previousActiveCount,
        previousCompatCount:                _state.previousCompatCount,
        // Mode + config
        lastProfilesMode:                   _state.lastProfilesMode,
        activeQueryValues:                  cfg.activeQueryValues,
        quitQueryValues:                    cfg.quitQueryValues,
        statusConfig:                       cfg,
        // Export
        exportEnsureAllProfilesCount:       _state.exportEnsureAllProfilesCount,
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// COVERAGE GUARD (Phase 3.7C)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Kiểm tra xem activeCount có nghi ngờ là thiếu dữ liệu không.
 *
 * Điều kiện suspicious:
 *   A. activeCount === 0 VÀ previousCompatCount > 5
 *      (CLB đã có dữ liệu, active query trả về rỗng bất thường)
 *   B. activeCount < previousCompatCount * 0.3 VÀ previousCompatCount > 10
 *      (Mất > 70% profiles so với compat count trước)
 *   C. previousActiveCount >= 10 VÀ activeCount < previousActiveCount * 0.3
 *      (Drop đột ngột so với snapshot trước)
 *
 * Chỉ trigger fallback TỐI ĐA 1 LẦN mỗi session.
 * Chỉ check 2 snapshot đầu tiên.
 *
 * @param {number} activeCount
 * @private
 */
function _checkActiveProfileCoverage(activeCount) {
    // Coach query is intentionally branch-scoped; full-club baselines/pagination are invalid.
    if (_isCoachContext()) {
        _state.previousActiveCount = activeCount;
        return;
    }
    // Chỉ kiểm tra 2 snapshot đầu
    if (_state.activeSnapshotCount > 2) return;

    // Đã trigger fallback rồi → bỏ qua
    if (_state.hasTriggeredActiveCoverageFallback) return;

    const prevCompat = _state.previousCompatCount;
    const prevActive = _state.previousActiveCount;

    let suspicious = false;
    let reason     = '';

    // Case A: active query rỗng nhưng CLB đã có dữ liệu
    if (activeCount === 0 && prevCompat > 5) {
        suspicious = true;
        reason     = 'active=0,prevCompat=' + prevCompat;
    }

    // Case B: quá ít so với compat count
    if (!suspicious && prevCompat > 10 && activeCount < prevCompat * 0.3) {
        suspicious = true;
        reason     = 'active=' + activeCount + '<30%ofCompat=' + prevCompat;
    }

    // Case C: drop đột ngột so với snapshot trước
    if (!suspicious && prevActive >= 10 && activeCount < prevActive * 0.3) {
        suspicious = true;
        reason     = 'active=' + activeCount + '<30%ofPrev=' + prevActive;
    }

    // Case D: GitHub/runtime pagination đã đọc được danh sách nhưng active query
    // trả về quá ít. Thường xảy ra với data legacy thiếu/khác field status.
    // Pagination đọc collection theo __name__, còn active listener query where(status in ...).
    const pgCount = (window.__store && window.__store.pagination &&
        window.__store.pagination.students &&
        Array.isArray(window.__store.pagination.students.currentItems))
        ? window.__store.pagination.students.currentItems.length : 0;
    if (!suspicious && pgCount >= 10 && activeCount < Math.ceil(pgCount * 0.3)) {
        suspicious = true;
        reason     = 'active=' + activeCount + '<30%ofPaginationPage=' + pgCount;
    }

    if (suspicious) {
        _state.activeCoverageWarnings++;
        _state.suspiciousActiveCountEvents++;
        _state.activeCoverageLastReason = reason;

        console.warn(
            '[ProfilesCoverage] Active query có thể thiếu dữ liệu —',
            { activeCount, prevCompat, prevActive, reason }
        );

        // Trigger fallback 1 lần duy nhất / session
        _state.hasTriggeredActiveCoverageFallback = true;
        loadFullProfilesFallback('coverage-suspicious:' + reason);
    }

    // Cập nhật previousActiveCount cho snapshot tiếp
    _state.previousActiveCount = activeCount;
}

// ─────────────────────────────────────────────────────────────────────────────
// MOUNT ACTIVE PROFILES LISTENER
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Tạo active-only realtime onSnapshot listener.
 * Query: where('status', 'in', getActiveQueryValues())
 *
 * Phase 3.7C:
 *   - Dùng config từ profileStatusConfig.js (không hardcode values)
 *   - Capture previousCompatCount làm baseline cho coverage guard
 *   - Support single-value query ('==') tự động
 *
 * @param {{ db, clubId, profRef, currentClubId, reason }} context
 */
export function mountActiveProfilesListener(context) {
    if (!context || !context.profRef || !context.clubId) {
        console.warn('[ProfilesListener] mountActiveProfilesListener: thiếu context — blocked');
        if (context && context.profRef && _normalizeRole(context.role || window.userRole) !== 'coach') {
            loadFullProfilesFallback('missing-context-partial');
        }
        return false;
    }

    _ctx = _resolveProfilesContext(context);
    _clearQuitContextRetry();
    _state.quitContextRetryCount = 0;
    const { profRef, clubId } = _ctx;
    context = _ctx;
    _state.role = _contextRole(context);
    _state.coachBranch = _coachBranch(context);
    _state.coachCanonicalActiveMap = {};
    _state.coachLegacyActiveMap = {};
    const isCoach = _isCoachContext(context);
    const coachBranch = _coachBranch(context);

    // V5U6G: Admin emergency full-profile fallback and the normal active-module
    // owner are mutually exclusive. The fallback must be removed BEFORE the
    // active listener is created, so there is no overlap window on recovery.
    if (!isCoach) {
        const emergencyFallbackKey = 'global:profiles:' + clubId;
        if (typeof window.hasListener === 'function' && window.hasListener(emergencyFallbackKey)) {
            if (typeof window.removeListener !== 'function') {
                console.error('[ProfilesAuthority] Cannot takeover emergency fallback without listener cleanup API — fail closed');
                if (typeof window.recordRuntimeError === 'function') {
                    window.recordRuntimeError('profiles.fallback-takeover', new Error('listener-cleanup-api-unavailable'), {
                        classification: 'profile-fallback-takeover-blocked', clubId,
                    });
                }
                return false;
            }
            window.removeListener(emergencyFallbackKey, 'profiles-active-module-takeover');
            if (window.hasListener(emergencyFallbackKey)) {
                console.error('[ProfilesAuthority] Emergency fallback cleanup verification failed — active mount blocked');
                if (typeof window.recordRuntimeError === 'function') {
                    window.recordRuntimeError('profiles.fallback-takeover', new Error('fallback-cleanup-verification-failed'), {
                        classification: 'profile-fallback-takeover-blocked', clubId,
                    });
                }
                return false;
            }
            console.info('[ProfilesAuthority] emergency-full-fallback → active-module takeover completed');
        }
    }

    // If Đã nghỉ was opened before the active listener mounted, retry the
    // authority exactly once now that the canonical context exists.
    if (!isCoach && window.getCurrentActiveTabId?.() === 'quit' && !isQuitProfilesComplete()) {
        setTimeout(() => {
            loadQuitProfilesIfNeeded('active-listener-context-ready', context)
                .then(ok => {
                    if (ok === true && typeof window.renderQuitList === 'function') {
                        window.renderQuitList({ reason: 'active-listener-context-ready' });
                    }
                })
                .catch(() => {});
        }, 0);
    }

    if (isCoach && !coachBranch) {
        console.error('[ProfilesListener] Coach missing branch — fail closed, no profiles query');
        setActiveProfiles({}, 'coach-missing-branch');
        setQuitProfiles({}, 'coach-missing-branch');
        _syncLegacy();
        _state.lastProfilesMode = 'coach-missing-branch';
        _updateWindowMetrics();
        return false;
    }
    const key = isCoach
        ? 'students:profiles:active:' + clubId + ':coach:' + coachBranch
        : 'students:profiles:active:' + clubId + ':admin';
    _state.activeListenerKey = key;

    // [Phase 3.7C] Capture baseline compat count TRƯỚC khi mount
    if (window.studentProfileStore && typeof window.studentProfileStore.getAllProfilesCompat === 'function') {
        const compat = window.studentProfileStore.getAllProfilesCompat();
        _state.previousCompatCount = compat ? Object.keys(compat).length : 0;
    } else if (window.__profileScaleMetrics) {
        _state.previousCompatCount = window.__profileScaleMetrics.allProfilesCompatCount || 0;
    }

    // ── Firebase SDK ──────────────────────────────────────────────────────────
    const fb = window._fb_init || {};
    const { query: fbQuery, where: fbWhere, onSnapshot: fbOnSnapshot } = fb;

    if (!fbQuery || !fbWhere || !fbOnSnapshot) {
        console.warn('[ProfilesListener] Firebase SDK chưa sẵn — fallback');
        if (isCoach) loadCoachBranchProfilesFallback('sdk-not-ready');
        else loadFullProfilesFallback('sdk-not-ready');
        return false;
    }

    if (!window.safeRegisterSnapshot) {
        console.warn('[ProfilesListener] safeRegisterSnapshot chưa sẵn — fallback');
        if (isCoach) loadCoachBranchProfilesFallback('no-safeRegisterSnapshot');
        else loadFullProfilesFallback('no-safeRegisterSnapshot');
        return false;
    }

    // [Phase 3.7C] Đọc status values từ config
    const statusValues = getActiveQueryValues();

    window.safeRegisterSnapshot(
        key,
        () => {
            let activeQuery;
            try {
                const statusConstraint = statusValues.length === 1
                    ? fbWhere('status', '==', statusValues[0])
                    : fbWhere('status', 'in', statusValues);
                activeQuery = isCoach
                    ? fbQuery(profRef, statusConstraint, fbWhere('branch', '==', coachBranch))
                    : fbQuery(profRef, statusConstraint);
            } catch (qErr) {
                console.warn('[ProfilesListener] Build query lỗi:', qErr.message, '— fallback');
                setTimeout(() => {
                    if (isCoach) loadCoachBranchProfilesFallback('query-build-error');
                    else loadFullProfilesFallback('query-build-error');
                }, 0);
                return () => {};
            }

            const unsub = fbOnSnapshot(
                activeQuery,
                (snap) => {
                    _state.activeSnapshotCount++;
                    if (typeof window.recordFirestoreSnapshotAttribution === 'function') {
                        window.recordFirestoreSnapshotAttribution('profiles.activeListener', snap, {
                            initial: _state.activeSnapshotCount === 1,
                            reason: isCoach ? 'active-status-branch-query' : 'active-status-query'
                        });
                    }
                    if (window.markListenerSnapshot) window.markListenerSnapshot(key);

                    let activeMap = {};
                    snap.forEach(d => {
                        const id = d.id.trim();
                        if (id) activeMap[id] = d.data();
                    });
                    if (isCoach) {
                        _state.coachCanonicalActiveMap = activeMap;
                        activeMap = _mergedCoachActiveMap();
                    }

                    const activeCount = Object.keys(activeMap).length;

                    // [Phase 3.7C] Coverage guard — trước khi cập nhật store
                    _checkActiveProfileCoverage(activeCount);

                    // Phase 4K-STUDENT-LIST: Active-zero probe —
                    // Nếu snapshot đầu tiên trả 0 nhưng collection có docs,
                    // data cũ có thể thiếu status field → trigger full fallback.
                    // Dùng getDocs(limit(1)) — nhẹ, không đọc full collection.
                    if (activeCount === 0 && _state.activeSnapshotCount === 1) {
                        const _fb4k = window._fb_init || {};
                        const { query: _pQ4k, limit: _pL4k, getDocs: _pG4k } = _fb4k;
                        if (_pG4k && _pQ4k && _pL4k && profRef) {
                            // [GITHUB-FIX Task 4] Await fallback + invalidate sau khi hoàn tất
                            const _probeQuery = isCoach
                                ? _pQ4k(profRef, fbWhere('branch', '==', coachBranch), _pL4k(1))
                                : _pQ4k(profRef, _pL4k(1));
                            _pG4k(_probeQuery).then(async function(_probe) {
                                if (typeof window.recordFirestoreReadAttribution === 'function') {
                                    window.recordFirestoreReadAttribution('profiles.activeZeroProbe', _probe.size || 0, {
                                        initial: true,
                                        reason: 'active-zero-probe'
                                    });
                                }
                                if (!_probe.empty) {
                                    console.warn('[ProfilesListener] active=0 but scoped collection has docs — safe fallback');
                                    const ok = isCoach
                                        ? await loadCoachBranchProfilesFallback('active-zero-but-branch-has-profiles')
                                        : await loadFullProfilesFallback('active-zero-but-profiles-exist');
                                    if (ok) {
                                        _invalidateAll('active-zero-full-fallback-completed');
                                    }
                                } else if (!isCoach && typeof window._moduleDashboard?.reconcileHydrationEvidence === 'function') {
                                    // V5U6G: the existing zero probe is authoritative evidence that the
                                    // profiles source is truly empty. Close the provisional hydration
                                    // state in RAM; no second profile query/reader is introduced.
                                    window._moduleDashboard.reconcileHydrationEvidence({
                                        domain: 'members',
                                        reason: 'active-profiles-zero-probe-empty',
                                        evidence: {
                                            activeCount: 0,
                                            activeAvailable: true,
                                            coverageComplete: true,
                                        },
                                    });
                                }
                            }).catch((error) => {
                                console.warn('[ProfilesListener] active-zero probe failed; hydration remains incomplete:', error?.code || error?.message || error);
                                if (typeof window.recordRuntimeError === 'function') {
                                    window.recordRuntimeError('profiles.active-zero-probe', error, {
                                        classification: 'profile-zero-probe-failed',
                                        clubId,
                                    });
                                }
                            });
                        }
                    }

                    // V5R: a document removed from the active query may have
                    // changed to quit or been deleted. Mark the quit authority dirty so
                    // the next/current Đã nghỉ view performs one full reconciliation.
                    if (!isCoach && _state.activeSnapshotCount > 1 && typeof snap.docChanges === 'function') {
                        const removedChanges = snap.docChanges().filter(change => change && change.type === 'removed');
                        if (removedChanges.length > 0) {
                            _state.quitCompletenessReconciled = false;
                            _state.quitAuthorityState = 'dirty';
                            _state.quitAuthorityDirtyReason = 'active-query-removed:' + removedChanges.length;
                            markQuitComplete(false);
                            if (window.getCurrentActiveTabId?.() === 'quit') {
                                Promise.resolve().then(() => ensureQuitProfilesComplete('active-query-removed-current-quit')).catch(() => {});
                            }
                        }
                    }

                    setActiveProfiles(activeMap, 'active-profiles-snapshot');
                    _syncLegacy();
                    // V5U6C2: snapshot #1 is hydration evidence, never an automatic
                    // mutation. Later snapshots mark dirty only when Firestore reports
                    // a real added/modified/removed document change. Coach remains
                    // Attendance-only and never participates in Dashboard freshness.
                    if (!isCoach && _state.activeSnapshotCount === 1 && typeof window._moduleDashboard?.reconcileHydrationEvidence === 'function') {
                        window._moduleDashboard.reconcileHydrationEvidence({
                            domain: 'members',
                            reason: 'active-profiles-initial-hydration',
                            evidence: {
                                activeCount,
                                activeAvailable: true,
                                coverageComplete: activeCount > 0,
                            },
                        });
                    } else if (!isCoach && _state.activeSnapshotCount > 1 && typeof snap.docChanges === 'function') {
                        const dashboardProfileChanges = snap.docChanges().filter(change =>
                            change && (change.type === 'added' || change.type === 'modified' || change.type === 'removed')
                        );
                        if (dashboardProfileChanges.length > 0 && typeof window._moduleDashboard?.markStatsDirty === 'function') {
                            window._moduleDashboard.markStatsDirty('', 'profiles-live-mutation', 'members');
                        }
                    }

                    _state.activeListenerMounted = true;
                    _state.lastProfilesMode      = 'active-split';

                    _invalidateAll('active-profiles-snapshot');
                    _updateWindowMetrics();
                    // Phase 4K-6V3D: verify debt coverage in idle time. The scheduler
                    // reuses this snapshot and only runs count aggregation when needed.
                    if (!isCoach && typeof window.scheduleAutomaticDebtProfileCoverage === 'function') {
                        window.scheduleAutomaticDebtProfileCoverage('active-profiles-snapshot');
                    }
                },
                (err) => {
                    _state.activeQueryErrorCount++;
                    console.warn(
                        '[ProfilesListener] Active query lỗi:', err.code || err.message,
                        '— fallback'
                    );
                    if (isCoach) loadCoachBranchProfilesFallback('active-query-error:' + (err.code || 'unknown'));
                    else loadFullProfilesFallback('active-query-error:' + (err.code || 'unknown'));
                }
            );

            return unsub;
        },
        {
            owner:  'students',
            scope:  'global',
            tabId:  null,
            reason: context.reason || 'active-profiles-mount-3.7C',
        }
    );

    // Phase 4K-6V4B: CS1 also reads the legacy primary-branch value `Mặc định`.
    // A separate listener avoids combining two Firestore `in` filters
    // (`status in [...]` + `branch in [...]`), which is not portable across SDK/index versions.
    if (isCoach && coachBranch === 'CS1') {
        const legacyKey = key + ':legacy-primary';
        _state.coachLegacyListenerKey = legacyKey;
        window.safeRegisterSnapshot(
            legacyKey,
            () => {
                const statusConstraint = statusValues.length === 1
                    ? fbWhere('status', '==', statusValues[0])
                    : fbWhere('status', 'in', statusValues);
                const legacyQuery = fbQuery(profRef, statusConstraint, fbWhere('branch', '==', 'Mặc định'));
                return fbOnSnapshot(
                    legacyQuery,
                    (snap) => {
                        if (typeof window.recordFirestoreSnapshotAttribution === 'function') {
                            window.recordFirestoreSnapshotAttribution('profiles.activeLegacyPrimaryListener', snap, {
                                initial: true,
                                reason: 'legacy-primary-branch-compat'
                            });
                        }
                        if (window.markListenerSnapshot) window.markListenerSnapshot(legacyKey);
                        const legacyMap = {};
                        snap.forEach(d => {
                            const id = d.id.trim();
                            if (id) legacyMap[id] = d.data();
                        });
                        _state.coachLegacyActiveMap = legacyMap;
                        const merged = _mergedCoachActiveMap();
                        setActiveProfiles(merged, 'coach-active-legacy-primary-snapshot');
                        _syncLegacy();
                        _state.activeListenerMounted = true;
                        _state.lastProfilesMode = 'coach-active-canonical-plus-legacy';
                        _invalidateAll('coach-active-legacy-primary-snapshot');
                        _updateWindowMetrics();
                    },
                    (err) => {
                        _state.activeQueryErrorCount++;
                        console.warn('[ProfilesListener] Legacy primary branch query failed:', err.code || err.message);
                    }
                );
            },
            {
                owner: 'students',
                scope: 'global',
                tabId: null,
                reason: 'coach-legacy-primary-branch-compat-4K-6V4B',
            }
        );
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// CLEANUP ACTIVE LISTENER
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Xóa active profiles listener.
 * @param {string} [reason]
 */
export function cleanupActiveProfilesListener(reason) {
    if (_state.activeListenerKey && window.removeListener) {
        window.removeListener(_state.activeListenerKey, reason || 'cleanup-active-profiles');
    }
    if (_state.coachLegacyListenerKey && window.removeListener) {
        window.removeListener(_state.coachLegacyListenerKey, reason || 'cleanup-coach-legacy-primary-profiles');
    }
    _state.activeListenerMounted = false;
    _state.activeListenerKey     = null;
    _state.coachLegacyListenerKey = null;
    _state.coachCanonicalActiveMap = {};
    _state.coachLegacyActiveMap = {};
}

// ─────────────────────────────────────────────────────────────────────────────
// LAZY LOAD QUIT PROFILES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Load quit profiles một lần khi cần (getDocs, không realtime).
 *
 * Phase 3.7C:
 *   - quitLoadingInProgress guard — tránh parallel load
 *   - Sau thành công → sync + invalidate quit list
 *   - Lỗi → full fallback (với fallback loop guard)
 *
 * @param {string} [reason]
 * @param {{ profRef?, db?, clubId? }} [contextOverride]
 * @returns {Promise<void>}
 */
export async function loadQuitProfilesIfNeeded(reason, contextOverride, options = {}) {
    const ctx = _resolveProfilesContext(contextOverride);
    if (_hasQuitContext(ctx) && (!_ctx || !_hasQuitContext(_ctx))) {
        _ctx = ctx;
        _state.quitContextRecoveryCount++;
        _state.quitContextLastRecoveredAt = Date.now();
        _state.quitContextRetryCount = 0;
        _clearQuitContextRetry();
    }
    if (_isCoachContext(ctx)) {
        window.RoleReadBoundary?.canMount?.('profiles.quit', { reason: reason || 'quit-authority' });
        return false;
    }

    const clubId = String((ctx && ctx.clubId) || window.__store?.clubId || '').trim();
    const now = Date.now();
    const ageMs = _state.quitAuthorityLoadedAt ? now - _state.quitAuthorityLoadedAt : Number.POSITIVE_INFINITY;
    const tabRefreshReason = /switch-tab|ensure-quit-tab|tab-open|current-quit/.test(String(reason || ''));
    const forceRefresh = options.force === true || (tabRefreshReason && ageMs > 60000);
    const sameClub = !!clubId && _state.quitAuthorityClubId === clubId;

    // V5R: "loaded" is not enough. Short-circuit only for the same club,
    // a clean complete snapshot, and a fresh tab-open authority window.
    if (!forceRefresh && sameClub && _state.quitCompletenessReconciled && isQuitComplete()) return true;
    if (_quitAuthorityPromise) return _quitAuthorityPromise;

    if (!_hasQuitContext(ctx)) {
        _state.quitMissingContextCount++;
        _state.quitContextLastMissingAt = Date.now();
        _state.quitAuthorityState = 'waiting-context';
        _state.quitAuthorityError = 'missing-context';
        _state.quitLoadLastReason = reason || '';
        _updateWindowMetrics();
        _armQuitContextRetry(reason || 'quit-authority');
        if (_quitDebugEnabled()) {
            console.debug('[ProfilesListener] Quit authority waiting for runtime context', {
                reason: reason || '',
                hasClubId: !!clubId,
                hasProfRef: !!ctx?.profRef,
                retryCount: _state.quitContextRetryCount,
            });
        }
        return false;
    }
    const fb = window._fb_init || {};
    const fbGetDocs = fb.getDocs;
    if (!fbGetDocs) {
        console.warn('[ProfilesListener] Quit authority getDocs unavailable');
        return false;
    }

    if (_state.quitAuthorityClubId && _state.quitAuthorityClubId !== clubId) {
        setQuitProfiles({}, 'quit-authority-club-switch', { complete: false });
        markQuitLoaded(false);
        markQuitComplete(false);
        _state.quitCompletenessReconciled = false;
    }

    _state.quitLoadingInProgress = true;
    _state.quitAuthorityState = 'loading';
    _state.quitLoadLastReason = reason || '';
    _state.quitAuthorityError = '';
    markQuitComplete(false);

    _quitAuthorityPromise = (async () => {
        try {
            // Single authoritative flow: one full collection snapshot, once/session,
            // then local classification. This replaces the old fan-out of many
            // status/boolean/date queries that could each miss a legacy schema.
            const snap = await fbGetDocs(ctx.profRef);
            const fullMap = {};
            snap.forEach(d => {
                const id = String(d.id || '').trim();
                if (id) fullMap[id] = d.data();
            });

            // Full snapshot is the only input allowed to replace all profile buckets.
            syncLegacyAllProfiles(fullMap, 'quit-authoritative:' + (reason || 'tab-open'), { complete: true });
            const quitMap = {};
            Object.entries(fullMap).forEach(([id, data]) => {
                if (classifyProfileStatus(data) === 'quit') quitMap[id] = data;
            });
            setQuitProfiles(quitMap, 'quit-authoritative:' + (reason || 'tab-open'), { complete: true });
            markQuitLoaded(true);
            markQuitComplete(true);

            _state.quitLoaded = true;
            _state.quitCompletenessReconciled = true;
            _state.quitLoadingInProgress = false;
            _state.quitAuthorityState = 'complete';
            _state.quitAuthorityClubId = clubId;
            _state.quitAuthorityLoadedAt = Date.now();
            _state.quitAuthorityDirtyReason = '';
            _state.quitAuthorityDocsRead = snap.size || 0;
            _state.quitLoadCount++;
            _state.lastProfilesMode = 'active-split+quit-authoritative';

            if (typeof window.recordFirestoreReadAttribution === 'function') {
                window.recordFirestoreReadAttribution('profiles.quitAuthoritativeQuery', snap.size || 0, {
                    initial: true,
                    reason: reason || 'quit-authoritative',
                    queryCount: 1,
                    quitCount: Object.keys(quitMap).length,
                });
            }

            _syncLegacy();
            if (window.__store) {
                window.__store._dataVersion = (window.__store._dataVersion || 0) + 1;
                window.__store._quitAuthorityVersion = (window.__store._quitAuthorityVersion || 0) + 1;
                window.__store._lastProfileHydrateReason = 'quit-authoritative';
                // Shared pagination belongs to Active/Search and must not become
                // the source for Đã nghỉ after authority is ready.
                const pg = window.__store.pagination && window.__store.pagination.students;
                if (pg && window.getCurrentActiveTabId?.() === 'quit') {
                    pg.searchActive = false;
                    pg.searchQuery = '';
                    pg.currentItems = [];
                    pg.totalLoaded = 0;
                    pg.hasNext = false;
                    pg.hasPrevious = false;
                }
            }
            if (typeof window.invalidateSearchCacheForCurrentTab === 'function') {
                window.invalidateSearchCacheForCurrentTab('quit-authoritative-loaded');
            }
            if (typeof window.refreshListComputation === 'function') {
                window.refreshListComputation('students.quitList', 'quit-authoritative-loaded');
            }
            if (typeof window.invalidateList === 'function') {
                window.invalidateList('students.quitList', 'quit-authoritative-loaded');
            } else if (typeof window.invalidateStudents === 'function') {
                window.invalidateStudents('quit-authoritative-loaded');
            }
            _updateWindowMetrics();
            return true;
        } catch (err) {
            _state.quitLoadingInProgress = false;
            _state.quitAuthorityState = 'error';
            _state.quitAuthorityError = err?.code || err?.message || String(err);
            _state.quitAuthorityDirtyReason = 'authority-error';
            _state.quitQueryErrorCount++;
            markQuitComplete(false);
            console.error('[ProfilesListener] Quit authoritative full snapshot failed:', _state.quitAuthorityError);
            _updateWindowMetrics();
            return false;
        } finally {
            _quitAuthorityPromise = null;
        }
    })();

    return _quitAuthorityPromise;
}

export async function ensureQuitProfilesComplete(reason, options = {}) {
    return loadQuitProfilesIfNeeded(reason || 'ensure-quit-complete', null, options);
}

export function isQuitProfilesComplete() {
    const currentClubId = String((_ctx && _ctx.clubId) || window.__store?.clubId || '').trim();
    return !!currentClubId &&
        _state.quitAuthorityClubId === currentClubId &&
        _state.quitCompletenessReconciled === true &&
        _state.quitAuthorityState === 'complete' &&
        isQuitComplete() === true;
}

// ─────────────────────────────────────────────────────────────────────────────
// CLEANUP QUIT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Reset quit state.
 * Chuẩn bị sẵn cho Phase 3.8 nếu chuyển sang realtime quit.
 * @param {string} [reason]
 */
export function cleanupQuitProfilesListener(reason) {
    if (_state.quitListenerKey && window.removeListener) {
        window.removeListener(_state.quitListenerKey, reason || 'cleanup-quit-profiles');
    }
    _state.quitListenerKey       = null;
    _state.quitLoaded            = false;
    _state.quitLoadingInProgress = false;
    _state.quitCompletenessReconciled = false;
    _state.quitAuthorityState = 'none';
    _state.quitAuthorityDocsRead = 0;
    _state.quitAuthorityError = '';
    _state.quitAuthorityClubId = '';
    _state.quitAuthorityLoadedAt = 0;
    _state.quitAuthorityDirtyReason = '';
    _quitAuthorityPromise = null;
    markQuitComplete(false);
}

// ─────────────────────────────────────────────────────────────────────────────
// COACH BRANCH-SAFE FALLBACK — never reads the full club collection
// ─────────────────────────────────────────────────────────────────────────────

export async function loadCoachBranchProfilesFallback(reason) {
    const ctx = _ctx;
    const branch = _coachBranch(ctx);
    if (!_isCoachContext(ctx) || !ctx || !ctx.profRef || !branch) {
        console.warn('[ProfilesFallback] Coach branch fallback blocked — missing safe context:', reason);
        return false;
    }
    if (_state.fallbackInProgress || _state.fallbackCount >= _state.maxFallbackPerSession) return false;

    const fb = window._fb_init || {};
    const { query: fbQuery, where: fbWhere, getDocs: fbGetDocs } = fb;
    if (!fbQuery || !fbWhere || !fbGetDocs) return false;

    _state.fallbackInProgress = true;
    try {
        const aliases = _coachBranchAliases(ctx);
        const snapshots = await Promise.all(aliases.map(alias =>
            fbGetDocs(fbQuery(ctx.profRef, fbWhere('branch', '==', alias)))
        ));
        const docsRead = snapshots.reduce((sum, snap) => sum + (snap.size || 0), 0);
        if (typeof window.recordFirestoreReadAttribution === 'function') {
            window.recordFirestoreReadAttribution('profiles.coachBranchFallbackQuery', docsRead, {
                initial: true,
                reason: reason || 'coach-branch-fallback',
                branch,
                aliases
            });
        }
        const activeMap = {};
        snapshots.forEach(snap => snap.forEach(d => {
            const id = d.id.trim();
            if (!id) return;
            const data = d.data();
            if (classifyProfileStatus(data) !== 'quit') activeMap[id] = data;
        }));
        setActiveProfiles(activeMap, 'coach-branch-fallback:' + reason);
        setQuitProfiles({}, 'coach-branch-fallback:no-quit-data');
        _syncLegacy();
        _state.fallbackCompleted = true;
        _state.fallbackCount++;
        _state.coachBranchFallbackCount++;
        _state.fullFallbackReason = 'coach-branch-only:' + reason;
        _state.lastProfilesMode = 'coach-branch-fallback';
        _state.activeListenerMounted = true;
        markActiveLoaded(true);
        _invalidateAll('coach-branch-fallback');
        _updateWindowMetrics();
        return true;
    } catch (err) {
        _state.fallbackCount++;
        _state.fullFallbackReason = 'coach-branch-error:' + reason;
        console.error('[ProfilesFallback] Coach branch load failed:', err.code || err.message);
        _updateWindowMetrics();
        return false;
    } finally {
        _state.fallbackInProgress = false;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// FULL PROFILES FALLBACK — với loop guard (Phase 3.7C)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Load toàn bộ profiles một lần (getDocs, không realtime).
 *
 * Phase 3.7C — Loop Guard:
 *   - fallbackInProgress:  chặn concurrent calls
 *   - fallbackCount >= maxFallbackPerSession: dừng tuyệt đối (default max=3)
 *   - Sau thành công: fallbackCompleted=true, quitLoaded=true
 *
 * @param {string} reason
 * @returns {Promise<boolean>}
 */
export async function loadFullProfilesFallback(reason) {
    if (_isCoachContext()) {
        window.RoleReadBoundary?.canMount?.('profiles.full-fallback', { reason: reason || 'full-fallback' });
        return loadCoachBranchProfilesFallback('redirected-from-full:' + (reason || 'unknown'));
    }
    // ── [Phase 3.7C] Loop guard ────────────────────────────────────────────
    if (_state.fallbackInProgress) {
        console.debug('[ProfilesFallback] Đang chạy — skip:', reason);
        return false;
    }

    if (_state.fallbackCount >= _state.maxFallbackPerSession) {
        console.warn(
            '[ProfilesFallback] Đạt maxFallbackPerSession (' + _state.maxFallbackPerSession + ') — stop. Reason:', reason
        );
        return false;
    }

    const ctx = _ctx;
    if (!ctx || !ctx.profRef) {
        console.warn('[ProfilesFallback] Thiếu context — skip. Reason:', reason);
        return false;
    }

    const fb = window._fb_init || {};
    const { getDocs: fbGetDocs } = fb;
    if (!fbGetDocs) {
        console.error('[ProfilesFallback] getDocs không sẵn');
        return false;
    }

    console.warn('[ProfilesFallback] Loading full profiles —', reason);
    _state.fallbackInProgress = true;

    try {
        const snap    = await fbGetDocs(ctx.profRef);
        if (typeof window.recordFirestoreReadAttribution === 'function') {
            window.recordFirestoreReadAttribution('profiles.fullFallbackQuery', snap.size || 0, {
                initial: true,
                reason: reason || 'full-fallback'
            });
        }
        const fullMap = {};
        snap.forEach(d => {
            const id = d.id.trim();
            if (id) fullMap[id] = d.data();
        });

        // Phase 4K-STUDENT-LIST: Phân loại active/quit dùng classifyProfileStatus() mới
        // để data cũ thiếu status (→ 'active') vào activeProfiles đúng cách
        // Sau classifier: setActiveProfiles + setQuitProfiles riêng biệt trước syncLegacy
        const _fallbackActive = {};
        const _fallbackQuit   = {};
        Object.entries(fullMap).forEach(([_fId, _fData]) => {
            const _fKind = classifyProfileStatus(_fData);
            if (_fKind === 'quit') _fallbackQuit[_fId] = _fData;
            else _fallbackActive[_fId] = _fData;
        });
        setActiveProfiles(_fallbackActive, 'full-fallback-active:' + reason);
        setQuitProfiles(_fallbackQuit, 'full-fallback-quit-classified:' + reason, { complete: true });

        if (window.syncProfilesToStudentStore) {
            window.syncProfilesToStudentStore(fullMap, 'full-fallback:' + reason);
        } else {
            syncLegacyAllProfiles(fullMap, 'full-fallback:' + reason);
        }

        _syncLegacy();

        _state.fallbackInProgress    = false;
        _state.fallbackCompleted     = true;
        _state.fallbackCount++;
        _state.fullFallbackReason    = reason;
        _state.lastProfilesMode      = 'full-fallback';
        _state.quitLoaded            = true;
        _state.quitLoadingInProgress = false;
        _state.activeListenerMounted = true;
        // [Phase 3.7C+A] Explicit store state sync — safety layer on top of syncLegacyAllProfiles
        markActiveLoaded(true);
        markQuitLoaded(true);
        markQuitComplete(true);
        _state.quitCompletenessReconciled = true;
        _state.quitAuthorityState = 'complete';
        _state.quitAuthorityClubId = String(ctx.clubId || window.__store?.clubId || '').trim();
        _state.quitAuthorityLoadedAt = Date.now();
        _state.quitAuthorityDirtyReason = '';
        _state.quitAuthorityDocsRead = snap.size || 0;

        // V5U6C2: if the initial status query needed its existing full fallback,
        // replace the provisional zero/incomplete hydration evidence with the
        // complete classified active set. This remains RAM-only for Dashboard.
        if (
            !_isCoachContext() &&
            _state.activeSnapshotCount <= 1 &&
            /active-zero|active-query-error/.test(String(reason || '')) &&
            typeof window._moduleDashboard?.reconcileHydrationEvidence === 'function'
        ) {
            window._moduleDashboard.reconcileHydrationEvidence({
                domain: 'members',
                reason: 'active-profiles-initial-fallback-hydration',
                evidence: {
                    activeCount: Object.keys(_fallbackActive).length,
                    activeAvailable: true,
                    coverageComplete: true,
                },
            });
        }

        // [GITHUB-FIX Task 4] Bump _dataVersion + refreshListsComputation sau fallback
        if (window.__store) {
            window.__store._dataVersion = (window.__store._dataVersion || 0) + 1;
            window.__store._lastProfileHydrateReason = reason || 'full-profiles-fallback';
        }

        // Phase 4K-2B: Tab-aware invalidation — chỉ refresh đúng tab đang mở, không flush toàn hệ thống.
        // Chỉ dùng _invalidateAll() khi reason chứa 'initial-login' hoặc không xác định được tab.
        {
            const _tab = typeof window.getCurrentActiveTabId === 'function'
                ? window.getCurrentActiveTabId()
                : '';

            let _keys = [];
            if (_tab === 'active')         _keys = ['students.activeList'];
            else if (_tab === 'debt')      _keys = ['students.debtList'];
            else if (_tab === 'quit')      _keys = ['students.quitList'];
            else if (_tab === 'tx')        _keys = ['tx.txList'];
            else if (_tab === 'inventory') _keys = ['inventory.inventoryList', 'inventory.uniformTxList'];
            else if (_tab === 'dashboard') _keys = ['dashboard.summary'];
            else                           _keys = ['students.activeList', 'students.debtList', 'students.quitList'];

            if (typeof window.refreshListsComputation === 'function') {
                window.refreshListsComputation(_keys, 'full-profiles-fallback-tab-aware');
            }

            if (typeof window.invalidateList === 'function') {
                _keys.forEach(k => window.invalidateList(k, 'full-profiles-fallback-tab-aware'));
            } else if (typeof window.invalidateCurrentTab === 'function') {
                window.invalidateCurrentTab('full-profiles-fallback-tab-aware');
            } else {
                // Last-resort: only if we cannot determine tab, flush all
                _invalidateAll('full-profiles-fallback');
            }
        }

        // Phase 4K-2: Chỉ invalidate search cache của tab hiện tại — không clear toàn bộ.
        if (typeof window.invalidateSearchCacheForCurrentTab === 'function') {
            window.invalidateSearchCacheForCurrentTab('full-profiles-fallback');
        } else if (typeof window.clearSearchRuntimeCache === 'function') {
            window.clearSearchRuntimeCache('full-profiles-fallback');
        }

        _updateWindowMetrics();
        return true;

    } catch (err) {
        _state.fallbackInProgress = false;
        _state.fallbackCount++;
        _state.fullFallbackReason = reason + ':error';
        console.error('[ProfilesFallback] Full load thất bại:', err.message || err.code);
        _updateWindowMetrics();
        return false;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// ENSURE ALL PROFILES FOR EXPORT (Phase 3.7C)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Đảm bảo toàn bộ profiles (active + quit) đã loaded trước khi export/report.
 *
 * Flow:
 *   1. Nếu quitLoaded → return true (đủ data)
 *   2. Thử loadQuitProfilesIfNeeded()
 *   3. Nếu vẫn thiếu → loadFullProfilesFallback()
 *   4. Return boolean — có data hay không
 *
 * KHÔNG đổi format export. KHÔNG đổi business logic. KHÔNG DOM.
 *
 * @param {string} [reason]
 * @returns {Promise<boolean>}
 */
export async function ensureAllProfilesForExport(reason) {
    if (_isCoachContext()) {
        window.RoleReadBoundary?.canMount?.('profiles.export-all', { reason: reason || 'export' });
        return false;
    }
    _state.exportEnsureAllProfilesCount++;
    const tag = reason || 'export';

    if (isQuitProfilesComplete()) return true;

    // V5Q: ensure a single authoritative full snapshot for export/report.
    try {
        await ensureQuitProfilesComplete(tag + ':quit');
    } catch (_e) {
        // tiếp tục xuống full fallback
    }

    if (isQuitProfilesComplete()) return true;

    // Fallback full nếu authoritative quit load thất bại
    const ok = await loadFullProfilesFallback(tag + ':full');
    _updateWindowMetrics();
    return ok || isQuitProfilesComplete();
}

// ─────────────────────────────────────────────────────────────────────────────
// isQuitProfilesLoaded
// ─────────────────────────────────────────────────────────────────────────────

/** @returns {boolean} */
export function isQuitProfilesLoaded() {
    return _state.quitLoaded;
}

// ─────────────────────────────────────────────────────────────────────────────
// RESET ALL (Phase 3.7C — reset _state fields mới)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Reset toàn bộ state. Gọi khi logout / club-switch.
 * @param {string} [reason]
 */
export function resetProfilesListeners(reason) {
    cleanupActiveProfilesListener(reason || 'reset');
    cleanupQuitProfilesListener(reason   || 'reset');

    // Listener
    _state.activeListenerMounted   = false;
    _state.activeSnapshotCount     = 0;
    _state.activeQueryErrorCount   = 0;
    _state.role                    = '';
    _state.coachBranch             = '';
    _state.coachBranchFallbackCount = 0;
    _state.coachLegacyListenerKey = null;
    _state.coachCanonicalActiveMap = {};
    _state.coachLegacyActiveMap = {};

    // Quit
    _state.quitLoaded              = false;
    _state.quitLoadCount           = 0;
    _state.quitQueryErrorCount     = 0;
    _state.quitLoadLastReason      = '';
    _state.quitLoadingInProgress   = false;
    _state.quitCompletenessReconciled = false;
    _state.quitAuthorityState      = 'none';
    _state.quitAuthorityDocsRead   = 0;
    _state.quitAuthorityError      = '';
    _state.quitAuthorityClubId     = '';
    _state.quitAuthorityLoadedAt   = 0;
    _state.quitAuthorityDirtyReason = '';
    _state.quitMissingContextCount = 0;
    _state.quitContextRecoveryCount = 0;
    _state.quitContextRetryCount = 0;
    _state.quitContextLastMissingAt = 0;
    _state.quitContextLastRecoveredAt = 0;
    _quitAuthorityPromise          = null;
    _clearQuitContextRetry();
    markQuitComplete(false);

    // Fallback guard
    _state.fallbackInProgress      = false;
    _state.fallbackCompleted       = false;
    _state.fallbackCount           = 0;
    _state.fullFallbackReason      = '';

    // Coverage guard
    _state.hasTriggeredActiveCoverageFallback = false;
    _state.activeCoverageWarnings  = 0;
    _state.suspiciousActiveCountEvents = 0;
    _state.activeCoverageLastReason = '';
    _state.previousCompatCount     = 0;
    _state.previousActiveCount     = -1;

    // Mode + export
    _state.lastProfilesMode        = 'none';
    _state.exportEnsureAllProfilesCount = 0;

    _ctx = null;
    _updateWindowMetrics();
    console.debug('[ProfilesListener] reset —', reason || 'no reason');
}

// ─────────────────────────────────────────────────────────────────────────────
// METRICS GETTER (Phase 3.7C — đầy đủ)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Metrics đầy đủ — merge store metrics + listener state + coverage guard.
 * @returns {object}
 */
export function getProfilesListenerMetrics() {
    const storeM = (typeof window.getProfileScaleMetrics === 'function')
        ? window.getProfileScaleMetrics()
        : getProfileScaleMetrics();
    const cfg = getProfileStatusConfig();

    return {
        // Listener
        activeListenerMounted:              _state.activeListenerMounted,
        activeSnapshotCount:                _state.activeSnapshotCount,
        activeQueryErrorCount:              _state.activeQueryErrorCount,
        role:                               _state.role,
        coachBranch:                        _state.coachBranch,
        coachBranchFallbackCount:           _state.coachBranchFallbackCount,
        // Quit
        quitLoaded:                         _state.quitLoaded,
        quitLoadCount:                      _state.quitLoadCount,
        quitQueryErrorCount:                _state.quitQueryErrorCount,
        quitLoadInProgress:                 _state.quitLoadingInProgress,
        quitLoadLastReason:                 _state.quitLoadLastReason,
        quitCompletenessReconciled:          _state.quitCompletenessReconciled,
        quitAuthorityState:                  _state.quitAuthorityState,
        quitAuthorityDocsRead:               _state.quitAuthorityDocsRead,
        quitAuthorityError:                  _state.quitAuthorityError,
        quitAuthorityClubId:                 _state.quitAuthorityClubId,
        quitAuthorityLoadedAt:               _state.quitAuthorityLoadedAt,
        quitAuthorityDirtyReason:             _state.quitAuthorityDirtyReason,
        quitMissingContextCount:              _state.quitMissingContextCount,
        quitContextRecoveryCount:             _state.quitContextRecoveryCount,
        quitContextRetryCount:                _state.quitContextRetryCount,
        quitContextLastMissingAt:              _state.quitContextLastMissingAt,
        quitContextLastRecoveredAt:            _state.quitContextLastRecoveredAt,
        // Fallback guard
        fallbackInProgress:                 _state.fallbackInProgress,
        fallbackCompleted:                  _state.fallbackCompleted,
        fallbackCount:                      _state.fallbackCount,
        fullProfilesFallbackCount:          _state.fallbackCount,
        fullProfilesFallbackReason:         _state.fullFallbackReason,
        fallbackMaxPerSession:              _state.maxFallbackPerSession,
        // Coverage guard
        activeCoverageWarnings:             _state.activeCoverageWarnings,
        activeCoverageFallbackTriggered:    _state.hasTriggeredActiveCoverageFallback,
        activeCoverageLastReason:           _state.activeCoverageLastReason,
        suspiciousActiveCountEvents:        _state.suspiciousActiveCountEvents,
        previousActiveCount:                _state.previousActiveCount,
        previousCompatCount:                _state.previousCompatCount,
        // Mode + config
        lastProfilesMode:                   _state.lastProfilesMode,
        activeQueryValues:                  cfg.activeQueryValues,
        quitQueryValues:                    cfg.quitQueryValues,
        statusConfig:                       cfg,
        // Export
        exportEnsureAllProfilesCount:       _state.exportEnsureAllProfilesCount,
        // Store metrics
        ...storeM,
    };
}
