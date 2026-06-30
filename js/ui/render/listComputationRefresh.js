/**
 * listComputationRefresh.js — Phase 3.5E List-Level Computation Refresh
 *
 * Vấn đề Phase 3.5D giới thiệu:
 *   invalidateList(key) gọi runRender(key) để schedule island render.
 *   Island render (renderActiveIsland, v.v.) chỉ ĐỌC từ computation cache
 *   (getStudentsCachedHtml, getFinanceCachedHtml, ...).
 *   Cache này chỉ được refresh khi computeAndCacheXxx() được gọi — tức là
 *   trong renderApp() cycle đầy đủ.
 *
 *   Nếu invalidateList() được gọi SAU _loadMore() (activePage tăng,
 *   _dataVersion tăng), cache cũ vẫn có HTML của trang cũ → island render
 *   sẽ hiển thị HTML cũ (stale).
 *
 * Giải pháp Phase 3.5E:
 *   Trước khi runRender(key), gọi refreshListComputation(key) để:
 *   1. Xác định computation domain của key (finance / students / inventory / ...)
 *   2. Gọi computeAndCacheXxx() với params hiện tại từ DOM / window.__store
 *   3. Cache miss tự nhiên (paramsKey + _dataVersion mismatch) → recompute ✅
 *   4. Island render sau đó đọc cache mới → hiển thị đúng
 *
 * Thiết kế:
 *   - Đọc params tại call-time (không stale closure)
 *   - Cache bust dựa vào paramsKey + _dataVersion mismatch (không force-invalidate sections)
 *   - refreshListsComputation() dedupe theo domain: nhiều keys cùng domain → compute 1 lần
 *   - Dashboard + attendance không có computation cache riêng → trả false (fallback)
 *   - Không circular import: không import renderInvalidation.js hay render.js
 *   - Metrics ghi vào window.__renderLegacyMetrics (khởi tạo lazy)
 *
 * KHÔNG:
 *   - Rewrite renderApp() hay computation renderers
 *   - Duplicate business logic
 *   - Thay đổi kết quả tính toán
 *   - Gây circular dependency
 *
 * @module listComputationRefresh
 * @phase 3.5E
 */

import {
    computeAndCacheFinance,
    getFinanceSummary,
} from './computation/financeRenderer.js';
import {
    computeAndCacheStudents,
    getStudentsSummary,
} from './computation/studentsRenderer.js?v=coach-attendance-root-cause-recovery-20260630-v4d6';
import {
    computeAndCacheInventory,
    getCachedUnpaidInvCount,
} from './computation/inventoryRenderer.js';
import {
    invalidateDashboardCache,
    cacheDashboardData,
} from './computation/dashboardRenderer.js';
import { formatMonth } from '../../utils/format.js';

// ── List key → computation domain mapping ─────────────────────────────────────
//
// Map list key sang computation domain để biết cache nào cần refresh.
// Domain invalidation (invalidateFinance, v.v.) vẫn dùng cho data change lớn.
// Mapping này chỉ dùng cho list-level refresh (pagination, loadMore, v.v.).
//
export const LIST_TO_COMPUTATION_DOMAIN = {
    // Finance domain
    'tx.txList':               'finance',
    'finance.expenseList':     'finance',
    'finance.examExpenseList': 'finance',
    // Students domain
    'students.activeList':     'students',
    'students.debtList':       'students',
    'students.quitList':       'students',
    // Inventory domain
    'inventory.inventoryList': 'inventory',
    'inventory.uniformTxList': 'inventory',
    // Attendance — không có computation cache riêng → fallback
    'attendance.list':         'attendance',
    'attendance.monthly':      'attendance',
    // Dashboard — phụ thuộc finance + students → partial recompute không an toàn → fallback
    'dashboard.reportList':    'dashboard',
    'dashboard.summary':       'dashboard',
    'dashboard.charts':        'dashboard',
    'dashboard.branchStats':   'dashboard',
};

// ── Slow render threshold ─────────────────────────────────────────────────────
// Phase 4K-6V4B12: 638+ profiles can legitimately take ~20–45ms on mobile/low-end CPUs.
// 16ms was useful during development but too noisy in production. Keep a severe
// threshold and combine it with refresh coalescing below.
const _SLOW_MS = 64;

// ── Throttled slow-render warning ─────────────────────────────────────────────
const _slowThrottle = {}; // { [domain]: lastWarnTimestamp }
const _SLOW_THROTTLE_MS = 3000;


// Phase 4K-6V4B12 — Same-tick refresh coalescing.
// Many UI handlers call refreshListsComputation([...]) and then invalidateList() /
// invalidateCurrentTab(), which used to recompute the same domain twice in the same
// interaction. This helper reuses a just-refreshed domain when params + dataVersion
// are unchanged, removing noisy repeated Slow computation warnings without hiding
// real data changes.
const _RECENT_REFRESH_REUSE_MS = 250;
const _recentRefreshByDomain = Object.create(null); // { [domain]: { signature, at, reason } }

function _isDebugPerfEnabled() {
    try {
        const h = window.location && window.location.hostname || '';
        return !!window.__ENABLE_PERF_WARNINGS || h === 'localhost' || h === '127.0.0.1' || h.endsWith('.replit.dev');
    } catch (_) { return false; }
}

function _arrayLen(v) { return Array.isArray(v) ? v.length : 0; }
function _objLen(v) { try { return v && typeof v === 'object' ? Object.keys(v).length : 0; } catch (_) { return 0; } }

function _domainSignature(domain) {
    const st  = window.__store || {};
    const cfg = _getConfig() || {};
    const base = [
        domain,
        st._dataVersion || 0,
        _getCurTabId(),
        _getSelMonth(),
        _getSelBranch(),
        _getSearch(),
        _getRole(),
        cfg.branchCount || 1,
    ];
    if (domain === 'students') {
        const pg = (st.pagination && st.pagination.students) || {};
        base.push(
            'profiles:' + _objLen(_getProfiles()),
            'pgv:' + (st._studentsPaginationVersion || 0),
            'pgc:' + _arrayLen(pg.currentItems),
            'pgp:' + (pg.currentPage || 0),
            'searchActive:' + (pg.searchActive ? 1 : 0),
            'searchQuery:' + (pg.searchQuery || ''),
            'arl:' + (window.__activeRenderLimit || 50),
            'drl:' + (window.__debtRenderLimit || 50),
            'qrl:' + (window.__quitRenderLimit || 50),
            'ap:' + (window._activePage || 1),
            'dp:' + (window._debtPage || 1),
            'qp:' + (window._quitPage || 1),
            'debtFilter:' + (st._debtOverdueFilter || ''),
            'activeNew:' + (typeof window.getActiveStudentNewFilter === 'function' ? window.getActiveStudentNewFilter() : (window.__activeStudentNewFilter || 'all'))
        );
    } else if (domain === 'finance') {
        base.push('tx:' + _arrayLen(_getTxs()), 'txpv:' + (st._transactionsPaginationVersion || 0));
    } else if (domain === 'inventory') {
        base.push('inv:' + _arrayLen(_getInv()), 'tx:' + _arrayLen(_getTxs()), 'invv:' + (st._inventoryPaginationVersion || 0));
    } else if (domain === 'dashboard') {
        base.push('profiles:' + _objLen(_getProfiles()), 'tx:' + _arrayLen(_getTxs()), 'inv:' + _arrayLen(_getInv()));
    }
    return base.join('|');
}

function _canReuseRecentRefresh(domain, signature) {
    try {
        if (!domain || !signature) return false;
        const prev = _recentRefreshByDomain[domain];
        if (!prev || prev.signature !== signature) return false;
        return (Date.now() - prev.at) <= _RECENT_REFRESH_REUSE_MS;
    } catch (_) { return false; }
}

function _markRecentRefresh(domain, signature, reason) {
    try {
        if (domain && signature) _recentRefreshByDomain[domain] = { signature, at: Date.now(), reason: reason || '' };
    } catch (_) {}
}

function _warnSlow(domain, ms) {
    try {
        if (!_isDebugPerfEnabled()) return;
        const now = Date.now();
        if (!_slowThrottle[domain] || now - _slowThrottle[domain] > _SLOW_THROTTLE_MS) {
            _slowThrottle[domain] = now;
            console.warn(
                `[ListComputationSlow] domain="${domain}" took ${ms.toFixed(1)}ms ` +
                `(budget: ${_SLOW_MS}ms @ 60fps). ` +
                `Xem xét debounce hoặc tối ưu computation.`
            );
        }
    } catch (_) {}
}

// ── Runtime DOM / store readers ───────────────────────────────────────────────
// Đọc tại call-time — không dùng closure để tránh stale values.

function _getCurTabId() {
    try {
        const el = document.querySelector('.tab-content.active');
        return el ? el.id.replace('tab_', '') : 'tx';
    } catch (_) { return 'tx'; }
}
function _getSelMonth()  {
    try { return document.getElementById('filterMonth')?.value  || ''; }
    catch (_) { return ''; }
}
function _getSelBranch() {
    try { return document.getElementById('filterBranch')?.value || 'all'; }
    catch (_) { return 'all'; }
}
// [PART 5 FIX] Giữ raw search — studentMatchesSearch/normalizeVNForSearch sẽ tự normalize
function _getSearch() {
    try { return (document.getElementById('searchInput')?.value || '').trim(); }
    catch (_) { return ''; }
}
function _getProfiles()  { return (window.__store || {}).profiles     || window.allProfiles     || {}; }
function _getTxs()       { return (window.__store || {}).transactions || window.allTransactions || []; }
function _getInv()       { return (window.__store || {}).inventory    || window.allInventory    || []; }
function _getConfig()    { return (window.__store || {}).clubConfig   || window.clubConfig      || {}; }
function _getRole()      { return (window.__store || {}).userRole     || window.userRole        || 'viewer'; }
function _getInvCats() {
    const custom = (window.__store || {}).invCustomCategories || [];
    return ['Võ phục', 'Áo thun', 'Bảo hộ', ...custom.map(c => c.name)];
}
function _getCatOrder() {
    const cats = _getInvCats();
    const order = { 'Võ phục': 0, 'Áo thun': 1, 'Bảo hộ': 2 };
    cats.slice(3).forEach((n, i) => { order[n] = 3 + i; });
    return order;
}

// ── Metrics helper ────────────────────────────────────────────────────────────
// Đọc + đảm bảo các field Phase 3.5E tồn tại trong metrics object.
// window.__renderLegacyMetrics được khởi tạo bởi renderInvalidation.js trước.
function _metrics() {
    const m = window.__renderLegacyMetrics;
    if (!m) return null;
    // Lazy-init Phase 3.5E fields
    if (m.listComputationRefreshCalls     === undefined) m.listComputationRefreshCalls     = 0;
    if (!m.listComputationRefreshByDomain)               m.listComputationRefreshByDomain  = {};
    if (m.listComputationRefreshFallbacks === undefined) m.listComputationRefreshFallbacks = 0;
    if (m.listComputationRefreshFailures  === undefined) m.listComputationRefreshFailures  = 0;
    if (!m.listComputationRefreshDuration)               m.listComputationRefreshDuration  = {};
    if (!m.listRenderVersions)                           m.listRenderVersions              = {};
    return m;
}

// ── Per-domain computation helpers ────────────────────────────────────────────
//
// Mỗi hàm _refreshXxx() gọi computeAndCacheXxx() với params đọc tại call-time.
// Cache miss tự nhiên khi paramsKey hoặc _dataVersion thay đổi (ví dụ sau
// _loadMore: _activePage tăng → paramsKey khác → cache miss → recompute).
//
// Nếu paramsKey + _dataVersion KHÔNG thay đổi (data và UI giống hệt):
//   → cache hit → không recompute → trả về HTML từ cache cũ (vẫn đúng vì data chưa đổi)

function _refreshFinance() {
    const bCount = _getConfig().branchCount || 1;
    computeAndCacheFinance(_getTxs(), {
        curTabId:      _getCurTabId(),
        selBranch:     _getSelBranch(),
        search:        _getSearch(),
        isSingleBranch: bCount <= 1,
        isAdmin:       _getRole() === 'admin',
        invCats:       _getInvCats(),
        bCount,
    });
}

function _refreshStudents() {
    // bStats được finance renderer tính ra (branch active/debt counts).
    // Trong loadMore scenario, finance data không thay đổi → lấy từ cache hiện có.
    // Không recompute finance ở đây để tránh double computation.
    const finSummary = getFinanceSummary() || {};
    const bStats     = finSummary.bStats || {};

    const pg       = (window.__store?.pagination?.students) || null;
    const pgActive = !!(pg?.enabled && Array.isArray(pg.currentItems) && pg.currentItems.length > 0);
    const bCount   = _getConfig().branchCount || 1;

    computeAndCacheStudents(_getProfiles(), {
        curTabId:       _getCurTabId(),
        selMonth:       _getSelMonth(),
        selBranch:      _getSelBranch(),
        search:         _getSearch(),
        isSingleBranch: bCount <= 1,
        isAdmin:        _getRole() === 'admin',
        bStats,
        pgStudents:       pg,
        pgStudentsActive: pgActive,
        activePage: window._activePage || 1,
        debtPage:   window._debtPage   || 1,
        quitPage:   window._quitPage   || 1,
    });
}

function _refreshInventory() {
    computeAndCacheInventory(_getInv(), _getTxs(), {
        curTabId: _getCurTabId(),
        search:   _getSearch(),
        isAdmin:  _getRole() === 'admin',
        invCats:  _getInvCats(),
        catOrder: _getCatOrder(),
    });
}

// ── Phase 4K-GITHUB-SUMMARY-BADGE-FIX ────────────────────────────────────────
// Domain invalidation refreshes finance/students caches but used to leave
// dashboard summary cache empty/dirty. This helper derives the lightweight
// summary from current computation caches and applies it globally, because
// tab badges (HỌC PHÍ/BÁO NỢ/ĐANG TẬP) are outside the dashboard tab.
function _cacheAndApplyDashboardSummary(reason) {
    const fin = getFinanceSummary();
    const std = getStudentsSummary();
    const prev = (window.__store && window.__store._lastSummaryNumbers) || {};

    const _num = (v, fallback = 0) => Number(v ?? fallback) || 0;

    const incTuition    = fin ? _num(fin.incTuition)   : _num(prev.incTuition);
    const incExam       = fin ? _num(fin.incExam)      : _num(prev.incExam);
    const incOther      = fin ? _num(fin.incOther)     : _num(prev.incOther);
    const incUniform    = fin ? _num(fin.incUniform)   : _num(prev.incUniform);
    const expTotal      = fin ? _num(fin.exp)          : _num(prev.expTotal);
    const expExamTotal  = fin ? _num(fin.expExamTotal) : _num(prev.expExamTotal);
    const expUniform    = fin ? _num(fin.expUniform)   : _num(prev.expUniform);
    const txCount       = fin ? _num(fin.txCount)      : prev.txCount;

    const activeCount   = std ? _num(std.activeCount)    : _num(prev.activeCount);
    const debtCount     = std ? _num(std.debtCount)      : _num(prev.debtCount);
    const totalDebtEst  = std ? _num(std.totalDebtEst)   : _num(prev.totalDebtEst);
    const mActiveTheo   = std ? _num(std.m_active_theo)  : _num(prev.activeCount);
    const mNew          = std ? _num(std.m_new)          : 0;
    const mQuit         = std ? _num(std.m_quit)         : 0;
    const mSkipped      = std ? _num(std.m_skipped)      : 0;
    const unpaidInvCount = typeof getCachedUnpaidInvCount === 'function'
        ? _num(getCachedUnpaidInvCount())
        : _num(prev.unpaidInvCount);

    const selMonth = _getSelMonth() || prev.selMonth || '';
    const tInc = incTuition + incOther + incExam + incUniform;
    const tExp = expTotal + expExamTotal + expUniform;
    const mActual = mActiveTheo - mSkipped;

    const summaryNumbers = {
        incTuition, incExam, incOther, incUniform,
        expTotal, expExamTotal, expUniform,
        activeCount, debtCount, totalDebtEst, txCount,
        selMonth, unpaidInvCount,
    };

    let reportHtml = '';
    if (selMonth) {
        reportHtml =
            `<tr><td class="font-black text-primary">${formatMonth(selMonth)}</td>` +
            `<td class="text-slate-800 font-bold text-base">${mActual}</td>` +
            `<td class="text-emerald-600 font-medium">+${mNew}</td>` +
            `<td class="text-rose-600 font-medium">-${mQuit}</td>` +
            `<td class="text-emerald-600 font-bold">${tInc.toLocaleString()} ₫</td>` +
            `<td class="text-rose-600 font-bold">${tExp.toLocaleString()} ₫</td>` +
            `<td class="${(tInc - tExp) < 0 ? 'text-rose-600' : 'text-emerald-600'} font-black text-base bg-slate-50">${(tInc - tExp).toLocaleString()} ₫</td></tr>`;
    }

    const chartData = { labels: [], income: [], expense: [], active: [] };
    if (selMonth) {
        const [sy, sm] = selMonth.split('-').map(Number);
        const months = [];
        for (let i = 0; i < 6; i++) {
            let m = sm - i, y = sy;
            if (m <= 0) { m += 12; y -= 1; }
            months.push(`${y}-${String(m).padStart(2, '0')}`);
        }
        months.reverse().forEach((m, idx) => {
            chartData.labels[idx]  = formatMonth(m);
            chartData.income[idx]  = m === selMonth ? tInc : 0;
            chartData.expense[idx] = m === selMonth ? tExp : 0;
            chartData.active[idx]  = m === selMonth ? mActual : 0;
        });
    }

    const bStats = (fin && fin.bStats) || (window.__store && window.__store._lastBStats) || {};
    const bExamStats = (fin && fin.bExamStats) || (window.__store && window.__store._lastBExamStats) || {};

    // [Part 3 FIX] Guard uses `prev` (captured at TOP of this function, BEFORE any write).
    // Previously the guard read window.__store._lastSummaryNumbers AFTER writing summaryNumbers,
    // making prevSummary === summaryNumbers and the guard always a no-op.
    const incomingLooksEmpty =
        summaryNumbers.activeCount === 0 &&
        summaryNumbers.debtCount   === 0 &&
        summaryNumbers.txCount     === 0 &&
        summaryNumbers.incTuition  === 0 &&
        summaryNumbers.incExam     === 0 &&
        summaryNumbers.incOther    === 0 &&
        summaryNumbers.incUniform  === 0;

    const prevLooksNonEmpty =
        Number(prev.activeCount  || 0) > 0 ||
        Number(prev.debtCount    || 0) > 0 ||
        Number(prev.txCount      || 0) > 0 ||
        Number(prev.incTuition   || 0) > 0 ||
        Number(prev.incExam      || 0) > 0 ||
        Number(prev.incOther     || 0) > 0 ||
        Number(prev.incUniform   || 0) > 0;

    if (incomingLooksEmpty && prevLooksNonEmpty && reason !== 'logout' && reason !== 'reset') {
        console.warn('[DashboardSummary] Skip all-zero overwrite — keeping real previous data. reason:', reason);
        return /** @type {any} */ (prev);
    }

    // Write to cache only after guard passes
    cacheDashboardData({
        reportHtml,
        chartData,
        bStats,
        bExamStats,
        summaryNumbers,
    });

    if (window.__store) {
        window.__store._lastSummaryNumbers = summaryNumbers;
        window.__store._lastBStats = bStats;
        window.__store._lastBExamStats = bExamStats;
        window.__store._lastIncExam = incExam;
    }

    if (typeof window.updateSummaryNumbers === 'function') {
        try { window.updateSummaryNumbers(summaryNumbers); } catch (e) {
            console.warn('[listComputationRefresh] updateSummaryNumbers failed:', e);
        }
    }

    const dashActive = document.getElementById('tab_dashboard')?.classList.contains('active');
    if (dashActive) {
        if (typeof window.renderBranchStats === 'function') {
            try { window.renderBranchStats(bStats); } catch (_) {}
        }
        if (typeof window.renderDashboardCharts === 'function') {
            try { window.renderDashboardCharts(chartData); } catch (_) {}
        }
    }

    return summaryNumbers;
}

// ── refreshListComputation ────────────────────────────────────────────────────

/**
 * Refresh computation cache cho một list key trước khi render island.
 *
 * Đảm bảo island không đọc HTML cũ từ cache khi params đã thay đổi.
 * Được gọi bởi invalidateList() trong renderInvalidation.js TRƯỚC runRender(key).
 *
 * Cache bust tự nhiên:
 *   _loadMore(tab) tăng _activePage (hoặc _debtPage / _quitPage) và _dataVersion
 *   → paramsKey + dataVersion đều khác → cache miss trong computeAndCacheXxx()
 *   → recompute với activePage mới → island hiển thị đúng số row ✅
 *
 * Domain coverage:
 *   ✅ finance   — tx, expense, examExpense (computeAndCacheFinance)
 *   ✅ students  — active, debt, quit       (computeAndCacheStudents)
 *   ✅ inventory — invList, uniformTx       (computeAndCacheInventory)
 *   ⬇️ attendance — không có computation cache → return false (fallback)
 *   ⬇️ dashboard  — phụ thuộc finance+students phức tạp → invalidate section + return false
 *
 * @param {string}  key    — list key (e.g. 'students.activeList', 'tx.txList')
 * @param {string} [reason]
 * @returns {boolean} true nếu computation refresh thành công, false nếu cần fallback
 */
export function refreshListComputation(key, reason = 'list-refresh') {
    const m = _metrics();
    if (m) m.listComputationRefreshCalls++;

    const domain = LIST_TO_COMPUTATION_DOMAIN[key];
    if (!domain) {
        if (m) m.listComputationRefreshFallbacks++;
        return false;
    }

    const signature = _domainSignature(domain);
    if (domain !== 'attendance' && _canReuseRecentRefresh(domain, signature)) {
        if (m) {
            m.listComputationRefreshByDomain[domain] =
                (m.listComputationRefreshByDomain[domain] || 0) + 1;
            m.listRenderVersions[key] = { domain, version: Date.now(), reason, reused: true };
        }
        return true;
    }

    const t0  = performance.now();
    let   ok  = false;

    try {
        switch (domain) {
            case 'finance':
                _refreshFinance();
                _cacheAndApplyDashboardSummary(reason);
                ok = true;
                break;

            case 'students':
                _refreshStudents();
                _cacheAndApplyDashboardSummary(reason);
                ok = true;
                break;

            case 'inventory':
                _refreshInventory();
                _cacheAndApplyDashboardSummary(reason);
                ok = true;
                break;

            case 'attendance':
                // Attendance island render trực tiếp từ window.renderAttendanceList
                // không đi qua computation cache module → không cần refresh ở đây.
                // Return false để invalidateList() dùng fallback an toàn.
                ok = false;
                break;

            case 'dashboard':
                // [Part 2 FIX] Dashboard keys now trigger refreshDashboardComputation (not ok=false)
                refreshDashboardComputation(reason || 'dashboard-list-refresh');
                ok = true;
                break;

            default:
                ok = false;
        }
    } catch (err) {
        if (m) m.listComputationRefreshFailures++;
        console.warn(
            `[listComputationRefresh] Lỗi refresh key="${key}" domain="${domain}":`, err
        );
        ok = false;
    }

    const ms = performance.now() - t0;
    if (ok) _markRecentRefresh(domain, signature, reason);

    // ── Metrics update ────────────────────────────────────────────────────────
    if (m) {
        m.listComputationRefreshByDomain[domain] =
            (m.listComputationRefreshByDomain[domain] || 0) + 1;

        // Max duration per domain
        const prevMs = m.listComputationRefreshDuration[domain] || 0;
        if (ms > prevMs) {
            m.listComputationRefreshDuration[domain] = parseFloat(ms.toFixed(2));
        }

        // Track render version per key (dùng để detect staleness)
        if (ok) {
            m.listRenderVersions[key] = { domain, version: Date.now(), reason };
        } else {
            m.listComputationRefreshFallbacks++;
        }
    }

    if (ms > _SLOW_MS) _warnSlow(domain, ms);

    return ok;
}

/**
 * Refresh computation cho nhiều list keys — dedupe theo domain.
 *
 * Nếu nhiều keys cùng domain (e.g. students.activeList + students.debtList),
 * chỉ gọi computeAndCacheXxx() MỘT LẦN cho domain đó.
 * Tránh double computation khi invalidateLists() được gọi với nhiều keys.
 *
 * @param {string[]} keys
 * @param {string}  [reason]
 * @returns {{ refreshed: string[], fallback: string[] }}
 *   refreshed — keys đã được computation refresh thành công
 *   fallback  — keys không có computation cache (cần fallback: attendance, dashboard, unknown)
 */
export function refreshListsComputation(keys, reason = 'list-refresh') {
    if (!Array.isArray(keys) || keys.length === 0) {
        return { refreshed: [], fallback: [] };
    }

    // Group keys by domain để dedupe computation calls
    const domainGroups = {}; // { [domain]: string[] }
    const fallback     = [];

    for (const key of keys) {
        const domain = LIST_TO_COMPUTATION_DOMAIN[key];
        if (!domain) {
            fallback.push(key);
            continue;
        }
        if (!domainGroups[domain]) domainGroups[domain] = [];
        domainGroups[domain].push(key);
    }

    const refreshed = [];
    const t0        = performance.now();

    for (const [domain, domainKeys] of Object.entries(domainGroups)) {
        let ok = false;
        const signature = _domainSignature(domain);
        if (domain !== 'attendance' && _canReuseRecentRefresh(domain, signature)) {
            ok = true;
        } else try {
            switch (domain) {
                case 'finance':
                    _refreshFinance();  // compute ONCE cho tất cả finance keys
                    ok = true;
                    break;
                case 'students':
                    _refreshStudents(); // compute ONCE cho tất cả student keys
                    ok = true;
                    break;
                case 'inventory':
                    _refreshInventory(); // compute ONCE cho tất cả inventory keys
                    ok = true;
                    break;
                case 'attendance':
                    ok = false;
                    break;
                case 'dashboard':
                    // [Part 2 FIX] Dashboard batch refresh triggers real recompute
                    refreshDashboardComputation(reason || 'dashboard-batch-refresh');
                    ok = true;
                    break;
                default:
                    ok = false;
            }
        } catch (err) {
            console.warn(
                `[listComputationRefresh] Lỗi refreshListsComputation domain="${domain}":`, err
            );
            ok = false;
        }

        if (ok) {
            _markRecentRefresh(domain, signature, reason);
            domainKeys.forEach(k => refreshed.push(k));
            // Metrics per key
            const m = _metrics();
            if (m) {
                m.listComputationRefreshByDomain[domain] =
                    (m.listComputationRefreshByDomain[domain] || 0) + 1;
                domainKeys.forEach(k => {
                    m.listRenderVersions[k] = { domain, version: Date.now(), reason };
                });
            }
        } else {
            domainKeys.forEach(k => fallback.push(k));
        }
    }

    // Sau batch refresh, cập nhật summary/badges đúng 1 lần.
    if (refreshed.some(k => {
        const d = LIST_TO_COMPUTATION_DOMAIN[k];
        return d === 'finance' || d === 'students' || d === 'inventory';
    })) {
        _cacheAndApplyDashboardSummary(reason);
    }

    const ms = performance.now() - t0;
    if (ms > _SLOW_MS * Math.max(keys.length, 1) && _isDebugPerfEnabled()) {
        console.warn(
            `[ListComputationSlow] refreshListsComputation ${keys.length} keys ` +
            `took ${ms.toFixed(1)}ms (budget: ${(_SLOW_MS * keys.length).toFixed(0)}ms)`
        );
    }

    return { refreshed, fallback };
}

// ─────────────────────────────────────────────────────────────────────────────
// refreshDashboardComputation — Part 2 FIX
// Recompute ALL dashboard data (finance + students + inventory → summary/charts)
// before rendering dashboard islands.  Always call this instead of rendering
// from an empty/stale cache.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Full dashboard recompute: finance → students → inventory → summary → chartData.
 *
 * Exposed on window so renderInvalidation.js can call it without a circular import.
 *
 * @param {string} [reason]
 * @returns {object|null} summaryNumbers or null on failure
 */
export function refreshDashboardComputation(reason = 'dashboard-refresh') {
    try {
        try { _refreshFinance();   } catch (_) {}
        try { _refreshStudents();  } catch (_) {}
        try { _refreshInventory(); } catch (_) {}

        const summary = _cacheAndApplyDashboardSummary(reason);

        if (window.__store) {
            window.__store._lastDashboardRefreshReason = reason;
            window.__store._lastDashboardRefreshAt     = Date.now();
        }

        // Phase 4K-6V1 Spark Read Cost Hardening:
        // Never issue historical Firestore reads on every cross-domain invalidation.
        // Only the visible Dashboard may schedule a cached/single-flight history fetch.
        const _selMonth = (window.__store && window.__store.selectedMonth) ||
            (document.getElementById('monthPicker') ? document.getElementById('monthPicker').value : '');
        if (_selMonth && typeof window.scheduleDashboardHistoryFetch === 'function') {
            window.scheduleDashboardHistoryFetch(_selMonth, reason).catch(function(e) {
                console.warn('[refreshDashboardComputation] scheduled historical fetch failed:', e);
            });
        } else if (_selMonth && typeof window.fetchHistoricalDashboardFallback === 'function') {
            // Legacy safety fallback: still gated by visible Dashboard.
            const _active = document.querySelector('.tab-content.active');
            if (_active && _active.id === 'tab_dashboard') {
                window.fetchHistoricalDashboardFallback(_selMonth, reason).catch(function(e) {
                    console.warn('[refreshDashboardComputation] historical fetch failed:', e);
                });
            }
        }

        return summary;
    } catch (e) {
        console.warn('[refreshDashboardComputation] failed:', e);
        return null;
    }
}

// Expose immediately so renderInvalidation.js can call it on first paint
if (typeof window !== 'undefined') {
    window.refreshDashboardComputation = refreshDashboardComputation;
}

/**
 * Lấy computation domain cho list key.
 *
 * Debug helper — không dùng trong critical path.
 *
 * @param {string} key
 * @returns {string|null}
 */
export function getComputationDomainForList(key) {
    return LIST_TO_COMPUTATION_DOMAIN[key] || null;
}
