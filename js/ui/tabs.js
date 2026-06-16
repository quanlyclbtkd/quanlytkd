/**
 * ui/tabs.js — Phase 2c
 * ────────────────────────────────────────────────────────────────
 * Tab switching logic — hoàn toàn dùng window.__store (bridge).
 * Không còn fallback về _legacySwitchTab cho tab dashboard.
 *
 * CƠ CHẾ HOẠT ĐỘNG:
 *   app.js sync:
 *     _tabHtmlCache              → window.__store.tabHtmlCache     (2 điểm render)
 *     financeChartInstance       → window.__store.financeChartInstance  (3 điểm)
 *     memberChartInstance        → window.__store.memberChartInstance   (3 điểm)
 *   tabs.js đọc tất cả từ window.__store → không truy cập closure app.js
 *
 * FALLBACK AN TOÀN (vẫn giữ):
 *   Nếu cache chưa sync (lần đầu, trước renderApp() hoàn thành),
 *   tất cả tab đều fall back về _legacySwitchTab — đảm bảo không
 *   có tab nào hiện trắng trong bất kỳ tình huống nào.
 *
 * DASHBOARD:
 *   Charts được TẠO BởI renderApp() trong app.js → sync vào __store.
 *   tabs.js chỉ UPDATE chart data, không tạo mới.
 *   Nếu chart chưa tồn tại → gọi scheduleRender() → renderApp() sẽ tạo.
 *
 * TƯƠNG THÍCH file:// PROTOCOL:
 *   File này là ES Module (import/export) → chỉ load được qua HTTP.
 *   Khi mở từ file://, main.js fail → tabs.js không load → app.js
 *   tự xử lý qua window._legacySwitchTab = window.switchTab (gốc).
 *
 * MIGRATION STATUS:
 * ┌───────────────────────┬───────────────────────────────────────┐
 * │ Tab                   │ Trạng thái Phase 2c                   │
 * ├───────────────────────┼───────────────────────────────────────┤
 * │ tx                    │ ✅ store-based (tabHtmlCache)          │
 * │ debt                  │ ✅ store-based (tabHtmlCache)          │
 * │ active                │ ✅ store-based (tabHtmlCache + paging) │
 * │ quit                  │ ✅ store-based (tabHtmlCache + paging) │
 * │ inventory             │ ✅ store-based (tabHtmlCache)          │
 * │ expense               │ ✅ store-based (tabHtmlCache)          │
 * │ exam                  │ ✅ store-based (tabHtmlCache + render) │
 * │ attendance            │ ✅ store-based (date init + render)    │
 * │ dashboard             │ ✅ store-based (charts từ __store)     │
 * └───────────────────────┴───────────────────────────────────────┘
 *
 * /// NEW ARCHITECTURE — Phase 2c complete
 * ────────────────────────────────────────────────────────────────
 */

import { TAB_LISTS }    from '../utils/constants.js';
import { getLocalToday } from '../utils/format.js';

// Phase 3.4: Render island lifecycle — tab-aware scheduling
import { runTabRenders, cleanupTabRenders, flushDirtyRenders } from './render/renderRegistry.js';

// Phase 3.6: Listener Ownership Isolation — tab-scoped mount/cleanup
import { cleanupListenersByTabId } from '../utils/listeners.js';
import { mountAttendanceListeners, cleanupAttendanceListeners } from '../listeners/attendance.listeners.js';
import { mountExamListeners, cleanupExamListeners } from '../listeners/exam.listeners.js';

// ────────────────────────────────────────────────────────────────
// PHASE 2C IMPLEMENTATION
// ────────────────────────────────────────────────────────────────

/**
 * Lấy bridge store được set bởi app.js.
 * @returns {object | null}
 */
function getBridgeStore() {
    return window.__store || null;
}

/**
 * Chuyển tab theo tabId — Phase 2c implementation (full store-based).
 *
 * Logic:
 *   1. Cache chưa sync → fall back toàn bộ về _legacySwitchTab (safety net)
 *   2. Dashboard → dùng _switchToDashboard() với chart instances từ store
 *   3. Các tab còn lại → store-based HTML restore + render calls
 *
 * @param {string} tabId
 */
export function switchTab(tabId) {
    // Recovery contract: ensureStudentTabRendered for ['active', 'debt', 'quit']; implementation runs after tab activation.
    const store = getBridgeStore();
    const cache = store ? store.tabHtmlCache : null;

    // ── Safety net: cache chưa có → renderApp() chưa chạy ───────────────
    // Fall back toàn bộ để đảm bảo không tab nào hiện trắng
    const cacheIsReady = cache && Object.keys(cache).length > 0;
    if (!cacheIsReady) {
        if (typeof window._legacySwitchTab === 'function') return window._legacySwitchTab(tabId);
        return _minimalTabSwitch(tabId);
    }

    // ── Phase 3.7B: Profile store guard — active/quit lazy load ────────────
    // Gọi TRƯỚC khi render tab.
    // - Các tab active/debt/tx/attendance/exam/dashboard: check ngay (sync, no-op nếu đã loaded).
    // - Tab 'quit': trigger loadQuitProfilesIfNeeded (fire-and-forget async).
    //   Sau khi getDocs xong → invalidateStudents('quit-profiles-loaded') → re-render tab Đã nghỉ.
    //   Tab switch KHÔNG bị block — hiển thị ngay, dữ liệu quit điền vào sau khi load.
    // Fallback an toàn: nếu hàm chưa có, render bình thường.
    if (typeof window.ensureProfilesForTab === 'function') {
        window.ensureProfilesForTab(tabId, 'switch-tab');
    }

    // Phase 4K-6V2: lịch sử Kho chỉ đọc khi người dùng thực sự mở tab Kho.
    // Không block tab switch; dữ liệu trang đầu sẽ invalidate/render sau khi tải xong.
    if (tabId === 'inventory' && typeof window.ensureInventoryHistoryLoaded === 'function') {
        Promise.resolve(window.ensureInventoryHistoryLoaded('module-switch-inventory-tab'))
            .catch((err) => console.warn('[Phase 4K-6V2] inventory tab load failed:', err));
    }

    // ── Dashboard: xử lý riêng với chart update từ store ────────────────
    if (tabId === 'dashboard') {
        return _switchToDashboard(store);
    }

    // ── 0. Phase 3.4: cancel pending renders for the departing tab ──────
    const _prevTabEl = document.querySelector('.tab-content.active');
    const _prevTabId = _prevTabEl ? _prevTabEl.id.replace('tab_', '') : null;
    if (_prevTabId && _prevTabId !== tabId) cleanupTabRenders(_prevTabId);

    // ── 0b. Phase 3.6: cleanup tab-scoped listeners khi rời tab ─────────
    // KHÔNG cleanup global listeners — chỉ cleanup tab-scoped (attendance, exam).
    // Fallback an toàn: cleanupListenersByTabId không throw nếu không có gì.
    if (_prevTabId && _prevTabId !== tabId) {
        _cleanupTabListeners(_prevTabId, 'tab-leave-' + _prevTabId);
        try {
            window.ListenerOwnershipBoundary?.onTabLeave?.(_prevTabId, 'tab-leave-' + _prevTabId);
        } catch (_) {}
    }

    // ── 1. Toggle active class ───────────────────────────────────────────
    _activateTab(tabId);
    try {
        window.ListenerOwnershipBoundary?.onTabEnter?.(tabId, 'tab-enter-' + tabId);
    } catch (_) {}

    // ── 2. Reset pagination về trang 1 khi đổi tab ──────────────────────
    if (tabId === 'active')    window._activePage = 1;
    else if (tabId === 'debt') window._debtPage   = 1;
    else if (tabId === 'quit') window._quitPage   = 1;

    // ── 2B. Phase 4K-6A-B: ensure student tab cache is built before render ──
    if (['active', 'debt', 'quit'].includes(tabId)) {
        if (typeof window.ensureStudentTabRendered === 'function') {
            window.ensureStudentTabRendered(tabId, 'tab-switch-' + tabId);
        }
    }

    // ── 3. Khôi phục HTML từ store cache qua render islands (Phase 3.4) ──
    // Replaces el.innerHTML = cache[listId] — islands use replaceChildren()
    // via DocumentFragment for atomic, low-reflow DOM updates.
    runTabRenders(tabId);

    // ── 4. Exam tab: render danh sách thi đai ───────────────────────────
    // [Phase 3.6] mountExamListeners() guard duplicate + trigger render
    if (tabId === 'exam') {
        try {
            mountExamListeners({ clubId: window.__store && window.__store.clubId });
        } catch (_) {
            // Fallback backward compat nếu listener mount lỗi
            if (typeof window.renderExamList === 'function')        window.renderExamList();
            if (typeof window.updateNextBeltPreview === 'function') window.updateNextBeltPreview();
        }
    }

    // ── 5. Attendance tab: set ngày mặc định + render ───────────────────
    // [Phase 3.6] mountAttendanceListeners() guard duplicate + trigger render
    if (tabId === 'attendance') {
        const attD = document.getElementById('att_date');
        if (attD && !attD.value) attD.value = getLocalToday();
        try {
            mountAttendanceListeners({ clubId: window.__store && window.__store.clubId });
        } catch (_) {
            // Fallback backward compat nếu listener mount lỗi
            if (typeof window.renderAttendanceList === 'function') window.renderAttendanceList();
        }
    }

    // ── 6. Flush dirty islands, scroll + re-render ──────────────────────
    // flushDirtyRenders ensures content marked dirty while tab was hidden is applied
    flushDirtyRenders(tabId);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    // [Phase 3.5C] Dùng invalidateCurrentTab thay vì scheduleRender() toàn app.
    // Tab đã được _activateTab() → getCurrentActiveTabId() trả về tabId đúng.
    // Fallback về scheduleRender() nếu Phase 3.5C chưa load (backward compat).
    if (typeof window.invalidateCurrentTab === 'function') {
        window.invalidateCurrentTab('tab-switch-safety');
    } else if (typeof window.scheduleRender === 'function') {
        window.scheduleRender();
    }
}

/**
 * Đăng ký window.switchTab = module version (Phase 2c).
 * Gọi từ main.js sau khi bootstrap() hoàn thành.
 */
export function registerTabGlobals() {
    window.switchTab = switchTab;
}

// ────────────────────────────────────────────────────────────────
// PRIVATE HELPERS
// ────────────────────────────────────────────────────────────────

/**
 * Toggle .active class cho tab-content và tab-btn.
 * @param {string} tabId
 */
function _activateTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
    const tabEl = document.getElementById('tab_' + tabId);
    const btnEl = document.getElementById('btn_' + tabId);
    if (tabEl) tabEl.classList.add('active');
    if (btnEl) btnEl.classList.add('active');
}

/**
 * Xử lý switch sang tab dashboard — Phase 2c.
 *
 * CHART STRATEGY:
 *   - Charts được TẠO bởi renderApp() trong app.js, sync vào window.__store.
 *   - tabs.js chỉ UPDATE data của chart instance đã tồn tại.
 *   - Nếu chart instance chưa tồn tại → scheduleRender() để renderApp() tạo.
 *
 * @param {object} store  window.__store bridge
 */
function _switchToDashboard(store) {
    const cache = store.tabHtmlCache;

    // Phase 3.4: cancel pending renders for the departing tab
    const _prevEl = document.querySelector('.tab-content.active');
    const _prevId = _prevEl ? _prevEl.id.replace('tab_', '') : null;
    if (_prevId && _prevId !== 'dashboard') cleanupTabRenders(_prevId);

    // Phase 3.6: cleanup tab-scoped listeners khi rời tab trước dashboard
    if (_prevId && _prevId !== 'dashboard') {
        _cleanupTabListeners(_prevId, 'tab-leave-to-dashboard');
    }

    // 1. Activate dashboard tab
    _activateTab('dashboard');

    // 2. Restore HTML lists via render islands (Phase 3.4)
    // Replaces el.innerHTML = cache[listId] for dashboard's reportList
    runTabRenders('dashboard');

    // 3. Update charts nếu đã có instance trong store
    const cd = cache._chartData;
    if (cd) {
        const fi = store.financeChartInstance;
        const mi = store.memberChartInstance;

        if (fi) {
            // Chart đã tồn tại — chỉ update data
            fi.data.labels             = cd.labels;
            fi.data.datasets[0].data   = cd.income;
            fi.data.datasets[1].data   = cd.expense;
            fi.update('none');
        }
        // Nếu fi === null: renderApp() sẽ tạo chart khi scheduleRender() chạy

        if (mi) {
            mi.data.labels           = cd.labels;
            mi.data.datasets[0].data = cd.active;
            mi.update('none');
        }
    }

    // 4. Flush dirty islands, scroll + re-render (Phase 3.4)
    flushDirtyRenders('dashboard');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    // [Phase 3.5C] Dùng invalidateDashboard thay vì scheduleRender() toàn app.
    // Chú thích tabs.js gốc: "Nếu chart chưa tồn tại → scheduleRender() → renderApp() tạo."
    // invalidateDashboard() đủ vì dashboard.charts island được schedule để re-render.
    // Fallback về scheduleRender() nếu Phase 3.5C chưa load (backward compat).
    if (typeof window.invalidateDashboard === 'function') {
        window.invalidateDashboard('dashboard-tab-switch');
    } else if (typeof window.scheduleRender === 'function') {
        window.scheduleRender();
    }

    // Phase 4K-6V1: fetch 6-month history only when user actually opens Dashboard.
    // Cache + single-flight prevent repeated Firestore reads during render storms.
    const selectedMonth = (store && store.selectedMonth) ||
        (document.getElementById('filterMonth') || {}).value || '';
    if (selectedMonth && typeof window.scheduleDashboardHistoryFetch === 'function') {
        window.scheduleDashboardHistoryFetch(selectedMonth, 'dashboard-tab-open').catch(() => {});
    }
}

/**
 * Phase 3.6: Cleanup tab-scoped listeners khi rời tab.
 *
 * CHIẾN LƯỢC:
 *   - Attendance: cleanup pseudo-entry + không có unsub thực sự (getDocs)
 *   - Exam: cleanup pseudo-entry + không có unsub thực sự
 *   - Các tab khác: cleanupListenersByTabId (generic — bắt listener tabId khớp)
 *   - KHÔNG cleanup global listeners (club, settings, profiles, inventory, finance)
 *   - Fallback an toàn: lỗi không crash tab switching
 *
 * @param {string} tabId — tab đang rời
 * @param {string} [reason]
 */
function _cleanupTabListeners(tabId, reason) {
    try {
        if (tabId === 'attendance') {
            cleanupAttendanceListeners(reason);
        } else if (tabId === 'exam') {
            cleanupExamListeners(reason);
        } else {
            // Generic cleanup cho bất kỳ tab-scoped listener nào đã đăng ký với tabId này
            cleanupListenersByTabId(tabId, reason);
        }
    } catch (_e) {
        // Cleanup không được crash tab switching — im lặng
    }
}

/**
 * Fallback tối thiểu — chỉ dùng khi cả _legacySwitchTab lẫn store đều không có.
 * (Tình huống rất hiếm: main.js load trước app.js)
 */
function _minimalTabSwitch(tabId) {
    console.warn('[tabs.js] Sử dụng minimal fallback cho tab:', tabId);
    _activateTab(tabId);
    window.scrollTo({ top: 0, behavior: 'smooth' });
}
