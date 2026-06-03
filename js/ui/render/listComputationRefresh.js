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
} from './computation/studentsRenderer.js';
import {
    computeAndCacheInventory,
} from './computation/inventoryRenderer.js';
import { invalidateDashboardCache } from './computation/dashboardRenderer.js';

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
// 1 animation frame @ 60fps = 16ms.
// Nếu computation mất hơn 16ms, warn (throttled) để dễ phát hiện bottleneck.
const _SLOW_MS = 16;

// ── Throttled slow-render warning ─────────────────────────────────────────────
const _slowThrottle = {}; // { [domain]: lastWarnTimestamp }
const _SLOW_THROTTLE_MS = 3000;

function _warnSlow(domain, ms) {
    try {
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
function _getSearch() {
    try { return (document.getElementById('searchInput')?.value || '').toLowerCase().trim(); }
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

    const t0  = performance.now();
    let   ok  = false;

    try {
        switch (domain) {
            case 'finance':
                _refreshFinance();
                ok = true;
                break;

            case 'students':
                _refreshStudents();
                ok = true;
                break;

            case 'inventory':
                _refreshInventory();
                ok = true;
                break;

            case 'attendance':
                // Attendance island render trực tiếp từ window.renderAttendanceList
                // không đi qua computation cache module → không cần refresh ở đây.
                // Return false để invalidateList() dùng fallback an toàn.
                ok = false;
                break;

            case 'dashboard':
                // Dashboard phụ thuộc finance + students đã computed → partial recompute
                // không an toàn (thiếu data). Invalidate cache section cụ thể để dashboard
                // island bị mark dirty → khi user mở tab dashboard sẽ trigger full renderApp().
                if      (key === 'dashboard.reportList')  invalidateDashboardCache('reportList');
                else if (key === 'dashboard.summary')     invalidateDashboardCache('summary');
                else if (key === 'dashboard.charts')      invalidateDashboardCache('charts');
                else if (key === 'dashboard.branchStats') invalidateDashboardCache('branchStats');
                ok = false; // fallback → invalidateList() sẽ trigger invalidateCurrentTab()
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
        try {
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
                case 'dashboard':
                    ok = false;
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

    const ms = performance.now() - t0;
    if (ms > _SLOW_MS * Math.max(keys.length, 1)) {
        console.warn(
            `[ListComputationSlow] refreshListsComputation ${keys.length} keys ` +
            `took ${ms.toFixed(1)}ms (budget: ${(_SLOW_MS * keys.length).toFixed(0)}ms)`
        );
    }

    return { refreshed, fallback };
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
