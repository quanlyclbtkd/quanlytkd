/**
 * renderInvalidation.js — Phase 3.5E List-Level Computation Refresh
 *                        (Builds on Phase 3.5D LoadMore & List-Level Render Invalidation)
 *
 * THAY ĐỔI PHASE 3.5E (so với 3.5D):
 *  [1] Import listComputationRefresh.js  — module mới, không circular import
 *  [2] invalidateList() — gọi refreshListComputation() TRƯỚC runRender()
 *        Fix bug: island không còn đọc HTML cũ từ cache sau _loadMore
 *  [3] invalidateLists() — dùng refreshListsComputation() dedupe theo domain
 *        Nhiều keys cùng domain → computeAndCacheXxx() chỉ chạy 1 lần
 *  [4] Metrics mở rộng — 3.5E fields: listComputationRefreshCalls,
 *        listComputationRefreshByDomain, listComputationRefreshFallbacks,
 *        listComputationRefreshFailures, listComputationRefreshDuration,
 *        listRenderVersions
 *  [5] printRenderLegacyMetrics() — thêm bảng 3.5E (refresh by domain + version)
 *  [6] window.* expose mới — 3 APIs 3.5E: refreshListComputation,
 *        refreshListsComputation, getComputationDomainForList
 *
 * THAY ĐỔI PHASE 3.5D (giữ nguyên):
 *  - TAB_TO_LIST_KEYS, invalidateList, invalidateLists, invalidateLoadMoreTab
 *  - getListKeyForTab, loadMore metrics, listInvalidations{}
 *
 * GIỮ NGUYÊN từ Phase 3.5C:
 *  - invalidateCurrentTab / invalidateTab / getCurrentActiveTabId
 *  - _TAB_DOMAIN_MAP (domain-level mapping)
 *  - Legacy metrics, storm guard, cross-domain rules, legacy bridges
 *  - window.scheduleRender / window._moduleRenderApp với warning
 *
 * Bug được fix (Phase 3.5E):
 *   Cache staleness sau _loadMore:
 *   3.5D: invalidateList(key) → runRender(key) → island reads stale cache HTML
 *   3.5E: invalidateList(key) → refreshListComputation(key) → computeAndCacheXxx()
 *         → cache miss do paramsKey/_dataVersion đổi → recompute fresh HTML
 *         → runRender(key) → island reads fresh HTML ✅
 *
 * Thiết kế list-level vs domain-level:
 *   DOMAIN invalidation — dùng cho DATA CHANGE lớn (thêm/sửa/xóa Firestore):
 *     invalidateFinance, invalidateStudents, invalidateInventory, ...
 *     → xóa computation cache + render tất cả islands + cross-domain
 *
 *   LIST invalidation — dùng cho PAGINATION / LOADMORE:
 *     invalidateList('students.activeList') sau _loadMore('active')
 *     invalidateLoadMoreTab('active')
 *     → refresh computation cache → render đúng island → không kéo cross-domain
 *
 * window.* exposed (sau registerInvalidationLegacyGlobals):
 *   [3.5B] window.invalidateFinance/Students/Inventory/Dashboard/Attendance/ByDomain
 *   [3.5C] window.scheduleRender, window._moduleRenderApp (với warning)
 *   [3.5C] window.invalidateCurrentTab, window.invalidateTab, window.getCurrentActiveTabId
 *   [3.5D] window.invalidateList, invalidateLists, invalidateLoadMoreTab, getListKeyForTab
 *   [3.5E] window.refreshListComputation, refreshListsComputation, getComputationDomainForList
 *   window.__renderLegacyMetrics          — metrics object (3.5C–3.5E)
 *   window.printRenderLegacyMetrics()     — console.table helper
 *
 * Storm guard (giữ từ 3.5B):
 *   Track số invalidation calls per domain per second.
 *   Nếu vượt ngưỡng STORM_THRESHOLD_PER_SEC → console.warn [RenderStormWarning].
 *   Chỉ warning, không block app.
 *
 * Virtualization preparation (3.5D/3.5E):
 *   Mỗi list key là stable list boundary với computation cache đã được refresh.
 *   Sau này có thể implement virtual scroll per key mà không đổi API.
 */

import {
    runRender,
    invalidateRender,
    invalidateTabRenders,
} from './renderRegistry.js';

import { invalidateFinanceRender }   from './computation/financeRenderer.js';
import { invalidateStudentsRender }  from './computation/studentsRenderer.js?v=debt-paiduntil-authoritative-boundary-20260627-v4b11';
import { invalidateInventoryRender } from './computation/inventoryRenderer.js';
import { invalidateDashboardCache }  from './computation/dashboardRenderer.js';

// [3.5E] List-level computation refresh — đảm bảo island không đọc HTML cũ
import {
    refreshListComputation,
    refreshListsComputation,
    getComputationDomainForList,
} from './listComputationRefresh.js?v=debt-paiduntil-authoritative-boundary-20260627-v4b11';

// ── Dev helper ────────────────────────────────────────────────────────────────
function _isDev() {
    const h = window.location.hostname;
    return h === 'localhost' || h === '127.0.0.1' || h.endsWith('.replit.dev');
}

// ── Storm guard ───────────────────────────────────────────────────────────────
// Track invalidation calls per domain per giây. Chỉ warn, không block.
const _stormTracker = {}; // { [domain]: { count: number, resetAt: number } }
const STORM_THRESHOLD_PER_SEC = 10; // warn nếu > 10 lần/giây

function _checkStorm(label) {
    try {
        const now = Date.now();
        if (!_stormTracker[label]) {
            _stormTracker[label] = { count: 0, resetAt: now + 1000 };
        }
        const s = _stormTracker[label];
        if (now > s.resetAt) {
            s.count  = 0;
            s.resetAt = now + 1000;
        }
        s.count++;
        if (s.count > STORM_THRESHOLD_PER_SEC) {
            console.warn(
                `[RenderStormWarning] domain="${label}" — ${s.count} invalidations/sec ` +
                `(threshold: ${STORM_THRESHOLD_PER_SEC}). Có thể bị render storm.`
            );
        }
    } catch (_) {
        // console có thể không có trong một số env — không crash
    }
}

// ── Island keys theo domain ───────────────────────────────────────────────────
// Map domain → các render island keys liên quan
const _FINANCE_KEYS   = ['tx.txList', 'finance.expenseList', 'finance.examExpenseList'];
const _STUDENTS_KEYS  = ['students.activeList', 'students.debtList', 'students.quitList'];
const _INVENTORY_KEYS = ['inventory.inventoryList', 'inventory.uniformTxList'];
const _DASHBOARD_KEYS = [
    'dashboard.reportList',
    'dashboard.charts',
    'dashboard.branchStats',
    'dashboard.summary',
    'dashboard.examBranchFees',
];
const _ATTENDANCE_KEYS = ['attendance.list', 'attendance.monthly'];

// ── Core: schedule island nếu tab đang active, không làm gì thêm nếu hidden ──
// runRender() trong registry tự handle: nếu tab hidden → mark dirty → flush khi active
function _scheduleIslands(keys) {
    keys.forEach(key => runRender(key));
}

// ── [GITHUB-FIX] Store data version bump — buộc computation cache miss ──────
function _bumpStoreDataVersion(reason) {
    try {
        if (window.__store) {
            window.__store._dataVersion = (window.__store._dataVersion || 0) + 1;
            window.__store._lastDataVersionReason = reason || 'domain-invalidate';
        }
    } catch (_) {}
}

// ── [GITHUB-FIX] Refresh computation cache TRƯỚC khi schedule islands ────────
// Đảm bảo island không đọc cache rỗng sau khi vừa clear cache.
function _refreshThenSchedule(keys, reason) {
    _bumpStoreDataVersion(reason);
    try {
        if (typeof refreshListsComputation === 'function') {
            refreshListsComputation(keys, reason || 'domain-invalidate');
        }
    } catch (e) {
        console.warn('[renderInvalidation] refreshListsComputation failed:', e);
    }

    try {
        _scheduleIslands(keys);
    } catch (e) {
        console.warn('[renderInvalidation] _scheduleIslands failed:', e);
    }
}

// ── Phase 3.5C: Tab → Domain mapping ─────────────────────────────────────────
//
// Quyết định khi invalidateCurrentTab() / invalidateTab() được gọi,
// domain nào bị invalidate và island nào được schedule lại.
//
// Nguyên tắc thiết kế:
//   - Mỗi tab chỉ invalidate domain của chính nó (không full-app render)
//   - 'debt' tab: students domain (debt list tính từ profiles)
//   - 'exam' tab: partial finance domain (chỉ examExpenseList island)
//   - tab không nhận ra → fallback invalidateByDomain('all') an toàn
//
const _TAB_DOMAIN_MAP = {
    dashboard:  { label: 'dashboard',          fn: (r) => { _invalidateDashboardOnly(r); } },
    tx:         { label: 'finance',            fn: (r) => { invalidateFinance(r); } },
    expense:    { label: 'finance',            fn: (r) => { invalidateFinance(r); } },
    exam:       { label: 'exam(partial-fin)',  fn: (_r) => {
        // Exam tab chỉ ảnh hưởng finance.examExpenseList — partial invalidate
        invalidateFinanceRender('examExpTable');
        runRender('finance.examExpenseList');
    }},
    debt:       { label: 'students',           fn: (r) => { invalidateStudents(r); } },
    active:     { label: 'students',           fn: (r) => { invalidateStudents(r); } },
    quit:       { label: 'students',           fn: (r) => { invalidateStudents(r); } },
    inventory:  { label: 'inventory',          fn: (r) => { invalidateInventory(r); } },
    attendance: { label: 'attendance',         fn: (r) => { invalidateAttendance(r); } },
};

// ── Phase 3.5D: Tab → List keys mapping ──────────────────────────────────────
//
// Mapping này dùng RIÊNG cho list-level render (pagination / loadMore / filter nhỏ).
// KHÔNG thay thế _TAB_DOMAIN_MAP — domain invalidation vẫn dùng cho data change lớn.
//
// Nguyên tắc thiết kế:
//   - invalidateLoadMoreTab(tab) dùng mapping này để render ĐÚNG list bị ảnh hưởng
//   - List-level invalidation KHÔNG kéo cross-domain (không trigger dashboard)
//   - Domain invalidation (invalidateFinance, invalidateStudents, v.v.) vẫn dùng
//     khi có data change thật sự (thêm tx, sửa profile, v.v.)
//   - Chuẩn bị ranh giới rõ ràng cho virtual rendering tương lai
//
export const TAB_TO_LIST_KEYS = {
    tx:         ['tx.txList'],
    active:     ['students.activeList'],
    debt:       ['students.debtList'],
    quit:       ['students.quitList'],
    inventory:  ['inventory.inventoryList', 'inventory.uniformTxList'],
    expense:    ['finance.expenseList'],
    attendance: ['attendance.list'],
    dashboard:  ['dashboard.reportList'],
};

// ── Phase 3.5C: DOM helper — lấy tab đang active ─────────────────────────────

/**
 * Lấy tabId của tab đang active từ DOM.
 *
 * Đọc phần tử .tab-content.active và trích xuất id (bỏ prefix "tab_").
 * Không throw nếu DOM chưa sẵn sàng — trả về null.
 *
 * @returns {string|null}  tabId (e.g. 'tx', 'active', 'dashboard') hoặc null
 */
export function getCurrentActiveTabId() {
    try {
        const el = document.querySelector('.tab-content.active');
        if (el && el.id) {
            return el.id.replace(/^tab_/, '') || null;
        }
    } catch (_) {}
    return null;
}

// ── Phase 3.5C: invalidateCurrentTab / invalidateTab ─────────────────────────

/**
 * Invalidate domain của tab đang active — không trigger full renderApp().
 *
 * Dùng để thay thế scheduleRender() trong filter/search handlers và các nơi
 * chỉ ảnh hưởng tab đang mở hiện tại (ví dụ: filterBranch.onchange).
 *
 * An toàn:
 *   - Nếu DOM tab chưa sẵn sàng hoặc không xác định được → fallback invalidateByDomain('all')
 *   - Không crash nếu DOM không có .tab-content.active
 *   - console.debug nhẹ (chỉ trong dev mode)
 *
 * @param {string} [reason]  — debug label (không ảnh hưởng logic)
 */
export function invalidateCurrentTab(reason) {
    // [3.5C] metrics
    if (window.__renderLegacyMetrics) {
        window.__renderLegacyMetrics.invalidateCurrentTabCalls++;
    }

    let tabId = null;
    try {
        tabId = getCurrentActiveTabId();
    } catch (_) {}

    if (_isDev()) {
        console.debug(
            `[renderInvalidation] 📍 invalidateCurrentTab tabId="${tabId || '?'}" reason="${reason || ''}"`
        );
    }

    if (!tabId) {
        // Tab chưa xác định được — fallback an toàn
        invalidateByDomain('all', reason || 'invalidateCurrentTab-no-tab');
        return;
    }

    invalidateTab(tabId, reason);
}

/**
 * Invalidate domain của tabId cụ thể.
 *
 * Dùng khi caller biết rõ tabId (e.g. pagination handler biết mình ở tab nào),
 * không cần đọc DOM như invalidateCurrentTab().
 *
 * @param {string}  tabId   — id tab panel (vd: 'tx', 'active', 'inventory')
 * @param {string} [reason]
 */
export function invalidateTab(tabId, reason) {
    if (!tabId) {
        invalidateByDomain('all', reason || 'invalidateTab-no-id');
        return;
    }

    const mapping = _TAB_DOMAIN_MAP[tabId];
    if (!mapping) {
        // tabId không nhận ra — fallback an toàn
        if (_isDev()) {
            console.warn(
                `[renderInvalidation] invalidateTab: tabId không nhận ra "${tabId}" → fallback all`
            );
        }
        invalidateByDomain('all', reason || ('unknown-tab-' + tabId));
        return;
    }

    if (_isDev()) {
        console.debug(
            `[renderInvalidation] 🏷 invalidateTab tabId="${tabId}" ` +
            `domain="${mapping.label}" reason="${reason || ''}"`
        );
    }

    try {
        mapping.fn(reason || (tabId + '-invalidate'));
    } catch (err) {
        // Nếu có lỗi bất ngờ trong mapping fn → fallback an toàn
        console.error(`[renderInvalidation] invalidateTab lỗi cho tabId="${tabId}":`, err);
        invalidateByDomain('all', reason);
    }
}

// ── Phase 3.5C: Legacy warning throttle ──────────────────────────────────────
//
// Warn tối đa 1 lần mỗi 2 giây cho cùng key.
// Không spam console khi Firestore snapshot bắn liên tục.
//
const _legacyWarnThrottle = {}; // { [key]: lastWarnTimestamp (ms) }
const _LEGACY_WARN_THROTTLE_MS = 2000;

function _throttledWarn(key, message, reason) {
    try {
        const now = Date.now();
        if (!_legacyWarnThrottle[key] || now - _legacyWarnThrottle[key] > _LEGACY_WARN_THROTTLE_MS) {
            _legacyWarnThrottle[key] = now;
            console.warn(message, reason !== undefined ? '| reason: ' + reason : '');
        }
    } catch (_) {}
}

// ── Phase 3.5C: Legacy metrics ────────────────────────────────────────────────

/**
 * Khởi tạo metrics object trên window nếu chưa tồn tại.
 * Gọi từ registerInvalidationLegacyGlobals().
 */
function _initLegacyMetrics() {
    if (!window.__renderLegacyMetrics) {
        window.__renderLegacyMetrics = {
            scheduleRenderCalls:           0,   // lần window.scheduleRender() bị gọi (legacy)
            moduleRenderAppCalls:          0,   // lần window._moduleRenderApp() bị gọi
            renderAppDirectCalls:          0,   // lần renderApp() gọi trực tiếp (manual counter)
            invalidateCurrentTabCalls:     0,   // lần invalidateCurrentTab() được gọi (3.5C ✅)
            domainInvalidations:           {},  // { [domain]: count } — breakdown per domain
            // ── [3.5D] LoadMore & List-level metrics ─────────────────────
            loadMoreCalls:                 0,   // lần _loadMore(tab) được gọi
            loadMoreInvalidationCalls:     0,   // lần invalidateLoadMoreTab() thành công
            loadMoreFallbackRenderAppCalls:0,   // lần _loadMore fallback về renderApp()
            listInvalidations:             {},  // { [listKey]: count } — per-list breakdown
            // ── [3.5E] Computation refresh metrics ───────────────────────
            listComputationRefreshCalls:   0,   // lần refreshListComputation() được gọi
            listComputationRefreshByDomain:{},  // { [domain]: count } — per-domain refresh count
            listComputationRefreshFallbacks:0,  // lần refresh trả false (attendance/dashboard/unknown)
            listComputationRefreshFailures: 0,  // lần refresh ném exception
            listComputationRefreshDuration:{},  // { [domain]: maxMs } — max duration per domain
            listRenderVersions:            {},  // { [key]: { domain, version, reason } }
        };
    } else {
        // Đảm bảo các field tồn tại nếu object được tạo bởi version cũ hơn
        const m = window.__renderLegacyMetrics;
        // 3.5D fields
        if (m.loadMoreCalls                  === undefined) m.loadMoreCalls                   = 0;
        if (m.loadMoreInvalidationCalls       === undefined) m.loadMoreInvalidationCalls       = 0;
        if (m.loadMoreFallbackRenderAppCalls  === undefined) m.loadMoreFallbackRenderAppCalls  = 0;
        if (!m.listInvalidations)                            m.listInvalidations               = {};
        // 3.5E fields
        if (m.listComputationRefreshCalls     === undefined) m.listComputationRefreshCalls     = 0;
        if (!m.listComputationRefreshByDomain)               m.listComputationRefreshByDomain  = {};
        if (m.listComputationRefreshFallbacks === undefined) m.listComputationRefreshFallbacks = 0;
        if (m.listComputationRefreshFailures  === undefined) m.listComputationRefreshFailures  = 0;
        if (!m.listComputationRefreshDuration)               m.listComputationRefreshDuration  = {};
        if (!m.listRenderVersions)                           m.listRenderVersions              = {};
    }

    window.printRenderLegacyMetrics = function() {
        const m = window.__renderLegacyMetrics;
        if (!m) { console.log('[RenderLegacyMetrics] Chưa có dữ liệu'); return; }

        console.group('[RenderLegacyMetrics] Phase 3.5E — Legacy + LoadMore + List + ComputeRefresh Tracker');

        // ── Legacy vs new invalidation ────────────────────────────────────
        console.table([
            { metric: 'scheduleRender() calls (legacy ⚠️)',                count: m.scheduleRenderCalls },
            { metric: '_moduleRenderApp() calls (legacy ⚠️)',               count: m.moduleRenderAppCalls },
            { metric: 'renderApp() direct calls (legacy ⚠️)',               count: m.renderAppDirectCalls },
            { metric: 'invalidateCurrentTab() calls (3.5C ✅)',              count: m.invalidateCurrentTabCalls },
            { metric: '_loadMore() total calls (3.5D ✅)',                   count: m.loadMoreCalls },
            { metric: 'invalidateLoadMoreTab() success (3.5D ✅)',           count: m.loadMoreInvalidationCalls },
            { metric: '_loadMore fallback renderApp() (legacy ⚠️)',          count: m.loadMoreFallbackRenderAppCalls },
            { metric: 'refreshListComputation() total (3.5E ✅)',            count: m.listComputationRefreshCalls },
            { metric: 'refreshListComputation() fallbacks (3.5E ⬇️)',        count: m.listComputationRefreshFallbacks },
            { metric: 'refreshListComputation() failures (3.5E ❌)',         count: m.listComputationRefreshFailures },
        ]);

        // ── Domain breakdown ──────────────────────────────────────────────
        const domTable = Object.entries(m.domainInvalidations).map(([d, c]) => ({ domain: d, count: c }));
        if (domTable.length > 0) {
            console.log('Domain invalidation breakdown:');
            console.table(domTable);
        }

        // ── List-level breakdown (3.5D) ───────────────────────────────────
        const listTable = Object.entries(m.listInvalidations).map(([k, c]) => ({ listKey: k, count: c }));
        if (listTable.length > 0) {
            console.log('[3.5D] List-level invalidation breakdown:');
            console.table(listTable);
        } else {
            console.log('[3.5D] List-level invalidations: chưa có (listInvalidations rỗng)');
        }

        // ── Computation refresh breakdown (3.5E) ──────────────────────────
        const refreshDomTable = Object.entries(m.listComputationRefreshByDomain || {})
            .map(([d, c]) => ({
                domain:    d,
                refreshes: c,
                maxMs:     (m.listComputationRefreshDuration || {})[d] || 0,
            }));
        if (refreshDomTable.length > 0) {
            console.log('[3.5E] Computation refresh by domain (count + max duration):');
            console.table(refreshDomTable);
        }

        // ── Render version per list key (3.5E) ───────────────────────────
        const versionTable = Object.entries(m.listRenderVersions || {})
            .map(([k, v]) => ({
                listKey: k,
                domain:  v.domain,
                reason:  v.reason,
                ts:      new Date(v.version).toISOString().slice(11, 23),
            }));
        if (versionTable.length > 0) {
            console.log('[3.5E] Last computation refresh per list key:');
            console.table(versionTable);
        }

        // ── Tỷ lệ migration ───────────────────────────────────────────────
        const legacyTotal = m.scheduleRenderCalls + m.moduleRenderAppCalls
                          + m.renderAppDirectCalls + m.loadMoreFallbackRenderAppCalls;
        const newTotal    = m.invalidateCurrentTabCalls + m.loadMoreInvalidationCalls
                          + Object.values(m.listInvalidations).reduce((a, b) => a + b, 0);
        const total       = legacyTotal + newTotal;
        console.log(
            `📊 Legacy total: ${legacyTotal} | Invalidation mới: ${newTotal} | ` +
            `Tỷ lệ đã migrate: ${total > 0 ? ((newTotal / total) * 100).toFixed(1) + '%' : 'N/A'}`
        );
        console.log(
            `🔄 Computation refresh (3.5E): ${m.listComputationRefreshCalls} calls | ` +
            `${m.listComputationRefreshFallbacks} fallbacks | ` +
            `${m.listComputationRefreshFailures} failures`
        );

        console.groupEnd();
    };
}

// ── Entry point tổng quát ─────────────────────────────────────────────────────

/**
 * Invalidate theo domain.
 * Là entry point chính, các module khác nên gọi hàm domain-specific bên dưới.
 *
 * Domain hợp lệ: 'finance' | 'students' | 'inventory' | 'dashboard' | 'attendance' | 'all'
 *
 * @param {string} domain
 * @param {string} [reason]  — ghi chú debug, không ảnh hưởng logic
 */
export function invalidateByDomain(domain, reason) {
    if (!domain) return;
    _checkStorm(domain);

    if (_isDev()) {
        console.debug(`[renderInvalidation] 🔄 domain="${domain}" reason="${reason || ''}"`);
    }

    switch (domain) {
        case 'finance':    return invalidateFinance(reason);
        case 'students':   return invalidateStudents(reason);
        case 'inventory':  return invalidateInventory(reason);
        case 'dashboard':  return invalidateDashboard(reason);
        case 'attendance': return invalidateAttendance(reason);
        case 'all':
            // Invalidate tất cả — dùng khi data version thay đổi toàn cục
            // Không gọi đệ quy invalidateByDomain để tránh storm
            invalidateFinanceRender('all');
            invalidateStudentsRender('all');
            invalidateInventoryRender('all');
            invalidateDashboardCache('all');
            _scheduleIslands([
                ..._FINANCE_KEYS,
                ..._STUDENTS_KEYS,
                ..._INVENTORY_KEYS,
                ..._DASHBOARD_KEYS,
                ..._ATTENDANCE_KEYS,
            ]);
            break;
        default:
            if (_isDev()) console.warn(`[renderInvalidation] Unknown domain: "${domain}"`);
    }
}

// ── Finance invalidation ───────────────────────────────────────────────────────

/**
 * Invalidate finance domain.
 *
 * Làm gì:
 *   - Xóa computation cache của financeRenderer (txRows, expenseRows, summary, v.v.)
 *   - Schedule các finance islands để re-render
 *   - [Cross-domain] Invalidate dashboard (summary numbers thay đổi khi finance thay đổi)
 *
 * @param {string} [reason]
 */
export function invalidateFinance(reason) {
    _checkStorm('finance');

    // 1. Xóa finance computation cache
    invalidateFinanceRender('all');

    // 2. [GITHUB-FIX] Refresh computation cache TRƯỚC rồi schedule islands
    //    Tránh island đọc cache rỗng sau khi vừa clear cache
    _refreshThenSchedule(_FINANCE_KEYS, reason || 'finance-domain');

    // 3. [Cross-domain] Finance thay đổi → dashboard summary cần cập nhật
    //    (incTuition, exp, v.v. đều phụ thuộc finance data)
    //    Gọi trực tiếp _invalidateDashboardOnly() để tránh loop vô hạn
    _invalidateDashboardOnly('finance-change');
}

// ── Students invalidation ──────────────────────────────────────────────────────

/**
 * Invalidate students domain.
 *
 * Làm gì:
 *   - Xóa computation cache của studentsRenderer (activeRows, debtRows, summary)
 *   - Schedule các student islands để re-render
 *   - [Cross-domain] Invalidate dashboard (activeCount thay đổi)
 *
 * @param {string} [reason]
 */
export function invalidateStudents(reason) {
    _checkStorm('students');

    // 1. Xóa students computation cache
    invalidateStudentsRender('all');

    // 2. [GITHUB-FIX] Refresh computation cache TRƯỚC rồi schedule islands
    //    Tránh island đọc cache rỗng sau khi vừa clear cache
    _refreshThenSchedule(_STUDENTS_KEYS, reason || 'students-domain');

    // 3. [Cross-domain] Students thay đổi → dashboard activeCount thay đổi
    _invalidateDashboardOnly('students-change');
}

// ── Inventory invalidation ────────────────────────────────────────────────────

/**
 * Invalidate inventory domain.
 *
 * Làm gì:
 *   - Xóa computation cache của inventoryRenderer (invListRows, uniformTxRows, liveMap)
 *   - Schedule các inventory islands để re-render
 *   - [Cross-domain] Inventory ghi nợ → ảnh hưởng finance tx list (công nợ kho đồ)
 *   - [Cross-domain] Inventory thay đổi → dashboard summary (nếu có thống kê kho)
 *
 * @param {string} [reason]
 */
export function invalidateInventory(reason) {
    _checkStorm('inventory');

    // 1. Xóa inventory computation cache
    invalidateInventoryRender('all');

    // 2. [GITHUB-FIX] Refresh computation cache TRƯỚC rồi schedule islands
    //    Tránh island đọc cache rỗng sau khi vừa clear cache
    _refreshThenSchedule(_INVENTORY_KEYS, reason || 'inventory-domain');

    // 3. [Cross-domain] Kho đồ ghi nợ → finance tx list (uniformTx cross-reference)
    //    Refresh computation cache cho tx list trước khi render
    invalidateFinanceRender('txTable');
    _refreshThenSchedule(['tx.txList'], 'inventory-affect-finance');

    // 4. [Cross-domain] Inventory thay đổi → dashboard summary
    _invalidateDashboardOnly('inventory-change');
}

// ── Dashboard invalidation ────────────────────────────────────────────────────

/**
 * Invalidate dashboard domain.
 *
 * Làm gì:
 *   - Xóa dashboardRenderer cache (reportHtml, chartData, bStats, summaryNumbers)
 *   - Mark dirty các dashboard islands — KHÔNG schedule nếu tab hidden
 *   - Khi user chuyển vào tab dashboard → flushDirtyRenders() tự flush
 *
 * Lý do KHÔNG force-schedule khi hidden:
 *   Dashboard là tab nặng (charts, branchStats, summary). Nếu user đang ở tab khác,
 *   không cần render ngay. Chỉ render khi user thực sự nhìn vào dashboard.
 *
 * @param {string} [reason]
 */
export function invalidateDashboard(reason) {
    _checkStorm('dashboard');
    _invalidateDashboardOnly(reason);
}

/**
 * Internal — invalidate dashboard mà không gây loop từ cross-domain calls.
 * Tất cả cross-domain → dashboard đều gọi hàm này.
 * @param {string} [reason]
 */
function _invalidateDashboardOnly(reason) {
    // [Part 1 FIX] Correct order: clear → recompute → render
    // Islands MUST NOT render from an empty cache.

    // 1. Clear stale dashboard cache
    invalidateDashboardCache('all');

    // 2. Recompute dashboard data BEFORE scheduling islands so they read fresh cache
    if (typeof window.refreshDashboardComputation === 'function') {
        try {
            window.refreshDashboardComputation(reason || 'dashboard-invalidate');
        } catch (e) {
            console.warn('[renderInvalidation] dashboard recompute before render failed:', e);
        }
    }

    // 3. Mark dirty + schedule — islands now read freshly rebuilt cache
    //    runRender(): tab active → schedule immediately; hidden → mark dirty, flush on show
    _DASHBOARD_KEYS.forEach(key => {
        invalidateRender(key);
        runRender(key);
    });
}

// ── Attendance invalidation ───────────────────────────────────────────────────

/**
 * Invalidate attendance domain.
 *
 * Làm gì:
 *   - Schedule các attendance islands để re-render
 *   - [Cross-domain] Attendance thay đổi → dashboard summary (số buổi học)
 *
 * @param {string} [reason]
 */
export function invalidateAttendance(reason) {
    _checkStorm('attendance');

    // 1. Schedule các attendance islands
    _scheduleIslands(_ATTENDANCE_KEYS);

    // 2. [Cross-domain] Attendance thay đổi → dashboard summary
    _invalidateDashboardOnly('attendance-change');
}

// ── Phase 3.5D: List-level invalidation API ──────────────────────────────────
//
// Các hàm này chỉ render ĐÚNG list island được chỉ định.
// Dùng cho pagination / loadMore / filter nhỏ — KHÔNG dùng cho data change lớn.
// Data change lớn (thêm/sửa/xóa) → vẫn dùng invalidateByDomain / domain API.

/**
 * Trả về danh sách list keys tương ứng với tabId.
 * Dùng để debug hoặc để invalidateLoadMoreTab() biết render key nào.
 *
 * @param {string} tab — tabId (e.g. 'active', 'tx', 'inventory')
 * @returns {string[]|null}  mảng list keys, hoặc null nếu tab không nhận ra
 */
export function getListKeyForTab(tab) {
    if (!tab) return null;
    return TAB_TO_LIST_KEYS[tab] || null;
}

/**
 * Invalidate ĐÚNG một list island theo key.
 *
 * Dùng cho pagination / loadMore khi biết chính xác list nào bị ảnh hưởng.
 * Không invalidate domain, không trigger cross-domain.
 *
 * Virtualization-ready boundary: mỗi list key là boundary rõ ràng,
 * sau này có thể window (virtual scroll) theo từng key.
 *
 * Fallback an toàn:
 *   - Nếu key không tồn tại trong registry → fallback invalidateCurrentTab()
 *   - Nếu renderRegistry chưa sẵn sàng → không crash
 *
 * @param {string}  key    — list key (e.g. 'tx.txList', 'students.activeList')
 * @param {string} [reason]
 */
export function invalidateList(key, reason) {
    if (!key) return;

    // [3.5D] Metrics — ghi nhận per-list count
    try {
        if (window.__renderLegacyMetrics) {
            const li = window.__renderLegacyMetrics.listInvalidations;
            li[key] = (li[key] || 0) + 1;
        }
    } catch (_) {}

    if (_isDev()) {
        console.debug(
            `[renderInvalidation] 🔬 invalidateList key="${key}" reason="${reason || ''}"`
        );
    }

    // [3.5E] Refresh computation cache TRƯỚC khi schedule island render.
    //
    // Vấn đề 3.5D: invalidateList() gọi runRender() trực tiếp → island đọc
    // computation cache cũ (vì computeAndCacheXxx() chưa chạy lại).
    //
    // Fix 3.5E: refreshListComputation(key) gọi computeAndCacheXxx() với params
    // hiện tại. Cache miss tự nhiên (paramsKey / _dataVersion thay đổi sau
    // _loadMore) → recompute → island đọc HTML mới ✅.
    //
    // Nếu refresh thất bại (attendance, dashboard, unknown key) → fallback safe.
    let computeRefreshOk = false;
    try {
        computeRefreshOk = refreshListComputation(key, reason || 'list-invalidate');
    } catch (refreshErr) {
        if (_isDev()) {
            console.warn(
                `[renderInvalidation] refreshListComputation("${key}") lỗi, tiếp tục fallback.`,
                refreshErr
            );
        }
    }

    if (!computeRefreshOk) {
        // Fallback: không có computation cache cho key này
        // (attendance, dashboard, hoặc key không nhận ra)
        // → dùng domain invalidation an toàn
        if (_isDev()) {
            const dom = getComputationDomainForList(key);
            console.debug(
                `[renderInvalidation] invalidateList: computeRefresh=false ` +
                `key="${key}" domain="${dom || 'unknown'}" → fallback invalidateCurrentTab()`
            );
        }
        try {
            invalidateCurrentTab(reason || ('list-fallback-' + key));
        } catch (_) {
            invalidateByDomain('all', reason || ('list-fallback-all-' + key));
        }
        return;
    }

    // Computation cache đã được refresh → schedule island render.
    // runRender() tự skip nếu tab hidden (mark dirty → flush khi tab active).
    try {
        // Virtualization-ready boundary: key này là stable boundary cho list render
        runRender(key);
    } catch (err) {
        // renderRegistry chưa sẵn sàng hoặc key lỗi — fallback an toàn
        console.warn(
            `[renderInvalidation] invalidateList: runRender("${key}") lỗi, fallback.`, err
        );
        try {
            invalidateCurrentTab(reason || ('list-fallback-' + key));
        } catch (_) {
            invalidateByDomain('all', reason || ('list-fallback-all-' + key));
        }
    }
}

/**
 * Invalidate nhiều list islands cùng lúc.
 *
 * Dùng khi một action ảnh hưởng nhiều list trong cùng tab
 * (ví dụ: inventory tab có cả inventoryList và uniformTxList).
 *
 * [3.5E] Dùng refreshListsComputation() để dedupe computation theo domain:
 *   - Nhiều keys cùng domain → computeAndCacheXxx() chỉ chạy MỘT LẦN
 *   - Tránh double computation khi invalidateLists(['students.activeList', 'students.debtList'])
 *   - Keys trả về fallback (attendance, dashboard) → invalidateCurrentTab() an toàn
 *
 * @param {string[]} keys   — mảng list keys
 * @param {string}  [reason]
 */
export function invalidateLists(keys, reason) {
    if (!Array.isArray(keys) || keys.length === 0) return;

    // [3.5E] Dedupe computation refresh theo domain — compute ONCE per domain
    let refreshed = [];
    let fallback  = [];
    try {
        const result = refreshListsComputation(keys, reason || 'list-invalidate-batch');
        refreshed = result.refreshed || [];
        fallback  = result.fallback  || [];
    } catch (err) {
        if (_isDev()) {
            console.warn(
                `[renderInvalidation] invalidateLists: refreshListsComputation lỗi, fallback tất cả.`, err
            );
        }
        // Nếu batch refresh lỗi → fallback toàn bộ keys
        fallback = [...keys];
        refreshed = [];
    }

    // Schedule island render cho các keys đã refresh computation thành công
    for (const key of refreshed) {
        // [3.5D] Metrics
        try {
            if (window.__renderLegacyMetrics) {
                const li = window.__renderLegacyMetrics.listInvalidations;
                li[key] = (li[key] || 0) + 1;
            }
        } catch (_) {}
        try {
            runRender(key);
        } catch (err) {
            console.warn(`[renderInvalidation] invalidateLists: runRender("${key}") lỗi.`, err);
            try { invalidateCurrentTab(reason || ('lists-fallback-' + key)); } catch (_) {}
        }
    }

    // Keys có fallback → dùng domain invalidation
    if (fallback.length > 0) {
        if (_isDev()) {
            console.debug(
                `[renderInvalidation] invalidateLists: ${fallback.length} fallback keys → invalidateCurrentTab()`,
                fallback
            );
        }
        // Một invalidateCurrentTab() là đủ cho tất cả fallback keys
        try {
            invalidateCurrentTab(reason || 'lists-fallback-batch');
        } catch (_) {
            invalidateByDomain('all', reason || 'lists-fallback-all');
        }
    }
}

/**
 * Invalidate list(s) phù hợp với tab đang loadMore.
 *
 * Phase 3.5D: thay thế direct renderApp() trong window._loadMore(tab).
 * Chỉ render đúng list(s) của tab đó — không invalidate toàn domain.
 *
 * Fallback cascade an toàn:
 *   1. Nếu tab có list keys → invalidateLists(keys)
 *   2. Nếu tab không nhận ra → invalidateCurrentTab() (domain của tab hiện tại)
 *   3. Nếu lỗi bất kỳ → không crash, chỉ log warning
 *
 * @param {string}  tab    — tabId (e.g. 'active', 'debt', 'tx')
 * @param {string} [reason]
 */
export function invalidateLoadMoreTab(tab, reason) {
    // [3.5D] Metrics
    try {
        if (window.__renderLegacyMetrics) {
            window.__renderLegacyMetrics.loadMoreInvalidationCalls++;
        }
    } catch (_) {}

    if (_isDev()) {
        console.debug(
            `[renderInvalidation] ⬇ invalidateLoadMoreTab tab="${tab}" reason="${reason || ''}"`
        );
    }

    try {
        const keys = getListKeyForTab(tab);
        if (keys && keys.length > 0) {
            // Virtualization-ready boundary: mỗi key trong keys là isolated list boundary
            invalidateLists(keys, reason || ('load-more-' + tab));
        } else {
            // Tab không có trong TAB_TO_LIST_KEYS → fallback invalidateCurrentTab
            if (_isDev()) {
                console.warn(
                    `[renderInvalidation] invalidateLoadMoreTab: tab="${tab}" không có list keys, ` +
                    `fallback invalidateCurrentTab()`
                );
            }
            invalidateCurrentTab(reason || ('load-more-fallback-' + tab));
        }
    } catch (err) {
        console.error(`[renderInvalidation] invalidateLoadMoreTab lỗi cho tab="${tab}":`, err);
        // Không crash app — silent fallback
        try { invalidateCurrentTab(reason); } catch (_) {}
    }
}

// ── Legacy bridges ────────────────────────────────────────────────────────────
// Expose lên window để backward compat với các chỗ gọi legacy còn sót.
// Bên trong bridge sang invalidation layer mới.

/**
 * Đăng ký tất cả legacy window bridges.
 * Gọi từ main.js sau khi bootstrap.
 *
 * Phase 3.5C: thêm metrics init, throttled warnings cho scheduleRender
 * và _moduleRenderApp, expose 3 API mới (invalidateCurrentTab, invalidateTab,
 * getCurrentActiveTabId).
 */
// ── Phase 3.7C+D: Large list safety — warn khi list quá lớn ──────────────────
// Không block render, không ảo hóa — chỉ warn + ghi metrics.
// Ngưỡng 500 rows được chọn dựa trên: 1000-1500 học viên / 3 tab = ~500/tab.
// Virtualization sẽ được bật trong Phase tương lai khi có đủ ranh giới.
const _LARGE_LIST_WARN_THRESHOLD = 500;
const _largeListMetricsInternal = {
    listRenderCalls:     {},
    largeListWarnings:   {},
    maxRowsPerList:      {},
    lastRowCountPerList: {},
    totalLargeListHits:  0,
    lastWarnedList:      null,
    lastWarnedRowCount:  0,
    lastWarnedAt:        null,
    trackedAt:           null,
};

/**
 * Ghi nhận số rows đã render cho một list island.
 * Nếu rowCount > _LARGE_LIST_WARN_THRESHOLD → console.warn + ghi metrics.
 *
 * @param {string} listKey   — e.g. 'students.activeList', 'inventory.inventoryList'
 * @param {number} rowCount  — số rows thực sự render trong lần này
 * @param {string} [reason]
 */
function _trackLargeListRender(listKey, rowCount, reason) {
    if (!listKey || typeof rowCount !== 'number') return;
    try {
        const k = String(listKey);
        _largeListMetricsInternal.listRenderCalls[k]
            = (_largeListMetricsInternal.listRenderCalls[k] || 0) + 1;
        _largeListMetricsInternal.lastRowCountPerList[k] = rowCount;
        if (rowCount > (_largeListMetricsInternal.maxRowsPerList[k] || 0)) {
            _largeListMetricsInternal.maxRowsPerList[k] = rowCount;
        }

        if (rowCount > _LARGE_LIST_WARN_THRESHOLD) {
            _largeListMetricsInternal.largeListWarnings[k]
                = (_largeListMetricsInternal.largeListWarnings[k] || 0) + 1;
            _largeListMetricsInternal.totalLargeListHits++;
            _largeListMetricsInternal.lastWarnedList     = k;
            _largeListMetricsInternal.lastWarnedRowCount = rowCount;
            _largeListMetricsInternal.lastWarnedAt       = Date.now();
            // [Phase 3.7C+D] Virtualization-readiness warning
            console.warn(
                `[LargeListWarning] list="${k}" rowCount=${rowCount} > threshold=${_LARGE_LIST_WARN_THRESHOLD}. ` +
                `Cân nhắc virtualization (window scroll / intersection observer) cho list này. ` +
                (reason ? `reason="${reason}"` : '')
            );
        }

        _largeListMetricsInternal.trackedAt = Date.now();
        // Sync to window object
        if (window.__largeListMetrics) {
            Object.assign(window.__largeListMetrics, _largeListMetricsInternal);
        }
    } catch (_) {}
}

export function registerInvalidationLegacyGlobals() {
    // ── [3.5C] Khởi tạo metrics trước tất cả bridges ─────────────────────
    _initLegacyMetrics();

    // ── [3.7C+D] Khởi tạo __largeListMetrics — large list safety ─────────
    if (!window.__largeListMetrics) {
        window.__largeListMetrics = {
            listRenderCalls:     {},
            largeListWarnings:   {},
            maxRowsPerList:      {},
            lastRowCountPerList: {},
            totalLargeListHits:  0,
            lastWarnedList:      null,
            lastWarnedRowCount:  0,
            lastWarnedAt:        null,
            trackedAt:           null,
            threshold:           _LARGE_LIST_WARN_THRESHOLD,
        };
    }
    window.trackLargeListRender = _trackLargeListRender;

    // ── [3.8A] window.printLargeListMetrics — debug helper ───────────────
    window.printLargeListMetrics = function() {
        const m = window.__largeListMetrics || _largeListMetricsInternal;
        console.group('[LargeListMetrics] Phase 3.8A — Large List Safety');
        console.table({
            totalLargeListHits:  { value: m.totalLargeListHits },
            threshold:           { value: m.threshold || _LARGE_LIST_WARN_THRESHOLD },
            lastWarnedList:      { value: m.lastWarnedList  || '—' },
            lastWarnedRowCount:  { value: m.lastWarnedRowCount || 0 },
            lastWarnedAt:        { value: m.lastWarnedAt ? new Date(m.lastWarnedAt).toISOString() : '—' },
            trackedAt:           { value: m.trackedAt    ? new Date(m.trackedAt).toISOString()    : '—' },
        });
        const allKeys = new Set([
            ...Object.keys(m.listRenderCalls || {}),
            ...Object.keys(m.largeListWarnings || {}),
        ]);
        if (allKeys.size > 0) {
            const rows = {};
            allKeys.forEach(k => {
                rows[k] = {
                    renderCalls:     (m.listRenderCalls     || {})[k] || 0,
                    largeListWarns:  (m.largeListWarnings   || {})[k] || 0,
                    maxRowsSeen:     (m.maxRowsPerList      || {})[k] || 0,
                    lastRowCount:    (m.lastRowCountPerList || {})[k] || 0,
                };
            });
            console.group('Per-list breakdown:');
            console.table(rows);
            console.groupEnd();
        }
        console.groupEnd();
        return m;
    };

    // ── Legacy bridges (giữ nguyên từ Phase 3.5B) ─────────────────────────

    window.invalidateFinanceRender = function(section) {
        if (section === 'all' || !section) {
            invalidateFinance('legacy-invalidateFinanceRender');
        } else {
            // Section-specific: chỉ xóa cache, không cross-domain
            invalidateFinanceRender(section);
            _scheduleIslands(_FINANCE_KEYS);
        }
    };

    window.invalidateStudentsRender = function(section) {
        if (section === 'all' || !section) {
            invalidateStudents('legacy-invalidateStudentsRender');
        } else {
            invalidateStudentsRender(section);
            _scheduleIslands(_STUDENTS_KEYS);
        }
    };

    window.invalidateInventoryRender = function(section) {
        if (section === 'all' || !section) {
            invalidateInventory('legacy-invalidateInventoryRender');
        } else {
            invalidateInventoryRender(section);
            _scheduleIslands(_INVENTORY_KEYS);
        }
    };

    // ── [3.5C] window.scheduleRender — warning + metrics + invalidate all ─
    // Phase 3.5B: gọi invalidateByDomain('all', ...)
    // Phase 3.5C: THÊM throttled warning + metrics counter.
    // Logic không đổi — backward compat 100%.
    window.scheduleRender = function(reason) {
        // [3.5C] Tăng counter metrics
        if (window.__renderLegacyMetrics) {
            window.__renderLegacyMetrics.scheduleRenderCalls++;
        }
        // [3.5C] Throttled warning — giúp tìm chỗ còn gọi legacy
        // Throttle per reason-key để tránh spam khi Firestore snapshot bắn liên tục
        _throttledWarn(
            'scheduleRender:' + (reason || '__default__'),
            '[LegacyRenderWarning] scheduleRender() called — xem xét dùng domain invalidation.',
            reason
        );
        // Vẫn invalidate all như Phase 3.5B — không phá backward compat
        invalidateByDomain('all', reason || 'legacy-scheduleRender');
    };

    // ── [3.5C] window._moduleRenderApp — wrap với warning + metrics ───────
    // Lưu original TRƯỚC khi wrap (từ render.js initRender).
    // Không gây recursion: _origModuleRenderApp là render.js renderApp,
    // không phải wrapper này.
    // Chỉ wrap nếu đã set (initRender đã chạy); nếu chưa, tạm để placeholder.
    (function _wrapModuleRenderApp() {
        const _orig = window._moduleRenderApp;
        window._moduleRenderApp = function(reason) {
            // [3.5C] Metrics
            if (window.__renderLegacyMetrics) {
                window.__renderLegacyMetrics.moduleRenderAppCalls++;
            }
            // [Phase 4K-6H] LegacyRenderEntrypoints metrics
            window.LegacyRenderEntrypoints?.recordLegacyRenderCall?.(
                'moduleRenderApp',
                reason || 'unknown',
                { source: 'renderInvalidation.js' }
            );
            // [3.5C] Throttled warning — giữ nguyên
            _throttledWarn(
                '_moduleRenderApp:' + (reason || '__default__'),
                '[LegacyRenderWarning] _moduleRenderApp() called — ưu tiên dùng invalidateByDomain/invalidateCurrentTab.',
                reason
            );
            // Gọi original (render.js renderApp) — không gây recursion
            if (typeof _orig === 'function') {
                return _orig.call(this);
            }
        };
    })();

    // ── Domain invalidation APIs (Phase 3.5B — giữ nguyên) ───────────────
    window.invalidateFinance    = invalidateFinance;
    window.invalidateStudents   = invalidateStudents;
    window.invalidateInventory  = invalidateInventory;
    window.invalidateDashboard  = invalidateDashboard;
    window.invalidateAttendance = invalidateAttendance;
    window.invalidateByDomain   = invalidateByDomain;

    // ── [3.5C] Tab-aware APIs mới ─────────────────────────────────────────
    window.invalidateCurrentTab  = invalidateCurrentTab;
    window.invalidateTab         = invalidateTab;
    window.getCurrentActiveTabId = getCurrentActiveTabId;

    // ── [3.5D] List-level invalidation APIs ──────────────────────────────
    // invalidateList     — chỉ render đúng một list island (stable boundary)
    // invalidateLists    — render nhiều list islands cùng lúc (dedupe domain)
    // invalidateLoadMoreTab — dùng bởi window._loadMore thay cho renderApp()
    // getListKeyForTab   — debug helper, xem tab map sang key nào
    window.invalidateList          = invalidateList;
    window.invalidateLists         = invalidateLists;
    window.invalidateLoadMoreTab   = invalidateLoadMoreTab;
    window.getListKeyForTab        = getListKeyForTab;

    // ── [3.5E] Computation refresh APIs ──────────────────────────────────
    // refreshListComputation  — refresh computation cache cho một list key
    // refreshListsComputation — batch refresh, dedupe theo domain
    // getComputationDomainForList — debug helper
    window.refreshListComputation     = refreshListComputation;
    window.refreshListsComputation    = refreshListsComputation;
    window.getComputationDomainForList = getComputationDomainForList;

    if (_isDev()) {
        console.info(
            '[renderInvalidation] ✅ Phase 3.5E — list-level computation refresh registered. ' +
            'invalidateList() nay refresh computation cache trước khi render island. ' +
            'Gõ window.printRenderLegacyMetrics() để xem full metrics.'
        );
    }
}
