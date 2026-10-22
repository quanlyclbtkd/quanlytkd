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

/** Status comes from the existing page owner; never infer it from row presence. */
function _appendReconciliationStatus(target, reconciliation) {
    const states = {
        'awaiting-server': ['Đã ghi · chờ đối soát', 'Máy chủ đã xác nhận ghi; danh sách chưa xác nhận đủ nội dung giao dịch.'],
        'needs-review': ['Cần đối soát', 'Danh sách máy chủ đang thiếu hoặc có nội dung khác với giao dịch đã ghi. Chưa thể kết luận khoản thu bị xóa hay bị sửa.'],
        'server-reconciled': ['Đã đối soát danh sách máy chủ', 'Nội dung đang hiển thị đã khớp các nguồn danh sách máy chủ tương ứng.'],
    };
    const sourceLabels = { byDate: 'Ngày thu', byTxMonth: 'Tháng học phí', byPackageMonth: 'Gói nhiều tháng', canonical: 'Tháng hạch toán' };
    const sourceStates = { matched: 'Đã khớp', cache: 'Chưa có xác nhận máy chủ', conflict: 'Nội dung khác', missing: 'Chưa thấy giao dịch', bounded: 'Danh sách chưa đầy đủ' };
    for (const row of target?.children || []) {
        const id = row.dataset.txId;
        const status = reconciliation?.byId?.[id];
        const copy = states[status?.state];
        const cell = row.querySelector('.tx-name-cell');
        if (!copy || !cell) continue;
        const details = document.createElement('details');
        details.className = 'text-xs mt-1 ' + (status.state === 'server-reconciled' ? 'text-emerald-700' : 'text-amber-700');
        details.dataset.reconciliation = status.state;
        const summary = document.createElement('summary'); summary.textContent = copy[0];
        const explanation = document.createElement('p'); explanation.textContent = copy[1];
        const identifier = document.createElement('div'); identifier.textContent = 'Mã giao dịch: ' + id; identifier.style.overflowWrap = 'anywhere';
        details.append(summary, explanation, identifier);
        for (const [source, value] of Object.entries(status.sources)) {
            const line = document.createElement('div'); line.textContent = (sourceLabels[source] || source) + ': ' + (sourceStates[value] || value); details.append(line);
        }
        if (status.state !== 'server-reconciled') {
            const instruction = document.createElement('p'); instruction.textContent = 'Không thu lại. Admin cần đối chiếu mã này với biên lai, giao dịch máy chủ và hồ sơ học phí; tải lại hoặc thấy dòng xuất hiện chưa phải là đối soát hoàn tất.'; details.append(instruction);
        }
        cell.append(details);
    }
}

// ─── Island render functions ─────────────────────────────────────────────────

/** Render the transaction list (#txList). */
export function renderTxIsland() {
    const target = document.getElementById('txList');
    const pg = window.__store?.pagination?.transactions;
    if (pg?.isCurrentContext && !pg.isCurrentContext()) {
        _applyHtml(target, '');
        return;
    }
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
        _appendReconciliationStatus(target, pg.reconciliation);
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
