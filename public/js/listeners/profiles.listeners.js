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
    coachAliasCompletenessLoadedFor: '',

    // ── Quit load ─────────────────────────────────────────────────────────────
    quitLoaded:             false,
    quitLoadCount:          0,
    quitQueryErrorCount:    0,
    quitLoadLastReason:     '',
    /** Guard: prevent parallel quit load calls */
    quitLoadingInProgress:  false,
    /** Phase 4K-6V4B3: full authoritative reconciliation for Admin quit tab */
    quitCompletenessReconciled: false,
    /** Phase 4K-6V4D6: single-flight authoritative Đã nghỉ full sync. */
    quitAuthoritativePromise: null,
    quitAuthoritativeLastError: '',
    quitAuthoritativeFallbackCount: 0,
    maxQuitAuthoritativeFallbackPerSession: 10,

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
        quitCompletenessReconciled:         _state.quitCompletenessReconciled,
        quitAuthoritativeInProgress:        !!_state.quitAuthoritativePromise,
        quitAuthoritativeLastError:         _state.quitAuthoritativeLastError,
        quitAuthoritativeFallbackCount:     _state.quitAuthoritativeFallbackCount,
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
    _state.coachCanonicalActiveMap = {};
    _state.coachLegacyActiveMap = {};
    _state.coachAliasCompletenessLoadedFor = '';
    const isCoach = _isCoachContext(context);
    const coachBranch = _coachBranch(context);
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
                    if (activeCount === 0 && _state.activeSnapshotCount === 1 && isCoach) {
                        Promise.resolve().then(() => loadCoachBranchProfilesFallback('coach-active-zero-alias-completeness'));
                    }
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
                                }
                            }).catch(() => {});
                        }
                    }

                    setActiveProfiles(activeMap, 'active-profiles-snapshot');
                    _syncLegacy();

                    // Phase 4K-6V4D7: the realtime listener is deliberately scoped
                    // to canonical `branch == CSx`. Legacy profiles may still store
                    // `branchCode`, `CS02`, `CS 2`, custom branchName, etc. Run one
                    // guarded alias fallback once per Coach branch so Attendance has
                    // the complete assigned-branch roster.
                    if (isCoach && _state.coachAliasCompletenessLoadedFor !== coachBranch && !_state.fallbackInProgress) {
                        _state.coachAliasCompletenessLoadedFor = coachBranch;
                        Promise.resolve().then(() => loadCoachBranchProfilesFallback('coach-alias-completeness:' + coachBranch));
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
export async function loadQuitProfilesIfNeeded(reason, contextOverride) {
    const _effectiveContext = contextOverride || _ctx;
    if (_isCoachContext(_effectiveContext)) {
        window.RoleReadBoundary?.canMount?.('profiles.quit', { reason: reason || 'quit-lazy' });
        return false;
    }
    // Phase 4K-6V4D6: targeted quit queries were the root cause of the persistent
    // mobile/web incomplete Đã nghỉ list. They can only return a subset and could
    // be rendered as final data. The quit tab now uses only a guarded full
    // authoritative reconciliation. This is a one-shot read when the quit tab is
    // opened and is never used for Coach attendance-only accounts.
    if (_state.quitLoaded && _state.quitCompletenessReconciled) return true;
    return ensureQuitProfilesAuthoritative('load-quit-profiles:' + (reason || 'unknown'));
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
    _state.quitAuthoritativePromise = null;
    _state.quitAuthoritativeLastError = '';
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
        const fields = ['branch', 'branchCode', 'coachBranch', 'branchName'];
        const specs = [];
        const seenSpec = new Set();
        fields.forEach(field => aliases.forEach(alias => {
            const value = String(alias || '').trim();
            if (!value) return;
            const key = field + '=' + value;
            if (seenSpec.has(key)) return;
            seenSpec.add(key);
            specs.push({ field, value });
        }));

        let docsRead = 0;
        const activeMap = {};
        const deniedSpecs = [];
        for (const spec of specs) {
            try {
                const snap = await fbGetDocs(fbQuery(ctx.profRef, fbWhere(spec.field, '==', spec.value)));
                docsRead += snap.size || 0;
                snap.forEach(d => {
                    const id = d.id.trim();
                    if (!id) return;
                    const data = d.data();
                    if (classifyProfileStatus(data) !== 'quit') activeMap[id] = data;
                });
            } catch (err) {
                if (err && err.code === 'permission-denied') {
                    deniedSpecs.push(spec.field + '=' + spec.value);
                    continue;
                }
                throw err;
            }
        }
        if (deniedSpecs.length) {
            console.warn('[ProfilesFallback] Coach branch alias specs denied:', deniedSpecs.slice(0, 8).join(', '));
        }
        if (typeof window.recordFirestoreReadAttribution === 'function') {
            window.recordFirestoreReadAttribution('profiles.coachBranchFallbackQuery', docsRead, {
                initial: true,
                reason: reason || 'coach-branch-fallback',
                branch,
                aliases,
                fields
            });
        }
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
export async function loadFullProfilesFallback(reason, options = {}) {
    const forceQuitAuthoritative = !!(options && options.forceQuitAuthoritative);
    if (_isCoachContext()) {
        window.RoleReadBoundary?.canMount?.('profiles.full-fallback', { reason: reason || 'full-fallback' });
        return loadCoachBranchProfilesFallback('redirected-from-full:' + (reason || 'unknown'));
    }
    // ── [Phase 3.7C] Loop guard ────────────────────────────────────────────
    if (_state.fallbackInProgress) {
        console.debug('[ProfilesFallback] Đang chạy — skip:', reason);
        return false;
    }

    if (!forceQuitAuthoritative && _state.fallbackCount >= _state.maxFallbackPerSession) {
        console.warn(
            '[ProfilesFallback] Đạt maxFallbackPerSession (' + _state.maxFallbackPerSession + ') — stop. Reason:', reason
        );
        return false;
    }
    if (forceQuitAuthoritative && _state.quitAuthoritativeFallbackCount >= _state.maxQuitAuthoritativeFallbackPerSession) {
        console.warn(
            '[ProfilesFallback] Đạt maxQuitAuthoritativeFallbackPerSession (' + _state.maxQuitAuthoritativeFallbackPerSession + ') — stop. Reason:', reason
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
        if (forceQuitAuthoritative) _state.quitAuthoritativeFallbackCount++;
        _state.fullFallbackReason    = reason;
        _state.lastProfilesMode      = 'full-fallback';
        _state.quitLoaded            = true;
        _state.quitCompletenessReconciled = true;
        _state.quitAuthoritativeLastError = '';
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
        if (forceQuitAuthoritative) _state.quitAuthoritativeFallbackCount++;
        _state.fullFallbackReason = reason + ':error';
        if (forceQuitAuthoritative) _state.quitAuthoritativeLastError = err.code || err.message || 'full-sync-failed';
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

    if (_state.quitLoaded && _state.quitCompletenessReconciled) return true;

    // Thử load quit trước (nhẹ hơn full fallback)
    try {
        await loadQuitProfilesIfNeeded(tag + ':quit');
    } catch (_e) {
        // tiếp tục xuống full fallback
    }

    if (_state.quitLoaded && _state.quitCompletenessReconciled) return true;

    // Fallback full nếu quit load thất bại
    const ok = await loadFullProfilesFallback(tag + ':full');
    _updateWindowMetrics();
    return ok || (_state.quitLoaded && _state.quitCompletenessReconciled);
}


/**
 * Ensure Đã nghỉ list is fully authoritative (Admin only).
 * Uses a single-flight promise so web/mobile tab switching cannot start a targeted
 * partial result that overwrites the final full list.
 * @param {string} [reason]
 * @returns {Promise<boolean>}
 */
export async function ensureQuitProfilesAuthoritative(reason) {
    if (_isCoachContext()) {
        window.RoleReadBoundary?.canMount?.('profiles.quit-authoritative', { reason: reason || 'quit-authoritative' });
        return false;
    }
    if (_state.quitLoaded && _state.quitCompletenessReconciled) return true;
    if (_state.quitAuthoritativePromise) return _state.quitAuthoritativePromise;
    _state.quitAuthoritativeLastError = '';
    _state.quitAuthoritativePromise = (async () => {
        const ok = await loadFullProfilesFallback('quit-authoritative-full-sync:' + (reason || 'unknown'), { forceQuitAuthoritative: true });
        if (!ok) _state.quitAuthoritativeLastError = _state.fullFallbackReason || 'full-sync-failed';
        _updateWindowMetrics();
        return !!ok;
    })().finally(() => {
        _state.quitAuthoritativePromise = null;
        _updateWindowMetrics();
    });
    _updateWindowMetrics();
    return _state.quitAuthoritativePromise;
}

// ─────────────────────────────────────────────────────────────────────────────
// isQuitProfilesLoaded
// ─────────────────────────────────────────────────────────────────────────────

/** @returns {boolean} */
export function isQuitProfilesLoaded() {
    return _isCoachContext() ? _state.quitLoaded : (_state.quitLoaded && _state.quitCompletenessReconciled);
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
    _state.coachAliasCompletenessLoadedFor = '';

    // Quit
    _state.quitLoaded              = false;
    _state.quitLoadCount           = 0;
    _state.quitQueryErrorCount     = 0;
    _state.quitLoadLastReason      = '';
    _state.quitLoadingInProgress   = false;
    _state.quitCompletenessReconciled = false;
    _state.quitAuthoritativePromise = null;
    _state.quitAuthoritativeLastError = '';
    _state.quitAuthoritativeFallbackCount = 0;

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
        quitCompletenessReconciled:         _state.quitCompletenessReconciled,
        quitAuthoritativeInProgress:        !!_state.quitAuthoritativePromise,
        quitAuthoritativeLastError:         _state.quitAuthoritativeLastError,
        quitAuthoritativeFallbackCount:     _state.quitAuthoritativeFallbackCount,
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
