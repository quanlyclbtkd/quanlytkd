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



// ════════════════════════════════════════════════════════════════
// Phase 4K-6V2C — Canonical inventory stock ledger
// Every inventory mutation must update settings/inventory_stats in the
// same batch. This prevents a saved history row from diverging from stock.
// ════════════════════════════════════════════════════════════════
function _normText(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'D')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
}

function _isInventoryIn(item) {
    const type = _normText(item && (item.type || item.transactionType));
    return type.includes('nhap') || type === 'import';
}

function _inventoryQty(item) {
    const raw = item && (item.qty !== undefined ? item.qty : item.quantity);
    const qty = Number(raw === undefined ? 1 : raw);
    return Number.isFinite(qty) && qty > 0 ? qty : 0;
}

function _inventoryBase(item) {
    const category = String(item && (item.category || item.itemCategory) || 'Võ phục').trim() || 'Võ phục';
    const size = String(item && (item.size || item.itemSize || item.uniformSize || item.variant) || '').trim();
    return size ? { category, size, base: category + '|||' + size } : null;
}

function _accumulateLedgerDelta(deltaMap, item, direction) {
    const info = _inventoryBase(item);
    const qty = _inventoryQty(item);
    if (!info || qty <= 0) return;
    const slot = deltaMap.get(info.base) || { balance: 0, in: 0, out: 0 };
    if (_isInventoryIn(item)) {
        slot.balance += direction * qty;
        slot.in += direction * qty;
    } else {
        slot.balance -= direction * qty;
        slot.out += direction * qty;
    }
    deltaMap.set(info.base, slot);
}

function _buildLedgerIncrementPatch(mutations, incrementFn) {
    const deltaMap = new Map();
    for (const mutation of (Array.isArray(mutations) ? mutations : [])) {
        if (!mutation || !mutation.item) continue;
        _accumulateLedgerDelta(deltaMap, mutation.item, mutation.direction === -1 ? -1 : 1);
    }
    const patch = {};
    deltaMap.forEach((delta, base) => {
        if (delta.balance) patch[base + '_balance'] = incrementFn(delta.balance);
        if (delta.in) patch[base + '_in'] = incrementFn(delta.in);
        if (delta.out) patch[base + '_out'] = incrementFn(delta.out);
    });
    return patch;
}

function _mergeRuntimeInventory(item, reason) {
    if (!item || !item.id) return;
    if (typeof window.mergeInventoryIntoRuntimeStore === 'function') {
        window.mergeInventoryIntoRuntimeStore(item, reason || 'inventory-service-write-through');
    }
}

function _removeRuntimeInventory(invId, reason) {
    if (!invId) return;
    if (typeof window.removeInventoryFromRuntimeStore === 'function') {
        window.removeInventoryFromRuntimeStore(invId, reason || 'inventory-service-delete-through');
    }
}

function _buildLiteralSummary(items) {
    const normalized = new Map();
    for (const item of (Array.isArray(items) ? items : [])) {
        const info = _inventoryBase(item);
        const qty = _inventoryQty(item);
        if (!info || qty <= 0) continue;
        const identity = _normText(info.category).replace(/[^a-z0-9]+/g, '') + '|||' + _normText(info.size).replace(/[^a-z0-9]+/g, '');
        const slot = normalized.get(identity) || {
            category: info.category,
            size: info.size,
            in: 0,
            out: 0
        };
        if (_isInventoryIn(item)) slot.in += qty;
        else slot.out += qty;
        if (info.size.length > slot.size.length) slot.size = info.size;
        normalized.set(identity, slot);
    }
    const summary = {};
    normalized.forEach(slot => {
        const base = slot.category + '|||' + slot.size;
        summary[base + '_in'] = slot.in;
        summary[base + '_out'] = slot.out;
        summary[base + '_balance'] = slot.in - slot.out;
    });
    summary._schemaVersion = '4K-6V2C';
    summary._rebuiltAt = Date.now();
    summary._rebuiltDocCount = Array.isArray(items) ? items.length : 0;
    return summary;
}

function _toMillis(value) {
    if (value === null || value === undefined || value === '') return 0;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (value instanceof Date) return value.getTime();
    if (value && typeof value.toMillis === 'function') {
        const n = Number(value.toMillis());
        return Number.isFinite(n) ? n : 0;
    }
    if (value && Number.isFinite(Number(value.seconds))) {
        return Number(value.seconds) * 1000 + Math.floor(Number(value.nanoseconds || 0) / 1e6);
    }
    const parsed = Date.parse(String(value));
    return Number.isFinite(parsed) ? parsed : 0;
}

function _dateFromMillis(ms) {
    if (!Number.isFinite(ms) || ms <= 0) return '1970-01-01';
    const d = new Date(ms);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function _canonicalTemporalPatch(item) {
    const existingDate = /^\d{4}-\d{2}-\d{2}$/.test(String(item && item.date || '').trim())
        ? String(item.date).trim()
        : '';
    const millis = _toMillis(item && (item.timestamp || item.createdAt || item.updatedAt || item.paidAt));
    const timestamp = millis > 0 ? millis : 0;
    const date = existingDate || _dateFromMillis(timestamp);
    const patch = {};
    if (!existingDate) patch.date = date;
    if (!_toMillis(item && item.timestamp)) patch.timestamp = timestamp;
    if (!existingDate && timestamp === 0) patch.legacyDateUnknown = true;
    return patch;
}

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
        const { doc, writeBatch, runTransaction, increment } = _sdk();
        const invRef = _invRef();
        if (!invRef) throw new Error('[InventoryService] invRef chưa sẵn sàng');
        if (typeof increment !== 'function') throw new Error('[InventoryService] Firestore increment chưa sẵn sàng');

        const payload = { ...(data || {}) };
        if (!payload.timestamp) payload.timestamp = Date.now();
        if (!payload.date) payload.date = typeof window.getLocalToday === 'function' ? window.getLocalToday() : new Date().toISOString().slice(0, 10);
        if (payload.type === 'Xuất bán' && payload.desc && typeof window.resolveInventoryDebtIdentity === 'function') {
            const identity = window.resolveInventoryDebtIdentity(payload.desc);
            if (identity.profileId) payload.profileId = identity.profileId;
            if (identity.memberId) payload.memberId = identity.memberId;
            if (!payload.studentName && identity.studentName) payload.studentName = identity.studentName;
        }

        const db = _db();
        const itemRef = doc(invRef);
        const statsRef = doc(db, 'clubs', _clubId(), 'settings', 'inventory_stats');
        const summaryPatch = _buildLedgerIncrementPatch([{ item: payload, direction: 1 }], increment);
        const info = _inventoryBase(payload);
        const count = _inventoryQty(payload);
        const isOutgoing = !_isInventoryIn(payload);

        // Strict posted inventory writes must validate stock inside the same
        // Firestore transaction. This prevents two devices from both selling
        // the final unit and pushing inventory below zero.
        if (isOutgoing && info && count > 0) {
            if (typeof runTransaction !== 'function') throw new Error('[InventoryService] Firestore transaction chưa sẵn sàng');
            await runTransaction(db, async transaction => {
                const statsSnap = await transaction.get(statsRef);
                const stats = statsSnap.exists() ? (statsSnap.data() || {}) : {};
                const available = Number(stats[info.base + '_balance'] || 0);
                if (available < count) {
                    throw new Error(`Kho không đủ ${info.category} ${info.size}: còn ${available}, cần ${count}.`);
                }
                transaction.set(itemRef, payload);
                if (Object.keys(summaryPatch).length) transaction.set(statsRef, summaryPatch, { merge: true });
            });
        } else {
            if (typeof writeBatch !== 'function') throw new Error('[InventoryService] Firestore batch chưa sẵn sàng');
            const batch = writeBatch(db);
            batch.set(itemRef, payload);
            if (Object.keys(summaryPatch).length) batch.set(statsRef, summaryPatch, { merge: true });
            await batch.commit();
        }

        const runtimeItem = { id: itemRef.id, ...payload };
        _mergeRuntimeInventory(runtimeItem, 'inventory-service-add-item');
        window.notifyInventoryMutation?.('inventory-service-add-item', { writeThrough: true });
        return itemRef.id;
    },

    /**
     * Sửa bản ghi kho.
     * @param {string} invId — doc ID
     * @param {Object} data  — fields cần update
     */
    async updateItem(invId, data, options = {}) {
        const { doc, getDoc, writeBatch, increment } = _sdk();
        const db = _db();
        const itemRef = doc(db, 'clubs', _clubId(), 'inventory', invId);
        let previous = options.previous && typeof options.previous === 'object' ? options.previous : null;
        if (!previous) {
            const snap = await getDoc(itemRef); // one read only when the caller has no local original
            if (!snap.exists()) throw new Error('[InventoryService] Inventory item not found: ' + invId);
            previous = { id: snap.id, ...snap.data() };
        }
        const next = { ...previous, ...(data || {}), id: invId };
        if (!next.timestamp) next.timestamp = Date.now();

        const summaryPatch = _buildLedgerIncrementPatch([
            { item: previous, direction: -1 },
            { item: next, direction: 1 }
        ], increment);
        const batch = writeBatch(db);
        batch.update(itemRef, data || {});
        if (Object.keys(summaryPatch).length) {
            batch.set(doc(db, 'clubs', _clubId(), 'settings', 'inventory_stats'), summaryPatch, { merge: true });
        }
        if (options.relatedTransaction && options.relatedTransaction.id) {
            const relatedPatch = typeof window.canonicalizeTransactionPatch === 'function'
                ? window.canonicalizeTransactionPatch(
                    options.relatedTransaction.data || {},
                    options.relatedTransaction.previous || null,
                    'inventory-service-update-related-transaction'
                )
                : (options.relatedTransaction.data || {});
            batch.update(
                doc(db, 'clubs', _clubId(), 'transactions', options.relatedTransaction.id),
                relatedPatch
            );
        }
        await batch.commit();

        _mergeRuntimeInventory(next, 'inventory-service-update-item');
        window.notifyInventoryMutation?.('inventory-service-update-item', { writeThrough: true });
        return next;
    },

    /** Delete inventory and reverse its stock contribution atomically. */
    async deleteItem(invId, options = {}) {
        const { doc, getDoc, writeBatch, increment } = _sdk();
        const db = _db();
        const itemRef = doc(db, 'clubs', _clubId(), 'inventory', invId);
        let previous = options.previous && typeof options.previous === 'object' ? options.previous : null;
        if (!previous) {
            const snap = await getDoc(itemRef); // fallback read only on explicit delete
            if (!snap.exists()) return { deleted: false, missing: true };
            previous = { id: snap.id, ...snap.data() };
        }
        const summaryPatch = _buildLedgerIncrementPatch([{ item: previous, direction: -1 }], increment);
        const batch = writeBatch(db);
        batch.delete(itemRef);
        if (Object.keys(summaryPatch).length) {
            batch.set(doc(db, 'clubs', _clubId(), 'settings', 'inventory_stats'), summaryPatch, { merge: true });
        }
        const relatedTxId = String(options.relatedTxId || '').trim();
        if (relatedTxId && relatedTxId !== 'undefined') {
            batch.delete(doc(db, 'clubs', _clubId(), 'transactions', relatedTxId));
        }
        await batch.commit();
        _removeRuntimeInventory(invId, 'inventory-service-delete-item');
        window.notifyInventoryMutation?.('inventory-service-delete-item', { writeThrough: true });
        return { deleted: true, previous };
    },

    /**
     * One-time exact reconciliation. Reads each inventory document once, then
     * replaces the summary document with a canonical ledger snapshot.
     */
    async rebuildInventoryStats() {
        const { collection, getDocs, doc, setDoc, writeBatch } = _sdk();
        const db = _db();
        const clubId = _clubId();
        const snap = await getDocs(collection(db, 'clubs', clubId, 'inventory'));
        const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));

        // orderBy(field) excludes documents missing that field. Repair legacy
        // date/timestamp values during the same one-time full scan so all rows
        // remain pageable after reload without recurring compatibility queries.
        const repairs = [];
        for (const item of items) {
            const patch = _canonicalTemporalPatch(item);
            if (!Object.keys(patch).length) continue;
            repairs.push({ id: item.id, patch });
            Object.assign(item, patch);
        }
        const BATCH_SIZE = 400;
        for (let i = 0; i < repairs.length; i += BATCH_SIZE) {
            const batch = writeBatch(db);
            repairs.slice(i, i + BATCH_SIZE).forEach(({ id, patch }) => {
                batch.update(doc(db, 'clubs', clubId, 'inventory', id), patch);
            });
            await batch.commit();
        }

        const summary = _buildLiteralSummary(items);
        summary._legacyTemporalRepairs = repairs.length;
        await setDoc(doc(db, 'clubs', clubId, 'settings', 'inventory_stats'), summary);
        return {
            itemCount: items.length,
            repairedTemporalCount: repairs.length,
            keyCount: Object.keys(summary).filter(k => /_(balance|in|out)$/.test(k)).length,
            items,
            summary
        };
    },

    /**
     * Đánh dấu đơn hàng nợ đã thu tiền.
     * Phase 4K-4D: Tạo/cập nhật transaction doanh thu kho khi Đã Thu.
     * Trả về { alreadyPaid, inv, txId }.
     * @param {string} invId
     * @param {Object} [options] - { date: 'YYYY-MM-DD' } để override ngày thu
     */
    async markPaid(invId, options = {}) {
        const {
            doc, getDocs, query, where, collection, limit, runTransaction
        } = _sdk();
        const db     = _db();
        const clubId = _clubId();
        if (typeof runTransaction !== 'function') {
            throw new Error('[InventoryService] Firestore transaction chưa sẵn sàng');
        }

        const invRef = doc(db, 'clubs', clubId, 'inventory', invId);
        const txCol  = collection(db, 'clubs', clubId, 'transactions');

        // Tìm giao dịch legacy đã liên kết. Nếu chưa có, dùng ID xác định để
        // hai thiết bị cùng bấm 💰 Thu không thể tạo hai doanh thu.
        let existingTxRef = null;
        try {
            const txSnap = await getDocs(query(txCol, where('relatedInvId', '==', invId), limit(1)));
            if (!txSnap.empty) existingTxRef = txSnap.docs[0].ref;
        } catch (lookupError) {
            console.warn('[InventoryService] Không tìm được giao dịch legacy trước khi thu nợ:', lookupError);
        }
        const paymentTxRef = existingTxRef || doc(txCol, `inventory-debt-${invId}`);

        const today = options.date
            || (typeof window.getLocalToday === 'function' ? window.getLocalToday() : new Date().toISOString().slice(0, 10));
        const txMonth = today.slice(0, 7);
        let result = null;

        await runTransaction(db, async transaction => {
            const invSnap = await transaction.get(invRef);
            if (!invSnap.exists()) throw new Error('Không tìm thấy khoản nợ Kho cần thu');
            const inv = { id: invSnap.id, ...invSnap.data() };

            if (inv.unpaid === false && inv.inventoryDebtStatus === 'paid') {
                result = { alreadyPaid: true, inv, txId: inv.paidTxId || paymentTxRef.id };
                return;
            }

            const existingTxSnap = await transaction.get(paymentTxRef);
            const invAmount = Number(inv.amount || 0);
            const txData = {
                branch:               inv.branch || 'Chung',
                type:                 'Thu ' + (inv.category || 'Võ phục'),
                description:          ('Thu nợ ' + (inv.category || 'Võ phục') + ' ' + (inv.size || '') + ' của ' + (inv.desc || inv.studentName || '')).trim(),
                studentName:          inv.studentName || inv.desc || '',
                profileName:          inv.profileId || inv.studentName || inv.desc || '',
                profileId:            inv.profileId || '',
                memberId:             inv.memberId || '',
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
                affectsRevenue:       invAmount > 0,
                revenueCategory:      'inventory',
                components: invAmount > 0 ? [{
                    kind: 'inventoryDebt',
                    type: 'Thu ' + (inv.category || 'Võ phục'),
                    label: ('Thu nợ ' + (inv.category || 'Võ phục') + ' ' + (inv.size || '')).trim(),
                    amount: invAmount,
                    category: inv.category || 'Võ phục',
                    size: inv.size || '',
                    relatedInvId: invId,
                    affectsRevenue: true,
                    affectsInventory: false,
                }] : [],
            };

            const canonicalTxData = existingTxSnap.exists() && typeof window.canonicalizeTransactionPatch === 'function'
                ? window.canonicalizeTransactionPatch(txData, existingTxSnap.data(), 'inventory-service-mark-paid-atomic')
                : (typeof window.canonicalizeTransactionForWrite === 'function'
                    ? window.canonicalizeTransactionForWrite(txData, 'inventory-service-mark-paid-atomic')
                    : txData);

            if (invAmount > 0) {
                if (existingTxSnap.exists()) transaction.set(paymentTxRef, canonicalTxData, { merge: true });
                else transaction.set(paymentTxRef, canonicalTxData);
            }

            const invUpdate = {
                unpaid:               false,
                inventoryDebtStatus:  'paid',
                paidAt:               Date.now(),
                paidDate:             today,
                paidTxId:             invAmount > 0 ? paymentTxRef.id : '',
            };
            transaction.update(invRef, invUpdate);
            result = {
                alreadyPaid: false,
                inv: { ...inv, ...invUpdate },
                txId: invAmount > 0 ? paymentTxRef.id : '',
                tx: invAmount > 0 ? { id: paymentTxRef.id, ...canonicalTxData } : null,
            };
        });

        if (!result) throw new Error('Không nhận được kết quả thu nợ Kho');
        if (result.tx) window.mergeTransactionIntoRuntimeStore?.(result.tx, 'inventory-debt-paid-atomic');
        if (result.inv) window.mergeInventoryIntoRuntimeStore?.(result.inv, 'inventory-debt-paid-atomic');
        window.notifyInventoryMutation?.('inventory-service-mark-paid-atomic', { writeThrough: true });
        window.refreshListsComputation?.(['students.debtList', 'dashboard.summary'], 'inventory-debt-paid-atomic');
        window.invalidateList?.('students.debtList', 'inventory-debt-paid-atomic');
        window.invalidateDashboard?.('inventory-debt-paid-atomic');
        return result;
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
            constraints.push(orderBy('date', 'desc'));
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
        const payload = typeof window.canonicalizeTransactionForWrite === 'function'
            ? window.canonicalizeTransactionForWrite(data, 'inventory-service-add-transaction')
            : data;
        const docRef = await addDoc(colRef, payload);
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
            typeof window.canonicalizeTransactionPatch === 'function'
                ? window.canonicalizeTransactionPatch(data, null, 'inventory-service-update-transaction')
                : data
        );
    },
};
