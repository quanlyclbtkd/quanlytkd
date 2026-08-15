/**
 * renderAttendance.js — Phase 3.4 Render Isolation Architecture
 *
 * Attendance render islands. These are wrapper islands that delegate to
 * the existing window.renderAttendanceList and window.renderAttMonthly
 * functions defined in modules/attendance.js.
 *
 * Islands registered:
 *   attendance.list    → calls window.renderAttendanceList()
 *   attendance.monthly → calls window.renderAttMonthly()
 *
 * The Day island is presentation-first: it asks the canonical AttendanceModule
 * to reuse its accepted RAM snapshot. Only that module may decide that an
 * initial daily load is required. The Month island is independently guarded by
 * the visible nested subtab.
 *
 * Backward compatibility:
 *   window.renderAttendanceList remains a compatibility entry that delegates
 *   to the same canonical owner.
 */

import { registerRender } from './renderRegistry.js';

// ─── Island render functions ─────────────────────────────────────────────────

/**
 * Trigger the attendance daily list render.
 * Delegates to attendance.js implementation via window global.
 */
export function renderAttendanceListIsland() {
    const dayActive = window.AttendanceModule?.isDaySubtabActive?.() === true;
    if (!dayActive) return;
    if (typeof window.AttendanceModule?.renderDailyFromRam === 'function') {
        window.AttendanceModule.renderDailyFromRam('attendance-list-island');
    } else if (typeof window.renderAttendanceList === 'function') {
        window.renderAttendanceList('attendance-list-island');
    }
}

/**
 * Trigger the attendance monthly summary render.
 * Delegates to attendance.js implementation via window global.
 */
export function renderAttMonthlyIsland() {
    const monthActive = window.AttendanceModule?.isMonthSubtabActive?.() === true;
    if (monthActive && typeof window.renderAttMonthly === 'function') {
        window.renderAttMonthly();
    }
}

// ─── Island initialiser ──────────────────────────────────────────────────────

/**
 * Register attendance render islands with the registry.
 * Call once during application bootstrap (main.js).
 *
 * Both islands share tabId 'attendance' so the hidden-tab skip
 * and dirty-flush lifecycle applies consistently.
 */
export function initAttendanceIslands() {
    registerRender('attendance.list', renderAttendanceListIsland, {
        selector: '#attendanceGrid',
        tabId:    'attendance',
    });
    registerRender('attendance.monthly', renderAttMonthlyIsland, {
        selector: '#attendanceMonthly',
        tabId:    'attendance',
    });
}
