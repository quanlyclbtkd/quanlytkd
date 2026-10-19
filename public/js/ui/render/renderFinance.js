/**
 * renderFinance.js — Phase 3.5A Render Computation Isolation
 *
 * Finance render islands. Each island owns exactly one DOM region.
 *
 * Islands registered:
 *   tx.txList               → #txList           (transaction list)
 *   finance.expenseList     → #expenseList       (expense list)
 *   finance.examExpenseList → #examExpenseList   (exam expense list)
 *
 * Phase 3.4 → 3.5A CHANGE:
 *   HTML source moved from window.__store.tabHtmlCache
 *   → module-local financeRenderCache (via getFinanceCachedHtml).
 *   tabHtmlCache is still populated by render.js for backward compat,
 *   but islands no longer read from it directly.
 *
 * Applies HTML via <template> + replaceChildren (DocumentFragment — minimal reflow).
 *
 * Legacy shims (window.renderTxList etc.) are preserved as pass-through calls
 * so any existing onclick / imperative callers continue to work.
 */

import { registerRender } from './renderRegistry.js';
import { getFinanceCachedHtml, renderTxRow } from './computation/financeRenderer.js?v=production-security-trust-boundary-release-assurance-20260816-v5u6h';

// ─── Core DOM helper ────────────────────────────────────────────────────────

/**
 * Apply an HTML string to a container element using a DocumentFragment.
 * Uses <template> for safe, context-free parsing.
 * replaceChildren() atomically swaps all children in one DOM mutation.
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

/** Render the transaction list (#txList). */
export function renderTxIsland() {
    const target = document.getElementById('txList');
    const pg = window.__store?.pagination?.transactions;
    const month = document.getElementById('filterMonth')?.value || '';
    const searchEl = document.getElementById('txSearch') || document.getElementById('searchInput') || document.querySelector('#tx input[type="search"]');
    const context = month + '|' + (searchEl?.value || '').trim().toLowerCase();
    if (pg?.enabled && pg._displayContextKey === context && Array.isArray(pg.currentItems)) {
        const st = window.__store || {};
        const singleBranch = Number(st.clubConfig?.branchCount || 1) <= 1;
        const selectedBranch = document.getElementById('filterBranch')?.value || 'all';
        const canDelete = (st.userRole || window.userRole) === 'admin';
        const escape = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
        const token = value => encodeURIComponent(String(value ?? '')).replace(/'/g, '%27');
        const rows = pg.currentItems.filter(tx => {
            if (!tx || tx.type === 'Chi phí' || tx.type === 'Chi phí kỳ thi') return false;
            if (window.classifyInventoryFinanceTx?.(tx)?.isInventory) return false;
            return singleBranch || selectedBranch === 'all' || tx.branch === selectedBranch || tx.branch === 'Chung';
        }).map(tx => {
            const branchTdHTML = singleBranch ? '' : `<td class="col-branch"><span class="badge bg-slate-100 text-slate-600 border border-slate-200">${escape(tx.branch || 'CS1')}</span></td>`;
            const btnDel = canDelete
                ? `<button type="button" class="btn-sm bg-rose-50 text-rose-600 hover:bg-rose-500 hover:text-white ml-1" onclick="deleteTx(decodeURIComponent('${escape(token(tx.id))}'), decodeURIComponent('${escape(token(tx.relatedInvId || ''))}'))">🗑</button>`
                : '';
            return renderTxRow(tx, { isSingleBranch: singleBranch, isAdmin: canDelete, branchTdHTML, btnDel });
        });
        _applyHtml(target, rows.join(''));
        return;
    }
    _applyHtml(target, getFinanceCachedHtml('txRows'));
}

/** Render the expense list (#expenseList). */
export function renderExpenseIsland() {
    _applyHtml(document.getElementById('expenseList'), getFinanceCachedHtml('expenseRows'));
}

/** Render the exam expense list (#examExpenseList). */
export function renderExamExpenseIsland() {
    _applyHtml(document.getElementById('examExpenseList'), getFinanceCachedHtml('examExpRows'));
}

// ─── Island initialiser ──────────────────────────────────────────────────────

/**
 * Register all finance render islands with the registry.
 * Call once during application bootstrap (main.js).
 */
export function initFinanceIslands() {
    registerRender('tx.txList', renderTxIsland, {
        selector: '#txList',
        tabId:    'tx',
    });
    registerRender('finance.expenseList', renderExpenseIsland, {
        selector: '#expenseList',
        tabId:    'expense',
    });
    registerRender('finance.examExpenseList', renderExamExpenseIsland, {
        selector: '#examExpenseList',
        tabId:    'exam',
    });
}

// ─── Legacy window shims ─────────────────────────────────────────────────────
// These preserve backward compatibility with any imperative callers in app.js
// or HTML onclick handlers that reference window.renderTxList etc.

export function registerFinanceLegacyGlobals() {
    window.renderTxList          = renderTxIsland;
    window.renderExpenseList     = renderExpenseIsland;
    window.renderExamExpenseList = renderExamExpenseIsland;
}
