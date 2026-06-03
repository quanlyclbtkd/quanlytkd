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
 *   students:profiles:active:{clubId}  — active/trial snapshot (realtime)
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
        console.warn('[ProfilesListener] mountActiveProfilesListener: thiếu context — fallback');
        if (context && context.profRef) loadFullProfilesFallback('missing-context-partial');
        return;
    }

    _ctx = context;
    const { profRef, clubId } = context;
    const key = 'students:profiles:active:' + clubId;
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
        loadFullProfilesFallback('sdk-not-ready');
        return;
    }

    if (!window.safeRegisterSnapshot) {
        console.warn('[ProfilesListener] safeRegisterSnapshot chưa sẵn — fallback');
        loadFullProfilesFallback('no-safeRegisterSnapshot');
        return;
    }

    // [Phase 3.7C] Đọc status values từ config
    const statusValues = getActiveQueryValues();

    window.safeRegisterSnapshot(
        key,
        () => {
            let activeQuery;
            try {
                if (statusValues.length === 1) {
                    activeQuery = fbQuery(profRef, fbWhere('status', '==', statusValues[0]));
                } else {
                    activeQuery = fbQuery(profRef, fbWhere('status', 'in', statusValues));
                }
            } catch (qErr) {
                console.warn('[ProfilesListener] Build query lỗi:', qErr.message, '— fallback');
                setTimeout(() => loadFullProfilesFallback('query-build-error'), 0);
                return () => {};
            }

            const unsub = fbOnSnapshot(
                activeQuery,
                (snap) => {
                    _state.activeSnapshotCount++;
                    if (window.markListenerSnapshot) window.markListenerSnapshot(key);

                    const activeMap = {};
                    snap.forEach(d => {
                        const id = d.id.trim();
                        if (id) activeMap[id] = d.data();
                    });

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
                            _pG4k(_pQ4k(profRef, _pL4k(1))).then(_probe => {
                                if (!_probe.empty) {
                                    console.warn('[ProfilesListener] active=0 nhưng collection có docs — data legacy thiếu status field → full fallback');
                                    loadFullProfilesFallback('active-zero-but-profiles-exist');
                                }
                            }).catch(() => {});
                        }
                    }

                    setActiveProfiles(activeMap, 'active-profiles-snapshot');
                    _syncLegacy();

                    _state.activeListenerMounted = true;
                    _state.lastProfilesMode      = 'active-split';

                    _invalidateAll('active-profiles-snapshot');
                    _updateWindowMetrics();
                },
                (err) => {
                    _state.activeQueryErrorCount++;
                    console.warn(
                        '[ProfilesListener] Active query lỗi:', err.code || err.message,
                        '— fallback'
                    );
                    loadFullProfilesFallback('active-query-error:' + (err.code || 'unknown'));
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
        _state.fullFallbackReason    = reason;
        _state.lastProfilesMode      = 'full-fallback';
        _state.quitLoaded            = true;
        _state.quitLoadingInProgress = false;
        _state.activeListenerMounted = true;
        // [Phase 3.7C+A] Explicit store state sync — safety layer on top of syncLegacyAllProfiles
        markActiveLoaded(true);
        markQuitLoaded(true);

        _invalidateAll('full-profiles-fallback');
        if (typeof window.invalidateStudents === 'function') window.invalidateStudents('full-fallback-quit');
        if (typeof window.invalidateList     === 'function') {
            window.invalidateList('students.quitList',  'full-fallback-quit');
            window.invalidateList('students.activeList', 'full-profiles-fallback');
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
