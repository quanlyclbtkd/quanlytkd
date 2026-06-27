/**
 * renderRegistry.js — Phase 3.4 Render Isolation Architecture
 *                     (Patched: Phase 3.5B — Render Invalidation & Lifecycle Stabilization)
 *
 * Manages render island ownership.
 * Each island:
 *   - owns exactly one DOM region (selector)
 *   - belongs to one tab (tabId)
 *   - is SKIPPED (marked dirty) when its tab is hidden
 *   - is flushed automatically when its tab activates
 *
 * API (named exports):
 *   registerRender(key, fn, opts)    → register island { selector?, tabId? }
 *   runRender(key)                   → run via scheduler; skip if tab hidden
 *   runTabRenders(tabId)             → schedule all islands owned by a tab
 *   cleanupRender(key)               → cancel pending + clear dirty flag
 *   cleanupTabRenders(tabId)         → [3.5B FIX] cancel by entry.tabId, not prefix
 *   flushDirtyRenders(tabId)         → re-render dirty islands when tab activates
 *   invalidateRender(key)            → mark island dirty without scheduling
 *   invalidateTabRenders(tabId)      → [3.5B NEW] mark all tab islands dirty
 *   getRegistryInfo()                → dev snapshot
 *
 * Phase 3.5B FIX — cleanupTabRenders():
 *   Trước (sai): cancelRendersByPrefix(tabId + '.')
 *     - Gây ra: prefix 'active.' không khớp với key thực 'students.activeList'
 *     - Gây ra: prefix 'debt.'   không khớp với key thực 'students.debtList'
 *     - Gây ra: prefix 'tx.'     không khớp với key thực 'tx.txList' (may work by accident)
 *   Sau  (đúng): duyệt toàn bộ registry, cancel những entry có entry.tabId === tabId
 *     - Đúng với mọi key: 'students.activeList' (tabId='active'), 'tx.txList' (tabId='tx')
 */

import { requestRender, cancelRender } from './renderScheduler.js';

/**
 * @typedef {{ fn: Function, selector: string|null, tabId: string|null, dirty: boolean }} IslandEntry
 * @type {Map<string, IslandEntry>}
 */
const _reg = new Map();

/** Check whether the DOM tab panel for tabId currently has the .active class. */
function _isTabActive(tabId) {
    if (!tabId) return true; // global islands (no tab ownership) are always active
    const el = document.getElementById('tab_' + tabId);
    return el ? el.classList.contains('active') : false;
}

function _isDev() {
    const h = window.location.hostname;
    return h === 'localhost' || h === '127.0.0.1' || h.endsWith('.replit.dev');
}

/**
 * Register a render island.
 * @param {string}   key              — unique island key (e.g. "tx.txList")
 * @param {Function} fn               — render function executed by scheduler
 * @param {{ selector?: string, tabId?: string }} [opts]
 *   selector — CSS selector for the owned DOM node (documentation only)
 *   tabId    — tab panel ID this island belongs to (e.g. "tx", "active")
 */
export function registerRender(key, fn, opts = {}) {
    _reg.set(key, {
        fn,
        selector: opts.selector || null,
        tabId:    opts.tabId    || null,
        dirty:    false,
    });
}

/**
 * Schedule an island render via the RAF scheduler.
 * If the island's tab is currently hidden, the island is marked dirty
 * and will render when the tab activates (flushDirtyRenders).
 * @param {string} key
 */
export function runRender(key) {
    const entry = _reg.get(key);
    if (!entry) {
        // Key chưa được register (thường xảy ra khi island mới thêm nhưng chưa init)
        // Không warn ở đây để tránh noise khi invalidation layer gọi key chưa tồn tại
        return;
    }
    if (entry.tabId && !_isTabActive(entry.tabId)) {
        entry.dirty = true;
        if (_isDev()) {
            console.info(`[renderRegistry] 👁 Tab "${entry.tabId}" hidden — deferred: "${key}"`);
        }
        return;
    }
    entry.dirty = false;
    requestRender(key, entry.fn);
}

/**
 * Schedule ALL islands belonging to tabId.
 * Called after a tab becomes active (e.g. from flushDirtyRenders or switchTab).
 * @param {string} tabId
 */
export function runTabRenders(tabId) {
    for (const [key, entry] of _reg) {
        if (entry.tabId === tabId) {
            entry.dirty = false;
            requestRender(key, entry.fn);
        }
    }
}

/**
 * Cancel a pending render and clear its dirty flag.
 * @param {string} key
 */
export function cleanupRender(key) {
    const entry = _reg.get(key);
    if (entry) entry.dirty = false;
    cancelRender(key);
}

/**
 * Cancel all pending renders for islands belonging to tabId.
 * Called when leaving a tab (beforeLeave lifecycle hook).
 *
 * [Phase 3.5B FIX]
 *   Trước (sai): cancelRendersByPrefix(tabId + '.')
 *     Prefix 'active.' không bao giờ match 'students.activeList'.
 *     Chỉ cancel đúng nếu render key CÓ prefix = tabId, nhưng hệ thống này
 *     dùng domain-prefixed keys (students.*, tx.*, dashboard.*, v.v.).
 *
 *   Sau (đúng): duyệt registry, cancel theo entry.tabId === tabId
 *     Match chính xác: entry 'students.activeList' có tabId='active' → cancel đúng.
 *
 * @param {string} tabId
 */
export function cleanupTabRenders(tabId) {
    let cancelCount = 0;
    for (const [key, entry] of _reg) {
        if (entry.tabId === tabId) {
            entry.dirty = false;  // reset dirty flag
            cancelRender(key);    // hủy render đang pending trong RAF queue
            cancelCount++;
            if (_isDev()) {
                console.debug(`[renderRegistry] 🧹 cleanup tab="${tabId}" → cancelled key="${key}"`);
            }
        }
    }
    if (_isDev() && cancelCount > 0) {
        console.info(`[renderRegistry] 🧹 cleanupTabRenders("${tabId}") — ${cancelCount} island(s) cancelled`);
    }
}

/**
 * Re-render all islands marked dirty for tabId.
 * Called when a tab becomes active (afterEnter lifecycle hook).
 * @param {string} tabId
 */
export function flushDirtyRenders(tabId) {
    let flushed = 0;
    for (const [key, entry] of _reg) {
        if (entry.tabId === tabId && entry.dirty) {
            entry.dirty = false;
            requestRender(key, entry.fn);
            flushed++;
        }
    }
    if (_isDev() && flushed > 0) {
        console.info(`[renderRegistry] 💧 flushDirtyRenders("${tabId}") — ${flushed} dirty island(s) flushed`);
    }
}

/**
 * Mark an island dirty without scheduling it.
 * Useful for pre-invalidating before a tab switch,
 * or when data changes while tab is hidden.
 * @param {string} key
 */
export function invalidateRender(key) {
    const entry = _reg.get(key);
    if (entry) {
        entry.dirty = true;
    }
}

/**
 * [Phase 3.5B NEW] Mark ALL islands belonging to tabId as dirty, without scheduling.
 * Used by renderInvalidation layer to pre-mark before data propagation.
 * @param {string} tabId
 */
export function invalidateTabRenders(tabId) {
    let count = 0;
    for (const [, entry] of _reg) {
        if (entry.tabId === tabId) {
            entry.dirty = true;
            count++;
        }
    }
    if (_isDev() && count > 0) {
        console.debug(`[renderRegistry] 🔴 invalidateTabRenders("${tabId}") — ${count} island(s) marked dirty`);
    }
}

/**
 * Dev diagnostics snapshot of the registry.
 * @returns {Array<{ key, tabId, selector, dirty }>}
 */
export function getRegistryInfo() {
    return Array.from(_reg.entries()).map(([key, e]) => ({
        key,
        tabId:    e.tabId,
        selector: e.selector,
        dirty:    e.dirty,
    }));
}
