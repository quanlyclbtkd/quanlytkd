/**
 * listeners/inventory.listeners.js — Phase 4K-6V2 Inventory Ownership
 * ────────────────────────────────────────────────────────────────
 * Inventory có ba nguồn dữ liệu độc lập:
 *
 *   1. global:invStats:{clubId}
 *      onSnapshot(settings/inventory_stats) — số tồn/tổng hợp dùng nhiều tab.
 *
 *   2. global:inventoryActiveDebts:{clubId}
 *      onSnapshot(where(unpaid == true)) — toàn bộ công nợ đang hoạt động,
 *      không limit và không phụ thuộc lịch sử hiển thị.
 *
 *   3. Inventory history
 *      getDocs + orderBy(timestamp desc) + limit(100) + startAfter(cursor),
 *      chỉ tải khi tab Kho mở; không phải realtime listener toàn cục.
 *
 * cleanupInventoryListeners() vẫn cleanup theo owner inventory khi logout/đổi CLB.
 * ────────────────────────────────────────────────────────────────
 */

import { cleanupListenersByOwner } from '../utils/listeners.js';

// ─────────────────────────────────────────────────────────────────
// KEY BUILDERS
// ─────────────────────────────────────────────────────────────────

/** @param {string} clubId */
export function getInvStatsListenerKey(clubId) {
    return `global:invStats:${clubId}`;
}
/** @param {string} clubId */
export function getInventoryListenerKey(clubId) {
    return `global:inventoryActiveDebts:${clubId}`;
}

/** @param {string} clubId */
export function getInventoryDebtListenerKey(clubId) {
    return `global:inventoryActiveDebts:${clubId}`;
}

// ─────────────────────────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────────────────────────

/**
 * Cleanup inventory listeners — gọi khi logout/club switch.
 * @param {string} [reason]
 */
export function cleanupInventoryListeners(reason = 'inventory-cleanup') {
    // TODO Phase 3.6B: migrate inventory listener ownership
    cleanupListenersByOwner('inventory', reason);
}

/**
 * Mount inventory listeners — STUB.
 * Hiện tại app.js xử lý invStats + complete active-debt listener; lịch sử dùng getDocs phân trang.
 * @param {{ clubId?: string }} [context]
 */
export function mountInventoryListeners(context = {}) {
    // TODO Phase 3.6B: migrate inventory listener ownership
    void context;
}
