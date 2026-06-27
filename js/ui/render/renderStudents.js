/**
 * renderStudents.js — Phase 3.5A Render Computation Isolation
 *
 * Student list render islands. Each island owns exactly one DOM region.
 *
 * Islands registered:
 *   students.activeList → #activeList  (active student list)
 *   students.debtList   → #debtList    (debt/unpaid student list)
 *   students.quitList   → #quitList    (quit student list)
 *
 * Phase 3.4 → 3.5A CHANGE:
 *   HTML source moved from window.__store.tabHtmlCache
 *   → module-local studentsRenderCache (via getStudentsCachedHtml).
 *   tabHtmlCache is still populated by render.js for backward compat,
 *   but islands no longer read from it directly.
 *
 * Cached HTML includes "Load more" buttons (built by studentsRenderer).
 * Applies HTML via <template> + replaceChildren (DocumentFragment — minimal reflow).
 */

import { registerRender } from './renderRegistry.js';
import { getStudentsCachedHtml, getStudentsCacheMetrics } from './computation/studentsRenderer.js?v=quit-tab-mobile-parity-20260627-v4b4';

// ─── Core DOM helper ────────────────────────────────────────────────────────

/**
 * Apply an HTML string to a container element using a DocumentFragment.
 * <template> parses HTML without needing a wrapper element context.
 * replaceChildren() atomically replaces all children in one DOM mutation.
 *
 * @param {Element|null} el   — target container
 * @param {string}       html — inner HTML string
 */
function _applyHtml(el, html) {
    if (!el) return;
    if (!html) {
        el.replaceChildren();
        return;
    }
    const tpl = document.createElement('template');
    tpl.innerHTML = html;
    el.replaceChildren(tpl.content);
}

function _syncQuitMobileControl() {
    const ctrlEl = document.getElementById('pgWrap_quitList');
    if (!ctrlEl) return;
    const quitLoaded = !!(window.studentProfileStore && typeof window.studentProfileStore.isQuitLoaded === 'function' && window.studentProfileStore.isQuitLoaded());
    if (!quitLoaded) {
        ctrlEl.innerHTML = '<div style="text-align:center;padding:0.5rem 0;color:#94a3b8;font-size:0.8rem;">Đang tải danh sách đã nghỉ...</div>';
        return;
    }
    let count = 0;
    try {
        const profiles = window.studentProfileStore && typeof window.studentProfileStore.getQuitProfiles === 'function'
            ? (window.studentProfileStore.getQuitProfiles() || {})
            : {};
        count = Object.keys(profiles).length;
    } catch (_) { count = 0; }
    const pageSize = (window.__store && window.__store.pagination && window.__store.pagination.students && window.__store.pagination.students.pageSize) || 50;
    const limit = (window._quitPage || 1) * pageSize;
    const remaining = Math.max(0, count - limit);
    const btnStyle = 'style="padding:0.45rem 1.2rem;font-size:0.85rem;background:#f1f5f9;color:#334155;border:1px solid #cbd5e1;border-radius:6px;cursor:pointer;font-weight:600;"';
    if (remaining > 0) {
        ctrlEl.innerHTML = '<div style="text-align:center;padding:0.75rem 0;">'
            + '<button type="button" ' + btnStyle + ' onclick="window._loadMore(\'quit\')">'
            + '⬇ Tải thêm — còn ' + remaining + ' võ sinh đã nghỉ nữa'
            + '</button></div>';
    } else if (count > 0) {
        ctrlEl.innerHTML = '<div style="text-align:center;padding:0.5rem 0;color:#94a3b8;font-size:0.8rem;">Đã tải hết ' + count + ' võ sinh đã nghỉ</div>';
    } else {
        ctrlEl.innerHTML = '<div style="text-align:center;padding:0.5rem 0;color:#94a3b8;font-size:0.8rem;">Chưa có võ sinh đã nghỉ</div>';
    }
}

// ─── Island render functions ─────────────────────────────────────────────────

/** Render the active student list (#activeList). */
export function renderActiveIsland() {
    const _html = getStudentsCachedHtml('activeRows');
    // Phase 4K-STUDENT-RENDER-OVERWRITE-FIX:
    // Nếu cache rỗng nhưng pagination có currentItems → KHÔNG xóa DOM.
    // Root cause bug: _applyHtml(el, '') gọi el.replaceChildren() → xóa toàn bộ
    // rows mà pagination fallback đã inject trước đó.
    if (!_html) {
        const _pgState    = window.__store?.pagination?.students;
        const _hasPgItems = _pgState?.enabled &&
            Array.isArray(_pgState.currentItems) &&
            _pgState.currentItems.length > 0;
        if (_hasPgItems) {
            // Phase 4K-5F: hard-filter active items before fallback render
            const _activeItems = typeof window.filterStudentItemsForMode === 'function'
                ? window.filterStudentItemsForMode(_pgState.currentItems, 'active')
                : _pgState.currentItems;
            const _fbHtml = typeof window.buildStudentsRowsFromPagination === 'function'
                ? window.buildStudentsRowsFromPagination(_activeItems, 'active')
                : '';
            if (_fbHtml) {
                _applyHtml(document.getElementById('activeList'), _fbHtml);
                return;
            }
            // Builder chưa sẵn → bảo toàn DOM (không clear rows đang hiển thị)
            console.warn('[renderActiveIsland] activeRows cache empty — pagination has',
                _pgState.currentItems.length, 'items. Preserving existing DOM rows.');
            return;
        }
    }
    _applyHtml(document.getElementById('activeList'), _html);
}

/** Render the debt/unpaid list (#debtList). */
export function renderDebtIsland() {
    _applyHtml(document.getElementById('debtList'), getStudentsCachedHtml('debtRows'));
}

/** Render the quit student list (#quitList). */
export function renderQuitIsland() {
    const _htmlQ = getStudentsCachedHtml('quitRows');
    const _target = document.getElementById('quitList');
    const _quitLoaded = !!(window.studentProfileStore && typeof window.studentProfileStore.isQuitLoaded === 'function' && window.studentProfileStore.isQuitLoaded());

    // Phase 4K-6V4B4: desktop/mobile parity. Once authoritative quitProfiles
    // are loaded, #quitList must be owned only by quitRows cache. Do not fall
    // back to the shared server-side pagination state because it is normally an
    // Active-tab page and can wipe the mobile quit list.
    if (_quitLoaded) {
        _applyHtml(_target, _htmlQ || '');
        _syncQuitMobileControl();
        return;
    }

    // Before quit data is ready, preserve any existing DOM rows instead of
    // clearing the mobile table. This avoids a blank flash while lazy load runs.
    if (!_htmlQ) {
        const _hasRows = _target && _target.querySelector('tr[data-quit-id], tr[data-student-id]');
        if (_hasRows) return;
        if (_target) {
            _applyHtml(_target, '<tr data-quit-loading="1"><td colspan="7" style="text-align:center;color:#94a3b8;padding:16px;font-size:0.82rem;">Đang tải danh sách đã nghỉ...</td></tr>');
        }
        _syncQuitMobileControl();
        return;
    }
    _applyHtml(_target, _htmlQ);
    _syncQuitMobileControl();
}

// ─── Island initialiser ──────────────────────────────────────────────────────

/**
 * Register all student render islands with the registry.
 * Call once during application bootstrap (main.js).
 */
export function initStudentIslands() {
    registerRender('students.activeList', renderActiveIsland, {
        selector: '#activeList',
        tabId:    'active',
    });
    registerRender('students.debtList', renderDebtIsland, {
        selector: '#debtList',
        tabId:    'debt',
    });
    registerRender('students.quitList', renderQuitIsland, {
        selector: '#quitList',
        tabId:    'quit',
    });
}

// ─── Legacy window shims ─────────────────────────────────────────────────────

export function registerStudentsLegacyGlobals() {
    window.renderActiveList = renderActiveIsland;
    window.renderDebtList   = renderDebtIsland;
    window.renderQuitList   = renderQuitIsland;
    // Phase 4K-STUDENT-RENDER-OVERWRITE-FIX: expose cache metrics cho debug helper
    window.getStudentsCacheMetrics = getStudentsCacheMetrics;
}
