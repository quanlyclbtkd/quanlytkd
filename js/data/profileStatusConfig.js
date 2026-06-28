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
    quitQueryValues: ['quit', 'inactive', 'retired'],

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
        'nghỉ tập', 'nghi tap', 'nghỉ hẳn', 'nghi han',
        'dừng tập', 'dung tap', 'ngừng tập', 'ngung tap',
        'bỏ tập', 'bo tap', 'thôi tập', 'thoi tap',
        'stopped', 'left', 'quit', 'inactive',
        'retired', 'stop', 'leave',
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

function _foldStatusText(value) {
    return String(value ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
}

/**
 * Nhận diện trạng thái báo nghỉ/miễn học phí theo tháng.
 * Đây KHÔNG phải là nghỉ tập hẳn, vì vậy không được đưa vào tab Đã nghỉ
 * và không được làm ẩn võ sinh khỏi tab Đang tập/Báo nghỉ tháng.
 */
export function isMonthlySkipStatusValue(value) {
    const folded = _foldStatusText(value);
    if (!folded) return false;
    return /\b(bao nghi|nghi thang|tam nghi thang|mien hoc phi|mien phi|bao nghi thang|xin nghi thang)\b/.test(folded)
        || folded === 'bao nghi'
        || folded === 'bao nghi thang'
        || folded === 'nghi thang'
        || folded === 'tam nghi thang';
}

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
 * Phân loại profile theo status — dùng config + aliases + boolean flags.
 *
 * Thứ tự ưu tiên:
 *   1. Boolean quit flags (quit/stopped/isQuit/active=false/isActive=false)
 *   2. Boolean active flags (active=true/isActive=true)
 *   3. Khớp chính xác với quitQueryValues (explicit quit string)
 *   4. Khớp chính xác với activeQueryValues
 *   5. Khớp với aliases (lowercase, trim)
 *   6. Khớp substring tiếng Việt dự phòng
 *   7. Status rỗng/thiếu → 'active' (legacy compat)
 *   8. Unknown status → 'active' (legacy compat)
 *
 * Legacy profiles without status are treated as active unless explicitly quit.
 *
 * KHÔNG log thông tin profile cá nhân.
 *
 * @param {{ status?: string, quit?: boolean, stopped?: boolean, isQuit?: boolean,
 *            active?: boolean, isActive?: boolean } | null | undefined} profile
 * @returns {'active' | 'quit' | 'other'}
 */
export function classifyProfileStatus(profile) {
    if (!profile) return 'active';

    // ── 1. Boolean/date quit signals — kiểm tra trước status string ──────────
    // Legacy profiles without status are treated as active unless explicitly quit.
    if (profile.quit === true || profile.stopped === true || profile.isQuit === true) return 'quit';
    if (profile.active === false || profile.isActive === false) return 'quit';

    // Phase 4K-6V4B3: quitDate là tín hiệu canonical do app ghi khi chuyển Nghỉ.
    // Một số hồ sơ cũ chỉ có quitDate/ngayNghi mà thiếu status=quit, nên nếu
    // không nhận diện ở classifier thì lazy query quitDate!=null vẫn bị reject.
    const _dateQuitFields = ['quitDate', 'stoppedDate', 'leftDate', 'inactiveDate', 'nghiDate', 'ngayNghi'];
    for (const _field of _dateQuitFields) {
        const _value = profile[_field];
        if (_value !== undefined && _value !== null && _value !== false && String(_value).trim() !== '') return 'quit';
    }

    // ── 2. Boolean active signals ─────────────────────────────────────────────
    // Nhưng vẫn kiểm tra status string để phát hiện explicit quit (quit > active)
    if (profile.active === true || profile.isActive === true) {
        const _rawQ = String(profile.status ?? '').toLowerCase().trim();
        const _quitQ = _config.quitQueryValues || ['quit', 'inactive'];
        if (_quitQ.some(v => v.toLowerCase() === _rawQ)) return 'quit';
        if (isMonthlySkipStatusValue(_rawQ)) return 'active';
        if (_rawQ.includes('đã nghỉ') || _rawQ.includes('da nghi') || _rawQ.includes('nghỉ tập') || _rawQ.includes('nghi tap') || _rawQ.includes('nghỉ hẳn') || _rawQ.includes('nghi han') || _rawQ.includes('dừng tập') || _rawQ.includes('dung tap') || _rawQ.includes('bỏ tập') || _rawQ.includes('bo tap')) return 'quit';
        return 'active';
    }

    const raw    = profile?.status;
    const status = String(raw ?? '').toLowerCase().trim();
    if (isMonthlySkipStatusValue(status)) return 'active';

    // ── 3. Status rỗng/thiếu → active (legacy compat) ───────────────────────
    // Legacy profiles without status are treated as active unless explicitly quit.
    if (!status) return 'active';

    // ── 4. Explicit quit string — kiểm tra trước active để quit > active ─────
    const quitQ = _config.quitQueryValues || ['quit', 'inactive'];
    if (quitQ.some(v => v.toLowerCase() === status)) return 'quit';

    // ── 5. Exact match: activeQueryValues ────────────────────────────────────
    const activeQ = _config.activeQueryValues || ['active', 'trial'];
    if (activeQ.some(v => v.toLowerCase() === status)) return 'active';

    // ── 6. Alias match: quit ─────────────────────────────────────────────────
    const quitA = _config.quitAliases || [];
    if (quitA.some(v => v.toLowerCase() === status)) return 'quit';

    // ── 7. Alias match: active ───────────────────────────────────────────────
    const activeA = _config.activeAliases || [];
    if (activeA.some(v => v.toLowerCase() === status)) return 'active';

    // ── 8. Substring fallback: tiếng Việt dự phòng ──────────────────────────
    if (status.includes('đang') || status.includes('dang')) return 'active';
    if (isMonthlySkipStatusValue(status)) return 'active';
    if (status.includes('đã nghỉ') || status.includes('da nghi') || status.includes('nghỉ tập') || status.includes('nghi tap') || status.includes('nghỉ hẳn') || status.includes('nghi han') || status.includes('dừng tập') || status.includes('dung tap') || status.includes('ngừng tập') || status.includes('ngung tap') || status.includes('bỏ tập') || status.includes('bo tap') || status.includes('thôi tập') || status.includes('thoi tap') || status.includes('stop') || status.includes('left')) return 'quit';

    // ── 9. Unknown status → active (legacy compat, không phải 'other') ───────
    // Legacy profiles without recognizable status are treated as active.
    return 'active';
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
