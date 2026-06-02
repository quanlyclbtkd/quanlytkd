/**
 * js/services/inventory.service.js — Phase 3.1
 * ────────────────────────────────────────────────────────────────
 * Service Layer: Tất cả Firestore operations cho:
 *   - inventory collection (addDoc, getDoc, updateDoc)
 *   - transactions collection (addDoc, getDoc, updateDoc) — liên quan kho
 *   - settings/inv_categories (getDoc, setDoc) — danh mục tùy chỉnh
 *
 * Module inventory.js KHÔNG gọi Firebase trực tiếp nữa.
 * ────────────────────────────────────────────────────────────────
 */

function _sdk()     { return window._fb_init || {}; }
function _db()      { const db = (window.__store || {}).db; if (!db) throw new Error('[InventoryService] db chưa sẵn sàng'); return db; }
function _clubId()  { const id = (window.__store || {}).clubId; if (!id) throw new Error('[InventoryService] clubId chưa sẵn sàng'); return id; }
function _invRef()  { return (window.__store || {}).invRef; }
function _colRef()  { return (window.__store || {}).colRef; }

export const InventoryService = {

    // ── CATEGORIES ───────────────────────────────────────────────

    /**
     * Load danh mục kho tùy chỉnh từ Firestore.
     * @returns {Array<{name, sizes}>}
     */
    async loadCategories() {
        const { doc, getDoc } = _sdk();
        try {
            const snap = await getDoc(
                doc(_db(), 'clubs', _clubId(), 'settings', 'inv_categories')
            );
            return snap.exists() ? (snap.data().categories || []) : [];
        } catch (_) {
            return [];
        }
    },

    /**
     * Lưu danh sách danh mục kho tùy chỉnh.
     * @param {Array} categories — mảng { name, sizes[] }
     */
    async saveCategories(categories) {
        const { doc, setDoc } = _sdk();
        await setDoc(
            doc(_db(), 'clubs', _clubId(), 'settings', 'inv_categories'),
            { categories },
            { merge: true }
        );
    },

    // ── INVENTORY ITEMS ─────────────────────────────────────────

    /**
     * Lấy một bản ghi kho theo ID.
     * @param {string} invId
     * @returns {Object|null}
     */
    async getItem(invId) {
        const { doc, getDoc } = _sdk();
        const snap = await getDoc(
            doc(_db(), 'clubs', _clubId(), 'inventory', invId)
        );
        return snap.exists() ? { id: snap.id, ...snap.data() } : null;
    },

    /**
     * Thêm một bản ghi kho mới (Nhập hoặc Xuất).
     * @param {Object} data — { category, size, type, qty, desc, amount, date, ... }
     * @returns {string} ID của doc vừa tạo
     */
    async addItem(data) {
        const { addDoc } = _sdk();
        const invRef = _invRef();
        if (!invRef) throw new Error('[InventoryService] invRef chưa sẵn sàng');
        const docRef = await addDoc(invRef, data);
        return docRef.id;
    },

    /**
     * Sửa bản ghi kho.
     * @param {string} invId — doc ID
     * @param {Object} data  — fields cần update
     */
    async updateItem(invId, data) {
        const { doc, updateDoc } = _sdk();
        await updateDoc(
            doc(_db(), 'clubs', _clubId(), 'inventory', invId),
            data
        );
    },

    /**
     * Đánh dấu đơn hàng nợ đã thu tiền.
     * @param {string} invId
     */
    async markPaid(invId) {
        return this.updateItem(invId, { unpaid: false });
    },

    // ── PAGINATION (Phase 4J-8) ──────────────────────────────────

    /**
     * Lấy một trang inventory theo cursor pagination.
     * Hỗ trợ 1000-student clubs với nhiều bản ghi nhập/xuất kho.
     *
     * Strategy:
     *   - Order by timestamp desc (mới nhất trước)
     *   - Filter by type (Nhập/Xuất/Xuất bán) hoặc date range nếu cần
     *   - Fetch pageSize + 1 để detect hasNext
     *   - Cursor: startAfter(lastVisible) for next, startAt(cursor) for prev
     *
     * @param {Object} options
     * @param {number}                  options.pageSize  — docs per page (default 100)
     * @param {DocumentSnapshot|null}   options.cursor    — cursor doc snapshot
     * @param {'first'|'next'|'prev'}   options.direction — navigation direction
     * @param {string}                  options.typeFilter — '' | 'Nhập' | 'Xuất' | 'Xuất bán'
     * @param {string}                  options.startDate — YYYY-MM-DD (optional date range)
     * @param {string}                  options.endDate   — YYYY-MM-DD (optional date range)
     * @returns {QuerySnapshot} raw snapshot
     */
    async getInventoryPage({
        pageSize   = 100,
        cursor     = null,
        direction  = 'first',
        typeFilter = '',
        startDate  = '',
        endDate    = '',
    } = {}) {
        const { getDocs, query, collection, orderBy, limit, startAfter, startAt, where } = _sdk();
        const db     = _db();
        const clubId = _clubId();
        const invRef = collection(db, 'clubs', clubId, 'inventory');

        const constraints = [];

        // ── Filters ──
        if (typeFilter) {
            constraints.push(where('type', '==', typeFilter));
        }
        if (startDate && endDate) {
            constraints.push(where('date', '>=', startDate));
            constraints.push(where('date', '<=', endDate));
            constraints.push(orderBy('date', 'desc'));
        } else {
            constraints.push(orderBy('timestamp', 'desc'));
        }

        // ── Cursor navigation ──
        if (cursor && direction === 'next') {
            constraints.push(startAfter(cursor));
        } else if (cursor && direction === 'prev') {
            constraints.push(startAt(cursor));
        }

        constraints.push(limit(pageSize + 1)); // +1 để detect hasNext

        return getDocs(query(invRef, ...constraints));
    },

    // ── TRANSACTIONS (liên quan kho) ─────────────────────────────

    /**
     * Lấy một transaction doc liên quan đến kho.
     * @param {string} txId
     * @returns {Object|null}
     */
    async getTransaction(txId) {
        const { doc, getDoc } = _sdk();
        const snap = await getDoc(
            doc(_db(), 'clubs', _clubId(), 'transactions', txId)
        );
        return snap.exists() ? { id: snap.id, ...snap.data() } : null;
    },

    /**
     * Thêm transaction kế toán cho một nghiệp vụ kho (Nhập/Xuất/Tặng).
     * @param {Object} data — transaction data
     * @returns {string} ID của doc vừa tạo
     */
    async addTransaction(data) {
        const { addDoc } = _sdk();
        const colRef = _colRef();
        if (!colRef) throw new Error('[InventoryService] colRef chưa sẵn sàng');
        const docRef = await addDoc(colRef, data);
        return docRef.id;
    },

    /**
     * Sửa transaction kế toán liên quan kho.
     * @param {string} txId — doc ID
     * @param {Object} data — fields cần update
     */
    async updateTransaction(txId, data) {
        const { doc, updateDoc } = _sdk();
        await updateDoc(
            doc(_db(), 'clubs', _clubId(), 'transactions', txId),
            data
        );
    },
};
