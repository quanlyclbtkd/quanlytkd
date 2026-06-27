/**
 * listeners/dashboard.listeners.js — Phase 3.6 Listener Ownership Isolation
 * ────────────────────────────────────────────────────────────────
 * Quản lý lifecycle listener tab Tổng Quan (Dashboard).
 *
 * TRẠNG THÁI PHASE 3.6:
 *   Dashboard KHÔNG có onSnapshot riêng.
 *   Dữ liệu dashboard aggregate từ các global listeners:
 *     - allTransactions  (finance global listener)
 *     - allProfiles      (students global listener)
 *     - allInventory     (inventory global listener)
 *     - inventoryStats   (inventory global listener)
 *
 *   dashboard.js (Phase 3) có fetchAndRenderHistoricalCharts() dùng getDocs
 *   (không phải onSnapshot) → load stats docs 1 lần, không cần cleanup.
 *
 *   Tab mount:
 *     → invalidateDashboard() để re-render với dữ liệu global đã có
 *     → Chart.js instances được create/update trong render pipeline
 *     → KHÔNG cần mount onSnapshot mới
 *
 *   Tab cleanup:
 *     → no-op (không có listener riêng để cleanup)
 *     → Chart instances được cleanup khi logout qua window._destroyDashboardCharts()
 *
 * TODO Phase 3.6B:
 *   Nếu dashboard cần realtime stats từ Firestore stats docs ({clubId}/stats/{month}):
 *   → mount onSnapshot ở đây
 *   → invalidateDashboard('dashboard-stats-snapshot') trong callback
 *   → cleanup khi rời tab (realtime chart update không cần thiết khi không nhìn)
 * ────────────────────────────────────────────────────────────────
 */

// ─────────────────────────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────────────────────────

/**
 * Mount dashboard tab — trigger invalidateDashboard để re-render.
 * Dashboard dùng dữ liệu từ global listeners → chỉ cần invalidate,
 * không cần mount onSnapshot mới.
 *
 * @param {{ clubId?: string }} [context]
 */
export function mountDashboardListeners(context = {}) {
    // Trigger dashboard re-render với dữ liệu global đã có
    // Không cần registerListener vì không có onSnapshot riêng
    try {
        if (typeof window.invalidateDashboard === 'function') {
            window.invalidateDashboard('dashboard-tab-mount');
        }
    } catch (_) {}
    void context;
}

/**
 * Cleanup dashboard listeners — no-op.
 * Dashboard không có onSnapshot riêng trong Phase 3.6.
 *
 * @param {string} [reason]
 */
export function cleanupDashboardListeners(reason = 'tab-leave') {
    // no-op — dashboard không có onSnapshot riêng
    // TODO Phase 3.6B: cleanup nếu có realtime dashboard stats listener
    void reason;
}
