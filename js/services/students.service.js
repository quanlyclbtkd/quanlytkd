/**
 * js/services/students.service.js — Phase 3.2A
 * ────────────────────────────────────────────────────────────────
 * Service Layer: Tất cả Firestore operations cho collection PROFILES.
 *
 * Phase 3.2A ADDITIONS:
 *   - getProfilesPage()  — server-side cursor pagination (PAGE_SIZE = 50)
 *     Supports: first, next, previous, refresh
 *     Supports: orderBy __name__ (alphabetical)
 *     Supports: search prefix query (startAt/endAt on __name__)
 *
 * KHÔNG chứa business logic (validation, UI) — chỉ là data layer.
 *
 * /// Phase 3.2A — Server-side Pagination
 * ────────────────────────────────────────────────────────────────
 */

// ── Internal helpers (không export) ──────────────────────────────

/** Lấy Firebase SDK functions từ CDN bridge */
function _sdk()    { return window._fb_init || {}; }
/** Lấy Firestore db instance */
function _db()     { const db = (window.__store || {}).db; if (!db) throw new Error('[StudentService] db chưa sẵn sàng'); return db; }
/** Lấy club ID hiện tại */
function _clubId() { const id = (window.__store || {}).clubId; if (!id) throw new Error('[StudentService] clubId chưa sẵn sàng'); return id; }
/** Shortcut path cho profiles collection */
function _profRef(name) {
    const { doc } = _sdk();
    return doc(_db(), 'clubs', _clubId(), 'profiles', name);
}
/** Shortcut path cho transactions collection */
function _txColRef() {
    return (window.__store || {}).colRef;
}

// ════════════════════════════════════════════════════════════════
// StudentService — Singleton export
// ════════════════════════════════════════════════════════════════

export const StudentService = {

    // ── READ ────────────────────────────────────────────────────

    /**
     * Lấy một profile doc từ Firestore.
     * @param {string} name — doc ID (tên võ sinh)
     * @returns {Object|null} profile data hoặc null nếu không tồn tại
     */
    async getProfile(name) {
        const { getDoc } = _sdk();
        const snap = await getDoc(_profRef(name));
        return snap.exists() ? { id: snap.id, ...snap.data() } : null;
    },

    // ── PAGINATION (Phase 3.2A) ─────────────────────────────────

    /**
     * Lấy một trang profiles theo cursor pagination.
     *
     * Firestore cursor strategy:
     *   - First page:    orderBy('__name__') + limit(pageSize + 1)
     *   - Next page:     startAfter(lastVisible) + limit(pageSize + 1)
     *   - Previous page: startAt(cursor) + limit(pageSize + 1)
     *   - Search:        startAt(searchQuery) + endAt(searchQuery + '\uf8ff')
     *
     * Fetch pageSize + 1 docs để phát hiện hasNext mà không cần
     * một query đếm riêng (giảm Firestore reads).
     *
     * @param {Object} options
     * @param {number}                  options.pageSize    — số docs mỗi trang (default 50)
     * @param {DocumentSnapshot|null}   options.cursor      — lastVisible (next) hoặc firstVisible (prev)
     * @param {'first'|'next'|'prev'}   options.direction   — hướng navigate
     * @param {string}                  options.search      — tìm kiếm theo tên (prefix match)
     * @param {string}                  options.statusFilter — '' | 'active' | 'quit'
     * @param {string}                  options.branchFilter — '' | 'CS1' | 'CS2' ...
     * @returns {QuerySnapshot} raw snapshot để processPage() xử lý
     */
    async getProfilesPage({
        pageSize     = 50,
        cursor       = null,
        direction    = 'first',
        search       = '',
        statusFilter = '',
        branchFilter = '',
    } = {}) {
        const { getDocs, query, collection, orderBy, limit, startAfter, startAt, endAt, where } = _sdk();
        const db     = _db();
        const clubId = _clubId();
        const colRef = collection(db, 'clubs', clubId, 'profiles');

        // [Part 8 FIX] Debug log — enable with: window.__DEBUG_STUDENT_PAGINATION = true
        if (window.__DEBUG_STUDENT_PAGINATION) {
            console.log('[StudentService.getProfilesPage]', {
                pageSize,
                direction,
                search,
                cursorId: cursor ? (cursor.id || String(cursor)) : '',
                statusFilter,
                branchFilter,
            });
        }

        const constraints = [];

        // ── Filters (requires Firestore composite indexes for combinations) ──
        // NOTE: We use simple orderBy(__name__) to avoid needing extra indexes.
        // Status & branch filters are applied AFTER fetch (client-side trim)
        // when the filter count per page is low enough.
        // For heavy status/branch filtering, future versions can add where() clauses
        // with the appropriate composite index.
        if (statusFilter === 'active') {
            constraints.push(where('status', '!=', 'quit'));
        } else if (statusFilter === 'quit') {
            constraints.push(where('status', '==', 'quit'));
        }

        // Order by document ID (name) alphabetically
        constraints.push(orderBy('__name__'));

        // ── Search: prefix match on doc ID (name) ──
        if (search && search.trim()) {
            const q = search.trim();
            constraints.push(startAt(q));
            constraints.push(endAt(q + '\uf8ff'));
        } else {
            // ── Cursor navigation ──
            if (cursor && direction === 'next') {
                constraints.push(startAfter(cursor));
            } else if (cursor && direction === 'prev') {
                constraints.push(startAt(cursor));
            }
        }

        constraints.push(limit(pageSize + 1)); // +1 để detect hasNext

        return getDocs(query(colRef, ...constraints));
    },

    // ── CREATE ──────────────────────────────────────────────────

    /**
     * Tạo profile doc mới (setDoc — tạo mới hoặc ghi đè).
     * @param {string} key  — doc ID (tên võ sinh, có thể là "Tên (năm-Nick)")
     * @param {Object} data — profile data
     */
    async createProfile(key, data) {
        const { setDoc } = _sdk();
        await setDoc(_profRef(key), data);
    },

    // ── UPDATE ──────────────────────────────────────────────────

    /**
     * Cập nhật một số fields của profile (merge: true → không ghi đè fields cũ).
     * @param {string} name — doc ID
     * @param {Object} data — object chứa chỉ các fields cần update
     */
    async updateProfile(name, data) {
        const { setDoc } = _sdk();
        await setDoc(_profRef(name), data, { merge: true });
    },

    /**
     * updateDoc (chỉ các fields được chỉ định, hỗ trợ FieldValue như increment/arrayUnion).
     * @param {string} name — doc ID
     * @param {Object} data — update object (có thể chứa FieldValue)
     */
    async patchProfile(name, data) {
        const { updateDoc } = _sdk();
        await updateDoc(_profRef(name), data);
    },

    /**
     * Thêm tháng vào skippedMonths (arrayUnion → safe concurrent writes).
     * @param {string} name  — doc ID
     * @param {string} month — YYYY-MM
     */
    async addSkippedMonth(name, month) {
        const { setDoc, arrayUnion } = _sdk();
        await setDoc(
            _profRef(name.trim()),
            { skippedMonths: arrayUnion(month) },
            { merge: true }
        );
    },

    /**
     * Xóa tháng khỏi skippedMonths (arrayRemove → safe concurrent writes).
     * @param {string} name  — doc ID
     * @param {string} month — YYYY-MM
     */
    async removeSkippedMonth(name, month) {
        const { setDoc, arrayRemove } = _sdk();
        await setDoc(
            _profRef(name.trim()),
            { skippedMonths: arrayRemove(month) },
            { merge: true }
        );
    },

    // ── DELETE ──────────────────────────────────────────────────

    /**
     * Xóa profile doc vĩnh viễn.
     * @param {string} name — doc ID
     */
    async deleteProfile(name) {
        const { deleteDoc } = _sdk();
        await deleteDoc(_profRef(name));
    },

    // ── BATCH RENAME ────────────────────────────────────────────

    /**
     * Đổi tên võ sinh — atomic batch operation:
     *   1. Tạo doc mới với tên mới
     *   2. Xóa doc cũ
     *   3. Cập nhật tên trong tất cả transactions liên quan
     *
     * @param {string} oldName      — tên cũ (doc ID cũ)
     * @param {string} newName      — tên mới (doc ID mới)
     * @param {Object} newData      — toàn bộ data cho doc mới
     * @param {Array}  txUpdates    — array of { txId, newDesc } cần cập nhật
     */
    async renameWithBatch(oldName, newName, newData, txUpdates = []) {
        const { doc, writeBatch } = _sdk();
        const db     = _db();
        const clubId = _clubId();

        const batch = writeBatch(db);

        // Set doc mới
        batch.set(doc(db, 'clubs', clubId, 'profiles', newName), newData);
        // Delete doc cũ
        batch.delete(doc(db, 'clubs', clubId, 'profiles', oldName));

        // Cập nhật tất cả transactions liên quan
        txUpdates.forEach(({ txId, newDesc }) => {
            batch.update(
                doc(db, 'clubs', clubId, 'transactions', txId),
                { description: newDesc }
            );
        });

        await batch.commit();
    },

    /**
     * Tìm tất cả transactions có description bắt đầu bằng studentName.
     * Dùng trước khi renameWithBatch để build danh sách txUpdates.
     *
     * @param {string} studentName
     * @returns {Array<{id, data}>} — danh sách snapshot docs
     */
    async findTransactionsByStudent(studentName) {
        // Phase 4J-9: Thêm limit, orderBy, startAfter vào destructuring để fix ReferenceError.
        // Dùng window.fetchQueryPages nếu có để tránh bỏ sót tx với võ sinh nhiều năm.
        const { getDocs, query, where, collection, orderBy, limit, startAfter } = _sdk();
        const db     = _db();
        const clubId = _clubId();
        const colRef = collection(db, 'clubs', clubId, 'transactions');

        if (typeof window.fetchQueryPages === 'function') {
            const allDocs = await window.fetchQueryPages(
                ({ cursor, pageSize }) => {
                    const _c = [
                        where('description', '>=', studentName),
                        where('description', '<=', studentName + '\uf8ff'),
                        orderBy('description'),
                        limit(pageSize)
                    ];
                    if (cursor) _c.splice(-1, 0, startAfter(cursor));
                    return query(colRef, ..._c);
                },
                { pageSize: 200, reason: 'findTxByStudent', domain: 'transactions' }
            );
            return allDocs.map(d => ({ id: d.id, data: d.data() }));
        }
        // Fallback nếu fetchQueryPages chưa khả dụng (runtime chưa init)
        if (typeof window.warnUnsafeLimit === 'function') window.warnUnsafeLimit('students.service:findTxByStudent:limit500', 'service-findTxByStudent-fallback');
        const snap = await getDocs(
            query(colRef,
                where('description', '>=', studentName),
                where('description', '<=', studentName + '\uf8ff'),
                limit(500) // fallback — fetchQueryPages unavailable
            )
        );
        const results = [];
        snap.forEach(d => results.push({ id: d.id, data: d.data() }));
        return results;
    },

    // ── SERVER-SIDE SEARCH (Phase 4.0B-4J-8A) ──────────────────

    /**
     * Tìm kiếm server-side theo nhiều trường: tên (normalized), SĐT, mã HV, biệt danh.
     *
     * Các trường searchName / searchPhone / searchCode / searchNickname được ghi
     * khi thêm/sửa hồ sơ bởi buildStudentSearchIndex() trong app.js.
     * Hồ sơ cũ chưa có index → fallback về prefix match theo __name__.
     *
     * Trả về: { items, hasMore, nextCursor, source, searchTerm, normalizedSearchTerm }
     *
     * @param {string} searchTerm     — chuỗi người dùng nhập
     * @param {Object} options
     * @param {number} options.pageSize — số kết quả tối đa (default 50)
     * @returns {Promise<{items: Array, hasMore: boolean, nextCursor: null, source: string, searchTerm: string, normalizedSearchTerm: string}>}
     */
    async searchProfilesServerSide(searchTerm, options = {}) {
        const { getDocs, query, collection, orderBy, where, limit, startAt, endAt } = _sdk();
        const db     = _db();
        const clubId = _clubId();
        const colRef = collection(db, 'clubs', clubId, 'profiles');
        const pageSize = options.pageSize || 50;

        const raw = String(searchTerm || '').trim();
        if (!raw) {
            return { items: [], hasMore: false, nextCursor: null,
                source: 'empty', searchTerm: raw, normalizedSearchTerm: '' };
        }

        // Normalize helper — mirror buildStudentSearchIndex in app.js (no import)
        const _noTone = s => s
            ? s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
                .replace(/đ/g, 'd').replace(/Đ/g, 'D')
            : '';
        const normalized = _noTone(raw).toLowerCase().trim().replace(/\s+/g, ' ');
        const phoneNorm  = raw.replace(/\D/g, '');
        const isPhone    = /^\d{6,}$/.test(phoneNorm);

        const resultMap = new Map(); // key = doc.id → dedupe
        let hasMore = false;
        let source  = 'name';

        const _run = async (q, tag) => {
            try {
                const snap = await getDocs(q);
                snap.forEach(d => {
                    if (!resultMap.has(d.id)) resultMap.set(d.id, { id: d.id, ...d.data() });
                });
                if (snap.size > pageSize) hasMore = true;
                return snap.size;
            } catch (e) {
                // PHẦN 6: Không fail toàn bộ search khi thiếu index hoặc gặp permission error
                if (e && (e.code === 'failed-precondition' || e.code === 'permission-denied')) {
                    console.warn('[StudentService.search] Bỏ qua query lỗi (', e.code, ') cho', tag,
                        '— tiếp tục fallback. Chi tiết:', e.message);
                } else if (e) {
                    console.warn('[StudentService.search] Query warning cho', tag, ':', e.message || e);
                }
                return 0;
            }
        };

        if (isPhone && phoneNorm.length >= 6) {
            // Tìm theo SĐT trước
            await _run(
                query(colRef, orderBy('searchPhone'), startAt(phoneNorm), endAt(phoneNorm + '\uf8ff'), limit(pageSize + 1)),
                'searchPhone'
            );
            source = 'phone';
        }

        if (!isPhone || resultMap.size === 0) {
            // Tìm theo tên đã chuẩn hoá (searchName field)
            if (normalized) {
                await _run(
                    query(colRef, orderBy('searchName'), startAt(normalized), endAt(normalized + '\uf8ff'), limit(pageSize + 1)),
                    'searchName'
                );
            }
            // Phase 4J-9B: Tìm theo searchNameTokens (array-contains) — tìm được giữa tên.
            // Ví dụ: "Văn A" → normalize "van a" → token "van" → matches "Nguyễn Văn A".
            // Chỉ chạy khi prefix search chưa tìm thấy. Tránh false-positive quá rộng.
            // Requires: searchNameTokens field (buildStudentSearchIndex) + Firestore array-contains.
            if (resultMap.size === 0 && normalized.length >= 2) {
                const _toks = normalized.split(' ').filter(t => t.length >= 2);
                for (const _tok of _toks) {
                    if (resultMap.size >= pageSize) break;
                    await _run(
                        query(colRef, where('searchNameTokens', 'array-contains', _tok), limit(pageSize + 1)),
                        'searchNameTokens:' + _tok
                    );
                }
            }

            // Fallback: prefix match trên doc ID (__name__) cho hồ sơ cũ chưa có index
            if (resultMap.size === 0) {
                await _run(
                    query(colRef, orderBy('__name__'), startAt(raw), endAt(raw + '\uf8ff'), limit(pageSize + 1)),
                    '__name__-prefix'
                );
                if (resultMap.size === 0 && normalized !== raw) {
                    await _run(
                        query(colRef, orderBy('__name__'), startAt(normalized), endAt(normalized + '\uf8ff'), limit(pageSize + 1)),
                        '__name__-normalized'
                    );
                }
                if (resultMap.size === 0) {
                    console.info('[StudentService.search] Không tìm thấy kết quả cho "' + raw + '".',
                        'Hồ sơ cũ có thể chưa có searchName index. Chạy backfill-student-search-index để backfill.');
                }
            }
            // Tìm theo mã học viên (searchCode)
            if (normalized.length >= 2) {
                await _run(
                    query(colRef, orderBy('searchCode'), startAt(normalized), endAt(normalized + '\uf8ff'), limit(pageSize + 1)),
                    'searchCode'
                );
            }
            // Tìm theo biệt danh (searchNickname)
            if (normalized.length >= 2) {
                await _run(
                    query(colRef, orderBy('searchNickname'), startAt(normalized), endAt(normalized + '\uf8ff'), limit(pageSize + 1)),
                    'searchNickname'
                );
            }
        }

        const items = Array.from(resultMap.values()).slice(0, pageSize);
        return {
            items,
            hasMore: hasMore || resultMap.size > pageSize,
            nextCursor: null,
            source,
            searchTerm: raw,
            normalizedSearchTerm: normalized,
            resultCount: items.length,
            possibleMissingSearchIndex: items.length === 0,
        };
    },

    // ── INVENTORY (delegated from students flow) ────────────────

    /**
     * Ghi xuất kho võ phục khi thêm võ sinh mới.
     * Delegate cho InventoryService nếu cần decoupling thêm.
     * Hiện tại vẫn dùng invRef từ store vì đây là cross-collection write.
     *
     * @param {Object} data — inventory entry data
     * @returns {string} ID của doc vừa tạo
     */
    async addInventoryEntry(data) {
        const { addDoc } = _sdk();
        const invRef = (window.__store || {}).invRef;
        if (!invRef) throw new Error('[StudentService] invRef chưa sẵn sàng');
        const docRef = await addDoc(invRef, data);
        return docRef.id;
    },

    /**
     * Ghi transaction học phí khi thêm võ sinh mới.
     * @param {Object} data — transaction data
     */
    async addTuitionTransaction(data) {
        const { addDoc } = _sdk();
        const colRef = _txColRef();
        if (!colRef) throw new Error('[StudentService] colRef chưa sẵn sàng');
        await addDoc(colRef, data);
    },

    /**
     * Ghi transaction tặng/bán võ phục khi thêm võ sinh mới.
     * @param {Object} data — transaction data
     */
    async addUniformTransaction(data) {
        const { addDoc } = _sdk();
        const colRef = _txColRef();
        if (!colRef) throw new Error('[StudentService] colRef chưa sẵn sàng');
        await addDoc(colRef, data);
    },

    /**
     * Giảm stock khi xuất kho võ phục (dùng Firebase increment FieldValue).
     * Ghi vào settings/inventory_stats với merge: true.
     * @param {string} uniformSize — kích cỡ (ví dụ "Size 1m5")
     */
    async decrementInventoryStock(uniformSize) {
        const { doc, setDoc, increment } = _sdk();
        const db     = _db();
        const clubId = _clubId();
        await setDoc(
            doc(db, 'clubs', clubId, 'settings', 'inventory_stats'),
            {
                [uniformSize + '_balance']: increment(-1),
                [uniformSize + '_out']:     increment(1),
            },
            { merge: true }
        );
    },

    /**
     * Cập nhật stock count trong inventory summary doc (raw data).
     * @param {Object} data — object có thể chứa FieldValue increment
     */
    async updateInventorySummary(data) {
        const { doc, setDoc } = _sdk();
        const db     = _db();
        const clubId = _clubId();
        await setDoc(
            doc(db, 'clubs', clubId, 'settings', 'inventory_stats'),
            data,
            { merge: true }
        );
    },
};
