/**
 * ui/render.js — Phase 3.5B (Render Invalidation & Lifecycle Stabilization)
 *
 * THAY ĐỔI SO VỚI PHASE 3.5A:
 *  [1] cacheDashboardData() — sau mỗi renderApp() cycle lưu dashboard data
 *      vào dashboardRenderer module-local cache để islands đọc từ đây.
 *  [2] Dashboard render guard — renderDashboardCharts(), renderBranchStats(),
 *      renderExamBranchFees(), updateSummaryNumbers() chỉ gọi trực tiếp nếu
 *      dashboard tab đang ACTIVE. Nếu hidden → mark dirty → flush khi activate.
 *  [3] _ISLAND_KEYS.dashboard cập nhật thêm 'dashboard.summary' và
 *      'dashboard.examBranchFees' (islands mới từ Phase 3.5B).
 *  [4] Lưu _bStats, _bExamStats, inc_exam vào window.__store cho island fallbacks.
 *
 * Phase 3.5A changes vẫn giữ nguyên:
 *  [5] 3 vòng lặp tính toán delegate sang isolated computation renderers.
 *  [6] tabHtmlCache vẫn được set (backward compat) nhưng đọc từ renderer caches.
 *
 * window.* CÒN GIỮ (có lý do, chưa xóa được):
 *   window.__store / window.allProfiles/etc  — bridge pattern (app.js sync)
 *   window._renderHomeBirthdayBanner         — cross-module (attendance.js)
 *   window.renderAttendanceList              — cross-module (attendance.js)
 *   window._liveInvMap = liveInvMap          — backward compat (app.js đọc)
 *   window._activePage / _debtPage / _quitPage — pagination (tabs.js set)
 *   window.__store.tabHtmlCache              — bridge sync (backward compat)
 *   window._moduleRenderApp                  — public API (main.js đọc)
 *   window.getBranchNameDisplay              — app.js owns (chưa extract)
 *   window.userRole                          — 1× trong _role() fallback
 */

import {
    renderDashboardCharts,
    renderBranchStats,
    renderExamBranchFees,
    updateSummaryNumbers,
    fetchAndRenderHistoricalCharts,
    tryApplyCurrentMonthStats,
} from '../modules/dashboard.js?v=firestore-read-attribution-canonical-tx-boundary-20260616-v3a';

import { store } from '../store.js';
import {
    formatDate,
    formatMonth,
    formatMonthCompact,
    normalizeYYYYMM,
    addMonthsToYYYYMM,
    getBeltBadge,
} from '../utils/format.js';

// Phase 3.4: Render island scheduler + registry
import { runRender } from './render/renderRegistry.js';

// Phase 3.5A: Isolated computation renderers
import {
    computeAndCacheFinance,
    getFinanceSummary,
    getFinanceCachedHtml,
} from './render/computation/financeRenderer.js';
import {
    computeAndCacheStudents,
    getStudentsSummary,
    getStudentsCachedHtml,
} from './render/computation/studentsRenderer.js?v=debt-two-month-vietnamese-month-20260627-v4b8';
import {
    computeAndCacheInventory,
    getCachedLiveInvMap,
    getInventoryCachedHtml,
    getCachedUnpaidInvCount,
} from './render/computation/inventoryRenderer.js';

// Phase 3.5B: Dashboard computation cache
import { cacheDashboardData } from './render/computation/dashboardRenderer.js';

// ── Phase 3.4: Island key map ── maps tabId → island keys owned by that tab ──
// Phase 3.5B: dashboard islands mở rộng thêm summary + examBranchFees
const _ISLAND_KEYS = {
    tx:         ['tx.txList'],
    expense:    ['finance.expenseList'],
    exam:       ['finance.examExpenseList'],
    debt:       ['students.debtList'],
    active:     ['students.activeList'],
    quit:       ['students.quitList'],
    inventory:  ['inventory.inventoryList', 'inventory.uniformTxList'],
    dashboard:  [
        'dashboard.reportList',
        'dashboard.charts',
        'dashboard.branchStats',
        'dashboard.summary',        // Phase 3.5B
        'dashboard.examBranchFees', // Phase 3.5B
    ],
    attendance: ['attendance.list'],
};

/**
 * Request island renders for the currently active tab.
 * Islands read from their own module-local caches (Phase 3.5A)
 * and apply HTML via <template> + replaceChildren (one DOM mutation, no reflow loop).
 * Hidden-tab islands are automatically skipped by renderRegistry.
 * @param {string} tabId — the active tab id
 */
function _requestCurrentTabIslands(tabId) {
    (_ISLAND_KEYS[tabId] || []).forEach(key => runRender(key));
}

// Bridge helpers — đọc tại call-time từ window.__store hoặc fallback legacy
function _profiles()     { return (window.__store || {}).profiles     || window.allProfiles     || {}; }
function _transactions() { return (window.__store || {}).transactions || window.allTransactions || []; }
function _inventory()    { return (window.__store || {}).inventory    || window.allInventory    || []; }
function _config()       { return (window.__store || {}).clubConfig   || window.clubConfig      || {}; }

// Role helper: store.userRole (Phase 3+) với fallback window.userRole (legacy)
function _role() { return store.userRole || window.userRole || 'viewer'; }

// Branch name: app.js chưa extract ra module nên vẫn gọi qua window
function _getBrN(br) {
    return (typeof window.getBranchNameDisplay === 'function')
        ? window.getBranchNameDisplay(br) : br;
}

// Inventory categories: đọc từ store thay vì gọi window.getInvCategories()
function _getInvCats() {
    const custom = store.invCustomCategories || [];
    return ['Võ phục', 'Áo thun', 'Bảo hộ', ...custom.map(c => c.name)];
}

/**
 * Check whether the dashboard tab is currently visible.
 * Dùng để guard direct dashboard calls — chỉ gọi nếu user đang nhìn vào dashboard.
 */
function _isDashboardActive() {
    const el = document.getElementById('tab_dashboard');
    return el ? el.classList.contains('active') : false;
}

// Module-level state
let _liveInvMap         = {};
let _lastSizeSelectHtml = '';
let _lastRendered       = -1;

// ════════════════════════════════════════════════════════════════
// renderApp — Phase 3.5B: orchestrator + dashboard lifecycle guard
// ════════════════════════════════════════════════════════════════
function renderApp() {
    if (_role() === 'super_admin') return;

    const _dv = (window.__store || {})._dataVersion || 0;
    if (_dv !== 0 && _dv === _lastRendered) return;
    _lastRendered = _dv;

    if (typeof window._renderHomeBirthdayBanner === 'function') window._renderHomeBirthdayBanner();

    const _curTabEl = document.querySelector('.tab-content.active');
    const _curTabId = _curTabEl ? _curTabEl.id.replace('tab_', '') : 'tx';

    if (_curTabId === 'attendance' && typeof window.renderAttendanceList === 'function') {
        window.renderAttendanceList();
    }

    const fmEl      = document.getElementById('filterMonth');
    const fbEl      = document.getElementById('filterBranch');
    const srEl      = document.getElementById('searchInput');
    const selMonth  = fmEl ? fmEl.value : '';
    const selBranch = fbEl ? fbEl.value : 'all';
    const search    = srEl ? srEl.value.toLowerCase().trim() : '';

    const allProfiles     = _profiles();
    const allTransactions = _transactions();
    const allInventory    = _inventory();
    const clubConfig      = _config();
    const bCount          = clubConfig.branchCount || 1;
    const isSingleBranch  = bCount === 1;
    const _isAdmin        = _role() === 'admin'; // cache once per render

    const invCats  = _getInvCats();
    const catOrder = { 'Võ phục': 0, 'Áo thun': 1, 'Bảo hộ': 2 };
    invCats.slice(3).forEach((name, i) => { catOrder[name] = 3 + i; });

    // ── Phase 3.5A: Inventory computation (isolated renderer) ───────────────
    computeAndCacheInventory(allInventory, allTransactions, {
        curTabId: _curTabId, search, isAdmin: _isAdmin, invCats, catOrder,
    });
    _liveInvMap = getCachedLiveInvMap() || {};
    window._liveInvMap = _liveInvMap; // backward compat: app.js (openProfile) reads this

    // Size select for uniform order form — small DOM update, kept inline (not list HTML)
    const vpSizes = ['Size 1m','Size 1m1','Size 1m2','Size 1m3','Size 1m4','Size 1m5','Size 1m6','Size 1m7','Size 1m8'];
    let sizeSelectHtml = '<option value="">-- Không mua / Trống --</option>';
    const _admissionStockRows = window.MultiItemInventorySafety?.buildInventoryCategorySizeOptions?.('Võ phục', {
        stockMap: _liveInvMap,
        defaultSizes: vpSizes,
        configuredSizes: []
    }) || vpSizes.map(size => {
        const entry = _liveInvMap['Võ phục|||' + size] || { in: 0, out: 0 };
        return { size, balance: (Number(entry.in) || 0) - (Number(entry.out) || 0) };
    });
    _admissionStockRows.forEach(row => {
        const size = row.size || row.value;
        const bal = Number(row.balance) || 0;
        sizeSelectHtml += bal > 0
            ? `<option value="${size}">${size} (Còn: ${bal} bộ)</option>`
            : `<option value="${size}" disabled>${size} (Hết hàng)</option>`;
    });
    const addSizeSelect = document.getElementById('add_uniform_size');
    if (addSizeSelect && sizeSelectHtml !== _lastSizeSelectHtml) {
        _lastSizeSelectHtml = sizeSelectHtml;
        addSizeSelect.innerHTML = sizeSelectHtml;
    }

    // ── Phase 3.5A: Finance computation (isolated renderer) ─────────────────
    // Single-pass over allTransactions: computes stats + builds tab-specific HTML.
    // bStats and bExamStats are created fresh inside financeRenderer.
    computeAndCacheFinance(allTransactions, {
        curTabId: _curTabId, selBranch, search, isSingleBranch,
        isAdmin: _isAdmin, invCats, bCount,
    });
    const _finSummary    = getFinanceSummary() || {};
    const inc_tuition    = _finSummary.incTuition    || 0;
    const inc_exam       = _finSummary.incExam       || 0;
    const inc_other      = _finSummary.incOther      || 0;
    const inc_uniform    = _finSummary.incUniform    || 0;
    const exp            = _finSummary.exp           || 0;
    const exp_exam_total = _finSummary.expExamTotal  || 0;
    const exp_uniform    = _finSummary.expUniform    || 0;
    const txCountRender  = _finSummary.txCount       || 0;
    const _bStats        = _finSummary.bStats        || {};
    const _bExamStats    = _finSummary.bExamStats    || {};

    // ── Phase 3.5A: Students computation (isolated renderer) ────────────────
    // _bStats passed by reference: studentsRenderer adds .active / .debt counts.
    // After this call _bStats is fully populated for renderBranchStats().
    const _pgStudents = (window.__store && window.__store.pagination && window.__store.pagination.students) || null;
    const _pgStudentsActive = _pgStudents && _pgStudents.enabled &&
        Array.isArray(_pgStudents.currentItems) && _pgStudents.currentItems.length > 0;

    computeAndCacheStudents(allProfiles, {
        curTabId: _curTabId, selMonth, selBranch, search, isSingleBranch,
        isAdmin: _isAdmin, bStats: _bStats,
        pgStudents: _pgStudents, pgStudentsActive: _pgStudentsActive,
        activePage: window._activePage || 1,
        debtPage:   window._debtPage   || 1,
        quitPage:   window._quitPage   || 1,
    });
    const _stdSummary     = getStudentsSummary() || {};
    const activeCount     = _stdSummary.activeCount   || 0;
    const debtCountRender = _stdSummary.debtCount     || 0;
    const totalDebtEst    = _stdSummary.totalDebtEst  || 0;
    const m_active_theo   = _stdSummary.m_active_theo || 0;
    const m_new           = _stdSummary.m_new         || 0;
    const m_quit          = _stdSummary.m_quit        || 0;
    const m_skipped       = _stdSummary.m_skipped     || 0;
    const unpaidInvCount  = getCachedUnpaidInvCount();

    // ── Report row ───────────────────────────────────────────────────────────
    const m_actual = m_active_theo - m_skipped;
    const tInc     = inc_tuition + inc_exam + inc_other + inc_uniform;
    const tExp     = exp + exp_exam_total + exp_uniform;
    const reportHtml = `<tr><td class="font-black text-primary">${formatMonth(selMonth)}</td><td class="text-slate-800 font-bold text-base">${m_actual}</td><td class="text-emerald-600 font-medium">+${m_new}</td><td class="text-rose-600 font-medium">-${m_quit}</td><td class="text-emerald-600 font-bold">${tInc.toLocaleString()} ₫</td><td class="text-rose-600 font-bold">${tExp.toLocaleString()} ₫</td><td class="${(tInc - tExp) < 0 ? 'text-rose-600' : 'text-emerald-600'} font-black text-base bg-slate-50">${(tInc - tExp).toLocaleString()} ₫</td></tr>`;

    // ── Chart data — 6 tháng gần nhất ───────────────────────────────────────
    const chartLabels = [], chartIncome = [], chartExpense = [], chartActive = [];
    const historicalMonths = [];
    if (selMonth) {
        const [sy, sm] = selMonth.split('-').map(Number);
        const months = [];
        for (let i = 0; i < 6; i++) {
            let m = sm - i, y = sy;
            if (m <= 0) { m += 12; y -= 1; }
            months.push(`${y}-${String(m).padStart(2, '0')}`);
        }

        // Phase 4K-5D: Bảo vệ historical data — không overwrite bằng current-only chart
        const _hist = typeof window.getDashboardHistoricalSnapshot === 'function'
            ? window.getDashboardHistoricalSnapshot()
            : null;
        const _useHist = _hist && _hist.hasHistory && _hist.chartData && _hist.reportRows >= 2;

        if (_useHist && _hist.chartData) {
            // Dùng dữ liệu lịch sử đã có — chỉ cập nhật tháng hiện tại
            const _hc = _hist.chartData;
            months.reverse().forEach((m, idx) => {
                chartLabels[idx]  = _hc.labels  && _hc.labels[idx]  !== undefined ? _hc.labels[idx]  : formatMonth(m);
                chartIncome[idx]  = m === selMonth ? tInc : (_hc.income  && _hc.income[idx]  !== undefined ? _hc.income[idx]  : 0);
                chartExpense[idx] = m === selMonth ? tExp : (_hc.expense && _hc.expense[idx] !== undefined ? _hc.expense[idx] : 0);
                chartActive[idx]  = m === selMonth ? m_actual : (_hc.active && _hc.active[idx] !== undefined ? _hc.active[idx] : 0);
                if (m !== selMonth) historicalMonths.push({ month: m, idx });
            });
        } else {
            months.reverse().forEach((m, idx) => {
                chartLabels[idx]  = formatMonth(m);
                chartIncome[idx]  = m === selMonth ? tInc : 0;
                chartExpense[idx] = m === selMonth ? tExp : 0;
                chartActive[idx]  = m === selMonth ? m_actual : 0;
                if (m !== selMonth) historicalMonths.push({ month: m, idx });
            });
        }
    }

    // ── Summary numbers object (Phase 3.5B: dùng cho dashboard island) ──────
    const _summaryNumbers = {
        incTuition: inc_tuition, incExam: inc_exam,
        incOther: inc_other,     incUniform: inc_uniform,
        expTotal: exp,           expExamTotal: exp_exam_total,
        expUniform: exp_uniform, activeCount,
        debtCount: debtCountRender,
        totalDebtEst, txCount: txCountRender,
        selMonth, unpaidInvCount,
    };

    // ── Chart data object ────────────────────────────────────────────────────
    const _chartData = {
        labels:  chartLabels,
        income:  chartIncome,
        expense: chartExpense,
        active:  chartActive,
    };

    // ── Tab HTML cache ───────────────────────────────────────────────────────
    // Phase 3.5A: list HTML sourced from isolated renderer caches.
    // Still mirrored to window.__store.tabHtmlCache for backward compat
    // (any legacy reader that hasn't been updated yet will still find it here).
    const tabHtmlCache = {
        txList:          getFinanceCachedHtml('txRows'),
        uniformTxList:   getInventoryCachedHtml('uniformTxRows'),
        expenseList:     getFinanceCachedHtml('expenseRows'),
        examExpenseList: getFinanceCachedHtml('examExpRows'),
        debtList:        getStudentsCachedHtml('debtRows'),
        activeList:      getStudentsCachedHtml('activeRows'),
        quitList:        getStudentsCachedHtml('quitRows'),
        inventoryList:   getInventoryCachedHtml('invListRows'),
        reportList:      reportHtml,
        _chartData,
    };
    if (window.__store) window.__store.tabHtmlCache = tabHtmlCache;

    // Phase 3.5B: lưu dashboard data vào dashboardRenderer module-local cache
    // Islands (renderDashboard.js) đọc từ đây thay vì tabHtmlCache trực tiếp
    cacheDashboardData({
        reportHtml,
        chartData:      _chartData,
        bStats:         _bStats,
        bExamStats:     _bExamStats,
        summaryNumbers: _summaryNumbers,
    });

    // Phase 3.5B: Lưu thêm vào __store cho island fallbacks (backward compat)
    if (window.__store) {
        window.__store._lastBStats        = _bStats;
        window.__store._lastBExamStats    = _bExamStats;
        window.__store._lastIncExam       = inc_exam;
        window.__store._lastSummaryNumbers = _summaryNumbers;
    }

    // ── Phase 4K-GITHUB-SUMMARY-BADGE-FIX ──────────────────────────────────
    // Các số liệu như HỌC PHÍ (badge), BÁO NỢ, ĐANG TẬP và mobile header
    // nằm ngoài tab dashboard, nên phải cập nhật ở MỌI render cycle.
    // Trước đây updateSummaryNumbers() bị đặt sau dashboard guard → khi dashboard
    // đang hidden, badge vẫn giữ 0 dù computation cache đã có dữ liệu.
    try {
        updateSummaryNumbers(_summaryNumbers);
    } catch (e) {
        console.warn('[render.js] updateSummaryNumbers(global badges) failed:', e);
    }

    // Phase 3.4: delegate list DOM updates to render islands via RAF scheduler.
    // Islands read from their own module-local caches (Phase 3.5A) and apply
    // via replaceChildren() — one atomic DOM mutation, no innerHTML reflow loop.
    // Hidden-tab islands are automatically marked dirty and rendered on tab activate.
    _requestCurrentTabIslands(_curTabId);

    // ── Skipped section ──────────────────────────────────────────────────────
    const skippedNames = Object.keys(allProfiles).filter(n => {
        const pr = allProfiles[n];
        return pr.status === 'active' && pr.skippedMonths && pr.skippedMonths.includes(selMonth);
    });
    const skippedSection = document.getElementById('skippedSection');
    if (skippedSection) {
        if (skippedNames.length > 0) {
            skippedSection.classList.remove('hidden');
            const titleEl = document.getElementById('skippedSectionTitle');
            if (titleEl) titleEl.innerText = `⏸ Báo nghỉ tháng ${formatMonth(selMonth)} — ${skippedNames.length} võ sinh miễn học phí`;
            const listEl = document.getElementById('skippedThisMonthList');
            if (listEl) listEl.innerHTML = skippedNames.sort().map(n => `<span class="badge bg-amber-200 text-amber-900 border border-amber-400 shadow-sm cursor-pointer hover:bg-amber-300" onclick="openProfile('${n.replace(/'/g, "\\'")}'')" title="Bấm để xem hồ sơ">${n}</span>`).join('');
        } else {
            skippedSection.classList.add('hidden');
        }
    }

    // ── Phase 3.5B: Dashboard render guard ──────────────────────────────────
    //
    // Trước Phase 3.5B:
    //   renderDashboardCharts(), renderBranchStats(), renderExamBranchFees(),
    //   updateSummaryNumbers() luôn được gọi mỗi renderApp() cycle, kể cả khi
    //   user đang ở tab khác — gây unnecessary DOM work cho tab bị ẩn.
    //
    // Phase 3.5B FIX:
    //   Chỉ gọi trực tiếp nếu dashboard tab đang ACTIVE.
    //   Nếu hidden: data đã được cache vào dashboardRenderer, các islands đã
    //   được mark dirty bởi _requestCurrentTabIslands(). Khi user chuyển sang
    //   tab dashboard → flushDirtyRenders('dashboard') → islands tự render.
    //
    // Backward compat: nếu dashboard ĐANG active, hành vi y hệt Phase 3.5A.
    //
    if (_isDashboardActive()) {
        renderDashboardCharts(_chartData);
        renderBranchStats(_bStats);
        renderExamBranchFees(_bExamStats, inc_exam);
        updateSummaryNumbers(_summaryNumbers);

        // [Phase 4K-FIX Lỗi 4] Ưu tiên stats doc cho tổng thu/chi tháng hiện tại.
        // tryApplyCurrentMonthStats đọc stats doc (Cloud Functions) và override
        // totalIncomeDashboard / totalExpenseDashboard / totalProfitDashboard nếu có.
        // Fallback an toàn: nếu stats doc chưa tồn tại → giữ allTransactions-based numbers.
        if (selMonth && typeof window.tryApplyCurrentMonthStats === 'function') {
            window.tryApplyCurrentMonthStats(selMonth).catch(() => {
                // silent fail — không phá dashboard nếu stats doc read lỗi
            });
        }

        if (historicalMonths.length > 0) {
            fetchAndRenderHistoricalCharts(
                historicalMonths, chartLabels, chartIncome, chartExpense, chartActive
            ).catch(err => {
                const h = window.location.hostname;
                if (h === 'localhost' || h.endsWith('.replit.dev')) {
                    console.warn('[render.js] Historical stats load (OK nếu Cloud Functions chưa deploy):', err.message);
                }
            });
        }
    } else if (_curTabId === 'dashboard') {
        // Trường hợp hiếm: _curTabId là dashboard nhưng DOM class chưa sync
        // Gọi bình thường để đảm bảo không hiển thị trắng
        renderDashboardCharts(_chartData);
        renderBranchStats(_bStats);
        renderExamBranchFees(_bExamStats, inc_exam);
        updateSummaryNumbers(_summaryNumbers);
        // [Phase 4K-FIX Lỗi 4] Cũng áp dụng stats doc override ở đây
        if (selMonth && typeof window.tryApplyCurrentMonthStats === 'function') {
            window.tryApplyCurrentMonthStats(selMonth).catch(() => {});
        }
    }
    // Nếu dashboard không active: data đã cache, islands đã mark dirty → skip DOM work
}

export function initRender() {
    window._moduleRenderApp = renderApp;
    // Phase 3.5B: expose scheduleRender sơ bộ để các module gọi được trước khi
    // registerInvalidationLegacyGlobals() override với full invalidation layer
    if (!window.scheduleRender) {
        window.scheduleRender = renderApp;
    }
    console.info('[render.js] ✅ Phase 3.5B — Dashboard render guard active; computation isolation: finance/students/inventory + dashboard renderers');
}
