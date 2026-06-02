/**
 * listeners/finance.listeners.js — Phase 3.6 Listener Ownership Isolation
 * ────────────────────────────────────────────────────────────────
 * Stub quản lý lifecycle listener Finance.
 *
 * TRẠNG THÁI PHASE 3.6:
 *   Finance transactions listener (currentTxUnsub trong app.js) là GLOBAL listener
 *   quan trọng nhất của app — cung cấp dữ liệu cho nhiều tab:
 *     - Tab Thu học phí (tx list)
 *     - Tab Báo nợ (debt calculation)
 *     - Tab Tổng quan (dashboard revenue chart)
 *     - Tab Đang tập / Đã nghỉ (tuition debt per student)
 *
 *   Đã được đánh dấu owner: 'finance', scope: 'global' trong app.js.
 *   Key pattern: 'finance:tx:{clubId}:{monthStr}'
 *
 *   CHƯA migrate sang tab-scoped vì:
 *   1. Finance data được dùng bởi NHIỀU tab — không thể tab-scope
 *   2. Re-subscribe khi đổi tháng qua window.listenToData(monthStr) — logic riêng
 *   3. Risk cao khi đổi lifecycle: mất data cho dashboard/debt khi rời finance tab
 *
 *   Snapshot invalidation (đã implement trong app.js _mergeAndRender):
 *     transactions snapshot → invalidateFinance('transactions-snapshot')
 *                           → invalidateStudents('transactions-affect-debt')
 *                           → invalidateDashboard('transactions-snapshot')
 *
 * TODO Phase 3.6B: Migrate finance listener ownership hoàn toàn.
 *   - Tách biệt: finance-tab listener (realtime tx) vs dashboard (read-only cache)
 *   - Cân nhắc: listener global vẫn an toàn nhất cho use case này
 * ────────────────────────────────────────────────────────────────
 */

import { cleanupListenersByOwner, removeListener, hasListener } from '../utils/listeners.js';

// ─────────────────────────────────────────────────────────────────
// KEY BUILDER (phải khớp với app.js registerListener call)
// ─────────────────────────────────────────────────────────────────

/**
 * Key cho finance tx listener.
 * @param {string} clubId
 * @param {string} monthStr — 'YYYY-MM'
 * @returns {string}
 */
export function getTxListenerKey(clubId, monthStr) {
    return `finance:tx:${clubId}:${monthStr}`;
}

// ─────────────────────────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────────────────────────

/**
 * Cleanup finance listeners — gọi khi logout/club switch.
 * NOTE: window.listenToData() tự cleanup currentTxUnsub khi re-subscribe tháng mới.
 *       Hàm này dùng cho cleanup khi logout hoàn toàn.
 * @param {string} [reason]
 */
export function cleanupFinanceListeners(reason = 'finance-cleanup') {
    // TODO Phase 3.6B: migrate finance listener ownership
    cleanupListenersByOwner('finance', reason);
}

/**
 * Cleanup tx listener cụ thể theo tháng (dùng khi đổi tháng).
 * @param {string} clubId
 * @param {string} monthStr
 * @param {string} [reason]
 */
export function cleanupTxListenerByMonth(clubId, monthStr, reason = 'tx-month-change') {
    removeListener(getTxListenerKey(clubId, monthStr), reason);
}

/**
 * Kiểm tra tx listener cho tháng đã được đăng ký chưa.
 * @param {string} clubId
 * @param {string} monthStr
 * @returns {boolean}
 */
export function hasTxListener(clubId, monthStr) {
    return hasListener(getTxListenerKey(clubId, monthStr));
}

/**
 * Mount finance listeners — STUB.
 * Hiện tại app.js xử lý qua window.listenToData(monthStr).
 * @param {{ clubId?: string, monthStr?: string }} [context]
 */
export function mountFinanceListeners(context = {}) {
    // TODO Phase 3.6B: migrate finance listener ownership
    // app.js window.listenToData() đang xử lý
    // Re-subscribe logic: listenToData() cleanup currentTxUnsub → create u1+u2 → registerListener
    void context;
}
