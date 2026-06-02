/**
 * inventoryStore.js — Phase 3.8C: Unpaid Debt Query State + Feature Guard Update
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * Phase 3.7C: tạo nền tảng store.
 * Phase 3.8A: gắn vào snapshot callbacks + feature guards + metrics.
 * Phase 3.8B: derive công nợ kho đồ + debt index + helper lookup nhanh.
 * Phase 3.8C: track trạng thái unpaid debt query riêng (không phụ thuộc limit 500).
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
 *   - Inventory records KHÔNG có profileId/memberId — student link là tên (desc/description).
 *   - Debt detection: t.unpaid === true && t.type === 'Xuất bán'
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
    // [Phase 3.8C] Unpaid debt query state — track riêng, không phụ thuộc limit(500) allInventory
    unpaidDebtQueryLoaded:    false,  // true sau khi query getDocs(where unpaid==true) thành công
    unpaidDebtQueryDocCount:  0,      // số debt docs từ query (không phải từ derive)
    unpaidDebtQueryFailed:    false,  // true nếu query lỗi, đang dùng fallback
    version:                  0,
    lastUpdatedAt:            null,
};

// ── Debt index nội bộ ─────────────────────────────────────────────────────────
const _debtIndex = {
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
 * Inventory records only link by name — no profileId/memberId in inventory schema.
 *
 * @param {string|Object|null} studentOrProfile
 * @returns {string} — student name or ''
 */
function _resolveStudentName(studentOrProfile) {
    if (!studentOrProfile) return '';
    if (typeof studentOrProfile === 'string') return studentOrProfile.trim();
    // Profile object: name is the profile key stored as .name or .profileId
    if (typeof studentOrProfile === 'object') {
        return (studentOrProfile.name || studentOrProfile.profileId ||
                studentOrProfile.studentName || '').trim();
    }
    return '';
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
        const t = allInventory[i];
        // ── Debt detection — giữ nguyên logic gốc, KHÔNG đổi ──────────────
        if (t.unpaid !== true || t.type !== 'Xuất bán') continue;

        const rawName    = t.desc || t.description || '';
        const normName   = normalizeStudentKey(rawName);

        debts.push({
            ...t,
            // Derived metadata (in-memory only)
            _debtKey:       t.id || (normName + '|' + (t.date || '')),
            _studentKey:    rawName,
            _studentName:   rawName,    // alias for clarity
            _normalizedName: normName,
            // NOTE: Inventory docs have no profileId/memberId.
            // Student is identified by name only (t.desc || t.description).
            _profileId:     null,       // TODO Phase 3.8C: if profiles can be correlated
            _memberId:      null,       // TODO Phase 3.8C: if memberId lookup is added
            _amount:        Number(t.amount || 0),
        });
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

    _debtIndex.byNormalizedName.clear();
    _debtIndex.isReady = false;

    const debts = Array.isArray(_store.financeInventoryDebts)
        ? _store.financeInventoryDebts
        : [];

    for (let i = 0; i < debts.length; i++) {
        const item    = debts[i];
        const normKey = item._normalizedName || normalizeStudentKey(item.desc || item.description || '');

        if (!normKey) continue;

        if (!_debtIndex.byNormalizedName.has(normKey)) {
            _debtIndex.byNormalizedName.set(normKey, []);
        }
        _debtIndex.byNormalizedName.get(normKey).push(item);
    }

    const ms = performance.now() - t0;
    _debtIndex.isReady       = true;
    _debtIndex.buildCount++;
    _debtIndex.lastBuildAt   = Date.now();
    _debtIndex.lastBuildDuration = ms;

    _metrics.indexBuildCount     = _debtIndex.buildCount;
    _metrics.indexBuildDuration  = ms;
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
    const { allowFallback = true, reason = '' } = options;

    _metrics.lookupCount++;
    _metrics.lookupByName++;

    const rawName  = _resolveStudentName(studentOrProfile);
    if (!rawName) {
        _metrics.lookupMissCount++;
        _updateMetrics();
        return [];
    }

    const normKey = normalizeStudentKey(rawName);

    // ── Path 1: index lookup (fast — O(1)) ───────────────────────────────────
    if (_debtIndex.isReady && _debtIndex.byNormalizedName.size > 0) {
        const found = _debtIndex.byNormalizedName.get(normKey) || null;
        if (found) {
            if (found.length === 0) _metrics.lookupMissCount++;
            _updateMetrics();
            return found;
        }
        // Key exists in index but empty → student has no debt
        // Key not in index at all → also no debt
        // Either way: return [] without fallback (index is authoritative when ready)
        _metrics.lookupMissCount++;
        _updateMetrics();
        return [];
    }

    // ── Path 2: fallback filter (index not ready) ────────────────────────────
    if (!allowFallback) {
        _metrics.lookupMissCount++;
        _updateMetrics();
        return [];
    }

    _metrics.lookupFallbackCount++;
    const src = _getCompatArray();

    // GIỮ NGUYÊN logic gốc app.js line 6640-6641
    const result = src.filter(t =>
        t.unpaid === true && t.type === 'Xuất bán' &&
        (t.desc === rawName || t.description === rawName)
    );

    if (result.length === 0) _metrics.lookupMissCount++;
    _updateMetrics();
    return result;
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
 * Gọi từ app.js sau khi _loadAllUnpaidInvDebts() query thành công.
 * Đánh dấu financeInventoryDebts đến từ query thực thụ (không phải derive từ allInventory limited).
 *
 * @param {number} count   — số debt items từ query
 * @param {string} [reason]
 */
export function markUnpaidDebtQueryLoaded(count, reason) {
    _store.unpaidDebtQueryLoaded   = true;
    _store.unpaidDebtQueryFailed   = false;
    _store.unpaidDebtQueryDocCount = typeof count === 'number' ? count : 0;
    _store.version++;
    _store.lastUpdatedAt = Date.now();
    _metrics.unpaidDebtQueryCount++;
    _updateMetrics();
}

/**
 * Gọi từ app.js khi _loadAllUnpaidInvDebts() lỗi/fallback.
 * @param {string} [reason]
 */
export function markUnpaidDebtQueryFailed(reason) {
    _store.unpaidDebtQueryFailed = true;
    _metrics.unpaidDebtQueryFailedCount++;
    _updateMetrics();
}

/**
 * Kiểm tra xem unpaid debt đã đến từ query riêng chưa.
 * true  → financeInventoryDebts đến từ getDocs(where unpaid==true) — đầy đủ, không bị limit(500).
 * false → financeInventoryDebts vẫn đến từ derive(allInventory limited) — có thể thiếu nợ cũ.
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

    _debtIndex.byNormalizedName.clear();
    _debtIndex.isReady     = false;
    _debtIndex.lastBuildAt = null;

    // [Phase 3.8C] Reset unpaid debt query state (cần query lại khi login/switch club)
    _store.unpaidDebtQueryLoaded   = false;
    _store.unpaidDebtQueryDocCount = 0;
    _store.unpaidDebtQueryFailed   = false;

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
    get version()                { return _store.version; },
    get lastUpdatedAt()          { return _store.lastUpdatedAt; },
    // Debt derivation
    normalizeStudentKey,
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
