/**
 * inventoryStore.js — Phase 4K-6V2: Complete Active Debt Ownership + Identity Index
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * Phase 3.7C: tạo nền tảng store.
 * Phase 3.8A: gắn vào snapshot callbacks + feature guards + metrics.
 * Phase 3.8B: derive công nợ kho đồ + debt index + helper lookup nhanh.
 * Phase 3.8C: track trạng thái unpaid debt query riêng.
 * Phase 4K-6V2: complete active-debt listener + profileId/memberId/name index.
 *
 * SCHEMA inventory doc (Firestore — không đổi):
 *   id:          string   — document ID
 *   type:        string   — 'Xuất bán' | 'Nhập kho'
 *   unpaid:      boolean  — true nếu chưa thu tiền
 *   desc:        string   — tên võ sinh (primary student name field)
 *   description: string   — tên võ sinh (fallback field)
 *   category:    string   — 'Võ phục' | 'Áo thun' | 'Bảo hộ' | custom
 *   size:        string   — kích cỡ
 *   qty:         number   — số lượng
 *   amount:      number   — tiền
 *   date:        string   — YYYY-MM-DD
 *   timestamp:   number
 *
 * Lưu ý quan trọng:
 *   - Dữ liệu mới có thể có profileId/memberId; dữ liệu cũ tiếp tục liên kết bằng tên.
 *   - Debt detection: unpaid/pending; tương thích type Xuất bán/Bán nợ/Xuất cũ
 *   - Student match: t.desc === name || t.description === name (exact → normalize cả hai vế)
 *   - Index: keyed by normalizedName (lowercase + trim + collapse spaces)
 *   - Không làm sai kết quả nghiệp vụ, không đổi Firestore schema, không gọi Firestore.
 *
 * NGUYÊN TẮC:
 *   - Store KHÔNG tự query Firestore — chỉ nhận push từ snapshot callbacks.
 *   - rebuildInventoryDebtIndex() chỉ gọi một lần sau snapshot — KHÔNG rebuild trong vòng render.
 *   - Mọi helper đều an toàn với null/undefined input.
 *   - Không log tên võ sinh, SĐT, CCCD.
 * ──────────────────────────────────────────────────────────────────────────────────────
 */

// ── Store nội bộ ─────────────────────────────────────────────────────────────
const _store = {
    inventoryStats:           null,
    financeInventoryDebts:    null,
    inventoryHistory:         null,
    inventoryHistoryLoaded:   false,
    financeDebtLoaded:        false,
    // [Phase 4K-6V2] Complete active-debt listener state — độc lập lịch sử phân trang
    unpaidDebtQueryLoaded:    false,  // true sau snapshot where(unpaid==true) thành công
    unpaidDebtQueryDocCount:  0,      // số debt docs từ authoritative listener
    unpaidDebtQueryFailed:    false,  // true nếu active-debt listener lỗi
    inventoryDebtCompleteness:'unmounted', // unmounted | loading | complete | partial | failed
    version:                  0,
    lastUpdatedAt:            null,
};

// ── Debt index nội bộ ─────────────────────────────────────────────────────────
const _debtIndex = {
    byProfileId:      new Map(),    // profileId → Array<debtItem>
    byMemberId:       new Map(),    // memberId → Array<debtItem>
    byNormalizedName: new Map(),    // normalizedName → Array<debtItem>
    isReady:          false,
    buildCount:       0,
    lastBuildAt:      null,
    lastBuildDuration: 0,           // ms
};

// ── Metrics nội bộ ───────────────────────────────────────────────────────────
const _metrics = {
    // Write counts
    setInventoryStatsCount:        0,
    // [Phase 3.8C]
    unpaidDebtQueryCount:          0,   // số lần markUnpaidDebtQueryLoaded gọi
    unpaidDebtQueryFailedCount:    0,   // số lần query lỗi/fallback
    setFinanceInventoryDebtsCount: 0,
    setInventoryHistoryCount:      0,
    setAllInventoryCount:          0,
    // Derive counts
    deriveFinanceDebtCount:        0,
    lastDebtDeriveReason:          null,
    // Index counts
    indexBuildCount:               0,
    indexBuildDuration:            0,
    lastDebtIndexBuildAt:          null,
    // Lookup counts
    lookupCount:                   0,
    lookupByName:                  0,
    lookupFallbackCount:           0,
    lookupMissCount:               0,
    // Read/fallback
    getAllInventoryCompatCalls:     0,
    fallbackToLegacyAllInventoryCount: 0,
    // Ensure calls
    ensureFeatureCalls:            0,
    ensureFeatureByFeature:        {},
    lastFeature:                   null,
    lastReason:                    null,
    lastUpdatedAt:                 null,
};

// ── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Normalize tên võ sinh để dùng làm index key.
 * Chỉ: trim + lowercase + collapse whitespace.
 * Không bỏ dấu tiếng Việt (rủi ro mất phân biệt tên).
 *
 * @param {string|null|undefined} value
 * @returns {string}
 */
export function normalizeStudentKey(value) {
    if (!value) return '';
    return String(value).trim().toLowerCase().replace(/\s+/g, ' ');
}

function _getCompatArray() {
    if (window.__store && Array.isArray(window.__store.inventory)
            && window.__store.inventory.length > 0) {
        return window.__store.inventory;
    }
    if (Array.isArray(_store.inventoryHistory) && _store.inventoryHistory.length > 0) {
        return _store.inventoryHistory;
    }
    if (Array.isArray(window.allInventory)) return window.allInventory;
    return [];
}

function _getLegacyCount() {
    try {
        const leg = (window.__store && window.__store.inventory) || window.allInventory;
        return Array.isArray(leg) ? leg.length : 0;
    } catch (_) { return 0; }
}

/**
 * Resolve student name string from a flexible input.
 * Dữ liệu mới ưu tiên profileId/memberId; dữ liệu cũ tiếp tục fallback theo tên.
 *
 * @param {string|Object|null} studentOrProfile
 * @returns {string} — student name or ''
 */
function _resolveStudentIdentity(studentOrProfile) {
    if (!studentOrProfile) return { profileId: '', memberId: '', name: '' };
    if (typeof studentOrProfile === 'string') {
        return { profileId: '', memberId: '', name: studentOrProfile.trim() };
    }
    if (typeof studentOrProfile === 'object') {
        const explicitName = studentOrProfile.name || studentOrProfile.studentName ||
            studentOrProfile.profileName || studentOrProfile.displayName || '';
        const explicitProfileId = studentOrProfile.profileId || studentOrProfile.docId ||
            studentOrProfile.id || '';
        return {
            profileId: String(explicitProfileId || '').trim(),
            memberId:  String(studentOrProfile.memberId || studentOrProfile.memberCode || '').trim(),
            name:      String(explicitName || explicitProfileId || '').trim(),
        };
    }
    return { profileId: '', memberId: '', name: '' };
}

function _resolveStudentName(studentOrProfile) {
    return _resolveStudentIdentity(studentOrProfile).name;
}

/**
 * Nhận diện khoản công nợ kho đang hoạt động.
 * Query Firestore đã lọc unpaid === true; hàm này vẫn tương thích dữ liệu cũ
 * có type không đồng nhất và các cờ pending/unpaid trước đây.
 */
export function isActiveInventoryDebt(item) {
    if (!item || typeof item !== 'object') return false;
    const pending = item.unpaid === true ||
        item.inventoryDebtStatus === 'pending' ||
        item.paymentStatus === 'unpaid';
    if (!pending) return false;

    const type = normalizeStudentKey(item.type || item.transactionType || '')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd');
    // Với dữ liệu mới: Xuất bán. Với dữ liệu cũ: Bán nợ/Xuất/Bán hàng.
    // Nếu cờ unpaid đã được ghi rõ nhưng type trống/khác, vẫn giữ để không bỏ sót nợ.
    return !type || type.includes('xuat ban') || type.includes('ban no') ||
        type.includes('ban hang') || type === 'xuat' || item.unpaid === true;
}

function _decorateDebtItem(item) {
    const rawName  = item.desc || item.description || item.studentName || item.name || '';
    const profileId = String(item.profileId || item.studentProfileId || '').trim();
    const memberId  = String(item.memberId || item.memberCode || '').trim();
    const normName  = normalizeStudentKey(rawName);
    return {
        ...item,
        _debtKey:        item.id || (profileId || memberId || normName) + '|' + (item.date || ''),
        _studentKey:     rawName,
        _studentName:    rawName,
        _normalizedName: normName,
        _profileId:      profileId || null,
        _memberId:       memberId || null,
        _amount:         Number(item.amount || 0),
    };
}

function _updateMetrics() {
    _metrics.lastUpdatedAt = Date.now();
    _store.lastUpdatedAt   = _metrics.lastUpdatedAt;

    if (typeof window === 'undefined') return;
    if (!window.__inventoryDependencyMetrics) return;

    const compat   = _getCompatArray();
    const debtArr  = Array.isArray(_store.financeInventoryDebts) ? _store.financeInventoryDebts : [];
    const statsKeys = _store.inventoryStats ? Object.keys(_store.inventoryStats) : [];

    Object.assign(window.__inventoryDependencyMetrics, {
        // Store state
        inventoryStatsLoaded:           _store.inventoryStats !== null,
        inventoryStatsKeys:             statsKeys,
        financeInventoryDebtCount:      debtArr.length,
        inventoryHistoryLoaded:         _store.inventoryHistoryLoaded,
        inventoryHistoryCount:          Array.isArray(_store.inventoryHistory)
            ? _store.inventoryHistory.length : 0,
        allInventoryCompatCount:        compat.length,
        legacyAllInventoryCount:        _getLegacyCount(),
        version:                        _store.version,
        lastUpdatedAt:                  _store.lastUpdatedAt,
        // Write metrics
        setInventoryStatsCount:         _metrics.setInventoryStatsCount,
        setFinanceInventoryDebtsCount:  _metrics.setFinanceInventoryDebtsCount,
        setInventoryHistoryCount:       _metrics.setInventoryHistoryCount,
        setAllInventoryCount:           _metrics.setAllInventoryCount,
        // Derive metrics
        deriveFinanceDebtCount:         _metrics.deriveFinanceDebtCount,
        lastDebtDeriveReason:           _metrics.lastDebtDeriveReason,
        // Index metrics
        inventoryDebtIndexReady:        _debtIndex.isReady,
        inventoryDebtIndexBuildCount:   _debtIndex.buildCount,
        inventoryDebtIndexBuildDuration: _debtIndex.lastBuildDuration,
        lastDebtIndexBuildAt:           _debtIndex.lastBuildAt,
        // Lookup metrics
        inventoryDebtLookupCount:       _metrics.lookupCount,
        inventoryDebtLookupByName:      _metrics.lookupByName,
        inventoryDebtLookupFallbackCount: _metrics.lookupFallbackCount,
        inventoryDebtLookupMissCount:   _metrics.lookupMissCount,
        // Read/fallback
        getAllInventoryCompatCalls:     _metrics.getAllInventoryCompatCalls,
        fallbackToLegacyAllInventoryCount: _metrics.fallbackToLegacyAllInventoryCount,
        // Ensure metrics
        ensureInventoryForFeatureCalls: _metrics.ensureFeatureCalls,
        ensureInventoryForFeatureByFeature: { ..._metrics.ensureFeatureByFeature },
        lastEnsureFeature:              _metrics.lastFeature,
        lastEnsureReason:               _metrics.lastReason,
        // [Phase 3.8C] Unpaid debt query state
        unpaidDebtQueryLoaded:          _store.unpaidDebtQueryLoaded,
        unpaidDebtQueryDocCount:        _store.unpaidDebtQueryDocCount,
        unpaidDebtQueryFailed:          _store.unpaidDebtQueryFailed,
        unpaidDebtQueryCount:           _metrics.unpaidDebtQueryCount,
        unpaidDebtQueryFailedCount:     _metrics.unpaidDebtQueryFailedCount,
        inventoryDebtCompleteness:      _store.inventoryDebtCompleteness,
    });
}

// ── Debt derivation ───────────────────────────────────────────────────────────

/**
 * Dẫn xuất danh sách công nợ kho đồ chưa thu từ allInventory.
 *
 * Logic xác định nợ (GIỮ NGUYÊN như app.js line 6640-6641):
 *   t.unpaid === true && t.type === 'Xuất bán'
 *
 * Thêm derived metadata (_xxx) chỉ trong memory — KHÔNG ghi Firestore.
 *
 * @param {Array} allInventory
 * @returns {Array} — derived debt items
 */
export function deriveFinanceInventoryDebts(allInventory) {
    if (!Array.isArray(allInventory) || allInventory.length === 0) return [];

    const debts = [];
    for (let i = 0; i < allInventory.length; i++) {
        const item = allInventory[i];
        if (!isActiveInventoryDebt(item)) continue;
        debts.push(_decorateDebtItem(item));
    }
    return debts;
}

/**
 * Derive + store financeInventoryDebts trong một lần gọi.
 * Dùng trong _invCb sau setAllInventory — không gọi trong render loop.
 *
 * @param {Array} allInventory
 * @param {string} [reason]
 */
export function deriveAndSetFinanceInventoryDebts(allInventory, reason) {
    const debtItems = deriveFinanceInventoryDebts(allInventory);
    _metrics.deriveFinanceDebtCount++;
    _metrics.lastDebtDeriveReason = reason || 'derive-debts';
    setFinanceInventoryDebts(debtItems, reason || 'derived-from-snapshot');
}

// ── Debt index ────────────────────────────────────────────────────────────────

/**
 * Rebuild inventory debt index từ financeInventoryDebts đã store.
 * CHỈ gọi một lần sau inventory snapshot — KHÔNG gọi trong vòng render loop.
 *
 * @param {string} [reason]
 */
export function rebuildInventoryDebtIndex(reason) {
    const t0 = performance.now();

    _debtIndex.byProfileId.clear();
    _debtIndex.byMemberId.clear();
    _debtIndex.byNormalizedName.clear();
    _debtIndex.isReady = false;

    const debts = Array.isArray(_store.financeInventoryDebts)
        ? _store.financeInventoryDebts
        : [];

    const push = (map, key, item) => {
        if (!key) return;
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(item);
    };

    for (let i = 0; i < debts.length; i++) {
        const item = debts[i]._normalizedName !== undefined
            ? debts[i]
            : _decorateDebtItem(debts[i]);
        push(_debtIndex.byProfileId, String(item._profileId || item.profileId || '').trim(), item);
        push(_debtIndex.byMemberId, String(item._memberId || item.memberId || '').trim(), item);
        push(_debtIndex.byNormalizedName, item._normalizedName || normalizeStudentKey(item.desc || item.description || ''), item);
    }

    const ms = performance.now() - t0;
    _debtIndex.isReady       = true;
    _debtIndex.buildCount++;
    _debtIndex.lastBuildAt   = Date.now();
    _debtIndex.lastBuildDuration = ms;

    _metrics.indexBuildCount      = _debtIndex.buildCount;
    _metrics.indexBuildDuration   = ms;
    _metrics.lastDebtIndexBuildAt = _debtIndex.lastBuildAt;

    if (ms > 16) {
        console.warn(`[InventoryDebtIndexSlow] rebuild took ${ms.toFixed(1)}ms (${debts.length} debt items, reason: ${reason || '—'})`);
    }

    _updateMetrics();
}

// ── Student debt lookup helpers ───────────────────────────────────────────────

/**
 * Lấy danh sách đồ còn nợ của một võ sinh.
 *
 * Ưu tiên: index → fallback filter allInventory (nếu allowFallback !== false).
 * Kết quả PHẢI bằng với:
 *   (allInventory || []).filter(t => t.unpaid===true && t.type==='Xuất bán'
 *       && (t.desc===name || t.description===name))
 *
 * @param {string|Object} studentOrProfile — name string hoặc profile object
 * @param {{ allowFallback?:boolean, reason?:string }} [options]
 * @returns {Array}
 */
export function getInventoryDebtsForStudent(studentOrProfile, options = {}) {
    const { allowFallback = true } = options;

    _metrics.lookupCount++;
    const identity = _resolveStudentIdentity(studentOrProfile);
    if (!identity.profileId && !identity.memberId && !identity.name) {
        _metrics.lookupMissCount++;
        _updateMetrics();
        return [];
    }

    if (_debtIndex.isReady) {
        let found = null;
        if (identity.profileId) found = _debtIndex.byProfileId.get(identity.profileId) || null;
        if (!found && identity.memberId) found = _debtIndex.byMemberId.get(identity.memberId) || null;
        if (!found && identity.name) {
            _metrics.lookupByName++;
            found = _debtIndex.byNormalizedName.get(normalizeStudentKey(identity.name)) || null;
        }
        if (found) {
            _updateMetrics();
            return found;
        }
        _metrics.lookupMissCount++;
        _updateMetrics();
        return [];
    }

    if (!allowFallback) {
        _metrics.lookupMissCount++;
        _updateMetrics();
        return [];
    }

    _metrics.lookupFallbackCount++;
    const src = _getCompatArray();
    const normName = normalizeStudentKey(identity.name);
    const result = src.filter(item => {
        if (!isActiveInventoryDebt(item)) return false;
        if (identity.profileId && String(item.profileId || item.studentProfileId || '') === identity.profileId) return true;
        if (identity.memberId && String(item.memberId || item.memberCode || '') === identity.memberId) return true;
        const itemName = normalizeStudentKey(item.desc || item.description || item.studentName || '');
        return !!normName && itemName === normName;
    });

    if (result.length === 0) _metrics.lookupMissCount++;
    _updateMetrics();
    return result.map(_decorateDebtItem);
}

/**
 * Lấy tổng tiền nợ kho của một võ sinh.
 *
 * @param {string|Object} studentOrProfile
 * @param {{ allowFallback?:boolean, reason?:string }} [options]
 * @returns {number}
 */
export function getInventoryDebtTotalForStudent(studentOrProfile, options = {}) {
    const items = getInventoryDebtsForStudent(studentOrProfile, options);
    return items.reduce((sum, item) => sum + (Number(item.amount || 0)), 0);
}

/**
 * Lấy summary nợ kho của một võ sinh.
 *
 * @param {string|Object} studentOrProfile
 * @param {{ allowFallback?:boolean, reason?:string }} [options]
 * @returns {{ items:Array, total:number, count:number, hasDebt:boolean }}
 */
export function getInventoryDebtSummaryForStudent(studentOrProfile, options = {}) {
    const items = getInventoryDebtsForStudent(studentOrProfile, options);
    const total = items.reduce((s, i) => s + (Number(i.amount || 0)), 0);
    return {
        items,
        total,
        count:   items.length,
        hasDebt: items.length > 0,
    };
}

// ── Write API ─────────────────────────────────────────────────────────────────

/**
 * @param {Object} stats
 * @param {string} [reason]
 */
export function setInventoryStats(stats, reason) {
    if (stats === null || stats === undefined) return;
    _store.inventoryStats = (typeof stats === 'object') ? stats : {};
    _store.version++;
    _metrics.setInventoryStatsCount++;
    _metrics.lastReason = reason || 'set-inventory-stats';
    _updateMetrics();
}

/**
 * @param {Array} items
 * @param {string} [reason]
 */
export function setFinanceInventoryDebts(items, reason) {
    if (!Array.isArray(items)) return;
    _store.financeInventoryDebts = items;
    _store.financeDebtLoaded     = true;
    _store.version++;
    _metrics.setFinanceInventoryDebtsCount++;
    _metrics.lastReason = reason || 'set-finance-debts';
    _updateMetrics();
}

/**
 * @param {Array} items
 * @param {string} [reason]
 */
export function setInventoryHistory(items, reason) {
    if (!Array.isArray(items)) return;
    _store.inventoryHistory       = items;
    _store.inventoryHistoryLoaded = true;
    _store.version++;
    _metrics.setInventoryHistoryCount++;
    _metrics.lastReason = reason || 'set-inventory-history';
    _updateMetrics();
}

/**
 * Alias của setInventoryHistory — dùng trong Phase 3.8A _invCb.
 * @param {Array} items
 * @param {string} [reason]
 */
export function setAllInventory(items, reason) {
    if (!Array.isArray(items)) return;
    _store.inventoryHistory       = items;
    _store.inventoryHistoryLoaded = true;
    _store.version++;
    _metrics.setAllInventoryCount++;
    _metrics.lastReason = reason || 'set-all-inventory';
    _updateMetrics();
}

// ── Read API ──────────────────────────────────────────────────────────────────

/** @returns {Object|null} */
export function getInventoryStats() {
    if (_store.inventoryStats !== null) return _store.inventoryStats;
    if (window.__store && window.__store.inventoryStats) return window.__store.inventoryStats;
    return null;
}

/** @returns {Array} */
export function getFinanceInventoryDebts() {
    return Array.isArray(_store.financeInventoryDebts) ? _store.financeInventoryDebts : [];
}

/** @returns {Array} */
export function getInventoryHistory() {
    return Array.isArray(_store.inventoryHistory) ? _store.inventoryHistory : getAllInventoryCompat();
}

/**
 * Compatibility bridge — ưu tiên window.__store.inventory → _store → window.allInventory.
 * Đếm fallback để đo khi nào cần migrate hoàn toàn.
 *
 * @returns {Array}
 */
export function getAllInventoryCompat() {
    _metrics.getAllInventoryCompatCalls++;

    try {
        if (window.__store && Array.isArray(window.__store.inventory)
                && window.__store.inventory.length > 0) {
            return window.__store.inventory;
        }
        if (Array.isArray(_store.inventoryHistory) && _store.inventoryHistory.length > 0) {
            return _store.inventoryHistory;
        }
        if (Array.isArray(window.allInventory)) {
            if (window.allInventory.length > 0) _metrics.fallbackToLegacyAllInventoryCount++;
            return window.allInventory;
        }
    } catch (_) {}

    return [];
}

/** @returns {boolean} */
export function isInventoryHistoryLoaded() {
    return _store.inventoryHistoryLoaded || _getLegacyCount() > 0;
}

/** @returns {boolean} */
export function isFinanceDebtLoaded() {
    return _store.financeDebtLoaded;
}

/** @returns {boolean} */
export function isInventoryDebtIndexReady() {
    return _debtIndex.isReady;
}

// ── Phase 3.8C: Unpaid Debt Query State API ───────────────────────────────────

/**
 * Gọi từ complete active-debt listener sau snapshot thành công.
 * Đánh dấu financeInventoryDebts đến từ query where(unpaid == true) đầy đủ, độc lập với lịch sử phân trang.
 *
 * @param {number} count   — số debt items từ query
 * @param {string} [reason]
 */
export function markUnpaidDebtQueryLoaded(count, reason) {
    _store.unpaidDebtQueryLoaded   = true;
    _store.unpaidDebtQueryFailed   = false;
    _store.unpaidDebtQueryDocCount = typeof count === 'number' ? count : 0;
    _store.inventoryDebtCompleteness = 'complete';
    _store.version++;
    _store.lastUpdatedAt = Date.now();
    _metrics.unpaidDebtQueryCount++;
    _updateMetrics();
}

/**
 * Gọi khi complete active-debt listener lỗi hoặc chưa thể xác nhận độ đầy đủ.
 * @param {string} [reason]
 */
export function markUnpaidDebtQueryFailed(reason) {
    _store.unpaidDebtQueryLoaded = false;
    _store.unpaidDebtQueryFailed = true;
    _store.inventoryDebtCompleteness = Array.isArray(_store.financeInventoryDebts) && _store.financeInventoryDebts.length > 0 ? 'partial' : 'failed';
    _metrics.unpaidDebtQueryFailedCount++;
    _updateMetrics();
}

/**
 * Kiểm tra xem unpaid debt đã đến từ query riêng chưa.
 * true  → financeInventoryDebts đến từ listener where(unpaid==true) — đầy đủ, độc lập lịch sử phân trang.
 * false → listener chưa sẵn sàng hoặc bị lỗi; không được xem recent history là nguồn công nợ đầy đủ.
 *
 * @returns {boolean}
 */
export function getUnpaidInventoryDebtsLoaded() {
    return _store.unpaidDebtQueryLoaded;
}

/**
 * Reset toàn bộ store về trạng thái ban đầu.
 * Gọi khi logout hoặc switch club.
 *
 * @param {string} [reason]
 */
export function resetInventoryStore(reason) {
    _store.inventoryStats         = null;
    _store.financeInventoryDebts  = null;
    _store.inventoryHistory       = null;
    _store.inventoryHistoryLoaded = false;
    _store.financeDebtLoaded      = false;
    _store.version++;
    _store.lastUpdatedAt          = null;

    _debtIndex.byProfileId.clear();
    _debtIndex.byMemberId.clear();
    _debtIndex.byNormalizedName.clear();
    _debtIndex.isReady     = false;
    _debtIndex.lastBuildAt = null;

    // [Phase 3.8C] Reset unpaid debt query state (cần query lại khi login/switch club)
    _store.unpaidDebtQueryLoaded   = false;
    _store.unpaidDebtQueryDocCount = 0;
    _store.unpaidDebtQueryFailed   = false;
    _store.inventoryDebtCompleteness = 'unmounted';

    _metrics.lastReason  = reason || 'reset';
    _metrics.lastFeature = null;
    _updateMetrics();
}

// ── Feature gate ──────────────────────────────────────────────────────────────

/**
 * Guard + metrics cho các feature cần inventory data.
 * KHÔNG block UI, KHÔNG fetch Firestore.
 * Trả về true nếu data sẵn sàng, false nếu vẫn loading.
 *
 * Feature taxonomy:
 *   'feeReceipt'    — phiếu học phí (unpaidInvItems cho công nợ kho)
 *   'debtList'      — danh sách báo nợ
 *   'financeDebt'   — thu học phí có kèm nợ kho
 *   'inventoryTab'  — tab Kho đồ
 *   'dashboard'     — dashboard summary (inventoryStats)
 *   'export'        — export/report
 *   'debtReport'    — báo cáo nợ
 *
 * @param {string} feature
 * @param {string} [reason]
 * @returns {boolean}
 */
export function ensureInventoryForFeature(feature, reason) {
    _metrics.ensureFeatureCalls++;
    const k = String(feature || 'unknown');
    _metrics.ensureFeatureByFeature[k] = (_metrics.ensureFeatureByFeature[k] || 0) + 1;
    _metrics.lastFeature = k;
    _metrics.lastReason  = reason || ('ensure:' + k);

    const compat   = _getCompatArray();
    const hasStats = getInventoryStats() !== null;
    const hasIndex = _debtIndex.isReady;

    const debtDependentFeatures = new Set(['feeReceipt', 'financeDebt', 'debtList', 'debtReport', 'inventoryTab', 'export']);
    if (debtDependentFeatures.has(k) && typeof window !== 'undefined' && typeof window.ensureInventoryDebtListener === 'function') {
        window.ensureInventoryDebtListener('feature:' + k + ':' + (_metrics.lastReason || 'ensure'));
    }

    _updateMetrics();

    switch (k) {
        case 'feeReceipt':
        case 'financeDebt':
            // [3.8C] Ưu tiên: unpaid debt query đầy đủ (không bị limit 500).
            // Fallback: index từ allInventory hoặc compat array.
            return _store.unpaidDebtQueryLoaded || hasIndex || compat.length > 0 || _store.inventoryHistoryLoaded;

        case 'debtList':
        case 'debtReport':
            // [3.8C] Báo nợ: ưu tiên unpaid debt query; fallback index/compat.
            return _store.unpaidDebtQueryLoaded || hasIndex || compat.length > 0 || _store.inventoryHistoryLoaded;

        case 'inventoryTab':
            // Tab Kho dùng allInventory recent — không cần unpaid query riêng.
            return compat.length > 0 || _store.inventoryHistoryLoaded;

        case 'dashboard':
            return hasStats;

        case 'export':
            // [3.8C] Export nên chờ unpaid debt query xong để công nợ đầy đủ.
            return (_store.unpaidDebtQueryLoaded || compat.length > 0) && hasStats;

        default:
            return compat.length > 0;
    }
}

// ── Metrics API ───────────────────────────────────────────────────────────────

/** @returns {Object} */
export function getInventoryDependencyMetrics() {
    const compat   = _getCompatArray();
    const debtArr  = Array.isArray(_store.financeInventoryDebts) ? _store.financeInventoryDebts : [];
    const statsKeys = _store.inventoryStats ? Object.keys(_store.inventoryStats) : [];

    return {
        inventoryStatsLoaded:           _store.inventoryStats !== null,
        inventoryStatsKeys:             statsKeys,
        financeInventoryDebtCount:      debtArr.length,
        inventoryHistoryLoaded:         _store.inventoryHistoryLoaded,
        inventoryHistoryCount:          Array.isArray(_store.inventoryHistory)
            ? _store.inventoryHistory.length : 0,
        allInventoryCompatCount:        compat.length,
        legacyAllInventoryCount:        _getLegacyCount(),
        version:                        _store.version,
        lastUpdatedAt:                  _store.lastUpdatedAt,
        setInventoryStatsCount:         _metrics.setInventoryStatsCount,
        setFinanceInventoryDebtsCount:  _metrics.setFinanceInventoryDebtsCount,
        setInventoryHistoryCount:       _metrics.setInventoryHistoryCount,
        setAllInventoryCount:           _metrics.setAllInventoryCount,
        deriveFinanceDebtCount:         _metrics.deriveFinanceDebtCount,
        lastDebtDeriveReason:           _metrics.lastDebtDeriveReason,
        inventoryDebtIndexReady:        _debtIndex.isReady,
        inventoryDebtIndexBuildCount:   _debtIndex.buildCount,
        inventoryDebtIndexBuildDuration: _debtIndex.lastBuildDuration,
        lastDebtIndexBuildAt:           _debtIndex.lastBuildAt,
        inventoryDebtLookupCount:       _metrics.lookupCount,
        inventoryDebtLookupByName:      _metrics.lookupByName,
        inventoryDebtLookupFallbackCount: _metrics.lookupFallbackCount,
        inventoryDebtLookupMissCount:   _metrics.lookupMissCount,
        getAllInventoryCompatCalls:      _metrics.getAllInventoryCompatCalls,
        fallbackToLegacyAllInventoryCount: _metrics.fallbackToLegacyAllInventoryCount,
        ensureInventoryForFeatureCalls:  _metrics.ensureFeatureCalls,
        ensureInventoryForFeatureByFeature: { ..._metrics.ensureFeatureByFeature },
        lastEnsureFeature:              _metrics.lastFeature,
        lastEnsureReason:               _metrics.lastReason,
        // [Phase 3.8C]
        unpaidDebtQueryLoaded:          _store.unpaidDebtQueryLoaded,
        unpaidDebtQueryDocCount:        _store.unpaidDebtQueryDocCount,
        unpaidDebtQueryFailed:          _store.unpaidDebtQueryFailed,
        unpaidDebtQueryCount:           _metrics.unpaidDebtQueryCount,
        unpaidDebtQueryFailedCount:     _metrics.unpaidDebtQueryFailedCount,
        inventoryDebtCompleteness:      _store.inventoryDebtCompleteness,
    };
}

/**
 * In metrics ra console.table.
 * KHÔNG log tên võ sinh, SĐT, CCCD.
 */
export function printInventoryDependencyMetrics() {
    const m = getInventoryDependencyMetrics();
    console.group('[InventoryStore] Dependency Metrics — Phase 3.8C');
    console.table({
        'inventoryStatsLoaded':            { value: m.inventoryStatsLoaded },
        'inventoryStatsKeys':              { value: m.inventoryStatsKeys.join(', ') || '—' },
        'financeInventoryDebtCount':       { value: m.financeInventoryDebtCount },
        'inventoryHistoryLoaded':          { value: m.inventoryHistoryLoaded },
        'inventoryHistoryCount':           { value: m.inventoryHistoryCount },
        'allInventoryCompatCount':         { value: m.allInventoryCompatCount },
        'legacyAllInventoryCount':         { value: m.legacyAllInventoryCount },
        '──── derive ────':                { value: '' },
        'deriveFinanceDebtCount':          { value: m.deriveFinanceDebtCount },
        'lastDebtDeriveReason':            { value: m.lastDebtDeriveReason || '—' },
        '──── index ────':                 { value: '' },
        'inventoryDebtIndexReady':         { value: m.inventoryDebtIndexReady },
        'inventoryDebtIndexBuildCount':    { value: m.inventoryDebtIndexBuildCount },
        'inventoryDebtIndexBuildDuration': { value: m.inventoryDebtIndexBuildDuration.toFixed(2) + 'ms' },
        '──── lookup ────':                { value: '' },
        'inventoryDebtLookupCount':        { value: m.inventoryDebtLookupCount },
        'inventoryDebtLookupByName':       { value: m.inventoryDebtLookupByName },
        'inventoryDebtLookupFallbackCount':{ value: m.inventoryDebtLookupFallbackCount },
        'inventoryDebtLookupMissCount':    { value: m.inventoryDebtLookupMissCount },
        '──── compat ────':                { value: '' },
        'getAllInventoryCompatCalls':       { value: m.getAllInventoryCompatCalls },
        'fallbackToLegacyAllInventory':    { value: m.fallbackToLegacyAllInventoryCount },
        '──── ensure ────':                { value: '' },
        'ensureFeatureCalls':              { value: m.ensureInventoryForFeatureCalls },
        'lastEnsureFeature':               { value: m.lastEnsureFeature || '—' },
        'lastEnsureReason':                { value: m.lastEnsureReason  || '—' },
        '──── unpaid query [3.8C] ────':   { value: '' },
        'unpaidDebtQueryLoaded':           { value: m.unpaidDebtQueryLoaded },
        'unpaidDebtQueryDocCount':         { value: m.unpaidDebtQueryDocCount },
        'unpaidDebtQueryFailed':           { value: m.unpaidDebtQueryFailed },
        'unpaidDebtQueryCount':            { value: m.unpaidDebtQueryCount },
        'unpaidDebtQueryFailedCount':      { value: m.unpaidDebtQueryFailedCount },
    });
    if (Object.keys(m.ensureInventoryForFeatureByFeature).length > 0) {
        console.group('ensureInventoryForFeature by feature:');
        console.table(
            Object.fromEntries(
                Object.entries(m.ensureInventoryForFeatureByFeature)
                    .map(([k, v]) => [k, { calls: v }])
            )
        );
        console.groupEnd();
    }
    console.groupEnd();
    return m;
}

// ── inventoryStore public object ──────────────────────────────────────────────
export const inventoryStore = {
    // State getters
    get inventoryStats()         { return _store.inventoryStats; },
    get financeInventoryDebts()  { return _store.financeInventoryDebts; },
    get inventoryHistory()       { return _store.inventoryHistory; },
    get inventoryHistoryLoaded() { return _store.inventoryHistoryLoaded; },
    get financeDebtLoaded()      { return _store.financeDebtLoaded; },
    get unpaidDebtQueryLoaded()  { return _store.unpaidDebtQueryLoaded; },
    get unpaidDebtQueryFailed()  { return _store.unpaidDebtQueryFailed; },
    get unpaidDebtQueryDocCount(){ return _store.unpaidDebtQueryDocCount; },
    get inventoryDebtIndexReady(){ return _debtIndex.isReady; },
    get inventoryDebtCompleteness(){ return _store.inventoryDebtCompleteness; },
    get version()                { return _store.version; },
    get lastUpdatedAt()          { return _store.lastUpdatedAt; },
    // Debt derivation
    normalizeStudentKey,
    isActiveInventoryDebt,
    deriveFinanceInventoryDebts,
    deriveAndSetFinanceInventoryDebts,
    // Index
    rebuildInventoryDebtIndex,
    isInventoryDebtIndexReady,
    // Lookup API
    getInventoryDebtsForStudent,
    getInventoryDebtTotalForStudent,
    getInventoryDebtSummaryForStudent,
    // Write API
    setInventoryStats,
    setFinanceInventoryDebts,
    setInventoryHistory,
    setAllInventory,
    // Read API
    getInventoryStats,
    getFinanceInventoryDebts,
    getInventoryHistory,
    getAllInventoryCompat,
    isInventoryHistoryLoaded,
    isFinanceDebtLoaded,
    isInventoryDebtIndexReady,
    resetInventoryStore,
    ensureInventoryForFeature,
    getInventoryDependencyMetrics,
    printInventoryDependencyMetrics,
    // [Phase 3.8C] Unpaid debt query state API
    markUnpaidDebtQueryLoaded,
    markUnpaidDebtQueryFailed,
    getUnpaidInventoryDebtsLoaded,
};

// ── Early init: expose window.__inventoryDependencyMetrics ────────────────────
if (typeof window !== 'undefined') {
    if (!window.__inventoryDependencyMetrics) {
        window.__inventoryDependencyMetrics = {
            inventoryStatsLoaded:              false,
            inventoryStatsKeys:                [],
            financeInventoryDebtCount:         0,
            inventoryHistoryLoaded:            false,
            inventoryHistoryCount:             0,
            allInventoryCompatCount:           0,
            legacyAllInventoryCount:           0,
            inventoryDebtIndexReady:           false,
            inventoryDebtIndexBuildCount:      0,
            inventoryDebtIndexBuildDuration:   0,
            inventoryDebtLookupCount:          0,
            inventoryDebtLookupByName:         0,
            inventoryDebtLookupFallbackCount:  0,
            inventoryDebtLookupMissCount:      0,
            deriveFinanceDebtCount:            0,
            lastDebtDeriveReason:              null,
            lastDebtIndexBuildAt:              null,
            fallbackToLegacyAllInventoryCount: 0,
            ensureInventoryForFeatureCalls:    0,
            ensureInventoryForFeatureByFeature: {},
            lastEnsureFeature:                 null,
            lastEnsureReason:                  null,
            lastUpdatedAt:                     null,
            // [Phase 3.8C]
            unpaidDebtQueryLoaded:             false,
            unpaidDebtQueryDocCount:           0,
            unpaidDebtQueryFailed:             false,
            unpaidDebtQueryCount:              0,
            unpaidDebtQueryFailedCount:        0,
        };
    }
    _updateMetrics();
}
