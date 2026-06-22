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

    // ── Quit load ─────────────────────────────────────────────────────────────
    quitLoaded:             false,
    quitLoadCount:          0,
    quitQueryErrorCount:    0,
    quitLoadLastReason:     '',
    /** Guard: prevent parallel quit load calls */
    quitLoadingInProgress:  false,

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
    return String((context && context.coachBranch) || _state.coachBranch || window.coachBranch || window.__store?.coachBranch || '').trim();
}

function _coachAllBranches(context = _ctx) {
    const value = _coachBranch(context);
    if (window.CoachBranchResolver && typeof window.CoachBranchResolver.isAll === 'function') {
        return window.CoachBranchResolver.isAll(value, window.__store?.clubConfig || window.clubConfig || {});
    }
    return String(value || '').toLowerCase() === 'all';
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
        if (typeof window.renderAttendanceList === 'function') {
            Promise.resolve().then(() => window.renderAttendanceList()).catch(() => {});
        }
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

    _ctx = context;
    const { profRef, clubId } = context;
    _state.role = _contextRole(context);
    _state.coachBranch = _coachBranch(context);
    const isCoach = _isCoachContext(context);
    const coachBranch = _coachBranch(context);
    const coachAllBranches = isCoach && _coachAllBranches(context);
    if (isCoach && !coachBranch) {
        console.error('[ProfilesListener] Coach missing branch — fail closed, no profiles query');
        setActiveProfiles({}, 'coach-missing-branch');
        setQuitProfiles({}, 'coach-missing-branch');
        _syncLegacy();
        _state.lastProfilesMode = 'coach-missing-branch';
        _updateWindowMetrics();
        if (typeof window.showCoachBranchAssignmentError === 'function') {
            window.showCoachBranchAssignmentError();
        }
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
            let queryEntries = [];
            try {
                const makeStatusConstraint = () => statusValues.length === 1
                    ? fbWhere('status', '==', statusValues[0])
                    : fbWhere('status', 'in', statusValues);
                if (isCoach && !coachAllBranches) {
                    const config = window.__store?.clubConfig || window.clubConfig || {};
                    const aliases = window.CoachBranchResolver?.queryValues?.(coachBranch, config) || [coachBranch];
                    queryEntries = aliases.slice(0, 10).map(alias => ({
                        id: 'branch:' + alias,
                        alias,
                        query: fbQuery(profRef, makeStatusConstraint(), fbWhere('branch', '==', alias)),
                    }));
                } else {
                    queryEntries = [{
                        id: coachAllBranches ? 'all-branches' : 'admin',
                        alias: coachAllBranches ? 'all' : '',
                        query: fbQuery(profRef, makeStatusConstraint()),
                    }];
                }
            } catch (qErr) {
                console.warn('[ProfilesListener] Build query lỗi:', qErr.message, '— fallback');
                setTimeout(() => {
                    if (isCoach) loadCoachBranchProfilesFallback('query-build-error');
                    else loadFullProfilesFallback('query-build-error');
                }, 0);
                return () => {};
            }

            const mapsByQuery = new Map();
            const initialReady = new Set();
            let initialCombinedApplied = false;
            const unsubscribers = [];

            const applyCombinedSnapshot = (entry, snap) => {
                _state.activeSnapshotCount++;
                if (typeof window.recordFirestoreSnapshotAttribution === 'function') {
                    window.recordFirestoreSnapshotAttribution('profiles.activeListener', snap, {
                        initial: !initialReady.has(entry.id),
                        reason: isCoach
                            ? (coachAllBranches ? 'active-status-all-branches-query' : 'active-status-branch-alias-query')
                            : 'active-status-query',
                        branchAlias: entry.alias || undefined,
                    });
                }
                if (window.markListenerSnapshot) window.markListenerSnapshot(key);

                const mapForQuery = {};
                snap.forEach(d => {
                    const id = d.id.trim();
                    if (id) mapForQuery[id] = d.data();
                });
                mapsByQuery.set(entry.id, mapForQuery);
                initialReady.add(entry.id);

                // Wait for every branch alias initial snapshot to avoid briefly showing
                // a partial student list on legacy mixed-value clubs.
                if (initialReady.size < queryEntries.length) return;

                const activeMap = {};
                mapsByQuery.forEach(map => Object.assign(activeMap, map));
                const activeCount = Object.keys(activeMap).length;

                if (!initialCombinedApplied) {
                    _checkActiveProfileCoverage(activeCount);
                    if (activeCount === 0) {
                        if (isCoach && !coachAllBranches) {
                            Promise.resolve(loadCoachBranchProfilesFallback('active-zero-check-branch-aliases')).then(function(ok) {
                                if (ok) _invalidateAll('active-zero-coach-alias-fallback-completed');
                            }).catch(() => {});
                        } else {
                            const _fb4k = window._fb_init || {};
                            const { query: _pQ4k, limit: _pL4k, getDocs: _pG4k } = _fb4k;
                            if (_pG4k && _pQ4k && _pL4k && profRef) {
                                const _probeQuery = _pQ4k(profRef, _pL4k(1));
                                _pG4k(_probeQuery).then(async function(_probe) {
                                    if (typeof window.recordFirestoreReadAttribution === 'function') {
                                        window.recordFirestoreReadAttribution('profiles.activeZeroProbe', _probe.size || 0, {
                                            initial: true,
                                            reason: 'active-zero-probe'
                                        });
                                    }
                                    if (!_probe.empty) {
                                        const ok = isCoach
                                            ? await loadCoachBranchProfilesFallback('active-zero-all-branches')
                                            : await loadFullProfilesFallback('active-zero-but-profiles-exist');
                                        if (ok) _invalidateAll('active-zero-full-fallback-completed');
                                    }
                                }).catch(() => {});
                            }
                        }
                    }
                    initialCombinedApplied = true;
                }

                setActiveProfiles(activeMap, 'active-profiles-snapshot');
                _syncLegacy();
                if (typeof window.recordProfileDeltaShadowSnapshot === 'function') {
                    window.recordProfileDeltaShadowSnapshot(activeMap, {
                        source: 'active-profiles-snapshot',
                        clubId,
                        role: _state.role,
                        branch: coachBranch || 'all'
                    });
                }

                _state.activeListenerMounted = true;
                _state.lastProfilesMode = isCoach && !coachAllBranches
                    ? 'active-branch-aliases'
                    : 'active-split';
                _invalidateAll('active-profiles-snapshot');
                _updateWindowMetrics();
                if (!isCoach && typeof window.scheduleAutomaticDebtProfileCoverage === 'function') {
                    window.scheduleAutomaticDebtProfileCoverage('active-profiles-snapshot');
                }
            };

            queryEntries.forEach(entry => {
                const unsub = fbOnSnapshot(
                    entry.query,
                    snap => applyCombinedSnapshot(entry, snap),
                    err => {
                        _state.activeQueryErrorCount++;
                        console.warn('[ProfilesListener] Active query lỗi:', err.code || err.message, '— fallback');
                        if (isCoach) loadCoachBranchProfilesFallback('active-query-error:' + (err.code || 'unknown'));
                        else loadFullProfilesFallback('active-query-error:' + (err.code || 'unknown'));
                    }
                );
                if (typeof unsub === 'function') unsubscribers.push(unsub);
            });

            return () => unsubscribers.forEach(unsub => {
                try { unsub(); } catch (_) {}
            });
        },
        {
            owner:  'students',
            scope:  'global',
            tabId:  null,
            reason: context.reason || 'active-profiles-mount-3.7C',
        }
    );
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
    _state.activeListenerMounted = false;
    _state.activeListenerKey     = null;
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
export async function loadQuitProfilesIfNeeded(reason, contextOverride) {
    const _effectiveContext = contextOverride || _ctx;
    if (_isCoachContext(_effectiveContext)) {
        window.RoleReadBoundary?.canMount?.('profiles.quit', { reason: reason || 'quit-lazy' });
        return false;
    }
    if (_state.quitLoaded)            return; // Đã có data
    if (_state.quitLoadingInProgress) return; // Đang load — tránh parallel

    const ctx = contextOverride || _ctx;
    if (!ctx || !ctx.profRef) {
        console.warn('[ProfilesListener] loadQuitProfilesIfNeeded: thiếu context — skip');
        return;
    }

    const fb = window._fb_init || {};
    const { query: fbQuery, where: fbWhere, getDocs: fbGetDocs } = fb;

    if (!fbGetDocs) {
        console.warn('[ProfilesListener] loadQuitProfilesIfNeeded: getDocs không sẵn');
        await loadFullProfilesFallback('quit-sdk-not-ready');
        return;
    }

    _state.quitLoadingInProgress = true;
    _state.quitLoadLastReason    = reason || '';

    const { profRef } = ctx;
    // [Phase 3.7C] Lấy quit values từ config
    const quitValues  = getQuitQueryValues();

    try {
        let quitQuery;
        if (quitValues.length === 1) {
            quitQuery = fbQuery(profRef, fbWhere('status', '==', quitValues[0]));
        } else {
            quitQuery = fbQuery(profRef, fbWhere('status', 'in', quitValues));
        }

        const snap    = await fbGetDocs(quitQuery);
        if (typeof window.recordFirestoreReadAttribution === 'function') {
            window.recordFirestoreReadAttribution('profiles.quitLazyQuery', snap.size || 0, {
                initial: true,
                reason: reason || 'quit-lazy'
            });
        }
        const quitMap = {};
        snap.forEach(d => {
            const id = d.id.trim();
            if (id) quitMap[id] = d.data();
        });

        setQuitProfiles(quitMap, 'quit-profiles-lazy:' + (reason || ''));
        markQuitLoaded(true); // [Phase 3.7C+A] explicit safety sync

        _state.quitLoaded            = true;
        _state.quitLoadingInProgress = false;
        _state.quitLoadCount++;

        _syncLegacy();

        if (typeof window.invalidateStudents     === 'function') window.invalidateStudents('quit-profiles-loaded');
        if (typeof window.invalidateList         === 'function') window.invalidateList('students.quitList', 'quit-profiles-loaded');
        if (typeof window.refreshListComputation === 'function') window.refreshListComputation('students.quitList', 'quit-profiles-loaded');

        _updateWindowMetrics();
        console.debug('[ProfilesListener] Quit loaded —', Object.keys(quitMap).length, 'profiles —', reason);

    } catch (err) {
        _state.quitLoadingInProgress = false;
        _state.quitQueryErrorCount++;
        console.warn('[ProfilesListener] Quit query lỗi:', err.code || err.message, '— fallback full');
        await loadFullProfilesFallback('quit-query-error:' + (err.code || 'unknown'));
    }
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
}

// ─────────────────────────────────────────────────────────────────────────────
// COACH BRANCH-SAFE FALLBACK — never reads the full club collection
// ─────────────────────────────────────────────────────────────────────────────

export async function loadCoachBranchProfilesFallback(reason) {
    const ctx = _ctx;
    const branch = _coachBranch(ctx);
    const allBranches = _coachAllBranches(ctx);
    if (!_isCoachContext(ctx) || !ctx || !ctx.profRef || !branch) {
        console.warn('[ProfilesFallback] Coach branch fallback blocked — missing safe context:', reason);
        if (typeof window.showCoachBranchAssignmentError === 'function') window.showCoachBranchAssignmentError();
        return false;
    }
    if (_state.fallbackInProgress || _state.fallbackCount >= _state.maxFallbackPerSession) return false;

    const fb = window._fb_init || {};
    const { query: fbQuery, where: fbWhere, getDocs: fbGetDocs } = fb;
    if (!fbQuery || !fbWhere || !fbGetDocs) return false;

    _state.fallbackInProgress = true;
    try {
        const activeMap = {};
        let totalDocs = 0;
        let aliases = [branch];
        if (allBranches) {
            const statusValues = getActiveQueryValues();
            const statusConstraint = statusValues.length === 1
                ? fbWhere('status', '==', statusValues[0])
                : fbWhere('status', 'in', statusValues);
            const snap = await fbGetDocs(fbQuery(ctx.profRef, statusConstraint));
            totalDocs += snap.size || 0;
            snap.forEach(d => {
                const id = d.id.trim();
                if (!id) return;
                const data = d.data();
                if (classifyProfileStatus(data) !== 'quit') activeMap[id] = data;
            });
        } else {
            const config = window.__store?.clubConfig || window.clubConfig || {};
            aliases = window.CoachBranchResolver?.queryValues?.(branch, config) || [branch];
            // Query aliases separately because Firestore cannot combine status IN
            // with another branch IN in the same query. Every query remains scoped
            // to an alias of the assigned branch only.
            for (const alias of aliases) {
                const snap = await fbGetDocs(fbQuery(ctx.profRef, fbWhere('branch', '==', alias)));
                totalDocs += snap.size || 0;
                snap.forEach(d => {
                    const id = d.id.trim();
                    if (!id) return;
                    const data = d.data();
                    if (classifyProfileStatus(data) !== 'quit') activeMap[id] = data;
                });
            }
        }
        if (typeof window.recordFirestoreReadAttribution === 'function') {
            window.recordFirestoreReadAttribution('profiles.coachBranchFallbackQuery', totalDocs, {
                initial: true,
                reason: reason || 'coach-branch-fallback',
                branch,
                aliases,
                scope: allBranches ? 'all-explicit' : 'specific-aliases'
            });
        }
        setActiveProfiles(activeMap, 'coach-branch-fallback:' + reason);
        if (typeof window.recordProfileDeltaShadowSnapshot === 'function') {
            window.recordProfileDeltaShadowSnapshot(activeMap, { source: 'coach-branch-fallback:' + reason, clubId: ctx.clubId, role: 'coach', branch });
        }
        setQuitProfiles({}, 'coach-branch-fallback:no-quit-data');
        _syncLegacy();
        _state.fallbackCompleted = true;
        _state.fallbackCount++;
        _state.coachBranchFallbackCount++;
        _state.fullFallbackReason = (allBranches ? 'coach-all-active-only:' : 'coach-branch-only:') + reason;
        _state.lastProfilesMode = allBranches ? 'coach-all-active-fallback' : 'coach-branch-fallback';
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
        if (typeof window.recordProfileDeltaShadowSnapshot === 'function') {
            window.recordProfileDeltaShadowSnapshot(_fallbackActive, { source: 'full-fallback-active:' + reason, clubId: ctx.clubId, role: _state.role, branch: 'all' });
        }
        setQuitProfiles(_fallbackQuit, 'full-fallback-quit-classified:' + reason);

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

    if (_state.quitLoaded) return true;

    // Thử load quit trước (nhẹ hơn full fallback)
    try {
        await loadQuitProfilesIfNeeded(tag + ':quit');
    } catch (_e) {
        // tiếp tục xuống full fallback
    }

    if (_state.quitLoaded) return true;

    // Fallback full nếu quit load thất bại
    const ok = await loadFullProfilesFallback(tag + ':full');
    _updateWindowMetrics();
    return ok || _state.quitLoaded;
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

    // Quit
    _state.quitLoaded              = false;
    _state.quitLoadCount           = 0;
    _state.quitQueryErrorCount     = 0;
    _state.quitLoadLastReason      = '';
    _state.quitLoadingInProgress   = false;

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
