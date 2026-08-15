/**
 * modules/dashboard.js — Phase 2c + Phase 3 (Cloud Functions Stats Docs)
 * ────────────────────────────────────────────────────────────────────────
 * Module này SỞ HỮU hoàn toàn tab Dashboard:
 *   - Chart.js finance chart (bar) + member chart (line)
 *   - Bảng branch stats (per-cơ-sở income/active/debt)
 *   - Tất cả DOM updates tổng kết (sum_tuition, totalIncomeDashboard...)
 *   - Report row (bảng tổng hợp tháng)
 *   - Exam branch fees section
 *
 * PHASE 4K-6V5U6C2:
 *   Phân biệt initial hydration với real mutation, reconcile RAM/current-month
 *   cache không thêm read, và bound unresolved dirty bằng timestamp-only backoff.
 *   ONE canonical Dashboard network owner của V5U6C/V5U6C1 được giữ nguyên.
 *
 * KHÔNG CÒN là stub — render.js gọi các export của module này.
 * app.js không còn tạo Chart.js instance nữa (patch renderApp).
 *
 * BRIDGE:
 *   Chart instances lưu trong window.__store để cleanup khi logout.
 *   Đọc clubConfig từ window.__store || window.clubConfig.
 *
 * /// NEW ARCHITECTURE — Phase 2c (Dashboard Module owns rendering)
 * /// UPGRADE — Phase 3 (Historical stats from Firestore stats docs)
 * ────────────────────────────────────────────────────────────────────────
 */

// ── Bridge helpers ────────────────────────────────────────────────
function _config() { return (window.__store || {}).clubConfig || window.clubConfig || {}; }
function _fmt(n)   { return (n || 0).toLocaleString('vi-VN'); }
function _fmtK(v)  {
    return v >= 1e6 ? (v / 1e6).toFixed(1).replace(/\.0$/, '') + 'tr'
         : v >= 1e3 ? Math.round(v / 1e3) + 'k'
         : (v || 0).toLocaleString();
}

// ── Chart instance store/retrieve ────────────────────────────────
function _getFinChart()  { return (window.__store || {}).financeChartInstance || null; }
function _getMemChart()  { return (window.__store || {}).memberChartInstance  || null; }
function _setFinChart(c) { if (window.__store) window.__store.financeChartInstance = c; }
function _setMemChart(c) { if (window.__store) window.__store.memberChartInstance  = c; }

// ── Phase 4K-5N: Canvas chart lifecycle helpers ───────────────────────────
function _getCanvasChart(Chart, canvas) {
    if (!Chart || !canvas) return null;
    if (typeof Chart.getChart === 'function') {
        try { return Chart.getChart(canvas) || null; } catch (_) {}
    }
    return null;
}
function _safeDestroyChart(chart) {
    if (!chart) return;
    try { chart.destroy(); } catch (_) {}
}

// ════════════════════════════════════════════════════════════════
// renderDashboardCharts — tạo hoặc update 2 Chart.js instances
// chartData: { labels, income, expense, active }
// ════════════════════════════════════════════════════════════════
export function renderDashboardCharts(chartData) {
    const _perfTokenCharts = window.PerformanceMonitor?.markStart('dashboard:charts');
    try {
    const { labels, income, expense, active } = chartData;
    const Chart = window.Chart;
    if (!Chart) {
        if (!window.__dashboardChartLazyLoadPending && typeof window.ensureChartJsReady === 'function') {
            window.__dashboardChartLazyLoadPending = true;
            window.ensureChartJsReady('dashboard-render-charts')
                .then(() => { window.__dashboardChartLazyLoadPending = false; renderDashboardCharts(chartData); })
                .catch((err) => { window.__dashboardChartLazyLoadPending = false; console.warn('[dashboard] Chart.js lazy load failed:', err); });
        }
        return;
    }

    // ── Finance chart (bar: Thu / Chi) — Phase 4K-5N lifecycle fix ──────────
    const finEl = document.getElementById('financeChart');
    if (finEl) {
        let fc = _getFinChart();
        const canvasChart = _getCanvasChart(Chart, finEl);

        // Case: store lost reference but canvas still has live chart → reuse
        if (!fc && canvasChart) {
            fc = canvasChart;
            _setFinChart(fc);
        }

        // Case: store has chart but it belongs to a different canvas → destroy and reset
        if (fc && fc.canvas !== finEl) {
            _safeDestroyChart(fc);
            fc = null;
            _setFinChart(null);
        }

        if (!fc) {
            // Destroy any orphan chart on this canvas before creating new one
            const orphan = _getCanvasChart(Chart, finEl);
            if (orphan) _safeDestroyChart(orphan);

            fc = new Chart(finEl, {
                type: 'bar',
                data: {
                    labels,
                    datasets: [
                        { label: 'Tổng Thu', data: income,  backgroundColor: 'rgba(16,185,129,0.9)', borderRadius: 6 },
                        { label: 'Tổng Chi', data: expense, backgroundColor: 'rgba(244,63,94,0.9)',  borderRadius: 6 },
                    ]
                },
                options: {
                    animation: false, maintainAspectRatio: false, responsive: true,
                    scales: {
                        y: { beginAtZero: true, grid: { color: '#f8fafc' } },
                        x: { grid: { display: false } }
                    },
                    plugins: { legend: { labels: { font: { family: "'Inter', sans-serif", weight: 'bold' } } } }
                }
            });
            _setFinChart(fc);
        } else {
            fc.data.labels             = labels;
            fc.data.datasets[0].data  = income;
            fc.data.datasets[1].data  = expense;
            fc.update('none');
        }
    }

    // ── Member chart (line: Võ sinh đang tập) — Phase 4K-5N lifecycle fix ──
    const memEl = document.getElementById('memberChart');
    if (memEl) {
        let mc = _getMemChart();
        const canvasChartM = _getCanvasChart(Chart, memEl);

        // Case: store lost reference but canvas still has live chart → reuse
        if (!mc && canvasChartM) {
            mc = canvasChartM;
            _setMemChart(mc);
        }

        // Case: store has chart but it belongs to a different canvas → destroy and reset
        if (mc && mc.canvas !== memEl) {
            _safeDestroyChart(mc);
            mc = null;
            _setMemChart(null);
        }

        if (!mc) {
            // Destroy any orphan chart on this canvas before creating new one
            const orphanM = _getCanvasChart(Chart, memEl);
            if (orphanM) _safeDestroyChart(orphanM);

            mc = new Chart(memEl, {
                type: 'line',
                data: {
                    labels,
                    datasets: [{
                        label: 'Võ sinh Đang tập', data: active,
                        borderColor: '#0033A0', backgroundColor: 'rgba(0,51,160,0.08)',
                        fill: true, tension: 0.4, pointRadius: 4,
                        pointBackgroundColor: '#fff', pointBorderWidth: 2
                    }]
                },
                options: {
                    animation: false, maintainAspectRatio: false, responsive: true,
                    scales: {
                        y: { beginAtZero: true, grid: { color: '#f8fafc' } },
                        x: { grid: { display: false } }
                    },
                    plugins: { legend: { labels: { font: { family: "'Inter', sans-serif", weight: 'bold' } } } }
                }
            });
            _setMemChart(mc);
        } else {
            mc.data.labels            = labels;
            mc.data.datasets[0].data = active;
            mc.update('none');
        }
    }
    } finally {
        window.PerformanceMonitor?.markEnd('dashboard:charts', _perfTokenCharts);
    }
}

// ════════════════════════════════════════════════════════════════
// renderBranchStats — bảng thống kê per-cơ-sở
// bStats: { CS1: { income, active, debt, tuitionMap, examFeeMap }, ... }
// ════════════════════════════════════════════════════════════════
export function renderBranchStats(bStats) {
    const _perfTokenBranch = window.PerformanceMonitor?.markStart('dashboard:branchStats');
    try {
    const cfg    = _config();
    const bCount = cfg.branchCount || 1;
    const bsSec  = document.getElementById('branchStatsSection');
    const bsGrid = document.getElementById('branchStatsGrid');
    if (!bsSec || !bsGrid || bCount <= 1) {
        if (bsSec) bsSec.style.display = 'none';
        return;
    }
    bsSec.style.display = '';
    let html = '';
    for (let bi = 1; bi <= bCount; bi++) {
        const bCode = 'CS' + bi;
        const bName = cfg['branchName' + bi] || ('Cơ sở ' + bi);
        const bd    = bStats[bCode] || { income: 0, active: 0, debt: 0, tuitionMap: {}, examFeeMap: {} };
        const tuitionEntries = Object.entries(bd.tuitionMap || {}).sort((a, b) => Number(b[0]) - Number(a[0]));
        const examEntries    = Object.entries(bd.examFeeMap || {}).sort((a, b) => Number(b[0]) - Number(a[0]));
        const tuitionBadges  = tuitionEntries.map(([fee, cnt]) =>
            `<span style="font-size:0.72rem;font-weight:700;background:#eef2ff;color:#3730a3;border:1px solid #c7d2fe;border-radius:8px;padding:2px 8px;white-space:nowrap;">${Number(fee).toLocaleString()}₫ × ${cnt} VS</span>`
        ).join('');
        const examRegisteredCount = Number(bd.examRegisteredCount || 0);
        const examRegisteredBadge = examRegisteredCount > 0
            ? `<div class="text-xs mt-1" style="color:#c2410c;font-weight:800;">🎖️ ${examRegisteredCount} võ sinh đã đăng ký thi</div>`
            : '';
        const examBadges = examEntries.map(([fee, cnt]) =>
            `<span title="Lệ phí thi" style="font-size:0.72rem;font-weight:700;background:#fff7ed;color:#c2410c;border:1px solid #fed7aa;border-radius:8px;padding:2px 8px;white-space:nowrap;">🎖️ ${Number(fee).toLocaleString()}₫ × ${cnt} VS</span>`
        ).join('');
        const hasFees       = tuitionEntries.length > 0 || examEntries.length > 0;
        const feeBreakdown  = hasFees
            ? `<div class="flex flex-wrap gap-1.5 mt-2.5 pt-2.5 border-t border-slate-100">${tuitionBadges}${examBadges}</div>`
            : '';
        const debtHtml = bd.debt > 0
            ? `<div class="text-xs mt-1" style="color:#dc2626;font-weight:700;">⚠️ ${bd.debt} võ sinh nợ học phí</div>` : '';
        html += `<div class="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
            <div class="flex items-center gap-4">
                <div class="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center text-xl flex-shrink-0">🏢</div>
                <div class="flex-1 min-w-0">
                    <div class="font-black text-slate-800 text-sm truncate">${bName}</div>
                    <div class="text-emerald-600 font-bold text-base">${bd.income.toLocaleString()} ₫</div>
                    <div class="text-slate-500 text-xs mt-0.5">👥 ${bd.active} võ sinh đang tập</div>
                    ${debtHtml}
                    ${examRegisteredBadge}
                </div>
            </div>${feeBreakdown}
        </div>`;
    }
    bsGrid.innerHTML = html;
    } finally {
        window.PerformanceMonitor?.markEnd('dashboard:branchStats', _perfTokenBranch);
    }
}

// ════════════════════════════════════════════════════════════════
// renderExamBranchFees — lệ phí thi theo cơ sở (tab Exam)
// ════════════════════════════════════════════════════════════════
export function renderExamBranchFees(bExamStats, incExam) {
    const _perfTokenExam = window.PerformanceMonitor?.markStart('dashboard:examBranchFees');
    try {
    const cfg    = _config();
    const bCount = cfg.branchCount || 1;
    const el     = document.getElementById('exam_branch_fees');
    if (!el) return;
    if (bCount <= 1 || incExam <= 0) { el.classList.add('hidden'); return; }
    let html = '<div class="mt-3 pt-3 border-t border-orange-100">'
        + '<div class="text-[0.65rem] font-bold text-slate-500 uppercase tracking-wide mb-2">💰 Lệ phí thu theo cơ sở</div>'
        + '<div class="flex flex-wrap gap-2">';
    for (let bi = 1; bi <= bCount; bi++) {
        const bc = 'CS' + bi;
        const bn = cfg['branchName' + bi] || ('Cơ sở ' + bi);
        const bf = bExamStats[bc] || 0;
        if (bf > 0) html += `<div class="flex items-center gap-2 bg-orange-50 border border-orange-200 rounded-xl px-3 py-1.5">`
            + `<span class="text-[0.7rem] font-bold text-orange-800 truncate max-w-[100px]">${bn}</span>`
            + `<span class="font-black text-orange-600 text-sm whitespace-nowrap">${bf.toLocaleString()} ₫</span></div>`;
    }
    html += '</div></div>';
    el.innerHTML = html;
    el.classList.remove('hidden');
    } finally {
        window.PerformanceMonitor?.markEnd('dashboard:examBranchFees', _perfTokenExam);
    }
}

// ════════════════════════════════════════════════════════════════
// updateSummaryNumbers — cập nhật TẤT CẢ DOM elements tổng kết
// Được gọi bởi render.js sau khi tính xong tất cả số liệu
// ════════════════════════════════════════════════════════════════
export function updateSummaryNumbers(data) {
    const {
        incTuition = 0, incExam = 0, incOther = 0, incUniform = 0,
        expTotal = 0, expExamTotal = 0, expUniform = 0,
        activeCount = 0, debtCount = 0, totalDebtEst = 0,
        txCount, selMonth, unpaidInvCount = 0
    } = data;

    const tInc        = incTuition + incOther + incExam + incUniform;
    const tExp        = expTotal + expExamTotal + expUniform;
    const uniformProfit = incUniform - expUniform;

    const _set = (id, val) => { const e = document.getElementById(id); if (e) e.innerText = val; };

    _set('sum_tuition',              _fmt(incTuition)  + ' ₫');
    _set('sum_other',                _fmt(incOther)    + ' ₫');
    _set('sum_exam_tab',             _fmt(incExam)     + ' ₫');
    _set('sum_exam_expense_tab',     _fmt(expExamTotal) + ' ₫');
    _set('sum_exam_profit_tab',      _fmt(incExam - expExamTotal) + ' ₫');
    _set('sum_expense_tab',          _fmt(expTotal)    + ' ₫');
    _set('sum_debt_count_tab',       debtCount         + ' Bạn');
    _set('sum_debt_amount_tab',      _fmt(totalDebtEst) + ' ₫');
    _set('sum_uniform_in',           _fmt(incUniform)  + ' ₫');
    _set('sum_uniform_out',          _fmt(expUniform)  + ' ₫');
    _set('sum_uniform_profit',       _fmt(uniformProfit) + ' ₫');
    _set('totalIncomeDashboard',     _fmt(tInc)        + ' ₫');
    _set('totalExpenseDashboard',    _fmt(tExp)        + ' ₫');
    _set('totalProfitDashboard',     _fmt(tInc - tExp) + ' ₫');
    _set('totalUniformProfitDashboard', _fmt(uniformProfit) + ' ₫');
    _set('activeStudentCount',       String(activeCount));
    _set('debtCount',                debtCount         + ' Bạn');
    _set('debtEst',                  'Dự thu: ' + _fmt(totalDebtEst) + ' ₫');
    _set('debtTabCountBadge',        String(debtCount));
    if (txCount !== undefined) _set('txTabCountBadge', String(txCount));

    // Mobile header bar (mhb*)
    const mhbAC  = document.getElementById('mhbActiveCount'); if (mhbAC)  mhbAC.innerText  = activeCount;
    const mhbDC  = document.getElementById('mhbDebtCount');   if (mhbDC)  mhbDC.innerText  = debtCount;
    const mhbInc = document.getElementById('mhbIncome');      if (mhbInc) mhbInc.innerText = _fmtK(tInc);
    const mhbMon = document.getElementById('mhbMonth');
    if (mhbMon && selMonth) {
        mhbMon.innerText = 'T' + parseInt(selMonth.split('-')[1]) + '/' + selMonth.split('-')[0].substring(2);
    }

    // Unpaid uniform badge
    const uwrap = document.getElementById('sum_uniform_unpaid_wrap');
    if (uwrap) uwrap.style.display = unpaidInvCount > 0 ? '' : 'none';
    const uc = document.getElementById('sum_uniform_unpaid');
    if (uc) uc.innerText = unpaidInvCount + ' đơn';

    // V5U6C: any RAM summary render must finish by re-applying the accepted
    // canonical current-month totals, if that payload is ready for this club/month.
    // This is synchronous and performs ZERO Firestore reads.
    const canonical = getDashboardCanonicalStatsSnapshot(selMonth || '');
    if (canonical.ready) _applyCurrentMonthStatsFromPayload(canonical);
}

// ════════════════════════════════════════════════════════════════
// PHASE 3: fetchAndRenderHistoricalCharts
// ────────────────────────────────────────────────────────────────
// Đọc stats docs từ Firestore cho 5 tháng lịch sử và cập nhật chart.
//
// TẠI SAO TÁCH RIÊNG?
//   - Tháng hiện tại đã có số liệu real-time từ allTransactions (render.js)
//   - 5 tháng lịch sử cần đọc từ stats docs để tránh load hàng nghìn TX cũ
//   - Async, không block render — chart hiển thị ngay, sau đó update mượt mà
//
// PARAMS:
//   historicalMonths: [{ month: 'YYYY-MM', idx: number }, ...]  — 5 tháng lịch sử
//   chartLabels:  string[]  — mảng label (đã được render.js điền tháng hiện tại)
//   chartIncome:  number[]  — mảng thu (index tháng lịch sử = 0, sẽ được fill)
//   chartExpense: number[]  — mảng chi
//   chartActive:  number[]  — mảng võ sinh (stats doc không có → giữ 0)
//
// FIRESTORE PATH: clubs/{clubId}/stats/{YYYY_MM}
//   Doc ID dùng underscore: '2026-05' → '2026_05'
// ════════════════════════════════════════════════════════════════
export async function fetchAndRenderHistoricalCharts(
    historicalMonths,
    chartLabels,
    chartIncome,
    chartExpense,
    chartActive
) {
    // Phase 4K-6V5U6C:
    // Compatibility API only. Dashboard network authority now belongs exclusively
    // to fetchHistoricalDashboardFallback(). This function MUST NOT read Firestore.
    const snapshot = getDashboardCanonicalStatsSnapshot();
    if (!snapshot.ready || !snapshot.chartData) return null;

    const cd = snapshot.chartData;
    if (Array.isArray(chartLabels) && Array.isArray(cd.labels)) {
        chartLabels.splice(0, chartLabels.length, ...cd.labels);
    }
    if (Array.isArray(chartIncome) && Array.isArray(cd.income)) {
        chartIncome.splice(0, chartIncome.length, ...cd.income);
    }
    if (Array.isArray(chartExpense) && Array.isArray(cd.expense)) {
        chartExpense.splice(0, chartExpense.length, ...cd.expense);
    }
    if (Array.isArray(chartActive) && Array.isArray(cd.active)) {
        chartActive.splice(0, chartActive.length, ...cd.active);
    }

    const renderCharts = typeof window.renderDashboardCharts === 'function'
        ? window.renderDashboardCharts
        : renderDashboardCharts;
    if (renderCharts) {
        try { renderCharts(cd); } catch (_) {}
    }
    return snapshot;
}

// ════════════════════════════════════════════════════════════════
// fetchMonthStats — đọc stats doc cho một tháng cụ thể
// Dùng khi cần số liệu tháng lịch sử cho report hoặc export
//
// Usage:
//   const stats = await fetchMonthStats('2026-05');
//   console.log(stats?.income?.total, stats?.profit);
// ════════════════════════════════════════════════════════════════
export async function fetchMonthStats(month) {
    const sdk   = window._fb_init || {};
    const store = window.__store  || {};
    const db    = store.db;

    if (!sdk.doc || !sdk.getDoc || !db || !month) return null;

    const clubId = store.clubId || store.currentClubId;
    if (!clubId) return null;

    const { doc, getDoc } = sdk;
    const docId  = month.replace('-', '_');

    try {
        const snap = await getDoc(doc(db, 'clubs', clubId, 'stats', docId));
        if (typeof window.recordFirestoreReadAttribution === 'function') {
            window.recordFirestoreReadAttribution('dashboard.monthStatsPointRead', 1, {
                initial: true,
                reason: month
            });
        }
        return snap.exists() ? snap.data() : null;
    } catch (err) {
        return null;
    }
}


// ════════════════════════════════════════════════════════════════
// tryApplyCurrentMonthStats — Phase 4K-FIX Lỗi 4
// ────────────────────────────────────────────────────────────────
// Ưu tiên stats doc để hiển thị tổng doanh thu/chi phí tháng hiện tại.
// Gọi async sau khi renderApp() đã cập nhật dashboard từ allTransactions.
//
// TẠI SAO CẦN?
//   allTransactions có giới hạn limit(1200) — nếu tháng có >1200 GD,
//   tổng tính từ allTransactions sẽ sai.
//   stats doc (ghi bởi Cloud Functions trigger) luôn chính xác.
//
// BEHAVIOR:
//   - Đọc stats doc cho tháng selMonth
//   - Nếu có và income.total > 0: override totalIncomeDashboard/totalExpenseDashboard/totalProfitDashboard
//   - Nếu không có stats doc: giữ nguyên allTransactions-based numbers (fallback an toàn)
//   - Không thay đổi danh sách giao dịch, bStats, hoặc các số liệu chi tiết
// ════════════════════════════════════════════════════════════════
export async function tryApplyCurrentMonthStats(selMonth) {
    // Phase 4K-6V5U6C:
    // Compatibility API only. No standalone Firestore read is allowed here.
    // Current-month authority comes from the canonical six-month payload.
    const snapshot = getDashboardCanonicalStatsSnapshot(selMonth);
    if (!snapshot.ready) return false;
    return _applyCurrentMonthStatsFromPayload(snapshot);
}

// ════════════════════════════════════════════════════════════════
// initDashboard — wire window accessors + cleanup hook
// ════════════════════════════════════════════════════════════════
// ════════════════════════════════════════════════════════════════
// fetchHistoricalDashboardFallback — Part 4 FIX
// Build full 6-month chartData + multi-row reportHtml.
// Priority: stats doc → transactions fallback per month.
// Called from refreshDashboardComputation (fire-and-forget async).
// ════════════════════════════════════════════════════════════════

const _SPARK_HISTORY_TTL_MS = 6 * 60 * 60 * 1000;
const _SPARK_HISTORY_CACHE_VERSION = 3;
const _DASHBOARD_DIRTY_RETRY_BACKOFF_MS = 90 * 1000;
const _sparkHistoryInFlight = new Map();
let _sparkHistoryDebounceTimer = null;
let _dashboardHistoryRequestGeneration = 0;
let _dashboardHistoryLatestIntent = {
    generation: 0,
    key: '',
    clubId: '',
    selectedMonth: '',
    authGeneration: 0,
    freshnessRevision: 0,
};

// Phase 4K-6V5U6C2: TTL is an age policy, not a freshness guarantee.
// Hydration reconciliation and mutation marks are RAM-only. Neither path reads
// Firestore or renders directly; the canonical loader remains the sole owner.
const _dashboardStatsFreshness = {
    revision: 0,
    dirtyMonths: new Map(),
    lastReason: '',
    lastDirtyAt: 0,
    identity: {
        clubId: '',
        authGeneration: 0,
    },
    hydration: {
        finance: new Map(),
        members: new Map(),
    },
};

let _dashboardCanonicalStatsSnapshot = {
    ready: false,
    clubId: '',
    selectedMonth: '',
    months: [],
    monthStats: {},
    chartData: null,
    reportHtml: '',
    source: '',
    fetchedAt: 0,
    appliedAt: 0,
    requestGeneration: 0,
    authGeneration: 0,
    freshnessRevision: 0,
    currentMonthAuthority: null,
};

function _sparkReadMetrics() {
    const defaults = {
        dashboardHistoryRequests: 0,
        dashboardHistoryNetworkFetches: 0,
        dashboardHistoryCacheHits: 0,
        dashboardHistoryCoalesced: 0,
        dashboardHistorySkippedHidden: 0,
        dashboardHistoryQueryGroups: 0,
        dashboardHistoryEstimatedDocsRead: 0,
        dashboardCanonicalStatsReads: 0,
        // Compatibility metric name retained for older diagnostics; canonical owner remains V5U6C2.
        dashboardStatsRead: 0,
        dashboardCacheHit: 0,
        dashboardSingleFlightCoalesced: 0,
        dashboardStaleResultDropped: 0,
        dashboardTransactionFallbackDocs: 0,
        dashboardCurrentMonthPayloadApplied: 0,
        dashboardDirtyRevision: 0,
        dashboardDirtyMarks: 0,
        dashboardTargetedMonthReads: 0,
        dashboardCurrentStatsRejectedStale: 0,
        dashboardCurrentRamPreserved: 0,
        dashboardDirtyFollowupRefresh: 0,
        dashboardHydrationBaseline: 0,
        dashboardHydrationMismatch: 0,
        dashboardInitialDirtySkipped: 0,
        dashboardLiveMutationDirty: 0,
        dashboardDirtyReadBackoffSkipped: 0,
        dashboardDirtyRevalidationAttempts: 0,
        dashboardDirtyResolved: 0,
        txSameMonthResubscribeSkipped: 0,
        lastDashboardHistoryReason: '',
        lastDashboardHistoryAt: 0,
        lastDashboardHistorySource: '',
        lastDashboardCurrentAuthority: '',
    };
    window.__sparkReadMetrics = window.__sparkReadMetrics || {};
    Object.entries(defaults).forEach(([key, value]) => {
        if (window.__sparkReadMetrics[key] === undefined) window.__sparkReadMetrics[key] = value;
    });
    return window.__sparkReadMetrics;
}

function _sparkHistoryCacheKey(clubId, selMonth) {
    return `tst:spark-dashboard-history:v${_SPARK_HISTORY_CACHE_VERSION}:${clubId}:${selMonth}`;
}

function _readSparkHistoryCache(clubId, selMonth) {
    try {
        const raw = localStorage.getItem(_sparkHistoryCacheKey(clubId, selMonth));
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || Number(parsed.version) !== _SPARK_HISTORY_CACHE_VERSION ||
            !parsed.savedAt || !parsed.payload) return null;
        const payload = parsed.payload;
        if (payload.clubId !== clubId || payload.selectedMonth !== selMonth ||
            !payload.monthStats || !payload.chartData) return null;
        return payload;
    } catch (_) {
        return null;
    }
}

function _writeSparkHistoryCache(clubId, selMonth, payload) {
    try {
        localStorage.setItem(
            _sparkHistoryCacheKey(clubId, selMonth),
            JSON.stringify({
                version: _SPARK_HISTORY_CACHE_VERSION,
                savedAt: Date.now(),
                payload
            })
        );
    } catch (_) {
        // Storage quota/private mode must never break dashboard rendering.
    }
}

function _isDashboardActive() {
    const active = document.querySelector('.tab-content.active');
    return !!(active && active.id === 'tab_dashboard');
}

function _currentDashboardClubId() {
    const store = window.__store || {};
    return String(store.clubId || store.currentClubId || '').trim();
}

function _currentDashboardSelectedMonth() {
    const domMonth = (
        (document.getElementById('filterMonth') || {}).value ||
        (document.getElementById('monthPicker') || {}).value ||
        ''
    );
    const storeMonth = (window.__store && window.__store.selectedMonth) || '';
    return String(domMonth || storeMonth || '').slice(0, 7);
}

function _currentDashboardAuthGeneration() {
    return Number(window.__verifiedAuthContextState?.generation || 0);
}

function _getDashboardLocalMonth(now = new Date()) {
    try {
        if (typeof window.getLocalToday === 'function') {
            const today = String(window.getLocalToday() || '');
            if (/^\d{4}-\d{2}-\d{2}$/.test(today)) return today.slice(0, 7);
        }
    } catch (_) {}
    try {
        const parts = new Intl.DateTimeFormat('en-US', {
            timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit'
        }).formatToParts(now);
        const values = {};
        parts.forEach(part => { if (part.type !== 'literal') values[part.type] = part.value; });
        if (values.year && values.month) return `${values.year}-${values.month}`;
    } catch (_) {}
    const local = new Date(now);
    local.setMinutes(local.getMinutes() - local.getTimezoneOffset());
    return local.toISOString().slice(0, 7);
}

function _dashboardFreshnessKey(clubId, month) {
    return `${String(clubId || '').trim()}:${String(month || '').slice(0, 7)}`;
}

function _resetDashboardCanonicalSnapshot() {
    _dashboardCanonicalStatsSnapshot = {
        ready: false,
        clubId: '',
        selectedMonth: '',
        months: [],
        monthStats: {},
        chartData: null,
        reportHtml: '',
        source: '',
        fetchedAt: 0,
        appliedAt: 0,
        requestGeneration: 0,
        authGeneration: 0,
        freshnessRevision: 0,
        currentMonthAuthority: null,
    };
}

function _resetDashboardStatsFreshnessState(reason = 'reset', identity = {}) {
    _dashboardStatsFreshness.revision = 0;
    _dashboardStatsFreshness.dirtyMonths.clear();
    _dashboardStatsFreshness.lastReason = String(reason || 'reset');
    _dashboardStatsFreshness.lastDirtyAt = 0;
    _dashboardStatsFreshness.hydration.finance.clear();
    _dashboardStatsFreshness.hydration.members.clear();
    _dashboardStatsFreshness.identity.clubId = String(identity.clubId || '').trim();
    _dashboardStatsFreshness.identity.authGeneration = Number(identity.authGeneration || 0);
    _dashboardHistoryRequestGeneration += 1;
    _dashboardHistoryLatestIntent = {
        generation: _dashboardHistoryRequestGeneration,
        key: '',
        clubId: _dashboardStatsFreshness.identity.clubId,
        selectedMonth: '',
        authGeneration: _dashboardStatsFreshness.identity.authGeneration,
        freshnessRevision: 0,
    };
    _resetDashboardCanonicalSnapshot();
}

function _ensureDashboardFreshnessIdentity() {
    const clubId = _currentDashboardClubId();
    const authGeneration = _currentDashboardAuthGeneration();
    const identity = _dashboardStatsFreshness.identity;
    if (identity.clubId !== clubId || Number(identity.authGeneration || 0) !== authGeneration) {
        _resetDashboardStatsFreshnessState('identity-change', { clubId, authGeneration });
    }
    return { clubId, authGeneration };
}

export function resetDashboardStatsFreshness(reason = 'reset') {
    _resetDashboardStatsFreshnessState(reason, {
        clubId: _currentDashboardClubId(),
        authGeneration: _currentDashboardAuthGeneration(),
    });
    return true;
}

function _getDashboardMonthDirtyEntry(month, clubId = _currentDashboardClubId()) {
    const entry = _dashboardStatsFreshness.dirtyMonths.get(_dashboardFreshnessKey(clubId, month));
    return entry ? { ...entry, domains: Array.isArray(entry.domains) ? [...entry.domains] : [] } : null;
}

function _isDashboardMonthDirty(month, clubId = _currentDashboardClubId()) {
    return !!_dashboardStatsFreshness.dirtyMonths.get(_dashboardFreshnessKey(clubId, month));
}

export function markDashboardStatsDirty(month = '', reason = 'mutation', domain = 'unknown', options = {}) {
    const { clubId } = _ensureDashboardFreshnessIdentity();
    const resolvedMonth = String(month || _getDashboardLocalMonth()).slice(0, 7);
    if (!clubId || !/^\d{4}-\d{2}$/.test(resolvedMonth)) return null;

    const key = _dashboardFreshnessKey(clubId, resolvedMonth);
    const previous = _dashboardStatsFreshness.dirtyMonths.get(key) || null;
    const revision = Number(_dashboardStatsFreshness.revision || 0) + 1;
    const dirtyAt = Date.now();
    const domains = new Set(Array.isArray(previous?.domains) ? previous.domains : []);
    domains.add(String(domain || 'unknown'));
    (Array.isArray(options.domains) ? options.domains : []).forEach(item => domains.add(String(item || 'unknown')));
    const eventType = String(options.eventType || 'live-mutation');
    const entry = {
        clubId,
        month: resolvedMonth,
        revision,
        dirtyAt,
        domain: String(domain || 'unknown'),
        domains: Array.from(domains),
        reason: String(reason || 'mutation'),
        eventType,
        lastAttemptAt: 0,
        attemptCount: 0,
        nextRevalidateAt: 0,
    };
    _dashboardStatsFreshness.revision = revision;
    _dashboardStatsFreshness.lastReason = entry.reason;
    _dashboardStatsFreshness.lastDirtyAt = dirtyAt;
    _dashboardStatsFreshness.dirtyMonths.set(key, entry);

    const metrics = _sparkReadMetrics();
    metrics.dashboardDirtyRevision = revision;
    metrics.dashboardDirtyMarks++;
    if (eventType === 'live-mutation') {
        metrics.dashboardLiveMutationDirty++;
        const hydration = _dashboardStatsFreshness.hydration[domain];
        const hydrationEntry = hydration && hydration.get(key);
        if (hydrationEntry) hydrationEntry.retired = true;
    }
    return { ...entry, domains: [...entry.domains] };
}

function _mergeDashboardHydrationDirtyDomains(clubId, month, domains, reason) {
    const key = _dashboardFreshnessKey(clubId, month);
    const current = _dashboardStatsFreshness.dirtyMonths.get(key);
    if (!current || current.eventType !== 'hydration-mismatch') return null;
    const mergedDomains = new Set(Array.isArray(current.domains) ? current.domains : []);
    (Array.isArray(domains) ? domains : []).forEach(domain => mergedDomains.add(String(domain || 'unknown')));
    current.domains = Array.from(mergedDomains);
    current.domain = current.domains[0] || current.domain || 'unknown';
    if (reason) current.reason = String(reason);
    _dashboardStatsFreshness.dirtyMonths.set(key, current);
    return { ...current, domains: [...current.domains] };
}

function _recordDashboardDirtyRevalidationAttempt(clubId, month, revision, resolved = false) {
    const key = _dashboardFreshnessKey(clubId, month);
    const current = _dashboardStatsFreshness.dirtyMonths.get(key);
    if (!current || Number(current.revision || 0) !== Number(revision || 0)) return false;
    const attemptedAt = Date.now();
    current.lastAttemptAt = attemptedAt;
    current.attemptCount = Number(current.attemptCount || 0) + 1;
    current.nextRevalidateAt = resolved ? 0 : attemptedAt + _DASHBOARD_DIRTY_RETRY_BACKOFF_MS;
    _dashboardStatsFreshness.dirtyMonths.set(key, current);
    _sparkReadMetrics().dashboardDirtyRevalidationAttempts++;
    return true;
}

function _isDashboardDirtyBackoffActive(entry, now = Date.now()) {
    return !!entry && Number(entry.nextRevalidateAt || 0) > Number(now || 0);
}

function _clearDashboardMonthDirtyIfRevision(clubId, month, revision) {
    const key = _dashboardFreshnessKey(clubId, month);
    const current = _dashboardStatsFreshness.dirtyMonths.get(key);
    if (!current || Number(current.revision || 0) !== Number(revision || 0)) return false;
    _dashboardStatsFreshness.dirtyMonths.delete(key);
    ['finance', 'members'].forEach(domain => {
        const hydrationEntry = _dashboardStatsFreshness.hydration[domain].get(key);
        if (!hydrationEntry || hydrationEntry.retired) return;
        hydrationEntry.mismatchMarked = false;
        hydrationEntry.mismatchRevision = 0;
        hydrationEntry.lastOutcome = 'match';
    });
    _sparkReadMetrics().dashboardDirtyResolved++;
    return true;
}

function _captureDashboardHistoryRequestToken(clubId, selectedMonth) {
    const authGeneration = _currentDashboardAuthGeneration();
    const freshnessRevision = Number(_dashboardStatsFreshness.revision || 0);
    const key = `${clubId}:${selectedMonth}:${authGeneration}:${freshnessRevision}`;
    if (_dashboardHistoryLatestIntent.key !== key) {
        _dashboardHistoryRequestGeneration += 1;
        _dashboardHistoryLatestIntent = {
            generation: _dashboardHistoryRequestGeneration,
            key,
            clubId,
            selectedMonth,
            authGeneration,
            freshnessRevision,
        };
    }
    return { ..._dashboardHistoryLatestIntent };
}

function _isDashboardHistoryTokenCurrent(token) {
    if (!token) return false;
    return (
        Number(token.generation || 0) === Number(_dashboardHistoryLatestIntent.generation || 0) &&
        String(token.clubId || '') === _currentDashboardClubId() &&
        String(token.selectedMonth || '') === _currentDashboardSelectedMonth() &&
        Number(token.authGeneration || 0) === _currentDashboardAuthGeneration() &&
        Number(token.freshnessRevision || 0) === Number(_dashboardStatsFreshness.revision || 0)
    );
}

function _getDashboardMonthStrings(selMonth) {
    if (typeof window.getRecentMonths === 'function') return window.getRecentMonths(selMonth, 6);
    const [sy, sm] = String(selMonth).split('-').map(Number);
    const result = [];
    for (let i = 5; i >= 0; i--) {
        let m = sm - i, y = sy;
        while (m <= 0) { m += 12; y -= 1; }
        result.push(`${y}-${String(m).padStart(2, '0')}`);
    }
    return result;
}

function _isCachedDashboardMonthReusable(stat, month, clubId, cachedPayload) {
    if (!stat || typeof stat !== 'object') return false;
    const dirtyEntry = _getDashboardMonthDirtyEntry(month, clubId);
    if (dirtyEntry && !_isDashboardDirtyBackoffActive(dirtyEntry)) return false;
    const unresolved = cachedPayload?.freshness?.unresolvedDirtyMonths;
    if (!dirtyEntry && Array.isArray(unresolved) && unresolved.includes(month)) return false;
    const fetchedAt = Number(stat.fetchedAt || cachedPayload?.fetchedAt || 0);
    if (!fetchedAt || (Date.now() - fetchedAt) > _SPARK_HISTORY_TTL_MS) return false;
    return true;
}

function _hasOwn(obj, key) {
    return !!obj && Object.prototype.hasOwnProperty.call(obj, key);
}

function _readNestedOwn(obj, parent, child) {
    return !!obj && !!obj[parent] && typeof obj[parent] === 'object' &&
        Object.prototype.hasOwnProperty.call(obj[parent], child);
}

function _readStatsNumber(raw, flatKey, parentKey, childKey) {
    if (_hasOwn(raw, flatKey)) {
        const n = Number(raw[flatKey]);
        return { present: Number.isFinite(n), value: Number.isFinite(n) ? n : 0 };
    }
    if (_readNestedOwn(raw, parentKey, childKey)) {
        const n = Number(raw[parentKey][childKey]);
        return { present: Number.isFinite(n), value: Number.isFinite(n) ? n : 0 };
    }
    return { present: false, value: 0 };
}

function _normalizeStatsUpdatedAt(value) {
    if (value == null) return 0;
    try {
        if (typeof value.toMillis === 'function') {
            const ms = Number(value.toMillis());
            return Number.isFinite(ms) ? ms : 0;
        }
    } catch (_) {}
    if (value instanceof Date) {
        const ms = value.getTime();
        return Number.isFinite(ms) ? ms : 0;
    }
    if (typeof value === 'number') {
        if (!Number.isFinite(value)) return 0;
        return value > 0 && value < 1e12 ? Math.round(value * 1000) : Math.round(value);
    }
    if (typeof value === 'string') {
        const ms = Date.parse(value);
        return Number.isFinite(ms) ? ms : 0;
    }
    if (typeof value === 'object' && Number.isFinite(Number(value.seconds))) {
        return Math.round(Number(value.seconds) * 1000 + Number(value.nanoseconds || 0) / 1e6);
    }
    return 0;
}

function _normalizeDashboardMonthStats(raw, exists = true) {
    if (!exists || !raw || typeof raw !== 'object') {
        return {
            exists: false,
            source: 'missing',
            incomeTotal: 0,
            expenseTotal: 0,
            active: 0,
            newMembers: 0,
            quitMembers: 0,
            txCount: 0,
            updatedAtMs: 0,
            fetchedAt: 0,
            coverage: {
                income: false,
                expense: false,
                active: false,
                newMembers: false,
                quitMembers: false,
                txCount: false,
            },
        };
    }

    const income = _readStatsNumber(raw, 'income.total', 'income', 'total');
    const expense = _readStatsNumber(raw, 'expense.total', 'expense', 'total');
    const active = _readStatsNumber(raw, 'members.active', 'members', 'active');
    const mNew = _readStatsNumber(raw, 'members.new', 'members', 'new');
    const mQuit = _readStatsNumber(raw, 'members.quit', 'members', 'quit');
    const txCountPresent = _hasOwn(raw, 'txCount') && Number.isFinite(Number(raw.txCount));

    return {
        exists: true,
        source: 'stats-doc',
        incomeTotal: income.value,
        expenseTotal: expense.value,
        active: active.value,
        newMembers: mNew.value,
        quitMembers: mQuit.value,
        txCount: txCountPresent ? Number(raw.txCount) : 0,
        updatedAtMs: _normalizeStatsUpdatedAt(raw.updatedAt),
        fetchedAt: 0,
        coverage: {
            income: income.present,
            expense: expense.present,
            active: active.present,
            newMembers: mNew.present,
            quitMembers: mQuit.present,
            txCount: txCountPresent,
        },
    };
}

function _getLocalMonthTransactionEvidence(month) {
    const store = window.__store || {};
    const txs = Array.isArray(store.transactions) ? store.transactions : [];
    const matching = txs.filter(tx => {
        if (!tx) return false;
        if (typeof window.txMatchesSelectedMonth === 'function') {
            try { return !!window.txMatchesSelectedMonth(tx, month); } catch (_) {}
        }
        if (Array.isArray(tx.accountingMonths) && tx.accountingMonths.includes(month)) return true;
        if (Array.isArray(tx.packageMonths) && tx.packageMonths.includes(month)) return true;
        return [tx.txMonth, tx.paymentMonth, tx.date].some(value => String(value || '').slice(0, 7) === month);
    });
    const summary = store._lastSummaryNumbers || {};
    const summaryMonth = String(summary.selMonth || '').slice(0, 7);
    const hasSummary = summaryMonth === month && [
        summary.incTuition, summary.incExam, summary.incOther, summary.incUniform,
        summary.expTotal, summary.expExamTotal, summary.expUniform
    ].some(value => Number.isFinite(Number(value)));
    let incomeTotal = hasSummary
        ? Number(summary.incTuition || 0) + Number(summary.incExam || 0) + Number(summary.incOther || 0) + Number(summary.incUniform || 0)
        : 0;
    let expenseTotal = hasSummary
        ? Number(summary.expTotal || 0) + Number(summary.expExamTotal || 0) + Number(summary.expUniform || 0)
        : 0;
    let hasFinanceTotals = hasSummary;
    if (!hasFinanceTotals && typeof window.computeMonthlyFinanceHistory === 'function') {
        try {
            const history = window.computeMonthlyFinanceHistory(matching, [month]) || {};
            const row = history[month];
            if (row && Number.isFinite(Number(row.income)) && Number.isFinite(Number(row.expense))) {
                incomeTotal = Number(row.income || 0);
                expenseTotal = Number(row.expense || 0);
                hasFinanceTotals = true;
            }
        } catch (_) {}
    }
    const reportHtml = hasSummary && typeof store.tabHtmlCache?.reportList === 'string'
        ? store.tabHtmlCache.reportList
        : '';
    return {
        localMonthTxCount: matching.length,
        hasSummary,
        hasFinanceTotals,
        incomeTotal,
        expenseTotal,
        activeCount: hasSummary ? Number(summary.activeCount || 0) : 0,
        reportHtml,
    };
}

function _getDashboardHydrationEntry(domain, month, clubId = _currentDashboardClubId()) {
    const map = _dashboardStatsFreshness.hydration[domain];
    if (!map) return null;
    return map.get(_dashboardFreshnessKey(clubId, month)) || null;
}

function _getHydratedMemberEvidence(month, clubId = _currentDashboardClubId()) {
    const entry = _getDashboardHydrationEntry('members', month, clubId);
    return entry && !entry.retired ? entry.evidence : null;
}

function _isCoachDashboardContext() {
    const role = String(window.__store?.userRole || window.userRole || '').trim().toLowerCase().replace(/-/g, '_');
    return role === 'coach' || role === 'hlv';
}

function _normalizeHydrationEvidence(domain, month, supplied = {}) {
    if (domain === 'finance') {
        const local = _getLocalMonthTransactionEvidence(month);
        return {
            ...local,
            ...supplied,
            localMonthTxCount: Number(supplied.localMonthTxCount ?? local.localMonthTxCount ?? 0),
            incomeTotal: Number(supplied.incomeTotal ?? local.incomeTotal ?? 0),
            expenseTotal: Number(supplied.expenseTotal ?? local.expenseTotal ?? 0),
            hasFinanceTotals: supplied.hasFinanceTotals !== undefined
                ? supplied.hasFinanceTotals === true
                : local.hasFinanceTotals === true,
            coverageComplete: supplied.coverageComplete !== false,
        };
    }
    return {
        activeCount: Number(supplied.activeCount || 0),
        activeAvailable: supplied.activeAvailable !== false,
        newMembers: Number(supplied.newMembers || 0),
        newMembersAvailable: supplied.newMembersAvailable === true,
        quitMembers: Number(supplied.quitMembers || 0),
        quitMembersAvailable: supplied.quitMembersAvailable === true,
        coverageComplete: supplied.coverageComplete !== false,
    };
}

function _compareHydrationEntryWithStats(entry, stats) {
    if (!entry || entry.retired || !stats || !stats.coverage) {
        return { status: 'unknown', reason: 'hydration-or-stats-missing' };
    }
    if (stats.source === 'ram-newer-than-stats') {
        return { status: 'mismatch', reason: 'canonical-still-ram-preserved' };
    }
    const evidence = entry.evidence || {};
    if (entry.domain === 'finance') {
        if (!stats.coverage.txCount) return { status: 'unknown', reason: 'finance-txcount-uncovered' };
        const localCount = Number(evidence.localMonthTxCount || 0);
        const statsCount = Number(stats.txCount || 0);
        if (statsCount < localCount) return { status: 'mismatch', reason: 'finance-stats-count-behind' };
        if (statsCount > localCount) return { status: 'match', reason: 'finance-stats-broader-coverage' };
        const totalsComparable = evidence.coverageComplete !== false && evidence.hasFinanceTotals === true &&
            stats.coverage.income && stats.coverage.expense;
        if (totalsComparable && (
            Number(stats.incomeTotal || 0) !== Number(evidence.incomeTotal || 0) ||
            Number(stats.expenseTotal || 0) !== Number(evidence.expenseTotal || 0)
        )) {
            return { status: 'mismatch', reason: 'finance-equal-count-total-mismatch' };
        }
        return { status: 'match', reason: totalsComparable ? 'finance-count-total-match' : 'finance-count-match' };
    }

    if (entry.domain === 'members') {
        if (!stats.coverage.active || evidence.activeAvailable !== true) {
            return { status: 'unknown', reason: 'members-active-uncovered' };
        }
        const statsActive = Number(stats.active || 0);
        const localActive = Number(evidence.activeCount || 0);
        if (evidence.coverageComplete === false && localActive === 0 && statsActive > 0) {
            return { status: 'unknown', reason: 'members-zero-probe-pending' };
        }
        if (statsActive !== localActive) return { status: 'mismatch', reason: 'members-active-mismatch' };
        if (evidence.newMembersAvailable && stats.coverage.newMembers &&
            Number(stats.newMembers || 0) !== Number(evidence.newMembers || 0)) {
            return { status: 'mismatch', reason: 'members-new-mismatch' };
        }
        if (evidence.quitMembersAvailable && stats.coverage.quitMembers &&
            Number(stats.quitMembers || 0) !== Number(evidence.quitMembers || 0)) {
            return { status: 'mismatch', reason: 'members-quit-mismatch' };
        }
        return { status: 'match', reason: 'members-current-count-match' };
    }
    return { status: 'unknown', reason: 'unsupported-hydration-domain' };
}

function _reconcileHydratedEvidenceWithPayload(payload, reason = 'canonical-payload') {
    if (!payload || !payload.clubId || !payload.selectedMonth || !payload.monthStats) {
        return { status: 'pending-canonical', marked: false };
    }
    const clubId = String(payload.clubId || '').trim();
    const month = String(payload.selectedMonth || '').slice(0, 7);
    if (month !== _getDashboardLocalMonth()) return { status: 'historical-baseline', marked: false };
    const stats = payload.monthStats[month];
    if (!stats) return { status: 'pending-canonical', marked: false };

    const outcomes = [];
    ['finance', 'members'].forEach(domain => {
        const entry = _getDashboardHydrationEntry(domain, month, clubId);
        if (!entry || entry.retired) return;
        const comparison = _compareHydrationEntryWithStats(entry, stats);
        outcomes.push({ domain, entry, comparison });
        if (comparison.status === 'match' && entry.lastOutcome !== 'match') {
            _sparkReadMetrics().dashboardHydrationBaseline++;
        }
        entry.lastOutcome = comparison.status;
        entry.lastComparisonReason = comparison.reason;
        entry.lastComparedAt = Date.now();
    });

    if (outcomes.length === 0) return { status: 'no-hydration-evidence', marked: false };
    const newMismatches = outcomes.filter(item => item.comparison.status === 'mismatch' && !item.entry.mismatchMarked);
    if (newMismatches.length === 0) {
        const hasMismatch = outcomes.some(item => item.comparison.status === 'mismatch');
        const allMatch = outcomes.every(item => item.comparison.status === 'match');
        return { status: hasMismatch ? 'mismatch-already-marked' : (allMatch ? 'match' : 'unknown'), marked: false, outcomes };
    }

    const domains = newMismatches.map(item => item.domain);
    let dirty = _mergeDashboardHydrationDirtyDomains(clubId, month, domains, `hydration-mismatch:${reason}`);
    const existing = _getDashboardMonthDirtyEntry(month, clubId);
    if (!dirty && existing?.eventType === 'live-mutation') {
        newMismatches.forEach(item => { item.entry.retired = true; });
        return { status: 'covered-by-live-mutation', marked: false, outcomes };
    }
    if (!dirty) {
        dirty = markDashboardStatsDirty(month, `hydration-mismatch:${reason}`, domains[0] || 'unknown', {
            eventType: 'hydration-mismatch',
            domains,
        });
    }
    if (dirty) {
        newMismatches.forEach(item => {
            item.entry.mismatchMarked = true;
            item.entry.mismatchRevision = dirty.revision;
            _sparkReadMetrics().dashboardHydrationMismatch++;
        });
    }
    return { status: dirty ? 'mismatch-marked' : 'mismatch-unmarked', marked: !!dirty, dirty, outcomes };
}

function _evaluateHydrationDirtyCompatibility(payload, dirtyEntry) {
    if (!payload || !dirtyEntry || dirtyEntry.eventType !== 'hydration-mismatch') {
        return { status: 'not-hydration-dirty', outcomes: [] };
    }
    const month = payload.selectedMonth;
    const stats = payload.monthStats?.[month];
    const domains = new Set(Array.isArray(dirtyEntry.domains) ? dirtyEntry.domains : []);
    const outcomes = [];
    ['finance', 'members'].forEach(domain => {
        if (!domains.has(domain)) return;
        const entry = _getDashboardHydrationEntry(domain, month, payload.clubId);
        if (!entry || entry.retired) return;
        outcomes.push(_compareHydrationEntryWithStats(entry, stats));
    });
    if (outcomes.length === 0) return { status: 'unknown', outcomes };
    if (outcomes.some(item => item.status === 'mismatch')) return { status: 'mismatch', outcomes };
    if (outcomes.every(item => item.status === 'match')) return { status: 'match', outcomes };
    return { status: 'unknown', outcomes };
}

export function reconcileDashboardHydrationEvidence({ domain, month = '', reason = 'initial-hydration', evidence = {} } = {}) {
    const identity = _ensureDashboardFreshnessIdentity();
    const normalizedDomain = domain === 'finance' || domain === 'members' ? domain : '';
    const resolvedMonth = String(month || _getDashboardLocalMonth()).slice(0, 7);
    if (!identity.clubId || !normalizedDomain || !/^\d{4}-\d{2}$/.test(resolvedMonth) || _isCoachDashboardContext()) {
        return { status: 'skipped', marked: false };
    }
    const key = _dashboardFreshnessKey(identity.clubId, resolvedMonth);
    const entry = {
        clubId: identity.clubId,
        authGeneration: identity.authGeneration,
        month: resolvedMonth,
        domain: normalizedDomain,
        ready: true,
        reason: String(reason || 'initial-hydration'),
        recordedAt: Date.now(),
        evidence: _normalizeHydrationEvidence(normalizedDomain, resolvedMonth, evidence),
        mismatchMarked: false,
        mismatchRevision: 0,
        retired: false,
        lastOutcome: '',
        lastComparisonReason: '',
        lastComparedAt: 0,
    };
    _dashboardStatsFreshness.hydration[normalizedDomain].set(key, entry);
    _sparkReadMetrics().dashboardInitialDirtySkipped++;

    const snap = _dashboardCanonicalStatsSnapshot;
    const hasCanonical = !!(
        snap.ready && snap.clubId === identity.clubId && snap.selectedMonth === resolvedMonth &&
        Number(snap.authGeneration || 0) === identity.authGeneration
    );
    return hasCanonical
        ? _reconcileHydratedEvidenceWithPayload(snap, reason)
        : { status: 'pending-canonical', marked: false, domain: normalizedDomain, month: resolvedMonth };
}

function _shouldApplyCanonicalCurrentMonth(payload, context = {}) {
    if (!payload || !payload.selectedMonth || !payload.monthStats) {
        return { accepted: false, reason: 'payload-missing', dirtyEntry: null, evidence: null };
    }
    const month = payload.selectedMonth;
    const stats = payload.monthStats[month];
    if (!stats || !stats.coverage || !stats.coverage.income || !stats.coverage.expense) {
        return { accepted: false, reason: 'coverage-missing', dirtyEntry: null, evidence: null };
    }
    const dirtyEntry = context.dirtyEntry || _getDashboardMonthDirtyEntry(month, payload.clubId);
    const evidence = context.evidence || _getLocalMonthTransactionEvidence(month);
    if (!dirtyEntry) return { accepted: true, reason: 'accepted-stats', dirtyEntry: null, evidence, clearsDirty: false };

    if (dirtyEntry.eventType === 'hydration-mismatch') {
        const hydration = _evaluateHydrationDirtyCompatibility(payload, dirtyEntry);
        if (hydration.status === 'match') {
            return { accepted: true, reason: 'accepted-hydration-evidence-match', dirtyEntry, evidence, clearsDirty: true };
        }
        return {
            accepted: false,
            reason: hydration.status === 'mismatch' ? 'hydration-evidence-mismatch' : 'hydration-evidence-unresolved',
            dirtyEntry,
            evidence,
            clearsDirty: false,
        };
    }

    const localCount = Number(evidence?.localMonthTxCount || 0);
    const statsCount = Number(stats.txCount || 0);
    const dirtyDomains = new Set(Array.isArray(dirtyEntry.domains) ? dirtyEntry.domains : []);
    const hasMemberMutation = dirtyDomains.has('members');
    if (stats.coverage.txCount && statsCount < localCount) {
        return { accepted: false, reason: 'stats-behind-local-count', dirtyEntry, evidence, clearsDirty: false };
    }

    const updatedAtMs = Number(stats.updatedAtMs || 0);
    const hasRamFinance = evidence?.hasSummary || evidence?.hasFinanceTotals;
    if (hasRamFinance && updatedAtMs > 0 && updatedAtMs < Number(dirtyEntry.dirtyAt || 0)) {
        return { accepted: false, reason: 'stats-before-dirty-at', dirtyEntry, evidence, clearsDirty: false };
    }
    if (updatedAtMs >= Number(dirtyEntry.dirtyAt || 0) && updatedAtMs > 0) {
        return { accepted: true, reason: 'accepted-stats-after-dirty', dirtyEntry, evidence, clearsDirty: true };
    }

    // Member mutations cannot be proven fresh by transaction-count coverage.
    // Without a post-mutation updatedAt, preserve the RAM member/summary evidence
    // and keep the dirty mark so the next canonical refresh can revalidate it.
    if (hasMemberMutation) {
        if (evidence?.hasSummary || _getHydratedMemberEvidence(month, payload.clubId)?.activeAvailable) {
            return { accepted: false, reason: 'members-before-dirty-at', dirtyEntry, evidence, clearsDirty: false };
        }
        return { accepted: true, reason: 'accepted-members-unverified-no-local-evidence', dirtyEntry, evidence, clearsDirty: false };
    }

    // Legacy finance stats may not have updatedAt. A strictly higher server txCount
    // can still prove broader transaction coverage; equality cannot prove freshness
    // after a finance mutation.
    if (stats.coverage.txCount && statsCount > localCount) {
        return { accepted: true, reason: 'accepted-stats-higher-coverage', dirtyEntry, evidence, clearsDirty: true };
    }
    if (hasRamFinance) {
        return { accepted: false, reason: 'current-month-dirty', dirtyEntry, evidence, clearsDirty: false };
    }
    return { accepted: true, reason: 'accepted-no-local-evidence', dirtyEntry, evidence, clearsDirty: false };
}

function _cloneCanonicalDashboardSnapshot(snapshot) {
    if (!snapshot) return null;
    const chartData = snapshot.chartData ? {
        labels: Array.isArray(snapshot.chartData.labels) ? [...snapshot.chartData.labels] : [],
        income: Array.isArray(snapshot.chartData.income) ? [...snapshot.chartData.income] : [],
        expense: Array.isArray(snapshot.chartData.expense) ? [...snapshot.chartData.expense] : [],
        active: Array.isArray(snapshot.chartData.active) ? [...snapshot.chartData.active] : [],
    } : null;
    const monthStats = {};
    Object.entries(snapshot.monthStats || {}).forEach(([month, stat]) => {
        monthStats[month] = {
            ...(stat || {}),
            coverage: { ...((stat && stat.coverage) || {}) },
        };
    });
    return {
        ...snapshot,
        months: Array.isArray(snapshot.months) ? [...snapshot.months] : [],
        monthStats,
        chartData,
    };
}

export function getDashboardCanonicalStatsSnapshot(expectedMonth = '') {
    const snap = _dashboardCanonicalStatsSnapshot;
    const currentClubId = _currentDashboardClubId();
    const currentMonth = String(expectedMonth || _currentDashboardSelectedMonth() || '').slice(0, 7);
    const authGeneration = _currentDashboardAuthGeneration();
    const ready = !!(
        snap.ready &&
        snap.clubId &&
        snap.clubId === currentClubId &&
        (!currentMonth || snap.selectedMonth === currentMonth) &&
        Number(snap.authGeneration || 0) === authGeneration
    );
    if (!ready) {
        return {
            ready: false,
            clubId: currentClubId,
            selectedMonth: currentMonth,
            months: [],
            monthStats: {},
            chartData: null,
            reportHtml: '',
            source: '',
            fetchedAt: 0,
            appliedAt: 0,
            requestGeneration: 0,
            authGeneration,
            freshnessRevision: Number(_dashboardStatsFreshness.revision || 0),
            freshness: { selectedMonthDirty: false, dirtyEntry: null },
        };
    }
    const cloned = _cloneCanonicalDashboardSnapshot(snap);
    const dirtyEntry = _getDashboardMonthDirtyEntry(cloned.selectedMonth, cloned.clubId);
    cloned.freshness = {
        ...(cloned.freshness || {}),
        selectedMonthDirty: !!dirtyEntry,
        dirtyEntry,
        revision: Number(_dashboardStatsFreshness.revision || 0),
    };
    return cloned;
}

function _applyCurrentMonthStatsFromPayload(payload) {
    if (!payload || !payload.selectedMonth || !payload.monthStats) return false;
    const stats = payload.monthStats[payload.selectedMonth];
    if (!stats || stats.source === 'ram-newer-than-stats') return false;

    const decision = _shouldApplyCanonicalCurrentMonth(payload);
    const metrics = _sparkReadMetrics();
    metrics.lastDashboardCurrentAuthority = decision.reason;
    if (!decision.accepted) return false;

    const incTotal = Number(stats.incomeTotal);
    const expTotal = Number(stats.expenseTotal);
    if (!Number.isFinite(incTotal) || !Number.isFinite(expTotal)) return false;

    const setText = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.innerText = value;
    };
    const fmt = (n) => Number(n).toLocaleString('vi-VN');

    setText('totalIncomeDashboard', `${fmt(incTotal)} ₫`);
    setText('totalExpenseDashboard', `${fmt(expTotal)} ₫`);
    setText('totalProfitDashboard', `${fmt(incTotal - expTotal)} ₫`);

    const mhbInc = document.getElementById('mhbIncome');
    if (mhbInc) mhbInc.innerText = _fmtK(incTotal);

    metrics.dashboardCurrentMonthPayloadApplied++;
    return true;
}

function _applyHistoricalDashboardPayload(payload, reason, requestToken) {
    if (!payload || !payload.chartData || !payload.clubId || !payload.selectedMonth) return null;

    if (!_isDashboardHistoryTokenCurrent(requestToken)) {
        _sparkReadMetrics().dashboardStaleResultDropped++;
        return {
            stale: true,
            dropped: true,
            clubId: payload.clubId,
            selectedMonth: payload.selectedMonth,
            source: payload.source || 'unknown',
        };
    }

    // Dirty state may only clear after the request identity + freshness revision
    // has passed the stale guard above. A stale response can never clear newer dirtiness.
    (Array.isArray(payload.freshness?.resolvedDirtyMonths) ? payload.freshness.resolvedDirtyMonths : []).forEach(item => {
        if (!item || !item.month) return;
        _clearDashboardMonthDirtyIfRevision(payload.clubId, item.month, item.revision);
    });

    const chartData = payload.chartData;
    const reportRows = payload.reportHtml || '';

    _dashboardCanonicalStatsSnapshot = {
        ..._cloneCanonicalDashboardSnapshot(payload),
        ready: true,
        appliedAt: Date.now(),
        requestGeneration: requestToken.generation,
        authGeneration: requestToken.authGeneration,
        freshnessRevision: requestToken.freshnessRevision,
    };

    _applyCurrentMonthStatsFromPayload(_dashboardCanonicalStatsSnapshot);

    if (typeof cacheDashboardData === 'function') {
        cacheDashboardData({
            reportHtml: reportRows,
            chartData,
            bStats: (window.__store && window.__store._lastBStats) || {},
            bExamStats: (window.__store && window.__store._lastBExamStats) || {},
            summaryNumbers: (window.__store && window.__store._lastSummaryNumbers) || {},
        });
    }

    const renderCharts = typeof window.renderDashboardCharts === 'function'
        ? window.renderDashboardCharts
        : (typeof renderDashboardCharts === 'function' ? renderDashboardCharts : null);
    if (renderCharts) {
        try { renderCharts(chartData); } catch (err) {
            console.warn('[dashboard-history] renderDashboardCharts failed:', err);
        }
    }

    const reportList = document.getElementById('reportList');
    if (reportList) reportList.innerHTML = reportRows;

    if (window.__store) {
        window.__store.tabHtmlCache = window.__store.tabHtmlCache || {};
        window.__store.tabHtmlCache._chartData = chartData;
        window.__store.tabHtmlCache.reportList = reportRows;
        window.__store._lastDashboardHistoryFetchAt = Date.now();
        window.__store._lastDashboardHistoryReason = reason || 'spark-history';
        window.__store._lastDashboardHistorySource = payload.source || 'unknown';
    }
    return getDashboardCanonicalStatsSnapshot(payload.selectedMonth);
}

async function _loadSparkHistoricalTransactions({ db, clubId, months, reason }) {
    const sdk = window._fb_init || {};
    const { collection, query, where, getDocs, limit } = sdk;
    const txRef = collection(db, 'clubs', clubId, 'transactions');
    const firstMonth = months[0];
    const lastMonth = months[months.length - 1];
    const startDate = firstMonth + '-01';
    const endDate = lastMonth + '-31';

    const jobs = [];
    if (typeof window.loadTransactionsForTxMonthRange === 'function') {
        jobs.push(window.loadTransactionsForTxMonthRange({
            colRef: txRef,
            startMonth: firstMonth,
            endMonth: lastMonth,
            pageSize: 500,
            maxPages: 10,
            reason: `${reason}:txMonth-range`,
        }));
    } else {
        jobs.push(getDocs(query(
            txRef,
            where('txMonth', '>=', firstMonth),
            where('txMonth', '<=', lastMonth),
            limit(2000)
        )).then(snap => snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    }

    if (typeof window.loadTransactionsForDateRange === 'function') {
        jobs.push(window.loadTransactionsForDateRange({
            colRef: txRef,
            startDate,
            endDate,
            pageSize: 500,
            maxPages: 10,
            reason: `${reason}:date-range`,
        }));
    } else {
        jobs.push(getDocs(query(
            txRef,
            where('date', '>=', startDate),
            where('date', '<=', endDate),
            limit(2000)
        )).then(snap => snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    }

    // One query covers all 6 months instead of one array-contains query per month.
    jobs.push(getDocs(query(
        txRef,
        where('packageMonths', 'array-contains-any', months.slice(0, 10)),
        limit(2000)
    )).then(snap => snap.docs.map(d => ({ id: d.id, ...d.data() }))));

    const settled = await Promise.allSettled(jobs);
    const map = new Map();
    let rawDocsRead = 0;
    settled.forEach(result => {
        if (result.status !== 'fulfilled') {
            console.warn('[spark-history] query group failed:', result.reason);
            return;
        }
        const items = Array.isArray(result.value) ? result.value : [];
        rawDocsRead += items.length;
        items.forEach(item => { if (item && item.id) map.set(item.id, item); });
    });

    const metrics = _sparkReadMetrics();
    metrics.dashboardHistoryQueryGroups += jobs.length;
    metrics.dashboardHistoryEstimatedDocsRead += rawDocsRead;
    if (typeof window.recordFirestoreReadAttribution === 'function') {
        window.recordFirestoreReadAttribution('dashboard.transactionFallbackQueries', rawDocsRead, {
            initial: true,
            reason: reason || 'spark-history-transaction-fallback'
        });
    }

    return { transactions: Array.from(map.values()), rawDocsRead, queryGroups: jobs.length };
}

/**
 * Spark-compatible 6-month dashboard loader.
 * - localStorage TTL cache (6 hours)
 * - single-flight per club/month
 * - 6 stats reads + at most 3 transaction query groups for the entire 6-month range
 * - never runs automatically while Dashboard tab is hidden
 */
export async function fetchHistoricalDashboardFallback(selMonth, reason, options = {}) {
    const sdk = window._fb_init || {};
    const store = window.__store || {};
    const db = store.db;
    const metrics = _sparkReadMetrics();
    metrics.dashboardHistoryRequests++;
    metrics.lastDashboardHistoryReason = reason || '';

    if (!sdk.doc || !sdk.getDoc || !sdk.getDocs || !sdk.query || !sdk.collection || !db) return null;

    const clubId = String(store.clubId || store.currentClubId || '').trim();
    selMonth = String(selMonth || '').slice(0, 7);
    if (!clubId || !selMonth) return null;

    _ensureDashboardFreshnessIdentity();
    const force = options.force === true || reason === 'force-reload';
    const key = `${clubId}:${selMonth}`;
    const monthStrings = _getDashboardMonthStrings(selMonth);
    const storageCached = force ? null : _readSparkHistoryCache(clubId, selMonth);
    const ramCached = !force && _dashboardCanonicalStatsSnapshot.ready &&
        _dashboardCanonicalStatsSnapshot.clubId === clubId &&
        _dashboardCanonicalStatsSnapshot.selectedMonth === selMonth &&
        Number(_dashboardCanonicalStatsSnapshot.authGeneration || 0) === _currentDashboardAuthGeneration()
        ? _cloneCanonicalDashboardSnapshot(_dashboardCanonicalStatsSnapshot)
        : null;
    const cached = storageCached || ramCached;
    if (cached) _reconcileHydratedEvidenceWithPayload(cached, reason || 'cache-before-apply');
    const requestToken = _captureDashboardHistoryRequestToken(clubId, selMonth);
    const cachedMonthStats = cached?.monthStats || {};
    const unresolvedCached = new Set(Array.isArray(cached?.freshness?.unresolvedDirtyMonths)
        ? cached.freshness.unresolvedDirtyMonths : []);

    const monthsToFetch = monthStrings.filter(month => {
        const dirtyEntry = _getDashboardMonthDirtyEntry(month, clubId);
        if (dirtyEntry && _isDashboardDirtyBackoffActive(dirtyEntry)) {
            metrics.dashboardDirtyReadBackoffSkipped++;
            return false;
        }
        if (force) return true;
        const stat = cachedMonthStats[month];
        return unresolvedCached.has(month) || !_isCachedDashboardMonthReusable(stat, month, clubId, cached);
    });
    const attemptedDirtyRevisions = new Map();
    monthsToFetch.forEach(month => {
        const entry = _getDashboardMonthDirtyEntry(month, clubId);
        if (entry) attemptedDirtyRevisions.set(month, Number(entry.revision || 0));
    });

    if (!force && cached && monthsToFetch.length === 0) {
        metrics.dashboardHistoryCacheHits++;
        metrics.dashboardCacheHit++;
        metrics.lastDashboardHistoryAt = Date.now();
        metrics.lastDashboardHistorySource = 'local-cache';
        return _applyHistoricalDashboardPayload(cached, reason || 'spark-cache-hit', requestToken);
    }

    if (_sparkHistoryInFlight.has(key)) {
        metrics.dashboardHistoryCoalesced++;
        metrics.dashboardSingleFlightCoalesced++;
        const flight = _sparkHistoryInFlight.get(key);
        // Never mutate an older flight token into a newer freshness revision.
        if (Number(requestToken.freshnessRevision || 0) > Number(flight.startedRevision || 0)) {
            flight.pendingRevision = Math.max(Number(flight.pendingRevision || 0), Number(requestToken.freshnessRevision || 0));
            flight.pendingReason = reason || 'freshness-followup';
            flight.pendingForce = flight.pendingForce || force;
        }
        return flight.promise;
    }

    const flight = {
        token: Object.freeze({ ...requestToken }),
        startedRevision: Number(requestToken.freshnessRevision || 0),
        pendingRevision: 0,
        pendingReason: '',
        pendingForce: false,
        promise: null,
    };

    flight.promise = (async () => {
        metrics.dashboardHistoryNetworkFetches++;
        const { doc, getDoc } = sdk;
        const labels = monthStrings.map(m => {
            if (typeof window.formatMonthLabel === 'function') return window.formatMonthLabel(m);
            const [y, mo] = m.split('-');
            return `T${Number(mo)}/${y}`;
        });

        const fetchedAt = Date.now();
        const statResults = await Promise.all(monthsToFetch.map(async (month) => {
            const idx = monthStrings.indexOf(month);
            try {
                const snap = await getDoc(doc(db, 'clubs', clubId, 'stats', month.replace('-', '_')));
                const exists = !!(snap && snap.exists());
                const raw = exists ? (snap.data() || {}) : null;
                const stats = _normalizeDashboardMonthStats(raw, exists);
                stats.fetchedAt = fetchedAt;
                return { month, idx, stats };
            } catch (_) {
                const stats = _normalizeDashboardMonthStats(null, false);
                stats.fetchedAt = fetchedAt;
                return { month, idx, stats };
            }
        }));

        metrics.dashboardHistoryQueryGroups += statResults.length;
        metrics.dashboardCanonicalStatsReads += statResults.length;
        metrics.dashboardStatsRead += statResults.length;
        metrics.dashboardHistoryEstimatedDocsRead += statResults.length;
        if (monthsToFetch.length > 0 && monthsToFetch.length < monthStrings.length) {
            metrics.dashboardTargetedMonthReads += statResults.length;
        }
        if (typeof window.recordFirestoreReadAttribution === 'function' && statResults.length > 0) {
            window.recordFirestoreReadAttribution('dashboard.canonicalStatsReads', statResults.length, {
                initial: true,
                reason: reason || 'dashboard-canonical-history',
                targeted: monthsToFetch.length < monthStrings.length,
                months: [...monthsToFetch],
            });
        }

        const mergedStats = {};
        monthStrings.forEach(month => {
            const cachedStat = cachedMonthStats[month];
            if (cachedStat) mergedStats[month] = {
                ...cachedStat,
                coverage: { ...(cachedStat.coverage || {}) },
            };
        });
        statResults.forEach(({ month, stats }) => { mergedStats[month] = stats; });

        // A cold load has no cache to compare before the network flight. Reconcile
        // the hydrated RAM against this response without another read. When this
        // response itself exposes a mismatch, capture a new immutable apply token;
        // the original flight token is never relabeled.
        const revisionBeforeHydrationReconcile = Number(_dashboardStatsFreshness.revision || 0);
        const hydrationReconcile = _reconcileHydratedEvidenceWithPayload({
            clubId,
            selectedMonth: selMonth,
            monthStats: mergedStats,
        }, reason || 'network-before-apply');
        let applyToken = flight.token;
        if (
            hydrationReconcile.marked &&
            revisionBeforeHydrationReconcile === Number(flight.startedRevision || 0) &&
            _currentDashboardClubId() === clubId &&
            _currentDashboardSelectedMonth() === selMonth &&
            _currentDashboardAuthGeneration() === Number(flight.token.authGeneration || 0)
        ) {
            applyToken = Object.freeze(_captureDashboardHistoryRequestToken(clubId, selMonth));
            const hydrationDirty = _getDashboardMonthDirtyEntry(selMonth, clubId);
            if (hydrationDirty && monthsToFetch.includes(selMonth)) {
                attemptedDirtyRevisions.set(selMonth, Number(hydrationDirty.revision || 0));
            }
        }

        const currentMonth = _getDashboardLocalMonth();
        const needsTxFallback = monthStrings.some(month => {
            if (month > currentMonth) return false;
            const stats = mergedStats[month] || _normalizeDashboardMonthStats(null, false);
            return !stats.coverage?.income || !stats.coverage?.expense;
        });

        let history = {};
        let txMeta = { transactions: [], rawDocsRead: 0, queryGroups: 0 };
        if (needsTxFallback) {
            console.info('[dashboard-history] stats incomplete — one compact 6-month transaction fallback');
            txMeta = await _loadSparkHistoricalTransactions({
                db,
                clubId,
                months: monthStrings,
                reason: 'dashboard-canonical-history',
            });
            metrics.dashboardTransactionFallbackDocs += Number(txMeta.rawDocsRead || 0);
            if (typeof window.recordFirestoreReadAttribution === 'function') {
                window.recordFirestoreReadAttribution('dashboard.transactionFallbackDocs', Number(txMeta.rawDocsRead || 0), {
                    initial: true,
                    reason: 'dashboard-canonical-history'
                });
            }
            if (typeof window.computeMonthlyFinanceHistory === 'function') {
                history = window.computeMonthlyFinanceHistory(txMeta.transactions, monthStrings) || {};
            }
        }

        const income = Array(monthStrings.length).fill(0);
        const expense = Array(monthStrings.length).fill(0);
        const active = Array(monthStrings.length).fill(0);
        const rows = [];
        const monthStats = {};
        const resolvedDirtyMonths = [];
        const unresolvedDirtyMonths = [];
        let currentMonthAuthority = null;
        const currentEvidence = _getLocalMonthTransactionEvidence(selMonth);
        const currentMemberEvidence = _getHydratedMemberEvidence(selMonth, clubId);
        const selectedDirty = _getDashboardMonthDirtyEntry(selMonth, clubId);

        monthStrings.forEach((month, idx) => {
            const stats = mergedStats[month] || _normalizeDashboardMonthStats(null, false);
            const fallback = history[month] || null;
            const hasStatsFinance = !!(stats.coverage?.income && stats.coverage?.expense);
            let inc = hasStatsFinance ? Number(stats.incomeTotal) : Number(fallback && fallback.income || 0);
            let exp = hasStatsFinance ? Number(stats.expenseTotal) : Number(fallback && fallback.expense || 0);
            let act = stats.coverage?.active ? Number(stats.active) : 0;
            const mNew = stats.coverage?.newMembers ? Number(stats.newMembers) : 0;
            const mQuit = stats.coverage?.quitMembers ? Number(stats.quitMembers) : 0;
            let source = hasStatsFinance ? (stats.source || 'stats-doc') : (fallback ? 'transaction-fallback' : stats.source);
            let authorityReason = '';

            if (month === selMonth) {
                const provisional = {
                    clubId,
                    selectedMonth: selMonth,
                    monthStats: { [selMonth]: { ...stats, incomeTotal: inc, expenseTotal: exp, coverage: { ...(stats.coverage || {}), income: hasStatsFinance || !!fallback, expense: hasStatsFinance || !!fallback } } }
                };
                const decision = _shouldApplyCanonicalCurrentMonth(provisional, { dirtyEntry: selectedDirty, evidence: currentEvidence });
                authorityReason = decision.reason;
                currentMonthAuthority = {
                    mode: decision.accepted ? 'stats' : 'ram-preserved',
                    reason: decision.reason,
                    dirtyRevision: Number(selectedDirty?.revision || 0),
                    dirtyAt: Number(selectedDirty?.dirtyAt || 0),
                };
                metrics.lastDashboardCurrentAuthority = decision.reason;

                const hasRamFinance = currentEvidence.hasSummary || currentEvidence.hasFinanceTotals;
                const hasRamMembers = !!currentMemberEvidence?.activeAvailable;
                if (!decision.accepted && (hasRamFinance || hasRamMembers)) {
                    if (hasRamFinance) {
                        inc = currentEvidence.incomeTotal;
                        exp = currentEvidence.expenseTotal;
                    }
                    act = hasRamMembers
                        ? Number(currentMemberEvidence.activeCount || 0)
                        : Number(currentEvidence.activeCount || act || 0);
                    source = 'ram-newer-than-stats';
                    metrics.dashboardCurrentStatsRejectedStale++;
                    metrics.dashboardCurrentRamPreserved++;
                } else if (decision.accepted && decision.clearsDirty && selectedDirty && monthsToFetch.includes(month)) {
                    resolvedDirtyMonths.push({ month, revision: selectedDirty.revision });
                }
            }

            const dirtyEntry = _getDashboardMonthDirtyEntry(month, clubId);
            if (dirtyEntry && month !== selMonth && monthsToFetch.includes(month)) {
                const updatedAtMs = Number(stats.updatedAtMs || 0);
                if (updatedAtMs >= Number(dirtyEntry.dirtyAt || 0) && updatedAtMs > 0) {
                    resolvedDirtyMonths.push({ month, revision: dirtyEntry.revision });
                } else {
                    unresolvedDirtyMonths.push(month);
                }
            }
            if (dirtyEntry && month === selMonth && !resolvedDirtyMonths.some(item => item.month === month)) {
                unresolvedDirtyMonths.push(month);
            }

            monthStats[month] = {
                ...stats,
                incomeTotal: Number.isFinite(inc) ? inc : 0,
                expenseTotal: Number.isFinite(exp) ? exp : 0,
                active: Number.isFinite(act) ? act : 0,
                source,
                authorityReason,
                fetchedAt: Number(stats.fetchedAt || cachedMonthStats[month]?.fetchedAt || fetchedAt),
                coverage: {
                    ...(stats.coverage || {}),
                    income: hasStatsFinance || !!fallback || (month === selMonth && source === 'ram-newer-than-stats'),
                    expense: hasStatsFinance || !!fallback || (month === selMonth && source === 'ram-newer-than-stats'),
                },
            };

            income[idx] = monthStats[month].incomeTotal;
            expense[idx] = monthStats[month].expenseTotal;
            active[idx] = monthStats[month].active;

            if (month === selMonth && source === 'ram-newer-than-stats' && currentEvidence.reportHtml) {
                rows.push(currentEvidence.reportHtml);
                return;
            }
            const profit = income[idx] - expense[idx];
            const profitCls = profit < 0 ? 'text-rose-600' : 'text-emerald-600';
            const rowClass = month === selMonth ? 'class="font-black text-primary"' : '';
            rows.push(`<tr><td ${rowClass}>${labels[idx]}</td>` +
                `<td class="text-slate-800 font-bold text-base">${active[idx] || '-'}</td>` +
                `<td class="text-emerald-600 font-medium">+${mNew}</td>` +
                `<td class="text-rose-600 font-medium">-${mQuit}</td>` +
                `<td class="text-emerald-600 font-bold">${income[idx].toLocaleString()} ₫</td>` +
                `<td class="text-rose-600 font-bold">${expense[idx].toLocaleString()} ₫</td>` +
                `<td class="${profitCls} font-black text-base bg-slate-50">${profit.toLocaleString()} ₫</td></tr>`);
        });

        if (_isDashboardHistoryTokenCurrent(applyToken)) {
            const resolvedSet = new Set(resolvedDirtyMonths.map(item => item && item.month).filter(Boolean));
            const unresolvedSet = new Set(unresolvedDirtyMonths);
            attemptedDirtyRevisions.forEach((revision, month) => {
                if (!resolvedSet.has(month) && !unresolvedSet.has(month)) return;
                _recordDashboardDirtyRevalidationAttempt(clubId, month, revision, resolvedSet.has(month));
            });
        }

        const payload = {
            schemaVersion: _SPARK_HISTORY_CACHE_VERSION,
            ready: true,
            clubId,
            selectedMonth: selMonth,
            months: monthStrings,
            monthStats,
            chartData: { labels, income, expense, active },
            reportHtml: rows.join(''),
            source: needsTxFallback ? 'spark-compact-range' : (monthsToFetch.length < monthStrings.length ? 'stats-docs-targeted' : 'stats-docs'),
            fetchedAt: Date.now(),
            rawTransactionDocsRead: txMeta.rawDocsRead,
            transactionQueryGroups: txMeta.queryGroups,
            currentMonthAuthority,
            freshness: {
                requestRevision: Number(applyToken.freshnessRevision || flight.startedRevision || 0),
                resolvedDirtyMonths,
                unresolvedDirtyMonths: Array.from(new Set(unresolvedDirtyMonths)),
            },
        };

        metrics.lastDashboardHistoryAt = Date.now();
        metrics.lastDashboardHistorySource = payload.source;
        const applied = _applyHistoricalDashboardPayload(payload, reason || 'spark-network', applyToken);
        if (!applied?.stale) _writeSparkHistoryCache(clubId, selMonth, payload);
        return applied;
    })().finally(() => {
        const current = _sparkHistoryInFlight.get(key);
        if (current === flight) _sparkHistoryInFlight.delete(key);

        const needsFollowup = Number(flight.pendingRevision || 0) > Number(flight.startedRevision || 0);
        if (needsFollowup) {
            const latestClub = _currentDashboardClubId();
            const latestMonth = _currentDashboardSelectedMonth();
            if (latestClub === clubId && latestMonth === selMonth) {
                metrics.dashboardDirtyFollowupRefresh++;
                if (_isDashboardActive()) {
                    scheduleDashboardHistoryFetch(selMonth, flight.pendingReason || 'freshness-followup', { force: flight.pendingForce }).catch(() => {});
                } else if (window.__store) {
                    window.__store._dashboardHistoryPending = { selMonth, reason: flight.pendingReason || 'freshness-followup' };
                }
            }
        }
    });

    _sparkHistoryInFlight.set(key, flight);
    return flight.promise;
}

export function scheduleDashboardHistoryFetch(selMonth, reason, options = {}) {
    const metrics = _sparkReadMetrics();
    const force = options.force === true || reason === 'force-reload';
    if (!force && !_isDashboardActive()) {
        metrics.dashboardHistorySkippedHidden++;
        if (window.__store) window.__store._dashboardHistoryPending = { selMonth, reason };
        return Promise.resolve({ skipped: 'dashboard-hidden' });
    }

    if (_sparkHistoryDebounceTimer) clearTimeout(_sparkHistoryDebounceTimer);
    _sparkHistoryDebounceTimer = setTimeout(() => {
        _sparkHistoryDebounceTimer = null;
        fetchHistoricalDashboardFallback(selMonth, reason, options).catch(error => {
            console.warn('[spark-history] scheduled fetch failed:', error);
        });
    }, 250);
    return Promise.resolve({ scheduled: true });
}

export function printSparkReadMetrics() {
    const metrics = { ..._sparkReadMetrics() };
    console.table(metrics);
    return metrics;
}

// ════════════════════════════════════════════════════════════════
// debugDashboardHistory — Part 5: console diagnostic
// Usage: await window.debugDashboardHistory()
// ════════════════════════════════════════════════════════════════

export function registerDebugDashboardHistory() {
    window.debugDashboardHistory = async function debugDashboardHistory() {
        const st = window.__store || {};
        const selectedMonth = (document.getElementById('filterMonth') || document.getElementById('monthPicker') || {}).value || st.selectedMonth || '';
        const _snap = typeof window.getDashboardHistoricalSnapshot === 'function'
            ? window.getDashboardHistoricalSnapshot()
            : null;
        const _cd = st.tabHtmlCache && st.tabHtmlCache._chartData || null;
        const result = {
            clubId:     st.clubId || st.currentClubId || '',
            selectedMonth,
            recentMonths: typeof window.getRecentMonths === 'function' ? window.getRecentMonths(selectedMonth, 6) : [],
            hasChartJs: !!window.Chart,
            hasFinanceChart: !!(window.getFinanceChart && window.getFinanceChart()),
            hasMemberChart:  !!(window.getMemberChart  && window.getMemberChart()),
            chartLabels:  _cd ? _cd.labels  : [],
            chartIncome:  _cd ? _cd.income  : [],
            chartExpense: _cd ? _cd.expense : [],
            chartActive:  _cd ? _cd.active  : [],
            reportRows: (_snap && _snap.reportRows) || document.querySelectorAll('#reportList tr').length,
            historicalSnapshot: _snap,
            lastSummary: st._lastSummaryNumbers || null,
            lastDashboardRefreshReason: st._lastDashboardRefreshReason || '',
            lastDashboardRefreshAt: st._lastDashboardRefreshAt || null,
            lastDashboardHistoryFetchAt: st._lastDashboardHistoryFetchAt || null,
            lastDashboardHistoryReason:  st._lastDashboardHistoryReason  || '',
            hasRefreshDashboardComputation: typeof window.refreshDashboardComputation === 'function',
            hasFetchMonthStats:             typeof window.fetchMonthStats             === 'function',
            hasFetchHistoricalFallback:     typeof window.fetchHistoricalDashboardFallback === 'function',
            hasRefreshDashboardHistory:     typeof window.refreshDashboardHistory     === 'function',
        };
        console.table(result);
        return result;
    };
}

export function initDashboard() {
    // Expose chart accessors cho debug / các module khác
    window.getFinanceChart = () => _getFinChart();
    window.getMemberChart  = () => _getMemChart();

    // ── Phase 4K-5N: normalizeBranchCodeForStats ─────────────────────────────
    window.normalizeBranchCodeForStats = function(branchInput, branchCount) {
        const cfg = (window.__store && window.__store.clubConfig) || window.clubConfig || {};
        const raw = String(branchInput || '').trim();
        if (!raw) return 'CS1';

        const m = raw.match(/^CS(\d+)$/i);
        if (m) {
            const n = Number(m[1]);
            if (n >= 1 && n <= (branchCount || cfg.branchCount || 10)) return 'CS' + n;
        }

        const norm = typeof window.normalizeVNForSearch === 'function'
            ? window.normalizeVNForSearch(raw)
            : raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

        const count = Number(branchCount || cfg.branchCount || 10);
        for (let i = 1; i <= count; i++) {
            const code = 'CS' + i;
            const name = cfg['branchName' + i] || ('Cơ sở ' + i);
            const normName = typeof window.normalizeVNForSearch === 'function'
                ? window.normalizeVNForSearch(name)
                : String(name).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
            if (norm === normName) return code;
            if (norm === ('co so ' + i)) return code;
            if (norm === ('coso ' + i)) return code;
        }
        return raw.startsWith('CS') ? raw : 'CS1';
    };

    // ── Phase 4K-5N: getComponentAmountForSelectedMonth ──────────────────────
    window.getComponentAmountForSelectedMonth = function(component, selectedMonth) {
        const c = component || {};
        const kind = c.kind || '';
        const amount = Number(c.amount || 0);
        const month = String(selectedMonth || '').slice(0, 7);
        if (!amount || !month) return 0;

        if (kind === 'tuition') {
            const months = Array.isArray(c.packageMonths)
                ? c.packageMonths.map(m => String(m).slice(0, 7))
                : [];
            if (months.length > 0) {
                return months.includes(month) ? amount / months.length : 0;
            }
            const cm = String(c.month || c.txMonth || '').slice(0, 7);
            return cm === month ? amount : 0;
        }

        // exam / inventory / other: tính theo month/txMonth/date
        const cm = String(c.month || c.txMonth || c.date || '').slice(0, 7);
        if (!cm || cm === month) return amount;
        return 0;
    };

    // ── Phase 4K-5N: refreshDashboardBranchStatsFullMonth ────────────────────
    window.refreshDashboardBranchStatsFullMonth = async function(selectedMonth) {
        const month = selectedMonth || (document.getElementById('filterMonth') || {}).value || '';
        if (!month) return;
        if (typeof window.loadTransactionsForMonthsInclusive !== 'function') return;

        // Ưu tiên dùng allTransactions nếu đã đủ
        const st = window.__store || {};
        const existingTxs = Array.isArray(st.allTransactions) ? st.allTransactions : null;
        const txs = existingTxs && existingTxs.length > 0
            ? existingTxs
            : await window.loadTransactionsForMonthsInclusive([month], 'dashboard-branch-full-month');

        const cfg    = st.clubConfig || window.clubConfig || {};
        const bCount = cfg.branchCount || 1;
        const bStats = {}, bExamStats = {};
        for (let bi = 1; bi <= bCount; bi++) {
            bStats['CS' + bi]     = { income: 0, active: 0, debt: 0, tuitionMap: {}, examFeeMap: {} };
            bExamStats['CS' + bi] = 0;
        }

        txs.forEach(function(t) {
            if (typeof window.txMatchesSelectedMonth === 'function') {
                if (!window.txMatchesSelectedMonth(t, month)) return;
            }
            if (t.type === 'Chi phí' || t.type === 'Chi phí kỳ thi') return;

            const comps = typeof window.getAccountingComponents === 'function'
                ? window.getAccountingComponents(t)
                : (typeof window.expandTransactionComponentsForAccounting === 'function'
                    ? window.expandTransactionComponentsForAccounting(t)
                    : (Array.isArray(t.components) ? t.components : []));

            let usedComps = false;
            if (Array.isArray(comps) && comps.length > 0) {
                usedComps = true;
                comps.forEach(function(c) {
                    const ck = c.kind || '';
                    const ca = Number(c.amount || 0);
                    if (ca <= 0) return;
                    const cBr = window.normalizeBranchCodeForStats(c.branch || t.branch || 'CS1', bCount);
                    if (!bStats[cBr]) { bStats[cBr] = { income: 0, active: 0, debt: 0, tuitionMap: {}, examFeeMap: {} }; }
                    if (bExamStats[cBr] === undefined) bExamStats[cBr] = 0;
                    const amtM = window.getComponentAmountForSelectedMonth(c, month);
                    if (ck === 'tuition') {
                        if (amtM <= 0) return;
                        bStats[cBr].income += amtM;
                        const fk = Math.round(Array.isArray(c.packageMonths) && c.packageMonths.length > 1 ? ca / c.packageMonths.length : ca);
                        if (fk > 0) bStats[cBr].tuitionMap[fk] = (bStats[cBr].tuitionMap[fk] || 0) + 1;
                    } else if (ck === 'exam') {
                        const cm2 = String(c.month || c.txMonth || t.txMonth || t.date || '').slice(0, 7);
                        if (month && cm2 && cm2 !== month) return;
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

            if (!usedComps) {
                const br = window.normalizeBranchCodeForStats(t.branch || 'CS1', bCount);
                if (!bStats[br]) { bStats[br] = { income: 0, active: 0, debt: 0, tuitionMap: {}, examFeeMap: {} }; }
                if (bExamStats[br] === undefined) bExamStats[br] = 0;
                let alloc = Number(t.amount) || 0;
                if (t.type === 'Học phí') {
                    alloc = t.packageMonths && t.packageMonths.length > 1 ? alloc / t.packageMonths.length : alloc;
                    bStats[br].income += alloc;
                    const tf = Math.round(Number(t.amount) || 0);
                    if (tf > 0) bStats[br].tuitionMap[tf] = (bStats[br].tuitionMap[tf] || 0) + 1;
                } else if (t.type === 'Học phí + Lệ phí thi') {
                    const ta = Number(t.tuitionAmount) || 0;
                    const ea = Number(t.examAmount) || 0;
                    bStats[br].income += ta + ea;
                    if (ta > 0) bStats[br].tuitionMap[Math.round(ta)] = (bStats[br].tuitionMap[Math.round(ta)] || 0) + 1;
                    if (ea > 0) { bStats[br].examFeeMap[Math.round(ea)] = (bStats[br].examFeeMap[Math.round(ea)] || 0) + 1; bExamStats[br] += ea; }
                } else if (t.type === 'Lệ phí thi') {
                    bStats[br].income += alloc;
                    const ek = Math.round(alloc);
                    if (ek > 0) { bStats[br].examFeeMap[ek] = (bStats[br].examFeeMap[ek] || 0) + 1; bExamStats[br] += alloc; }
                } else {
                    bStats[br].income += alloc;
                }
            }
        });

        // ── Phase 4K-5P: Override exam branch stats with canonical ledger ────
        const examBranchLedger = typeof window.buildCanonicalExamBranchLedger === 'function'
            ? window.buildCanonicalExamBranchLedger({
                month,
                transactions: txs
            })
            : null;

        if (examBranchLedger && examBranchLedger.branchMap) {
            Object.keys(bStats).forEach(function(branch) {
                bStats[branch].examFeeMap = {};
                bStats[branch].examRegisteredCount = 0;
                bStats[branch].examRegisteredNames = [];
                bExamStats[branch] = 0;
            });

            Object.entries(examBranchLedger.branchMap).forEach(function([branch, info]) {
                if (!bStats[branch]) {
                    bStats[branch] = {
                        income: 0,
                        active: 0,
                        debt: 0,
                        tuitionMap: {},
                        examFeeMap: {}
                    };
                }
                bStats[branch].examFeeMap = Object.assign({}, info.feeMap || {});
                bStats[branch].examRegisteredCount = info.registeredCount || 0;
                bStats[branch].examRegisteredNames = info.names || [];
                bExamStats[branch] = info.totalAmount || 0;
            });
        }

        if (typeof window.renderBranchStats    === 'function') window.renderBranchStats(bStats);
        if (typeof window.renderExamBranchFees === 'function') window.renderExamBranchFees(bExamStats, Object.values(bExamStats).reduce((a, b) => a + b, 0));
        if (st) {
            st._lastBStats     = bStats;
            st._lastBExamStats = bExamStats;
        }
    };

    // ── Phase 4K-5N: debugDashboardBranchRevenue ─────────────────────────────
    window.debugDashboardBranchRevenue = function() {
        const st = window.__store || {};
        const bStats    = st._lastBStats    || {};
        const bExamStats = st._lastBExamStats || {};
        const txs =
            Array.isArray(st.allTransactions)    ? st.allTransactions    :
            Array.isArray(window.allTransactions) ? window.allTransactions :
            Array.isArray(st.transactions)        ? st.transactions        :
            [];

        const rows = Object.entries(bStats).map(([branch, data]) => ({
            branch,
            income:      data.income     || 0,
            active:      data.active     || 0,
            debt:        data.debt       || 0,
            tuitionMap:  JSON.stringify(data.tuitionMap  || {}),
            examFeeMap:  JSON.stringify(data.examFeeMap  || {}),
            examTotal:   bExamStats[branch] || 0,
        }));

        const componentRows = txs
            .filter(t => Array.isArray(t.components) && t.components.length)
            .map(t => ({
                id:         t.id || t.txId || '',
                student:    t.studentName || t.description || '',
                type:       t.type,
                branchRaw:  t.branch,
                branchNorm: window.normalizeBranchCodeForStats
                    ? window.normalizeBranchCodeForStats(t.branch)
                    : t.branch,
                components: t.components.map(c => c.kind + ':' + c.amount + ':' + (c.branch || t.branch)).join(' | '),
            }));

        console.table(rows);
        console.table(componentRows);
        return { rows, componentRows, bStats, bExamStats };
    };

    // ── Phase 4K-5N: debugDashboardCharts ────────────────────────────────────
    window.debugDashboardCharts = function() {
        const Chart  = window.Chart;
        const finEl  = document.getElementById('financeChart');
        const memEl  = document.getElementById('memberChart');
        const fc = _getFinChart();
        const mc = _getMemChart();
        const finOnCanvas  = Chart && finEl ? !!(Chart.getChart && Chart.getChart(finEl)) : false;
        const memOnCanvas  = Chart && memEl ? !!(Chart.getChart && Chart.getChart(memEl)) : false;
        const result = {
            hasChartJs:         !!Chart,
            hasChartGetChart:   !!(Chart && typeof Chart.getChart === 'function'),
            financeChartStore:  !!fc,
            financeChartOnCanvas: finOnCanvas,
            memberChartStore:   !!mc,
            memberChartOnCanvas: memOnCanvas,
            storeMatchCanvas: (!!fc === finOnCanvas) && (!!mc === memOnCanvas),
        };
        console.table(result);
        return result;
    };

    // Expose fetchMonthStats để app.js và các modules khác có thể gọi
    window.fetchMonthStats = fetchMonthStats;

    // [Phase 4K-FIX Lỗi 4] Expose tryApplyCurrentMonthStats — gọi từ render.js
    // sau khi sync render từ allTransactions để ưu tiên stats doc cho tổng thu/chi
    window.tryApplyCurrentMonthStats = tryApplyCurrentMonthStats;

    // [GITHUB-FIX Task 1] Expose dashboard render functions cho renderDashboard.js
    // và listComputationRefresh.js — thiếu dòng này → dashboard summary no-op
    window.renderDashboardCharts = renderDashboardCharts;
    window.renderBranchStats     = renderBranchStats;
    window.renderExamBranchFees  = renderExamBranchFees;
    window.updateSummaryNumbers  = updateSummaryNumbers;

    // Module-level namespace (cho diagnostics và cross-module access)
    window._moduleDashboard = {
        renderDashboardCharts,
        renderBranchStats,
        renderExamBranchFees,
        updateSummaryNumbers,
        fetchMonthStats,
        tryApplyCurrentMonthStats,
        fetchHistoricalDashboardFallback,
        scheduleDashboardHistoryFetch,
        getCanonicalStatsSnapshot: getDashboardCanonicalStatsSnapshot,
        markStatsDirty: markDashboardStatsDirty,
        reconcileHydrationEvidence: reconcileDashboardHydrationEvidence,
        resetFreshness: resetDashboardStatsFreshness,
        getLocalMonth: _getDashboardLocalMonth,
        getFreshnessState: () => ({
            revision: _dashboardStatsFreshness.revision,
            dirtyMonths: Array.from(_dashboardStatsFreshness.dirtyMonths.values()).map(item => ({
                ...item,
                domains: [...(item.domains || [])],
            })),
            hydration: {
                finance: Array.from(_dashboardStatsFreshness.hydration.finance.values()).map(item => ({ ...item, evidence: { ...(item.evidence || {}) } })),
                members: Array.from(_dashboardStatsFreshness.hydration.members.values()).map(item => ({ ...item, evidence: { ...(item.evidence || {}) } })),
            },
            identity: { ..._dashboardStatsFreshness.identity },
            retryBackoffMs: _DASHBOARD_DIRTY_RETRY_BACKOFF_MS,
            lastReason: _dashboardStatsFreshness.lastReason,
            lastDirtyAt: _dashboardStatsFreshness.lastDirtyAt,
        }),
        shouldApplyCanonicalCurrentMonth: _shouldApplyCanonicalCurrentMonth,
        printSparkReadMetrics,
        normalizeBranchCodeForStats:         window.normalizeBranchCodeForStats,
        getComponentAmountForSelectedMonth:  window.getComponentAmountForSelectedMonth,
        refreshDashboardBranchStatsFullMonth: window.refreshDashboardBranchStatsFullMonth,
        debugDashboardBranchRevenue:         window.debugDashboardBranchRevenue,
        debugDashboardCharts:                window.debugDashboardCharts,
    };

    // [Part 4 FIX] Expose historical fallback so refreshDashboardComputation can call it
    window.fetchHistoricalDashboardFallback = fetchHistoricalDashboardFallback;
    window.scheduleDashboardHistoryFetch = scheduleDashboardHistoryFetch;
    window.printSparkReadMetrics = printSparkReadMetrics;

    // [Part 5 FIX] Register debug function
    registerDebugDashboardHistory();

    // Cleanup khi logout — gọi từ store.resetStore()
    window._destroyDashboardCharts = () => {
        const fc = _getFinChart();
        const mc = _getMemChart();
        if (fc) { try { fc.destroy(); } catch (_e) {} }
        if (mc) { try { mc.destroy(); } catch (_e) {} }
        _setFinChart(null);
        _setMemChart(null);
    };

    console.info('[dashboard.js] ✅ Phase 4K-6V5U6C2 (hydration/mutation guard + unresolved dirty read backoff)');
}
