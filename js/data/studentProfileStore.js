/**
 * js/data/studentProfileStore.js — Phase 3.6D / 3.7A
 * ────────────────────────────────────────────────────────────────
 * Lớp trung gian quản lý dữ liệu profiles võ sinh.
 *
 * MỤC ĐÍCH:
 *   Tạo compatibility layer giữa legacy allProfiles (Phase 3.6C trở về)
 *   và profiles split architecture (Phase 3.7B+).
 *
 *   - activeProfiles:     võ sinh đang tập / trial
 *   - quitProfiles:       võ sinh đã nghỉ / inactive
 *   - otherProfiles:      status không rõ hoặc không phân loại được
 *   - allProfilesCompat:  union của 3 nhóm — compat 1:1 với legacy allProfiles
 *
 * TRONG PHASE NÀY (3.6D / 3.7A):
 *   - Store được POPULATE từ allProfiles legacy (listener vẫn load toàn bộ)
 *   - Không fetch Firestore mới
 *   - Không lazy load quit profiles
 *   - Không đổi query profiles
 *   - allProfiles gốc trong app.js KHÔNG bị xóa / thay thế
 *
 * [DONE Phase 3.7B]:
 *   - Active-only listener mounted via profiles.listeners.js → mountActiveProfilesListener()
 *   - Quit profiles lazy load khi vào tab Đã nghỉ → loadQuitProfilesIfNeeded()
 *   - allProfiles legacy sync qua window._syncAllProfilesLegacy bridge * QUAN TRỌNG:
 *   - Store KHÔNG mutate DOM
 *   - Store KHÔNG gọi renderApp / scheduleRender
 *   - Store KHÔNG phụ thuộc Firestore trực tiếp
 *   - Không log tên / SĐT / CCCD võ sinh ra console
 * ────────────────────────────────────────────────────────────────
 */

// ── Phase 3.7C: Centralized status config ────────────────────────────────────
import {
    classifyProfileStatus as _classifyFromConfig,
} from './profileStatusConfig.js';

// ─────────────────────────────────────────────────────────────────────────────
// INTERNAL STATE
// ─────────────────────────────────────────────────────────────────────────────

const _store = {
    /** Võ sinh đang tập / trial */
    activeProfiles:     {},
    /** Võ sinh đã nghỉ / inactive */
    quitProfiles:       {},
    /** Status không phân loại được */
    otherProfiles:      {},
    /** Union tất cả nhóm — compat với legacy allProfiles */
    allProfilesCompat:  {},
    /** Đã load activeProfiles ít nhất 1 lần chưa */
    activeLoaded:       false,
    /** Đã load quitProfiles ít nhất 1 lần chưa */
    quitLoaded:         false,
    /** Đã load otherProfiles ít nhất 1 lần chưa */
    otherLoaded:        false,
    /** Tăng mỗi khi store thay đổi — dùng để detect staleness */
    version:            0,
    /** Timestamp (ms) lần cập nhật gần nhất */
    lastUpdatedAt:      null,
};

// ─────────────────────────────────────────────────────────────────────────────
// METRICS
// ─────────────────────────────────────────────────────────────────────────────

const _metrics = {
    activeProfileCount:           0,
    quitProfileCount:             0,
    otherProfileCount:            0,
    allProfilesCompatCount:       0,
    activeLoaded:                 false,
    quitLoaded:                   false,
    otherLoaded:                  false,
    version:                      0,
    syncCount:                    0,
    ensureProfilesForTabCalls:    {},
    getProfileByIdSafeCalls:      0,
    firestoreFallbackGetDocCount: 0,
    lastSyncReason:               '',
    lastUpdatedAt:                null,
};

/**
 * Cập nhật metrics từ state hiện tại.
 * Chỉ log count/trạng thái — KHÔNG log tên/SĐT/CCCD võ sinh.
 * @private
 */
function _updateMetrics() {
    _metrics.activeProfileCount     = Object.keys(_store.activeProfiles).length;
    _metrics.quitProfileCount       = Object.keys(_store.quitProfiles).length;
    _metrics.otherProfileCount      = Object.keys(_store.otherProfiles).length;
    _metrics.allProfilesCompatCount = Object.keys(_store.allProfilesCompat).length;
    _metrics.activeLoaded           = _store.activeLoaded;
    _metrics.quitLoaded             = _store.quitLoaded;
    _metrics.otherLoaded            = _store.otherLoaded;
    _metrics.version                = _store.version;
    _metrics.lastUpdatedAt          = _store.lastUpdatedAt;
}

// ─────────────────────────────────────────────────────────────────────────────
// CLASSIFIER
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Phân loại trạng thái võ sinh thành 3 nhóm: 'active' / 'quit' / 'other'.
 *
 * QUY TẮC:
 *   - 'active', 'trial', hoặc status chứa 'đang'  → 'active'
 *   - 'quit', 'inactive', hoặc status chứa 'nghỉ'  → 'quit'
 *   - Còn lại (bao gồm rỗng/undefined)             → 'other'
 *
 * CHỈ dùng để phân loại cache nội bộ.
 * KHÔNG ghi ngược Firestore.
 * KHÔNG tự đổi field status của profile.
 *
 * [Phase 3.7C] Delegate sang profileStatusConfig.classifyProfileStatus.
 * Config có thể điều chỉnh runtime qua setProfileStatusConfigForDebug().
 *
 * @param {{ status?: string } | null | undefined} profile
 * @returns {'active' | 'quit' | 'other'}
 */
export function classifyProfileStatus(profile) {
    return _classifyFromConfig(profile);
}

// ─────────────────────────────────────────────────────────────────────────────
// PRIVATE HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Rebuild allProfilesCompat từ 3 nhóm con.
 * Thứ tự merge: other → quit → active (active thắng nếu id trùng).
 * @private
 */
function _rebuildCompat() {
    _store.allProfilesCompat = {
        ..._store.otherProfiles,
        ..._store.quitProfiles,
        ..._store.activeProfiles,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// WRITE API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Set toàn bộ activeProfiles (thay thế hoàn toàn, không merge).
 * Gọi khi active-only listener snapshot đến (Phase 3.7B+).
 *
 * @param {object} map    - { [profileId]: profileData }
 * @param {string} reason - lý do cập nhật (debug)
 */
export function setActiveProfiles(map, reason) {
    if (!map || typeof map !== 'object') return;
    _store.activeProfiles = map;
    _store.activeLoaded   = true;
    _store.version++;
    _store.lastUpdatedAt  = Date.now();
    _rebuildCompat();
    _updateMetrics();
}

/**
 * Set toàn bộ quitProfiles (thay thế hoàn toàn, không merge).
 * Gọi khi quit-only listener snapshot đến (Phase 3.7B+).
 *
 * @param {object} map
 * @param {string} reason
 */
export function setQuitProfiles(map, reason) {
    if (!map || typeof map !== 'object') return;
    _store.quitProfiles = map;
    _store.quitLoaded   = true;
    _store.version++;
    _store.lastUpdatedAt = Date.now();
    _rebuildCompat();
    _updateMetrics();
}

/**
 * Set toàn bộ otherProfiles (thay thế hoàn toàn, không merge).
 *
 * @param {object} map
 * @param {string} reason
 */
export function setOtherProfiles(map, reason) {
    if (!map || typeof map !== 'object') return;
    _store.otherProfiles = map;
    _store.otherLoaded   = true;
    _store.version++;
    _store.lastUpdatedAt = Date.now();
    _rebuildCompat();
    _updateMetrics();
}

/**
 * Set allProfilesCompat trực tiếp (override tất cả nhóm con).
 * Dùng khi bridge từ legacy allProfiles mà không phân loại.
 *
 * @param {object} map
 * @param {string} reason
 */
export function setAllProfilesCompat(map, reason) {
    if (!map || typeof map !== 'object') return;
    _store.allProfilesCompat = map;
    _store.version++;
    _store.lastUpdatedAt = Date.now();
    _updateMetrics();
}

/**
 * Upsert một profile vào đúng nhóm theo classifyProfileStatus.
 * Tự động cập nhật allProfilesCompat.
 * Loại bỏ profile khỏi các nhóm không còn phù hợp (tránh duplicate).
 *
 * @param {string} profileId
 * @param {object} data
 * @param {string} reason
 */
export function mergeProfile(profileId, data, reason) {
    if (!profileId || !data || typeof data !== 'object') return;
    const id       = String(profileId).trim();
    const category = classifyProfileStatus(data);

    // Xóa khỏi nhóm cũ trước khi thêm vào nhóm mới
    delete _store.activeProfiles[id];
    delete _store.quitProfiles[id];
    delete _store.otherProfiles[id];

    if      (category === 'active') _store.activeProfiles[id] = data;
    else if (category === 'quit')   _store.quitProfiles[id]   = data;
    else                            _store.otherProfiles[id]  = data;

    // Cập nhật compat trực tiếp (không rebuild toàn bộ để tiết kiệm)
    _store.allProfilesCompat[id] = data;

    _store.version++;
    _store.lastUpdatedAt = Date.now();
    _updateMetrics();
}

/**
 * Xóa một profile khỏi tất cả nhóm và allProfilesCompat.
 *
 * @param {string} profileId
 * @param {string} reason
 */
export function removeProfile(profileId, reason) {
    if (!profileId) return;
    const id = String(profileId).trim();
    delete _store.activeProfiles[id];
    delete _store.quitProfiles[id];
    delete _store.otherProfiles[id];
    delete _store.allProfilesCompat[id];
    _store.version++;
    _store.lastUpdatedAt = Date.now();
    _updateMetrics();
}

/**
 * Reset toàn bộ store về trạng thái khởi tạo.
 * Gọi khi logout hoặc club-switch.
 *
 * @param {string} reason
 */
export function resetStudentProfileStore(reason) {
    _store.activeProfiles    = {};
    _store.quitProfiles      = {};
    _store.otherProfiles     = {};
    _store.allProfilesCompat = {};
    _store.activeLoaded      = false;
    _store.quitLoaded        = false;
    _store.otherLoaded       = false;
    _store.version++;
    _store.lastUpdatedAt     = Date.now();
    _updateMetrics();
    console.debug('[StudentProfileStore] reset —', reason || 'no reason');
}

/**
 * Đồng bộ từ legacy allProfiles vào store.
 * Phân loại từng profile theo status → đổ vào đúng nhóm.
 *
 * GỌI KHI:
 *   app.js profiles onSnapshot cập nhật allProfiles (Phase 3.6D/3.7A).
 *
 * KHÔNG:
 *   - Thay đổi object allProfiles gốc của app.js
 *   - Ghi Firestore
 *   - Gọi renderApp / scheduleRender
 *
 * @param {object} allProfiles  - { [profileId]: profileData }
 * @param {string} reason
 */
export function syncLegacyAllProfiles(allProfiles, reason) {
    if (!allProfiles || typeof allProfiles !== 'object') return;

    const active = {}, quit = {}, other = {};

    for (const [id, data] of Object.entries(allProfiles)) {
        if (!id || !data) continue;
        const category = classifyProfileStatus(data);
        if      (category === 'active') active[id] = data;
        else if (category === 'quit')   quit[id]   = data;
        else                            other[id]  = data;
    }

    _store.activeProfiles    = active;
    _store.quitProfiles      = quit;
    _store.otherProfiles     = other;
    // allProfilesCompat = union đầy đủ — active thắng nếu id trùng
    _store.allProfilesCompat = { ...other, ...quit, ...active };
    _store.activeLoaded      = true;
    _store.quitLoaded        = true;
    _store.otherLoaded       = true;
    _store.version++;
    _store.lastUpdatedAt     = Date.now();

    _metrics.syncCount++;
    _metrics.lastSyncReason = reason || '';
    _updateMetrics();
}

// ─────────────────────────────────────────────────────────────────────────────
// READ API
// ─────────────────────────────────────────────────────────────────────────────

/** Reference tới activeProfiles (không clone). */
export function getActiveProfiles()    { return _store.activeProfiles; }

/** Reference tới quitProfiles. */
export function getQuitProfiles()      { return _store.quitProfiles; }

/** Reference tới otherProfiles. */
export function getOtherProfiles()     { return _store.otherProfiles; }

/**
 * Reference tới allProfilesCompat — compat 1:1 với legacy allProfiles.
 *
 * Legacy code dùng:
 *   Object.values(allProfiles)  →  hoạt động đúng
 *   allProfiles[id]             →  hoạt động đúng
 *   Object.keys(allProfiles)    →  hoạt động đúng
 */
export function getAllProfilesCompat() { return _store.allProfilesCompat; }

/**
 * Tìm profile theo id trong tất cả nhóm cache (không async, không Firestore).
 * Thứ tự tìm: active → quit → other → allProfilesCompat.
 *
 * @param {string} profileId
 * @returns {object|null}
 */
export function getProfileFromStore(profileId) {
    if (!profileId) return null;
    const id = String(profileId).trim();
    return (
        _store.activeProfiles[id]    ||
        _store.quitProfiles[id]      ||
        _store.otherProfiles[id]     ||
        _store.allProfilesCompat[id] ||
        null
    );
}

export function isActiveLoaded()        { return _store.activeLoaded; }
export function isQuitLoaded()          { return _store.quitLoaded; }
export function markActiveLoaded(value) { _store.activeLoaded = !!value; _updateMetrics(); }
export function markQuitLoaded(value)   { _store.quitLoaded   = !!value; _updateMetrics(); }

// ─────────────────────────────────────────────────────────────────────────────
// ensureProfilesForTab
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Guard nhẹ — kiểm tra profiles đã sẵn sàng cho tab trước khi render.
 *
 * TRONG PHASE 3.6D/3.7A:
 *   Chủ yếu là compatibility check — không lazy load Firestore.
 *   Chỉ trả về false nếu store hoàn toàn rỗng (listener chưa fire lần nào).
 *
 * TODO Phase 3.7B:
 *   - case 'quit': lazy load quitProfiles từ Firestore nếu chưa loaded
 *   - Trả về Promise nếu cần fetch async
 *
 * @param {string} tabId  - id của tab đang switch sang
 * @param {string} [reason]
 * @returns {boolean}  true nếu data sẵn sàng (hoặc fallback ổn), false nếu chưa có gì
 */
export function ensureProfilesForTab(tabId, reason) {
    // Ghi metrics nhẹ (không log data cá nhân)
    if (tabId) {
        _metrics.ensureProfilesForTabCalls[tabId] =
            (_metrics.ensureProfilesForTabCalls[tabId] || 0) + 1;
    }
    console.debug('[Profiles] ensureProfilesForTab:', tabId, '—', reason || '');

    const compatCount = Object.keys(_store.allProfilesCompat).length;

    switch (tabId) {
        case 'active':
        case 'attendance':
        case 'exam':
        case 'dashboard':
            // Cần activeProfiles (hoặc allProfilesCompat làm fallback)
            return _store.activeLoaded || compatCount > 0;

        case 'debt':
        case 'tx':
            // Cần allProfilesCompat cho autocomplete + danh sách nợ
            return compatCount > 0;

        case 'quit':
            // [Phase 3.7B] Trigger lazy load nếu chưa loaded (fire-and-forget async).
            // loadQuitProfilesIfNeeded tự guard: skip nếu đang load hoặc đã loaded.
            // Sau khi getDocs xong → invalidateStudents('quit-profiles-loaded') → re-render tab Đã nghỉ.
            if (!_store.quitLoaded) {
                if (typeof window.loadQuitProfilesIfNeeded === 'function') {
                    window.loadQuitProfilesIfNeeded('ensure-quit-tab:' + (reason || ''));
                }
            } else if (typeof window.ensureQuitProfilesAuthoritative === 'function') {
                window.ensureQuitProfilesAuthoritative('ensure-quit-tab-authoritative:' + (reason || ''));
            }
            // Phase 4K-6V4D10: compatCount can be partial active/targeted data.
            // Kick authority reconciliation whenever the Đã nghỉ tab is opened and
            // the full quit pass has not been confirmed yet.
            try {
                const m = window.__profileScaleMetrics || {};
                if (!m.quitCompletenessReconciled && typeof window.ensureQuitProfilesAuthoritative === 'function') {
                    window.ensureQuitProfilesAuthoritative('ensure-quit-tab-force-authority:' + (reason || ''));
                }
            } catch (_) {}
            return _store.quitLoaded || compatCount > 0;

        case 'inventory':
        case 'expense':
            // Inventory không phụ thuộc profiles trực tiếp
            return true;

        default:
            // Tab không rõ: fallback an toàn — không crash
            return compatCount > 0;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// getProfileByIdSafe
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Tìm profile theo id — cache trước, Firestore fallback chỉ khi cần và được phép.
 *
 * LÀM:
 *   1. Tìm trong store (active → quit → other → allProfilesCompat)
 *   2. Tìm trong window.__store.profiles (legacy allProfiles)
 *   3. Nếu options.allowFirestoreFallback === true: getDoc từ Firestore
 *
 * KHÔNG:
 *   - Bắt buộc đổi tất cả call site trong Phase này
 *   - Log dữ liệu cá nhân
 *   - Throw nếu không tìm được (luôn trả null thay vì crash)
 *
 * @param {string} profileId
 * @param {{ allowFirestoreFallback?: boolean }} [options]
 * @returns {Promise<object|null>}
 */
export async function getProfileByIdSafe(profileId, options) {
    _metrics.getProfileByIdSafeCalls++;
    if (!profileId) return null;
    const id = String(profileId).trim();

    // 1. Tìm trong store cache
    const cached = getProfileFromStore(id);
    if (cached) return cached;

    // 2. Tìm trong legacy window.__store.profiles
    const legacyProfiles = window.__store && window.__store.profiles;
    if (legacyProfiles && legacyProfiles[id]) return legacyProfiles[id];

    // 3. Firestore fallback — chỉ khi được phép rõ ràng và cần thiết
    if (options && options.allowFirestoreFallback) {
        const db     = window.__store && window.__store.db;
        const clubId = window.__store && window.__store.clubId;
        if (db && clubId) {
            try {
                _metrics.firestoreFallbackGetDocCount++;
                const fbInit = window._fb_init || {};
                const docFn    = fbInit.doc;
                const getDocFn = fbInit.getDoc;
                if (typeof docFn === 'function' && typeof getDocFn === 'function') {
                    const snap = await getDocFn(docFn(db, 'clubs', clubId, 'profiles', id));
                    if (snap && snap.exists()) return snap.data();
                }
            } catch (_e) {
                // Firestore fallback thất bại — im lặng, trả null
            }
        }
    }

    return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC studentProfileStore OBJECT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Object tổng hợp toàn bộ API của store.
 * Exposed lên window.studentProfileStore bởi main.js.
 */
export const studentProfileStore = {
    // State snapshot (live reference — không clone)
    get activeProfiles()    { return _store.activeProfiles; },
    get quitProfiles()      { return _store.quitProfiles; },
    get otherProfiles()     { return _store.otherProfiles; },
    get allProfilesCompat() { return _store.allProfilesCompat; },
    get activeLoaded()      { return _store.activeLoaded; },
    get quitLoaded()        { return _store.quitLoaded; },
    get otherLoaded()       { return _store.otherLoaded; },
    get version()           { return _store.version; },
    get lastUpdatedAt()     { return _store.lastUpdatedAt; },

    // Write
    setActiveProfiles,
    setQuitProfiles,
    setOtherProfiles,
    setAllProfilesCompat,
    mergeProfile,
    removeProfile,
    resetStudentProfileStore,
    syncLegacyAllProfiles,

    // Read
    getActiveProfiles,
    getQuitProfiles,
    getOtherProfiles,
    getAllProfilesCompat,
    getProfileFromStore,
    isActiveLoaded,
    isQuitLoaded,
    markActiveLoaded,
    markQuitLoaded,

    // Helpers
    classifyProfileStatus,
    ensureProfilesForTab,
    getProfileByIdSafe,
};

// ─────────────────────────────────────────────────────────────────────────────
// METRICS API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Trả về bản copy của metrics hiện tại.
 * @returns {object}
 */
export function getProfileScaleMetrics() {
    _updateMetrics();
    return { ..._metrics };
}

/**
 * In metrics ra console — dùng console.table để dễ đọc.
 * Chỉ log count và trạng thái — KHÔNG log danh sách tên/SĐT võ sinh.
 *
 * @returns {object} metrics object (để assign nếu cần)
 */
export function printProfileScaleMetrics() {
    _updateMetrics();
    console.group('[ProfileScale] Metrics — studentProfileStore (Phase 3.6D/3.7A)');
    console.table({
        activeProfileCount:           { value: _metrics.activeProfileCount },
        quitProfileCount:             { value: _metrics.quitProfileCount },
        otherProfileCount:            { value: _metrics.otherProfileCount },
        allProfilesCompatCount:       { value: _metrics.allProfilesCompatCount },
        activeLoaded:                 { value: _metrics.activeLoaded },
        quitLoaded:                   { value: _metrics.quitLoaded },
        otherLoaded:                  { value: _metrics.otherLoaded },
        version:                      { value: _metrics.version },
        syncCount:                    { value: _metrics.syncCount },
        getProfileByIdSafeCalls:      { value: _metrics.getProfileByIdSafeCalls },
        firestoreFallbackGetDocCount: { value: _metrics.firestoreFallbackGetDocCount },
        lastSyncReason:               { value: _metrics.lastSyncReason },
        lastUpdatedAt:                { value: _metrics.lastUpdatedAt },
    });
    console.log('ensureProfilesForTabCalls:', { ..._metrics.ensureProfilesForTabCalls });
    console.groupEnd();
    return { ..._metrics };
}

// ─────────────────────────────────────────────────────────────────────────────
// TODO Phase 3.7B — KHÔNG THỰC HIỆN TRONG PHASE NÀY
// ─────────────────────────────────────────────────────────────────────────────
//
//  TODO Phase 3.7B: Active Profiles Listener + Lazy Quit Profiles
//
//  1. Tạo active-only onSnapshot trong app.js:
//       const qActive = query(profRef, where('status', 'in', ['active', 'trial']));
//       onSnapshot(qActive, snap => { ... setActiveProfiles(map, 'active-snapshot'); });
//
//  2. Gọi setActiveProfiles(map, 'active-snapshot') thay vì syncLegacyAllProfiles().
//
//  3. Trong ensureProfilesForTab('quit', ...):
//       if (!isQuitLoaded()) {
//           const qQuit = query(profRef, where('status', '==', 'quit'));
//           getDocs(qQuit).then(snap => {
//               const map = {};
//               snap.forEach(d => { map[d.id] = d.data(); });
//               setQuitProfiles(map, 'lazy-quit-fetch');
//               window.invalidateStudents?.('quit-lazy-loaded');
//           });
//       }
//
//  4. allProfilesCompat vẫn là { ...otherProfiles, ...quitProfiles, ...activeProfiles }
//     → bridge tự động cho tất cả legacy code.
//
//  5. Xóa full profiles listener (onSnapshot(profRef, ...)) khỏi app.js.
//
//  PREREQUISITE:
//    - Phase 3.4: Firestore index đã có trên field 'status'
//    - Kiểm tra tab Đã nghỉ hiện đúng sau lazy load
//    - Kiểm tra Báo nợ / Thu học phí / autocomplete không bị mất dữ liệu
