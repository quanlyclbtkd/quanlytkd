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
        const payload = { ...(data || {}) };
        if (payload.type === 'Xuất bán' && payload.desc && typeof window.resolveInventoryDebtIdentity === 'function') {
            const identity = window.resolveInventoryDebtIdentity(payload.desc);
            if (identity.profileId) payload.profileId = identity.profileId;
            if (identity.memberId) payload.memberId = identity.memberId;
            if (!payload.studentName && identity.studentName) payload.studentName = identity.studentName;
        }
        const docRef = await addDoc(invRef, payload);

        // Phase 4K-6V2B: maintain the one-document inventory summary for every
        // new category/size. This is a WRITE-only increment (zero extra reads)
        // and lets Thu gộp / Thêm võ sinh discover new sizes before Kho is opened.
        try {
            const { doc, setDoc, increment } = _sdk();
            const category = String(payload.category || 'Võ phục').trim() || 'Võ phục';
            const size = String(payload.size || '').trim();
            const qty = Math.max(0, Number(payload.qty !== undefined ? payload.qty : payload.quantity) || 0);
            if (size && qty > 0 && typeof increment === 'function') {
                const base = category + '|||' + size;
                const isIn = String(payload.type || '').toLowerCase().includes('nhập');
                const patch = {
                    [base + '_balance']: increment(isIn ? qty : -qty),
                    [base + (isIn ? '_in' : '_out')]: increment(qty)
                };
                await setDoc(
                    doc(_db(), 'clubs', _clubId(), 'settings', 'inventory_stats'),
                    patch,
                    { merge: true }
                );
            }
        } catch (summaryError) {
            console.warn('[InventoryService] inventory_stats increment failed; history write kept:', summaryError);
        }

        window.notifyInventoryMutation?.('inventory-service-add-item');
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
        window.notifyInventoryMutation?.('inventory-service-update-item');
    },

    /**
     * Đánh dấu đơn hàng nợ đã thu tiền.
     * Phase 4K-4D: Tạo/cập nhật transaction doanh thu kho khi Đã Thu.
     * Trả về { alreadyPaid, inv, txId }.
     * @param {string} invId
     * @param {Object} [options] - { date: 'YYYY-MM-DD' } để override ngày thu
     */
    async markPaid(invId, options = {}) {
        const { doc, getDoc, updateDoc, addDoc, query, where, getDocs, collection } = _sdk();
        const db     = _db();
        const clubId = _clubId();

        // 1. Load inventory doc
        const invSnap = await getDoc(doc(db, 'clubs', clubId, 'inventory', invId));
        if (!invSnap.exists()) throw new Error('[InventoryService] Inventory item not found: ' + invId);

        const inv = { id: invSnap.id, ...invSnap.data() };

        // 2. Kiểm tra đã thu trước đó chưa
        if (inv.unpaid === false && inv.inventoryDebtStatus === 'paid') {
            return { alreadyPaid: true, inv };
        }

        const today   = options.date
            || (typeof window.getLocalToday === 'function' ? window.getLocalToday() : new Date().toISOString().slice(0, 10));
        const txMonth = today.slice(0, 7);

        // 3. Tìm transaction đã có relatedInvId
        const txRef  = collection(db, 'clubs', clubId, 'transactions');
        const q      = query(txRef, where('relatedInvId', '==', invId));
        const txSnap = await getDocs(q);

        const invAmount = Number(inv.amount || 0);
        if (invAmount <= 0) {
            console.warn('[InventoryService] markPaid: amount <= 0 cho invId=' + invId + '. Sẽ vẫn mark paid nhưng không tạo transaction.');
        }

        const txData = {
            branch:               inv.branch || 'Chung',
            type:                 'Thu ' + (inv.category || 'Võ phục'),
            description:          ('Thu nợ ' + (inv.category || 'Võ phục') + ' ' + (inv.size || '') + ' của ' + (inv.desc || '')).trim(),
            amount:               invAmount,
            date:                 today,
            txMonth,
            timestamp:            Date.now(),
            relatedInvId:         invId,
            inventoryDebtPayment: true,
            inventoryDebtPaidAt:  Date.now(),
            inventoryCategory:    inv.category || 'Võ phục',
            inventorySize:        inv.size  || '',
            inventoryDesc:        inv.desc  || '',
        };

        let txId = '';

        // 4. Cập nhật transaction cũ nếu có, hoặc tạo mới
        if (!txSnap.empty) {
            const existing = txSnap.docs[0];
            txId = existing.id;
            await updateDoc(existing.ref, txData);
        } else {
            if (invAmount > 0) {
                const newTx = await addDoc(txRef, txData);
                txId = newTx.id;
            }
        }

        // 5. Update inventory doc
        const invUpdate = {
            unpaid:               false,
            inventoryDebtStatus:  'paid',
            paidAt:               Date.now(),
            paidDate:             today,
        };
        if (txId) invUpdate.paidTxId = txId;

        await updateDoc(doc(db, 'clubs', clubId, 'inventory', invId), invUpdate);
        window.notifyInventoryMutation?.('inventory-service-mark-paid');

        return { alreadyPaid: false, inv, txId };
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
