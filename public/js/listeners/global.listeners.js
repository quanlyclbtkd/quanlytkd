/**
 * listeners/global.listeners.js — Phase 3.6 Listener Ownership Isolation
 * ────────────────────────────────────────────────────────────────
 * Tài liệu hóa và cleanup helper cho GLOBAL Firestore listeners.
 *
 * GLOBAL listeners là các listeners cần sống suốt session login —
 * cung cấp dữ liệu nền tảng cho nhiều tab:
 *
 *   key: 'global:club:{clubId}'        → Listener owner: club/global
 *     onSnapshot(clubRef)               — tên CLB, examEnabled, hiển thị UI
 *
 *   key: 'global:settings:{clubId}'    → Listener owner: settings/global
 *     onSnapshot(settingsRef)           — clubConfig, branchCount, fee defaults
 *
 *   key: 'global:invStats:{clubId}'    → Listener owner: inventory/global
 *     onSnapshot(invStatsRef)           — tổng hàng tồn kho (cache stats)
 *
 *   key: 'global:profiles:{clubId}'    → Listener owner: students/global
 *     onSnapshot(profRef)               — allProfiles (tất cả võ sinh)
 *     ❗ Không giới hạn — loads ALL profiles (xem NOTE bên dưới)
 *
 *   key: 'global:inventoryActiveDebts:{clubId}' → Listener owner: inventory/global
 *     onSnapshot(query(invRef, where(unpaid == true))) — toàn bộ công nợ Kho đang hoạt động
 *     Lịch sử Kho không phải listener global; tải 100 bản ghi/trang khi mở tab Kho.
 *
 *   key: 'finance:tx:{clubId}:{month}' → Listener owner: finance/global
 *     onSnapshot (2 queries: byDate + byTxMonth) — allTransactions tháng hiện tại
 *     Re-subscribe khi đổi tháng qua window.listenToData(monthStr)
 *
 *   key: 'global:notif:{clubId}'       → Listener owner: notif/global
 *     onSnapshot(adminNotifications)   — thông báo báo cáo HLV (admin only)
 *
 * NOTE profiles listener:
 *   [3.3E WARN] onSnapshot(profRef) has NO limit — loads ALL profiles.
 *   Migration sang paginated/filtered query là Phase 3.4+ task.
 *   Giữ nguyên trong Phase 3.6.
 *
 * Các listeners này được ĐĂNG KÝ trong app.js (legacy init flow)
 * và CLEANUP qua cleanupAllListeners() khi logout/club-switch.
 *
 * File này KHÔNG mount lại listeners — chỉ cung cấp:
 *   - key constants cho debug/lookup
 *   - cleanup helpers per-owner
 * ────────────────────────────────────────────────────────────────
 */

import {
    cleanupListenersByOwner,
    cleanupListenersByScope,
    removeListener,
} from '../utils/listeners.js';

// ─────────────────────────────────────────────────────────────────
// KEY BUILDERS (phải khớp với registerListener calls trong app.js)
// ─────────────────────────────────────────────────────────────────

export const GLOBAL_LISTENER_KEYS = {
    /**
     * @param {string} clubId
     * @returns {string}
     */
    CLUB:      (clubId)              => `global:club:${clubId}`,
    /**
     * @param {string} clubId
     * @returns {string}
     */
    SETTINGS:  (clubId)              => `global:settings:${clubId}`,
    /**
     * @param {string} clubId
     * @returns {string}
     */
    INV_STATS: (clubId)              => `global:invStats:${clubId}`,
    /**
     * @param {string} clubId
     * @returns {string}
     */
    PROFILES:  (clubId)              => `global:profiles:${clubId}`,
    /**
     * @param {string} clubId
     * @returns {string}
     */
    INVENTORY: (clubId)              => `global:inventoryActiveDebts:${clubId}`,
    INVENTORY_ACTIVE_DEBTS: (clubId) => `global:inventoryActiveDebts:${clubId}`,
    /**
     * @param {string} monthStr — 'YYYY-MM'
     * @param {string} clubId
     * @returns {string}
     */
    TX:        (monthStr, clubId)    => `finance:tx:${clubId}:${monthStr}`,
    /**
     * @param {string} clubId
     * @returns {string}
     */
    NOTIF:     (clubId)              => `global:notif:${clubId}`,
};

// ─────────────────────────────────────────────────────────────────
// CLEANUP HELPERS
// ─────────────────────────────────────────────────────────────────

/**
 * Cleanup TẤT CẢ global listeners theo owner.
 * NOTE: cleanupAllListeners() trong listeners.js đã làm điều này.
 * Hàm này dùng cho targeted cleanup theo owner nếu cần granular control.
 *
 * @param {string} [reason]
 */
export function cleanupGlobalListeners(reason = 'global-cleanup') {
    cleanupListenersByOwner('club',      reason);
    cleanupListenersByOwner('settings',  reason);
    cleanupListenersByOwner('inventory', reason);
    cleanupListenersByOwner('students',  reason);
    cleanupListenersByOwner('finance',   reason);
    cleanupListenersByOwner('notif',     reason);
    // Fallback: cleanup scope 'global' (bắt cả legacy-owned global listeners)
    cleanupListenersByScope('global', reason);
}

/**
 * Cleanup finance (tx) listener theo clubId + monthStr.
 * Dùng khi re-subscribe cho tháng mới.
 *
 * @param {string} monthStr
 * @param {string} clubId
 * @param {string} [reason]
 */
export function cleanupTxListener(monthStr, clubId, reason = 'tx-resubscribe') {
    removeListener(GLOBAL_LISTENER_KEYS.TX(monthStr, clubId), reason);
}

/**
 * Danh sách owners của global listeners (for inspection).
 * @returns {string[]}
 */
export function getGlobalListenerOwners() {
    return ['club', 'settings', 'inventory', 'students', 'finance', 'notif'];
}
