/**
 * js/firebase/paginatedQuery.js — Phase 3.8D
 * ──────────────────────────────────────────────────────────────────────────────
 * Paginated Firestore fetch utility cho calculation/export queries.
 *
 * MỤC ĐÍCH:
 *   - Load ĐỦ dữ liệu vượt quá giới hạn limit(500/2000) của realtime listener.
 *   - Dùng cho: export báo cáo, tính doanh thu tháng đủ dữ liệu, future reporting.
 *   - KHÔNG dùng cho: realtime listener, UI display list.
 *
 * EXPORTS (Phase 3.8C):
 *   fetchAllMatchingDocs(options)           — paginated getDocs cho calc/export
 *   loadTransactionsForPeriod(options)      — load đủ giao dịch theo kỳ tháng
 *   createPaginationCursorState()          — cursor state factory
 *   warnUnsafeLimit(queryName, reason)     — ghi nhận unsafe limit warning
 *   printQueryScaleMetrics()               — in metrics ra console
 *
 * EXPORTS MỚI (Phase 3.8D):
 *   loadTransactionsForDateRange(options)  — paginated tx by date range (export)
 *   loadTransactionsForTxMonthRange(opts)  — paginated tx by txMonth range (export)
 *   loadInventoryForDateRange(options)     — paginated inventory by date range (export)
 *   dedupeDocsById(items)                 — dedup array of docs by id
 *
 * PATTERN:
 *   Dùng window._fb_init để lấy getDocs, query, where, orderBy, startAfter.
 *   Nhất quán với finance.service.js — không import Firebase SDK trực tiếp.
 *
 * METRICS:
 *   window.__queryScaleMetrics — track warnings + paginated fetches
 *   window.printQueryScaleMetrics() — in ra console
 *
 * NGUYÊN TẮC:
 *   - Không gọi renderApp, không phụ thuộc UI.
 *   - Nếu Firestore cần composite index, warn rõ với [FirestoreIndexRequired].
 *   - Không crash app khi lỗi — always fallback.
 *   - Không log dữ liệu cá nhân (tên, SĐT, CCCD).
 *
 * /// Phase 3.8C — Remove Unsafe 500-Limit Bottlenecks & Paginated Query Scale
 * /// Phase 3.8D — Export/Report Full-Period Pagination & Financial Correctness
 */

// ── Query Scale Metrics (singleton) ─────────────────────────────────────────

if (typeof window !== 'undefined') {
    window.__queryScaleMetrics = window.__queryScaleMetrics || {
        // Phase 3.8C fields
        unsafeLimitWarnings:              {},   // { queryName: warnCount }
        paginatedFetches:                 {},   // { metricsKey: { pages, docs, durationMs, lastAt } }
        unpaidInventoryDebtDocs:          0,
        unpaidInventoryDebtPages:         0,
        transactionPeriodDocs:            {},   // { 'YYYY-MM': docCount }
        transactionPeriodPages:           {},   // { 'YYYY-MM': pageCount }
        fallbackToRecentInventoryCount:   0,
        fallbackToLimitedTransactionsCount: 0,
        lastQueryScaleReason:             '',
        lastUpdatedAt:                    null,

        // Phase 3.8D export metrics
        exportDateRangeDocs:              0,
        exportTxMonthRangeDocs:           0,
        exportInventoryDocs:              0,
        exportDateRangePages:             0,
        exportTxMonthRangePages:          0,
        exportInventoryPages:             0,
        taxExportDocs:                    0,
        taxExportPages:                   0,
        exportPaginationFallbackCount:    0,
        lastExportReason:                 '',
        lastExportDurationMs:             0,
    };
}

// Merge new Phase 3.8D fields nếu __queryScaleMetrics đã tồn tại từ 3.8C
if (typeof window !== 'undefined' && window.__queryScaleMetrics) {
    const _qs = window.__queryScaleMetrics;
    if (_qs.exportDateRangeDocs    === undefined) _qs.exportDateRangeDocs    = 0;
    if (_qs.exportTxMonthRangeDocs === undefined) _qs.exportTxMonthRangeDocs = 0;
    if (_qs.exportInventoryDocs    === undefined) _qs.exportInventoryDocs    = 0;
    if (_qs.exportDateRangePages   === undefined) _qs.exportDateRangePages   = 0;
    if (_qs.exportTxMonthRangePages === undefined) _qs.exportTxMonthRangePages = 0;
    if (_qs.exportInventoryPages   === undefined) _qs.exportInventoryPages   = 0;
    if (_qs.taxExportDocs          === undefined) _qs.taxExportDocs          = 0;
    if (_qs.taxExportPages         === undefined) _qs.taxExportPages         = 0;
    if (_qs.exportPaginationFallbackCount === undefined) _qs.exportPaginationFallbackCount = 0;
    if (_qs.lastExportReason       === undefined) _qs.lastExportReason       = '';
    if (_qs.lastExportDurationMs   === undefined) _qs.lastExportDurationMs   = 0;
}

function _qs() {
    if (typeof window === 'undefined') return null;
    return window.__queryScaleMetrics || null;
}

// ── Internal helpers ─────────────────────────────────────────────────────────

function _getSDK() {
    const sdk = (typeof window !== 'undefined') ? window._fb_init : null;
    if (!sdk) throw new Error('[paginatedQuery] window._fb_init chưa sẵn sàng.');
    return sdk;
}

function _recordWarn(queryName, reason) {
    const qs = _qs();
    if (!qs) return;
    const count = (qs.unsafeLimitWarnings[queryName] || 0) + 1;
    qs.unsafeLimitWarnings[queryName] = count;
    qs.lastQueryScaleReason = reason || queryName;
    qs.lastUpdatedAt        = Date.now();
    // Chỉ warn lần đầu — tránh spam console
    if (count === 1) {
        console.warn(
            `[UnsafeLimitWarning] "${queryName}" dùng dữ liệu bị giới hạn để tính toán.\n` +
            `  → Reason: ${reason || 'unknown'}\n` +
            `  → Gọi window.printQueryScaleMetrics() để xem chi tiết.`
        );
    }
}

// ── createPaginationCursorState ──────────────────────────────────────────────

/**
 * Tạo cursor state cho paginated fetch.
 * @returns {{ lastVisible: null, hasMore: boolean, pages: number, totalDocs: number, durationMs: number }}
 */
export function createPaginationCursorState() {
    return {
        lastVisible: null,
        hasMore:     true,
        pages:       0,
        totalDocs:   0,
        durationMs:  0,
    };
}

// ── warnUnsafeLimit ──────────────────────────────────────────────────────────

/**
 * Ghi nhận cảnh báo khi một query bị limit nhưng dùng cho tính toán/báo cáo.
 * Gọi từ app.js hoặc bất kỳ nơi nào phát hiện unsafe limit.
 *
 * @param {string} queryName  — tên định danh query ('transactions:byDate:2026-05')
 * @param {string} [reason]   — lý do/context ('listenToData:init')
 */
export function warnUnsafeLimit(queryName, reason) {
    _recordWarn(queryName, reason);
}

// ── fetchAllMatchingDocs ─────────────────────────────────────────────────────

/**
 * Fetch TẤT CẢ documents khớp query, vượt qua giới hạn limit(500) của listener.
 * Dùng cursor pagination (startAfter) để lấy nhiều trang.
 * Dùng cho calculation/export — KHÔNG dùng cho realtime listener.
 *
 * @param {Object} options
 * @param {function(cursor: DocumentSnapshot|null): Query} options.baseQueryBuilder
 *        Nhận cursor (null cho trang đầu, DocumentSnapshot cho trang tiếp).
 *        Builder phải include: orderBy, limit(pageSize), startAfter(cursor) khi cursor != null.
 * @param {number}   [options.pageSize=500]    — số docs mỗi trang
 * @param {number}   [options.maxPages=20]     — giới hạn tổng số trang (tránh đọc vô hạn)
 * @param {string}   [options.reason]          — lý do fetch (cho metrics/log)
 * @param {string}   [options.metricsKey]      — key trong paginatedFetches
 * @param {function} [options.onPage]          — callback(pageItems, pageNum) sau mỗi trang
 * @param {function} [options.stopWhen]        — stopWhen(accumulatedItems) → boolean
 * @returns {Promise<Array<{id: string, [key: string]: any}>>}
 */
export async function fetchAllMatchingDocs({
    baseQueryBuilder,
    pageSize   = 500,
    maxPages   = 20,
    reason     = '',
    metricsKey = '',
    onPage,
    stopWhen,
} = {}) {
    const qs      = _qs();
    const t0      = Date.now();
    const results = [];
    let cursor    = null;
    let pages     = 0;

    try {
        const sdk       = _getSDK();
        const _getDocs  = sdk.getDocs;

        if (!_getDocs || !baseQueryBuilder) {
            console.warn('[paginatedQuery] fetchAllMatchingDocs: thiếu getDocs hoặc baseQueryBuilder.');
            return [];
        }

        while (pages < maxPages) {
            const q    = baseQueryBuilder(cursor);
            // [Phase 3.8D Fix] Bỏ dòng vô nghĩa: getDocs(_limit ? q : q) → getDocs(q)
            // baseQueryBuilder đã tự include limit(pageSize) và startAfter(cursor)
            const snap = await _getDocs(q);
            pages++;

            if (!snap || snap.empty) break;

            const rawDocs  = snap.docs;
            const pageDocs = rawDocs.slice(0, pageSize).map(d => ({ id: d.id, ...d.data() }));
            results.push(...pageDocs);

            if (typeof onPage === 'function') {
                try { onPage(pageDocs, pages); } catch (_e) {}
            }

            // Điều kiện dừng
            if (rawDocs.length < pageSize) break;     // trang cuối (ít hơn pageSize docs)
            if (typeof stopWhen === 'function' && stopWhen(results)) break;

            // Cursor cho trang tiếp theo — lấy document thực từ snap (không phải từ mapped object)
            cursor = rawDocs[rawDocs.length - 1];
        }

        if (pages >= maxPages && results.length > 0) {
            console.warn(
                `[paginatedQuery] fetchAllMatchingDocs đạt maxPages=${maxPages}. ` +
                `Đã load ${results.length} docs. Key: ${metricsKey || reason}`
            );
        }
    } catch (err) {
        const msg = (err && err.message) || String(err);
        if (msg.includes('index') || msg.includes('FAILED_PRECONDITION') || msg.includes('requires an index')) {
            console.warn(
                '[FirestoreIndexRequired] fetchAllMatchingDocs cần composite index.\n' +
                `  Reason: ${reason}\n` +
                '  Tạo index trong Firebase Console → Firestore → Indexes.'
            );
        } else {
            console.warn('[paginatedQuery] fetchAllMatchingDocs error:', msg);
        }
    }

    const durationMs = Date.now() - t0;
    if (qs) {
        qs.lastUpdatedAt        = Date.now();
        qs.lastQueryScaleReason = reason;
        if (metricsKey) {
            qs.paginatedFetches[metricsKey] = {
                pages,
                docs:      results.length,
                durationMs,
                reason,
                lastAt:    Date.now(),
            };
        }
    }

    return results;
}

// ── loadTransactionsForPeriod ────────────────────────────────────────────────

/**
 * Load đủ giao dịch theo kỳ tháng cho export/báo cáo.
 * Không phụ thuộc limit(500) của realtime listener.
 * Dùng khi Export Excel cần đầy đủ giao dịch tháng.
 * KHÔNG dùng thay thế realtime listener hàng ngày — chỉ cho export/report.
 *
 * @param {Object} options
 * @param {Object}  options.colRef       — Firestore CollectionReference (transactions)
 * @param {string}  options.month        — 'YYYY-MM'
 * @param {string}  [options.reason]
 * @param {boolean} [options.forExport=false]
 * @param {number}  [options.pageSize=500]
 * @returns {Promise<Array>} mảng docs {id, ...data}
 */
export async function loadTransactionsForPeriod({
    colRef,
    month,
    reason    = '',
    forExport = false,
    pageSize  = 500,
} = {}) {
    const qs = _qs();

    if (!colRef || !month) {
        console.warn('[paginatedQuery] loadTransactionsForPeriod: thiếu colRef hoặc month.');
        return [];
    }

    try {
        const sdk         = _getSDK();
        const _where      = sdk.where;
        const _orderBy    = sdk.orderBy;
        const _startAfter = sdk.startAfter;
        const _query      = sdk.query;
        const _limit      = sdk.limit;

        if (!_where || !_orderBy || !_query) {
            console.warn('[paginatedQuery] loadTransactionsForPeriod: Firebase SDK functions chưa sẵn sàng.');
            if (qs) qs.fallbackToLimitedTransactionsCount++;
            return [];
        }

        const _builder = (cursor) => {
            const constraints = [
                _where('txMonth', '==', month),
                _orderBy('timestamp', 'desc'),
            ];
            if (_limit) constraints.push(_limit(pageSize));
            if (cursor && _startAfter) constraints.push(_startAfter(cursor));
            return _query(colRef, ...constraints);
        };

        const docs = await fetchAllMatchingDocs({
            baseQueryBuilder: _builder,
            pageSize,
            maxPages: forExport ? 20 : 4,
            reason:   reason || `loadTransactionsForPeriod:${month}`,
            metricsKey: `tx:${month}`,
            stopWhen: forExport ? null : (arr) => arr.length >= pageSize * 2,
        });

        if (qs) {
            qs.transactionPeriodDocs[month]  = docs.length;
            const fetch = qs.paginatedFetches[`tx:${month}`];
            qs.transactionPeriodPages[month] = fetch ? fetch.pages : 1;
            qs.lastUpdatedAt = Date.now();
        }

        return docs;
    } catch (err) {
        const msg = (err && err.message) || String(err);
        console.warn('[paginatedQuery] loadTransactionsForPeriod error:', msg);
        if (qs) {
            qs.fallbackToLimitedTransactionsCount++;
            _recordWarn(`transactions:${month}`, reason);
        }
        return [];
    }
}

// ── Phase 3.8D: New Export/Report Helpers ────────────────────────────────────

/**
 * dedupeDocsById — Loại bỏ doc trùng id trong mảng hợp nhất.
 * Dùng để merge txByDate + txByMonth mà không duplicate.
 *
 * @param {Array<{id: string, [key: string]: any}>} items
 * @returns {Array<{id: string, [key: string]: any}>}
 */
export function dedupeDocsById(items) {
    if (!Array.isArray(items)) return [];
    const seen   = new Set();
    const result = [];
    for (const doc of items) {
        if (doc && doc.id && !seen.has(doc.id)) {
            seen.add(doc.id);
            result.push(doc);
        }
    }
    return result;
}

/**
 * loadTransactionsForDateRange — Paginated fetch giao dịch theo date range.
 * Thay thế: getDocs(query(colRef, where("date",">=",..),where("date","<=",..),limit(2000)))
 *
 * Query dùng:
 *   where("date", ">=", startDate)
 *   where("date", "<=", endDate)
 *   orderBy("date", "asc")   ← cùng field với range filter → không cần composite index
 *   startAfter(cursor)
 *   limit(pageSize)
 *
 * @param {Object}  options
 * @param {Object}  options.colRef     — Firestore CollectionReference
 * @param {string}  options.startDate  — 'YYYY-MM-DD'
 * @param {string}  options.endDate    — 'YYYY-MM-DD'
 * @param {string}  [options.reason]
 * @param {number}  [options.pageSize=500]
 * @param {number}  [options.maxPages=50]
 * @returns {Promise<Array<{id:string, [key:string]:any}>>}
 */
export async function loadTransactionsForDateRange({
    colRef,
    startDate,
    endDate,
    reason   = '',
    pageSize = 500,
    maxPages = 50,
} = {}) {
    const qs = _qs();
    const t0 = Date.now();

    if (!colRef || !startDate || !endDate) {
        console.warn('[paginatedQuery] loadTransactionsForDateRange: thiếu colRef / startDate / endDate.');
        return [];
    }

    try {
        const sdk         = _getSDK();
        const _where      = sdk.where;
        const _orderBy    = sdk.orderBy;
        const _startAfter = sdk.startAfter;
        const _query      = sdk.query;
        const _limit      = sdk.limit;

        if (!_where || !_orderBy || !_query || !_limit) {
            console.warn('[paginatedQuery] loadTransactionsForDateRange: Firebase SDK chưa sẵn sàng.');
            return [];
        }

        const _builder = (cursor) => {
            const constraints = [
                _where('date', '>=', startDate),
                _where('date', '<=', endDate),
                _orderBy('date', 'asc'),
                _limit(pageSize),
            ];
            if (cursor && _startAfter) constraints.push(_startAfter(cursor));
            return _query(colRef, ...constraints);
        };

        const metricsKey = `export-tx-date:${startDate}~${endDate}`;
        const docs = await fetchAllMatchingDocs({
            baseQueryBuilder: _builder,
            pageSize,
            maxPages,
            reason:     reason || `loadTransactionsForDateRange:${startDate}~${endDate}`,
            metricsKey,
        });

        const durationMs = Date.now() - t0;
        const fetch      = qs && qs.paginatedFetches[metricsKey];
        if (qs) {
            qs.exportDateRangeDocs  = docs.length;
            qs.exportDateRangePages = fetch ? fetch.pages : 1;
            qs.lastExportReason     = reason || metricsKey;
            qs.lastExportDurationMs = durationMs;
            qs.lastUpdatedAt        = Date.now();
        }

        return docs;
    } catch (err) {
        const msg = (err && err.message) || String(err);
        if (msg.includes('index') || msg.includes('FAILED_PRECONDITION') || msg.includes('requires an index')) {
            console.warn(
                '[FirestoreIndexRequired] loadTransactionsForDateRange cần composite index.\n' +
                `  Fields: date (range), date (orderBy asc)\n` +
                `  Reason: ${reason}\n` +
                '  Tạo index trong Firebase Console → Firestore → Indexes.'
            );
        } else {
            console.warn('[paginatedQuery] loadTransactionsForDateRange error:', msg);
        }
        if (qs) _recordWarn(`loadTransactionsForDateRange:${startDate}~${endDate}`, reason);
        return [];
    }
}

/**
 * loadTransactionsForTxMonthRange — Paginated fetch giao dịch theo txMonth range.
 * Thay thế: getDocs(query(colRef, where("txMonth",">=",..),where("txMonth","<=",..),limit(2000)))
 * Bắt cross-month transactions (VD: đóng học phí T1 vào ngày 1/2 → txMonth=T1 nhưng date=T2).
 *
 * Query dùng:
 *   where("txMonth", ">=", startMonth)
 *   where("txMonth", "<=", endMonth)
 *   orderBy("txMonth", "asc")   ← cùng field với range filter
 *   startAfter(cursor)
 *   limit(pageSize)
 *
 * NOTE: Nếu Firestore báo FAILED_PRECONDITION / requires index, warning:
 *   [FirestoreIndexRequired] — tạo index: txMonth ASC trong Firebase Console.
 *
 * @param {Object}  options
 * @param {Object}  options.colRef      — Firestore CollectionReference
 * @param {string}  options.startMonth  — 'YYYY-MM'
 * @param {string}  options.endMonth    — 'YYYY-MM'
 * @param {string}  [options.reason]
 * @param {number}  [options.pageSize=500]
 * @param {number}  [options.maxPages=50]
 * @returns {Promise<Array<{id:string, [key:string]:any}>>}
 */
export async function loadTransactionsForTxMonthRange({
    colRef,
    startMonth,
    endMonth,
    reason   = '',
    pageSize = 500,
    maxPages = 50,
} = {}) {
    const qs = _qs();
    const t0 = Date.now();

    if (!colRef || !startMonth || !endMonth) {
        console.warn('[paginatedQuery] loadTransactionsForTxMonthRange: thiếu colRef / startMonth / endMonth.');
        return [];
    }

    try {
        const sdk         = _getSDK();
        const _where      = sdk.where;
        const _orderBy    = sdk.orderBy;
        const _startAfter = sdk.startAfter;
        const _query      = sdk.query;
        const _limit      = sdk.limit;

        if (!_where || !_orderBy || !_query || !_limit) {
            console.warn('[paginatedQuery] loadTransactionsForTxMonthRange: Firebase SDK chưa sẵn sàng.');
            return [];
        }

        const _builder = (cursor) => {
            const constraints = [
                _where('txMonth', '>=', startMonth),
                _where('txMonth', '<=', endMonth),
                _orderBy('txMonth', 'asc'),
                _limit(pageSize),
            ];
            if (cursor && _startAfter) constraints.push(_startAfter(cursor));
            return _query(colRef, ...constraints);
        };

        const metricsKey = `export-tx-month:${startMonth}~${endMonth}`;
        const docs = await fetchAllMatchingDocs({
            baseQueryBuilder: _builder,
            pageSize,
            maxPages,
            reason:     reason || `loadTransactionsForTxMonthRange:${startMonth}~${endMonth}`,
            metricsKey,
        });

        const durationMs = Date.now() - t0;
        const fetch      = qs && qs.paginatedFetches[metricsKey];
        if (qs) {
            qs.exportTxMonthRangeDocs  = docs.length;
            qs.exportTxMonthRangePages = fetch ? fetch.pages : 1;
            qs.lastExportReason        = reason || metricsKey;
            qs.lastExportDurationMs    = durationMs;
            qs.lastUpdatedAt           = Date.now();
        }

        return docs;
    } catch (err) {
        const msg = (err && err.message) || String(err);
        if (msg.includes('index') || msg.includes('FAILED_PRECONDITION') || msg.includes('requires an index')) {
            console.warn(
                '[FirestoreIndexRequired] loadTransactionsForTxMonthRange cần composite index.\n' +
                `  Fields: txMonth (range), txMonth (orderBy asc)\n` +
                `  Reason: ${reason}\n` +
                '  Tạo index trong Firebase Console → Firestore → Indexes.'
            );
        } else {
            console.warn('[paginatedQuery] loadTransactionsForTxMonthRange error:', msg);
        }
        if (qs) _recordWarn(`loadTransactionsForTxMonthRange:${startMonth}~${endMonth}`, reason);
        return [];
    }
}

/**
 * loadInventoryForDateRange — Paginated fetch inventory theo date range.
 * Thay thế: getDocs(query(invRef, where("date",">=",..),where("date","<=",..),limit(1000)))
 *
 * Query dùng:
 *   where("date", ">=", startDate)
 *   where("date", "<=", endDate)
 *   orderBy("date", "asc")
 *   startAfter(cursor)
 *   limit(pageSize)
 *
 * @param {Object}  options
 * @param {Object}  options.invRef     — Firestore CollectionReference (inventory)
 * @param {string}  options.startDate  — 'YYYY-MM-DD'
 * @param {string}  options.endDate    — 'YYYY-MM-DD'
 * @param {string}  [options.reason]
 * @param {number}  [options.pageSize=500]
 * @param {number}  [options.maxPages=50]
 * @returns {Promise<Array<{id:string, [key:string]:any}>>}
 */
export async function loadInventoryForDateRange({
    invRef,
    startDate,
    endDate,
    reason   = '',
    pageSize = 500,
    maxPages = 50,
} = {}) {
    const qs = _qs();
    const t0 = Date.now();

    if (!invRef || !startDate || !endDate) {
        console.warn('[paginatedQuery] loadInventoryForDateRange: thiếu invRef / startDate / endDate.');
        return [];
    }

    try {
        const sdk         = _getSDK();
        const _where      = sdk.where;
        const _orderBy    = sdk.orderBy;
        const _startAfter = sdk.startAfter;
        const _query      = sdk.query;
        const _limit      = sdk.limit;

        if (!_where || !_orderBy || !_query || !_limit) {
            console.warn('[paginatedQuery] loadInventoryForDateRange: Firebase SDK chưa sẵn sàng.');
            return [];
        }

        const _builder = (cursor) => {
            const constraints = [
                _where('date', '>=', startDate),
                _where('date', '<=', endDate),
                _orderBy('date', 'asc'),
                _limit(pageSize),
            ];
            if (cursor && _startAfter) constraints.push(_startAfter(cursor));
            return _query(invRef, ...constraints);
        };

        const metricsKey = `export-inv-date:${startDate}~${endDate}`;
        const docs = await fetchAllMatchingDocs({
            baseQueryBuilder: _builder,
            pageSize,
            maxPages,
            reason:     reason || `loadInventoryForDateRange:${startDate}~${endDate}`,
            metricsKey,
        });

        const durationMs = Date.now() - t0;
        const fetch      = qs && qs.paginatedFetches[metricsKey];
        if (qs) {
            qs.exportInventoryDocs  = docs.length;
            qs.exportInventoryPages = fetch ? fetch.pages : 1;
            qs.lastExportReason     = reason || metricsKey;
            qs.lastExportDurationMs = durationMs;
            qs.lastUpdatedAt        = Date.now();
        }

        return docs;
    } catch (err) {
        const msg = (err && err.message) || String(err);
        if (msg.includes('index') || msg.includes('FAILED_PRECONDITION') || msg.includes('requires an index')) {
            console.warn(
                '[FirestoreIndexRequired] loadInventoryForDateRange cần composite index.\n' +
                `  Fields: date (range), date (orderBy asc)\n` +
                `  Reason: ${reason}\n` +
                '  Tạo index trong Firebase Console → Firestore → Indexes.'
            );
        } else {
            console.warn('[paginatedQuery] loadInventoryForDateRange error:', msg);
        }
        if (qs) _recordWarn(`loadInventoryForDateRange:${startDate}~${endDate}`, reason);
        return [];
    }
}


// ── fetchAllQueryPages (Phase 4J-8A) ─────────────────────────────────────────

/**
 * Generic paginated fetch helper — Phase 4.0B-4J-8A (Phase 6).
 *
 * Dùng chung cho: export, recalculation, admin operations, batch rename scan.
 * KHÔNG dùng cho UI interactive list (dùng getProfilesPage).
 *
 * @param {function(opts: {lastDoc: DocumentSnapshot|null, pageSize: number}): Query} queryFactory
 *        Builder function. Nhận lastDoc (null cho trang 1) + pageSize, trả về Firestore Query.
 * @param {Object}   [options]
 * @param {number}   [options.pageSize]     — docs/page (default: __scaleConfig.reportPageSize || 300)
 * @param {number}   [options.maxDocs]      — safety cap tổng (default 20000)
 * @param {string}   [options.reason]       — mô tả để log
 * @param {string}   [options.domain]       — domain cho recordReadMetric
 * @returns {Promise<Array<{id: string, data: object, ref: DocumentReference}>>}
 */
export async function fetchAllQueryPages(queryFactory, options = {}) {
    const pageSize = options.pageSize || (window.__scaleConfig && window.__scaleConfig.reportPageSize) || 300;
    const maxDocs  = options.maxDocs  || 20000;
    const reason   = options.reason   || 'fetch-all-pages';
    const domain   = options.domain   || 'report';

    let all     = [];
    let lastDoc = null;
    let page    = 0;

    const _getDocs = (_getSDK()).getDocs;

    while (true) {
        const q    = queryFactory({ lastDoc, pageSize });
        const snap = await _getDocs(q);

        if (typeof window.recordReadMetric === 'function') {
            window.recordReadMetric(domain, snap.size, reason);
        }

        snap.forEach(doc => all.push({ id: doc.id, data: doc.data(), ref: doc.ref }));

        if (snap.size < pageSize) break;
        lastDoc = snap.docs[snap.docs.length - 1];
        page++;

        if (all.length >= maxDocs) {
            console.warn('[Scale] fetchAllQueryPages hit maxDocs cap:', maxDocs, reason);
            break;
        }
    }

    return all;
}

// ── printQueryScaleMetrics ───────────────────────────────────────────────────

/**
 * In toàn bộ query scale metrics ra console.
 * Gọi sau login: window.printQueryScaleMetrics()
 */
export function printQueryScaleMetrics() {
    const qs = _qs();
    if (!qs) { console.log('[QueryScale] __queryScaleMetrics chưa khởi tạo.'); return; }

    console.group('[QueryScale] Metrics — Phase 3.8D');

    // Phase 3.8C base metrics
    console.group('── Base Metrics (3.8C) ──');
    console.table({
        'unpaidInventoryDebtDocs':           { value: qs.unpaidInventoryDebtDocs },
        'unpaidInventoryDebtPages':          { value: qs.unpaidInventoryDebtPages },
        'fallbackToRecentInventory':         { value: qs.fallbackToRecentInventoryCount },
        'fallbackToLimitedTransactions':     { value: qs.fallbackToLimitedTransactionsCount },
        'lastReason':                        { value: qs.lastQueryScaleReason || '—' },
        'lastUpdatedAt':                     { value: qs.lastUpdatedAt ? new Date(qs.lastUpdatedAt).toLocaleTimeString() : '—' },
    });
    console.groupEnd();

    // Phase 3.8D export metrics
    console.group('── Export/Report Metrics (3.8D) ──');
    console.table({
        'exportDateRangeDocs':          { value: qs.exportDateRangeDocs,          pages: qs.exportDateRangePages },
        'exportTxMonthRangeDocs':       { value: qs.exportTxMonthRangeDocs,       pages: qs.exportTxMonthRangePages },
        'exportInventoryDocs':          { value: qs.exportInventoryDocs,          pages: qs.exportInventoryPages },
        'taxExportDocs':                { value: qs.taxExportDocs,                pages: qs.taxExportPages },
        'exportPaginationFallbacks':    { value: qs.exportPaginationFallbackCount, pages: '—' },
        'lastExportReason':             { value: qs.lastExportReason || '—',      pages: '—' },
        'lastExportDurationMs':         { value: qs.lastExportDurationMs + 'ms',  pages: '—' },
    });
    console.groupEnd();

    const warnKeys = Object.keys(qs.unsafeLimitWarnings);
    if (warnKeys.length > 0) {
        console.group('⚠ Unsafe Limit Warnings (chỉ warn lần đầu):');
        console.table(
            Object.fromEntries(warnKeys.map(k => [k, { warnCount: qs.unsafeLimitWarnings[k] }]))
        );
        console.groupEnd();
    }

    const fetchKeys = Object.keys(qs.paginatedFetches);
    if (fetchKeys.length > 0) {
        console.group('Paginated Fetches (all):');
        console.table(qs.paginatedFetches);
        console.groupEnd();
    }

    const txMonths = Object.keys(qs.transactionPeriodDocs);
    if (txMonths.length > 0) {
        console.group('Transaction Period Docs (per month):');
        console.table(
            Object.fromEntries(
                txMonths.map(m => [m, {
                    docs:  qs.transactionPeriodDocs[m],
                    pages: qs.transactionPeriodPages[m] || '?',
                }])
            )
        );
        console.groupEnd();
    }

    console.groupEnd();
    return qs;
}

// ── Window exposure (debug helpers) ─────────────────────────────────────────

if (typeof window !== 'undefined') {
    // Phase 3.8C
    window.fetchAllMatchingDocs      = fetchAllMatchingDocs;
    window.loadTransactionsForPeriod = loadTransactionsForPeriod;
    window.warnUnsafeLimit           = warnUnsafeLimit;
    window.printQueryScaleMetrics    = printQueryScaleMetrics;

    // Phase 3.8D (mới)
    window.loadTransactionsForDateRange   = loadTransactionsForDateRange;
    window.loadTransactionsForTxMonthRange = loadTransactionsForTxMonthRange;
    window.loadInventoryForDateRange      = loadInventoryForDateRange;
    window.dedupeDocsById                 = dedupeDocsById;

    // Phase 4J-8A (mới)
    window.fetchAllQueryPages             = fetchAllQueryPages;
}
