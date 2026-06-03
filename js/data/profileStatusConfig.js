/**
 * js/data/profileStatusConfig.js — Phase 3.7C
 * ────────────────────────────────────────────────────────────────
 * PROFILE_STATUS_CONFIG tập trung — source-of-truth cho status values.
 *
 * MỤC ĐÍCH:
 *   Thay thế hardcoded arrays ['active','trial'] / ['quit','inactive'] rải
 *   rác khắp codebase bằng một config duy nhất, có thể điều chỉnh runtime
 *   mà không đổi Firestore schema hay ghi ngược database.
 *
 * PHÂN BIỆT:
 *   queryValues  — giá trị dùng cho Firestore where('status', 'in', [...])
 *                  Giới hạn Firestore 'in': tối đa 10 phần tử (SDK v9)
 *                  Nên dùng giá trị đơn giản, ASCII để tránh index issue
 *   aliases      — giá trị dùng khi classify profile từ full getDocs fallback
 *                  Bao gồm biến thể tiếng Việt, không đưa vào Firestore query
 *
 * API:
 *   getProfileStatusConfig()            — trả config hiện tại (read-only copy)
 *   setProfileStatusConfigForDebug()    — override runtime (không ghi Firestore)
 *   getActiveQueryValues()              — values an toàn cho Firestore query
 *   getQuitQueryValues()                — values an toàn cho Firestore query
 *   classifyProfileStatus(profile)      — phân loại: 'active'|'quit'|'other'
 *
 * KHÔNG:
 *   - Ghi ngược Firestore
 *   - Log dữ liệu cá nhân
 *   - Thay đổi database schema
 * ────────────────────────────────────────────────────────────────
 */

// ─────────────────────────────────────────────────────────────────────────────
// DEFAULT CONFIG (immutable reference)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Default config — không đổi trực tiếp.
 * Dùng setProfileStatusConfigForDebug() để override runtime.
 */
const PROFILE_STATUS_CONFIG_DEFAULT = Object.freeze({
    /**
     * Giá trị Firestore query cho active profiles.
     * Dùng where('status', 'in', activeQueryValues).
     * Giới hạn: ≤10 phần tử (Firestore SDK v9 limit).
     */
    activeQueryValues: ['active', 'trial'],

    /**
     * Giá trị Firestore query cho quit profiles.
     */
    quitQueryValues: ['quit', 'inactive'],

    /**
     * Aliases khi classify profile từ full getDocs / store.
     * Bao gồm tiếng Việt / biến thể không chuẩn.
     * KHÔNG đưa vào Firestore where('in') — chỉ dùng ở tầng classify.
     */
    activeAliases: [
        'đang tập', 'dang tap', 'dangtap',
        'training', 'current', 'active',
    ],

    /**
     * Aliases quit.
     */
    quitAliases: [
        'đã nghỉ', 'da nghi', 'nghỉ', 'nghi',
        'stopped', 'left', 'quit', 'inactive',
    ],

    /**
     * Tối đa số values trong Firestore 'in' query.
     * Firestore SDK v9 giới hạn 10 — đặt 8 để có buffer.
     */
    maxFirestoreInValues: 8,
});

// ─────────────────────────────────────────────────────────────────────────────
// MUTABLE RUNTIME CONFIG
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Runtime config — có thể thay đổi qua setProfileStatusConfigForDebug().
 * Khởi tạo từ default, merge khi debug override.
 */
let _config = { ...PROFILE_STATUS_CONFIG_DEFAULT };

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Trả về bản copy của config hiện tại (read-only).
 * Dùng để inspect qua console hay debug.
 *
 * @returns {object}
 */
export function getProfileStatusConfig() {
    return {
        activeQueryValues:  [...(_config.activeQueryValues  || [])],
        quitQueryValues:    [...(_config.quitQueryValues    || [])],
        activeAliases:      [...(_config.activeAliases      || [])],
        quitAliases:        [...(_config.quitAliases        || [])],
        maxFirestoreInValues: _config.maxFirestoreInValues  || 8,
        _isDefaultConfig:   JSON.stringify(_config) === JSON.stringify(PROFILE_STATUS_CONFIG_DEFAULT),
    };
}

/**
 * Override config runtime — chỉ dùng để debug / test.
 * KHÔNG ghi Firestore. KHÔNG persist qua reload.
 * App sẽ tự dùng config mới từ lần query tiếp theo.
 *
 * Ví dụ:
 *   window.setProfileStatusConfigForDebug({ activeQueryValues: ['active'] })
 *   → Active query chỉ dùng 'active', bỏ 'trial'
 *
 * @param {Partial<typeof PROFILE_STATUS_CONFIG_DEFAULT>} partialConfig
 */
export function setProfileStatusConfigForDebug(partialConfig) {
    if (!partialConfig || typeof partialConfig !== 'object') {
        console.warn('[ProfileStatusConfig] setProfileStatusConfigForDebug: invalid input');
        return;
    }

    // Validate: không cho inject giá trị quá dài
    const safe = {};
    if (Array.isArray(partialConfig.activeQueryValues)) {
        const limited = partialConfig.activeQueryValues.slice(0, _config.maxFirestoreInValues);
        safe.activeQueryValues = limited.filter(v => typeof v === 'string' && v.length <= 50);
    }
    if (Array.isArray(partialConfig.quitQueryValues)) {
        const limited = partialConfig.quitQueryValues.slice(0, _config.maxFirestoreInValues);
        safe.quitQueryValues = limited.filter(v => typeof v === 'string' && v.length <= 50);
    }
    if (Array.isArray(partialConfig.activeAliases)) {
        safe.activeAliases = partialConfig.activeAliases.filter(v => typeof v === 'string' && v.length <= 50);
    }
    if (Array.isArray(partialConfig.quitAliases)) {
        safe.quitAliases = partialConfig.quitAliases.filter(v => typeof v === 'string' && v.length <= 50);
    }
    if (typeof partialConfig.maxFirestoreInValues === 'number') {
        safe.maxFirestoreInValues = Math.min(10, Math.max(1, partialConfig.maxFirestoreInValues));
    }

    _config = { ..._config, ...safe };
    console.debug('[ProfileStatusConfig] Config overridden (runtime only):', {
        activeQueryValues: _config.activeQueryValues,
        quitQueryValues:   _config.quitQueryValues,
    });
}

/**
 * Trả về active status values an toàn cho Firestore 'in' query.
 * Giới hạn số lượng theo maxFirestoreInValues.
 *
 * @returns {string[]} — ví dụ: ['active', 'trial']
 */
export function getActiveQueryValues() {
    const vals = _config.activeQueryValues || ['active', 'trial'];
    return vals.slice(0, _config.maxFirestoreInValues || 8);
}

/**
 * Alias của getActiveQueryValues — backward compat với Phase 3.7B.
 * profiles.listeners.js cũ dùng getActiveStatusValues().
 *
 * @returns {string[]}
 */
export function getActiveStatusValues() {
    return getActiveQueryValues();
}

/**
 * Trả về quit status values an toàn cho Firestore 'in' query.
 *
 * @returns {string[]} — ví dụ: ['quit', 'inactive']
 */
export function getQuitQueryValues() {
    const vals = _config.quitQueryValues || ['quit', 'inactive'];
    return vals.slice(0, _config.maxFirestoreInValues || 8);
}

/**
 * Alias của getQuitQueryValues — backward compat với Phase 3.7B.
 *
 * @returns {string[]}
 */
export function getQuitStatusValues() {
    return getQuitQueryValues();
}

/**
 * Phân loại profile theo status — dùng config + aliases.
 *
 * Thứ tự ưu tiên:
 *   1. Khớp chính xác với activeQueryValues / quitQueryValues
 *   2. Khớp với activeAliases / quitAliases (lowercase, trim)
 *   3. Khớp substring tiếng Việt dự phòng
 *   4. 'other' nếu không khớp
 *
 * KHÔNG log thông tin profile cá nhân.
 *
 * @param {{ status?: string } | null | undefined} profile
 * @returns {'active' | 'quit' | 'other'}
 */
export function classifyProfileStatus(profile) {
    const raw    = profile?.status;
    const status = String(raw ?? '').toLowerCase().trim();

    // Phase 4K-DATA-HYDRATION-FINAL2:
    // Dữ liệu legacy nhiều CLB chưa có field `status`. Nếu trả về `other`,
    // active listener / renderer sẽ coi như không có võ sinh đang tập. Vì vậy:
    // - Nếu có dấu hiệu nghỉ → quit.
    // - Nếu không có dấu hiệu nghỉ → active-like để tương thích dữ liệu cũ.
    if (!status) {
        const quitLike = profile?.quit === true || profile?.stopped === true || profile?.retired === true ||
            profile?.isActive === false || profile?.active === false || !!profile?.quitDate || !!profile?.leftDate;
        return quitLike ? 'quit' : 'active';
    }

    // ── Exact match: activeQueryValues ──────────────────────────────────
    const activeQ = _config.activeQueryValues || ['active', 'trial'];
    if (activeQ.some(v => v.toLowerCase() === status)) return 'active';

    // ── Exact match: quitQueryValues ─────────────────────────────────────
    const quitQ = _config.quitQueryValues || ['quit', 'inactive'];
    if (quitQ.some(v => v.toLowerCase() === status)) return 'quit';

    // ── Alias match: active ──────────────────────────────────────────────
    const activeA = _config.activeAliases || [];
    if (activeA.some(v => v.toLowerCase() === status)) return 'active';

    // ── Alias match: quit ────────────────────────────────────────────────
    const quitA = _config.quitAliases || [];
    if (quitA.some(v => v.toLowerCase() === status)) return 'quit';

    // ── Substring fallback: tiếng Việt dự phòng ─────────────────────────
    if (status.includes('đang') || status.includes('dang')) return 'active';
    if (status.includes('nghỉ') || status.includes('nghi') || status.includes('stop') || status.includes('left')) return 'quit';

    return 'other';
}

/**
 * Trả về default config (bất biến) — dùng để reset về default.
 * @returns {object}
 */
export function getDefaultProfileStatusConfig() {
    return { ...PROFILE_STATUS_CONFIG_DEFAULT };
}

/**
 * Reset về default config.
 * Dùng sau khi test xong setProfileStatusConfigForDebug.
 */
export function resetProfileStatusConfig() {
    _config = { ...PROFILE_STATUS_CONFIG_DEFAULT };
    console.debug('[ProfileStatusConfig] Reset to default config');
}
