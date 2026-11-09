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

import { InventoryService } from "./inventory.service.js?v=a9r18-inventory-stock-authority-r1-20261108";

function _sdk()    { return window._fb_init || {}; }
function _db()     { const db = (window.__store || {}).db; if (!db) throw new Error('[FinanceService] db chưa sẵn sàng'); return db; }
function _clubId() { const id = (window.__store || {}).clubId; if (!id) throw new Error('[FinanceService] clubId chưa sẵn sàng'); return id; }
function _colRef() { return (window.__store || {}).colRef; }
function _projectionScope() {
    const st = window.__store || {};
    return [st.clubId || '', st.auth?.currentUser?.uid || st.currentUser?.uid || '', window.userRole || st.userRole || '', Number(window.__verifiedAuthContextState?.generation || 0)].join('|');
}
function _financialWriteContext() {
    const st = window.__store || {}, auth = window.__verifiedAuthContextState || {};
    return Object.freeze({
        clubId: String(st.clubId || window.currentClubId || '').trim(),
        uid: String(auth.uid || st.auth?.currentUser?.uid || st.currentUser?.uid || window.currentUser?.uid || '').trim(),
        generation: Number(auth.generation || 0), sessionEpoch: Number(auth.sessionEpoch || 0), authGeneration: Number(auth.authGeneration || 0),
    });
}
function _financialWriteContextCurrent(ctx) {
    if (!ctx || !ctx.clubId || !ctx.uid) return false;
    const now = _financialWriteContext(), auth = window.__verifiedAuthContextState || {};
    return auth.ready === true && now.clubId === ctx.clubId && now.uid === ctx.uid
        && now.generation === ctx.generation && now.sessionEpoch === ctx.sessionEpoch && now.authGeneration === ctx.authGeneration;
}
function _financialWriteContextToken(ctx) {
    const c = ctx || _financialWriteContext();
    return [c.clubId || '', c.uid || '', Number(c.generation || 0), Number(c.sessionEpoch || 0), Number(c.authGeneration || 0)].join('|');
}
function _projectCommitted(rows, removedIds, scope, reason) {
    if (scope !== _projectionScope()) return;
    // Projection failures are secondary to the already confirmed financial write.
    for (const tx of rows) {
        try { window.mergeTransactionIntoRuntimeStore?.(tx, reason); }
        catch (error) { console.warn('[FinanceService] committed transaction projection failed:', error); }
    }
    if (removedIds.length) {
        const st = window.__store || {};
        const removed = new Set(removedIds.map(String));
        if (Array.isArray(st.transactions)) st.transactions = st.transactions.filter(tx => !removed.has(String(tx.id)));
        try { st.pagination?.transactions?.reconcile?.({ removedIds }); }
        catch (error) { console.warn('[FinanceService] committed delete projection failed:', error); }
        window.invalidateList?.('tx.txList', reason);
    }
}
function _expenseDateValid(value) {
    const s = String(value || '');
    if (!/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(s)) return false;
    const d = new Date(s + 'T00:00:00Z');
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}
function _expenseValid(data) {
    return ['Chi phí', 'Chi phí kỳ thi'].includes(data?.type)
        && String(data?.description || '').trim().length > 0
        && String(data?.branch || '').trim().length > 0
        && Number.isFinite(Number(data?.amount)) && Number(data.amount) > 0
        && _expenseDateValid(data?.date)
        && (data.type !== 'Chi phí kỳ thi' || data.txMonth === data.date.slice(0, 7));
}

const _completeEvidenceFlights = new Map();
const _evidenceMetrics = { requests: [], singleFlightHits: 0, reads: 0 };
function _normalizeMonth(value) {
    const m = String(value || '').trim().slice(0, 7);
    return /^\d{4}-(0[1-9]|1[0-2])$/.test(m) ? m : '';
}
function _evidenceContext(monthInput, expectedOperationContext = null) {
    const st = window.__store || {}, core = expectedOperationContext || _financialWriteContext(), month = _normalizeMonth(monthInput);
    const readMode = typeof window['getCanonicalTransactionReadMode'] === 'function'
        ? String(window.getCanonicalTransactionReadMode(core.clubId, month) || 'legacy') : String(st._activeTxReadMode || 'legacy');
    return Object.freeze({ ...core, month, readMode });
}
function _evidenceContextCurrent(ctx) {
    if (!ctx || !ctx.clubId || !ctx.month || !_financialWriteContextCurrent(ctx)) return false;
    const now = _evidenceContext(ctx.month);
    return now.clubId === ctx.clubId && now.month === ctx.month && now.readMode === ctx.readMode
        && now.uid === ctx.uid && now.generation === ctx.generation
        && now.sessionEpoch === ctx.sessionEpoch && now.authGeneration === ctx.authGeneration;
}
function _coverageCompleteForContext(ctx) {
    const st = window.__store || {}, coverage = st.transactionCoverage || {};
    return coverage.clubId === ctx.clubId && coverage.month === ctx.month
        && coverage.ready === true && coverage.complete === true && coverage.pageServerComplete === true
        && coverage.pageEvidence?.epoch === st._activeTxProjectionEpoch
        && String(coverage.readMode || '') === ctx.readMode
        && String(st._activeTxReadMode || coverage.readMode || '') === ctx.readMode
        && _evidenceContextCurrent(ctx);
}
function _runtimeTransactionRows() {
    const st = window.__store || {}, out = [], seen = new Set();
    const sources = [st.allTransactions, window.allTransactions, st.transactions];
    for (const rows of sources) for (const tx of (Array.isArray(rows) ? rows : [])) {
        if (!tx) continue;
        const id = String(tx.id || tx.txId || '');
        const key = id || JSON.stringify([tx.type, tx.description, tx.amount, tx.date, tx.txMonth, tx.timestamp]);
        if (seen.has(key)) continue;
        seen.add(key); out.push(tx);
    }
    return out;
}
function _recordEvidenceAudit(row) {
    const metrics = _evidenceMetrics;
    metrics.requests.push({ ...row, at: Date.now() });
    if (metrics.requests.length > 100) metrics.requests.shift();
}
async function _readCompleteQuerySource({ ctx, source, buildQuery, pageSize = 500, maxPages = 100 }) {
    const { getDocs, startAfter } = _sdk();
    let cursor = null, pageCount = 0, paginationComplete = false, allPagesServerConfirmed = true;
    const rows = [];
    for (let i = 0; i < maxPages; i++) {
        const snap = await getDocs(buildQuery(cursor, pageSize, startAfter));
        pageCount++;
        const meta = snap && snap.metadata;
        if (!meta || meta.fromCache !== false || meta.hasPendingWrites !== false) allPagesServerConfirmed = false;
        for (const d of (snap?.docs || [])) rows.push({ id: d.id, ...d.data() });
        if ((snap?.docs?.length || 0) < pageSize) { paginationComplete = true; break; }
        cursor = snap.docs[snap.docs.length - 1];
        if (!cursor) break;
    }
    return { source, rows, pageCount, documentCount: rows.length, paginationComplete, allPagesServerConfirmed };
}
async function _readServerCompleteMonth(ctx, reason) {
    const sdk = _sdk();
    const { query, collection, where, limit } = sdk;
    if (![query, collection, where, limit, sdk.getDocs].every(fn => typeof fn === 'function')) throw new Error('[FinanceService] Firestore evidence SDK chưa sẵn sàng.');
    const colRef = collection(_db(), 'clubs', ctx.clubId, 'transactions');
    const pageSize = 500;
    const sourceResults = [];
    if (ctx.readMode === 'canonical') {
        sourceResults.push(await _readCompleteQuerySource({ ctx, source: 'canonical', pageSize, buildQuery: (cursor, n, startAfter) =>
            query(colRef, where('accountingMonths', 'array-contains', ctx.month), ...(cursor && typeof startAfter === 'function' ? [startAfter(cursor)] : []), limit(n)) }));
    } else {
        const start = ctx.month + '-01', end = ctx.month + '-31';
        sourceResults.push(await _readCompleteQuerySource({ ctx, source: 'byTxMonth', pageSize, buildQuery: (cursor, n, startAfter) =>
            query(colRef, where('txMonth', '==', ctx.month), ...(cursor && typeof startAfter === 'function' ? [startAfter(cursor)] : []), limit(n)) }));
        sourceResults.push(await _readCompleteQuerySource({ ctx, source: 'byDate', pageSize, buildQuery: (cursor, n, startAfter) =>
            query(colRef, where('date', '>=', start), where('date', '<=', end), ...(cursor && typeof startAfter === 'function' ? [startAfter(cursor)] : []), limit(n)) }));
        sourceResults.push(await _readCompleteQuerySource({ ctx, source: 'byPackageMonth', pageSize, buildQuery: (cursor, n, startAfter) =>
            query(colRef, where('packageMonths', 'array-contains', ctx.month), ...(cursor && typeof startAfter === 'function' ? [startAfter(cursor)] : []), limit(n)) }));
    }
    const byId = new Map();
    for (const src of sourceResults) for (const tx of src.rows) byId.set(String(tx.id || ''), tx);
    const contextStillCurrent = _evidenceContextCurrent(ctx);
    const allRequiredSourcesComplete = sourceResults.every(r => r.paginationComplete === true);
    const allPagesServerConfirmed = sourceResults.every(r => r.allPagesServerConfirmed === true);
    const serverComplete = allRequiredSourcesComplete && allPagesServerConfirmed && contextStillCurrent;
    const result = { ok: serverComplete, serverComplete, contextStillCurrent, rows: Array.from(byId.values()), context: ctx, reason: String(reason || ''), sources: sourceResults,
        pageCount: sourceResults.reduce((n,r)=>n+r.pageCount,0), documentCount: Array.from(byId.values()).length };
    const metrics = _evidenceMetrics;
    metrics.reads += result.pageCount;
    _recordEvidenceAudit({ reason: result.reason, club: ctx.clubId, month: ctx.month, readMode: ctx.readMode,
        semanticSources: sourceResults.map(r=>r.source), pageCount: result.pageCount, documentCount: result.documentCount,
        serverConfirmed: serverComplete, singleFlight: false });
    return result;
}

export const FinanceService = {

    // ── TRANSACTIONS ────────────────────────────────────────────

    /** Pure transaction plan for an existing caller's cross-domain batch. */
    prepareTransactionMutation(data, reason = 'finance-prepared-transaction', existingRef = null) {
        const { doc } = _sdk();
        const colRef = _colRef();
        if (!colRef || typeof doc !== 'function') throw new Error('[FinanceService] Transaction ref chưa sẵn sàng.');
        const ref = existingRef || doc(colRef);
        const payload = typeof window.canonicalizeTransactionForWrite === 'function'
            ? window.canonicalizeTransactionForWrite(data, reason) : { ...data };
        return { ref, payload, runtimeTx: { id: ref.id, ...payload } };
    },

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
        const scope = _projectionScope();
        const docRef = await addDoc(colRef, payload);
        try { _projectCommitted([{ ...payload, id: docRef.id }], [], scope, 'finance-service-add'); }
        catch (error) { console.warn('[FinanceService] local transaction projection failed after commit:', error); try { window.recordRuntimeError?.('finance.local-projection-after-commit', error, { transactionId: docRef.id }); } catch (_) {} }
        return docRef.id;
    },

    async createExpense(data) {
        if (!_expenseValid(data)) throw new Error('[FinanceService] Chi phí không hợp lệ.');
        return this.addTransaction(data);
    },

    async updateExpenseTransaction(original, changes) {
        const id = String(original?.id || '').trim();
        if (!id || id === 'undefined' || id === 'null' || !_expenseValid(original)
            || !changes || !Object.keys(changes).every(k => ['branch', 'description', 'amount', 'date'].includes(k))) {
            throw new Error('[FinanceService] Không thể sửa giao dịch này.');
        }
        const next = { ...original, ...changes };
        if (!_expenseValid(next) || (original.type === 'Chi phí kỳ thi' && next.date.slice(0, 7) !== original.txMonth)) {
            throw new Error('[FinanceService] Nội dung chi phí không hợp lệ.');
        }
        const patch = typeof window.canonicalizeTransactionPatch === 'function'
            ? window.canonicalizeTransactionPatch(changes, original, 'finance-expense-edit') : { ...changes };
        const { doc, updateDoc } = _sdk();
        const scope = _projectionScope();
        await updateDoc(doc(_db(), 'clubs', _clubId(), 'transactions', id), patch);
        try { _projectCommitted([{ ...original, ...patch, id }], [], scope, 'finance-expense-edit'); }
        catch (error) { console.warn('[FinanceService] local expense projection failed after commit:', error); try { window.recordRuntimeError?.('finance.expense-local-projection-after-commit', error, { transactionId: id }); } catch (_) {} }
        return id;
    },

    /**
     * Xóa một giao dịch.
     * @param {string} txId — Firestore transaction doc ID
     */
    async deleteTransaction(txId, { expectedContext = null } = {}) {
        const id = String(txId || '').trim();
        if (!id || id === 'undefined' || id === 'null') throw new Error('[FinanceService] transaction id không hợp lệ');
        if (expectedContext && !_financialWriteContextCurrent(expectedContext)) {
            const error = new Error('[FinanceService] Financial write context stale.');
            error.code = 'finance/write-context-stale';
            throw error;
        }
        const { doc, deleteDoc } = _sdk();
        const clubId = expectedContext?.clubId || _clubId();
        const scope = _projectionScope();
        try {
            await deleteDoc(doc(_db(), 'clubs', clubId, 'transactions', id));
        } catch (error) {
            if (error && (error.code === 'permission-denied' || /insufficient permissions/i.test(error.message || ''))) {
                error.message = '[FinanceService] Tài khoản chưa được Firestore Rules cấp quyền xóa giao dịch: ' + (error.message || 'permission-denied');
            }
            throw error;
        }
        try { _projectCommitted([], [id], scope, 'finance-delete'); }
        catch (error) { console.warn('[FinanceService] committed delete projection failed:', error); }
    },

    /** Narrow exam cancellation; identity/amount fields cannot be caller patched. */
    async cancelExamPayment(tx) {
        const id = String(tx?.id || '').trim();
        if (!id || id === 'undefined' || tx?.examPaidCancelled === true) throw new Error('[FinanceService] Lệ phí thi không hợp lệ.');
        if (tx.type === 'Lệ phí thi') {
            const impact = window.TransactionDeleteIntegrity?.analyzeTransactionDeleteImpact?.(tx);
            if (!impact?.safeToHardDelete || impact.hasTuition || impact.hasInventory
                || !Number.isFinite(Number(tx.amount)) || Number(tx.amount) <= 0) throw new Error('[FinanceService] Không thể xóa lệ phí thi có liên kết.');
            await this.deleteTransaction(id);
            return { id, deleted: true };
        }
        if (tx.type !== 'Học phí + Lệ phí thi' || !Number.isFinite(Number(tx.tuitionAmount))
            || Number(tx.tuitionAmount) <= 0 || !Number.isFinite(Number(tx.examAmount))
            || Number(tx.examAmount) <= 0 || tx.relatedInvId
            || (Array.isArray(tx.components) && tx.components.some(c => c?.kind === 'inventory'))) {
            throw new Error('[FinanceService] Không thể hủy thành phần lệ phí thi trong giao dịch này.');
        }
        const patch = {
            type: 'Học phí', amount: Number(tx.tuitionAmount), examAmount: 0,
            examPaidCancelled: true, examPaidCancelledAt: Date.now(),
            examPaidCancelledBy: window.currentUserEmail || ''
        };
        const { doc, updateDoc } = _sdk();
        await updateDoc(doc(_db(), 'clubs', _clubId(), 'transactions', id), patch);
        return { id, deleted: false, patch };
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


    /** Current bounded RAM is negative-authoritative only under the exact current coverage contract. */
    getCurrentMonthEvidenceForWrite({ month, expectedContext = null } = {}) {
        const ctx = expectedContext || _evidenceContext(month);
        const complete = _coverageCompleteForContext(ctx);
        return { ok: complete, serverComplete: complete, strictCurrentCoverageComplete: complete,
            contextStillCurrent: _evidenceContextCurrent(ctx), context: ctx, rows: _runtimeTransactionRows(), source: 'current-coverage' };
    },

    /** Lazy, single-flight, server-confirmed complete month evidence for financial negative decisions. */
    async getCompleteMonthEvidence({ month, reason = 'financial-write-evidence', expectedContext = null } = {}) {
        const ctx = expectedContext || _evidenceContext(month);
        if (!ctx.clubId || !ctx.month) return { ok: false, serverComplete: false, contextStillCurrent: false, rows: [], context: ctx, reason, code: 'SERVER_EVIDENCE_UNVERIFIED' };
        if (!_evidenceContextCurrent(ctx)) return { ok: false, serverComplete: false, contextStillCurrent: false, rows: [], context: ctx, reason, code: 'FINANCE_EVIDENCE_CONTEXT_STALE' };
        const fast = this.getCurrentMonthEvidenceForWrite({ month: ctx.month, expectedContext: ctx });
        if (fast.strictCurrentCoverageComplete && fast.context?.readMode === ctx.readMode && fast.context?.clubId === ctx.clubId) {
            return { ...fast, reason, source: 'strict-current-coverage' };
        }
        const key = [ctx.clubId, ctx.month, ctx.readMode, ctx.uid, ctx.generation, ctx.sessionEpoch, ctx.authGeneration].join('|');
        if (_completeEvidenceFlights.has(key)) {
            const metrics = _evidenceMetrics;
            metrics.singleFlightHits++;
            return _completeEvidenceFlights.get(key);
        }
        const flight = _readServerCompleteMonth(ctx, reason).catch(error => ({ ok: false, serverComplete: false, contextStillCurrent: _evidenceContextCurrent(ctx), rows: [], context: ctx, reason, code: error?.code || 'SERVER_EVIDENCE_UNVERIFIED', error }));
        _completeEvidenceFlights.set(key, flight);
        try { return await flight; }
        finally { if (_completeEvidenceFlights.get(key) === flight) _completeEvidenceFlights.delete(key); }
    },

    captureFinancialWriteContext() { return _financialWriteContext(); },
    isFinancialWriteContextCurrent(ctx) { return _financialWriteContextCurrent(ctx); },
    financialWriteContextToken(ctx) { return _financialWriteContextToken(ctx); },
    captureWriteEvidenceContext(month, expectedOperationContext = null) { return _evidenceContext(month, expectedOperationContext); },
    isWriteEvidenceContextCurrent(ctx) { return _evidenceContextCurrent(ctx); },
    getRuntimeTransactionRowsForEvidence() { return _runtimeTransactionRows(); },
    getWriteEvidenceMetrics() { return { requests: _evidenceMetrics.requests.map(x => ({ ...x })), singleFlightHits: _evidenceMetrics.singleFlightHits, reads: _evidenceMetrics.reads }; },

    async resolveExamPaymentForWrite({ profile, studentName, month, reason = 'exam-write' } = {}) {
        const name = String(studentName || '').trim();
        const ctx = _evidenceContext(month);
        const build = window.buildCanonicalExamPaymentLedger;
        if (!name || !ctx.month || typeof build !== 'function') return { status: 'UNKNOWN', code: 'EXAM_EVIDENCE_UNVERIFIED', context: ctx };
        const canonicalName = typeof window.getCanonicalStudentName === 'function' ? window.getCanonicalStudentName(name, window.__store?.profiles || window.allProfiles || {}) : name;
        const hasPayment = rows => !!build({ month: ctx.month, transactions: rows })?.byName?.[canonicalName];
        const currentRows = _runtimeTransactionRows();
        if (hasPayment(currentRows)) return { status: 'PAID', source: 'positive-current-evidence', rows: currentRows, context: ctx };
        const current = this.getCurrentMonthEvidenceForWrite({ month: ctx.month });
        if (current.strictCurrentCoverageComplete) return { status: 'VERIFIED_UNPAID', source: 'strict-current-coverage', rows: current.rows, context: ctx };
        const complete = await this.getCompleteMonthEvidence({ month: ctx.month, reason, expectedContext: ctx });
        if (!complete.serverComplete || !complete.contextStillCurrent || !_evidenceContextCurrent(ctx)) return { status: 'UNKNOWN', code: complete.code || 'EXAM_EVIDENCE_UNVERIFIED', context: ctx, evidence: complete };
        return hasPayment(complete.rows)
            ? { status: 'PAID', source: 'server-complete-evidence', rows: complete.rows, context: ctx }
            : { status: 'VERIFIED_UNPAID', source: 'server-complete-evidence', rows: complete.rows, context: ctx };
    },

    async requireExamUnpaidForWrite(args = {}) {
        const d = await this.resolveExamPaymentForWrite(args);
        if (d?.status === 'UNKNOWN') { const e = new Error('Chưa xác minh đủ dữ liệu giao dịch. Khoản thu chưa được thực hiện. Vui lòng thử lại khi kết nối ổn định.'); e.code = d.code || 'EXAM_EVIDENCE_UNVERIFIED'; throw e; }
        return d;
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
        monthState = null,
    } = {}) {
        // Phase 4K-4F: First page with monthStr → use inclusive query (txMonth + date + packageMonths)
        // to capture gói nhiều tháng where selectedMonth is a middle month
        if (monthStr) {
            const result = await this.getTransactionsForMonthInclusive({
                pageSize, monthStr, search,
                state: direction === 'next' ? monthState : null,
            });
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
        state    = null,
    } = {}) {
        const { getDocs, query, collection, where, limit, startAfter } = _sdk();
        const db     = _db();
        const clubId = _clubId();
        const colRef = collection(db, 'clubs', clubId, 'transactions');
        if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(monthStr) || !startAfter || !Number.isInteger(pageSize) || pageSize < 1) {
            throw new Error('[FinanceService] Không thể đọc đủ giao dịch tháng: query không hợp lệ.');
        }
        const start = monthStr + '-01';
        const end   = monthStr + '-31';
        const key = clubId + '|' + monthStr + '|' + search + '|' + pageSize;
        const previous = state && state.key === key ? state : null;
        // Per-source cursors and fetched buffers belong to this FinanceService query.
        // Copy before I/O so a rejected branch never corrupts the last good page.
        const branches = previous ? previous.branches.map(b => ({ ...b }))
            : [{ cursor: null, done: false }, { cursor: null, done: false }, { cursor: null, done: false }];
        const builders = [
            c => query(colRef, where('txMonth', '==', monthStr), ...(c ? [startAfter(c)] : []), limit(pageSize)),
            c => query(colRef, where('date', '>=', start), where('date', '<=', end), ...(c ? [startAfter(c)] : []), limit(pageSize)),
            c => query(colRef, where('packageMonths', 'array-contains', monthStr), ...(c ? [startAfter(c)] : []), limit(pageSize)),
        ];
        const snaps = await Promise.all(branches.map((b, i) => b.done ? null : getDocs(builders[i](b.cursor))));
        const map = new Map(previous ? previous.items.map(t => [t.id, t]) : []);
        snaps.forEach((snap, i) => {
            if (!snap) return;
            if (!Array.isArray(snap.docs)) throw new Error('[FinanceService] Trang giao dịch không hợp lệ.');
            snap.docs.forEach(d => map.set(d.id, { id: d.id, ...d.data(), _docSnap: d }));
            branches[i].done = snap.docs.length < pageSize;
            if (snap.docs.length) branches[i].cursor = snap.docs[snap.docs.length - 1];
        });

        let arr = Array.from(map.values())
            .filter(t => {
                if (typeof window.txMatchesSelectedMonth === 'function') {
                    return window.txMatchesSelectedMonth(t, monthStr);
                }
                return true;
            })
            .sort((a, b) => Number(b.timestamp || 0) - Number(a.timestamp || 0) || String(a.id).localeCompare(String(b.id)));

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

        // Until all three streams end, rows are explicitly a preview. The
        // complete timestamp order is authoritative only after the last page.
        const _mergedItems = arr;
        const docs = arr.slice(0, pageSize + 1).map(t => t._docSnap || {
            id: t.id,
            data: () => t,
        });

        return {
            docs, _mergedItems, _source: 'inclusive-month',
            _hasMore: branches.some(b => !b.done),
            _complete: branches.every(b => b.done),
            _monthState: { key, branches, items: Array.from(map.values()) },
        };
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

    /**
     * H8R2 — Commit one logical financial write plan atomically.
     * This is an extension of the EXISTING FinanceService writer authority,
     * not a second writer. Primary transaction/profile writes share one batch.
     * Secondary audit/telemetry stays outside this commit.
     *
     * plan.transactions: [{ id?, data }]
     * plan.profileUpdates: [{ studentName, data }]
     */
    async commitAtomicWritePlan(plan = {}) {
        const { writeBatch, doc, collection } = _sdk();
        const db = _db(), expectedContext = plan.expectedContext || null;
        if (expectedContext && !_financialWriteContextCurrent(expectedContext)) {
            const error = new Error('Financial write context đã thay đổi.'); error.code = 'finance/write-context-stale'; throw error;
        }
        const clubId = expectedContext ? expectedContext.clubId : _clubId();
        const scope = _projectionScope();
        if (typeof writeBatch !== 'function' || typeof doc !== 'function') {
            throw new Error('[FinanceService] Firestore atomic batch chưa sẵn sàng.');
        }
        const transactions = Array.isArray(plan.transactions) ? plan.transactions : [];
        const profileUpdates = Array.isArray(plan.profileUpdates) ? plan.profileUpdates : [];
        const operationCount = transactions.length + profileUpdates.length;
        const SAFE_LIMIT = 400;
        if (operationCount <= 0) return { committed: 0, txIds: [] };
        if (operationCount > SAFE_LIMIT) {
            const error = new Error('Thao tác vượt giới hạn an toàn, chưa có dữ liệu nào được ghi.');
            error.code = 'finance/atomic-plan-too-large';
            error.operationCount = operationCount;
            error.safeLimit = SAFE_LIMIT;
            throw error;
        }

        if (expectedContext && !_financialWriteContextCurrent(expectedContext)) {
            const error = new Error('Financial write context đã thay đổi.'); error.code = 'finance/write-context-stale'; throw error;
        }
        const batch = writeBatch(db);
        const txCol = collection(db, 'clubs', clubId, 'transactions');
        const txIds = [];
        const runtimeRows = [];
        transactions.forEach((entry) => {
            const input = entry && typeof entry === 'object' ? entry : {};
            const ref = input.id
                ? doc(db, 'clubs', clubId, 'transactions', String(input.id))
                : doc(txCol);
            const payload = typeof window.canonicalizeTransactionForWrite === 'function'
                ? window.canonicalizeTransactionForWrite(input.data || {}, input.reason || 'finance-service-atomic-plan')
                : (input.data || {});
            batch.set(ref, payload);
            txIds.push(ref.id);
            runtimeRows.push({ ...payload, id: ref.id });
        });
        profileUpdates.forEach((entry) => {
            const name = String(entry?.studentName || '').trim();
            if (!name) throw new Error('[FinanceService] Atomic plan thiếu profileKey.');
            batch.update(doc(db, 'clubs', clubId, 'profiles', name), entry.data || {});
        });

        await batch.commit();
        _projectCommitted(runtimeRows, [], scope, 'finance-service-atomic-plan');
        return { committed: operationCount, txIds, primaryCommitted: true, commitClubId: clubId,
            postCommitContextCurrent: expectedContext ? _financialWriteContextCurrent(expectedContext) : true };
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
            const ref = await this.addFeeAudit(data);
            return { ok: true, id: String(ref?.id || '') };
        } catch (error) {
            const details = { classification: 'fee-audit-write-failed', secondaryWrite: true, reconciliationNeeded: true, canonicalPaymentPreserved: true };
            console.warn('[FinanceService]', details.classification, details, error || '');
            try { window.recordRuntimeError?.('secondary-consistency:' + details.classification, error || new Error(details.classification), details); } catch (_) {}
            return { ok: false, error };
        }
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
        const { getDocs, query, where, limit, startAfter } = _sdk();
        const colRef = _colRef();
        if (!colRef || !Array.isArray(months) || !months.length || !startAfter) {
            throw new Error('[FinanceService] Không thể đọc đủ packageMonths.');
        }

        const map = new Map();
        for (const m of months) {
            let cursor = null;
            let complete = false;
            for (let page = 0; page < 50; page++) {
                const snap = await getDocs(
                    query(colRef, where('packageMonths', 'array-contains', m), ...(cursor ? [startAfter(cursor)] : []), limit(500))
                );
                snap.forEach(d => map.set(d.id, { id: d.id, ...d.data() }));
                if (snap.docs.length < 500) { complete = true; break; }
                cursor = snap.docs[snap.docs.length - 1];
            }
            if (!complete) throw new Error('[FinanceService] packageMonths chưa đọc hết: ' + m);
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
    async updateProfileAfterTxDelete(studentName, newPaidUntil, deletedMonths, { expectedContext = null } = {}) {
        if (expectedContext && !_financialWriteContextCurrent(expectedContext)) {
            const error = new Error('[FinanceService] Financial write context stale.');
            error.code = 'finance/write-context-stale';
            throw error;
        }
        const { doc, updateDoc, arrayRemove } = _sdk();
        const clubId = expectedContext?.clubId || _clubId();
        const profileUpdate = { paidUntil: newPaidUntil };
        if (deletedMonths.length > 0) {
            profileUpdate.paidMonths = arrayRemove(...deletedMonths);
        }
        await updateDoc(
            doc(_db(), 'clubs', clubId, 'profiles', studentName),
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
