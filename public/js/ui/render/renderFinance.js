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
import { getFinanceCachedHtml } from './computation/financeRenderer.js';

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
    _applyHtml(document.getElementById('txList'), getFinanceCachedHtml('txRows'));
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
