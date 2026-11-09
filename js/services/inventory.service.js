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

// Runtime continuity only, never a replacement for Auth/Rules authorization.
// Reject stale stock commands before commit and stale UI projections after ACK.
function _projectionScope() {
    const st = window.__store || {}, auth = window.__verifiedAuthContextState || {};
    return [
        String(st.clubId || window.currentClubId || '').trim(),
        String(auth.uid || st.auth?.currentUser?.uid || st.currentUser?.uid || '').trim(),
        Number(auth.generation || 0),
        Number(auth.sessionEpoch || 0),
        Number(auth.authGeneration || 0),
    ].join('|');
}
function _projectionScopeCurrent(scope) { return !!scope && scope === _projectionScope(); }



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
    const deltaMap = _ledgerDeltas(mutations);
    const patch = {};
    deltaMap.forEach((delta, base) => {
        if (delta.balance) patch[base + '_balance'] = incrementFn(delta.balance);
        if (delta.in) patch[base + '_in'] = incrementFn(delta.in);
        if (delta.out) patch[base + '_out'] = incrementFn(delta.out);
    });
    return patch;
}

function _ledgerDeltas(mutations) {
    const deltaMap = new Map();
    for (const mutation of (Array.isArray(mutations) ? mutations : [])) {
        if (!mutation || !mutation.item) continue;
        _accumulateLedgerDelta(deltaMap, mutation.item, mutation.direction === -1 ? -1 : 1);
    }
    return deltaMap;
}
function _stockError(code, message, details = {}) { return Object.assign(new Error(message), { code, ...details }); }
async function _runStockTransaction(run, db, callback) {
    try { return await run(db, callback); }
    catch (error) {
        // Let the SDK finish its own conflict retries before mapping final errors.
        if (error?.code?.startsWith('INVENTORY_') || error?.code === 'finance/write-context-stale' || error?.code === 'ADMISSION_DRAFT_STALE') throw error;
        throw _stockError('INVENTORY_WRITE_UNCONFIRMED', 'Chưa xác nhận được thao tác Kho. Vui lòng kiểm tra dữ liệu trước khi thử lại.', { cause: error });
    }
}
function _assertInventoryQuantity(item) {
    if (!Number.isSafeInteger(_inventoryQty(item)) || _inventoryQty(item) <= 0)
        throw _stockError('INVENTORY_INVALID_QUANTITY', 'Số lượng Kho phải là số nguyên dương hợp lệ.');
}
function _assertMutationScope(scope) {
    if (!_projectionScopeCurrent(scope)) throw _stockError('finance/write-context-stale', 'CLB hoặc phiên đã thay đổi. Kho chưa được ghi.');
}
function _itemMutationSignature(item) {
    return JSON.stringify([_inventoryBase(item)?.base, _isInventoryIn(item), _inventoryQty(item),
        Number(item?.amount || 0), item?.unpaid === true, item?.paidTxId || '', item?.paymentBundleId || '']);
}
function _assertCurrentInventoryItem(previous, current) {
    if (previous && _itemMutationSignature(previous) !== _itemMutationSignature(current))
        throw _stockError('INVENTORY_ITEM_STALE', 'Phiếu Kho đã thay đổi. Vui lòng mở lại phiếu trước khi sửa hoặc xóa.');
}
// Snapshot plain payloads at queue time, preserving SDK FieldValue/Reference instances.
function _copyMutationValue(value) {
    if (Array.isArray(value)) return value.map(_copyMutationValue);
    if (value && (Object.getPrototypeOf(value) === null || Object.getPrototypeOf(value)?.constructor?.name === 'Object'))
        return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, _copyMutationValue(item)]));
    return value;
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

    /** Read authoritative stock inside the caller's transaction, on EVERY attempt. */
    async validateStockTransaction(transaction, mutations, writeClubId) {
        const negative = [..._ledgerDeltas(mutations)].filter(([, delta]) => delta.balance < 0);
        if (!negative.length) return;
        const { doc } = _sdk();
        const snapshot = await transaction.get(doc(_db(), 'clubs', writeClubId, 'settings', 'inventory_stats'));
        const stats = snapshot.exists() ? snapshot.data() : {};
        for (const [base, delta] of negative) {
            const balance = stats[base + '_balance'];
            if (!Number.isFinite(balance) || !Number.isFinite(delta.balance))
                throw _stockError('INVENTORY_STOCK_UNVERIFIED', 'Chưa xác minh được tồn Kho. Vui lòng kiểm tra tồn trước khi xuất hoặc sửa phiếu.', { sku: base });
            if (!Number.isFinite(balance + delta.balance) || balance + delta.balance < 0)
                throw _stockError('INVENTORY_INSUFFICIENT_STOCK', 'Không thể xuất kho: số lượng tồn hiện tại không đủ.', {
                    sku: base, available: balance, required: -delta.balance,
                    reason: balance < 0 ? 'HISTORICAL_NEGATIVE_BALANCE' : 'INSUFFICIENT_STOCK',
                });
        }
    },

    /**
     * Caller-owned atomic envelope: caller queues its existing Profile/Finance/
     * Inventory plan. Only transport/stock validation lives here, never Finance
     * payload policy. No separate Inventory commit precedes the caller's writes.
     */
    createStockMutationBatch({ mutations, writeClubId = _clubId(), projectionScope = _projectionScope(), beforeCommit } = {}) {
        const { writeBatch, runTransaction } = _sdk(), db = _db(), owner = this;
        const stockMutations = _copyMutationValue(mutations || []), operations = [];
        const needsStockRead = [..._ledgerDeltas(stockMutations).values()].some(delta => delta.balance < 0);
        let started = false;
        const assertCurrent = () => { _assertMutationScope(projectionScope); beforeCommit?.(); };
        const apply = writer => { for (const [method, args] of operations) writer[method](...args); };
        const writer = {
            set(...args) { if (started) throw Error('Inventory atomic plan already submitted'); operations.push(['set', _copyMutationValue(args)]); return writer; },
            update(...args) { if (started) throw Error('Inventory atomic plan already submitted'); operations.push(['update', _copyMutationValue(args)]); return writer; },
            delete(...args) { if (started) throw Error('Inventory atomic plan already submitted'); operations.push(['delete', _copyMutationValue(args)]); return writer; },
            async commit() {
                if (started) throw Error('Inventory atomic plan already submitted'); started = true;
                assertCurrent();
                if (needsStockRead) {
                    if (typeof runTransaction !== 'function') throw _stockError('INVENTORY_TRANSACTION_UNAVAILABLE', 'Chưa tải được chức năng lưu Kho an toàn. Vui lòng tải lại.');
                    await _runStockTransaction(runTransaction, db, async transaction => {
                        assertCurrent();
                        await owner.validateStockTransaction(transaction, stockMutations, writeClubId);
                        assertCurrent(); apply(transaction);
                    });
                } else {
                    const batch = writeBatch(db); apply(batch); await batch.commit();
                }
            },
        };
        return writer;
    },

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
     * H8R2: pure prepare primitive for the existing inventory ledger owner.
     * No Firestore read/write occurs here. It lets an existing cross-domain
     * owner include inventory + inventory_stats in ONE caller-owned atomic batch.
     */
    prepareAddItemMutation(data) {
        const { doc, increment } = _sdk();
        const writeClubId = _clubId();
        const projectionScope = _projectionScope();
        const invRef = _invRef();
        if (!invRef || typeof doc !== 'function' || typeof increment !== 'function') {
            throw new Error('[InventoryService] Không thể chuẩn bị inventory mutation.');
        }
        const payload = { ...(data || {}) };
        _assertInventoryQuantity(payload);
        if (!payload.timestamp) payload.timestamp = Date.now();
        if (!payload.date) payload.date = typeof window.getLocalToday === 'function' ? window.getLocalToday() : new Date().toISOString().slice(0, 10);
        if (payload.type === 'Xuất bán' && payload.desc && typeof window.resolveInventoryDebtIdentity === 'function') {
            const identity = window.resolveInventoryDebtIdentity(payload.desc);
            if (identity.profileId) payload.profileId = identity.profileId;
            if (identity.memberId) payload.memberId = identity.memberId;
            if (!payload.studentName && identity.studentName) payload.studentName = identity.studentName;
        }
        const itemRef = doc(invRef);
        const statsRef = doc(_db(), 'clubs', writeClubId, 'settings', 'inventory_stats');
        const summaryPatch = _buildLedgerIncrementPatch([{ item: payload, direction: 1 }], increment);
        return { itemRef, statsRef, payload, summaryPatch, runtimeItem: { id: itemRef.id, ...payload }, writeClubId, projectionScope };
    },


    /**
     * H8R2.1 R1 — PURE canonical paid-state patch for an existing inventory debt.
     * This helper performs ZERO Firestore reads/writes/listeners. It exists so a
     * caller-owned atomic batch can reuse the exact same paid-state semantics as
     * InventoryService.markPaid() without creating a second writer.
     */
    prepareMarkPaidPatch({ txId = '', paymentBundleId = '', paidDate = '', paidAt = 0 } = {}) {
        const timestamp = Number(paidAt) || Date.now();
        const date = String(paidDate || '').trim() || (typeof window.getLocalToday === 'function'
            ? window.getLocalToday()
            : new Date(timestamp).toISOString().slice(0, 10));
        const patch = {
            unpaid: false,
            inventoryDebtStatus: 'paid',
            paidAt: timestamp,
            paidDate: date,
        };
        const canonicalTxId = String(txId || '').trim();
        const canonicalBundleId = String(paymentBundleId || canonicalTxId || '').trim();
        if (canonicalTxId) patch.paidTxId = canonicalTxId;
        if (canonicalBundleId) patch.paymentBundleId = canonicalBundleId;
        return patch;
    },

    /**
     * Thêm một bản ghi kho mới (Nhập hoặc Xuất).
     * @param {Object} data — { category, size, type, qty, desc, amount, date, ... }
     * @returns {string} ID của doc vừa tạo
     */
    async addItem(data) {
        const { writeBatch, increment } = _sdk();
        const invRef = _invRef();
        if (!invRef) throw new Error('[InventoryService] invRef chưa sẵn sàng');
        if (typeof writeBatch !== 'function' || typeof increment !== 'function') {
            throw new Error('[InventoryService] Firestore batch/increment chưa sẵn sàng');
        }

        const prepared = this.prepareAddItemMutation(data);
        const batch = this.createStockMutationBatch({ mutations: [{ item: prepared.payload, direction: 1 }],
            writeClubId: prepared.writeClubId, projectionScope: prepared.projectionScope });
        batch.set(prepared.itemRef, prepared.payload);
        if (Object.keys(prepared.summaryPatch).length) batch.set(prepared.statsRef, prepared.summaryPatch, { merge: true });
        await batch.commit();

        if (_projectionScopeCurrent(prepared.projectionScope || '')) {
            _mergeRuntimeInventory(prepared.runtimeItem, 'inventory-service-add-item');
            window.notifyInventoryMutation?.('inventory-service-add-item', { writeThrough: true });
        }
        return prepared.itemRef.id;
    },

    /** One commit for an item, its ledger delta and an optional Finance plan. */
    async commitPreparedAddItem({ prepared, financeTx = null } = {}) {
        const { writeBatch } = _sdk();
        if (!prepared?.itemRef || !prepared?.statsRef || !prepared?.runtimeItem
            || typeof writeBatch !== 'function') throw new Error('[InventoryService] Item plan không hợp lệ.');
        if (financeTx && (!financeTx.ref || !financeTx.payload)) throw new Error('[InventoryService] Finance plan không hợp lệ.');
        const batch = this.createStockMutationBatch({ mutations: [{ item: prepared.payload, direction: 1 }],
            writeClubId: prepared.writeClubId, projectionScope: prepared.projectionScope });
        batch.set(prepared.itemRef, prepared.payload);
        if (Object.keys(prepared.summaryPatch || {}).length)
            batch.set(prepared.statsRef, prepared.summaryPatch, { merge: true });
        if (financeTx) batch.set(financeTx.ref, financeTx.payload);
        await batch.commit();
        if (_projectionScopeCurrent(prepared.projectionScope || '')) {
            _mergeRuntimeInventory(prepared.runtimeItem, 'inventory-form-atomic');
            if (financeTx) window.mergeTransactionIntoRuntimeStore?.(financeTx.runtimeTx, 'inventory-form-atomic');
            window.notifyInventoryMutation?.('inventory-form-atomic', { writeThrough: true });
        }
        return { invId: prepared.itemRef.id, txId: financeTx?.ref?.id || '' };
    },

    /**
     * Sửa bản ghi kho.
     * @param {string} invId — doc ID
     * @param {Object} data  — fields cần update
     */
    async updateItem(invId, data, options = {}) {
        const { doc, runTransaction, increment } = _sdk();
        const db = _db(), writeClubId = _clubId(), projectionScope = _projectionScope();
        const itemRef = doc(db, 'clubs', writeClubId, 'inventory', invId);
        if (typeof runTransaction !== 'function') throw _stockError('INVENTORY_TRANSACTION_UNAVAILABLE', 'Chưa tải được chức năng lưu Kho an toàn. Vui lòng tải lại.');
        const relatedPatch = options.relatedTransaction?.id
            ? (typeof window.canonicalizeTransactionPatch === 'function'
                ? window.canonicalizeTransactionPatch(options.relatedTransaction.data || {}, options.relatedTransaction.previous || null, 'inventory-service-update-related-transaction')
                : options.relatedTransaction.data || {}) : null;
        const next = await _runStockTransaction(runTransaction, db, async transaction => {
            _assertMutationScope(projectionScope);
            const snapshot = await transaction.get(itemRef);
            if (!snapshot.exists()) throw _stockError('INVENTORY_ITEM_MISSING', 'Phiếu Kho không còn tồn tại. Vui lòng tải lại.');
            const previous = { id: snapshot.id, ...snapshot.data() };
            _assertCurrentInventoryItem(options.previous, previous);
            const currentNext = { ...previous, ...(data || {}), id: invId };
            _assertInventoryQuantity(currentNext);
            if (!currentNext.timestamp) currentNext.timestamp = Date.now();
            const mutations = [{ item: previous, direction: -1 }, { item: currentNext, direction: 1 }];
            await this.validateStockTransaction(transaction, mutations, writeClubId);
            _assertMutationScope(projectionScope);
            const summaryPatch = _buildLedgerIncrementPatch(mutations, increment);
            transaction.update(itemRef, data || {});
            if (Object.keys(summaryPatch).length)
                transaction.set(doc(db, 'clubs', writeClubId, 'settings', 'inventory_stats'), summaryPatch, { merge: true });
            if (relatedPatch) transaction.update(doc(db, 'clubs', writeClubId, 'transactions', options.relatedTransaction.id), relatedPatch);
            return currentNext;
        });
        if (_projectionScopeCurrent(projectionScope)) {
            _mergeRuntimeInventory(next, 'inventory-service-update-item');
            if (relatedPatch && options.relatedTransaction?.previous) window.mergeTransactionIntoRuntimeStore?.({
                ...options.relatedTransaction.previous, ...relatedPatch, id: options.relatedTransaction.id,
            }, 'inventory-service-update-related-transaction');
            window.notifyInventoryMutation?.('inventory-service-update-item', { writeThrough: true });
        }
        return next;
    },

    /** Current item CAS prevents stale/double reversals; stock-decreasing delete also reads stats. */
    async deleteItem(invId, options = {}) {
        const { doc, runTransaction, increment } = _sdk();
        const db = _db(), writeClubId = _clubId(), projectionScope = _projectionScope();
        const itemRef = doc(db, 'clubs', writeClubId, 'inventory', invId);
        if (typeof runTransaction !== 'function') throw _stockError('INVENTORY_TRANSACTION_UNAVAILABLE', 'Chưa tải được chức năng lưu Kho an toàn. Vui lòng tải lại.');
        const result = await _runStockTransaction(runTransaction, db, async transaction => {
            _assertMutationScope(projectionScope);
            const snapshot = await transaction.get(itemRef);
            if (!snapshot.exists()) return { deleted: false, missing: true };
            const previous = { id: snapshot.id, ...snapshot.data() };
            _assertCurrentInventoryItem(options.previous, previous);
            const mutations = [{ item: previous, direction: -1 }];
            await this.validateStockTransaction(transaction, mutations, writeClubId);
            _assertMutationScope(projectionScope);
            const summaryPatch = _buildLedgerIncrementPatch(mutations, increment);
            transaction.delete(itemRef);
            if (Object.keys(summaryPatch).length)
                transaction.set(doc(db, 'clubs', writeClubId, 'settings', 'inventory_stats'), summaryPatch, { merge: true });
            const relatedTxId = String(options.relatedTxId || '').trim();
            if (relatedTxId && relatedTxId !== 'undefined') transaction.delete(doc(db, 'clubs', writeClubId, 'transactions', relatedTxId));
            return { deleted: true, previous };
        });
        if (result.deleted && _projectionScopeCurrent(projectionScope)) {
            _removeRuntimeInventory(invId, 'inventory-service-delete-item');
            window.notifyInventoryMutation?.('inventory-service-delete-item', { writeThrough: true });
        }
        return result;
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
        const { doc, getDoc, updateDoc, addDoc, query, where, getDocs, collection, writeBatch } = _sdk();
        const db     = _db();
        const clubId = _clubId();
        const projectionScope = _projectionScope();

        // Existing reads are retained only to resolve canonical current state/idempotency.
        const invRef = doc(db, 'clubs', clubId, 'inventory', invId);
        const invSnap = await getDoc(invRef);
        if (!invSnap.exists()) throw new Error('[InventoryService] Inventory item not found: ' + invId);
        const inv = { id: invSnap.id, ...invSnap.data() };
        if (inv.unpaid === false && inv.inventoryDebtStatus === 'paid') {
            return { alreadyPaid: true, inv, txId: inv.paidTxId || '' };
        }

        const today   = options.date || (typeof window.getLocalToday === 'function' ? window.getLocalToday() : new Date().toISOString().slice(0, 10));
        const txMonth = today.slice(0, 7);
        const txCol   = collection(db, 'clubs', clubId, 'transactions');
        const q       = query(txCol, where('relatedInvId', '==', invId));
        const txSnap  = await getDocs(q);
        const invAmount = Number(inv.amount);
        if (inv.type !== 'Xuất bán' || inv.unpaid !== true || !Number.isFinite(invAmount)
            || invAmount <= 0 || inv.paidTxId) throw new Error('[InventoryService] Khoản nợ Kho không hợp lệ.');
        if (!txSnap.empty) throw new Error('[InventoryService] Chứng từ Kho đã tồn tại; cần đối soát trước khi thu.');

        const txData = {
            branch: inv.branch || 'Chung',
            type: 'Thu ' + (inv.category || 'Võ phục'),
            description: ('Thu nợ ' + (inv.category || 'Võ phục') + ' ' + (inv.size || '') + ' của ' + (inv.desc || '')).trim(),
            amount: invAmount,
            date: today,
            txMonth,
            timestamp: Date.now(),
            relatedInvId: invId,
            inventoryDebtPayment: true,
            inventoryDebtPaidAt: Date.now(),
            inventoryCategory: inv.category || 'Võ phục',
            inventorySize: inv.size || '',
            inventoryDesc: inv.desc || '',
        };

        const batch = writeBatch(db);
        let txId = '';
        const txDocRef = doc(txCol);
        txId = txDocRef.id;
        const canonicalTxData = typeof window.canonicalizeTransactionForWrite === 'function'
            ? window.canonicalizeTransactionForWrite(txData, 'inventory-service-mark-paid')
            : txData;
        batch.set(txDocRef, canonicalTxData);

        const invUpdate = this.prepareMarkPaidPatch({
            txId,
            paymentBundleId: txId,
            paidDate: today,
            paidAt: Date.now(),
        });
        batch.update(invRef, invUpdate);
        await batch.commit();

        if (_projectionScopeCurrent(projectionScope)) {
            _mergeRuntimeInventory({ ...inv, ...invUpdate }, 'inventory-service-mark-paid');
            window.mergeTransactionIntoRuntimeStore?.({ id: txId, ...canonicalTxData }, 'inventory-service-mark-paid');
            window.notifyInventoryMutation?.('inventory-service-mark-paid', { writeThrough: true });
        }
        return { alreadyPaid: false, inv: { ...inv, ...invUpdate }, txId };
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
