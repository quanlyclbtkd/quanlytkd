/**
 * main.js — Application Bootstrap (Phase 3.6B — Listener Registration Safety)
 * ────────────────────────────────────────────────────────────────────
 * ĐIỂM KHỞI ĐỘNG DUY NHẤT của ứng dụng.
 *
 * Phase 3.6B UPGRADES:
 *   - safeRegisterSnapshot exposed lên window — guard trước khi tạo onSnapshot
 *   - markListenerSnapshot exposed lên window — ghi nhận snapshot hit
 *   - window.debugListeners() helper — xem metrics + active entries nhanh
 *   - window.__listenerSessionId — session guard cho listener lifecycle
 *   - window.legacyAddListener exposed — bridge push → registry
 *   - Health check + debug panel cập nhật các globals mới
 *
 * Phase 3.5C UPGRADES (giữ nguyên):
 *   - invalidateCurrentTab(reason) — invalidate domain của tab đang active
 *   - invalidateTab(tabId, reason) — invalidate theo tabId cụ thể
 *   - getCurrentActiveTabId()      — helper đọc tabId từ DOM
 *   - window.__renderLegacyMetrics — metrics đếm legacy call
 *   - printRenderLegacyMetrics()   — console.table helper
 *
 * Phase 3.6 UPGRADES (giữ nguyên):
 *   - window.registerListener, hasListener, removeListener, cleanupAllListeners
 *   - window.printListenerMetrics, getListenerMetrics
 *   - window.__listenerMetrics getter
 *
 * THỨ TỰ LOAD:
 *   1. index.html inline script → window._fb_init (Firebase CDN)
 *   2. <script defer src="app.js"> → window.__appLoaded = true (legacy bootstrap)
 *   3. <script type="module" src="js/main.js"> → module override (file này)
 * ────────────────────────────────────────────────────────────────────
 */

// ── Phase 1–3.2: Core imports (eager — cần ngay khi app start) ──
import { store, resetStore }                  from './store.js';
import { initFirebase }                        from './firebase/config.js';
import { showToast, registerToastGlobal }      from './ui/toast.js';
import { registerModalGlobals }                from './ui/modal.js';
import { switchTab, registerTabGlobals }       from './ui/tabs.js';
import { initRender }                          from './ui/render.js';
// Phase 3.4: Render Isolation Architecture — island initialisers + legacy shims
import { initFinanceIslands, registerFinanceLegacyGlobals }     from './ui/render/renderFinance.js';
import { initStudentIslands, registerStudentsLegacyGlobals }     from './ui/render/renderStudents.js';
import { initInventoryIslands, registerInventoryLegacyGlobals }  from './ui/render/renderInventory.js';
import { initAttendanceIslands }                                  from './ui/render/renderAttendance.js';
import { initDashboardIslands }                                   from './ui/render/renderDashboard.js';
// Phase 3.5B: Render Invalidation & Lifecycle Stabilization
import { registerInvalidationLegacyGlobals }                     from './ui/render/renderInvalidation.js';
import { registerLoadingGlobals, showLoading, hideLoading, forceHideLoading } from './ui/loading.js';
import {
    getLocalToday, formatDate, formatMonth,
    addMonthsToYYYYMM, normalizeYYYYMM,
    formatMonthCompact, getBeltBadge,
} from './utils/format.js';
import { escapeForAttr, escapeHtml, formatVND, parseVND } from './utils/helpers.js';
// ── Phase 4K-4G: Monthly revenue allocation + active student sort ─────────────
import { initMonthlyHelpers } from './utils/monthlyHelpers.js';
import { TAB_LISTS, DEFAULT_CLUB_CONFIG }      from './utils/constants.js';
import {
    getActiveKeys,
    listenerCount,
    registerListener,
    safeRegisterSnapshot,
    hasListener,
    removeListener,
    markListenerSnapshot,
    recordSnapshot,
    cleanupListenersByOwner,
    cleanupListenersByScope,
    cleanupListenersByTabId,
    cleanupAllListeners,
    getListenerMetrics,
    printListenerMetrics,
    legacyAddListener,
} from './utils/listeners.js';
import { guardOnce, resetAllGuards, getBindingCount } from './utils/event-guard.js';

// ── Phase 3.3E: Firestore safety (expose globally for services) ──
import { safeGetDocs, printQueryAuditReport }  from './utils/firestore-guard.js';

// ── Phase 3.6D / 3.7A: Student Profile Store compatibility layer ──────────
import {
    studentProfileStore,
    syncLegacyAllProfiles,
    ensureProfilesForTab,
    getProfileByIdSafe,
    getProfileScaleMetrics,
    printProfileScaleMetrics,
    resetStudentProfileStore,
    classifyProfileStatus,
} from './data/studentProfileStore.js';

// ── Phase 3.7B / 3.7C: Active Profiles Listener + Lazy Quit Profiles ─────────
import {
    mountActiveProfilesListener,
    cleanupActiveProfilesListener,
    loadQuitProfilesIfNeeded,
    cleanupQuitProfilesListener,
    loadFullProfilesFallback,
    isQuitProfilesLoaded,
    resetProfilesListeners,
    getActiveStatusValues,
    getQuitStatusValues,
    getProfilesListenerMetrics,
    ensureAllProfilesForExport,
} from './listeners/profiles.listeners.js';

// ── Phase 3.7C: Profile Status Config ────────────────────────────────────────
import {
    getProfileStatusConfig,
    setProfileStatusConfigForDebug,
    resetProfileStatusConfig,
} from './data/profileStatusConfig.js';

// ── Phase 3.8B: Inventory Debt Derivation & Feature Guard Completion ──────────
import {
    inventoryStore,
    // Write
    setInventoryStats,
    setFinanceInventoryDebts,
    setInventoryHistory,
    setAllInventory,
    // Derive + Index
    normalizeStudentKey,
    deriveFinanceInventoryDebts,
    deriveAndSetFinanceInventoryDebts,
    rebuildInventoryDebtIndex,
    isInventoryDebtIndexReady,
    // Lookup helpers
    getInventoryDebtsForStudent,
    getInventoryDebtTotalForStudent,
    getInventoryDebtSummaryForStudent,
    // Read
    getInventoryStats,
    getFinanceInventoryDebts,
    getInventoryHistory,
    getAllInventoryCompat,
    isInventoryHistoryLoaded,
    isFinanceDebtLoaded,
    resetInventoryStore,
    ensureInventoryForFeature,
    getInventoryDependencyMetrics,
    printInventoryDependencyMetrics,
    // [Phase 3.8C] Unpaid debt query state
    markUnpaidDebtQueryLoaded,
    markUnpaidDebtQueryFailed,
    getUnpaidInventoryDebtsLoaded,
} from './data/inventoryStore.js';

// ── Phase 3.8C: Paginated Query Utility & Scale Metrics ──────────────────────
import {
    fetchAllMatchingDocs,
    loadTransactionsForPeriod,
    createPaginationCursorState as createQueryCursorState,
    warnUnsafeLimit,
    printQueryScaleMetrics,
} from './firebase/paginatedQuery.js';

// ── Phase 2d–3.2A: Business modules (eager — cần khi login) ────
import { initStudents, initStudentPagination }        from './modules/students.js';
// PHẦN 1 FIX + Phase 4K-2: Unified Search Controller — real cache + SearchBlob + stale guard
import {
    initGlobalSearchRuntime,
    disposeGlobalSearchRuntime,
    getSearchRuntimeState,
    invalidateSearchCache,
    debugSearchPerformance,
} from './modules/searchRuntime.js';
import { initFinance, initTransactionPagination }     from './modules/finance.js';
import { initInventory }                              from './modules/inventory.js';
import { initAttendance }                             from './modules/attendance.js';
import { initDashboard }                              from './modules/dashboard.js';
// ── Phase 4.0A: Reports / Export module ─────────────────────────
import { initReports }                                from './modules/reports.js';
// ── Phase 4.0B-1: SuperAdmin — eager import trên HTTP/HTTPS ─────
// Không lazy nữa: phải init trước khi loadSuperAdminData() được gọi.
import { initSuperAdmin }                             from './modules/superadmin.js';

// ── Phase 3.1: Event layer ──────────────────────────────────────
import { initStudentsEvents }                         from './events/students.events.js';
import { initFinanceEvents, initFinanceActionEvents } from './events/finance.events.js';

// ────────────────────────────────────────────────────────────────
// Phase 3.3G: GLOBAL ERROR HANDLERS
// ────────────────────────────────────────────────────────────────

// ── Phase 3.6D: Bootstrap duplicate load guard ────────────────────────────
// Set ngay khi module bắt đầu execute — trước cả IIFE bootstrap().
// index.html Block 1 dùng window.MAIN_JS_LOADING để ngăn inject lần 2.
// window.MAIN_JS_LOADED là signal sau-load để code khác có thể check.
window.MAIN_JS_LOADED = true;
console.debug('[Bootstrap] main.js loaded once ✓ (Phase 3.6D)');

// ────────────────────────────────────────────────────────────────
// Phase 4.0B-4B: RUNTIME HEALTH CHECK REGISTRY
// Phân loại severity: critical / warning / info
// phase: 'bootstrap'  → kiểm tra ngay khi main.js load
//        'after-login' → kiểm tra sau khi user login + data mount
// ────────────────────────────────────────────────────────────────
const RUNTIME_HEALTH_CHECKS = [
    // ── Critical bootstrap: bắt buộc có TRƯỚC khi app có thể dùng được ─
    {
        key:      'appLoaded',
        label:    'Legacy app.js loaded',
        severity: 'critical',
        phase:    'bootstrap',
        check:    () => window.__appLoaded === true || typeof window.showLoading === 'function',
    },
    {
        key:      'mainLoaded',
        label:    'main.js module loaded',
        severity: 'critical',
        phase:    'bootstrap',
        check:    () => window.MAIN_JS_LOADED === true,
    },
    {
        key:      'renderBridge',
        label:    'Render bridge available',
        severity: 'critical',
        phase:    'bootstrap',
        check:    () => typeof window._moduleRenderApp === 'function' || typeof window.renderApp === 'function',
    },
    // ── Warning bootstrap: cần có nhưng không làm app hoàn toàn broken ─
    {
        key:      'tabBridge',
        label:    'Tab bridge available',
        severity: 'warning',
        phase:    'bootstrap',
        check:    () => typeof window.switchTab === 'function',
    },
    {
        key:      'loadingBridge',
        label:    'Loading UI bridge available',
        severity: 'warning',
        phase:    'bootstrap',
        check:    () => typeof window.showLoading === 'function' && typeof window.hideLoading === 'function',
    },
    {
        key:      'toastBridge',
        label:    'Toast bridge available',
        severity: 'warning',
        phase:    'bootstrap',
        check:    () => typeof window.showToast === 'function',
    },
    // ── Warning after-login: chỉ mount sau khi user login + data load ──
    {
        key:      'listenerBridge',
        label:    'Listener registry bridge',
        severity: 'warning',
        phase:    'after-login',
        check:    () => typeof window.registerListener === 'function' || typeof window.safeRegisterSnapshot === 'function',
    },
    {
        key:      'profileBridge',
        label:    'Student profile bridge',
        severity: 'warning',
        phase:    'after-login',
        check:    () => typeof window.syncProfilesToStudentStore === 'function' || !!window.studentProfileStore,
    },
    {
        key:      'financeBridge',
        label:    'Finance bridge available',
        severity: 'warning',
        phase:    'after-login',
        check:    () => typeof window.invalidateFinance === 'function' || typeof window.quickPay === 'function',
    },
    {
        key:      'inventoryBridge',
        label:    'Inventory bridge available',
        severity: 'warning',
        phase:    'after-login',
        check:    () => typeof window.invalidateInventory === 'function' || typeof window.getInvCategories === 'function',
    },
    // ── Info after-login: optional — app vẫn chạy nếu thiếu ────────────
    {
        key:      'superAdminModule',
        label:    'SuperAdmin module bound',
        severity: 'info',
        phase:    'after-login',
        check:    () => !!window.SuperAdminModule || typeof window.ensureSuperAdminModule === 'function',
    },
    {
        key:      'invalidateBridge',
        label:    'Invalidation bridge available',
        severity: 'info',
        phase:    'after-login',
        check:    () => typeof window.invalidateByDomain === 'function' || typeof window.invalidateCurrentTab === 'function',
    },
    // Phase 4K-2: Unified Search Runtime + Real Cache + SearchBlob
    {
        key:      'check:search-runtime-real-cache',
        label:    'Search Runtime Real Cache (Phase 4K-2)',
        severity: 'info',
        phase:    'after-login',
        check:    () => !!window.__searchRuntimeMounted &&
                        typeof window.getProfileSearchBlob     === 'function' &&
                        typeof window.getTransactionSearchBlob === 'function' &&
                        typeof window.getInventorySearchBlob   === 'function' &&
                        typeof window.invalidateSearchCacheForCurrentTab === 'function' &&
                        typeof window.debugSearchPerformance   === 'function',
    },
];

// [Phase 4.0B-3] Expose escapeHtml lên window để app.js (non-module) có thể dùng.
// app.js không thể import ES module trực tiếp — bridge qua window là an toàn.
// Ưu tiên window.escapeHtml đã có (nếu đã set bởi đoạn khác) để tránh override.
if (!window.escapeHtml) window.escapeHtml = escapeHtml;

const _isDev = window.location.hostname === 'localhost'
            || window.location.hostname === '127.0.0.1'
            || (window.location.hostname.endsWith('.web.app') && window.location.search.includes('debug=1'));

window.onerror = function(message, source, line, col, error) {
    if (source && (source.includes('cdn.') || source.includes('jsdelivr'))) return false;
    if (_isDev) console.error('[main.js] ❌ Runtime error:', { message, source, line, col, error });
    return false;
};

window.addEventListener('unhandledrejection', function(event) {
    if (_isDev) console.error('[main.js] ❌ Unhandled Promise rejection:', event.reason);
});

// ────────────────────────────────────────────────────────────────
// Phase 3.3G: INTERVAL TRACKER
// ────────────────────────────────────────────────────────────────

const _intervalRegistry = new Map();

function trackInterval(key, fn, ms) {
    if (_intervalRegistry.has(key)) {
        clearInterval(_intervalRegistry.get(key));
    }
    const id = setInterval(fn, ms);
    _intervalRegistry.set(key, id);
    return id;
}

function clearAllIntervals() {
    _intervalRegistry.forEach(id => clearInterval(id));
    _intervalRegistry.clear();
}

window._clearAllIntervals = clearAllIntervals;

// ────────────────────────────────────────────────────────────────
// Phase 3.3C: LAZY MODULE REGISTRY
// ────────────────────────────────────────────────────────────────

const _lazyLoaded = new Set();

async function lazyLoad(key, importer, initFn) {
    if (_lazyLoaded.has(key)) return;
    _lazyLoaded.add(key);

    try {
        showLoading('Đang tải module...', 100);
        const mod = await importer();
        if (initFn && typeof mod[initFn] === 'function') {
            await mod[initFn]();
        }
        return mod;
    } catch (err) {
        _lazyLoaded.delete(key);
        console.error(`[main.js] ❌ Lazy load thất bại: "${key}"`, err);
        throw err;
    } finally {
        hideLoading();
    }
}

const LAZY_TAB_MODULES = {
    exam: {
        key:    'module-exam',
        import: () => import('./modules/exam.js'),
        init:   'initExam',
    },
    // [Phase 4.0B-1] SuperAdmin đã được eager-import ở trên, không lazy nữa.
    // Giữ entry để ensureTabModule('superadmin') vẫn gọi được initSuperAdmin idempotent.
    superadmin: {
        key:    'module-superadmin',
        import: () => import('./modules/superadmin.js'),
        init:   'initSuperAdmin',
    },
};

async function ensureTabModule(tabId) {
    const spec = LAZY_TAB_MODULES[tabId];
    if (!spec) return;
    try {
        await lazyLoad(spec.key, spec.import, spec.init);
    } catch (err) {
        if (_isDev) console.warn(`[main.js] Lazy load tab "${tabId}" thất bại:`, err);
    }
}

// ── Phase 4K-RUNTIME-INIT-FIX: Early fallback for ensureModuleRuntimeReady ──
// Real impl is assigned at window.ensureModuleRuntimeReady = function(...) below (line 1047+),
// OUTSIDE the bootstrap IIFE. When bootstrap runs with __appLoaded=true there may be no
// await before the guard call, meaning the outer module hasn't yet reached line 1047.
// This fallback ensures the check never fires "[Bootstrap] ensureModuleRuntimeReady chưa sẵn sàng".
window.ensureModuleRuntimeReady = window.ensureModuleRuntimeReady || function _ensureRuntimeReadyFallback(moduleName) {
    if (!window.__runtimeReadyFallbackWarned) {
        window.__runtimeReadyFallbackWarned = true;
        console.info('[RuntimeReady] fallback active before full runtime ready:', moduleName, '(expected — real impl will be assigned after bootstrap)');
    }
    return false;
};

// ────────────────────────────────────────────────────────────────
// Phase 4K-3: Tuition Receipt + Student Profile Runtime Bridges
// ────────────────────────────────────────────────────────────────

/**
 * _findTransactionById — tìm transaction từ nhiều store source.
 * Không dùng row index vì index thay đổi sau search/filter/pagination.
 */
function _findTransactionById(txId) {
    const id = String(txId || '').trim();
    if (!id) return null;
    const st = window.__store || {};
    const sources = [
        st.transactions,
        st.allTransactions,
        window.allTransactions,
        window.__allTransactions,
        st.pagination && st.pagination.transactions && st.pagination.transactions.currentItems,
    ];
    for (const arr of sources) {
        if (!Array.isArray(arr)) continue;
        const found = arr.find(t => String(t.id || t.txId || t.docId || '') === id);
        if (found) return found;
    }
    return null;
}

/**
 * _installTuitionActionBridges — mount window.printTuitionReceiptByTxId và
 * window.openStudentProfileByName (hardened Phase 4K-3B).
 * Idempotent — gọi nhiều lần không gây vấn đề.
 */
function _installTuitionActionBridges() {
    // ── Bridge: In biên lai theo txId (hardened — không fallback 0 đồng) ──
    window.__printTuitionBridgeHardened = true;
    window.printTuitionReceiptByTxId = function(txId, opts) {
        opts = opts || {};
        const tx = _findTransactionById(txId);
        if (!tx) {
            console.warn('[tuition-receipt] transaction not found for txId:', txId,
                '— checking opts attrs');
            // Hardened: chỉ in khi có amount thực từ button attrs (không in 0 đồng)
            if (typeof window.exportReceipt === 'function'
                && opts.studentName
                && Number(opts.amount) > 0) {
                const sName    = String(opts.studentName || '').trim();
                const sAmt     = Number(opts.amount) || 0;
                const sType    = String(opts.type || 'Học phí');
                const sDate    = String(opts.date || '');
                const sMonths  = String(opts.txMonths || '');
                const sBranch  = String(opts.branch || 'CS1');
                const sExam    = String(opts.examTitle || '');
                console.info('[tuition-receipt] fallback from button attrs — amount:', sAmt);
                window.exportReceipt(sName, sAmt, sType, sDate, sMonths, sBranch, sExam, 'BIÊN LAI THU TIỀN');
            } else {
                console.warn('[tuition-receipt] cannot print — txId not in store and no valid amount in opts');
            }
            return;
        }
        if (typeof window.exportReceipt !== 'function') {
            console.warn('[tuition-receipt] window.exportReceipt not available');
            return;
        }
        const name      = (tx.description ? tx.description.trim() : '') || opts.studentName || '';
        const amount    = Number(tx.amount) || 0;
        const date      = tx.date || '';
        const branch    = tx.branch || 'CS1';
        // Phase 4K-5E: Bundle — đọc components để tạo breakdown đầy đủ khi in lại
        let type, txMonths, examTitle, breakdown;
        if (Array.isArray(tx.components) && tx.components.length > 0) {
            type      = tx.bundleTypeLabel || tx.type || 'Thu gộp';
            breakdown = tx.components.map(function(c) { return { label: c.label || c.type || c.kind, amount: Number(c.amount || 0) }; });
            const _tuitionComp = tx.components.find(function(c){ return c.kind === 'tuition'; });
            const _examComp    = tx.components.find(function(c){ return c.kind === 'exam'; });
            txMonths  = _tuitionComp && Array.isArray(_tuitionComp.packageMonths)
                ? _tuitionComp.packageMonths.join(',')
                : (tx.packageMonths ? tx.packageMonths.join(',') : (tx.txMonth || ''));
            examTitle = _examComp ? (_examComp.examTitle || '') : (tx.examTitle || '');
        } else {
            type      = tx.type || 'Học phí';
            txMonths  = tx.packageMonths ? tx.packageMonths.join(',') : (tx.txMonth || '');
            examTitle = tx.examTitle || '';
            breakdown = null;
        }
        window.exportReceipt(name, amount, type, date, txMonths, branch, examTitle, 'BIÊN LAI THU TIỀN', breakdown);
    };

    // ── Bridge: Mở hồ sơ võ sinh theo tên (+ normalize Vietnamese) ──
    window.openStudentProfileByName = function(studentName) {
        const name = String(studentName || '').trim();
        if (!name) return;

        // Normalize helper — dùng window.normalizeVNForSearch nếu có
        const _nvFn = window.normalizeVNForSearch || function(v) {
            return String(v || '')
                .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
                .replace(/đ/g, 'd').replace(/Đ/g, 'D')
                .toLowerCase().trim();
        };

        if (typeof window.openProfile === 'function') {
            // Thử trực tiếp với tên gốc trước
            const allProfiles = (window.__store && window.__store.profiles) || window.allProfiles || {};
            if (allProfiles[name]) {
                window.openProfile(name);
                return;
            }
            // Normalize fallback — tìm key khớp sau khi normalize tiếng Việt
            const normName = _nvFn(name);
            const matchedKey = Object.keys(allProfiles).find(k => _nvFn(k) === normName);
            if (matchedKey) {
                window.openProfile(matchedKey);
                return;
            }
            // Last resort: gọi với tên gốc (để legacy app tự tìm)
            window.openProfile(name);
            return;
        }
        if (typeof window.editProfile === 'function') {
            window.editProfile(name);
        } else if (typeof window.showStudentModal === 'function') {
            window.showStudentModal(name);
        } else {
            console.warn('[student-profile] No profile opener available for:', name);
        }
    };
}

// ── Phase 4K-3B: Debug helper (hardened) ────────────────────────────────
window.debugTuitionActions = function() {
    const st   = window.__store || {};
    const rows = Array.from(document.querySelectorAll('#txList tr'));
    const _firstPrintEl = document.querySelector(
        '[data-action="print-tuition-receipt"], .js-print-tuition-receipt'
    );
    const _sampleTxIds = Array.from(document.querySelectorAll('[data-tx-id]'))
        .slice(0, 5).map(function(el) { return el.getAttribute('data-tx-id'); });
    const result = {
        href:        location.href,
        protocol:    location.protocol,
        runtimeMode: window.__RUNTIME_MODE || '',
        mainLoaded:  !!window.MAIN_JS_LOADED,
        appLoaded:   !!window.__appLoaded,
        currentTab:  typeof window.getCurrentActiveTabId === 'function'
            ? window.getCurrentActiveTabId() : '',
        txRows:      rows.length,
        printButtons:   document.querySelectorAll('[data-action="print-tuition-receipt"], .js-print-tuition-receipt').length,
        profileButtons: document.querySelectorAll('[data-action="open-student-profile"], .js-open-student-profile').length,
        hasPrintBridge:   typeof window.printTuitionReceiptByTxId === 'function',
        hasProfileBridge: typeof window.openStudentProfileByName === 'function',
        printBridgeHardened: !!window.__printTuitionBridgeHardened,
        hasFinanceEvents: !!window.__financeActionEventsMounted,
        storeTransactions: Array.isArray(st.transactions) ? st.transactions.length : -1,
        paginationTransactions: Array.isArray(
            st.pagination && st.pagination.transactions && st.pagination.transactions.currentItems
        ) ? st.pagination.transactions.currentItems.length : -1,
        firstRowText:    rows[0] ? rows[0].textContent.trim().slice(0, 160) : '',
        firstPrintBtn:   _firstPrintEl ? _firstPrintEl.outerHTML.slice(0, 300) : '',
        firstPrintDataset: _firstPrintEl ? Object.fromEntries(
            Object.entries(_firstPrintEl.dataset)
        ) : null,
        sampleTxIds:     _sampleTxIds,
        firstProfileBtn: (document.querySelector('[data-action="open-student-profile"], .js-open-student-profile') || {}).outerHTML || '',
    };
    console.table(result);
    return result;
};

// ── Phase 4K-3B: Admission Uniform Size Bridges ──────────────────────────
/**
 * _installAdmissionUniformSizeBridges — mount các bridge cần thiết cho
 * chức năng chọn size võ phục trong form Thu tiền nhập học.
 * Idempotent — gọi nhiều lần không gây vấn đề.
 */
function _installAdmissionUniformSizeBridges() {

    // ── 1. ensureInventoryReady ──────────────────────────────────────
    if (!window.ensureInventoryReady) {
        window.ensureInventoryReady = async function(reason) {
            reason = reason || 'inventory-needed';
            // Guard: đang chờ promise cũ → trả về cùng promise
            if (window.__inventoryReadyPromise) return window.__inventoryReadyPromise;

            const st = window.__store || {};
            if (Array.isArray(st.inventory) && st.inventory.length > 0) return true;
            // Legacy allInventory đã populate
            if (Array.isArray(window.allInventory) && window.allInventory.length > 0) {
                if (window.__store) window.__store.inventory = window.allInventory;
                return true;
            }

            window.__inventoryReadyPromise = (async function() {
                for (let i = 0; i < 50; i++) {
                    const _st = window.__store || {};
                    if (Array.isArray(_st.inventory) && _st.inventory.length > 0) {
                        window.__inventoryReadyLoadedAt = Date.now();
                        window.__inventoryReadyPromise  = null;
                        return true;
                    }
                    if (Array.isArray(window.allInventory) && window.allInventory.length > 0) {
                        if (window.__store) window.__store.inventory = window.allInventory;
                        window.__inventoryReadyLoadedAt = Date.now();
                        window.__inventoryReadyPromise  = null;
                        return true;
                    }
                    await new Promise(function(r) { setTimeout(r, 100); });
                }
                console.warn('[inventory-ready] timed out. reason:', reason);
                window.__inventoryReadyPromise = null;
                return false;
            })();

            return window.__inventoryReadyPromise;
        };
    }

    // ── 2. getUniformSizesFromInventory ──────────────────────────────
    if (!window.getUniformSizesFromInventory) {
        window.getUniformSizesFromInventory = function(options) {
            options = options || {};
            const uniformOnly = options.uniformOnly !== false; // default true

            const _nvFn = window.normalizeVNForSearch || function(v) {
                return String(v || '')
                    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
                    .replace(/đ/g, 'd').replace(/Đ/g, 'D')
                    .toLowerCase().trim();
            };

            // Thử dùng _liveInvMap đã build sẵn bởi legacy renderApp()
            if (window._liveInvMap && Object.keys(window._liveInvMap).length > 0) {
                const sizeSet = new Map();
                Object.entries(window._liveInvMap).forEach(function(entry) {
                    const key = entry[0]; const s = entry[1];
                    if (uniformOnly) {
                        const catNorm = _nvFn(s.category || '');
                        const isUniform = catNorm.includes('vo phuc') || catNorm.includes('vophuc')
                            || catNorm.includes('dobok') || catNorm.includes('uniform');
                        if (!isUniform) return;
                    }
                    const size = String(s.size || '').trim();
                    if (!size) return;
                    const bal = (s.in || 0) - (s.out || 0);
                    const nkey = _nvFn(size);
                    if (!sizeSet.has(nkey)) sizeSet.set(nkey, { size: size, qty: 0, items: [] });
                    const entry2 = sizeSet.get(nkey);
                    entry2.qty += bal;
                    entry2.items.push(s);
                });
                if (sizeSet.size > 0) {
                    return Array.from(sizeSet.values()).sort(function(a, b) {
                        return String(a.size).localeCompare(String(b.size), 'vi');
                    });
                }
            }

            // Build từ raw inventory transactions trong window.__store
            const st = window.__store || {};
            const sources = [
                st.inventory,
                st.uniformInventory,
                st.pagination && st.pagination.inventory && st.pagination.inventory.currentItems,
                window.allInventory,
                window.__allInventory,
            ];
            const allItems = [];
            sources.forEach(function(arr) {
                if (Array.isArray(arr)) arr.forEach(function(item) { allItems.push(item); });
            });
            if (!allItems.length) return [];

            const uniformKeywords = [
                'vo phuc', 'vophuc', 'dobok', 'uniform',
                'dong phuc', 'dongphuc', 'ao quan', 'aoquan',
                'ao vo', 'quanvo',
            ];

            const sizeMap = new Map();
            allItems.forEach(function(item) {
                if (uniformOnly) {
                    const catNorm  = _nvFn(item.category || '');
                    const isUniformByCat = uniformKeywords.some(function(k) { return catNorm.includes(k); });
                    if (!isUniformByCat) {
                        const descBlob = _nvFn([
                            item.name, item.desc, item.description, item.itemName, item.note,
                        ].filter(Boolean).join(' '));
                        const isUniformByDesc = uniformKeywords.some(function(k) { return descBlob.includes(k); });
                        if (!isUniformByDesc) return;
                    }
                }
                // Hỗ trợ nhiều field name cho size
                const size = String(
                    item.size || item.uniformSize || item.itemSize || item.variant || ''
                ).trim();
                if (!size) return;

                const qty = Number(
                    item.qty !== undefined ? item.qty
                    : item.quantity !== undefined ? item.quantity
                    : item.stock !== undefined ? item.stock
                    : 0
                );
                const isIn  = item.type === 'Nhập kho';
                const isOut = item.type === 'Xuất bán' || item.type === 'Xuất tặng'
                    || String(item.type || '').startsWith('Tặng');

                const nkey = _nvFn(size);
                if (!sizeMap.has(nkey)) sizeMap.set(nkey, { size: size, qty: 0, items: [] });
                const entry = sizeMap.get(nkey);
                if (isIn)       entry.qty += Number.isFinite(qty) ? qty : 0;
                else if (isOut) entry.qty -= Number.isFinite(qty) ? qty : 0;
                else            entry.qty += Number.isFinite(qty) ? qty : 0;
                entry.items.push(item);
            });

            return Array.from(sizeMap.values()).sort(function(a, b) {
                return String(a.size).localeCompare(String(b.size), 'vi');
            });
        };
    }

    // ── 3. renderAdmissionUniformSizeOptions ────────────────────────
    if (!window.renderAdmissionUniformSizeOptions) {
        window.renderAdmissionUniformSizeOptions = function() {
            const sizes = typeof window.getUniformSizesFromInventory === 'function'
                ? window.getUniformSizesFromInventory({ uniformOnly: true })
                : [];

            const escAttr = function(v) { return String(v || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); };
            const escHtml = function(v) { return String(v || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); };

            const select = document.getElementById('add_uniform_size');
            if (!sizes.length) {
                console.warn('[admission-size] no uniform sizes from inventory', {
                    inventoryCount: Array.isArray((window.__store || {}).inventory)
                        ? (window.__store || {}).inventory.length : -1,
                    liveInvMapKeys: window._liveInvMap ? Object.keys(window._liveInvMap).length : -1,
                });
                if (select) {
                    select.innerHTML = '<option value="">-- Chưa có dữ liệu kho đồ --</option>';
                }
                return [];
            }

            if (select) {
                select.innerHTML = '<option value="">-- Không mua / Trống --</option>'
                    + sizes.map(function(s) {
                        const disabled = s.qty <= 0 ? ' disabled' : '';
                        const label = s.qty > 0
                            ? s.size + ' (Còn: ' + s.qty + ' bộ)'
                            : s.size + ' (Hết hàng)';
                        return '<option value="' + escAttr(s.size) + '"' + disabled + '>'
                            + escHtml(label) + '</option>';
                    }).join('');
            }
            return sizes;
        };
    }

    // ── 4. Hook vào openAddModal — đảm bảo sizes luôn được populate ─
    const _origOpenAddModal = window.openAddModal;
    if (typeof _origOpenAddModal === 'function' && !window.__addModalSizeHookInstalled) {
        window.__addModalSizeHookInstalled = true;
        window.openAddModal = function() {
            _origOpenAddModal.apply(this, arguments);
            if (typeof window.ensureInventoryReady === 'function') {
                window.ensureInventoryReady('admission-modal-open').then(function() {
                    if (typeof window.renderAdmissionUniformSizeOptions === 'function') {
                        window.renderAdmissionUniformSizeOptions();
                    }
                });
            } else if (typeof window.renderAdmissionUniformSizeOptions === 'function') {
                window.renderAdmissionUniformSizeOptions();
            }
        };
    }

    // ── 5. debugAdmissionUniformSize ────────────────────────────────
    window.debugAdmissionUniformSize = async function() {
        if (typeof window.ensureInventoryReady === 'function') {
            await window.ensureInventoryReady('debug-admission-uniform-size');
        }
        const st = window.__store || {};
        const sizes = typeof window.getUniformSizesFromInventory === 'function'
            ? window.getUniformSizesFromInventory({ uniformOnly: true })
            : [];
        const addSizeEl = document.getElementById('add_uniform_size');
        const result = {
            href:        location.href,
            protocol:    location.protocol,
            runtimeMode: window.__RUNTIME_MODE || '',
            mainLoaded:  !!window.MAIN_JS_LOADED,
            appLoaded:   !!window.__appLoaded,
            currentTab:  typeof window.getCurrentActiveTabId === 'function'
                ? window.getCurrentActiveTabId() : '',
            hasEnsureInventoryReady:           typeof window.ensureInventoryReady === 'function',
            hasGetUniformSizesFromInventory:   typeof window.getUniformSizesFromInventory === 'function',
            hasRenderAdmissionUniformSizeOptions: typeof window.renderAdmissionUniformSizeOptions === 'function',
            inventoryCount:  Array.isArray(st.inventory) ? st.inventory.length : -1,
            uniformInventoryCount: Array.isArray(st.uniformInventory) ? st.uniformInventory.length : -1,
            paginationInventoryCount: Array.isArray(
                st.pagination && st.pagination.inventory && st.pagination.inventory.currentItems
            ) ? st.pagination.inventory.currentItems.length : -1,
            liveInvMapKeys: window._liveInvMap ? Object.keys(window._liveInvMap).length : -1,
            uniformSizesCount: sizes.length,
            uniformSizes: sizes.slice(0, 20).map(function(s) {
                return { size: s.size, qty: s.qty, items: s.items.length };
            }),
            chooseSizeButtons: document.querySelectorAll(
                '[data-action="choose-admission-uniform-size"], .js-choose-admission-uniform-size'
            ).length,
            sizeOptionButtons: document.querySelectorAll(
                '[data-action="select-admission-uniform-size"]'
            ).length,
            addUniformSizeOptions: addSizeEl
                ? Array.from(addSizeEl.options).map(function(o) { return o.value + ': ' + o.text; })
                : [],
            selectValue: (addSizeEl || {}).value || '',
        };
        console.table(result);
        return result;
    };
}

// ────────────────────────────────────────────────────────────────
// Phase 4K-4: Club Exam Fee Setting Bridges
// Cho phép mỗi CLB tự chỉnh lệ phí thi đai, lưu Firestore theo
// clubs/{clubId}/settings/general (field: examFee). Idempotent.
// ────────────────────────────────────────────────────────────────

/**
 * _installExamFeeSettingBridges — mount toàn bộ logic lệ phí thi:
 *   window.getClubExamFee, setClubExamFeeLocal, loadClubExamFeeSetting,
 *   saveClubExamFeeSetting, refreshExamFeeUI, initExamFeeSettingUI,
 *   debugExamFeeSetting.
 * Idempotent — gọi nhiều lần không gây vấn đề.
 */
function _installExamFeeSettingBridges() {
    if (window.__examFeeSettingBridgesInstalled) return;
    window.__examFeeSettingBridgesInstalled = true;

    const DEFAULT_EXAM_FEE = 250000;

    function normalizeExamFee(value) {
        const n = Number(String(value || '').replace(/[^\d]/g, ''));
        if (!Number.isFinite(n) || n <= 0) return DEFAULT_EXAM_FEE;
        return Math.round(n);
    }

    
// ══════════════════════════════════════════════════════════════════
// Phase 4K-5D — VND Money Format Helpers
// ══════════════════════════════════════════════════════════════════
window.parseVNDNumber = function(value) {
    var n = Number(String(value || '').replace(/[^\d]/g, ''));
    return Number.isFinite(n) ? n : 0;
};

window.formatVNDNumber = function(value) {
    var n = window.parseVNDNumber ? window.parseVNDNumber(value) : Number(value || 0);
    return n > 0 ? n.toLocaleString('vi-VN') : '';
};

window.formatVNDText = function(value) {
    var n = window.parseVNDNumber ? window.parseVNDNumber(value) : Number(value || 0);
    return (Number.isFinite(n) ? n : 0).toLocaleString('vi-VN') + ' ₫';
};

// ── 1. getClubExamFee — nguồn duy nhất cho toàn hệ thống ────
    window.getClubExamFee = function getClubExamFee() {
        const st = window.__store || {};
        const candidates = [
            st.clubSettings && st.clubSettings.examFee,
            st.settings && st.settings.examFee,
            st.examFee,
            st.currentClub && st.currentClub.examFee,
            window.clubExamFee
        ];
        for (let i = 0; i < candidates.length; i++) {
            const v = candidates[i];
            const n = Number(String(v || '').replace(/[^\d]/g, ''));
            if (Number.isFinite(n) && n > 0) return Math.round(n);
        }
        return DEFAULT_EXAM_FEE;
    };

    // ── 2. setClubExamFeeLocal — cập nhật local state ────────────
    window.setClubExamFeeLocal = function setClubExamFeeLocal(value, reason) {
        reason = reason || 'manual';
        const fee = normalizeExamFee(value);
        window.clubExamFee = fee;
        if (!window.__store) window.__store = {};
        if (!window.__store.clubSettings) window.__store.clubSettings = {};
        window.__store.clubSettings.examFee = fee;
        window.__store.examFee = fee;
        window.__store._lastExamFeeReason = reason;
        window.__store._lastExamFeeUpdatedAt = Date.now();
        return fee;
    };

    // ── 3. loadClubExamFeeSetting — đọc từ Firestore theo CLB ────
    window.loadClubExamFeeSetting = async function loadClubExamFeeSetting(reason) {
        reason = reason || 'boot';
        const st = window.__store || {};
        const db = st.db || window.db;
        const clubId = st.clubId || st.currentClubId || window.currentClubId;

        if (!db || !clubId) {
            console.warn('[exam-fee] missing db/clubId, fallback default. reason:', reason);
            window.setClubExamFeeLocal(DEFAULT_EXAM_FEE, 'missing-db-club');
            return DEFAULT_EXAM_FEE;
        }

        const _sdk = window._fb_init || {};
        const _getDoc = _sdk.getDoc;
        const _doc = _sdk.doc;
        if (!_getDoc || !_doc) {
            console.warn('[exam-fee] Firebase SDK not available, reason:', reason);
            return window.getClubExamFee();
        }

        try {
            // Ưu tiên clubs/{clubId}/settings/general
            try {
                const generalSnap = await _getDoc(_doc(db, 'clubs', clubId, 'settings', 'general'));
                if (generalSnap.exists()) {
                    const data = generalSnap.data() || {};
                    if (data.examFee) {
                        const fee = normalizeExamFee(data.examFee);
                        window.setClubExamFeeLocal(fee, 'firestore-general-' + reason);
                        if (typeof window.refreshExamFeeUI === 'function') window.refreshExamFeeUI('loaded-general');
                        console.info('[exam-fee] loaded from general:', fee, 'club:', clubId);
                        return fee;
                    }
                }
            } catch (e1) {
                console.warn('[exam-fee] load general failed:', e1.message || e1);
            }

            // Fallback: clubs/{clubId}/settings/main_config
            try {
                const mainSnap = await _getDoc(_doc(db, 'clubs', clubId, 'settings', 'main_config'));
                if (mainSnap.exists()) {
                    const data = mainSnap.data() || {};
                    if (data.examFee) {
                        const fee = normalizeExamFee(data.examFee);
                        window.setClubExamFeeLocal(fee, 'firestore-main_config-' + reason);
                        if (typeof window.refreshExamFeeUI === 'function') window.refreshExamFeeUI('loaded-main_config');
                        console.info('[exam-fee] loaded from main_config:', fee, 'club:', clubId);
                        return fee;
                    }
                }
            } catch (e2) {
                console.warn('[exam-fee] load main_config failed:', e2.message || e2);
            }
        } catch (e) {
            console.warn('[exam-fee] load failed:', e);
        }

        return window.getClubExamFee();
    };

    // ── 4. saveClubExamFeeSetting — lưu Firestore merge:true ─────
    window.saveClubExamFeeSetting = async function saveClubExamFeeSetting(value) {
        const fee = normalizeExamFee(value);
        const st = window.__store || {};
        const db = st.db || window.db;
        const clubId = st.clubId || st.currentClubId || window.currentClubId;

        if (!db || !clubId) {
            console.warn('[exam-fee] cannot save, missing db/clubId');
            window.setClubExamFeeLocal(fee, 'save-local-only');
            return fee;
        }

        window.setClubExamFeeLocal(fee, 'before-save');

        const _sdk = window._fb_init || {};
        const _setDoc = _sdk.setDoc;
        const _doc = _sdk.doc;
        const _serverTimestamp = _sdk.serverTimestamp;

        if (!_setDoc || !_doc) {
            console.warn('[exam-fee] Firebase SDK not available for save');
            return fee;
        }

        const currentUser = st.currentUser || null;

        await _setDoc(
            _doc(db, 'clubs', clubId, 'settings', 'general'),
            {
                examFee: fee,
                updatedAt: _serverTimestamp ? _serverTimestamp() : Date.now(),
                updatedBy: currentUser ? (currentUser.email || currentUser.uid || '') : '',
            },
            { merge: true }
        );

        console.info('[exam-fee] saved to Firestore:', fee, 'club:', clubId);
        return fee;
    };

    // ── 5. refreshExamFeeUI — đồng bộ tất cả inputs hiển thị ────
    window.refreshExamFeeUI = function refreshExamFeeUI(reason) {
        reason = reason || 'refresh';
        const fee = window.getClubExamFee ? window.getClubExamFee() : DEFAULT_EXAM_FEE;
        const fmtFee = window.formatVNDNumber ? window.formatVNDNumber(fee) : fee.toLocaleString('vi-VN');

        // examFeeInput: hiển thị dạng 250.000 (formatted)
        const examFeeInput = document.getElementById('examFeeInput');
        if (examFeeInput) examFeeInput.value = fmtFee;

        // exam_fee_all_display (formatted — dùng bởi formatCurrencyInput)
        const displayEl = document.getElementById('exam_fee_all_display');
        if (displayEl) displayEl.value = fmtFee;

        // exam_fee_all_actual (raw — đọc bởi quickCollectExam, processBatchUpgrade)
        const actualEl = document.getElementById('exam_fee_all_actual');
        if (actualEl) actualEl.value = String(fee);

        // examFeeDisplay (text node, nếu có)
        const feeDisplayEl = document.getElementById('examFeeDisplay')
            || document.querySelector('[data-role="exam-fee-display"]');
        if (feeDisplayEl) {
            feeDisplayEl.textContent = window.formatVNDText ? window.formatVNDText(fee) : fee.toLocaleString('vi-VN') + ' ₫';
        }

        window.__lastExamFeeReason = reason;
    };

    // ── 6. initExamFeeSettingUI — bind events (idempotent) ───────
    window.initExamFeeSettingUI = function initExamFeeSettingUI() {
        // Luôn refresh values dù đã mount hay chưa
        if (typeof window.refreshExamFeeUI === 'function') window.refreshExamFeeUI('init');

        // Phase 4K-5D: VND input formatter (250000 → 250.000)
        var _feeInput = document.getElementById('examFeeInput');
        if (_feeInput && !_feeInput.__vndFormatterBound) {
            _feeInput.__vndFormatterBound = true;
            _feeInput.addEventListener('input', function() {
                var _raw = window.parseVNDNumber ? window.parseVNDNumber(_feeInput.value) : Number(String(_feeInput.value || '').replace(/\D/g, ''));
                _feeInput.value = _raw ? _raw.toLocaleString('vi-VN') : '';
            });
        }

        if (window.__examFeeSettingUIMounted) return;
        window.__examFeeSettingUIMounted = true;

        const btn = document.getElementById('saveExamFeeBtn');
        if (!btn) return;

        btn.addEventListener('click', async function(e) {
            e.preventDefault();
            const _input = document.getElementById('examFeeInput');
            const _status = document.getElementById('examFeeStatus');
            // Phase 4K-5D: parse VND format (250.000 → 250000)
            const fee = window.parseVNDNumber
                ? window.parseVNDNumber(_input ? _input.value : '')
                : normalizeExamFee(_input ? _input.value : '');

            if (!fee || fee <= 0) {
                if (_status) { _status.style.color = '#dc2626'; _status.textContent = '⚠ Lệ phí không hợp lệ'; }
                return;
            }

            if (_status) { _status.style.color = '#64748b'; _status.textContent = 'Đang lưu...'; }

            try {
                await window.saveClubExamFeeSetting(fee);
                if (typeof window.setClubExamFeeLocal === 'function') window.setClubExamFeeLocal(fee, 'exam-fee-saved');
                if (typeof window.refreshExamFeeUI === 'function') window.refreshExamFeeUI('exam-fee-saved');

                const _fmtFee = window.formatVNDText ? window.formatVNDText(fee) : fee.toLocaleString('vi-VN') + ' ₫';
                if (_status) { _status.style.color = '#16a34a'; _status.textContent = '✓ Đã lưu: ' + _fmtFee; }

                if (typeof window.invalidateCurrentTab === 'function') {
                    window.invalidateCurrentTab('exam-fee-saved');
                } else if (typeof window.scheduleRender === 'function') {
                    window.scheduleRender();
                }

                // Clear status sau 6s (đủ thời gian đọc)
                setTimeout(function() {
                    const _s = document.getElementById('examFeeStatus');
                    if (_s && _s.textContent.includes('Đã lưu')) _s.textContent = '';
                }, 6000);
            } catch (err) {
                console.error('[exam-fee] save failed:', err);
                if (_status) { _status.style.color = '#dc2626'; _status.textContent = 'Lưu thất bại, vui lòng kiểm tra quyền hoặc mạng.'; }
            }
        });
    };

    // ── 7. debugExamFeeSetting — debug console ────────────────────
    window.debugExamFeeSetting = async function debugExamFeeSetting() {
        const st = window.__store || {};
        const _getClubExamFee = typeof window.getClubExamFee === 'function' ? window.getClubExamFee() : null;
        const _inputEl = document.getElementById('examFeeInput');
        const _actualEl = document.getElementById('exam_fee_all_actual');
        const _inputVal = (_inputEl || {}).value || '';
        const _actualVal = (_actualEl || {}).value || '';
        const result = {
            href: location.href,
            protocol: location.protocol,
            runtimeMode: window.__RUNTIME_MODE || '',
            mainLoaded: !!window.MAIN_JS_LOADED,
            appLoaded: !!window.__appLoaded,
            clubId: st.clubId || st.currentClubId || window.currentClubId || '',
            localExamFee: window.clubExamFee,
            storeExamFee: (st.clubSettings && st.clubSettings.examFee) || st.examFee || null,
            getClubExamFee: _getClubExamFee,
            formattedFee: window.formatVNDText ? window.formatVNDText(_getClubExamFee) : String(_getClubExamFee),
            hasLoadClubExamFeeSetting: typeof window.loadClubExamFeeSetting === 'function',
            hasSaveClubExamFeeSetting: typeof window.saveClubExamFeeSetting === 'function',
            hasInitExamFeeSettingUI: typeof window.initExamFeeSettingUI === 'function',
            saveButtonBound: !!(document.getElementById('saveExamFeeBtn')),
            examFeeInputValue: _inputVal,
            examFeeInputParsed: window.parseVNDNumber ? window.parseVNDNumber(_inputVal) : NaN,
            examFeeActualValue: _actualVal,
            examFeeDisplayValue: (document.getElementById('examFeeDisplay') || document.querySelector('[data-role="exam-fee-display"]') || {}).textContent || '',
            lastExamFeeReason: window.__lastExamFeeReason || '',
            statusText: (document.getElementById('examFeeStatus') || {}).textContent || '',
            firestorePath: 'clubs/' + (st.clubId || st.currentClubId || '?') + '/settings/general'
        };
        console.table(result);
        return result;
    };

    // Phase 4K-5D: debugExamFeeCollectionSource
    window.debugExamFeeCollectionSource = function() {
        var currentFee = window.getClubExamFee ? window.getClubExamFee() : null;
        var actual = window.parseVNDNumber
            ? window.parseVNDNumber((document.getElementById('exam_fee_all_actual') || {}).value)
            : 0;
        var input = window.parseVNDNumber
            ? window.parseVNDNumber((document.getElementById('examFeeInput') || {}).value)
            : 0;
        var result = {
            getClubExamFee: currentFee,
            hiddenActual: actual,
            inputParsed: input,
            formatted: window.formatVNDText ? window.formatVNDText(currentFee) : String(currentFee),
            sourcePriority: 'getClubExamFee > hidden actual > default'
        };
        console.table(result);
        return result;
    };

    console.info('[main.js] Phase 4K-5D: exam fee setting + VND format bridges installed');
}


// ══════════════════════════════════════════════════════════════════
// Phase 4K-5D — Dashboard Historical Authority Bridges
// ══════════════════════════════════════════════════════════════════
window.getDashboardHistoricalSnapshot = function() {
    var st = window.__store || {};
    var cache = st.tabHtmlCache || {};
    var cd = cache._chartData || null;
    var reportHtml = cache.reportList || cache.reportHtml || '';

    var hasHistory =
        cd &&
        Array.isArray(cd.labels) &&
        cd.labels.length >= 6 &&
        (
            (Array.isArray(cd.income) && cd.income.some(function(v) { return Number(v || 0) > 0; })) ||
            (Array.isArray(cd.expense) && cd.expense.some(function(v) { return Number(v || 0) > 0; })) ||
            (Array.isArray(cd.active) && cd.active.some(function(v) { return Number(v || 0) > 0; }))
        );

    var reportRows = reportHtml
        ? (String(reportHtml).match(/<tr/g) || []).length
        : 0;

    return {
        hasHistory: !!hasHistory,
        chartData: cd,
        reportHtml: reportHtml,
        reportRows: reportRows,
        fetchedAt: st._lastDashboardHistoryFetchAt || 0,
        reason: st._lastDashboardHistoryReason || ''
    };
};

window.refreshDashboardHistory = async function(month, reason) {
    reason = reason || 'manual';
    var selectedMonth =
        month ||
        (document.getElementById('filterMonth') && document.getElementById('filterMonth').value) ||
        (window.__store && window.__store.selectedMonth) ||
        new Date().toISOString().slice(0, 7);

    if (typeof window.fetchHistoricalDashboardFallback === 'function') {
        return window.fetchHistoricalDashboardFallback(selectedMonth, reason);
    }
    console.warn('[refreshDashboardHistory] fetchHistoricalDashboardFallback not yet loaded');
};

window.forceReloadDashboardHistory = async function(month) {
    var selectedMonth =
        month ||
        (document.getElementById('filterMonth') && document.getElementById('filterMonth').value) ||
        (window.__store && window.__store.selectedMonth) ||
        new Date().toISOString().slice(0, 7);

    if (typeof window.refreshDashboardHistory === 'function') {
        await window.refreshDashboardHistory(selectedMonth, 'force-reload');
    }
    if (typeof window.invalidateDashboard === 'function') {
        window.invalidateDashboard('force-reload-dashboard-history');
    }
    return window.debugMonthlyRevenueAllocation
        ? window.debugMonthlyRevenueAllocation(selectedMonth)
        : null;
};

// ────────────────────────────────────────────────────────────────
// [GITHUB-FIX] Task 3: Tránh double-boot app.js khi legacy đã load
// ────────────────────────────────────────────────────────────────

function _waitForExistingLegacyApp(ms) {
    ms = ms || 3000;
    return new Promise(function(resolve) {
        var started = Date.now();

        function tick() {
            if (window.__appLoaded || typeof window.scheduleRender === 'function') {
                return resolve(true);
            }

            var hasLegacyScript = !!document.querySelector('script[src$="app.js"], script[src*="app.js"]');

            if (!hasLegacyScript) {
                return resolve(false);
            }

            if (Date.now() - started > ms) {
                return resolve(false);
            }

            setTimeout(tick, 50);
        }

        tick();
    });
}

// ────────────────────────────────────────────────────────────────
// BOOTSTRAP
// ────────────────────────────────────────────────────────────────

(async function bootstrap() {
    try {
        if (!window.__appLoaded) {
            // [GITHUB-FIX] Task 3: Chờ app.js đã có trong DOM sẵn sàng thay vì load lại
            var existingLegacyReady = await _waitForExistingLegacyApp(3000);

            if (!existingLegacyReady && !window.__appLoaded) {
                initFirebase();
                await _loadLegacyApp();
            }
        }

        if (window.__store && !window.__store._moduleLinked) {
            window.__store._moduleLinked = true;
            window.__moduleStore = store;
        }

        window._fmt = {
            getLocalToday, formatDate, formatMonth,
            addMonthsToYYYYMM, normalizeYYYYMM,
            formatMonthCompact, getBeltBadge,
            escapeForAttr, formatVND, parseVND,
        };

        window.safeGetDocs = safeGetDocs;

        registerLoadingGlobals();
        registerToastGlobal();
        registerModalGlobals();
        registerTabGlobals();

        const _origSwitchTab = window.switchTab;
        window.switchTab = async function(tabId) {
            await ensureTabModule(tabId);
            if (typeof _origSwitchTab === 'function') _origSwitchTab(tabId);
            // Phase 4K-4: Refresh exam fee UI when entering exam tab
            if (tabId === 'exam') {
                if (typeof window.initExamFeeSettingUI === 'function') window.initExamFeeSettingUI();
                if (typeof window.refreshExamFeeUI === 'function') window.refreshExamFeeUI('switch-to-exam');
            }
            // Phase 4K-5J-2: reset active render limit when switching tabs
            if (tabId === 'active' || tabId === 'quit') {
                if (typeof window.resetActiveRenderLimit === 'function') {
                    window.resetActiveRenderLimit('tab-switch-' + tabId);
                } else if (typeof window.__activeRenderLimit !== 'undefined') {
                    window.__activeRenderLimit = 50;
                }
            }
            // Phase 4K-5J-1: bind overdue filter UI when entering BÁO NỢ tab
            if (tabId === 'debt') {
                if (typeof window.ensureDebtOverdueFilterUI === 'function') window.ensureDebtOverdueFilterUI();
                if (typeof window.bindDebtOverdueFilter === 'function') window.bindDebtOverdueFilter();
            }
            // Phase 4K-5F: Ensure debt profiles fully loaded when entering BÁO NỢ tab
            if (tabId === 'debt' && typeof window.ensureDebtProfilesReady === 'function') {
                // Phase 4K-5H: await full debt profile load, then re-invalidate list
                Promise.resolve(window.ensureDebtProfilesReady('debt-tab-open'))
                    .then(function() {
                        if (typeof window.invalidateList === 'function') {
                            window.invalidateList('students.debtList', 'debt-profiles-ready');
                        } else if (typeof window.invalidateStudents === 'function') {
                            window.invalidateStudents('debt-profiles-ready');
                        }
                    })
                    .catch(function(e) {
                        console.warn('[switchTab] ensureDebtProfilesReady failed:', e);
                    });
            }
        };

        initMonthlyHelpers(); // Phase 4K-4G: register monthly revenue allocation + student sort helpers
        initDashboard();
        initRender();

        initFinanceIslands();           registerFinanceLegacyGlobals();
        initStudentIslands();           registerStudentsLegacyGlobals();
        initInventoryIslands();         registerInventoryLegacyGlobals();
        initAttendanceIslands();
        initDashboardIslands();

        registerInvalidationLegacyGlobals();

        initStudents();

        // ── Phase 4K-RUNTIME-INIT-FIX: editProfile legacy bridge ─────────────
        // editProfile is listed as a required global (health check + module guard)
        // but initStudents() does not expose it on window. Bridge to openProfile
        // so clicking "Sửa hồ sơ" still works. Will be overridden by real impl if set.
        window.editProfile = window.editProfile || function _editProfileBridge(...args) {
            const candidates = [
                window.__realEditProfile,
                window.openProfile,
                window.editStudent,
                window.openEditProfile,
                window.showStudentModal,
            ].filter(fn => typeof fn === 'function');
            if (candidates.length) return candidates[0](...args);
            console.warn('[LegacyBridge] editProfile called before real handler ready:', args);
            if (typeof window.showToast === 'function') window.showToast('Chức năng sửa võ sinh chưa sẵn sàng, vui lòng thử lại sau.', 'warning');
            return null;
        };

        initFinance();
        initInventory();
        initAttendance();
        // [Phase 4.0A] Reports / Export module — overrides app.js window functions
        // [Phase 4K-4E] Isolated try/catch: syntax/runtime error không làm SuperAdmin chết
        try {
            initReports();
        } catch (e) {
            console.error('[BOOT] initReports failed — SuperAdmin vẫn chạy:', e);
        }

        // [Phase 4.0B-1] SuperAdmin — eager init ngay sau khi app context sẵn sàng.
        // initSuperAdmin() idempotent: tự bỏ qua nếu đã init rồi.
        // KHÔNG phụ thuộc switchTab('superadmin') nữa.
        // [Phase 4K-4E] Isolated try/catch: lỗi module khác không làm SuperAdmin chết
        try {
            initSuperAdmin();
        } catch (e) {
            console.error('[BOOT] initSuperAdmin failed:', e);
        }

        // [HOTFIX] Sau initSuperAdmin(), nếu superAdminView đang hiển thị mà danh sách CLB
        // chưa load (vì initSaaSDatabase đã gọi trước module sẵn sàng), tự gọi lại một lần.
        // Guard: window.__saInitialLoadRetried để tránh gọi lặp nhiều lần.
        if (!window.__saInitialLoadRetried &&
            window.userRole === 'super_admin' &&
            document.getElementById('superAdminView')?.style.display !== 'none') {
            window.__saInitialLoadRetried = true;
            // Chờ thêm 200ms để initSuperAdmin rebind xong, rồi kiểm tra xem listEl còn đang loading
            setTimeout(async () => {
                const _listEl = document.getElementById('sysClubListMain');
                // Chỉ reload nếu danh sách vẫn đang ở trạng thái loading hoặc rỗng
                const _stillLoading = !_listEl || !_listEl.innerHTML.trim() ||
                    _listEl.innerHTML.includes('Đang tải') ||
                    _listEl.innerHTML.includes('⏳');
                if (_stillLoading && window.SuperAdminModule?.loadSuperAdminDashboard) {
                    console.info('[HOTFIX] main.js: SA view active nhưng list chưa load — trigger lại loadSuperAdminDashboard');
                    window.SuperAdminModule.loadSuperAdminDashboard();
                } else if (_stillLoading && typeof window.loadSuperAdminData === 'function') {
                    console.info('[HOTFIX] main.js: SA view active nhưng list chưa load — trigger lại loadSuperAdminData');
                    window.loadSuperAdminData();
                }
            }, 300);
        }

        // [Phase 4.0B-2] window.ensureSuperAdminModule — hardened.
        // Xử lý được: module cache, SuperAdminModule bị mất, re-init sau logout.
        window.ensureSuperAdminModule = async function(reason) {
            const _metrics = window.__superAdminModuleMetrics;
            if (_metrics) _metrics.ensureModuleCalls = (_metrics.ensureModuleCalls || 0) + 1;

            // Đã có module → không làm gì thêm.
            if (window.SuperAdminModule) return true;

            // file:// mode → ES module không thể load.
            if (window.__APP_STANDALONE_FILE_MODE || window.__MODULE_BOOTSTRAP_DISABLED) {
                console.warn('[SuperAdminModule] Cannot load ES module in file:// mode. Using standalone fallback.');
                if (_metrics) _metrics.ensureModuleFailures = (_metrics.ensureModuleFailures || 0) + 1;
                return false;
            }

            // [Phase 4.0B-2] Trường hợp: window.SuperAdminModule mất nhưng module đã
            // được import và __saInitialized vẫn true (trong module cache).
            // initSuperAdmin() với guard mới sẽ detect SuperAdminModule mất và rebind.
            if (!window.__superAdminModuleLoading) {
                // Thử gọi initSuperAdmin trực tiếp nếu module đã import rồi.
                // Dynamic import trả lại cached module — không import mạng lần nữa.
                window.__superAdminModuleLoading = true;
                try {
                    const mod = await import('./modules/superadmin.js');
                    if (typeof mod.initSuperAdmin === 'function') {
                        mod.initSuperAdmin();
                    }
                    window.__superAdminModuleLoading = false;
                    if (window.SuperAdminModule) return true;
                    // Module loaded nhưng SuperAdminModule vẫn chưa có (auth chưa sẵn sàng?)
                    // Thử gọi initSuperAdmin lần nữa sau 200ms để chờ auth context
                    await new Promise(r => setTimeout(r, 200));
                    if (typeof mod.initSuperAdmin === 'function') mod.initSuperAdmin();
                    if (window.SuperAdminModule) return true;
                    // Vẫn không có → fail
                    console.warn('[SuperAdminModule] initSuperAdmin called but SuperAdminModule still not set. Reason:', reason || '?');
                    if (_metrics) _metrics.ensureModuleFailures = (_metrics.ensureModuleFailures || 0) + 1;
                    return false;
                } catch (err) {
                    console.warn('[SuperAdminModule] dynamic import failed:', err.message || err);
                    if (_metrics) _metrics.ensureModuleFailures = (_metrics.ensureModuleFailures || 0) + 1;
                    window.__superAdminModuleLoading = false;
                    return false;
                }
            }

            // Đang trong lúc load rồi, đợi tối đa 3s
            for (let _w = 0; _w < 30; _w++) {
                await new Promise(r => setTimeout(r, 100));
                if (window.SuperAdminModule) return true;
            }
            if (_metrics) _metrics.ensureModuleFailures = (_metrics.ensureModuleFailures || 0) + 1;
            console.warn('[SuperAdminModule] timed out waiting for module. Reason:', reason || '?');
            return false;
        };

        if (guardOnce('initStudentsEvents')) initStudentsEvents();
        if (guardOnce('initFinanceEvents'))  initFinanceEvents();

        // Phase 4K-3: Tuition Receipt Action Recovery + Student Profile Click Binding
        _installTuitionActionBridges();
        if (guardOnce('initFinanceActionEvents')) initFinanceActionEvents();

        // Phase 4K-3B: Admission Uniform Size Recovery
        _installAdmissionUniformSizeBridges();

        // Phase 4K-4: Club Exam Fee Setting
        _installExamFeeSettingBridges();

        // Phase 4K-4: Load exam fee on context-ready (covers login + club switch)
        if (!window.__examFeeContextReadyListenerRegistered) {
            window.__examFeeContextReadyListenerRegistered = true;
            window.addEventListener('app:context-ready', function() {
                if (typeof window.loadClubExamFeeSetting === 'function') {
                    window.loadClubExamFeeSetting('context-ready').then(function() {
                        if (typeof window.refreshExamFeeUI === 'function') window.refreshExamFeeUI('context-ready');
                        if (typeof window.initExamFeeSettingUI === 'function') window.initExamFeeSettingUI();
                    });
                }
            });
        }
        // Replay nếu context đã ready trước khi main.js kịp đăng ký (GitHub Pages)
        if (window.__appContextReadyState && window.__appContextReadyState.ready) {
            setTimeout(function() {
                if (typeof window.loadClubExamFeeSetting === 'function') {
                    window.loadClubExamFeeSetting('replay-context-ready').then(function() {
                        if (typeof window.refreshExamFeeUI === 'function') window.refreshExamFeeUI('replay-context-ready');
                        if (typeof window.initExamFeeSettingUI === 'function') window.initExamFeeSettingUI();
                    });
                }
            }, 200);
        }

        // PHẦN 6 FIX: Các block setTimeout 500ms/1500ms init pagination sớm đã bị DISABLED.
        // Lý do: chạy trước isClubRuntimeReady() → gây cảnh báo "db chưa sẵn sàng sau 2s".
        // Thay thế: chỉ init thông qua _tryInitPaginationsOnDbReady() bên dưới,
        // được trigger bởi app:context-ready, app:db-ready, hoặc post-bootstrap-check.
        // Guard __studentPaginationInitializedForClub ngăn double-init per club.
        //
        // [DISABLED - StudentPagination early setTimeout]
        // [DISABLED - TransactionPagination early setTimeout]

        // ── Phase 4K-DATA-HYDRATION: isClubRuntimeReady helper ─────────────────────
        // Kiểm tra db + currentClubId + currentUser đều sẵn sàng trước khi init.
        // Dùng bởi _tryInitPaginationsOnDbReady, retryDataHydration, check tools.
        window.isClubRuntimeReady = function isClubRuntimeReady() {
            return !!(
                ((window.__store && window.__store.db) || window.db || window._db) &&
                ((window.__store && window.__store.currentClubId) || window.currentClubId) &&
                ((window.__store && window.__store.currentUser) || window.currentUser)
            );
        };

        // ── Phase 4K-DATA-HYDRATION: mountActiveProfilesListenerIfNeeded ────────────
        // Gọi khi retry hydration — mount profile listener nếu chưa mounted.
        window.mountActiveProfilesListenerIfNeeded = function mountActiveProfilesListenerIfNeeded(reason) {
            const _st = window.__store;
            if (!_st || !_st.db || !_st.currentClubId || !_st.profRef) {
                console.warn('[ProfileHydration] mountActiveProfilesListenerIfNeeded: context chưa ready —', reason);
                return;
            }
            if (typeof window.mountActiveProfilesListener === 'function') {
                window.mountActiveProfilesListener({
                    db:            _st.db,
                    clubId:        _st.currentClubId,
                    profRef:       _st.profRef,
                    currentClubId: _st.currentClubId,
                    reason:        reason || 'retry-hydration',
                });
            }
        };

        // ── Phase 4K-RUNTIME-INIT-FIX: Pagination retry via app:context-ready / app:db-ready ─
        // Phase 4K-DATA-HYDRATION: Nâng cấp dùng isClubRuntimeReady() thay vì chỉ check db.
        // Guard __studentPaginationInitializedForClub (clubId-specific) ngăn double-init per club.
        function _tryInitPaginationsOnDbReady(reason) {
            setTimeout(function() {
                if (!window.isClubRuntimeReady()) {
                    console.info('[DataHydration] _tryInitPaginationsOnDbReady: context chưa ready —', reason || 'event');
                    return;
                }
                const _cid = (window.__store && window.__store.currentClubId) || window.currentClubId;

                // StudentPagination: guard theo clubId — cho phép re-init khi đổi CLB
                if (!window.__studentPaginationInitialized ||
                    window.__studentPaginationInitializedForClub !== _cid) {
                    window.__studentPaginationInitialized = true;
                    window.__studentPaginationInitializedForClub = _cid;
                    initStudentPagination();
                    console.info('[DataHydration] StudentPagination init —', reason || 'retry', '— clubId:', _cid);
                }

                // TransactionPagination: month-aware reset đã có trong finance.js
                if (!window.__transactionPaginationInitialized) {
                    window.__transactionPaginationInitialized = true;
                    initTransactionPagination();
                    console.info('[DataHydration] TransactionPagination init —', reason || 'retry');
                }

                // Sau init, invalidate tab hiện tại để trigger render mới nhất
                setTimeout(function() {
                    if (typeof window.invalidateCurrentTab === 'function') {
                        window.invalidateCurrentTab('post-pagination-init');
                    }
                }, 300);
            }, 200);
        }

        // Expose để retryDataHydration có thể gọi lại
        window._tryInitPaginationsOnDbReady = _tryInitPaginationsOnDbReady;

        // ── Phase 4K-DATA-HYDRATION: retryDataHydration public helper ───────────────
        // Gọi từ Console hoặc programmatic để retry toàn bộ data pipeline.
        // window.retryDataHydration('manual') — thử lại pagination + profile listener + render.
        window.retryDataHydration = function retryDataHydration(reason) {
            const _r = reason || 'manual';
            console.info('[DataHydration] retryDataHydration —', _r);
            _tryInitPaginationsOnDbReady(_r);
            window.mountActiveProfilesListenerIfNeeded(_r);
            if (typeof window.invalidateCurrentTab === 'function') {
                window.invalidateCurrentTab('manual-data-hydration');
            }
        };

        if (!window.__paginationDbReadyListenerRegistered) {
            window.__paginationDbReadyListenerRegistered = true;
            window.addEventListener('app:context-ready', function() { _tryInitPaginationsOnDbReady('app:context-ready'); });
            window.addEventListener('app:db-ready',      function() { _tryInitPaginationsOnDbReady('app:db-ready'); });
        }

        // Post-bootstrap immediate check: nếu db đã ready trước event, init ngay
        setTimeout(function() {
            if (window.isClubRuntimeReady()) {
                _tryInitPaginationsOnDbReady('post-bootstrap-check');
            }
        }, 0);

        // PHẦN 1 FIX: Khởi động Unified Search Runtime sau khi DOM sẵn sàng
        try {
            initGlobalSearchRuntime();
        } catch (e) {
            console.warn('[SearchRuntime] init failed:', e);
        }

        // PHẦN 10 FIX: Flush pending domain invalidations queued bởi app.js _mergeAndRender
        // trước khi invalidateFinance/invalidateStudents/invalidateDashboard sẵn sàng.
        (function _flushPendingDomainInvalidations() {
            const queue = window.__pendingDomainInvalidations;
            if (!queue || queue.length === 0) return;
            const domainMap = {
                finance:   typeof window.invalidateFinance   === 'function' ? window.invalidateFinance   : null,
                students:  typeof window.invalidateStudents  === 'function' ? window.invalidateStudents  : null,
                dashboard: typeof window.invalidateDashboard === 'function' ? window.invalidateDashboard : null,
            };
            let flushed = 0;
            queue.forEach(({ domain, reason }) => {
                const fn = domainMap[domain];
                if (fn) { fn(reason + '-flushed'); flushed++; }
            });
            window.__pendingDomainInvalidations = [];
            if (flushed > 0) console.info('[DomainQueue] Flushed', flushed, 'pending invalidations.');
        })();

        // Expose invalidateSearchCache để listeners gọi khi data version thay đổi
        window.invalidateSearchCache = invalidateSearchCache;

        // Phase 4K-2: Expose search runtime helpers — guard existing definitions
        // window.debugSearchPerformance is already defined below (line ~1826) with richer output.
        // Only set if it was somehow missing (should not happen, but guard for safety).
        if (typeof window.debugSearchPerformance !== 'function') {
            window.debugSearchPerformance = debugSearchPerformance;
        }
        window.getSearchRuntimeState      = getSearchRuntimeState;
        window.disposeGlobalSearchRuntime = disposeGlobalSearchRuntime;

        _patchResetStore();

        if (_isDev) _runHealthCheck();

        // ── Phase 4.0B-4B: Module post-login guard ───────────────────────────
        // Kiểm tra nhẹ sau khi các module đã init — chỉ warn, không throw.
        // [HOTFIX] Guard: ensureModuleRuntimeReady có thể chưa được assign nếu
        // bootstrap chạy synchronously trước khi outer module đến dòng 1020+.
        if (typeof window.ensureModuleRuntimeReady === 'function') {
            window.ensureModuleRuntimeReady('finance',    ['quickPay', 'openQuickPayModal']);
            window.ensureModuleRuntimeReady('inventory',  ['getInvCategories', 'loadInvCategories']);
            window.ensureModuleRuntimeReady('students',   ['openAddModal', 'editProfile']);
        } else {
            console.warn('[Bootstrap] ensureModuleRuntimeReady chưa sẵn sàng — skip module guard. Sẽ retry sau event loop.');
            setTimeout(() => {
                if (typeof window.ensureModuleRuntimeReady === 'function') {
                    window.ensureModuleRuntimeReady('finance',    ['quickPay', 'openQuickPayModal']);
                    window.ensureModuleRuntimeReady('inventory',  ['getInvCategories', 'loadInvCategories']);
                    window.ensureModuleRuntimeReady('students',   ['openAddModal', 'editProfile']);
                }
            }, 0);
        }

        // ── Phase 4.0B-4B: Bootstrap health check (phân loại severity) ───────
        // Chạy sau event loop tick — đảm bảo tất cả window globals đã expose.
        // Dùng optional chaining vì printRuntimeHealth được assign cuối file.
        setTimeout(() => { window.printRuntimeHealth?.({ phase: 'bootstrap' }); }, 0);
        // ── Phase 4.0B-4F — Phase 2: Auto runtime recovery sau app:context-ready ──
        // Đăng ký một lần. runRuntimeDataRecovery() tự guard bằng state.completed.
        if (!window.__runtimeRecoveryListenerRegistered) {
            window.__runtimeRecoveryListenerRegistered = true;
            window.addEventListener('app:context-ready', function _onAppContextReady() {
                // Delay 500ms để modules/stores kịp mount trước khi Firestore query
                setTimeout(function() {
                    window.runRuntimeDataRecovery?.('app-context-ready');
                }, 500);
            }, { once: false }); // false: nghe lại được sau logout-login
        }
        // ── End Phase 4.0B-4F Phase 2 ────────────────────────────────────────

        // ── [GITHUB-FIX] Task 4: Replay app:context-ready nếu đã bắn trước khi main.js kịp đăng ký ──
        // Trên GitHub Pages, main.js load sau khi app.js — event có thể đã bắn rồi
        if (
            window.__appContextReadyState &&
            window.__appContextReadyState.ready
        ) {
            setTimeout(function() {
                if (typeof window.runRuntimeDataRecovery === 'function') {
                    window.runRuntimeDataRecovery('main-replay-context-ready');
                }
            }, 500);
        }
        // ── End Task 4 ────────────────────────────────────────────────────────

        setTimeout(() => {
            if (typeof window.forceHideLoading === 'function') window.forceHideLoading();
        }, 8000);

        // ── Phase 3.6: Expose listener registry globals ──────────────────────
        // app.js (non-module) dùng window.registerListener, v.v. để tích hợp.
        // Phải expose TRƯỚC khi user login.
        window.registerListener          = registerListener;
        window.hasListener               = hasListener;
        window.removeListener            = removeListener;
        window.cleanupListenersByOwner   = cleanupListenersByOwner;
        window.cleanupListenersByScope   = cleanupListenersByScope;
        window.cleanupListenersByTabId   = cleanupListenersByTabId;
        window.cleanupAllListeners       = cleanupAllListeners;
        window.getListenerMetrics        = getListenerMetrics;
        window.printListenerMetrics      = printListenerMetrics;

        // ── Phase 3.6B: Expose new safety globals ────────────────────────────
        window.safeRegisterSnapshot      = safeRegisterSnapshot;
        window.markListenerSnapshot      = markListenerSnapshot;
        window.recordSnapshot            = recordSnapshot;   // alias compat
        window.legacyAddListener         = legacyAddListener;

        // window.__listenerMetrics — live getter (đọc tại call time, không cache)
        Object.defineProperty(window, '__listenerMetrics', {
            get: () => getListenerMetrics(),
            configurable: true,
        });

        // ── Phase 3.6B: __listenerSessionId — session guard ──────────────────
        // Dùng để phát hiện listener của session cũ còn sống sau login lại.
        // app.js set window.__listenerSessionId = <uid+timestamp> khi login.
        // cleanupAllListeners('logout') sẽ reset về null.
        if (!window.__listenerSessionId) {
            window.__listenerSessionId = null;
        }

        // ── Phase 3.6B: window.addListener bridge ────────────────────────────
        // Nếu app.js hoặc legacy code gọi window.addListener(key, unsub):
        // → bridge sang registerListener nếu có key
        // → fallback sang legacyAddListener nếu không có key
        if (!window.addListener) {
            window.addListener = function(key, unsub) {
                if (key && typeof key === 'string') {
                    // Có key → dùng registry
                    if (window.registerListener) {
                        return window.registerListener(key, unsub, {
                            owner:  'legacy',
                            scope:  'global',
                            reason: 'addListener-window-bridge',
                        });
                    }
                }
                // Không có key → fallback legacy
                return legacyAddListener(unsub, {});
            };
        }

        // ── Phase 3.6D / 3.7A: Student Profile Store ─────────────────────────
        // Expose store + helpers lên window bridge để app.js (non-module) tích hợp.
        // app.js dùng window.syncProfilesToStudentStore sau mỗi profiles snapshot.
        window.studentProfileStore          = studentProfileStore;
        window.syncProfilesToStudentStore   = syncLegacyAllProfiles;
        window.ensureProfilesForTab         = ensureProfilesForTab;
        window.getProfileByIdSafe           = getProfileByIdSafe;
        window.getProfileScaleMetrics       = getProfileScaleMetrics;
        window.printProfileScaleMetrics     = function() {
            // [Phase 3.7C] In cả listener metrics + coverage/fallback guard
            const m = printProfileScaleMetrics();
            if (typeof getProfilesListenerMetrics === 'function') {
                const lm = getProfilesListenerMetrics();
                console.group('[ProfileScale] Listener Metrics — Phase 3.7C');
                console.table({
                    lastProfilesMode:                   { value: lm.lastProfilesMode },
                    activeListenerMounted:               { value: lm.activeListenerMounted },
                    activeSnapshotCount:                 { value: lm.activeSnapshotCount },
                    activeQueryErrorCount:               { value: lm.activeQueryErrorCount },
                    quitLoaded:                          { value: lm.quitLoaded },
                    quitLoadCount:                       { value: lm.quitLoadCount },
                    quitQueryErrorCount:                 { value: lm.quitQueryErrorCount },
                    quitLoadInProgress:                  { value: lm.quitLoadInProgress },
                    fallbackCount:                       { value: lm.fallbackCount },
                    fallbackInProgress:                  { value: lm.fallbackInProgress },
                    fallbackCompleted:                   { value: lm.fallbackCompleted },
                    fallbackMaxPerSession:               { value: lm.fallbackMaxPerSession },
                    fullProfilesFallbackReason:          { value: lm.fullProfilesFallbackReason },
                    activeCoverageWarnings:              { value: lm.activeCoverageWarnings },
                    activeCoverageFallbackTriggered:     { value: lm.activeCoverageFallbackTriggered },
                    activeCoverageLastReason:            { value: lm.activeCoverageLastReason },
                    suspiciousActiveCountEvents:         { value: lm.suspiciousActiveCountEvents },
                    previousCompatCount:                 { value: lm.previousCompatCount },
                    exportEnsureAllProfilesCount:        { value: lm.exportEnsureAllProfilesCount },
                    activeQueryValues:                   { value: (lm.activeQueryValues||[]).join(',') },
                    quitQueryValues:                     { value: (lm.quitQueryValues||[]).join(',') },
                });
                console.groupEnd();
            }
            return m;
        };
        window.resetStudentProfileStore     = resetStudentProfileStore;
        window.classifyProfileStatus        = classifyProfileStatus;

        // ── Phase 3.7B: Profiles Listeners API ─────────────────────────────────
        window.mountActiveProfilesListener  = mountActiveProfilesListener;
        window.cleanupActiveProfilesListener = cleanupActiveProfilesListener;
        window.loadQuitProfilesIfNeeded     = loadQuitProfilesIfNeeded;
        window.cleanupQuitProfilesListener  = cleanupQuitProfilesListener;
        window.loadFullProfilesFallback     = loadFullProfilesFallback;
        window.isQuitProfilesLoaded         = isQuitProfilesLoaded;
        window.resetProfilesListeners       = resetProfilesListeners;
        window.getActiveStatusValues        = getActiveStatusValues;
        window.getQuitStatusValues          = getQuitStatusValues;
        window.getProfilesListenerMetrics   = getProfilesListenerMetrics;

        // ── Phase 3.7C: Status Config + Export helper + Debug ─────────────────
        window.ensureAllProfilesForExport   = ensureAllProfilesForExport;
        window.getProfileStatusConfig       = getProfileStatusConfig;
        window.setProfileStatusConfigForDebug = setProfileStatusConfigForDebug;
        window.resetProfileStatusConfig     = resetProfileStatusConfig;

        // ── Phase 3.8B+C: Inventory Store + Unpaid Debt Query ────────────────
        // [Phase 3.8A] Primary alias — window.__inventoryStore mirrors window.inventoryStore
        window.inventoryStore                    = inventoryStore;
        window.__inventoryStore                  = inventoryStore;
        window.setInventoryStats                 = setInventoryStats;
        window.setFinanceInventoryDebts          = setFinanceInventoryDebts;
        window.setInventoryHistory               = setInventoryHistory;
        window.setAllInventory                   = setAllInventory;
        // [Phase 3.8B] Derive + Index
        window.normalizeStudentKey               = normalizeStudentKey;
        window.deriveFinanceInventoryDebts       = deriveFinanceInventoryDebts;
        window.deriveAndSetFinanceInventoryDebts = deriveAndSetFinanceInventoryDebts;
        window.rebuildInventoryDebtIndex         = rebuildInventoryDebtIndex;
        window.isInventoryDebtIndexReady         = isInventoryDebtIndexReady;
        // [Phase 3.8B] Lookup helpers
        window.getInventoryDebtsForStudent       = getInventoryDebtsForStudent;
        window.getInventoryDebtTotalForStudent   = getInventoryDebtTotalForStudent;
        window.getInventoryDebtSummaryForStudent = getInventoryDebtSummaryForStudent;
        window.getInventoryStats                 = getInventoryStats;
        window.getFinanceInventoryDebts          = getFinanceInventoryDebts;
        window.getInventoryHistory               = getInventoryHistory;
        window.getAllInventoryCompat             = getAllInventoryCompat;
        window.isInventoryHistoryLoaded         = isInventoryHistoryLoaded;
        window.isFinanceDebtLoaded              = isFinanceDebtLoaded;
        window.resetInventoryStore              = resetInventoryStore;
        window.ensureInventoryForFeature        = ensureInventoryForFeature;
        window.getInventoryDependencyMetrics    = getInventoryDependencyMetrics;
        window.printInventoryDependencyMetrics  = printInventoryDependencyMetrics;
        // [Phase 3.8C] Unpaid debt query state API
        window.markUnpaidDebtQueryLoaded        = markUnpaidDebtQueryLoaded;
        window.markUnpaidDebtQueryFailed        = markUnpaidDebtQueryFailed;
        window.getUnpaidInventoryDebtsLoaded    = getUnpaidInventoryDebtsLoaded;
        // [Phase 3.8C] Paginated query utilities
        window.fetchAllMatchingDocs             = fetchAllMatchingDocs;
        window.loadTransactionsForPeriod        = loadTransactionsForPeriod;
        window.warnUnsafeLimit                  = warnUnsafeLimit;
        window.printQueryScaleMetrics           = printQueryScaleMetrics;

        /**
         * window.debugProfileSplit() — xem nhanh trạng thái split profiles.
         * Không log tên / SĐT / CCCD võ sinh.
         */
        window.debugProfileSplit = function() {
            const lm  = getProfilesListenerMetrics();
            const cfg = getProfileStatusConfig();
            console.group('[ProfilesSplit] Debug — Phase 3.7C');
            console.table({
                mode:                     { value: lm.lastProfilesMode },
                activeListenerMounted:    { value: lm.activeListenerMounted },
                activeSnapshotCount:      { value: lm.activeSnapshotCount },
                activeProfileCount:       { value: lm.activeProfileCount },
                quitLoaded:               { value: lm.quitLoaded },
                quitProfileCount:         { value: lm.quitProfileCount },
                allProfilesCompatCount:   { value: lm.allProfilesCompatCount },
                fallbackCount:            { value: lm.fallbackCount },
                fallbackInProgress:       { value: lm.fallbackInProgress },
                coverageWarnings:         { value: lm.activeCoverageWarnings },
                coverageFallbackDone:     { value: lm.activeCoverageFallbackTriggered },
                coverageLastReason:       { value: lm.activeCoverageLastReason || '—' },
                exportEnsureCount:        { value: lm.exportEnsureAllProfilesCount },
                activeQueryValues:        { value: cfg.activeQueryValues.join(', ') },
                quitQueryValues:          { value: cfg.quitQueryValues.join(', ') },
            });
            console.groupEnd();
            return lm;
        };

        // window.__profileScaleMetrics — live getter (đọc tại call time)
        Object.defineProperty(window, '__profileScaleMetrics', {
            get: () => getProfileScaleMetrics(),
            configurable: true,
        });

        // ── Phase 3.6B: window.debugListeners ────────────────────────────────
        // Xem nhanh state listener mà không cần gọi printListenerMetrics đầy đủ.
        window.debugListeners = function() {
            const m = getListenerMetrics();
            // Không lộ data nhạy cảm — chỉ log key/owner/scope/count
            const safeEntries = m.activeEntries.map(e => ({
                key:           e.key,
                owner:         e.owner,
                scope:         e.scope,
                tabId:         e.tabId,
                snapshotCount: e.snapshotCount,
                ageMs:         e.ageMs,
                lastSnapAgo:   e.lastSnapAgo,
                reason:        e.reason,
            }));
            return {
                activeCount:                   m.activeCount,
                legacyActiveListeners:         m.legacyActiveListeners,
                duplicateAttempted:            m.duplicateAttempted,
                duplicatePreventedBeforeCreate: m.duplicatePreventedBeforeCreate,
                duplicateAutoUnsubbed:         m.duplicateAutoUnsubbed,
                unsubscribeErrors:             m.unsubscribeErrors,
                sessionId:                     window.__listenerSessionId,
                activeEntries:                 safeEntries,
            };
        };

        // ── Phase 3.6B: Dev debug panel ──────────────────────────────────────
        if (_isDev) {
            console.group('🏗️ Module Architecture — Phase 3.6B ✅');
            console.log('✅ window.__appLoaded              :', window.__appLoaded, '← app.js');
            console.log('✅ window._moduleRenderApp         :', typeof window._moduleRenderApp, '← [3.5C]');
            console.log('✅ window.showLoading              :', typeof window.showLoading, '← ui/loading.js');
            console.log('✅ window.switchTab                :', typeof window.switchTab, '← with lazy-load');
            console.log('✅ window.safeGetDocs              :', typeof window.safeGetDocs, '← firestore-guard');
            console.log('✅ window.scheduleRender           :', typeof window.scheduleRender, '← [3.5C]');
            console.log('✅ window.invalidateFinance        :', typeof window.invalidateFinance, '← [3.5B]');
            console.log('✅ window.invalidateStudents       :', typeof window.invalidateStudents, '← [3.5B]');
            console.log('✅ window.invalidateByDomain       :', typeof window.invalidateByDomain, '← [3.5B]');
            console.log('✅ window.invalidateCurrentTab     :', typeof window.invalidateCurrentTab, '← [3.5C]');
            console.log('── Phase 3.6 ──────────────────────────────────────────────────');
            console.log('✅ window.registerListener         :', typeof window.registerListener, '← [3.6]');
            console.log('✅ window.hasListener              :', typeof window.hasListener, '← [3.6]');
            console.log('✅ window.removeListener           :', typeof window.removeListener, '← [3.6]');
            console.log('✅ window.cleanupAllListeners      :', typeof window.cleanupAllListeners, '← [3.6]');
            console.log('✅ window.printListenerMetrics     :', typeof window.printListenerMetrics, '← [3.6]');
            console.log('── Phase 3.6B ─────────────────────────────────────────────────');
            console.log('✅ window.safeRegisterSnapshot     :', typeof window.safeRegisterSnapshot, '← [3.6B] NEW');
            console.log('✅ window.markListenerSnapshot     :', typeof window.markListenerSnapshot, '← [3.6B] NEW');
            console.log('✅ window.legacyAddListener        :', typeof window.legacyAddListener, '← [3.6B] NEW');
            console.log('✅ window.debugListeners           :', typeof window.debugListeners, '← [3.6B] NEW');
            console.log('✅ window.__listenerSessionId      :', window.__listenerSessionId, '← [3.6B] session guard');
            console.log('── Phase 3.6D / 3.7A ──────────────────────────────────────────────');
            console.log('✅ window.studentProfileStore      :', typeof window.studentProfileStore, '← [3.6D] NEW');
            console.log('✅ window.syncProfilesToStudentStore:', typeof window.syncProfilesToStudentStore, '← [3.6D] NEW');
            console.log('✅ window.ensureProfilesForTab     :', typeof window.ensureProfilesForTab, '← [3.6D] NEW');
            console.log('✅ window.getProfileByIdSafe       :', typeof window.getProfileByIdSafe, '← [3.6D] NEW');
            console.log('✅ window.printProfileScaleMetrics :', typeof window.printProfileScaleMetrics, '← [3.6D] NEW');
            console.log('✅ window.classifyProfileStatus    :', typeof window.classifyProfileStatus, '← [3.6D] NEW');
            console.log('✅ window.MAIN_JS_LOADED           :', window.MAIN_JS_LOADED, '← [3.6D] bootstrap guard');
            console.log('💡 Tip: window.printProfileScaleMetrics() — xem metrics profile store');
            console.log('📊 listeners.js keys               :', getActiveKeys());
            console.log('📊 listener count                  :', listenerCount());
            console.log('📊 event guard bindings            :', getBindingCount());
            console.log('📊 intervals tracked               :', _intervalRegistry.size);
            console.log('💡 Tip: window.printListenerMetrics() — xem metrics đầy đủ');
            console.log('💡 Tip: window.debugListeners()       — xem state nhanh');
            console.log('💡 Tip: window.printRenderLegacyMetrics() — legacy render counts');
            console.groupEnd();

            setTimeout(() => printQueryAuditReport(), 3000);
        }

    } catch (err) {
        console.error('[main.js] ❌ Bootstrap failed:', err);
        forceHideLoading();
        if (_isDev) alert('[main.js] Bootstrap error: ' + (err && err.message || err));
    }
})();

// ────────────────────────────────────────────────────────────────
// PATCH: Hook resetStore để destroy charts + clear intervals khi logout
// ────────────────────────────────────────────────────────────────

function _patchResetStore() {
    const _orig = window.resetStore;
    window.resetStore = function() {
        if (typeof window._destroyDashboardCharts === 'function') {
            window._destroyDashboardCharts();
        }
        clearAllIntervals();
        _lazyLoaded.clear();
        resetAllGuards();
        // Phase 4K-RUNTIME-CLEANUP: Reset pagination init guards khi logout
        // — đảm bảo login lại sẽ init pagination mới mà không bị skip bởi guard cũ.
        window.__studentPaginationInitialized    = false;
        window.__transactionPaginationInitialized = false;
        window.__dbReadyEventDispatched          = false;
        window.__runtimeReadyFallbackWarned      = false;
        // Phase 4K-DATA-HYDRATION: Reset clubId-specific guard + listener registration
        window.__studentPaginationInitializedForClub = null;
        window.__paginationDbReadyListenerRegistered = false;
        // [Phase 3.6D] Reset student profile store khi logout
        // Xóa toàn bộ cached profiles — listener sẽ populate lại sau login mới.
        if (typeof resetStudentProfileStore === 'function') {
            resetStudentProfileStore('logout');
        }
        // [Phase 4.0B-2] Reset SuperAdmin module state khi logout.
        // Dùng resetSuperAdminModuleState() để reset đúng cả local __saInitialized
        // bên trong ES module (không thể reset trực tiếp từ bên ngoài module).
        // QUAN TRỌNG: KHÔNG set window.SuperAdminModule = undefined ở đây —
        // giữ nguyên để các wrapper vẫn hoạt động trong khoảng trống logout→login,
        // và để ensureSuperAdminModule / initSuperAdmin có thể rebind nhanh.
        if (typeof window.resetSuperAdminModuleState === 'function') {
            window.resetSuperAdminModuleState('logout');
        } else {
            // Fallback nếu module chưa load lần nào (vd. file:// mode)
            window.__superAdminModuleInitialized = false;
            window.__superAdminModuleLoading = false;
        }
        if (typeof _orig === 'function') _orig();
    };
    window.__moduleResetStore = resetStore;
}

// ────────────────────────────────────────────────────────────────
// Phase 3.3G: HEALTH CHECK
// ────────────────────────────────────────────────────────────────

function _runHealthCheck() {
    const required = [
        'showLoading', 'hideLoading', 'withLoading',
        'showToast', 'openModal', 'closeModal', 'switchTab',
        '_moduleRenderApp',
        'scheduleRender', 'invalidateFinanceRender', 'invalidateStudentsRender',
        'invalidateInventoryRender', 'invalidateFinance', 'invalidateStudents',
        'invalidateInventory', 'invalidateDashboard', 'invalidateByDomain',
        'invalidateCurrentTab', 'invalidateTab', 'getCurrentActiveTabId',
        'openAddModal', 'addNewStudent', 'editProfile', 'deleteStudent',
        'quickPay', 'deleteTx', 'skipMonth', 'removeSkip',
        'getInvCategories', 'loadInvCategories',
        'getFinanceChart', 'getMemberChart',
        'renderAttendanceList', 'toggleAttendance', 'renderAttMonthly',
        'safeGetDocs',
        // Phase 3.6
        'registerListener', 'hasListener', 'removeListener',
        'cleanupListenersByOwner', 'cleanupListenersByScope',
        'cleanupListenersByTabId', 'cleanupAllListeners',
        'getListenerMetrics', 'printListenerMetrics',
        // Phase 3.6B
        'safeRegisterSnapshot', 'markListenerSnapshot',
        'legacyAddListener', 'debugListeners',
        // Phase 3.6D / 3.7A
        'syncProfilesToStudentStore', 'ensureProfilesForTab',
        'getProfileByIdSafe', 'printProfileScaleMetrics',
        'resetStudentProfileStore', 'classifyProfileStatus',
    ];
    const missing = required.filter(fn => typeof window[fn] !== 'function');
    if (missing.length > 0) {
        console.warn('[main.js] ⚠️ Health check — missing globals:', missing);
    } else {
        console.log('[main.js] ✅ Health check passed —', required.length, 'functions OK');
    }
}

// ────────────────────────────────────────────────────────────────
// HELPER: Dynamic load app.js nếu chưa có <script defer>
// ────────────────────────────────────────────────────────────────

function _loadLegacyApp() {
    if (window.__appLoaded) return Promise.resolve();
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'app.js';
        script.onload  = () => resolve();
        script.onerror = (err) => reject(new Error('[main.js] Không load được app.js: ' + err));
        document.head.appendChild(script);
    });
}

// ────────────────────────────────────────────────────────────────
// [GITHUB-FIX] Task 6: Debug helper cho GitHub Pages student render
// ────────────────────────────────────────────────────────────────
window.debugGithubStudentRender = function() {
    var store = window.__store || {};
    var profilesObj = store.profiles || {};
    var profilesArr = Array.isArray(store.allProfiles) ? store.allProfiles : [];

    var result = {
        protocol:                window.location.protocol,
        href:                    window.location.href,
        appLoaded:               !!window.__appLoaded,
        mainLoaded:              !!window.MAIN_JS_LOADED,
        mainLoading:             !!window.MAIN_JS_LOADING,
        hasInvalidateStudents:   typeof window.invalidateStudents   === 'function',
        hasInvalidateFinance:    typeof window.invalidateFinance    === 'function',
        hasInvalidateInventory:  typeof window.invalidateInventory  === 'function',
        dataVersion:             store._dataVersion || 0,
        lastDataVersionReason:   store._lastDataVersionReason || '',
        profilesObjectCount:     Object.keys(profilesObj).length,
        profilesArrayCount:      profilesArr.length,
        transactionsCount:       Array.isArray(store.transactions)  ? store.transactions.length  : 0,
        inventoryCount:          Array.isArray(store.inventory)     ? store.inventory.length      : 0,
        activeRowsDom:           document.querySelectorAll('#activeList tr[data-student-id], #activeList .student-row, [data-student-id]').length,
        debtRowsDom:             document.querySelectorAll('#debtList tr[data-student-id], #debtList .student-row').length,
        activeBadgeText:         document.getElementById('activeStudentCount')?.textContent || '',
        txBadgeText:             document.getElementById('txTabCountBadge')?.textContent || '',
        debtBadgeText:           document.getElementById('debtTabCountBadge')?.textContent || '',
        dashboardIncomeText:     document.getElementById('totalIncomeDashboard')?.textContent || '',
        lastSummaryActiveCount:  store._lastSummaryNumbers ? store._lastSummaryNumbers.activeCount : null,
        lastSummaryDebtCount:    store._lastSummaryNumbers ? store._lastSummaryNumbers.debtCount : null,
    };

    console.table(result);
    return result;
};

// ────────────────────────────────────────────────────────────────
// Phase 3.3G: EXPOSE track/clear intervals cho modules khác
// ────────────────────────────────────────────────────────────────
window._trackInterval     = trackInterval;
window._clearAllIntervals = clearAllIntervals;

// ────────────────────────────────────────────────────────────────
// Phase 4.0B-4B: RUNTIME HEALTH GLOBALS
// Expose lên window để DevTools Console và tools có thể gọi.
// ────────────────────────────────────────────────────────────────

/**
 * getRuntimeHealthStatus(options?) — trả về kết quả health check phân loại.
 * @param {object} [options]
 * @param {'all'|'bootstrap'|'after-login'} [options.phase='all']
 * @returns {{ ok, criticalMissing, warnings, infos, checks, checkedAt }}
 */
window.getRuntimeHealthStatus = function getRuntimeHealthStatus(options) {
    const phase = (options && options.phase) || 'all';

    const checks = RUNTIME_HEALTH_CHECKS
        .filter(item => phase === 'all' || item.phase === phase)
        .map(item => {
            let ok    = false;
            let error = '';
            try {
                ok = !!item.check();
            } catch (err) {
                ok    = false;
                error = (err && err.message) || String(err);
            }
            return {
                key:      item.key,
                label:    item.label,
                severity: item.severity,
                phase:    item.phase,
                ok,
                error,
            };
        });

    const criticalMissing = checks.filter(x => !x.ok && x.severity === 'critical');
    const warnings        = checks.filter(x => !x.ok && x.severity === 'warning');
    const infos           = checks.filter(x => !x.ok && x.severity === 'info');

    return {
        phase,
        ok: criticalMissing.length === 0,
        criticalMissing,
        warnings,
        infos,
        checks,
        checkedAt: new Date().toISOString(),
    };
};

/**
 * printRuntimeHealth(options?) — in health check ra console với severity đúng.
 * Chỉ console.error khi thiếu critical thật. Warning/info không tạo error đỏ.
 */
window.printRuntimeHealth = function printRuntimeHealth(options) {
    const result = window.getRuntimeHealthStatus(options);

    console.group('[RuntimeHealth] phase=' + result.phase + ' | ok=' + result.ok);

    if (result.criticalMissing.length) {
        console.error('[RuntimeHealth] ❌ Critical missing:', result.criticalMissing.map(x => x.key));
    } else {
        console.info('[RuntimeHealth] ✅ Critical checks OK');
    }

    if (result.warnings.length) {
        console.warn('[RuntimeHealth] ⚠️ Warnings:', result.warnings.map(x => x.key));
    }

    if (result.infos.length) {
        console.info('[RuntimeHealth] ℹ️ Info:', result.infos.map(x => x.key));
    }

    console.table(result.checks.map(x => ({
        key:      x.key,
        severity: x.severity,
        phase:    x.phase,
        ok:       x.ok,
    })));

    console.groupEnd();

    return result;
};

/**
 * ensureModuleRuntimeReady(moduleName, requiredGlobals?) — kiểm tra nhẹ globals.
 * Chỉ warn nếu thiếu. Không throw. Không làm ngắt app.
 * @param {string} moduleName
 * @param {string[]} [requiredGlobals=[]]
 * @returns {boolean}
 */
window.ensureModuleRuntimeReady = function ensureModuleRuntimeReady(moduleName, requiredGlobals) {
    const globals  = Array.isArray(requiredGlobals) ? requiredGlobals : [];
    const missing  = globals.filter(k => typeof window[k] === 'undefined');

    if (missing.length) {
        console.warn('[RuntimeGuard] ' + moduleName + ' missing globals:', missing);
        return false;
    }

    return true;
};

// ── Phase 4.0B-4B: After-login health check via app:context-ready ─────────
// Listener an toàn — không duplicate, không memory leak, không crash nếu
// event không bao giờ bắn (vd. khi file:// mode hoặc app.js chưa dispatch).
(function() {
    let _afterLoginGuard = false;
    window.addEventListener('app:context-ready', function _onAppContextReady() {
        if (_afterLoginGuard) return;
        _afterLoginGuard = true;
        setTimeout(function() {
            window.printRuntimeHealth?.({ phase: 'after-login' });
        }, 300);
    });
})();

// ── Phase 4K-RUNTIME-CLEANUP: Club Runtime Diagnostics ───────────────────────
// Chỉ chạy khi gọi thủ công từ Console: window.printClubRuntimeDiagnostics()
// Không tự động query khi load — an toàn trong production.
window.printClubRuntimeDiagnostics = async function printClubRuntimeDiagnostics() {
    console.group('[ClubDiagnostics] 🔍 Club Runtime Diagnostics');
    try {
        const _cid     = window.currentClubId || (window.__store && window.__store.currentClubId) || null;
        const _role    = window.userRole || (window.__store && window.__store.userRole) || '(unknown)';
        const _db      = (window.__store && window.__store.db) || window.db || window._db || null;
        const _profRef = window.__store && window.__store.profRef;
        const _colRef  = window.__store && window.__store.colRef;
        const _user    = (window.__store && window.__store.currentUser) || window.currentUser || null;
        const _month   = (function() {
            const el = document.getElementById('filterMonth');
            return el ? el.value : '(ui not ready)';
        })();

        // ── Sync memory snapshot (không query Firestore) ─────────────────────────
        const _profMem    = window.allProfiles
            ? Object.keys(window.allProfiles).length
            : -1;
        const _actMem     = (window.__store && window.__store.activeProfiles)
            ? Object.keys(window.__store.activeProfiles).length
            : ((window.__profileScaleMetrics && window.__profileScaleMetrics.activeCount) || -1);
        const _txMem      = ((window.allTransactions || (window.__store && window.__store.transactions)) || []).length;
        const _tbodyRows  = document.querySelectorAll('tbody tr').length;
        // Phase 4K-STUDENT-LIST: thêm activeList row count + pagination + fallback count
        const _activeListRows  = document.querySelectorAll('#activeList tr[data-student-id]').length;
        const _pgStudentsState = window.__store && window.__store.pagination && window.__store.pagination.students;
        const _pgItemsLen      = _pgStudentsState && Array.isArray(_pgStudentsState.currentItems)
            ? _pgStudentsState.currentItems.length : -1;
        const _fbFallbackCnt   = window.__profileScaleMetrics
            ? (window.__profileScaleMetrics.fallbackCount || 0) : -1;
        const _profMount  = !!(window.__profileScaleMetrics && window.__profileScaleMetrics.activeListenerMounted);

        console.log('currentClubId     :', _cid || '⚠️ MISSING');
        console.log('__store.clubId    :', (window.__store && window.__store.currentClubId) || '⚠️ MISSING');
        console.log('userRole          :', _role);
        console.log('db ready          :', !!_db ? '✅ yes' : '❌ no');
        console.log('profRef ready     :', !!_profRef ? '✅ yes' : '❌ no');
        console.log('colRef ready      :', !!_colRef ? '✅ yes' : '❌ no');
        console.log('currentUser       :', _user ? _user.email || _user.uid : '❌ null');
        console.log('filterMonth (UI)  :', _month);
        console.log('__studentPagInit  :', !!window.__studentPaginationInitialized,
            window.__studentPaginationInitializedForClub ? '(club: ' + window.__studentPaginationInitializedForClub + ')' : '');
        console.log('__txPagInit       :', !!window.__transactionPaginationInitialized);
        console.log('__dbReadyDispatched:', !!window.__dbReadyEventDispatched);
        // ── Memory snapshot ───────────────────────────────────────────────────
        console.log('profiles (mem)    :', _profMem >= 0 ? _profMem : '(not in window.allProfiles)');
        console.log('activeProfiles(mem):', _actMem >= 0 ? _actMem : '(not tracked)');
        console.log('transactions (mem):', _txMem, '(window.allTransactions / __store.transactions)');
        console.log('tbody rows (DOM)  :', _tbodyRows, '(document.querySelectorAll("tbody tr").length)');
        console.log('#activeList rows  :', _activeListRows, '← tr[data-student-id]; 0 nhưng pgItems>0 = island miss');
        console.log('pgStudents items  :', _pgItemsLen >= 0 ? _pgItemsLen : '(pagination not init)', '(store.pagination.students.currentItems)');
        console.log('fullFallbackCount :', _fbFallbackCnt >= 0 ? _fbFallbackCnt : '(not tracked)', '(profile full fallback đã chạy)');
        console.log('profile listener  :', _profMount ? '✅ mounted' : '⚠️ not mounted');
        console.log('isClubRuntimeReady:', typeof window.isClubRuntimeReady === 'function'
            ? (window.isClubRuntimeReady() ? '✅ yes' : '❌ no') : '(function missing)');
        console.log('retryDataHydration:', typeof window.retryDataHydration === 'function' ? '✅ available' : '❌ missing');

        if (!_cid) {
            console.warn('[ClubDiagnostics] ⚠️ currentClubId missing — login chưa hoàn thành hoặc onAuthStateChanged chưa chạy.');
            console.groupEnd();
            return;
        }
        if (!_db) {
            console.warn('[ClubDiagnostics] ⚠️ db chưa sẵn sàng — app:db-ready chưa dispatch hoặc initSaaSDatabase chưa chạy.');
            console.groupEnd();
            return;
        }

        // Profile count (getCountFromServer — không đọc full docs)
        try {
            const { getCountFromServer, collection, query, where } = window._fb_init || {};
            if (getCountFromServer && _profRef) {
                const _allCount   = await getCountFromServer(_profRef);
                const _activeSnap = await getCountFromServer(query(_profRef, where('status', '==', 'active')));
                const _quitSnap   = await getCountFromServer(query(_profRef, where('status', '==', 'quit')));
                console.log('profiles total    :', _allCount.data().count);
                console.log('profiles active   :', _activeSnap.data().count);
                console.log('profiles quit     :', _quitSnap.data().count);
                const _other = _allCount.data().count - _activeSnap.data().count - _quitSnap.data().count;
                if (_other > 0) console.log('profiles other    :', _other, '(trial / no-status / legacy)');
            } else {
                console.log('profiles count    : (getCountFromServer or profRef not available)');
            }
        } catch (pErr) {
            const _msg = (pErr && pErr.message) || String(pErr);
            if (_msg.includes('permission-denied') || _msg.includes('PERMISSION_DENIED')) {
                console.warn('[ClubDiagnostics] profiles: permission-denied — kiểm tra Firestore Rules cho profiles collection.');
            } else {
                console.warn('[ClubDiagnostics] profiles count error:', _msg);
            }
        }

        // Stats doc check
        try {
            const { getDoc, doc, getFirestore } = window._fb_init || {};
            if (getDoc && doc && _db) {
                const _now = new Date();
                const _ym  = _now.getFullYear() + '-' + String(_now.getMonth() + 1).padStart(2, '0');
                const _statsPath = 'clubs/' + _cid + '/stats/monthly_' + _ym;
                const _statsSnap = await getDoc(doc(_db, 'clubs', _cid, 'stats', 'monthly_' + _ym));
                console.log('stats doc monthly :', _statsPath, _statsSnap.exists() ? '✅ exists' : '⚠️ missing');
                if (_statsSnap.exists()) {
                    const _sd = _statsSnap.data();
                    console.log('  totalRevenue    :', _sd.totalRevenue);
                    console.log('  totalExpense    :', _sd.totalExpense);
                }
            }
        } catch (sErr) {
            const _msg = (sErr && sErr.message) || String(sErr);
            console.warn('[ClubDiagnostics] stats doc error:', _msg);
        }

        // ── Transaction count cho tháng hiện tại (Phase 4K-PROFILE-HYDRATION) ──
        // Dùng getCountFromServer — không kéo full docs, an toàn production.
        // Không set Học Phí = 0 nếu lỗi; báo rõ permission-denied / index lỗi.
        try {
            const { getCountFromServer, collection, query, where } = window._fb_init || {};
            if (getCountFromServer && _db && _cid) {
                const _now    = new Date();
                const _txMonth = _month && _month !== '(ui not ready)'
                    ? _month
                    : _now.getFullYear() + '-' + String(_now.getMonth() + 1).padStart(2, '0');
                const _txRef   = collection(_db, 'clubs', _cid, 'transactions');

                const _txAllSnap   = await getCountFromServer(_txRef);
                console.log('transactions total:', _txAllSnap.data().count);

                const _txMonthSnap = await getCountFromServer(
                    query(_txRef, where('txMonth', '==', _txMonth))
                );
                console.log('transactions month:', _txMonth, '→', _txMonthSnap.data().count);

                console.log('selected txMonth  :', _txMonth, '(UI filterMonth:', _month, ')');
            } else {
                console.log('transactions count: (getCountFromServer / db / clubId không sẵn)');
            }
        } catch (txErr) {
            const _msg = (txErr && txErr.message) || String(txErr);
            if (_msg.includes('permission-denied') || _msg.includes('PERMISSION_DENIED')) {
                console.warn('[ClubDiagnostics] transactions: permission-denied — kiểm tra Firestore Rules cho transactions collection.');
                console.warn('[ClubDiagnostics] ⚠️ Đây là lý do Học Phí / Doanh thu có thể hiện 0.');
            } else if (_msg.includes('failed-precondition') || _msg.includes('requires an index')) {
                console.warn('[ClubDiagnostics] transactions: thiếu Firestore index — deploy firestore.indexes.json.');
                console.warn('[ClubDiagnostics] ⚠️ Đây là lý do Học Phí / Doanh thu có thể hiện 0.');
            } else {
                console.warn('[ClubDiagnostics] transactions count error:', _msg);
            }
        }

        // ── Last Firestore error (nếu có) ─────────────────────────────────────
        // Bất kỳ module nào có thể set window.__lastFirestoreError khi gặp lỗi Firestore.
        if (window.__lastFirestoreError) {
            const _fe = window.__lastFirestoreError;
            console.warn('[ClubDiagnostics] last Firestore error:', {
                code:    _fe.code    || '(no code)',
                message: _fe.message || '(no message)',
                module:  _fe.module  || '(unknown)',
                ts:      _fe.ts ? new Date(_fe.ts).toLocaleString() : '(no ts)',
            });
        } else {
            console.log('last Firestore err :', '(none recorded)');
        }

        // ── Legacy scheduleRender metrics (nếu có) ────────────────────────────
        if (window.__renderLegacyMetrics) {
            const _m = window.__renderLegacyMetrics;
            console.log('scheduleRender calls (legacy):', _m.scheduleRenderCalls || 0);
        }

        console.log('[ClubDiagnostics] ✅ Done. Gọi lại bất cứ lúc nào để re-check.');
        console.log('[ClubDiagnostics] 💡 Nếu pgStudents items > 0 nhưng #activeList rows = 0, gọi: window.debugStudentListHydration()');
    } catch (err) {
        console.error('[ClubDiagnostics] Error:', err);
    }
    console.groupEnd();
};

// ─────────────────────────────────────────────────────────────────────────────
// DEBUG STUDENT LIST HYDRATION — Phase 4K-STUDENT-LIST
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Helper debug — chẩn đoán tại sao danh sách võ sinh hiển thị trống.
 *
 * Thực hiện:
 *   1. In pgState.currentItems.length
 *   2. In #activeList tr[data-student-id] count
 *   3. Nếu currentItems > 0 nhưng DOM row = 0, thử trigger render lại
 *   4. Nếu profiles collection có docs nhưng active count = 0, gọi full fallback
 *
 * Chỉ chạy thủ công từ Console — KHÔNG tự động query khi load.
 */
window.debugStudentListHydration = async function debugStudentListHydration() {
    console.group('[DebugStudentList] 🔍 Student List Hydration Diagnostics');
    try {
        const _pg      = window.__store && window.__store.pagination && window.__store.pagination.students;
        const _items   = _pg && Array.isArray(_pg.currentItems) ? _pg.currentItems.length : -1;
        const _pgPage  = _pg ? (_pg.currentPage || 0) : -1;
        const _pgEnable = _pg ? !!_pg.enabled : false;
        const _pgVer   = (window.__store && window.__store._studentsPaginationVersion) || 0;
        const _domRows = document.querySelectorAll('#activeList tr[data-student-id]').length;
        const _activeEl = document.getElementById('activeList');
        const _activeInnerLen = _activeEl ? _activeEl.innerHTML.length : -1;
        const _allProf = window.allProfiles ? Object.keys(window.allProfiles).length : -1;
        const _actProf = (window.__store && window.__store.activeProfiles)
            ? Object.keys(window.__store.activeProfiles).length : -1;

        // Cache metrics nếu island đã expose qua registerStudentsLegacyGlobals()
        const _cacheM = typeof window.getStudentsCacheMetrics === 'function'
            ? window.getStudentsCacheMetrics() : null;

        console.log('── Pagination state ──────────────────────────────');
        console.log('pgState.currentItems.length :', _items >= 0 ? _items : '(not init)');
        console.log('pgState.currentPage         :', _pgPage >= 0 ? _pgPage : '(not init)');
        console.log('pgState.enabled             :', _pgEnable);
        console.log('_studentsPaginationVersion  :', _pgVer, '(tăng mỗi khi _doLoad thành công)');
        console.log('── DOM state ─────────────────────────────────────');
        console.log('#activeList tr[data-student-id] :', _domRows);
        console.log('#activeList innerHTML.length    :', _activeInnerLen, '(0 = DOM empty)');
        console.log('── Profile state ─────────────────────────────────');
        console.log('allProfiles (window)        :', _allProf >= 0 ? _allProf : '(not loaded)');
        console.log('activeProfiles (__store)    :', _actProf >= 0 ? _actProf : '(not tracked)');
        console.log('── Render cache ──────────────────────────────────');
        if (_cacheM) {
            console.log('activeRows cache length     :', _cacheM.activeRowsLength,
                _cacheM.activeRowsLength === 0 ? '⚠️ RỖNG — island sẽ clear DOM!' : '(có data)');
            console.log('debtRows cache length       :', _cacheM.debtRowsLength);
            console.log('quitRows cache length       :', _cacheM.quitRowsLength);
            console.log('cache paramsKey             :', _cacheM.paramsKey);
            console.log('cache dataVersion           :', _cacheM.dataVersion);
        } else {
            console.log('cache metrics               : (window.getStudentsCacheMetrics not available)');
            console.log('                              Đợi registerStudentsLegacyGlobals() chạy hoặc check renderStudents.js');
        }
        console.log('─────────────────────────────────────────────────');

        if (_items > 0 && _domRows === 0) {
            console.warn('[DebugStudentList] ⚠️ pgState có', _items, 'items nhưng DOM trống — island bị overwrite hoặc miss');
            if (_cacheM && _cacheM.activeRowsLength === 0) {
                console.warn('[DebugStudentList] 🔴 activeRows cache = 0 → renderActiveIsland() gọi replaceChildren() với HTML rỗng → xóa DOM.');
                console.warn('[DebugStudentList]    Fix: renderActiveIsland() phải guard pagination state trước khi clear.');
                console.warn('[DebugStudentList]    Nếu fix đã áp dụng → chạy window.watchActiveListMutations() để trace thêm.');
            }
            console.log('[DebugStudentList] 🔧 Thử invalidate + re-render...');
            if (typeof window.refreshListComputation === 'function') {
                window.refreshListComputation('students.activeList', 'debug-hydration');
            }
            if (typeof window.invalidateList === 'function') {
                window.invalidateList('students.activeList', 'debug-hydration');
            } else if (typeof window.invalidateStudents === 'function') {
                window.invalidateStudents('debug-hydration');
            }
            setTimeout(() => {
                const _afterRows = document.querySelectorAll('#activeList tr[data-student-id]').length;
                console.log('[DebugStudentList] Sau re-render: #activeList rows =', _afterRows);
                if (_afterRows === 0) {
                    console.warn('[DebugStudentList] Vẫn trống — gọi retryDataHydration...');
                    if (typeof window.retryDataHydration === 'function') window.retryDataHydration('debug-hydration');
                }
            }, 500);
        } else if (_items === 0 && _allProf === 0 && _actProf <= 0) {
            // Profiles chưa load — check collection có docs không
            const _profRef = window.__store && window.__store.profRef;
            const { query: _q, limit: _l, getDocs: _g } = window._fb_init || {};
            if (_g && _q && _l && _profRef) {
                console.log('[DebugStudentList] Kiểm tra collection có docs...');
                try {
                    const _probe = await _g(_q(_profRef, _l(1)));
                    if (!_probe.empty) {
                        console.warn('[DebugStudentList] Collection có docs nhưng active count = 0 → gọi full fallback');
                        if (typeof window.retryDataHydration === 'function') {
                            window.retryDataHydration('debug-hydration-probe');
                        }
                    } else {
                        console.log('[DebugStudentList] Collection trống — CLB chưa có võ sinh.');
                    }
                } catch (_pe) {
                    console.warn('[DebugStudentList] Probe lỗi:', _pe.message || _pe.code);
                }
            } else {
                console.warn('[DebugStudentList] Firebase SDK hoặc profRef chưa sẵn — gọi retryDataHydration()');
                if (typeof window.retryDataHydration === 'function') window.retryDataHydration('debug-hydration-no-sdk');
            }
        } else {
            console.log('[DebugStudentList] ✅ Data OK — items:', _items, ' DOM rows:', _domRows);
        }
        console.log('[DebugStudentList] 💡 Nếu rows bị xóa ngay sau khi hiện → chạy: window.watchActiveListMutations()');
    } catch (_err) {
        console.error('[DebugStudentList] Error:', _err);
    }
    console.groupEnd();
};

// ─────────────────────────────────────────────────────────────────────────────
// WATCH ACTIVE LIST MUTATIONS — Phase 4K-STUDENT-RENDER-OVERWRITE-FIX
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Helper debug — theo dõi khi #activeList bị clear hoặc thay đổi.
 * Chỉ chạy thủ công từ Console — KHÔNG tự mount khi page load.
 *
 * Chạy:
 *   window.watchActiveListMutations()
 *   // ... switch tab, thao tác để reproduce ...
 *   window.__activeListMutationObserver?.disconnect()  // dừng khi xong
 */
// ─────────────────────────────────────────────────────────────────────────────
// TASK 7 — debugZeroBadges: kiểm tra nhanh trạng thái badge/dashboard
// Chạy trong Console: debugZeroBadges()
// ─────────────────────────────────────────────────────────────────────────────
window.debugZeroBadges = function debugZeroBadges() {
    const st = window.__store || {};
    const pgStudents = st.pagination && st.pagination.students;
    const pgTx = st.pagination && st.pagination.transactions;

    const result = {
        href:     location.href,
        protocol: location.protocol,

        appLoaded:  !!window.__appLoaded,
        mainLoaded: !!window.MAIN_JS_LOADED,

        storeProfilesCount: Object.keys(st.profiles || {}).length,
        studentStoreCompatCount:
            window.studentProfileStore && window.studentProfileStore.getAllProfilesCompat
                ? Object.keys(window.studentProfileStore.getAllProfilesCompat() || {}).length
                : -1,

        paginationStudentItems: Array.isArray(pgStudents && pgStudents.currentItems ? pgStudents.currentItems : null) ? pgStudents.currentItems.length : -1,
        activeRowsDom: document.querySelectorAll('#activeList tr[data-student-id]').length,

        storeTransactionsCount: Array.isArray(st.transactions) ? st.transactions.length : -1,
        paginationTxItems: Array.isArray(pgTx && pgTx.currentItems ? pgTx.currentItems : null) ? pgTx.currentItems.length : -1,
        txRowsDom: document.querySelectorAll('#txList tr[data-tx-id]').length,

        activeBadgeText:  (document.getElementById('activeStudentCount')  || {}).textContent || '',
        debtBadgeText:    (document.getElementById('debtTabCountBadge')   || {}).textContent || '',
        txBadgeText:      (document.getElementById('txTabCountBadge')     || {}).textContent || '',

        totalIncomeDashboard:  (document.getElementById('totalIncomeDashboard')  || {}).textContent || '',
        totalExpenseDashboard: (document.getElementById('totalExpenseDashboard') || {}).textContent || '',
        totalProfitDashboard:  (document.getElementById('totalProfitDashboard')  || {}).textContent || '',

        lastSummaryNumbers:        st._lastSummaryNumbers              || null,
        lastProfileHydrateReason:  st._lastProfileHydrateReason        || '',
        lastTxHydrateReason:       st._lastTxHydrateReason             || '',
        summaryPartialFromPagination: !!st._summaryPartialFromPagination,

        hasUpdateSummaryNumbers:  typeof window.updateSummaryNumbers  === 'function',
        hasRenderDashboardCharts: typeof window.renderDashboardCharts === 'function',
        hasRenderBranchStats:     typeof window.renderBranchStats     === 'function',
        hasModuleDashboard:       !!window._moduleDashboard,
    };

    console.table(result);
    return result;
};

window.watchActiveListMutations = function watchActiveListMutations() {
    const el = document.getElementById('activeList');
    if (!el) { console.warn('[WatchMutation] #activeList không tìm thấy.'); return; }
    if (window.__activeListMutationObserver) {
        window.__activeListMutationObserver.disconnect();
        console.log('[WatchMutation] Observer cũ đã disconnect.');
    }
    const obs = new MutationObserver((_mutations) => {
        const rows = el.querySelectorAll('tr[data-student-id]').length;
        const len  = el.innerHTML.length;
        console.warn('[ActiveListMutation] DOM changed →', {
            rows,
            htmlLength: len,
            note: rows === 0 && len < 100 ? '⚠️ LIST CLEARED' : (rows > 0 ? '✅ has rows' : '(empty html)'),
            stack: new Error('mutation-trace').stack,
        });
    });
    obs.observe(el, { childList: true, subtree: false });
    window.__activeListMutationObserver = obs;
    console.log('[WatchMutation] ✅ MutationObserver mounted on #activeList.');
    console.log('[WatchMutation]    Thao tác để reproduce → xem log bên trên.');
    console.log('[WatchMutation]    Dừng: window.__activeListMutationObserver.disconnect()');
};

// ── PHẦN 7: Debug functions cho runtime parity kiểm tra GitHub/domain ─────────

/**
 * debugRuntimeParity() — Kiểm tra tình trạng runtime parity giữa local HTTP và GitHub/domain.
 * Kết quả đúng trên GitHub/domain:
 *   runtimeMode = "http-module", mainLoaded = true, pgCurrentItems = 50,
 *   activeRows = 50, nextActiveExists = true, oldNextCount = 0
 */
window.debugRuntimeParity = function() {
    const st = window.__store || {};
    const pg = st.pagination && st.pagination.students;
    const profileModal = document.getElementById('profileModal');

    const result = {
        href: location.href,
        protocol: location.protocol,
        runtimeMode: window.__RUNTIME_MODE || '',
        fileMode: !!window.__APP_STANDALONE_FILE_MODE,
        moduleDisabled: !!window.__MODULE_BOOTSTRAP_DISABLED,
        mainLoaded: !!window.MAIN_JS_LOADED,
        appLoaded: !!window.__appLoaded,

        currentTab: typeof window.getCurrentActiveTabId === 'function'
            ? window.getCurrentActiveTabId()
            : '',

        profilesCount: Object.keys(st.profiles || {}).length,

        studentPaginationInitialized: !!window.__studentPaginationInitialized,
        studentPaginationInitializedForClub: window.__studentPaginationInitializedForClub || '',
        pgCurrentPage: pg ? pg.currentPage : -1,
        pgCurrentItems: Array.isArray(pg?.currentItems) ? pg.currentItems.length : -1,
        pgHasNext: pg ? pg.hasNext : null,
        pgIsLoading: pg ? pg.isLoading : null,

        activeRows: document.querySelectorAll('#activeList tr[data-student-id]').length,
        nextActiveExists: !!document.getElementById('pgNext_students_active'),
        oldNextCount: document.querySelectorAll('#pgNext_students').length,

        closeModalType: typeof window.closeModal,
        profileModalDisplay: profileModal ? profileModal.style.display : '(missing)',
        hasRefreshListsComputation: typeof window.refreshListsComputation === 'function',
        hasInvalidateList: typeof window.invalidateList === 'function',
    };

    console.table(result);
    return result;
};

/**
 * debugProfileModalClose() — Kiểm tra closeModal() đóng profileModal đúng không.
 * Kết quả đúng: noArgCloses = true, withArgCloses = true
 */
// ── PHẦN 6: Precompute search text cache ─────────────────────────────────────

/**
 * window.__searchTextCache — Lưu searchBlob đã normalize cho profiles/transactions/inventory.
 * Mỗi entry được tính một lần khi dataVersion thay đổi, không tính lại mỗi lần gõ.
 */
window.__searchTextCache = {
    profilesVersion:      0,
    profiles:             new Map(),
    transactionsVersion:  0,
    transactions:         new Map(),
    inventoryVersion:     0,
    inventory:            new Map(),
};

/**
 * Tính hoặc lấy searchBlob cho profile từ cache.
 * Gọi từ studentsRenderer khi search.
 */
window.getProfileSearchBlob = function(id, profile) {
    const cache   = window.__searchTextCache;
    const storeVer = (window.__store && window.__store._dataVersion) || 0;
    if (cache.profilesVersion !== storeVer) {
        cache.profiles.clear();
        cache.profilesVersion = storeVer;
    }
    if (!cache.profiles.has(id)) {
        const p   = profile || {};
        const nvFn = window.normalizeVNForSearch || (v => String(v || '').toLowerCase());
        const blob = [
            id,
            p.name || '',
            p.nickname || '',
            p.memberId || '',
            p.studentCode || '',
            p.code || '',
            p.belt || '',
            p.notes || '',
            p.phone || '',
            p.parentPhone || '',
            p.contactPhone || '',
            p.guardianPhone || '',
        ].map(v => nvFn(v)).join(' ');
        cache.profiles.set(id, blob);
    }
    return cache.profiles.get(id);
};

// ── PHẦN 12: debugSearchPerformance ──────────────────────────────────────────

/**
 * debugSearchPerformance(term?) — Kiểm tra trạng thái search performance runtime.
 * Kết quả đúng sau fix:
 *   searchRuntimeMounted = true
 *   legacySearchHandlerActive = false (khi http-module)
 *   moduleRenderAppCalls không tăng khi search
 *   scheduleRenderCalls không tăng khi search
 */
window.debugSearchPerformance = function(term) {
    const input = document.getElementById('searchInput');
    if (term !== undefined && input) input.value = term;

    const m  = window.__renderLegacyMetrics || {};
    const st = window.__store || {};
    const sr = window.__searchRuntimeState || {};

    const result = {
        term:                       input ? input.value : '',
        currentTab:                 typeof window.getCurrentActiveTabId === 'function' ? window.getCurrentActiveTabId() : '',
        searchRuntimeMounted:       !!window.__searchRuntimeMounted,
        legacySearchHandlerActive:  !!(document.getElementById('searchInput') && document.getElementById('searchInput').oninput),
        profilesCount:              Object.keys(st.profiles || {}).length,
        transactionsCount:          Array.isArray(st.transactions) ? st.transactions.length : -1,
        inventoryCount:             Array.isArray(st.inventory) ? st.inventory.length : -1,
        dataVersion:                st._dataVersion || 0,
        scheduleRenderCalls:        m.scheduleRenderCalls || 0,
        moduleRenderAppCalls:       m.moduleRenderAppCalls || 0,
        invalidateCurrentTabCalls:  m.invalidateCurrentTabCalls || 0,
        listComputationRefreshByDomain: m.listComputationRefreshByDomain || {},
        listComputationRefreshDuration: m.listComputationRefreshDuration || {},
        searchRuntimeState: {
            runCount:        sr.runCount || 0,
            skippedSameTerm: sr.skippedSameTerm || 0,
            cacheSize:       typeof window.__searchRuntimeState !== 'undefined'
                ? (window.getSearchRuntimeState ? window.getSearchRuntimeState().cacheSize : '?') : 0,
            lastTerm:        sr.lastTerm || '',
            lastTab:         sr.lastTab || '',
        },
        searchFallbackCount:        window.__searchFallbackCount || 0,
        searchTextCacheProfiles:    window.__searchTextCache ? window.__searchTextCache.profiles.size : 0,
        pendingDomainInvalidations: (window.__pendingDomainInvalidations || []).length,
    };

    console.table(result);
    return result;
};

window.debugProfileModalClose = function() {
    const modal = document.getElementById('profileModal');
    if (!modal) return { ok: false, reason: 'missing profileModal' };

    modal.style.display = 'flex';
    const before = modal.style.display;

    try {
        window.closeModal();
    } catch (e) {
        return { ok: false, error: e.message, before, after: modal.style.display };
    }

    const afterNoArg = modal.style.display;

    modal.style.display = 'flex';
    window.closeModal('profileModal');
    const afterWithArg = modal.style.display;

    const result = {
        before,
        afterNoArg,
        afterWithArg,
        noArgCloses: afterNoArg === 'none',
        withArgCloses: afterWithArg === 'none',
    };

    console.table(result);
    return result;
};


// ════════════════════════════════════════════════════════════════
// Phase 4K-5O-A — Runtime Diagnostics & Stability Gate
// ════════════════════════════════════════════════════════════════

// PHẦN 1 — APP BUILD VERSION
window.APP_BUILD_VERSION = '4K-5O-A-runtime-diagnostics-20260605';

window.debugAppVersion = function() {
  const scripts = Array.from(document.scripts || []).map(s => s.src || '').filter(Boolean);
  const result = {
    buildVersion: window.APP_BUILD_VERSION || '',
    href: location.href,
    host: location.host,
    protocol: location.protocol,
    mainScripts: scripts.filter(x => x.includes('main.js')),
    appScripts: scripts.filter(x => x.includes('app.js')),
    hasNoJekyllExpected: true,
    clubId: (window.__store || {}).clubId || window.currentClubId || '',
    currentTab: (window.__store || {}).currentTab || window.currentTab || '',
    timestamp: new Date().toISOString()
  };
  console.table(result);
  return result;
};

// PHẦN 2 — RUNTIME ERROR GUARD
window.__runtimeErrors = window.__runtimeErrors || [];

window.recordRuntimeError = function(source, err, extra) {
  extra = extra || {};
  try {
    var item = {
      source: String(source || 'unknown'),
      message: String(err && (err.message || err.reason || err) || ''),
      stack: String(err && err.stack || ''),
      extra: extra,
      tab: (window.__store || {}).currentTab || window.currentTab || '',
      clubId: (window.__store || {}).clubId || window.currentClubId || '',
      buildVersion: window.APP_BUILD_VERSION || '',
      time: new Date().toISOString()
    };
    window.__runtimeErrors.push(item);
    if (window.__runtimeErrors.length > 100) {
      window.__runtimeErrors = window.__runtimeErrors.slice(-100);
    }
    console.warn('[RuntimeErrorRecorded]', item);
    return item;
  } catch (_) {
    return null;
  }
};

if (!window.__runtimeErrorGuardBound) {
  window.__runtimeErrorGuardBound = true;
  window.addEventListener('error', function(event) {
    window.recordRuntimeError &&
      window.recordRuntimeError('window.error', event.error || event.message, {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno
      });
  });
  window.addEventListener('unhandledrejection', function(event) {
    window.recordRuntimeError &&
      window.recordRuntimeError('window.unhandledrejection', event.reason || event, {});
  });
}

window.debugRuntimeErrors = function() {
  var errors = window.__runtimeErrors || [];
  console.table(errors.slice(-20));
  return {
    count: errors.length,
    last: errors[errors.length - 1] || null,
    recent: errors.slice(-20)
  };
};

// PHẦN 3 — SAFE DEBUG CALL HELPER
window.safeDebugCall = async function(name, fn, args) {
  args = Array.isArray(args) ? args : [];
  try {
    if (typeof fn !== 'function') {
      return { ok: false, missing: true, name: name };
    }
    var value = await Promise.resolve(fn.apply(window, args));
    return { ok: true, name: name, value: value };
  } catch (err) {
    window.recordRuntimeError &&
      window.recordRuntimeError('safeDebugCall:' + name, err);
    return {
      ok: false,
      name: name,
      message: err && err.message || String(err),
      stack: err && err.stack || ''
    };
  }
};

// PHẦN 4 — DATA SOURCE AUTHORITY DEBUG
window.debugDataSourceAuthority = function() {
  var st = window.__store || {};
  var pgStudents = (st.pagination && st.pagination.students) || {};
  var pgTx = (st.pagination && st.pagination.transactions) || {};
  var profilesCount = Object.keys(st.profiles || {}).length;
  var result = {
    activeList: {
      profilesCount: profilesCount,
      activeRenderLimit: window.__activeRenderLimit || null,
      usesFullProfilesLikely: profilesCount > 0,
      paginationItems: Array.isArray(pgStudents.currentItems) ? pgStudents.currentItems.length : 0,
      paginationHasNext: !!pgStudents.hasNext
    },
    debtList: {
      profilesCount: profilesCount,
      fullLoadedForDebt: !!st._profilesFullLoadedForDebt,
      debtRenderLimit: window.__debtRenderLimit || null,
      hasDebtOverdueFilter: !!document.getElementById('debtOverdueFilter')
    },
    transactions: {
      storeTransactions: Array.isArray(st.transactions) ? st.transactions.length : 0,
      allTransactions: Array.isArray(st.allTransactions) ? st.allTransactions.length : 0,
      windowAllTransactions: Array.isArray(window.allTransactions) ? window.allTransactions.length : 0,
      paginationItems: Array.isArray(pgTx.currentItems) ? pgTx.currentItems.length : 0,
      paginationHasNext: !!pgTx.hasNext
    },
    dashboard: {
      hasLastBStats: !!st._lastBStats,
      hasLastBExamStats: !!st._lastBExamStats,
      hasDebugDashboardBranchRevenue: typeof window.debugDashboardBranchRevenue === 'function'
    },
    exam: {
      hasCanonicalLedger: typeof window.buildCanonicalExamPaymentLedger === 'function',
      hasDebugExamCanonicalLedger: typeof window.debugExamCanonicalLedger === 'function'
    }
  };
  console.log('[debugDataSourceAuthority]', result);
  return result;
};

// PHẦN 5 — FINANCE RECONCILE DEBUG
window.debugFinanceReconcile = function() {
  var st = window.__store || {};
  var selectedMonth =
    (document.getElementById('filterMonth') && document.getElementById('filterMonth').value) ||
    st.selectedMonth || '';
  var txs =
    Array.isArray(st.allTransactions) ? st.allTransactions :
    Array.isArray(window.allTransactions) ? window.allTransactions :
    Array.isArray(st.transactions) ? st.transactions :
    [];
  var totalAmount = 0, componentTotal = 0, tuitionTotal = 0, examTotal = 0;
  var inventoryTotal = 0, otherTotal = 0;
  var warnings = [];
  txs.forEach(function(t) {
    if (!t) return;
    var amount = Number(t.amount || 0);
    if (amount > 0) totalAmount += amount;
    var comps =
      typeof window.getAccountingComponents === 'function'
        ? window.getAccountingComponents(t)
        : (typeof window.expandTransactionComponentsForAccounting === 'function'
            ? window.expandTransactionComponentsForAccounting(t)
            : []);
    if (Array.isArray(comps) && comps.length) {
      comps.forEach(function(c) {
        var kind = c.kind || '';
        var cAmount = Number(c.amount || 0);
        if (cAmount <= 0) return;
        componentTotal += cAmount;
        if (kind === 'tuition') tuitionTotal += cAmount;
        else if (kind === 'exam') examTotal += cAmount;
        else if (kind === 'inventory' || kind === 'inventoryDebt') inventoryTotal += cAmount;
        else otherTotal += cAmount;
      });
    } else {
      if (amount > 0 && String(t.type || '').includes('Gộp')) {
        warnings.push({
          id: t.id || t.txId || '',
          type: t.type || '',
          student: t.studentName || t.description || '',
          warning: 'Bundle-like transaction without components'
        });
      }
    }
    if (!t.branch) {
      warnings.push({
        id: t.id || t.txId || '',
        type: t.type || '',
        student: t.studentName || t.description || '',
        warning: 'Missing branch'
      });
    }
  });
  var result = {
    selectedMonth: selectedMonth,
    transactionCount: txs.length,
    totalAmount: totalAmount,
    componentTotal: componentTotal,
    tuitionTotal: tuitionTotal,
    examTotal: examTotal,
    inventoryTotal: inventoryTotal,
    otherTotal: otherTotal,
    warningsCount: warnings.length,
    warnings: warnings.slice(0, 50)
  };
  console.table(result);
  if (warnings.length) console.table(warnings.slice(0, 50));
  return result;
};

// PHẦN 6 — RENDER HEALTH DEBUG
window.__renderHealth = window.__renderHealth || {};

window.recordRenderHealth = function(name, durationMs, extra) {
  extra = extra || {};
  try {
    var key = String(name || 'unknown');
    var old = window.__renderHealth[key] || { count: 0, maxMs: 0, lastMs: 0, warnings: [] };
    old.count += 1;
    old.lastMs = Number(durationMs || 0);
    old.maxMs = Math.max(old.maxMs || 0, old.lastMs);
    old.lastAt = new Date().toISOString();
    if (old.lastMs > 100) {
      old.warnings.push({ type: 'slow-render', durationMs: old.lastMs, extra: extra, time: old.lastAt });
    }
    if (old.warnings.length > 20) old.warnings = old.warnings.slice(-20);
    window.__renderHealth[key] = old;
    return old;
  } catch (_) {
    return null;
  }
};

window.debugRenderHealth = function() {
  var health = window.__renderHealth || {};
  var domCounts = {
    activeRows: document.querySelectorAll('#activeList tr').length,
    debtRows: document.querySelectorAll('#debtList tr').length,
    txRows: document.querySelectorAll('#txList tr').length,
    quitRows: document.querySelectorAll('#quitList tr').length
  };
  var largeWarnings = Object.entries(domCounts)
    .filter(function(e) { return e[1] > 500; })
    .map(function(e) { return { list: e[0], rows: e[1], warning: 'Large DOM list > 500 rows' }; });
  var result = { health: health, domCounts: domCounts, largeWarnings: largeWarnings };
  console.log('[debugRenderHealth]', result);
  if (largeWarnings.length) console.table(largeWarnings);
  return result;
};

// PHẦN 7 — RUN GUARDED ACTION HELPER
window.__actionLocks = window.__actionLocks || {};

window.runGuardedAction = async function(actionName, fn, options) {
  options = options || {};
  var name = String(actionName || 'unknown-action');
  if (window.__actionLocks[name]) {
    console.warn('[runGuardedAction] locked:', name);
    return { ok: false, locked: true, actionName: name };
  }
  window.__actionLocks[name] = true;
  try {
    if (options.startToast && window.showToast) {
      window.showToast(options.startToast);
    }
    var value = await Promise.resolve(fn());
    if (options.successToast && window.showToast) {
      window.showToast(options.successToast);
    }
    return { ok: true, actionName: name, value: value };
  } catch (err) {
    console.error('[runGuardedAction] failed:', name, err);
    window.recordRuntimeError &&
      window.recordRuntimeError('action:' + name, err, options);
    if (options.errorAlert !== false) {
      alert(options.errorMessage || 'Thao tác không thành công. Vui lòng kiểm tra mạng/quyền hoặc Console.');
    }
    return {
      ok: false,
      actionName: name,
      message: err && err.message || String(err),
      stack: err && err.stack || ''
    };
  } finally {
    window.__actionLocks[name] = false;
  }
};

// ════════════════════════════════════════════════════════════════
// Phase 4K-4B — debugRuntimeSmokeTest
// Kiểm tra nhanh sau khi upload GitHub/domain.
// Dùng: debugRuntimeSmokeTest() từ Console.
// ════════════════════════════════════════════════════════════════
window.debugRuntimeSmokeTest = async function(term) {
    term = typeof term === 'string' ? term : 'long';
    const out = {
        href:        location.href,
        protocol:    location.protocol,
        runtimeMode: window.__RUNTIME_MODE || '',
        mainLoaded:  !!window.MAIN_JS_LOADED,
        appLoaded:   !!window.__appLoaded,
        at:          new Date().toISOString()
    };

    async function safeCall(name, fn, args) {
        args = Array.isArray(args) ? args : [];
        try {
            if (typeof fn !== 'function') {
                return { ok: false, missing: true };
            }
            const value = await fn.apply(window, args);
            return { ok: true, value: value };
        } catch (e) {
            return { ok: false, error: e && e.message ? e.message : String(e) };
        }
    }

    out.examFee            = await safeCall('debugExamFeeSetting',     window.debugExamFeeSetting);
    out.tuitionActions     = await safeCall('debugTuitionActions',      window.debugTuitionActions);
    out.admissionUniformSize = await safeCall('debugAdmissionUniformSize', window.debugAdmissionUniformSize);
    out.searchPerformance  = await safeCall('debugSearchPerformance',   window.debugSearchPerformance, [term]);
    out.dashboardHistory   = await safeCall('debugDashboardHistory',    window.debugDashboardHistory);
    out.studentPagination  = await safeCall('debugStudentPagination',   window.debugStudentPagination);
    out.profileModalClose  = await safeCall('debugProfileModalClose',   window.debugProfileModalClose);
    // Phase 4K-4E
    out.monthRuntime       = await safeCall('debugMonthRuntime',        window.debugMonthRuntime);
    out.admissionTxHydration = await safeCall('debugAdmissionTxHydration', window.debugAdmissionTxHydration, ['']);
    // Phase 4K-4F
    out.tuitionPackageCoverage = await safeCall(
        'debugTuitionPackageCoverage',
        window.debugTuitionPackageCoverage,
        ['', (document.getElementById('filterMonth') && document.getElementById('filterMonth').value) || '']
    );
    // Phase 4K-4G
    out.monthlyRevenueAllocation = await safeCall(
        'debugMonthlyRevenueAllocation',
        window.debugMonthlyRevenueAllocation,
        [(document.getElementById('filterMonth') && document.getElementById('filterMonth').value) || '']
    );
    out.activeStudentSort = await safeCall(
        'debugActiveStudentSort',
        window.debugActiveStudentSort,
        [10]
    );
    // Phase 4K-5A
    out.studentStatusSeparation = await safeCall('debugStudentStatusSeparation', window.debugStudentStatusSeparation);
    out.examRegistrationCount   = await safeCall('debugExamRegistrationCount',   window.debugExamRegistrationCount);
    // Phase 4K-5B
    out.examDuplicatePayments = await safeCall(
        'debugExamDuplicatePayments',
        window.debugExamDuplicatePayments,
        ['']
    );
    // Phase 4K-5C
    out.examCanonicalLedger = await safeCall('debugExamCanonicalLedger', window.debugExamCanonicalLedger);
    out.bundleTransactions   = await safeCall('debugBundleTransactions',  window.debugBundleTransactions, ['']);
    // Phase 4K-5G
    out.listPaginationCoverage = await safeCall('debugListPaginationCoverage', window.debugListPaginationCoverage);
    out.examExportReadiness    = await safeCall('debugExamExportReadiness',    window.debugExamExportReadiness);
    // Phase 4K-5K
    out.activeLoadMoreAndSort  = await safeCall('debugActiveLoadMoreAndSort',  window.debugActiveLoadMoreAndSort);
    out.debtLoadMoreAndFilter  = await safeCall('debugDebtLoadMoreAndFilter',  window.debugDebtLoadMoreAndFilter);
    out.debtCoverage           = await safeCall('debugDebtCoverage',           window.debugDebtCoverage);
    out.activeQuitLeak         = await safeCall('debugActiveQuitLeak',         window.debugActiveQuitLeak);
    out.tuitionTableLayout     = await safeCall('debugTuitionTableLayout',     window.debugTuitionTableLayout);

    // Phase 4K-5N: Dashboard Branch Revenue + Chart Lifecycle
    out.dashboardBranchRevenue = await safeCall('debugDashboardBranchRevenue', window.debugDashboardBranchRevenue);
    out.dashboardCharts        = await safeCall('debugDashboardCharts',        window.debugDashboardCharts);
    // Phase 4K-5O-A: Runtime Diagnostics
    out.appVersion             = await safeCall('debugAppVersion',             window.debugAppVersion);
    out.runtimeErrors          = await safeCall('debugRuntimeErrors',          window.debugRuntimeErrors);
    out.dataSourceAuthority    = await safeCall('debugDataSourceAuthority',    window.debugDataSourceAuthority);
    out.financeReconcile       = await safeCall('debugFinanceReconcile',       window.debugFinanceReconcile);
    out.renderHealth           = await safeCall('debugRenderHealth',           window.debugRenderHealth);
    // Phase 4K-5P: Exam Branch Registration Mismatch
    out.examBranchRegistrationMismatch = await safeCall(
        'debugExamBranchRegistrationMismatch',
        window.debugExamBranchRegistrationMismatch
    );
    // Phase 4K-5Q: Mobile SuperAdmin Guard
    out.mobileSuperAdminGuard = await safeCall(
        'debugMobileSuperAdminGuard',
        window.debugMobileSuperAdminGuard
    );
    // Phase 4K-5Q: Search Router V2
    out.searchRouterV2 = await safeCall(
        'debugSearchRouterV2',
        window.debugSearchRouterV2,
        ['nguyen']
    );

    const summary = {
        runtimeMode:     out.runtimeMode,
        mainLoaded:      out.mainLoaded,
        appLoaded:       out.appLoaded,

        examFeeOk:           !!out.examFee.ok,
        tuitionOk:           !!out.tuitionActions.ok,
        admissionUniformOk:  !!out.admissionUniformSize.ok,
        searchOk:            !!out.searchPerformance.ok,
        dashboardOk:         !!out.dashboardHistory.ok,
        paginationOk:        !!out.studentPagination.ok,
        modalOk:             !!out.profileModalClose.ok,
        // Phase 4K-4E
        monthRuntimeOk:      !!out.monthRuntime.ok,
        admissionTxHydrationOk: !!out.admissionTxHydration.ok,
        // Phase 4K-4F
        tuitionPackageCoverageOk: !!out.tuitionPackageCoverage.ok,
        // Phase 4K-4G
        monthlyRevenueAllocationOk: !!out.monthlyRevenueAllocation.ok,
        activeStudentSortOk:        !!out.activeStudentSort.ok,
        // Phase 4K-5A
        studentStatusSeparationOk:  !!out.studentStatusSeparation.ok,
        examRegistrationCountOk:    !!out.examRegistrationCount.ok,
        // Phase 4K-5B
        examDuplicatePaymentsOk:    !!out.examDuplicatePayments.ok,
        // Phase 4K-5C
        examCanonicalLedgerOk:      !!out.examCanonicalLedger.ok,
        bundleTransactionsOk:       !!out.bundleTransactions.ok,
        // Phase 4K-5G
        listPaginationCoverageOk:   !!out.listPaginationCoverage.ok,
        examExportReadinessOk:      !!out.examExportReadiness.ok,
        // Phase 4K-5K
        activeLoadMoreAndSortOk:    !!out.activeLoadMoreAndSort.ok,
        debtLoadMoreAndFilterOk:    !!out.debtLoadMoreAndFilter.ok,
        debtCoverageOk:             !!out.debtCoverage.ok,
        activeQuitLeakOk:           !!out.activeQuitLeak.ok,
        tuitionTableLayoutOk:       !!out.tuitionTableLayout.ok,
        // Phase 4K-5N
        dashboardBranchRevenueOk:   !!out.dashboardBranchRevenue.ok,
        dashboardChartsOk:          !!out.dashboardCharts.ok,
        // Phase 4K-5O-A
        appVersionOk:               !!out.appVersion.ok,
        runtimeErrorsOk:            !!out.runtimeErrors.ok,
        dataSourceAuthorityOk:      !!out.dataSourceAuthority.ok,
        financeReconcileOk:         !!out.financeReconcile.ok,
        renderHealthOk:             !!out.renderHealth.ok,
        // Phase 4K-5P
        examBranchRegistrationOk:   !!out.examBranchRegistrationMismatch.ok,
        // Phase 4K-5Q
        mobileSuperAdminGuardOk:    !!out.mobileSuperAdminGuard.ok,
        searchRouterV2Ok:           !!out.searchRouterV2.ok,

        overallOk:
            !!out.examFee.ok &&
            !!out.tuitionActions.ok &&
            !!out.admissionUniformSize.ok &&
            !!out.searchPerformance.ok &&
            !!out.dashboardHistory.ok &&
            !!out.studentPagination.ok &&
            !!out.profileModalClose.ok &&
            !!out.monthRuntime.ok &&
            !!out.admissionTxHydration.ok &&
            !!out.tuitionPackageCoverage.ok &&
            !!out.monthlyRevenueAllocation.ok &&
            !!out.activeStudentSort.ok &&
            !!out.studentStatusSeparation.ok &&
            !!out.examRegistrationCount.ok &&
            !!out.examDuplicatePayments.ok &&
            !!out.examCanonicalLedger.ok &&
            !!out.bundleTransactions.ok &&
            !!out.listPaginationCoverage.ok &&
            !!out.examExportReadiness.ok &&
            !!out.activeLoadMoreAndSort.ok &&
            !!out.debtLoadMoreAndFilter.ok &&
            !!out.debtCoverage.ok &&
            !!out.activeQuitLeak.ok &&
            !!out.tuitionTableLayout.ok &&
            !!out.dashboardBranchRevenue.ok &&
            !!out.dashboardCharts.ok &&
            !!out.appVersion.ok &&
            !!out.runtimeErrors.ok &&
            !!out.dataSourceAuthority.ok &&
            !!out.financeReconcile.ok &&
            !!out.renderHealth.ok
    };

    // Phase 4K-5L: Debt Action Bridge state
    out.debtActionState = await safeCall(
        'debugDebtActionState',
        window.debugDebtActionState,
        ['']
    );
    // Phase 4K-5L-C: Debt Service Bridge
    out.debtServiceBridge = await safeCall(
        'debugDebtServiceBridge',
        window.debugDebtServiceBridge
    );

    summary.debtServiceBridgeOk = !!out.debtServiceBridge.ok;

    console.table(summary);
    console.log('[debugRuntimeSmokeTest:detail]', out);
    return { summary: summary, detail: out };
};


// ════════════════════════════════════════════════════════════════
// Phase 4K-4F — txMatchesSelectedMonth SHARED HELPER
// ════════════════════════════════════════════════════════════════

/**
 * window.txMatchesSelectedMonth(tx, month) — kiểm tra transaction có thuộc tháng đang xem.
 * Hỗ trợ cả giao dịch cũ (chỉ có txMonth/date) và mới (paymentMonth/packageMonths).
 */
window.txMatchesSelectedMonth = function(tx, month) {
    const m = String(month || '').trim();
    if (!m || !tx) return true;

    if (tx.txMonth === m) return true;
    if (tx.paymentMonth === m) return true;

    if (Array.isArray(tx.packageMonths) && tx.packageMonths.includes(m)) return true;

    if (tx.date && String(tx.date).startsWith(m)) return true;

    return false;
};

// ════════════════════════════════════════════════════════════════
// Phase 4K-4E — MONTH CHANGE CONTROLLER + ADMISSION TX HYDRATION
// ════════════════════════════════════════════════════════════════

/**
 * handleFilterMonthChange(month, reason) — Controller thống nhất cho đổi tháng.
 * Gọi bất cứ khi nào #filterMonth thay đổi.
 */
window.handleFilterMonthChange = async function(month, reason) {
    reason = reason || 'filter-month-change';
    const selectedMonth = String(month || '').trim();
    if (!selectedMonth) return;

    if (!window.__store) window.__store = {};
    window.__store.selectedMonth = selectedMonth;
    window.__store._lastSelectedMonthReason = reason;
    window.__store._dataVersion = (window.__store._dataVersion || 0) + 1;

    // 1. Re-subscribe transaction listener (legacy/global)
    if (typeof window.listenToData === 'function') {
        try { window.listenToData(selectedMonth); }
        catch (e) { console.warn('[month-change] listenToData failed:', e); }
    }

    // 2. Clear search cache vì tháng thay đổi
    if (typeof window.invalidateSearchCache === 'function') {
        try { window.invalidateSearchCache('all', 'filter-month-change'); }
        catch (_) {}
    }
    // Phase 4K-5J-2: reset active render limit khi đổi tháng
    if (typeof window.resetActiveRenderLimit === 'function') {
        window.resetActiveRenderLimit('filter-month-change');
    } else if (typeof window.__activeRenderLimit !== 'undefined') {
        window.__activeRenderLimit = 50;
    }

    // 3. Reload transaction pagination nếu có
    if (typeof window.reloadTransactionsPage === 'function') {
        try { await window.reloadTransactionsPage(); }
        catch (e) { console.warn('[month-change] reloadTransactionsPage failed:', e); }
    }

    // 4. Refresh computation đúng domain
    if (typeof window.refreshListsComputation === 'function') {
        try {
            window.refreshListsComputation([
                'tx.txList', 'students.debtList',
                'students.activeList', 'dashboard.summary',
            ], 'filter-month-change');
        } catch (e) { console.warn('[month-change] refreshListsComputation failed:', e); }
    }

    // 5. Invalidate finance/students/dashboard
    if (typeof window.invalidateFinance   === 'function') window.invalidateFinance('filter-month-change');
    if (typeof window.invalidateStudents  === 'function') window.invalidateStudents('filter-month-change');
    if (typeof window.invalidateDashboard === 'function') {
        window.invalidateDashboard('filter-month-change');
    } else if (typeof window.invalidateCurrentTab === 'function') {
        window.invalidateCurrentTab('filter-month-change');
    }

    // 6. Đồng bộ mobile header nếu có
    if (typeof window.syncMobileHeader === 'function') {
        try { window.syncMobileHeader(); } catch (_) {}
    }

    return selectedMonth;
};

/**
 * onFilterMonthChange() — Alias tương thích backward với finance.events.js.
 */
window.onFilterMonthChange = function() {
    const el = document.getElementById('filterMonth');
    const month = el ? el.value : '';
    return window.handleFilterMonthChange(month, 'onFilterMonthChange');
};

/**
 * initFilterMonthController() — Bind #filterMonth event ONCE (idempotent).
 * Gọi sau DOMContentLoaded / app context ready / main.js bootstrap ready.
 */
window.initFilterMonthController = function() {
    const el = document.getElementById('filterMonth');
    if (!el || el.__filterMonthControllerBound) return;
    el.__filterMonthControllerBound = true;
    el.addEventListener('change', function(e) {
        if (typeof window.handleFilterMonthChange === 'function') {
            window.handleFilterMonthChange(e.target.value, 'filterMonth-change-event');
        }
    });
};

/**
 * debugMonthRuntime() — Kiểm tra trạng thái Month Change Controller.
 * Chạy từ Console sau khi deploy GitHub/domain.
 */
window.debugMonthRuntime = function() {
    const st  = window.__store || {};
    const el  = document.getElementById('filterMonth');
    const txs = Array.isArray(st.transactions) ? st.transactions : [];
    const month = el ? el.value : '';

    const result = {
        href:                    location.href,
        runtimeMode:             window.__RUNTIME_MODE || '',
        mainLoaded:              !!window.MAIN_JS_LOADED,
        appLoaded:               !!window.__appLoaded,
        filterMonthValue:        month,
        storeSelectedMonth:      st.selectedMonth || '',
        lastSelectedMonthReason: st._lastSelectedMonthReason || '',
        hasHandleFilterMonthChange:  typeof window.handleFilterMonthChange === 'function',
        hasOnFilterMonthChange:      typeof window.onFilterMonthChange === 'function',
        hasListenToData:             typeof window.listenToData === 'function',
        hasReloadTransactionsPage:   typeof window.reloadTransactionsPage === 'function',
        txCountInStore:   txs.length,
        txMatchingMonth:  txs.filter(t =>
            t.txMonth === month ||
            t.paymentMonth === month ||
            (Array.isArray(t.packageMonths) && t.packageMonths.includes(month)) ||
            (t.date && String(t.date).startsWith(month))
        ).length,
        filterMonthControllerBound: !!(el && el.__filterMonthControllerBound),
        paginationMonth:
            st.pagination?.transactions?.searchQuery ||
            st.pagination?.transactions?._lastMonth  || '',
    };

    console.table(result);
    return result;
};

/**
 * mergeTransactionIntoRuntimeStore(tx, reason) — Hydrate tx mới vào store ngay.
 * Dùng sau addTuitionTransaction, addDoc, markPaid inventory để HỌC PHÍ tab thấy ngay.
 */
window.mergeTransactionIntoRuntimeStore = function(tx, reason) {
    reason = reason || 'manual-merge';
    if (!tx || !tx.id) return false;

    if (!window.__store) window.__store = {};
    const st = window.__store;

    if (!Array.isArray(st.transactions)) st.transactions = [];

    // Upsert vào store (tránh duplicate)
    const map = new Map();
    st.transactions.forEach(t => {
        const id = String(t.id || t.txId || '').trim();
        if (id) map.set(id, t);
    });
    map.set(String(tx.id), tx);
    st.transactions = Array.from(map.values());

    // Upsert vào pagination currentItems nếu thuộc tháng đang xem
    if (st.pagination && st.pagination.transactions && Array.isArray(st.pagination.transactions.currentItems)) {
        const selectedMonth =
            (document.getElementById('filterMonth') && document.getElementById('filterMonth').value) ||
            st.selectedMonth || '';

        const matchSelectedMonth =
            !selectedMonth ||
            tx.txMonth === selectedMonth ||
            tx.paymentMonth === selectedMonth ||
            (Array.isArray(tx.packageMonths) && tx.packageMonths.includes(selectedMonth)) ||
            (tx.date && String(tx.date).startsWith(selectedMonth));

        if (matchSelectedMonth) {
            const pgMap = new Map();
            st.pagination.transactions.currentItems.forEach(t => {
                const id = String(t.id || t.txId || '').trim();
                if (id) pgMap.set(id, t);
            });
            pgMap.set(String(tx.id), tx);
            st.pagination.transactions.currentItems = Array.from(pgMap.values())
                .sort((a, b) => Number(b.timestamp || 0) - Number(a.timestamp || 0));
        }
    }

    st._dataVersion = (st._dataVersion || 0) + 1;
    st._lastTransactionMergeReason = reason;
    st._lastTransactionMergeAt     = Date.now();

    // Invalidate renders
    if (typeof window.refreshListsComputation === 'function') {
        window.refreshListsComputation(['tx.txList', 'dashboard.summary'], reason);
    }
    if (typeof window.invalidateList === 'function') {
        window.invalidateList('tx.txList', reason);
    } else if (typeof window.invalidateFinance === 'function') {
        window.invalidateFinance(reason);
    }
    if (typeof window.invalidateDashboard === 'function') window.invalidateDashboard(reason);

    return true;
};

/**
 * debugAdmissionTxHydration(studentName) — Kiểm tra xem tx mới thêm có trong store không.
 * Chạy từ Console sau khi thêm võ sinh mới.
 */
window.debugAdmissionTxHydration = function(studentName) {
    const st   = window.__store || {};
    const month = (document.getElementById('filterMonth') && document.getElementById('filterMonth').value) ||
                  st.selectedMonth || '';
    const q    = String(studentName || '').trim();
    const txs  = Array.isArray(st.transactions) ? st.transactions : [];

    const matches = txs.filter(t => {
        const nameMatch  = !q || String(t.description || '').includes(q);
        const monthMatch =
            !month ||
            t.txMonth === month ||
            t.paymentMonth === month ||
            (Array.isArray(t.packageMonths) && t.packageMonths.includes(month)) ||
            (t.date && String(t.date).startsWith(month));
        return nameMatch && monthMatch;
    });

    const result = {
        href:           location.href,
        runtimeMode:    window.__RUNTIME_MODE || '',
        selectedMonth:  month,
        queryName:      q,
        storeTxCount:   txs.length,
        matchingTxCount: matches.length,
        matchingTxs:    matches.slice(0, 10).map(t => ({
            id: t.id, type: t.type, description: t.description,
            amount: t.amount, date: t.date,
            txMonth: t.txMonth, paymentMonth: t.paymentMonth, packageMonths: t.packageMonths,
        })),
        txRows: document.querySelectorAll('#txList tr[data-tx-id]').length,
        lastTransactionMergeReason: st._lastTransactionMergeReason || '',
        lastTransactionMergeAt:     st._lastTransactionMergeAt     || '',
    };

    console.table({
        selectedMonth:      result.selectedMonth,
        storeTxCount:       result.storeTxCount,
        matchingTxCount:    result.matchingTxCount,
        txRows:             result.txRows,
        lastMerge:          result.lastTransactionMergeReason,
    });
    return result;
};

// After bootstrap: bind filterMonth controller once
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
        if (typeof window.initFilterMonthController === 'function') window.initFilterMonthController();
    });
} else {
    if (typeof window.initFilterMonthController === 'function') window.initFilterMonthController();
}

/**
 * debugTuitionPackageCoverage(studentName, month) — kiểm tra tháng giữa gói học phí có trong store.
 * Chạy từ Console sau deploy: debugTuitionPackageCoverage('Nguyễn Văn A', '2026-07')
 */
window.debugTuitionPackageCoverage = async function(studentName, month) {
    const st = window.__store || {};
    const selectedMonth =
        month ||
        (document.getElementById('filterMonth') && document.getElementById('filterMonth').value) ||
        st.selectedMonth ||
        '';

    const qName = String(studentName || '').trim();
    const txs   = Array.isArray(st.transactions) ? st.transactions : [];

    const matches = txs.filter(t => {
        const nameOk  = !qName || String(t.description || '').includes(qName);
        const monthOk = typeof window.txMatchesSelectedMonth === 'function'
            ? window.txMatchesSelectedMonth(t, selectedMonth)
            : true;
        return nameOk && monthOk;
    });

    const packageMatches = matches.filter(t =>
        Array.isArray(t.packageMonths) && t.packageMonths.includes(selectedMonth)
    );

    const result = {
        href:                location.href,
        runtimeMode:         window.__RUNTIME_MODE || '',
        selectedMonth,
        queryName:           qName,
        storeTxCount:        txs.length,
        matchesCount:        matches.length,
        packageMatchesCount: packageMatches.length,
        matches: matches.slice(0, 20).map(t => ({
            id:              t.id,
            type:            t.type,
            description:     t.description,
            amount:          t.amount,
            allocatedAmount: Array.isArray(t.packageMonths) && t.packageMonths.length
                ? Math.round((Number(t.amount) || 0) / t.packageMonths.length)
                : Number(t.amount || 0),
            date:            t.date,
            paymentMonth:    t.paymentMonth,
            txMonth:         t.txMonth,
            packageMonths:   t.packageMonths,
        })),
        txRows: document.querySelectorAll('#txList tr[data-tx-id]').length,
        hasTxMatchesSelectedMonth: typeof window.txMatchesSelectedMonth === 'function',
    };

    console.table({
        selectedMonth:      result.selectedMonth,
        matchesCount:       result.matchesCount,
        packageMatchesCount: result.packageMatchesCount,
        txRows:             result.txRows,
    });
    return result;
};

// ════════════════════════════════════════════════════════════════
// Phase 4K-4D — INVENTORY FINANCE HELPERS
// ════════════════════════════════════════════════════════════════

/**
 * getInventoryCategoryNames() — Trả về tất cả tên danh mục kho (mặc định + tùy chỉnh).
 * Dùng chung cho classifyInventoryFinanceTx, financeRenderer, app.js legacy.
 */
window.getInventoryCategoryNames = function() {
    const defaults = ['Võ phục', 'Áo thun', 'Bảo hộ'];
    const st = window.__store || {};
    const customFromStore  = Array.isArray(st.invCustomCategories)
        ? st.invCustomCategories.map(c => c.name)
        : [];
    const customFromWindow = Array.isArray(window.invCustomCategories)
        ? window.invCustomCategories.map(c => c.name)
        : [];

    const all = [...defaults, ...customFromStore, ...customFromWindow]
        .map(v => String(v || '').trim())
        .filter(Boolean);

    return Array.from(new Set(all));
};

/**
 * classifyInventoryFinanceTx(tx) — Phân loại giao dịch kho.
 * Trả về { isInventory, direction: 'income'|'expense'|'gift'|'', category, amount }.
 *
 * Ưu tiên:
 *   1. Khớp chính xác "Thu|Chi|Tặng <Category>" với tất cả danh mục
 *   2. Backward compat dữ liệu cũ (type === 'Võ phục')
 *   3. Fallback theo prefix + relatedInvId
 */
window.classifyInventoryFinanceTx = function(tx) {
    const type   = String(tx && tx.type || '').trim();
    const amount = Number(tx && tx.amount || 0);

    const cats = typeof window.getInventoryCategoryNames === 'function'
        ? window.getInventoryCategoryNames()
        : ['Võ phục', 'Áo thun', 'Bảo hộ'];

    const hasRelatedInventory =
        !!(tx && (tx.relatedInvId || tx.inventoryId || tx.invId ||
                  tx.inventoryCategory || tx.category));

    // 1. Khớp chính xác với danh mục đã biết
    for (const cat of cats) {
        if (type === 'Thu ' + cat) {
            return { isInventory: true, direction: 'income',  category: cat, amount };
        }
        if (type === 'Chi ' + cat) {
            return { isInventory: true, direction: 'expense', category: cat, amount };
        }
        if (type === 'Tặng ' + cat) {
            return { isInventory: true, direction: 'gift',    category: cat, amount: 0 };
        }
    }

    // 2. Backward compat: type === 'Võ phục' (dữ liệu cũ trước khi đổi sang 'Thu Võ phục')
    if (type === 'Võ phục') {
        return { isInventory: true, direction: 'income', category: 'Võ phục', amount };
    }

    // 3. Fallback: có relatedInvId + prefix Thu|Chi|Tặng (danh mục bị xóa hoặc type chưa chuẩn)
    if (hasRelatedInventory) {
        if (type.startsWith('Thu ')) {
            return { isInventory: true, direction: 'income',  category: tx.category || '', amount };
        }
        if (type.startsWith('Chi ')) {
            return { isInventory: true, direction: 'expense', category: tx.category || '', amount };
        }
        if (type.startsWith('Tặng ')) {
            return { isInventory: true, direction: 'gift',    category: tx.category || '', amount: 0 };
        }
    }

    return { isInventory: false, direction: '', category: '', amount: 0 };
};

// ════════════════════════════════════════════════════════════════
// Phase 4K-4D — DEBUG: debugInventoryFinanceRollup
// Gọi từ Console sau khi deploy: debugInventoryFinanceRollup()
// ════════════════════════════════════════════════════════════════
window.debugInventoryFinanceRollup = function() {
    const st  = window.__store || {};
    const txs = Array.isArray(st.transactions) ? st.transactions : (window.allTransactions || []);
    const inv = Array.isArray(st.inventory)    ? st.inventory    : (window.allInventory    || []);
    const cats = typeof window.getInventoryCategoryNames === 'function'
        ? window.getInventoryCategoryNames()
        : [];

    let income = 0, expense = 0, gift = 0;
    const byType = {};
    const inventoryTxs = [];

    txs.forEach(t => {
        const c = typeof window.classifyInventoryFinanceTx === 'function'
            ? window.classifyInventoryFinanceTx(t)
            : { isInventory: false };

        if (!c.isInventory) return;

        inventoryTxs.push({
            id: t.id, type: t.type, amount: Number(t.amount || 0),
            date: t.date, txMonth: t.txMonth, relatedInvId: t.relatedInvId,
            direction: c.direction, category: c.category,
        });

        byType[t.type] = (byType[t.type] || 0) + Number(t.amount || 0);

        if      (c.direction === 'income')  income  += Number(t.amount || 0);
        else if (c.direction === 'expense') expense += Number(t.amount || 0);
        else if (c.direction === 'gift')    gift    += 1;
    });

    const unpaid = inv.filter(x => x.unpaid === true || x.inventoryDebtStatus === 'pending');

    const result = {
        href:                  location.href,
        runtimeMode:           window.__RUNTIME_MODE || '',
        currentTab:            typeof window.getCurrentActiveTabId === 'function' ? window.getCurrentActiveTabId() : '',
        categories:            cats,
        customCategoriesStore: st.invCustomCategories || [],
        customCategoriesWindow:window.invCustomCategories || [],
        transactionsCount:     txs.length,
        inventoryCount:        inv.length,
        inventoryTxCount:      inventoryTxs.length,
        income, expense, profit: income - expense,
        byType,
        unpaidCount:  unpaid.length,
        unpaidSample: unpaid.slice(0, 5).map(x => ({
            id: x.id, category: x.category, size: x.size, amount: x.amount,
            unpaid: x.unpaid, status: x.inventoryDebtStatus, paidTxId: x.paidTxId,
        })),
        uiIncome:  document.getElementById('sum_uniform_in')?.textContent     || '',
        uiExpense: document.getElementById('sum_uniform_out')?.textContent    || '',
        uiProfit:  document.getElementById('sum_uniform_profit')?.textContent || '',
    };

    console.table({ income: result.income, expense: result.expense, profit: result.profit,
        inventoryTxCount: result.inventoryTxCount, unpaidCount: result.unpaidCount });
    console.log('[debugInventoryFinanceRollup:detail]', result);
    return result;
};

