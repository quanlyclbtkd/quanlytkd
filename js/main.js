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
import { initFinanceEvents }                          from './events/finance.events.js';

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

// ────────────────────────────────────────────────────────────────
// BOOTSTRAP
// ────────────────────────────────────────────────────────────────

(async function bootstrap() {
    try {
        if (!window.__appLoaded) {
            initFirebase();
            await _loadLegacyApp();
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
        };

        initDashboard();
        initRender();

        initFinanceIslands();           registerFinanceLegacyGlobals();
        initStudentIslands();           registerStudentsLegacyGlobals();
        initInventoryIslands();         registerInventoryLegacyGlobals();
        initAttendanceIslands();
        initDashboardIslands();

        registerInvalidationLegacyGlobals();

        initStudents();
        initFinance();
        initInventory();
        initAttendance();
        // [Phase 4.0A] Reports / Export module — overrides app.js window functions
        initReports();

        // [Phase 4.0B-1] SuperAdmin — eager init ngay sau khi app context sẵn sàng.
        // initSuperAdmin() idempotent: tự bỏ qua nếu đã init rồi.
        // KHÔNG phụ thuộc switchTab('superadmin') nữa.
        initSuperAdmin();

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

        setTimeout(() => {
            if (window.__store && window.__store.profRef) {
                initStudentPagination();
            } else {
                setTimeout(() => initStudentPagination(), 1500);
            }
        }, 500);

        setTimeout(() => {
            if (window.__store && window.__store.colRef) {
                initTransactionPagination();
            } else {
                setTimeout(() => initTransactionPagination(), 1500);
            }
        }, 500);

        _patchResetStore();

        if (_isDev) _runHealthCheck();

        // ── Phase 4.0B-4B: Module post-login guard ───────────────────────────
        // Kiểm tra nhẹ sau khi các module đã init — chỉ warn, không throw.
        window.ensureModuleRuntimeReady('finance',    ['quickPay', 'openQuickPayModal']);
        window.ensureModuleRuntimeReady('inventory',  ['getInvCategories', 'loadInvCategories']);
        window.ensureModuleRuntimeReady('students',   ['openAddModal', 'editProfile']);

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
