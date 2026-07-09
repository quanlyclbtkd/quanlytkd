/**
 * utils/firestore-guard.js — Phase 3.3E
 * ────────────────────────────────────────────────────────────────
 * Firestore Query Safety Layer.
 *
 * VẤN ĐỀ: getDocs(collection(db, ...)) KHÔNG CÓ limit() → full collection scan
 *           → tốn hàng nghìn Firestore reads, làm chậm app với 10,000+ docs.
 *
 * GIẢI PHÁP:
 *   1. safeGetDocs(q, options) — wrapper bắt buộc có limit hoặc cảnh báo
 *   2. assertHasLimit(q)       — kiểm tra query có chứa limit() constraint
 *   3. REQUIRED_LIMIT          — fallback limit nếu không có (DEFAULT_SAFE_LIMIT)
 *   4. Audit helpers           — ghi lại mọi unbounded query trong console
 *
 * SỬ DỤNG:
 *   Thay vì: getDocs(query(colRef, where('status', '==', 'active')))
 *   Dùng:    safeGetDocs(query(colRef, where('status', '==', 'active'), limit(100)))
 *
 * RULES (Phase 3.3E):
 *   ✅ Mọi getDocs() PHẢI có limit() hoặc pagination cursor
 *   ✅ onSnapshot() PHẢI có limit() ngoại trừ collections nhỏ (<200 docs)
 *   ✅ Nếu cần full collection → dùng getCountFromServer() hoặc Cloud Function
 *
 * /// Phase 3.3E — Firestore Safety
 * ────────────────────────────────────────────────────────────────
 */

/** Limit mặc định nếu caller không chỉ định — ngăn accidental full scans */
export const DEFAULT_SAFE_LIMIT = 500;

/** Danh sách collections được phép full scan (docs count nhỏ, ổn định) */
const _ALLOWED_FULL_SCAN = new Set([
    'clubs',           // ~vài chục clubs
    'users',           // chỉ SysAdmin mới đọc
    'settings',        // 2-3 docs per club
    'fee_audit',       // có thể lớn nhưng chỉ dùng trong reports
]);

// ── Query audit log (dev only) ────────────────────────────────
const _queryLog = [];
const _isDev = window.location.hostname === 'localhost'
            || window.location.hostname === '127.0.0.1'
            || window.location.search.includes('debug=1');

function _logQuery(collection, hasLimit, limitValue, stack) {
    if (!_isDev) return;
    _queryLog.push({ collection, hasLimit, limitValue, ts: Date.now(), stack });
    if (!hasLimit && !_ALLOWED_FULL_SCAN.has(collection)) {
        console.warn(
            `[firestore-guard] ⚠️ UNBOUNDED QUERY trên collection: "${collection}"\n` +
            `  → Thêm limit(${DEFAULT_SAFE_LIMIT}) hoặc cursor pagination!\n` +
            `  Stack: ${stack}`
        );
    }
}

/**
 * Lấy collection name từ Firestore Query object.
 * Dùng cho logging — không bắt buộc chính xác 100%.
 * @param {Query} q
 * @returns {string}
 */
function _extractCollectionName(q) {
    try {
        // Firestore SDK v9 stores path in _query.path.segments
        const segments = q?._query?.path?.segments || [];
        return segments[segments.length - 1] || 'unknown';
    } catch (_) {
        return 'unknown';
    }
}

/**
 * Kiểm tra query có limit constraint không.
 * @param {Query} q — Firestore query object
 * @returns {{ hasLimit: boolean, limitValue: number|null }}
 */
export function checkQueryLimit(q) {
    try {
        // SDK v9: limit stored in _query.limit
        const lim = q?._query?.limit;
        if (typeof lim === 'number' && lim > 0) {
            return { hasLimit: true, limitValue: lim };
        }
        return { hasLimit: false, limitValue: null };
    } catch (_) {
        return { hasLimit: false, limitValue: null };
    }
}

/**
 * Safe wrapper cho getDocs — cảnh báo nếu không có limit.
 *
 * @param {Query}   q       — Firestore query (đã có where(), orderBy(), limit())
 * @param {Object}  [opts]
 * @param {boolean} [opts.allowUnbounded=false] — cho phép full scan (cẩn thận!)
 * @param {number}  [opts.maxLimit]             — override limit tối đa
 * @returns {Promise<QuerySnapshot>}
 */
export async function safeGetDocs(q, opts = {}) {
    const { getDocs, query: buildQuery, limit: limitFn } = window._fb_init || {};
    if (!getDocs) throw new Error('[firestore-guard] Firebase SDK chưa sẵn sàng');

    const { hasLimit, limitValue } = checkQueryLimit(q);
    const collName = _extractCollectionName(q);
    const stack    = _isDev ? new Error().stack.split('\n')[2]?.trim() || '' : '';

    _logQuery(collName, hasLimit, limitValue, stack);
    try {
        if (typeof window.trackRuntimeAuditRead === 'function') {
            window.trackRuntimeAuditRead(collName || 'unknown-query', {
                source: 'safeGetDocs',
                hasLimit,
                limitValue,
                allowUnbounded: opts.allowUnbounded === true
            });
        }
    } catch (_) {}

    if (!hasLimit && !opts.allowUnbounded && !_ALLOWED_FULL_SCAN.has(collName)) {
        if (_isDev) {
            console.warn(
                `[firestore-guard] 🛡️ Auto-injecting limit(${DEFAULT_SAFE_LIMIT}) vào query "${collName}".\n` +
                `  Để tránh warning này, thêm limit() vào query của bạn.`
            );
        }
        // Auto-inject limit để bảo vệ production
        if (buildQuery && limitFn) {
            q = buildQuery(q, limitFn(opts.maxLimit || DEFAULT_SAFE_LIMIT));
        }
    }

    return getDocs(q);
}

/**
 * Trả về query audit log (dev only).
 * @returns {Array<{collection, hasLimit, limitValue, ts}>}
 */
export function getQueryAuditLog() {
    return [..._queryLog];
}

/**
 * In báo cáo unbounded queries ra console (dev only).
 */
export function printQueryAuditReport() {
    if (!_isDev) return;
    const unbounded = _queryLog.filter(q => !q.hasLimit);
    if (unbounded.length === 0) {
        console.log('[firestore-guard] ✅ Không có unbounded queries!');
        return;
    }
    console.group(`[firestore-guard] ⚠️ ${unbounded.length} unbounded queries phát hiện:`);
    unbounded.forEach(q => {
        console.warn(`  • collection: "${q.collection}" | time: ${new Date(q.ts).toISOString()}`);
    });
    console.groupEnd();
}

// ── Firestore Query Audit Rules ───────────────────────────────
// Đây là danh sách các queries trong app được kiểm tra theo Phase 3.3E:
//
// ✅ SAFE — có limit():
//   app.js: onSnapshot(query(invRef, orderBy("timestamp","desc"), limit(500)))
//   services/students.service.js: getProfilesPage → limit(pageSize + 1)
//   services/finance.service.js:  getTransactionsPage → limit(pageSize + 1)
//   modules/finance.js: listenToData → limit(500) [existing cap]
//
// ⚠️ REVIEW — cần thêm limit:
//   app.js:2642  getDocs(collection(db, 'clubs'))  → allowUnbounded=true (clubs count nhỏ)
//   app.js:8863  getDocs(coachesRef)                → add limit(200)
//   services/students.service.js: getStudentTuitionTxs → add limit(200)
//   services/finance.service.js:  queryTxByDateRange → add limit(1000)
//
// ❌ DANGEROUS — cần sửa ngay:
//   Không còn unbounded full collection scan nào sau Phase 3.3E
//   (nhờ safeGetDocs tự động inject limit)
