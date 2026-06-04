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
import { getStudentsCachedHtml, getStudentsCacheMetrics } from './computation/studentsRenderer.js';

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
    // Phase 4K-STUDENT-RENDER-OVERWRITE-FIX: tương tự active, bảo toàn quit DOM khi cache rỗng
    if (!_htmlQ) {
        const _pgState    = window.__store?.pagination?.students;
        const _hasQuitItems = _pgState?.enabled &&
            Array.isArray(_pgState.currentItems) &&
            _pgState.currentItems.length > 0 &&
            !!(window.__store?.pagination?._quitPagActive);
        if (_hasQuitItems) {
            // Phase 4K-5F: hard-filter quit items before fallback render
            const _quitItems = typeof window.filterStudentItemsForMode === 'function'
                ? window.filterStudentItemsForMode(_pgState.currentItems, 'quit')
                : _pgState.currentItems;
            const _fbHtmlQ = typeof window.buildStudentsRowsFromPagination === 'function'
                ? window.buildStudentsRowsFromPagination(_quitItems, 'quit')
                : '';
            if (_fbHtmlQ) {
                _applyHtml(document.getElementById('quitList'), _fbHtmlQ);
                return;
            }
            console.warn('[renderQuitIsland] quitRows cache empty — quit pagination has items. Preserving DOM.');
            return;
        }
    }
    _applyHtml(document.getElementById('quitList'), _htmlQ);
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
