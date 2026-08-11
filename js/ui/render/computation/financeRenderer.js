/**
 * computation/financeRenderer.js — Phase 3.5A Render Computation Isolation
 *
 * Isolated finance render computation.
 * Extracted from renderApp() in render.js.
 *
 * Owns:
 *   - Transaction HTML generation (txRows, expenseRows, examExpRows)
 *   - Finance summary statistics (incTuition, incExam, bStats …)
 *   - Module-local render cache (NOT window.__store.tabHtmlCache)
 *   - Explicit cache invalidation API
 *   - Lightweight render metrics
 *
 * KHÔNG:
 *   - Mutate DOM trực tiếp
 *   - Query Firestore
 *   - Gọi renderApp()
 *   - Implement virtualization
 *
 * Legacy bridge:
 *   render.js reads getFinanceSummary() / getFinanceCachedHtml() and still
 *   mirrors the results into window.__store.tabHtmlCache for backward compat.
 *
 * Row identity:
 *   Every <tr> carries a stable data-*-id attribute so future virtualization
 *   can key on it without re-scanning table structure.
 */

import { formatDate, formatMonth } from '../../../utils/format.js';
import { rankStudentNameSearchResults } from '../../../core/studentSearchIndex.js?v=student-given-name-priority-20260811-v5u3';

// ── Phase 4K-4D: Fallback classify (nếu window.classifyInventoryFinanceTx chưa load) ──
function _fallbackClassifyInvTx(tx, invCats) {
    const type   = String(tx && tx.type || '').trim();
    const amount = Number(tx && tx.amount || 0);
    const cats   = Array.isArray(invCats) ? invCats : ['Võ phục', 'Áo thun', 'Bảo hộ'];
    for (const cat of cats) {
        if (type === 'Thu ' + cat)   return { isInventory: true, direction: 'income',  category: cat, amount };
        if (type === 'Chi ' + cat)   return { isInventory: true, direction: 'expense', category: cat, amount };
        if (type === 'Tặng ' + cat)  return { isInventory: true, direction: 'gift',    category: cat, amount: 0 };
    }
    if (type === 'Võ phục')          return { isInventory: true, direction: 'income',  category: 'Võ phục', amount };
    const hasRelated = !!(tx && tx.relatedInvId);
    if (hasRelated) {
        if (type.startsWith('Thu '))  return { isInventory: true, direction: 'income',  category: '', amount };
        if (type.startsWith('Chi '))  return { isInventory: true, direction: 'expense', category: '', amount };
        if (type.startsWith('Tặng ')) return { isInventory: true, direction: 'gift',    category: '', amount: 0 };
    }
    return { isInventory: false, direction: '', category: '', amount: 0 };
}


// ── Phase 4K-3: Local escape helpers (no external dep) ──────────────────────
function _escAttr(v) {
    return String(v ?? '').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g,'&#39;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function _escHtml(v) {
    return String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Phase 4K-2B: Fallback tx blob builder (used when getTransactionSearchBlob unavailable) ──
function _fallbackTxBlob(t, cleanName) {
    const _nvFn = window.normalizeVNForSearch || (v => String(v || '').toLowerCase().trim());
    return [
        cleanName || (t && t.description) || '',
        t && t.examTitle   || '',
        t && t.studentName || '',
        t && t.note        || '',
        t && t.description || '',
        t && t.type        || '',
    ].map(v => _nvFn(String(v))).join(' ');
}

// ── Module-local branch-name helper (mirrors render.js _getBrN) ──────────────
const _getBrN = (br) =>
    (window.getBranchNameDisplay && window.getBranchNameDisplay(br))
        ? window.getBranchNameDisplay(br)
        : br;

// ── Module-local render cache ─────────────────────────────────────────────────
// Owned exclusively by this module. NOT shared via window.__store.tabHtmlCache.
const _cache = {
    txRows:       null,   // <tr data-tx-id>… string | null
    expenseRows:  null,   // <tr data-expense-id>… string | null
    examExpRows:  null,   // <tr data-exam-exp-id>… string | null
    /** @type {{ incTuition:number, incExam:number, incOther:number,
     *           incUniform:number, exp:number, expExamTotal:number,
     *           expUniform:number, txCount:number,
     *           bStats:Object, bExamStats:Object } | null} */
    summary:      null,
    paramsKey:    null,   // serialised params — duplicate-prevention
    dataVersion:  -1,     // mirrors window.__store._dataVersion at last compute
    _version:     0,      // increments on every invalidate()
};

// ── Metrics ───────────────────────────────────────────────────────────────────
const _metrics = {
    computations:        0,
    cacheHits:           0,
    duplicatePrevented:  0,
    skippedHiddenTab:    0,
    lastComputeMs:       0,
};

// ── Explicit invalidation ─────────────────────────────────────────────────────

/**
 * Invalidate a section of the finance render cache.
 * Call when underlying data changes (Firestore listener fire).
 *
 * @param {'txTable'|'expenseTable'|'examExpTable'|'summary'|'all'} section
 */
export function invalidateFinanceRender(section) {
    if (section === 'txTable'      || section === 'all') _cache.txRows      = null;
    if (section === 'expenseTable' || section === 'all') _cache.expenseRows = null;
    if (section === 'examExpTable' || section === 'all') _cache.examExpRows = null;
    if (section === 'summary'      || section === 'all') _cache.summary     = null;
    if (section === 'all') {
        _cache.paramsKey   = null;
        _cache.dataVersion = -1;
    }
    _cache._version++;
}

// ── Row renderers — stable data-*-id, reusable DOM boundary ──────────────────

/**
 * Render a single income/tuition transaction row.
 * Stable identity: data-tx-id="${tx.id}"
 *
 * @param {Object} tx       — transaction document from Firestore
 * @param {Object} opts
 * @param {boolean} opts.isSingleBranch
 * @param {boolean} opts.isAdmin
 * @param {string}  opts.branchTdHTML   — pre-built branch <td> or ''
 * @param {string}  opts.btnDel         — pre-built delete button or ''
 * @returns {string}
 */
export function renderTxRow(tx, opts = {}) {
    const { isSingleBranch = true, isAdmin = false, branchTdHTML = '', btnDel = '' } = opts;

    // Phase 4K-5F: Bundle transactions — 1 hàng, không lặp tên võ sinh
    const isBundle = tx.paymentKind === 'bundle' || (Array.isArray(tx.components) && tx.components.length > 1);
    if (isBundle) {
        const _cleanName = tx.description ? tx.description.trim() : (tx.studentName || '');
        const _amount    = Number(tx.amount || 0);
        const _txId      = tx.id || tx.txId || '';
        const _monthBadge = tx.txMonth
            ? `<span class="badge bg-violet-50 text-violet-700 border border-violet-200">${formatMonth(tx.txMonth)}</span>`
            : `<span class="badge bg-slate-100 text-slate-400">-</span>`;

        // Detail line — dùng getBundleDetailSummary (không có tên võ sinh)
        const _bundleDetail = typeof window.getBundleDetailSummary === 'function'
            ? window.getBundleDetailSummary(tx)
            : (tx.bundleDetailSummary || tx.componentSummary || tx.bundleSummaryLine || tx.type || '');

        // Full line cho tooltip/print
        const _bundleFullLine = typeof window.getBundleSummaryLine === 'function'
            ? window.getBundleSummaryLine(tx)
            : ((_cleanName ? _cleanName + ' — ' : '') + _bundleDetail);

        const _bundleType = typeof window.getFinanceTransactionDisplayType === 'function'
            ? window.getFinanceTransactionDisplayType(tx)
            : (typeof window.getBundleTypeLabel === 'function'
                ? window.getBundleTypeLabel(tx)
                : (tx.bundleTypeLabel || tx.type || 'Khoản thu'));

        const _typeBadge = `<span class="badge bg-violet-50 text-violet-700 border border-violet-200" title="${_escAttr(_bundleFullLine)}">${_escHtml(_bundleType)}</span>`;
        const _amtCell   = `<td class="tx-amount-cell text-emerald-600 font-bold">+${_amount.toLocaleString()} ₫</td>`;
        const _txMonthsStr = tx.packageMonths ? tx.packageMonths.join(',') : (tx.txMonth || '');
        const _printBtn  = `<button type="button" class="btn-sm bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white js-print-tuition-receipt" data-action="print-tuition-receipt" data-tx-id="${_escAttr(_txId)}" data-student-name="${_escAttr(_cleanName)}" data-tx-months="${_escAttr(_txMonthsStr)}" data-tx-type="${_escAttr(tx.type || '')}" data-tx-date="${_escAttr(tx.date || '')}" data-tx-branch="${_escAttr(tx.branch || 'CS1')}" data-tx-amount="${_amount}" data-exam-title="${_escAttr(tx.examTitle || '')}">🧾 In</button>`;

        // Phase 4K-5F: Tên võ sinh + dòng phụ DETAIL (không phải full summary) → không lặp tên
        const _nameTdBundle = `<td class="tx-name-cell name-link text-[0.95rem]">
          <button type="button" class="link-like js-open-student-profile tx-student-name" data-action="open-student-profile" data-student-name="${_escAttr(_cleanName)}" title="${_escAttr(_cleanName)}">${_escHtml(_cleanName)}</button>
          <div class="tx-bundle-detail text-[0.7rem] text-slate-400" title="${_escAttr(_bundleFullLine)}">${_escHtml(_bundleDetail)}</div>
        </td>`;

        function _formatDateCompactB(date) {
            return formatDate(date);
        }

        return `<tr data-tx-id="${_escAttr(_txId)}">`
            + `<td class="tx-date-cell text-slate-500 text-[0.8rem]" title="${_escAttr(formatDate(tx.date))}">${_formatDateCompactB(tx.date)}</td>`
            + branchTdHTML.replace('class="', 'class="tx-branch-cell ')
            + `<td class="tx-month-cell">${_monthBadge}</td>`
            + _nameTdBundle
            + `<td class="tx-type-cell">${_typeBadge}</td>`
            + _amtCell
            + `<td class="tx-actions-cell action-btns">${_printBtn}${btnDel}</td>`
            + `</tr>`;
    }

    const normalizedTxType = typeof window.normalizeFinanceTransactionType === 'function'
        ? window.normalizeFinanceTransactionType(tx)
        : (tx.type || '');
    const displayTxType = typeof window.getFinanceTransactionDisplayType === 'function'
        ? window.getFinanceTransactionDisplayType(tx)
        : normalizedTxType;
    const isTuition  = normalizedTxType === 'Học phí' || normalizedTxType === 'Học phí + Lệ phí thi';
    const isExamType = normalizedTxType === 'Lệ phí thi';

    // ── Phase 4K-3: Student name (safe for attributes and HTML) ──
    const cleanName  = tx.description ? tx.description.trim() : '';

    // ── Phase 4K-3: Month badge (mirrors app.js displayTxMonth logic) ──
    // Phase 4K-4F: show package date range for multi-month packages
    const displayTxMonth = tx.packageMonths && tx.packageMonths.length > 1
        ? `${tx.packageMonths.length} Tháng`
        : (tx.txMonth ? formatMonth(tx.txMonth) : '-');
    let _packageRangeLabel = '';
    if (tx.packageMonths && tx.packageMonths.length > 1) {
        const _first = tx.packageMonths[0] || '';
        const _last  = tx.packageMonths[tx.packageMonths.length - 1] || '';
        if (_first && _last) {
            // Format: "06/2026 - 08/2026"
            const _fmt = m => {
                const p = String(m).split('-');
                return p.length >= 2 ? p[1] + '/' + p[0] : m;
            };
            _packageRangeLabel = _fmt(_first) + ' – ' + _fmt(_last);
        }
    }
    const monthBadgeTd = tx.packageMonths && tx.packageMonths.length > 1
        ? `<td><span class="badge bg-emerald-50 text-emerald-700 border border-emerald-200" title="${_escAttr(_packageRangeLabel)}">${_escHtml(displayTxMonth)}</span>${_packageRangeLabel ? `<br><span class="text-[0.65rem] text-slate-400 whitespace-nowrap">${_escHtml(_packageRangeLabel)}</span>` : ''}</td>`
        : `<td><span class="badge bg-emerald-50 text-emerald-700 border border-emerald-200">${_escHtml(displayTxMonth)}</span></td>`;

    // ── Phase 4K-3: Clickable student name with event delegation data attrs ──
    const nameTd = `<td class="name-link text-[0.95rem]"><button type="button" class="link-like js-open-student-profile" data-action="open-student-profile" data-student-name="${_escAttr(cleanName)}">${_escHtml(cleanName)}</button></td>`;

    const typeBadge  = isTuition
        ? `<span class="badge bg-emerald-50 text-emerald-700 border border-emerald-200">Học phí</span>`
        : isExamType
            ? `<span class="badge bg-amber-50 text-amber-700 border border-amber-200">Thi đai</span>`
            : `<span class="badge bg-slate-50 text-slate-600 border border-slate-200">${_escHtml(displayTxType || 'Khác')}</span>`;

    // ── Phase 4K-3: Amount cell (mirrors app.js amountHTML multi-month logic) ──
    let amtCell;
    if (tx.packageMonths && tx.packageMonths.length > 1) {
        const totalAllo = isTuition && tx.type === 'Học phí + Lệ phí thi'
            ? (Number(tx.tuitionAmount) || 0) + (Number(tx.examAmount) || 0)
            : Number(tx.amount) || 0;
        amtCell = `<td><div class="text-emerald-600 font-black text-base">+${totalAllo.toLocaleString()}</div><div class="text-[0.65rem] text-slate-500 font-bold whitespace-nowrap">Tổng: ${(Number(tx.amount)||0).toLocaleString()}</div></td>`;
    } else {
        amtCell = `<td class="text-emerald-600 font-bold">+${(Number(tx.amount) || 0).toLocaleString()} ₫</td>`;
    }

    // ── Phase 4K-3: Print button with stable data attrs (event delegation target) ──
    const txMonthsStr  = tx.packageMonths ? tx.packageMonths.join(',') : (tx.txMonth || '');
    const printBtn = `<button type="button" class="btn-sm bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white js-print-tuition-receipt" data-action="print-tuition-receipt" data-tx-id="${_escAttr(tx.id || tx.txId || '')}" data-student-name="${_escAttr(cleanName)}" data-tx-months="${_escAttr(txMonthsStr)}" data-tx-type="${_escAttr(tx.type || '')}" data-tx-date="${_escAttr(tx.date || '')}" data-tx-branch="${_escAttr(tx.branch || 'CS1')}" data-tx-amount="${Number(tx.amount) || 0}" data-exam-title="${_escAttr(tx.examTitle || '')}">🧾 In</button>`;

        function _formatDateCompact(date) {
        return formatDate(date);
    }
    return `<tr data-tx-id="${_escAttr(tx.id || tx.txId || '')}">`
        + `<td class="tx-date-cell text-slate-500 text-[0.8rem]" title="${_escAttr(formatDate(tx.date))}">${_formatDateCompact(tx.date)}</td>`
        + branchTdHTML.replace('class="', 'class="tx-branch-cell ')
        + monthBadgeTd.replace('<td>', '<td class="tx-month-cell">')
        + nameTd.replace('class="name-link', 'class="tx-name-cell name-link')
        + `<td class="tx-type-cell">${typeBadge}</td>`
        + amtCell
        + `<td class="tx-actions-cell action-btns">${printBtn}${btnDel}</td>`
        + `</tr>`;
}

/**
 * Render a single expense row.
 * Stable identity: data-expense-id="${tx.id}"
 *
 * @param {Object} tx
 * @param {Object} opts
 * @param {boolean} opts.isSingleBranch
 * @param {boolean} opts.isAdmin
 * @param {string}  opts.branchTdHTML
 * @param {string}  opts.btnDel
 * @param {string}  opts.btnEditExp
 * @returns {string}
 */
export function renderExpenseRow(tx, opts = {}) {
    const { branchTdHTML = '', btnDel = '', btnEditExp = '' } = opts;
    return `<tr data-expense-id="${tx.id || ''}"><td>${formatDate(tx.date)}</td>${branchTdHTML}<td class="font-bold text-slate-800">${tx.description}</td><td class="text-rose-600 font-bold">-${(Number(tx.amount) || 0).toLocaleString()}</td><td class="action-btns">${btnEditExp}${btnDel}</td></tr>`;
}

/**
 * Render a single exam-expense row.
 * Stable identity: data-exam-exp-id="${tx.id}"
 *
 * @param {Object} tx
 * @param {Object} opts
 * @param {string}  opts.btnDel
 * @param {string}  opts.btnEditExp
 * @returns {string}
 */
export function renderExamExpRow(tx, opts = {}) {
    const { btnDel = '', btnEditExp = '' } = opts;
    return `<tr data-exam-exp-id="${tx.id || ''}"><td>${formatDate(tx.date)}</td><td class="font-bold text-slate-800">${tx.description}</td><td class="text-rose-600 font-bold">-${(Number(tx.amount) || 0).toLocaleString()}</td><td class="action-btns">${btnEditExp}${btnDel}</td></tr>`;
}

// ── Core computation ──────────────────────────────────────────────────────────

/**
 * Single-pass finance computation.
 * Computes summary statistics AND (only for the current tab) builds row HTML.
 *
 * Called by renderApp() instead of the inline transaction forEach loop.
 *
 * @param {Array}  transactions — allTransactions from store
 * @param {Object} params
 * @param {string}   params.curTabId       — active tab ('tx'|'expense'|'exam'|…)
 * @param {string}   params.selBranch      — branch filter value
 * @param {string}   params.search         — search text (lower-cased)
 * @param {boolean}  params.isSingleBranch
 * @param {boolean}  params.isAdmin
 * @param {string[]} params.invCats        — inventory category names
 * @param {number}   params.bCount         — number of branches
 */
export function computeAndCacheFinance(transactions, params) {
    const {
        curTabId      = 'tx',
        selBranch     = 'all',
        search        = '',
        isSingleBranch = true,
        isAdmin       = false,
        invCats       = [],
        bCount        = 1,
    } = params;

    // ── Cache-hit detection ──
    const paramsKey    = `${curTabId}|${selBranch}|${search}`;
    const dataVersion  = (window.__store || {})._dataVersion || 0;
    if (
        _cache.summary !== null &&
        _cache.paramsKey   === paramsKey &&
        _cache.dataVersion === dataVersion
    ) {
        _metrics.cacheHits++;
        window.PerformanceMonitor?.record('render:finance.cacheHit', 0, { tab: curTabId });
        return;
    }

    const t0 = performance.now();
    _metrics.computations++;

    // ── Init summary accumulators ──
    let incTuition = 0, incExam = 0, incOther = 0, incUniform = 0;
    let exp = 0, expExamTotal = 0, expUniform = 0;
    let txCount = 0;

    const bStats = {}, bExamStats = {};
    for (let bi = 1; bi <= bCount; bi++) {
        bStats['CS' + bi]     = { income: 0, active: 0, debt: 0, tuitionMap: {}, examFeeMap: {} };
        bExamStats['CS' + bi] = 0;
    }

    // ── Decide which row HTML sections to build (hidden-tab skip) ──
    const buildTxRows      = curTabId === 'tx';
    const buildExpRows     = curTabId === 'expense';
    const buildExamExpRows = curTabId === 'exam';

    if (!buildTxRows && !buildExpRows && !buildExamExpRows) {
        _metrics.skippedHiddenTab++;
    }

    let txRows = buildTxRows      ? '' : null;
    let expenseRows = buildExpRows ? '' : null;
    let examExpRows = buildExamExpRows ? '' : null;

    // Phase 4K-6V5U3: when the existing global search is active, rank only
    // already-matched transaction rows for presentation. Summary/accounting
    // still runs over the original transactions array in its original order.
    const _txSearchCandidates = buildTxRows && String(search || '').trim() ? [] : null;

    // ── Single pass — mirrors renderApp() lines 249-324 exactly ──
    // Phase 4K-4F: guard selectedMonth to avoid cross-month contamination when store
    // may contain merged transactions from multiple months (packageMonths rollup)
    const _selectedMonth =
        (document.getElementById('filterMonth') && document.getElementById('filterMonth').value) ||
        (window.__store || {}).selectedMonth ||
        '';

    transactions.forEach(t => {
        // Phase 4K-4F: skip transactions not belonging to selected month
        // (still counts packageMonths — txMatchesSelectedMonth covers that)
        if (_selectedMonth && typeof window.txMatchesSelectedMonth === 'function') {
            if (!window.txMatchesSelectedMonth(t, _selectedMonth)) return;
        }

        const cleanName    = t.description ? t.description.trim() : '';
        // Phase 4K-4D: classifyInventoryFinanceTx hỗ trợ custom categories + dữ liệu cũ
        const _invClass    = typeof window.classifyInventoryFinanceTx === 'function'
            ? window.classifyInventoryFinanceTx(t)
            : _fallbackClassifyInvTx(t, invCats);
        const isUniformTx  = _invClass.isInventory;

        let isBranchMatch = true;
        if (!isSingleBranch && selBranch !== 'all' && t.branch !== selBranch && t.branch !== 'Chung') {
            isBranchMatch = false;
        }
        let isSearchMatch = true;
        if (search) {
            // Phase 4K-2B: Dùng getTransactionSearchBlob() — pre-normalized cache, không build lại mỗi lần
            const q = window.normalizeVNForSearch
                ? window.normalizeVNForSearch(search)
                : String(search || '').toLowerCase().trim();
            const txBlob = typeof window.getTransactionSearchBlob === 'function'
                ? window.getTransactionSearchBlob(t)
                : _fallbackTxBlob(t, cleanName);
            if (q && !txBlob.includes(q)) isSearchMatch = false;
        }

        const safeBranch   = t.branch || 'CS1';
        const safeNameEsc  = cleanName.replace(/'/g, "\\'");
        const branchTdHTML = isSingleBranch
            ? ''
            : `<td class="col-branch"><span class="badge bg-slate-100 text-slate-600 border border-slate-200">${_getBrN(safeBranch)}</span></td>`;
        const btnDel = isAdmin
            ? `<button type="button" class="btn-sm bg-rose-50 text-rose-600 hover:bg-rose-500 hover:text-white ml-1" onclick="deleteTx('${t.id}', '${t.relatedInvId || ''}')">🗑</button>`
            : '';

        if (isUniformTx) {
            if      (_invClass.direction === 'income')  incUniform += Number(t.amount) || 0;
            else if (_invClass.direction === 'expense') expUniform += Number(t.amount) || 0;
            // direction === 'gift' → không cộng doanh thu / chi
            return;
        }
        if (!isBranchMatch || !isSearchMatch) return;

        const btnEditExp = isAdmin
            ? `<button type="button" class="btn-sm bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white" onclick="openEditExpense('${t.id}')">✏️</button>`
            : '';

        if (t.type === 'Chi phí') {
            exp += Number(t.amount) || 0;
            if (buildExpRows) {
                expenseRows += renderExpenseRow(t, { branchTdHTML, btnDel, btnEditExp });
            }
        } else if (t.type === 'Chi phí kỳ thi') {
            expExamTotal += Number(t.amount) || 0;
            if (buildExamExpRows) {
                examExpRows += renderExamExpRow(t, { btnDel, btnEditExp });
            }
        } else {
            txCount++;
            let allocatedAmount = Number(t.amount) || 0;

            // Phase 4K-5E: Bundle — dùng components làm nguồn chính
            if (Array.isArray(t.components) && t.components.length > 0 &&
                (t.paymentKind === 'bundle' || t.components.length > 1)) {
                const _acComps = typeof window.expandTransactionComponentsForAccounting === 'function'
                    ? window.expandTransactionComponentsForAccounting(t)
                    : t.components;
                _acComps.forEach(function(c) {
                    const ca = Number(c.amount || 0);
                    const ck = c.kind || '';
                    if (ck === 'tuition') {
                        const alloc = Array.isArray(c.packageMonths) && c.packageMonths.length > 1
                            ? ca / c.packageMonths.length : ca;
                        incTuition += alloc;
                    } else if (ck === 'exam') {
                        incExam += ca;
                    } else if (ck === 'inventory' || ck === 'inventoryDebt') {
                        incUniform += ca;
                    } else {
                        incOther += ca;
                    }
                });
            } else if ((typeof window.normalizeFinanceTransactionType === 'function' ? window.normalizeFinanceTransactionType(t) : t.type) === 'Học phí') {
                allocatedAmount = t.packageMonths
                    ? allocatedAmount / t.packageMonths.length
                    : allocatedAmount;
                incTuition += allocatedAmount;
            } else if ((typeof window.normalizeFinanceTransactionType === 'function' ? window.normalizeFinanceTransactionType(t) : t.type) === 'Học phí + Lệ phí thi') {
                allocatedAmount = t.packageMonths
                    ? (Number(t.tuitionAmount) || 0) / t.packageMonths.length
                    : (Number(t.tuitionAmount) || 0);
                incTuition += allocatedAmount;
                incExam    += Number(t.examAmount) || 0;
            } else if ((typeof window.normalizeFinanceTransactionType === 'function' ? window.normalizeFinanceTransactionType(t) : t.type) === 'Lệ phí thi') {
                incExam += allocatedAmount;
            } else {
                incOther += allocatedAmount;
            }

            // ── Phase 4K-5N: Branch stats — components as primary source ──────────
            // Normalize branch code (handles "Cơ sở 1", "Huỳnh Tấn Phát", etc.)
            const _normBr = typeof window.normalizeBranchCodeForStats === 'function'
                ? window.normalizeBranchCodeForStats(t.branch || 'CS1', bCount)
                : (t.branch || 'CS1');

            // Ensure slot exists for normalized branch
            if (!bStats[_normBr]) {
                bStats[_normBr] = { income: 0, active: 0, debt: 0, tuitionMap: {}, examFeeMap: {} };
            }
            if (bExamStats[_normBr] === undefined) bExamStats[_normBr] = 0;

            let _usedCompBranch = false;

            // Try components first (covers bundles AND single-type transactions with components)
            const _brComps = typeof window.getAccountingComponents === 'function'
                ? window.getAccountingComponents(t)
                : (typeof window.expandTransactionComponentsForAccounting === 'function'
                    ? window.expandTransactionComponentsForAccounting(t)
                    : (Array.isArray(t.components) ? t.components : []));

            if (Array.isArray(_brComps) && _brComps.length > 0) {
                _usedCompBranch = true;
                _brComps.forEach(function(c) {
                    const ck = c.kind || '';
                    const ca = Number(c.amount || 0);
                    if (ca <= 0) return;
                    const cBr = typeof window.normalizeBranchCodeForStats === 'function'
                        ? window.normalizeBranchCodeForStats(c.branch || t.branch || 'CS1', bCount)
                        : (c.branch || t.branch || 'CS1');
                    if (!bStats[cBr]) {
                        bStats[cBr] = { income: 0, active: 0, debt: 0, tuitionMap: {}, examFeeMap: {} };
                    }
                    if (bExamStats[cBr] === undefined) bExamStats[cBr] = 0;

                    const amtM = typeof window.getComponentAmountForSelectedMonth === 'function'
                        ? window.getComponentAmountForSelectedMonth(c, _selectedMonth)
                        : ca;

                    if (ck === 'tuition') {
                        if (amtM <= 0) return;
                        bStats[cBr].income += amtM;
                        const fk = Math.round(
                            Array.isArray(c.packageMonths) && c.packageMonths.length > 1
                                ? ca / c.packageMonths.length : ca
                        );
                        if (fk > 0) bStats[cBr].tuitionMap[fk] = (bStats[cBr].tuitionMap[fk] || 0) + 1;
                    } else if (ck === 'exam') {
                        // Exam không chia theo packageMonths — tính theo txMonth/date
                        const cm = String(c.month || c.txMonth || t.txMonth || t.date || '').slice(0, 7);
                        if (_selectedMonth && cm && cm !== _selectedMonth) return;
                        bStats[cBr].income += ca;
                        const ek = Math.round(ca);
                        if (ek > 0) bStats[cBr].examFeeMap[ek] = (bStats[cBr].examFeeMap[ek] || 0) + 1;
                        bExamStats[cBr] = (bExamStats[cBr] || 0) + ca;
                    } else if (ck === 'inventory' || ck === 'inventoryDebt') {
                        bStats[cBr].income += amtM || ca;
                    } else {
                        if (amtM <= 0) return;
                        bStats[cBr].income += amtM;
                    }
                });
            }

            // Legacy fallback — only when no components available (prevents double-count)
            if (!_usedCompBranch) {
                const _normTxTypeForStats = typeof window.normalizeFinanceTransactionType === 'function' ? window.normalizeFinanceTransactionType(t) : t.type;
                const _examPart = (_normTxTypeForStats === 'Học phí + Lệ phí thi')
                    ? (Number(t.examAmount) || 0)
                    : 0;
                bStats[_normBr].income += allocatedAmount + _examPart;

                if (_normTxTypeForStats === 'Lệ phí thi') {
                    const _ek = Math.round(allocatedAmount);
                    if (_ek > 0) bStats[_normBr].examFeeMap[_ek] = (bStats[_normBr].examFeeMap[_ek] || 0) + 1;
                    bExamStats[_normBr] = (bExamStats[_normBr] || 0) + allocatedAmount;
                } else if (_normTxTypeForStats === 'Học phí + Lệ phí thi') {
                    const _ek2 = Math.round(Number(t.examAmount) || 0);
                    if (_ek2 > 0) bStats[_normBr].examFeeMap[_ek2] = (bStats[_normBr].examFeeMap[_ek2] || 0) + 1;
                    bExamStats[_normBr] = (bExamStats[_normBr] || 0) + (Number(t.examAmount) || 0);
                }
                if (_normTxTypeForStats === 'Học phí' || _normTxTypeForStats === 'Học phí + Lệ phí thi') {
                    const _tf = Math.round(Number(
                        _normTxTypeForStats === 'Học phí + Lệ phí thi' ? t.tuitionAmount : t.amount
                    ) || 0);
                    if (_tf > 0) bStats[_normBr].tuitionMap[_tf] = (bStats[_normBr].tuitionMap[_tf] || 0) + 1;
                }
            }

            // Build tx row (current tab only). Search ranking is presentation-only.
            if (buildTxRows && isBranchMatch) {
                const rowHtml = renderTxRow(t, { isSingleBranch, isAdmin, branchTdHTML, btnDel });
                if (_txSearchCandidates) {
                    _txSearchCandidates.push({
                        html: rowHtml,
                        studentName: String(t.studentName || t.profileName || t.name || cleanName || '')
                    });
                } else {
                    txRows += rowHtml;
                }
            }
        }
    });

    if (_txSearchCandidates) {
        txRows = rankStudentNameSearchResults(
            _txSearchCandidates,
            search,
            row => row.studentName
        ).map(row => row.html).join('');
    }

    // ── Phase 4K-5P: Override exam branch stats with canonical ledger ────────
    const examBranchLedger = typeof window.buildCanonicalExamBranchLedger === 'function'
        ? window.buildCanonicalExamBranchLedger({
            month: _selectedMonth,
            transactions
        })
        : null;

    if (examBranchLedger && examBranchLedger.branchMap) {
        Object.keys(bStats).forEach(branch => {
            bStats[branch].examFeeMap = {};
            bStats[branch].examRegisteredCount = 0;
            bStats[branch].examRegisteredNames = [];
            bExamStats[branch] = 0;
        });

        Object.entries(examBranchLedger.branchMap).forEach(([branch, info]) => {
            if (!bStats[branch]) {
                bStats[branch] = {
                    income: 0,
                    active: 0,
                    debt: 0,
                    tuitionMap: {},
                    examFeeMap: {}
                };
            }
            bStats[branch].examFeeMap = { ...(info.feeMap || {}) };
            bStats[branch].examRegisteredCount = info.registeredCount || 0;
            bStats[branch].examRegisteredNames = info.names || [];
            bExamStats[branch] = info.totalAmount || 0;
        });
    }

    // ── Store results in module-local cache ──
    if (buildTxRows)      _cache.txRows      = txRows;
    if (buildExpRows)     _cache.expenseRows = expenseRows;
    if (buildExamExpRows) _cache.examExpRows = examExpRows;

    _cache.summary = {
        incTuition, incExam, incOther, incUniform,
        exp, expExamTotal, expUniform, txCount,
        bStats, bExamStats,
    };
    _cache.paramsKey   = paramsKey;
    _cache.dataVersion = dataVersion;

    // ── Metrics ──
    const ms = performance.now() - t0;
    _metrics.lastComputeMs = ms;
    if (ms > 16) {
        console.warn(`[financeRenderer] 🐢 Slow computation: ${ms.toFixed(1)}ms (${transactions.length} transactions)`);
    }
    // Phase 4K-6A: record render performance
    window.PerformanceMonitor?.record('render:finance.compute', ms, {
        tab:           curTabId,
        txCount:       txCount,
        selectedMonth: _selectedMonth,
        cacheHit:      false
    });

    // ── [Phase 3.8A] Large list safety — track tx.txList row count ────────────
    // Virtualization-ready boundary: tx.txList là isolated render boundary.
    // Khi txCount > 500 → console.warn để chuẩn bị virtual rendering.
    // KHÔNG block render, KHÔNG thay đổi output.
    //   START: tx.txList  → vị trí bắt đầu render transaction rows
    //   END:   tx.txList  → cuối txRows HTML (hoặc load-more button)
    if (typeof window.trackLargeListRender === 'function') {
        if (buildTxRows) {
            window.trackLargeListRender('tx.txList', txCount, { reason: 'render-tx-list' });
        }
    }
}

// ── Public read API ───────────────────────────────────────────────────────────

/**
 * Return cached HTML for a finance list section.
 *
 * @param {'txRows'|'expenseRows'|'examExpRows'} section
 * @returns {string}
 */
export function getFinanceCachedHtml(section) {
    return _cache[section] || '';
}

/**
 * Return the cached finance summary (stats for current month/filter).
 * Returns null before first computation.
 *
 * @returns {{ incTuition:number, incExam:number, incOther:number,
 *             incUniform:number, exp:number, expExamTotal:number,
 *             expUniform:number, txCount:number,
 *             bStats:Object, bExamStats:Object } | null}
 */
export function getFinanceSummary() {
    return _cache.summary;
}

/**
 * Return lightweight render performance metrics for dev diagnostics.
 *
 * @returns {{ computations:number, cacheHits:number, duplicatePrevented:number,
 *             skippedHiddenTab:number, lastComputeMs:number }}
 */
export function getFinanceMetrics() {
    return { ..._metrics };
}
