/**
 * computation/dashboardRenderer.js — Phase 3.5B Render Invalidation & Lifecycle Stabilization
 *
 * Lightweight computation cache cho dashboard.
 * Tách computation data của dashboard ra khỏi renderApp() để:
 *   - Dashboard islands có thể đọc data từ đây (không qua tabHtmlCache toàn cục)
 *   - renderInvalidation.js có thể gọi invalidateDashboardCache() khi cần
 *   - Các island dashboard có thể render đúng thời điểm (khi tab active)
 *
 * Owns:
 *   - Report HTML cache (buildReportRows → reportHtml)
 *   - Chart data cache (buildDashboardChartData → chartData)
 *   - Branch stats cache (bStats object từ financeRenderer + studentsRenderer)
 *   - Summary numbers cache (incTuition, activeCount, v.v.)
 *   - Exam branch fees cache (bExamStats, inc_exam)
 *   - Explicit cache invalidation API
 *
 * KHÔNG:
 *   - Mutate DOM trực tiếp
 *   - Query Firestore
 *   - Gọi renderApp()
 *   - Tạo Chart.js instance
 *
 * Backward compat:
 *   render.js vẫn populate tabHtmlCache._chartData cho tabs.js legacy readers.
 *   Đồng thời gọi cacheDashboardData() để dashboard islands đọc từ đây.
 */

// ── Module-local dashboard data cache ────────────────────────────────────────
const _cache = {
    reportHtml:       null,   // string HTML cho #reportList
    chartData:        null,   // { labels, income, expense, active }
    bStats:           null,   // { CS1: { income, active, debt, ... }, ... }
    bExamStats:       null,   // { CS1: number, ... }
    summaryNumbers:   null,   // { incTuition, incExam, activeCount, debtCount, ... }
    _version:         0,
};

// ── Explicit invalidation ─────────────────────────────────────────────────────

/**
 * Invalidate dashboard cache sections.
 * Gọi khi finance / students / inventory / attendance thay đổi.
 *
 * @param {'reportList'|'charts'|'branchStats'|'summary'|'examBranchFees'|'all'} section
 */
export function invalidateDashboardCache(section) {
    if (section === 'reportList'    || section === 'all') _cache.reportHtml     = null;
    if (section === 'charts'        || section === 'all') _cache.chartData      = null;
    if (section === 'branchStats'   || section === 'all') _cache.bStats         = null;
    if (section === 'examBranchFees'|| section === 'all') _cache.bExamStats     = null;
    if (section === 'summary'       || section === 'all') _cache.summaryNumbers = null;
    _cache._version++;
}

// ── Cache writer (gọi từ render.js sau mỗi renderApp cycle) ──────────────────

/**
 * Lưu toàn bộ dashboard data vào cache module.
 * Gọi từ render.js sau khi computation hoàn thành.
 *
 * @param {Object} data
 * @param {string}  data.reportHtml       — HTML string cho #reportList
 * @param {Object}  data.chartData        — { labels, income, expense, active }
 * @param {Object}  data.bStats           — branch stats từ finance + students
 * @param {Object}  data.bExamStats       — exam branch stats
 * @param {Object}  data.summaryNumbers   — tất cả số cần updateSummaryNumbers()
 */
export function cacheDashboardData(data) {
    if (data.reportHtml     !== undefined) _cache.reportHtml     = data.reportHtml;
    if (data.chartData      !== undefined) _cache.chartData      = data.chartData;
    if (data.bStats         !== undefined) _cache.bStats         = data.bStats;
    if (data.bExamStats     !== undefined) _cache.bExamStats     = data.bExamStats;
    if (data.summaryNumbers !== undefined) _cache.summaryNumbers = data.summaryNumbers;
    _cache._version++;
}

// ── Public read API ───────────────────────────────────────────────────────────

/**
 * Report HTML string cho #reportList island.
 * @returns {string}
 */
export function getDashboardReportHtml() {
    return _cache.reportHtml || '';
}

/**
 * Chart data cho finance/member charts.
 * @returns {{ labels:string[], income:number[], expense:number[], active:number[] }|null}
 */
export function getDashboardChartData() {
    return _cache.chartData || null;
}

/**
 * Branch stats object (augmented với active/debt counts).
 * @returns {Object|null}
 */
export function getDashboardBranchStats() {
    return _cache.bStats || null;
}

/**
 * Exam branch stats object.
 * @returns {Object|null}
 */
export function getDashboardExamStats() {
    return _cache.bExamStats || null;
}

/**
 * Summary numbers object cho updateSummaryNumbers().
 * @returns {Object|null}
 */
export function getDashboardSummaryNumbers() {
    return _cache.summaryNumbers || null;
}

/**
 * Cache version — tăng mỗi lần invalidate hoặc update.
 * @returns {number}
 */
export function getDashboardCacheVersion() {
    return _cache._version;
}
