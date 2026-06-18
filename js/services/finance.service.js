// Compatibility marker: inventory.service.js?v=inventory-ledger-reconciliation-20260616-v2c
/**
 * js/services/finance.service.js — Phase 3.2A
 * ────────────────────────────────────────────────────────────────
 * Service Layer: Tất cả Firestore operations cho:
 *   - transactions collection (addDoc, deleteDoc, getDocs)
 *   - profiles collection (updateDoc cho paidUntil/paidMonths)
 *   - fee_audit collection (addDoc)
 *   - inventory collection (deleteDoc cho relatedInvId)
 *
 * Phase 3.2A ADDITIONS:
 *   - getTransactionsPage() — server-side cursor pagination (PAGE_SIZE = 50)
 *     Ordered by timestamp desc (mới nhất trước)
 *     Supports: month filter, search filter, next/previous/refresh
 *
 * Modules finance.js KHÔNG gọi Firebase trực tiếp nữa.
 * ────────────────────────────────────────────────────────────────
 */

import { InventoryService } from './inventory.service.js?v=quick-pay-commit-acknowledgement-20260618-v3f2';

function _sdk()    { return window._fb_init || {}; }
function _db()     { const db = (window.__store || {}).db; if (!db) throw new Error('[FinanceService] db chưa sẵn sàng'); return db; }
function _clubId() { const id = (window.__store || {}).clubId; if (!id) throw new Error('[FinanceService] clubId chưa sẵn sàng'); return id; }
function _colRef() { return (window.__store || {}).colRef; }

export const FinanceService = {

    // ── TRANSACTIONS ────────────────────────────────────────────

    /**
     * Thêm một giao dịch mới.
     * @param {Object} data — transaction data (type, description, amount, date, ...)
     * @returns {string} ID của doc vừa tạo
     */
    async addTransaction(data) {
        const { addDoc } = _sdk();
        const colRef = _colRef();
        if (!colRef) throw new Error('[FinanceService] colRef chưa sẵn sàng');
        const payload = typeof window.canonicalizeTransactionForWrite === 'function'
            ? window.canonicalizeTransactionForWrite(data, 'finance-service-add')
            : data;
        const docRef = await addDoc(colRef, payload);
        return docRef.id;
    },

    /**
     * Ghi giao dịch học phí + cập nhật profile trong cùng Firestore transaction.
     * Trả về { id, paidUntil, months }.
     */
    async addTuitionPaymentAtomic({ studentName, months, profile, txData, reason = 'finance-service-tuition' }) {
        if (typeof window.commitTuitionPaymentAtomic !== 'function') {
            throw new Error('[FinanceService] CanonicalTuitionMonthLedger chưa sẵn sàng');
        }
        return window.commitTuitionPaymentAtomic({
            studentName,
            months,
            profile,
            txData,
            transactionsRef: _colRef(),
            reason,
        });
    },

    /** Atomic multi-student tuition write (family payment). */
    async addTuitionPaymentsAtomic(entries, reason = 'finance-service-family-tuition') {
        if (typeof window.commitTuitionPaymentsAtomic !== 'function') {
            throw new Error('[FinanceService] CanonicalTuitionMonthLedger chưa sẵn sàng');
        }
        return window.commitTuitionPaymentsAtomic(entries, {
            transactionsRef: _colRef(),
            reason,
        });
    },

    /**
     * Xóa một giao dịch.
     * @param {string} txId — Firestore transaction doc ID
     */
    async deleteTransaction(txId) {
        const { doc, deleteDoc } = _sdk();
        await deleteDoc(doc(_db(), 'clubs', _clubId(), 'transactions', txId));
    },

    /** Lấy một giao dịch theo ID, ưu tiên cache hiện tại rồi mới đọc Firestore. */
    async getTransaction(txId) {
        const cached = ((window.__store || {}).transactions || []).find(t => t && (t.id === txId || t.txId === txId));
        if (cached) return { ...cached };
        const { doc, getDoc } = _sdk();
        const snap = await getDoc(doc(_db(), 'clubs', _clubId(), 'transactions', txId));
        return snap.exists() ? { id: snap.id, ...snap.data() } : null;
    },

    /**
     * Sửa số tiền giao dịch doanh thu trong một Firestore transaction.
     * - Bundle: sửa theo từng component và tự tính lại tổng.
     * - Kho liên kết/pending: cập nhật amount tương ứng, không đụng số lượng tồn.
     * - Không cho sửa bút toán reconciliationOnly/affectsRevenue=false.
     */
    async updateRevenueTransactionAtomic(txId, { amount: nextAmount, componentAmounts = null, note = '' } = {}) {
        const { doc, runTransaction, increment } = _sdk();
        const db = _db();
        const clubId = _clubId();
        const txRef = doc(db, 'clubs', clubId, 'transactions', txId);
        let updated = null;

        await runTransaction(db, async transaction => {
            const snap = await transaction.get(txRef);
            if (!snap.exists()) throw new Error('Không tìm thấy giao dịch cần sửa');
            const current = { id: snap.id, ...snap.data() };
            if (current.reconciliationOnly || current.affectsRevenue === false) {
                throw new Error('Đây là bút toán đối soát tồn kho, không được sửa như doanh thu');
            }
            if (String(current.type || '').startsWith('Chi ')
                || current.type === 'Chi phí' || current.type === 'Chi phí kỳ thi') {
                throw new Error('Giao dịch chi phí phải sửa bằng chức năng Sửa chi phí');
            }

            const oldComponents = Array.isArray(current.components)
                ? current.components.map(c => ({ ...(c || {}) }))
                : [];
            let components = oldComponents;
            let amount = Number(nextAmount);

            if (oldComponents.length && componentAmounts && typeof componentAmounts === 'object') {
                components = oldComponents.map((component, index) => {
                    if (!Object.prototype.hasOwnProperty.call(componentAmounts, index)) return component;
                    const value = Number(componentAmounts[index]);
                    if (!Number.isFinite(value) || value < 0) throw new Error('Số tiền thành phần không hợp lệ');
                    return { ...component, amount: value };
                });
                amount = components.reduce((sum, component) => sum + Number(component.amount || 0), 0);
            } else {
                if (!Number.isFinite(amount) || amount < 0) throw new Error('Số tiền giao dịch không hợp lệ');
                if (oldComponents.length === 1) components = [{ ...oldComponents[0], amount }];
            }
            if (!Number.isFinite(amount) || amount < 0) throw new Error('Tổng số tiền giao dịch không hợp lệ');

            const patch = {
                amount,
                components,
                editedAt: Date.now(),
                editedBy: window.currentUserEmail || 'admin',
                editReason: String(note || 'Sửa số tiền từ bảng giao dịch').trim(),
            };
            if (components.length) {
                patch.tuitionAmount = components
                    .filter(c => c && c.kind === 'tuition')
                    .reduce((sum, c) => sum + Number(c.amount || 0), 0);
                patch.examAmount = components
                    .filter(c => c && c.kind === 'exam')
                    .reduce((sum, c) => sum + Number(c.amount || 0), 0);
            }

            const mergedForMetadata = { ...current, ...patch };
            if (typeof window.buildCanonicalRevenueMetadata === 'function') {
                Object.assign(patch, window.buildCanonicalRevenueMetadata(mergedForMetadata));
            }
            const canonicalPatch = typeof window.canonicalizeTransactionPatch === 'function'
                ? window.canonicalizeTransactionPatch(patch, current, 'finance-service-inline-revenue-edit')
                : patch;

            // Đồng bộ amount với inventory/pending liên kết; không thay qty hoặc tồn.
            const invUpdates = new Map();
            let pendingAmountDelta = 0;
            if (components.length) {
                components.forEach((component, index) => {
                    const old = oldComponents[index] || {};
                    const value = Number(component.amount || 0);
                    const oldValue = Number(old.amount || 0);
                    const relatedInvId = component.relatedInvId || old.relatedInvId || '';
                    const pendingIssueId = component.pendingIssueId || old.pendingIssueId || '';
                    if (relatedInvId && value !== oldValue) invUpdates.set(relatedInvId, value);
                    if (pendingIssueId && value !== oldValue) {
                        transaction.update(doc(db, 'clubs', clubId, 'inventoryPendingIssues', pendingIssueId), {
                            saleAmount: value,
                            updatedAt: Date.now(),
                            editedFromTransactionAt: Date.now(),
                        });
                        pendingAmountDelta += value - oldValue;
                    }
                });
            } else if (current.relatedInvId && amount !== Number(current.amount || 0)) {
                invUpdates.set(current.relatedInvId, amount);
            }

            transaction.set(txRef, canonicalPatch, { merge: true });
            invUpdates.forEach((value, invId) => {
                transaction.update(doc(db, 'clubs', clubId, 'inventory', invId), {
                    amount: value,
                    updatedAt: Date.now(),
                    editedFromTransactionAt: Date.now(),
                });
            });
            if (pendingAmountDelta !== 0) {
                transaction.set(doc(db, 'clubs', clubId, 'settings', 'inventory_stats'), {
                    pendingIssueAmount: increment(pendingAmountDelta),
                    pendingIssueUpdatedAt: Date.now(),
                }, { merge: true });
            }

            updated = { ...current, ...canonicalPatch, id: txId };
        });

        if (!updated) throw new Error('Không thể cập nhật giao dịch');
        window.mergeTransactionIntoRuntimeStore?.(updated, 'inline-revenue-transaction-edit');
        if (window.__store) window.__store._dataVersion = (window.__store._dataVersion || 0) + 1;
        window.invalidateFinance?.('inline-revenue-transaction-edit');
        window.invalidateInventory?.('inline-revenue-transaction-edit');
        window.invalidateDashboard?.('inline-revenue-transaction-edit');
        window.refreshListsComputation?.(['tx.txList', 'dashboard.summary'], 'inline-revenue-transaction-edit');
        window.invalidateList?.('tx.txList', 'inline-revenue-transaction-edit');
        return updated;
    },

    /**
     * Tìm tất cả giao dịch học phí của một võ sinh (để tính lại paidUntil).
     * Query TOÀN BỘ lịch sử — không giới hạn tháng.
     *
     * @param {string} studentName — tên võ sinh
     * @returns {Array<{id, data}>}
     */
    async getStudentTuitionTxs(studentName) {
        const { getDocs, query, where, collection } = _sdk();
        const db     = _db();
        const clubId = _clubId();
        const snap   = await getDocs(
            query(
                collection(db, 'clubs', clubId, 'transactions'),
                where('description', '==', studentName)
            )
        );
        const results = [];
        snap.forEach(d => results.push({ id: d.id, data: d.data() }));
        return results;
    },

    // ── PAGINATION (Phase 3.2A) ─────────────────────────────────

    /**
     * Lấy một trang giao dịch theo cursor pagination.
     *
     * Strategy:
     *   - Order by timestamp desc (giao dịch mới nhất trước)
     *   - Filter by month (txMonth == monthStr) hoặc date range nếu cần
     *   - Fetch pageSize + 1 để detect hasNext
     *   - Cursor: startAfter(lastVisible) for next, startAt(cursor) for prev
     *
     * NOTE: Vì đã filter by txMonth (string), Firestore cần index:
     *   txMonth ASC + timestamp DESC (composite index — xem FIRESTORE_INDEXES.md)
     *   Nếu chưa có index, query fallback về getDocs không có orderBy.
     *
     * @param {Object} options
     * @param {number}                options.pageSize  — docs per page (default 50)
     * @param {DocumentSnapshot|null} options.cursor    — cursor doc snapshot
     * @param {'first'|'next'|'prev'} options.direction — navigation direction
     * @param {string}                options.monthStr  — YYYY-MM (filter by txMonth)
     * @param {string}                options.search    — filter by description (client-side after fetch)
     * @returns {QuerySnapshot} raw snapshot để processPage() xử lý
     */
    async getTransactionsPage({
        pageSize  = 50,
        cursor    = null,
        direction = 'first',
        monthStr  = '',
        search    = '',
    } = {}) {
        // Phase 4K-4F: First page with monthStr → use inclusive query (txMonth + date + packageMonths)
        // to capture gói nhiều tháng where selectedMonth is a middle month
        if (monthStr && direction === 'first' && !cursor) {
            const result = await this.getTransactionsForMonthInclusive({ pageSize, monthStr, search });
            return result;
        }

        const { getDocs, query, collection, orderBy, limit, startAfter, startAt, where } = _sdk();
        const db     = _db();
        const clubId = _clubId();
        const colRef = collection(db, 'clubs', clubId, 'transactions');

        const constraints = [];

        // Filter by month
        if (monthStr) {
            constraints.push(where('txMonth', '==', monthStr));
        }

        // Order by timestamp descending (mới nhất trước)
        constraints.push(orderBy('timestamp', 'desc'));

        // Cursor navigation
        if (cursor && direction === 'next') {
            constraints.push(startAfter(cursor));
        } else if (cursor && direction === 'prev') {
            constraints.push(startAt(cursor));
        }

        constraints.push(limit(pageSize + 1)); // +1 để detect hasNext

        return getDocs(query(colRef, ...constraints));
    },

    /**
     * Phase 4K-4F — Inclusive month query: merges txMonth + date range + packageMonths array-contains.
     * Dùng cho first page khi chọn tháng, để không bỏ sót giao dịch gói nhiều tháng ở tháng giữa.
     *
     * @param {Object} options
     * @param {number} options.pageSize
     * @param {string} options.monthStr — YYYY-MM
     * @param {string} options.search
     * @returns {{ docs, _mergedItems, _source }}
     */
    async getTransactionsForMonthInclusive({
        pageSize = 50,
        monthStr = '',
        search   = '',
    } = {}) {
        const { getDocs, query, collection, where, limit } = _sdk();
        const db     = _db();
        const clubId = _clubId();
        const colRef = collection(db, 'clubs', clubId, 'transactions');

        const start = monthStr + '-01';
        const end   = monthStr + '-31';
        const lim   = pageSize + 200;

        const qByTxMonth  = query(colRef, where('txMonth', '==', monthStr), limit(lim));
        const qByDate     = query(colRef, where('date', '>=', start), where('date', '<=', end), limit(lim));
        const qByPackage  = query(colRef, where('packageMonths', 'array-contains', monthStr), limit(lim));

        const snaps = await Promise.allSettled([
            getDocs(qByTxMonth),
            getDocs(qByDate),
            getDocs(qByPackage),
        ]);

        const map = new Map();
        snaps.forEach(res => {
            if (res.status !== 'fulfilled') {
                console.warn('[FinanceService] getTransactionsForMonthInclusive partial failure:', res.reason && res.reason.message);
                return;
            }
            res.value.forEach(d => {
                const data = d.data();
                map.set(d.id, { id: d.id, ...data, _docSnap: d });
            });
        });

        let arr = Array.from(map.values())
            .filter(t => {
                if (typeof window.txMatchesSelectedMonth === 'function') {
                    return window.txMatchesSelectedMonth(t, monthStr);
                }
                return true;
            })
            .sort((a, b) => Number(b.timestamp || 0) - Number(a.timestamp || 0));

        if (search) {
            const q = typeof window.normalizeVNForSearch === 'function'
                ? window.normalizeVNForSearch(search)
                : String(search).toLowerCase();
            arr = arr.filter(t => {
                const blob = typeof window.getTransactionSearchBlob === 'function'
                    ? window.getTransactionSearchBlob(t)
                    : String([t.description, t.type, t.branch, t.txMonth, t.paymentMonth,
                               (t.packageMonths || []).join(',')].join(' ')).toLowerCase();
                return blob.includes(q);
            });
        }

        // Return object compatible with processPage (has .docs) AND passes _mergedItems for direct use
        const _mergedItems = arr;
        const docs = arr.slice(0, pageSize + 1).map(t => t._docSnap || {
            id: t.id,
            data: () => t,
        });

        return { docs, _mergedItems, _source: 'inclusive-month' };
    },

    /**
     * Lấy trang giao dịch theo date range (dùng cho export hoặc fallback).
     * Đây là getTransactionsPage cho query "byDate" thay vì "byTxMonth".
     *
     * @param {Object} options
     * @param {number}  options.pageSize  — docs per page
     * @param {DocumentSnapshot|null} options.cursor
     * @param {'first'|'next'|'prev'} options.direction
     * @param {string}  options.startDate — YYYY-MM-DD
     * @param {string}  options.endDate   — YYYY-MM-DD
     * @returns {QuerySnapshot}
     */
    async getTransactionsByDatePage({
        pageSize  = 50,
        cursor    = null,
        direction = 'first',
        startDate = '',
        endDate   = '',
    } = {}) {
        const { getDocs, query, collection, orderBy, limit, startAfter, startAt, where } = _sdk();
        const db     = _db();
        const clubId = _clubId();
        const colRef = collection(db, 'clubs', clubId, 'transactions');

        const constraints = [];

        if (startDate && endDate) {
            constraints.push(where('date', '>=', startDate));
            constraints.push(where('date', '<=', endDate));
            constraints.push(orderBy('date', 'desc'));
        } else {
            constraints.push(orderBy('timestamp', 'desc'));
        }

        if (cursor && direction === 'next') {
            constraints.push(startAfter(cursor));
        } else if (cursor && direction === 'prev') {
            constraints.push(startAt(cursor));
        }

        constraints.push(limit(pageSize + 1));

        return getDocs(query(colRef, ...constraints));
    },

    // ── PROFILES (payment fields only) ──────────────────────────

    /**
     * Cập nhật paidUntil + paidMonths sau khi thu học phí.
     * Chỉ ghi các fields thanh toán — KHÔNG ghi đè belt/branch/status.
     *
     * @param {string} studentName — doc ID
     * @param {Object} data        — { paidUntil, paidMonths: arrayUnion(...) }
     */
    async updateStudentPayment(studentName, data) {
        const { doc, updateDoc } = _sdk();
        await updateDoc(
            doc(_db(), 'clubs', _clubId(), 'profiles', studentName),
            data
        );
    },

    /**
     * updateDoc generic cho profile (dùng cho processCombo).
     * @param {string} studentName
     * @param {Object} data
     */
    async patchProfile(studentName, data) {
        const { doc, updateDoc } = _sdk();
        await updateDoc(
            doc(_db(), 'clubs', _clubId(), 'profiles', studentName),
            data
        );
    },

    // ── FEE AUDIT ───────────────────────────────────────────────

    /**
     * Ghi một bản ghi audit log thu tiền.
     * Không throw nếu lỗi — audit log không được chặn luồng chính.
     *
     * @param {Object} data — { studentId, amount, date, type, month, months, by }
     */
    async addFeeAudit(data) {
        const { addDoc, collection } = _sdk();
        const db     = _db();
        const clubId = _clubId();
        // Không await ở đây — caller quyết định
        return addDoc(collection(db, 'clubs', clubId, 'fee_audit'), data);
    },

    /**
     * Ghi audit log, swallow error (không chặn luồng chính).
     * Helper tiện lợi cho quickPay, processCombo, saveTx.
     */
    async addFeeAuditSilent(data) {
        try {
            await this.addFeeAudit(data);
        } catch (_) { /* audit log không chặn */ }
    },

    // ── REPORTING QUERIES (executeExcelExport) ──────────────────

    /**
     * Query transactions theo khoảng ngày thực tế (date field).
     * @param {string} startStr — YYYY-MM-DD
     * @param {string} endStr   — YYYY-MM-DD
     * @returns {Array<{id, data}>}
     */
    async queryTxByDateRange(startStr, endStr) {
        const { getDocs, query, where, limit } = _sdk(); // [3.3E]
        const colRef = _colRef();
        if (!colRef) return [];
        const snap = await getDocs(
            query(colRef, where('date', '>=', startStr), where('date', '<=', endStr), limit(2000)) // [3.3E] Excel/report export — high limit for full period
        );
        const results = [];
        snap.forEach(d => results.push({ id: d.id, ...d.data() }));
        return results;
    },

    /**
     * Query transactions theo txMonth range (bắt bù tháng cũ).
     * @param {string} startM — YYYY-MM
     * @param {string} endM   — YYYY-MM
     * @returns {Array<{id, data}>}
     */
    async queryTxByTxMonthRange(startM, endM) {
        const { getDocs, query, where, limit } = _sdk(); // [3.3E]
        const colRef = _colRef();
        if (!colRef) return [];
        const snap = await getDocs(
            query(colRef, where('txMonth', '>=', startM), where('txMonth', '<=', endM), limit(2000)) // [3.3E] Excel txMonth range
        );
        const results = [];
        snap.forEach(d => results.push({ id: d.id, ...d.data() }));
        return results;
    },

    /**
     * Phase 4K-4F — Query transactions có packageMonths chứa một trong các tháng.
     * Dùng cho export/report để không bỏ sót tháng giữa gói học phí.
     *
     * @param {string[]} months — array of YYYY-MM strings
     * @returns {Array<{id, ...data}>}
     */
    async queryTxByPackageMonths(months = []) {
        const { getDocs, query, where, limit } = _sdk();
        const colRef = _colRef();
        if (!colRef || !Array.isArray(months) || !months.length) return [];

        const map = new Map();
        for (const m of months) {
            try {
                const snap = await getDocs(
                    query(colRef, where('packageMonths', 'array-contains', m), limit(2000))
                );
                snap.forEach(d => map.set(d.id, { id: d.id, ...d.data() }));
            } catch (e) {
                console.warn('[FinanceService] queryTxByPackageMonths partial fail for', m, ':', e && e.message);
            }
        }
        return Array.from(map.values());
    },

    /**
     * Query inventory theo khoảng ngày.
     * @param {string} startStr — YYYY-MM-DD
     * @param {string} endStr   — YYYY-MM-DD
     * @returns {Array<{id, data}>}
     */
    async queryInvByDateRange(startStr, endStr) {
        const { getDocs, query, where, limit } = _sdk(); // [3.3E]
        const invRef = (window.__store || {}).invRef;
        if (!invRef) return [];
        const snap = await getDocs(
            query(invRef, where('date', '>=', startStr), where('date', '<=', endStr), limit(1000)) // [3.3E] inventory date range
        );
        const results = [];
        snap.forEach(d => results.push({ id: d.id, ...d.data() }));
        return results;
    },

    // ── INVENTORY (liên quan finance) ───────────────────────────

    /**
     * Xóa bản ghi kho liên kết khi xóa transaction.
     * @param {string} invId — inventory doc ID
     */
    async deleteRelatedInventory(invId) {
        return InventoryService.deleteItem(invId, { reason: 'finance-delete-related-inventory' });
    },

    /**
     * Cập nhật profile sau khi xóa transaction học phí:
     * ghi paidUntil mới + arrayRemove các tháng đã xóa.
     * @param {string}   studentName   — doc ID trong profiles
     * @param {string}   newPaidUntil  — YYYY-MM hoặc ''
     * @param {string[]} deletedMonths — mảng YYYY-MM cần xóa khỏi paidMonths
     */
    async updateProfileAfterTxDelete(studentName, newPaidUntil, deletedMonths) {
        const { doc, updateDoc, arrayRemove } = _sdk();
        const profileUpdate = { paidUntil: newPaidUntil, paidThroughMonth: newPaidUntil };
        if (deletedMonths.length > 0) {
            profileUpdate.paidMonths = arrayRemove(...deletedMonths);
        }
        await updateDoc(
            doc(_db(), 'clubs', _clubId(), 'profiles', studentName),
            profileUpdate
        );
    },

    /**
     * Trả về Firebase arrayUnion FieldValue (dùng trong quickPay, processCombo, saveTx).
     * Cho phép module gọi FinanceService._arrayUnion(...months).
     * @param  {...string} items
     * @returns {FieldValue}
     */
    _arrayUnion(...items) { return (window._fb_init || {}).arrayUnion(...items); },
};
