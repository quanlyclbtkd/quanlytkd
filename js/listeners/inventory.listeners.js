/**
 * listeners/inventory.listeners.js — Phase 3.6 Listener Ownership Isolation
 * ────────────────────────────────────────────────────────────────
 * Stub quản lý lifecycle listener Inventory.
 *
 * TRẠNG THÁI PHASE 3.6:
 *   Có 2 inventory-related global listeners trong app.js:
 *
 *   1. invStatsRef listener:
 *      key: 'global:invStats:{clubId}'     → owner: 'inventory'
 *      onSnapshot(invStatsRef)              — tổng số lượng tồn kho (cache stats)
 *      Invalidates: inventory + dashboard
 *
 *   2. invRef query listener:
 *      key: 'global:inventory:{clubId}'    → owner: 'inventory'
 *      onSnapshot(query(invRef, limit(500))) — allInventory (500 bản gần nhất)
 *      Invalidates: inventory + finance (cross-ref) + dashboard
 *
 *   CHƯA migrate sang tab-scoped vì:
 *   1. allInventory dùng bởi finance tab (đồng phục đã bán)
 *   2. inventoryStats dùng bởi inventory tab + dashboard
 *   3. Cross-tab dependency cao
 *
 *   Snapshot invalidation (đã implement trong app.js):
 *     invStats snapshot → invalidateInventory('invstats-snapshot')
 *                       → invalidateDashboard('invstats-snapshot')
 *     inventory snapshot → invalidateInventory('inventory-snapshot')
 *                        → invalidateFinance('inventory-affect-finance')
 *                        → invalidateDashboard('inventory-snapshot')
 *
 * TODO Phase 3.6B: Migrate inventory listener ownership.
 *   Cân nhắc: invRef query (limit 500) nặng → có thể lazy mount khi vào tab Kho
 *   nhưng finance tab cũng cần allInventory → vẫn global an toàn nhất.
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
    return `global:inventory:${clubId}`;
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
 * Hiện tại app.js xử lý qua onSnapshot(invStatsRef) + onSnapshot(invRef query).
 * @param {{ clubId?: string }} [context]
 */
export function mountInventoryListeners(context = {}) {
    // TODO Phase 3.6B: migrate inventory listener ownership
    void context;
}
