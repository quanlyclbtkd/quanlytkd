/**
 * utils/listeners.js — Phase 3.6B Listener Registration Safety & Legacy Bridge Cleanup
 * ─────────────────────────────────────────────────────────────────────────────────────
 * Centralized Firestore listener lifecycle manager.
 * Nâng cấp từ Phase 3.6: listener registration hardening, orphan prevention,
 * double-unsub guard, safeRegisterSnapshot helper, extended metrics.
 *
 * PHASE 3.6B UPGRADES:
 *   registerListener()       — harden: auto-unsub listener TRÙNG KEY để tránh orphan
 *   safeRegisterSnapshot()   — NEW: kiểm tra key TRƯỚC khi gọi onSnapshot
 *   markListenerSnapshot()   — NEW: ghi nhận snapshot hit (alias recordSnapshot)
 *   legacyAddListener()      — NEW: bridge push → registry nếu có key
 *   removeListener()         — harden: entry.removed guard chống double-unsub
 *   cleanupAllListeners()    — harden: removed guard + clear session ID sau logout
 *   printListenerMetrics()   — mở rộng: hiển thị tất cả metrics mới
 *   window.debugListeners()  — NEW: debug helper nhanh
 *   Session/club metadata    — clubId, sessionId trong ListenerEntry
 *
 * API ĐẦY ĐỦ (Phase 3.6B):
 *   registerListener(key, unsub, options)           — đăng ký với owner/scope/clubId/sessionId
 *   safeRegisterSnapshot(key, createUnsub, options) — NEW: safe create + register
 *   hasListener(key)                                — kiểm tra key tồn tại
 *   removeListener(key, reason)                     — hủy + xóa (với removed guard)
 *   markListenerSnapshot(key)                       — NEW: ghi nhận snapshot hit
 *   recordSnapshot(key)                             — alias markListenerSnapshot (compat)
 *   cleanupListenersByOwner(owner, reason)
 *   cleanupListenersByScope(scope, reason)
 *   cleanupListenersByTabId(tabId, reason)
 *   cleanupAllListeners(reason)                     — hủy tất cả + legacy + clear sessionId
 *   legacyAddListener(unsub, meta)                  — NEW: bridge push → registry
 *   getListenerMetrics()                            — metrics object đầy đủ
 *   printListenerMetrics()                          — console.table đẹp
 *   getActiveKeys()                                 — array of active keys
 *   listenerCount()                                 — count registry
 *
 * BACKWARD COMPAT (Phase 2g/3.6 giữ nguyên):
 *   addListener(key, unsub)   — auto-replace nếu key tồn tại
 *   cleanupListeners()        — alias cleanupAllListeners (registry only)
 *   cleanupAll()              — alias cleanupAllListeners
 *   pushLegacyListener(unsub) — legacy array bridge
 *   cleanupLegacyListeners()  — cleanup legacy array
 *
 * ❗ QUAN TRỌNG Phase 3.6B:
 *   - registerListener() GIỜ gọi unsub() trên listener TRÙNG KEY → tránh orphan.
 *   - safeRegisterSnapshot() ngăn tạo onSnapshot nếu key đã tồn tại.
 *   - entry.removed guard ngăn double-unsubscribe (cleanupAll + activeListeners forEach).
 *   - activeListeners legacy trong app.js vẫn GIỮ làm fallback — KHÔNG xóa phase này.
 * ─────────────────────────────────────────────────────────────────────────────────────
 */

// ─────────────────────────────────────────────────────────────────
// TYPE DEFINITIONS
// ─────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} ListenerEntry
 * @property {string}           key
 * @property {string}           owner        — 'club'|'settings'|'inventory'|'students'|
 *                                             'finance'|'notif'|'attendance'|'exam'|
 *                                             'dashboard'|'legacy'
 * @property {string}           scope        — 'global' | 'tab'
 * @property {string|undefined} tabId        — tab ID nếu scope === 'tab'
 * @property {string|undefined} clubId       — [3.6B] club ID để guard cross-club orphan
 * @property {string|undefined} sessionId    — [3.6B] listener session ID
 * @property {number}           createdAt    — Date.now() khi đăng ký
 * @property {number|undefined} lastSnapshotAt — cập nhật qua markListenerSnapshot()
 * @property {number}           snapshotCount  — số lần snapshot fire
 * @property {Function}         unsubscribe
 * @property {string|undefined} reason       — lý do đăng ký
 * @property {boolean}          removed      — [3.6B] double-unsub guard
 */

// ─────────────────────────────────────────────────────────────────
// REGISTRY
// ─────────────────────────────────────────────────────────────────

/** @type {Map<string, ListenerEntry>} */
const _registry = new Map();

// ─────────────────────────────────────────────────────────────────
// METRICS — Phase 3.6B mở rộng
// ─────────────────────────────────────────────────────────────────

const _metrics = {
    totalRegistered:               0,
    totalRemoved:                  0,
    // Phase 3.6 (compat alias):
    duplicatePrevented:            0,
    // Phase 3.6B mới:
    duplicateAttempted:            0,   // registerListener thấy key đã tồn tại
    duplicatePreventedBeforeCreate: 0,  // safeRegisterSnapshot chặn trước khi tạo listener
    duplicateAutoUnsubbed:         0,   // auto-unsub listener mới thành công khi duplicate
    unsubscribeErrors:             0,   // số lần unsub() ném exception
    createErrors:                  0,   // safeRegisterSnapshot: createUnsubscribe() lỗi
    legacyActiveListenerAdded:     0,   // legacyAddListener push vào _legacyList (không key)
    /** @type {Record<string, number>} owner → active count */
    byOwner:                       {},
    /** @type {Record<string, number>} scope → active count */
    byScope:                       {},
    /** @type {Record<string, number>} key → snapshot count */
    snapshotCountByKey:            {},
};

function _incByOwner(owner) {
    _metrics.byOwner[owner] = (_metrics.byOwner[owner] || 0) + 1;
}
function _decByOwner(owner) {
    if ((_metrics.byOwner[owner] || 0) > 0) _metrics.byOwner[owner]--;
}

// ─────────────────────────────────────────────────────────────────
// PHASE 3.6B CORE API
// ─────────────────────────────────────────────────────────────────

/**
 * [Phase 3.6B HARDENED] Đăng ký một Firestore listener với owner/scope metadata.
 *
 * Nếu key đã tồn tại:
 *   → tăng duplicateAttempted + duplicatePrevented (compat)
 *   → gọi unsub() trên listener MỚI để tránh orphan Firestore connection
 *   → tăng duplicateAutoUnsubbed nếu unsub thành công
 *   → return false (KHÔNG đăng ký trùng)
 *
 * KHÁC addListener(): KHÔNG auto-replace listener cũ.
 * Dùng removeListener(key) trước nếu muốn thay listener cũ chủ động.
 *
 * @param {string}   key
 * @param {Function} unsubscribe
 * @param {{
 *   owner?:     string,
 *   scope?:     string,
 *   tabId?:     string,
 *   clubId?:    string,
 *   sessionId?: string,
 *   reason?:    string
 * }} [options]
 * @returns {boolean} true nếu đăng ký thành công
 */
export function registerListener(key, unsubscribe, options = {}) {
    if (!key) return false;

    if (_registry.has(key)) {
        _metrics.duplicateAttempted++;
        _metrics.duplicatePrevented++; // backward compat alias
        console.debug('[ListenerGuard] Listener already registered:', key);

        // [3.6B] Auto-unsub listener MỚI để tránh orphan Firestore connection
        if (typeof unsubscribe === 'function') {
            try {
                unsubscribe();
                _metrics.duplicateAutoUnsubbed++;
            } catch (err) {
                _metrics.unsubscribeErrors++;
                console.warn('[ListenerGuard] Failed to auto-unsub duplicate listener:', key, err);
            }
        }
        return false;
    }

    const {
        owner     = 'legacy',
        scope     = 'global',
        tabId     = undefined,
        clubId    = (window.__store && window.__store.clubId) || undefined,
        sessionId = window.__listenerSessionId || undefined,
        reason    = undefined,
    } = options;

    /** @type {ListenerEntry} */
    const entry = {
        key,
        owner,
        scope,
        tabId,
        clubId,
        sessionId,
        createdAt:      Date.now(),
        lastSnapshotAt: undefined,
        snapshotCount:  0,
        unsubscribe:    typeof unsubscribe === 'function' ? unsubscribe : () => {},
        reason,
        removed:        false, // [3.6B] double-unsub guard
    };

    _registry.set(key, entry);
    _metrics.totalRegistered++;
    _incByOwner(owner);
    _metrics.byScope[scope] = (_metrics.byScope[scope] || 0) + 1;

    return true;
}

/**
 * [Phase 3.6B NEW] Đăng ký Firestore listener AN TOÀN.
 * Kiểm tra key TRƯỚC khi gọi onSnapshot — tránh tạo listener thừa.
 *
 * Tại sao cần:
 *   Pattern CŨ (nguy hiểm):
 *     const unsub = onSnapshot(...);   ← listener ĐÃ TẠO (Firestore connection mở)
 *     registerListener(key, unsub);    ← nếu key trùng: listener mới bị bỏ → orphan!
 *
 *   Pattern MỚI (an toàn):
 *     safeRegisterSnapshot(key, () => onSnapshot(...), options)
 *     → hasListener check TRƯỚC → không gọi onSnapshot nếu key đã tồn tại
 *     → nếu có race condition sau createUnsubscribe():
 *       registerListener() sẽ tự auto-unsub listener mới (Phase 3.6B guard)
 *
 * @param {string}   key               — unique listener key
 * @param {Function} createUnsubscribe — factory function; return value là unsubscribe fn
 * @param {{
 *   owner?:     string,
 *   scope?:     string,
 *   tabId?:     string,
 *   clubId?:    string,
 *   sessionId?: string,
 *   reason?:    string
 * }} [options]
 * @returns {boolean} true nếu listener được tạo và đăng ký thành công
 */
export function safeRegisterSnapshot(key, createUnsubscribe, options = {}) {
    if (!key || typeof createUnsubscribe !== 'function') return false;

    // Kiểm tra KEY TRƯỚC — không tạo onSnapshot nếu đã có
    if (hasListener(key)) {
        _metrics.duplicatePreventedBeforeCreate++;
        console.debug('[ListenerGuard] Prevented duplicate before creating snapshot:', key);
        return false;
    }

    let unsubscribe;
    try {
        unsubscribe = createUnsubscribe();
    } catch (err) {
        _metrics.createErrors++;
        console.error('[ListenerGuard] Failed to create snapshot listener:', key, err);
        return false;
    }

    // registerListener xử lý nếu có race condition (key xuất hiện sau createUnsubscribe)
    return registerListener(key, unsubscribe, options);
}

/**
 * Kiểm tra listener với key đã được đăng ký chưa.
 * @param {string} key
 * @returns {boolean}
 */
export function hasListener(key) {
    return _registry.has(key);
}

/**
 * [Phase 3.6B HARDENED] Hủy và xóa một listener theo key.
 *
 * Guard entry.removed = true để tránh double-unsubscribe khi:
 *   - cleanupAllListeners() chạy qua registry
 *   - activeListeners.forEach() trong app.js chạy lại cùng function
 *
 * @param {string} key
 * @param {string} [reason]
 * @returns {boolean} true nếu tìm thấy và hủy
 */
export function removeListener(key, reason) {
    if (!_registry.has(key)) return false;
    const entry = _registry.get(key);

    // [3.6B] Double-unsub guard — nếu đã removed, xóa khỏi map rồi return
    if (entry.removed) {
        _registry.delete(key);
        return false;
    }

    // Đánh dấu TRƯỚC khi gọi unsub() để tránh re-entrant issue
    entry.removed = true;

    try {
        entry.unsubscribe();
    } catch (err) {
        _metrics.unsubscribeErrors++;
    }

    _decByOwner(entry.owner);
    if ((_metrics.byScope[entry.scope] || 0) > 0) _metrics.byScope[entry.scope]--;
    _registry.delete(key);
    _metrics.totalRemoved++;
    return true;
}

/**
 * [Phase 3.6B NEW] Ghi nhận snapshot callback đã kích hoạt cho listener key.
 * Gọi từ snapshot handler đã migrate sang safeRegisterSnapshot.
 * Alias cho recordSnapshot() — tên rõ nghĩa hơn.
 *
 * @param {string} key
 */
export function markListenerSnapshot(key) {
    const entry = _registry.get(key);
    if (!entry) return;
    entry.snapshotCount++;
    entry.lastSnapshotAt = Date.now();
    _metrics.snapshotCountByKey[key] = entry.snapshotCount;
}

/**
 * Ghi nhận snapshot update (alias markListenerSnapshot — backward compat Phase 3.6).
 * @param {string} key
 */
export function recordSnapshot(key) {
    markListenerSnapshot(key);
}

/**
 * Hủy tất cả listeners có cùng owner.
 * @param {string} owner
 * @param {string} [reason]
 */
export function cleanupListenersByOwner(owner, reason) {
    const toRemove = [];
    _registry.forEach((entry, key) => {
        if (entry.owner === owner) toRemove.push(key);
    });
    toRemove.forEach(key => removeListener(key, reason));
}

/**
 * Hủy tất cả listeners có cùng scope.
 * @param {string} scope — 'global' | 'tab'
 * @param {string} [reason]
 */
export function cleanupListenersByScope(scope, reason) {
    const toRemove = [];
    _registry.forEach((entry, key) => {
        if (entry.scope === scope) toRemove.push(key);
    });
    toRemove.forEach(key => removeListener(key, reason));
}

/**
 * Hủy tất cả listeners có tabId khớp.
 * @param {string} tabId
 * @param {string} [reason]
 */
export function cleanupListenersByTabId(tabId, reason) {
    const toRemove = [];
    _registry.forEach((entry, key) => {
        if (entry.tabId === tabId) toRemove.push(key);
    });
    toRemove.forEach(key => removeListener(key, reason));
}

/**
 * [Phase 3.6B HARDENED] Hủy TẤT CẢ listeners — gọi khi logout hoặc đổi club.
 *
 * An toàn hơn Phase 3.6:
 *   - entry.removed guard ngăn double-unsub với activeListeners legacy trong app.js
 *   - cleanup cả registry lẫn _legacyList
 *   - Reset window.__listenerSessionId sau logout/club-switch
 *   - activeCount về 0 sau khi chạy
 *
 * @param {string} [reason]
 */
export function cleanupAllListeners(reason) {
    const keys = Array.from(_registry.keys());
    keys.forEach(key => removeListener(key, reason));
    cleanupLegacyListeners();
    // Reset session ID sau logout để guard stale listener
    if (reason && (reason.includes('logout') || reason.includes('club-switch'))) {
        window.__listenerSessionId = null;
    }
}

// ─────────────────────────────────────────────────────────────────
// PHASE 3.6B: LEGACY BRIDGE HELPER
// ─────────────────────────────────────────────────────────────────

/**
 * [Phase 3.6B NEW] Bridge helper: thêm listener vào registry nếu có key,
 * hoặc vào _legacyList nếu không có key (fallback compat).
 *
 * Dùng thay cho: activeListeners.push(unsub) trong code MỚI.
 * Code cũ trong app.js vẫn dùng activeListeners.push() trực tiếp — không đổi.
 *
 * @param {Function} unsubscribe
 * @param {{
 *   key?:       string,
 *   owner?:     string,
 *   scope?:     string,
 *   tabId?:     string,
 *   clubId?:    string,
 *   sessionId?: string,
 *   reason?:    string
 * }} [meta]
 * @returns {boolean}
 */
export function legacyAddListener(unsubscribe, meta = {}) {
    if (typeof unsubscribe !== 'function') return false;

    if (meta.key) {
        return registerListener(meta.key, unsubscribe, meta);
    }

    // Không có key → fallback legacy list
    _metrics.legacyActiveListenerAdded++;
    _legacyList.push(unsubscribe);
    return true;
}

// ─────────────────────────────────────────────────────────────────
// METRICS & DEBUG
// ─────────────────────────────────────────────────────────────────

/**
 * Trả về metrics object đầy đủ (deep copy nhẹ).
 *
 * @returns {{
 *   totalRegistered:                number,
 *   totalRemoved:                   number,
 *   duplicatePrevented:             number,
 *   duplicateAttempted:             number,
 *   duplicatePreventedBeforeCreate: number,
 *   duplicateAutoUnsubbed:          number,
 *   unsubscribeErrors:              number,
 *   createErrors:                   number,
 *   legacyActiveListeners:          number,
 *   legacyActiveListenerAdded:      number,
 *   activeCount:                    number,
 *   byOwner:                        Record<string,number>,
 *   byScope:                        Record<string,number>,
 *   snapshotCountByKey:             Record<string,number>,
 *   activeEntries:                  Array<object>
 * }}
 */
export function getListenerMetrics() {
    const active = [];
    _registry.forEach((entry, key) => {
        active.push({
            key,
            owner:         entry.owner,
            scope:         entry.scope,
            tabId:         entry.tabId     || '',
            clubId:        entry.clubId    || '',
            sessionId:     entry.sessionId || '',
            snapshotCount: entry.snapshotCount,
            ageMs:         Date.now() - entry.createdAt,
            lastSnapAgo:   entry.lastSnapshotAt
                               ? Math.round((Date.now() - entry.lastSnapshotAt) / 1000) + 's'
                               : 'never',
            reason:        entry.reason  || '',
            removed:       entry.removed,
        });
    });
    return {
        totalRegistered:               _metrics.totalRegistered,
        totalRemoved:                  _metrics.totalRemoved,
        duplicatePrevented:            _metrics.duplicatePrevented,
        duplicateAttempted:            _metrics.duplicateAttempted,
        duplicatePreventedBeforeCreate: _metrics.duplicatePreventedBeforeCreate,
        duplicateAutoUnsubbed:         _metrics.duplicateAutoUnsubbed,
        unsubscribeErrors:             _metrics.unsubscribeErrors,
        createErrors:                  _metrics.createErrors,
        legacyActiveListeners:         _legacyList.length,
        legacyActiveListenerAdded:     _metrics.legacyActiveListenerAdded,
        activeCount:                   _registry.size,
        byOwner:                       { ..._metrics.byOwner },
        byScope:                       { ..._metrics.byScope },
        snapshotCountByKey:            { ..._metrics.snapshotCountByKey },
        activeEntries:                 active,
    };
}

/**
 * In metrics ra console dạng table — Phase 3.6B mở rộng.
 * Gọi: window.printListenerMetrics()
 */
export function printListenerMetrics() {
    const m = getListenerMetrics();
    console.group('%c[ListenerMetrics] Phase 3.6B — Listener Registration Safety', 'color:#6366f1;font-weight:bold');

    console.log('%c── Totals ──', 'color:#94a3b8;font-size:11px');
    console.log('totalRegistered:               ', m.totalRegistered);
    console.log('totalRemoved:                  ', m.totalRemoved);
    console.log('activeCount (registry):        ', m.activeCount);
    console.log('legacyActiveListeners:         ', m.legacyActiveListeners);

    console.log('%c── Duplicate Guard (3.6B) ──', 'color:#94a3b8;font-size:11px');
    console.log('duplicateAttempted:            ', m.duplicateAttempted,
        m.duplicateAttempted > 0 ? '⚠️ key trùng khi registerListener gọi' : '✅');
    console.log('duplicatePreventedBeforeCreate:', m.duplicatePreventedBeforeCreate,
        m.duplicatePreventedBeforeCreate > 0 ? '🛡 safeRegisterSnapshot chặn sớm' : '✅');
    console.log('duplicateAutoUnsubbed:         ', m.duplicateAutoUnsubbed,
        m.duplicateAutoUnsubbed > 0 ? '♻️ orphan listener đã cleanup' : '✅');
    console.log('unsubscribeErrors:             ', m.unsubscribeErrors,
        m.unsubscribeErrors > 0 ? '❌' : '✅');
    console.log('createErrors:                  ', m.createErrors,
        m.createErrors > 0 ? '❌' : '✅');
    console.log('legacyActiveListenerAdded:     ', m.legacyActiveListenerAdded);

    console.log('%c── By Owner / Scope ──', 'color:#94a3b8;font-size:11px');
    console.log('byOwner:', m.byOwner);
    console.log('byScope:', m.byScope);

    if (Object.keys(m.snapshotCountByKey).length > 0) {
        console.log('%c── Snapshot Activity ──', 'color:#94a3b8;font-size:11px');
        console.log('snapshotCountByKey:', m.snapshotCountByKey);
    }

    if (m.activeEntries.length > 0) {
        console.log('%c── Active Listeners ──', 'color:#94a3b8;font-size:11px');
        console.table(m.activeEntries);
    } else {
        console.log('(no active listeners in registry)');
    }

    if (m.duplicateAttempted > 0) {
        console.warn('[ListenerGuard] 💡 duplicateAttempted > 0 — switch tab đang tạo listener trùng. Kiểm tra safeRegisterSnapshot đã dùng chưa.');
    }
    console.groupEnd();
}

// ─────────────────────────────────────────────────────────────────
// BACKWARD COMPAT API (Phase 2g/3.6 bridge — giữ nguyên signature)
// ─────────────────────────────────────────────────────────────────

/**
 * Đăng ký một Firestore listener theo key (backward compat).
 * Nếu key đã tồn tại → hủy listener cũ TRƯỚC khi đăng ký mới.
 * (Khác registerListener(): addListener() AUTO-REPLACE, không guard duplicate.)
 *
 * @param {string}   key
 * @param {Function} unsub
 */
export function addListener(key, unsub) {
    if (_registry.has(key)) {
        removeListener(key, 'addListener-replace');
    }
    registerListener(key, unsub, {
        owner:  'legacy',
        scope:  'global',
        reason: 'addListener-compat',
    });
}

/**
 * Hủy tất cả listeners trong registry (backward compat — không cleanup legacy list).
 */
export function cleanupListeners() {
    const keys = Array.from(_registry.keys());
    keys.forEach(key => removeListener(key, 'cleanupListeners-compat'));
}

/**
 * Hủy CẢ HAI: key registry + legacy list (backward compat).
 */
export function cleanupAll() {
    cleanupAllListeners('cleanupAll-compat');
}

/**
 * Trả về danh sách keys đang active.
 * @returns {string[]}
 */
export function getActiveKeys() {
    return Array.from(_registry.keys());
}

/**
 * Số lượng listeners đang active trong registry.
 * @returns {number}
 */
export function listenerCount() {
    return _registry.size;
}

// ─────────────────────────────────────────────────────────────────
// LEGACY ARRAY API (Phase 2g bridge — giữ nguyên)
// ─────────────────────────────────────────────────────────────────

/** @type {Function[]} */
const _legacyList = [];

/**
 * Thêm unsubscribe vào legacy list (tương thích pattern cũ activeListeners.push()).
 * @param {Function} unsub
 */
export function pushLegacyListener(unsub) {
    _legacyList.push(unsub);
}

/**
 * Hủy tất cả listeners trong legacy list.
 * Bọc try/catch — không crash app khi một unsub lỗi.
 */
export function cleanupLegacyListeners() {
    _legacyList.forEach(fn => { try { fn && fn(); } catch (_) {} });
    _legacyList.length = 0;
}
