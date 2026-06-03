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
        const { getDocs, query, where, collection, orderBy, startAfter, limit: _limit } = _sdk();
        const db     = _db();
        const clubId = _clubId();
        const colRef = collection(db, 'clubs', clubId, 'transactions');

        // Phase 4J-8A: paginated query — không hard cap 500 nếu võ sinh có nhiều giao dịch
        const PAGE   = 400;
        const MAX_P  = 50;  // tối đa 20.000 giao dịch (safety cap)
        const results = [];
        let cursor   = null;
        let pages    = 0;

        while (pages < MAX_P) {
            const constraints = [
                where('description', '>=', studentName),
                where('description', '<=', studentName + '\uf8ff'),
                orderBy('description'),
                _limit(PAGE),
            ];
            if (cursor) constraints.push(startAfter(cursor));
            const snap = await getDocs(query(colRef, ...constraints));
            snap.forEach(d => results.push({ id: d.id, data: d.data() }));
            if (snap.size < PAGE) break;
            cursor = snap.docs[snap.docs.length - 1];
            pages++;
        }
        return results;
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


// ════════════════════════════════════════════════════════════════
// PHASE 4.0B-4J-8A — Advanced Server-side Student Search
// ════════════════════════════════════════════════════════════════

/**
 * Server-side student search — Phase 4.0B-4J-8A (Phase 3).
 *
 * Tìm kiếm võ sinh toàn CLB bằng server-side query theo searchIndex fields.
 * Không bao giờ load toàn bộ profiles để search.
 *
 * Logic:
 *  - keyword rỗng     → trả về [] (dùng getProfilesPage bình thường)
 *  - keyword SĐT       → query theo searchPhone prefix
 *  - keyword có ≥1 chữ số, ≥6 ký tự  → thử phone trước, fallback searchCode
 *  - keyword bất kỳ    → query song song: searchName (no-tone) + __name__ prefix
 *
 * @param {string} keyword
 * @param {Object} options
 * @param {number}  [options.pageSize=50]
 * @param {boolean} [options.includeQuit=false]
 * @returns {Promise<{results: Object[], hasIndex: boolean, searchField: string}>}
 */
async searchProfilesServerSide(keyword, options = {}) {
    const { getDocs, query, collection, orderBy, limit, startAt, endAt, where } = _sdk();
    const db     = _db();
    const clubId = _clubId();
    const colRef = collection(db, 'clubs', clubId, 'profiles');
    const pageSize = options.pageSize || 50;

    const kw = (keyword || '').trim();
    if (!kw) return { results: [], hasIndex: true, searchField: '' };

    // Helper: normalize without tones
    const _norm = s => s ? s.normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/đ/g,'d').replace(/Đ/g,'D').toLowerCase().replace(/\s+/g,' ').trim() : '';
    const _digits = s => String(s||'').replace(/[^\d]/g,'');

    const kwNorm   = _norm(kw);
    const kwDigits = _digits(kw);
    const looksPhone = /^\d{6,}/.test(kwDigits) && kwDigits.length >= 6;

    const _run = async (field, start, end) => {
        try {
            const snap = await getDocs(query(colRef,
                orderBy(field),
                startAt(start),
                endAt(end + '\uf8ff'),
                limit(pageSize + 1)
            ));
            const docs = [];
            snap.forEach(d => docs.push({ id: d.id, ...d.data() }));
            return { docs, hasIndex: true };
        } catch (e) {
            const msg = (e && e.message) || String(e);
            if (msg.includes('index') || msg.includes('FAILED_PRECONDITION') || msg.includes('no index')) {
                return { docs: [], hasIndex: false };
            }
            throw e;
        }
    };

    // 1. SĐT search
    if (looksPhone) {
        const r = await _run('searchPhone', kwDigits, kwDigits);
        if (r.hasIndex) return { results: r.docs.slice(0, pageSize), hasIndex: true, searchField: 'searchPhone' };
        // Fallback: no index
        console.warn('[SearchIndex] searchPhone không có Firestore index. Cần backfill và tạo index.');
        return { results: [], hasIndex: false, searchField: 'searchPhone' };
    }

    // 2. searchName (no-tone) search + __name__ prefix search (parallel)
    const [nameResult, nameRawResult] = await Promise.all([
        _run('searchName', kwNorm, kwNorm),
        _run('__name__', kw, kw),
    ]);

    const hasIdx = nameResult.hasIndex;
    if (!hasIdx) {
        // Fallback to document ID prefix only
        if (!nameRawResult.hasIndex) {
            return { results: [], hasIndex: false, searchField: 'searchName' };
        }
        return {
            results: nameRawResult.docs.slice(0, pageSize),
            hasIndex: false,
            searchField: '__name__',
        };
    }

    // Merge results, deduplicate by id
    const seen = new Set();
    const merged = [];
    for (const d of [...nameResult.docs, ...nameRawResult.docs]) {
        if (!seen.has(d.id)) {
            seen.add(d.id);
            merged.push(d);
        }
    }
    return {
        results: merged.slice(0, pageSize),
        hasIndex: true,
        searchField: 'searchName',
    };
},

/**
 * Tìm transactions theo mã võ sinh (searchCode prefix).
 * Dùng cho đổi tên và các luồng cần server-side by code.
 * @param {string} code
 * @param {number} [pageSize=50]
 */
async findProfilesByCode(code, pageSize = 50) {
    const { getDocs, query, collection, orderBy, startAt, endAt, limit } = _sdk();
    const db     = _db();
    const clubId = _clubId();
    const colRef = collection(db, 'clubs', clubId, 'profiles');
    const norm   = s => s ? s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/Đ/g,'D').toLowerCase().replace(/\s+/g,' ').trim() : '';
    const codeNorm = norm(code || '');
    if (!codeNorm) return [];
    const snap = await getDocs(query(colRef,
        orderBy('searchCode'),
        startAt(codeNorm),
        endAt(codeNorm + '\uf8ff'),
        limit(pageSize)
    ));
    const docs = [];
    snap.forEach(d => docs.push({ id: d.id, ...d.data() }));
    return docs;
},
};
