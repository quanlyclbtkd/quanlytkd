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
 * PHASE 3 UPGRADE:
 *   fetchAndRenderHistoricalCharts() — đọc stats docs từ Firestore để vẽ
 *   biểu đồ 6 tháng mà KHÔNG cần load toàn bộ transactions.
 *   Path: clubs/{clubId}/stats/{YYYY_MM} (doc ID dùng '_' thay '-')
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

// ════════════════════════════════════════════════════════════════
// renderDashboardCharts — tạo hoặc update 2 Chart.js instances
// chartData: { labels, income, expense, active }
// ════════════════════════════════════════════════════════════════
export function renderDashboardCharts(chartData) {
    const { labels, income, expense, active } = chartData;
    const Chart = window.Chart;
    if (!Chart) return;

    // ── Finance chart (bar: Thu / Chi) ───────────────────────────
    const finEl = document.getElementById('financeChart');
    if (finEl) {
        let fc = _getFinChart();
        if (fc) {
            fc.data.labels             = labels;
            fc.data.datasets[0].data  = income;
            fc.data.datasets[1].data  = expense;
            fc.update('none');
        } else {
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
        }
    }

    // ── Member chart (line: Võ sinh đang tập) ────────────────────
    const memEl = document.getElementById('memberChart');
    if (memEl) {
        let mc = _getMemChart();
        if (mc) {
            mc.data.labels            = labels;
            mc.data.datasets[0].data = active;
            mc.update('none');
        } else {
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
        }
    }
}

// ════════════════════════════════════════════════════════════════
// renderBranchStats — bảng thống kê per-cơ-sở
// bStats: { CS1: { income, active, debt, tuitionMap, examFeeMap }, ... }
// ════════════════════════════════════════════════════════════════
export function renderBranchStats(bStats) {
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
                </div>
            </div>${feeBreakdown}
        </div>`;
    }
    bsGrid.innerHTML = html;
}

// ════════════════════════════════════════════════════════════════
// renderExamBranchFees — lệ phí thi theo cơ sở (tab Exam)
// ════════════════════════════════════════════════════════════════
export function renderExamBranchFees(bExamStats, incExam) {
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
    // Lấy Firebase SDK và db instance từ bridge (CDN-based SDK)
    const sdk   = window._fb_init || {};
    const store = window.__store  || {};
    const db    = store.db;

    // Không có SDK hoặc db → bỏ qua (không throw để silent fail)
    if (!sdk.doc || !sdk.getDoc || !db) return;
    if (!historicalMonths || historicalMonths.length === 0) return;

    const clubId = store.clubId || store.currentClubId;
    if (!clubId) return;

    const { doc, getDoc } = sdk;

    // Đọc song song tất cả stats docs (Promise.all để tối thiểu latency)
    const reads = historicalMonths.map(({ month, idx }) => {
        const docId = month.replace('-', '_');
        return getDoc(doc(db, 'clubs', clubId, 'stats', docId))
            .then(snap => ({ snap, idx, month }))
            .catch(() => ({ snap: null, idx, month })); // bỏ qua lỗi từng doc
    });

    const results = await Promise.all(reads);

    // Kiểm tra có dữ liệu mới không để tránh update chart vô ích
    let hasNewData = false;

    for (const { snap, idx } of results) {
        if (!snap || !snap.exists()) continue; // Stats doc chưa tồn tại → giữ 0

        const d = snap.data();
        // [Phase 4K] Track stats doc reads for diagnostics
        if (window.__txListenerMetrics) {
            window.__txListenerMetrics.dashboardStatsRead = (window.__txListenerMetrics.dashboardStatsRead || 0) + 1;
        }
        // income.total và expense.total được Cloud Function tính sẵn
        const inc = Number(d['income.total'] || d?.income?.total || 0);
        const exp = Number(d['expense.total'] || d?.expense?.total || 0);

        if (chartIncome[idx]  !== inc || chartExpense[idx] !== exp) {
            chartIncome[idx]  = inc;
            chartExpense[idx] = exp;
            hasNewData = true;
        }
    }

    // Chỉ update chart nếu thực sự có dữ liệu mới
    if (!hasNewData) return;

    // Cập nhật Chart.js instances (đã tồn tại từ renderDashboardCharts)
    const fc = _getFinChart();
    if (fc) {
        fc.data.datasets[0].data = [...chartIncome];
        fc.data.datasets[1].data = [...chartExpense];
        fc.update('active'); // dùng animation 'active' cho UX mượt mà hơn 'none'
    }

    // Lưu updated chart data vào store để các module khác dùng được
    if (window.__store && window.__store.tabHtmlCache) {
        const cd = window.__store.tabHtmlCache._chartData;
        if (cd) {
            cd.income  = [...chartIncome];
            cd.expense = [...chartExpense];
        }
    }
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
    if (!selMonth) return;
    const stats = await fetchMonthStats(selMonth);
    if (!stats) return; // stats doc chưa tồn tại — giữ allTransactions-based numbers

    // Đọc income.total tương thích nhiều format (Cloud Functions ghi flat 'income.total')
    const incTotal = (
        Number(stats['income.total'] || 0) ||
        Number(stats?.income?.total  || 0) ||
        0
    );
    const expTotal = (
        Number(stats['expense.total'] || 0) ||
        Number(stats?.expense?.total  || 0) ||
        0
    );

    // Nếu cả 2 đều = 0 và txCount = 0 → stats doc chưa có dữ liệu thực
    if (incTotal === 0 && expTotal === 0 && (stats.txCount || 0) === 0) return;

    // Override dashboard totals với stats doc numbers (chính xác hơn allTransactions limit)
    const _fmt = (n) => (Number(n) || 0).toLocaleString();
    const _set = (id, val) => { const e = document.getElementById(id); if (e) e.innerText = val; };

    _set('totalIncomeDashboard',  _fmt(incTotal)             + ' ₫');
    _set('totalExpenseDashboard', _fmt(expTotal)             + ' ₫');
    _set('totalProfitDashboard',  _fmt(incTotal - expTotal)  + ' ₫');

    // Track metric
    if (window.__txListenerMetrics) {
        window.__txListenerMetrics.dashboardCurrentMonthStatsRead =
            (window.__txListenerMetrics.dashboardCurrentMonthStatsRead || 0) + 1;
    }

    // Mobile header bar income
    const mhbInc = document.getElementById('mhbIncome');
    if (mhbInc && incTotal > 0) {
        const _fmtK = (n) => n >= 1e6 ? Math.round(n/1e3) + 'K' : n.toLocaleString();
        mhbInc.innerText = _fmtK(incTotal);
    }
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

export async function fetchHistoricalDashboardFallback(selMonth, reason) {
    const sdk   = window._fb_init || {};
    const store = window.__store  || {};
    const db    = store.db;

    if (!sdk.doc || !sdk.getDoc || !sdk.getDocs || !sdk.query || !sdk.collection || !db) return;

    const clubId = store.clubId || store.currentClubId;
    if (!clubId) return;

    const { doc, getDoc, getDocs, query, collection, where } = sdk;

    // Build 6-month window ending at selMonth
    const [sy, sm] = selMonth.split('-').map(Number);
    const months = [];
    for (let i = 0; i < 6; i++) {
        let m = sm - i, y = sy;
        if (m <= 0) { m += 12; y -= 1; }
        months.push({ month: `${y}-${String(m).padStart(2, '0')}`, idx: 5 - i });
    }
    // months[0].idx = 0 (oldest), months[5].idx = 5 (current)

    const labels  = months.map(({ month }) => {
        const [y, m] = month.split('-');
        return `T${Number(m)}/${y}`;
    });
    const income  = Array(6).fill(0);
    const expense = Array(6).fill(0);
    const active  = Array(6).fill(0);

    let reportRows = '';

    // Read all stats docs in parallel
    const statReads = months.map(({ month, idx }) => {
        const docId = month.replace('-', '_');
        return getDoc(doc(db, 'clubs', clubId, 'stats', docId))
            .then(snap => ({ snap, month, idx }))
            .catch(() => ({ snap: null, month, idx }));
    });

    const statResults = await Promise.all(statReads);

    // For months with missing stats docs, fall back to querying transactions
    const fallbackPromises = statResults.map(async ({ snap, month, idx }) => {
        let inc = 0, exp = 0, act = 0, mNew = 0, mQuit = 0;
        let hasStat = false;

        if (snap && snap.exists()) {
            const d = snap.data();
            inc    = Number(d['income.total']    || (d.income  && d.income.total)  || 0);
            exp    = Number(d['expense.total']   || (d.expense && d.expense.total) || 0);
            act    = Number(d['members.active']  || (d.members && d.members.active) || 0);
            mNew   = Number(d['members.new']     || (d.members && d.members.new)   || 0);
            mQuit  = Number(d['members.quit']    || (d.members && d.members.quit)  || 0);
            hasStat = true;
        }

        if (!hasStat) {
            // Fallback: scan transactions for this month
            console.info('[dashboard-history] missing stats doc for', month, '— reading transactions fallback');
            try {
                const txRef = collection(db, 'clubs', clubId, 'transactions');
                const txSnap = await getDocs(query(txRef, where('txMonth', '==', month)));
                txSnap.forEach(d => {
                    const tx = d.data();
                    const amt = Number(tx.amount || tx.soTien || 0);
                    if (tx.type === 'expense' || tx.loai === 'expense' || tx.loai === 'chi') {
                        exp += amt;
                    } else {
                        inc += amt;
                    }
                });
            } catch (_txErr) {
                // Non-blocking — silent fail
            }
        }

        income[idx]  = inc;
        expense[idx] = exp;
        active[idx]  = act;

        const profit     = inc - exp;
        const label      = labels[idx];
        const profitCls  = profit < 0 ? 'text-rose-600' : 'text-emerald-600';
        const isCurrent  = month === selMonth;
        const rowClass   = isCurrent ? 'class="font-black text-primary"' : '';

        reportRows += `<tr><td ${rowClass}>${label}</td>` +
            `<td class="text-slate-800 font-bold text-base">${act || '-'}</td>` +
            `<td class="text-emerald-600 font-medium">+${mNew}</td>` +
            `<td class="text-rose-600 font-medium">-${mQuit}</td>` +
            `<td class="text-emerald-600 font-bold">${inc.toLocaleString()} ₫</td>` +
            `<td class="text-rose-600 font-bold">${exp.toLocaleString()} ₫</td>` +
            `<td class="${profitCls} font-black text-base bg-slate-50">${profit.toLocaleString()} ₫</td></tr>`;
    });

    await Promise.all(fallbackPromises);

    const chartData = { labels, income, expense, active };

    // Update cache with full historical data
    if (typeof cacheDashboardData === 'function') {
        const existing = (window.__store && window.__store.tabHtmlCache) || {};
        cacheDashboardData({
            reportHtml:  reportRows,
            chartData,
            bStats:      (window.__store && window.__store._lastBStats)    || {},
            bExamStats:  (window.__store && window.__store._lastBExamStats) || {},
            summaryNumbers: (window.__store && window.__store._lastSummaryNumbers) || {},
        });
    }

    // Update live Chart.js instances if they exist
    if (typeof renderDashboardCharts === 'function') {
        try { renderDashboardCharts(chartData); } catch (_) {}
    }

    // Also update via window for safety
    if (typeof window.renderDashboardCharts === 'function') {
        try { window.renderDashboardCharts(chartData); } catch (_) {}
    }

    // Update #reportList DOM directly if visible
    const reportList = document.getElementById('reportList');
    if (reportList && reportRows) {
        reportList.innerHTML = reportRows;
    }

    // Update in-store chartData so future renders use historical data
    if (window.__store && window.__store.tabHtmlCache) {
        window.__store.tabHtmlCache._chartData = chartData;
        window.__store._lastDashboardHistoryFetchAt = Date.now();
        window.__store._lastDashboardHistoryReason  = reason || 'history-fallback';
    }
}

// ════════════════════════════════════════════════════════════════
// debugDashboardHistory — Part 5: console diagnostic
// Usage: await window.debugDashboardHistory()
// ════════════════════════════════════════════════════════════════

export function registerDebugDashboardHistory() {
    window.debugDashboardHistory = async function debugDashboardHistory() {
        const st = window.__store || {};
        const result = {
            clubId:     st.clubId || st.currentClubId || '',
            selectedMonth: (document.getElementById('monthPicker') || {}).value || st.selectedMonth || '',
            hasChartJs: !!window.Chart,
            hasFinanceChart: !!(window.getFinanceChart && window.getFinanceChart()),
            hasMemberChart:  !!(window.getMemberChart  && window.getMemberChart()),
            chartData: st.tabHtmlCache && st.tabHtmlCache._chartData || null,
            reportRows: document.querySelectorAll('#reportList tr').length,
            lastSummary: st._lastSummaryNumbers || null,
            lastDashboardRefreshReason: st._lastDashboardRefreshReason || '',
            lastDashboardRefreshAt: st._lastDashboardRefreshAt || null,
            lastHistoryFetchAt: st._lastDashboardHistoryFetchAt || null,
            hasRefreshDashboardComputation: typeof window.refreshDashboardComputation === 'function',
            hasFetchMonthStats:             typeof window.fetchMonthStats             === 'function',
            hasFetchHistoricalFallback:     typeof window.fetchHistoricalDashboardFallback === 'function',
            prevGuardState: {
                lastSummaryNumbers: st._lastSummaryNumbers || null,
            },
        };
        console.table(result);
        return result;
    };
}

export function initDashboard() {
    // Expose chart accessors cho debug / các module khác
    window.getFinanceChart = () => _getFinChart();
    window.getMemberChart  = () => _getMemChart();

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
    };

    // [Part 4 FIX] Expose historical fallback so refreshDashboardComputation can call it
    window.fetchHistoricalDashboardFallback = fetchHistoricalDashboardFallback;

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

    console.info('[dashboard.js] ✅ Phase 2c + Phase 3 (fetchAndRenderHistoricalCharts + fetchMonthStats)');
}
