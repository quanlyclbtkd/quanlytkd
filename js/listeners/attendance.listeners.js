/**
 * listeners/attendance.listeners.js — Phase 3.6B Listener Registration Safety
 * ────────────────────────────────────────────────────────────────
 * Quản lý lifecycle listener tab Điểm Danh.
 *
 * TRẠNG THÁI PHASE 3.6B:
 *   attendance.js dùng AttendanceService.loadByDate() — getDocs, KHÔNG phải onSnapshot.
 *   Không có Firestore realtime listener thực trong tab attendance.
 *   Dữ liệu võ sinh (allProfiles) đến từ global profiles listener (app.js).
 *
 *   [3.6B] Pseudo-listener đã MIGRATE sang safeRegisterSnapshot():
 *     → safeRegisterSnapshot() kiểm tra key TRƯỚC khi đăng ký pseudo-entry
 *     → tránh duplicate entry khi switch tab nhiều lần
 *     → markListenerSnapshot(key) ghi nhận mỗi lần trigger render từ tab
 *
 *   Tab mount:
 *     → safeRegisterSnapshot() guard — không mount trùng khi click tab nhiều lần
 *     → nếu đã mount: chỉ trigger re-render (không tạo entry mới)
 *     → trigger invalidateAttendance() → active-subtab presentation island
 *
 *   Tab cleanup (khi rời tab):
 *     → xóa pseudo-entry khỏi registry
 *     → KHÔNG có Firestore unsub thực sự
 *
 *   Snapshot invalidation:
 *     → attendance không nhận onSnapshot trực tiếp
 *     → khi allProfiles thay đổi (profiles global listener), app.js gọi
 *       window.invalidateStudents() + window.invalidateAttendance()
 *     → daily cards re-render from canonical RAM snapshot when Day is active
 *
 * TODO Phase 3.6C:
 *   Nếu attendance cần realtime onSnapshot (multi-device sync thực sự):
 *   → mount onSnapshot(attendanceRef, snapshot => { ... }) ở đây
 *   → gọi invalidateList('attendance.list', 'attendance-daily-snapshot')
 *   → cleanup khi rời tab để giải phóng connection
 * ────────────────────────────────────────────────────────────────
 */

import {
    safeRegisterSnapshot,
    hasListener,
    removeListener,
    markListenerSnapshot,
} from '../utils/listeners.js';

// ─────────────────────────────────────────────────────────────────
// KEY BUILDER
// ─────────────────────────────────────────────────────────────────

/**
 * Key cho attendance pseudo-listener.
 * Scope: tab — lifecycle = tab session.
 * @param {string} clubId
 * @returns {string}
 */
function _attKey(clubId) {
    return `attendance:tab:${clubId}`;
}

// ─────────────────────────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────────────────────────

/**
 * Mount attendance tab listeners.
 *
 * [3.6B] Dùng safeRegisterSnapshot() thay vì registerListener() trực tiếp.
 * An toàn gọi nhiều lần — hasListener() guard chống duplicate.
 * Nếu đã mount rồi, chỉ trigger re-render.
 *
 * @param {{ clubId?: string }} [context]
 */
export function mountAttendanceListeners(context = {}) {
    const clubId = (context && context.clubId)
        || (window.__store && window.__store.clubId)
        || 'unknown';
    const key = _attKey(clubId);

    if (hasListener(key)) {
        // Tab đã mount — chỉ trigger re-render (user switch tab lại)
        markListenerSnapshot(key);
        _triggerAttendanceRender('attendance-tab-remount');
        return;
    }

    // [3.6B] safeRegisterSnapshot: kiểm tra key TRƯỚC khi tạo pseudo-entry
    // attendance dùng getDocs → pseudo-listener (noop unsub)
    safeRegisterSnapshot(
        key,
        () => () => {}, // createUnsubscribe: trả về noop (không có onSnapshot thực)
        {
            owner:  'attendance',
            scope:  'tab',
            tabId:  'attendance',
            reason: 'mount-attendance-tab',
        }
    );

    // Trigger render ngay sau khi mount
    markListenerSnapshot(key);
    _triggerAttendanceRender('attendance-tab-mount');
}

/**
 * Cleanup attendance tab listeners — gọi khi rời tab.
 * @param {string} [reason]
 */
export function cleanupAttendanceListeners(reason = 'tab-leave') {
    const clubId = (window.__store && window.__store.clubId) || 'unknown';
    removeListener(_attKey(clubId), reason);
}

// ─────────────────────────────────────────────────────────────────
// PRIVATE HELPERS
// ─────────────────────────────────────────────────────────────────

/**
 * Trigger render attendance sau khi mount/remount.
 * Dùng invalidateAttendance nếu có (Phase 3.5B+), fallback vẫn chỉ
 * request canonical RAM presentation; không tạo daily network owner thứ hai.
 * @param {string} reason
 */
function _triggerAttendanceRender(reason) {
    try {
        if (typeof window.invalidateAttendance === 'function') {
            window.invalidateAttendance(reason);
        } else if (typeof window.AttendanceModule?.renderDailyFromRam === 'function') {
            window.AttendanceModule.renderDailyFromRam(reason);
        } else if (typeof window.renderAttendanceList === 'function') {
            window.renderAttendanceList(reason, { presentationOnly: true, allowInitialLoad: true });
        }
    } catch (e) {
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            console.warn('[attendance.listeners] render fallback error:', e);
        }
    }
}
