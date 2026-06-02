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
 * Why wrapper-style (not cache-based)?
 *   Attendance HTML is NOT pre-built in renderApp — the attendance module
 *   owns its own rendering logic including live Firestore reads per date.
 *   The islands here bring attendance into the scheduler lifecycle
 *   (RAF batching, hidden-tab skip, dirty flush) WITHOUT touching
 *   the attendance module's internal rendering logic.
 *
 * Backward compatibility:
 *   window.renderAttendanceList and window.renderAttMonthly remain unchanged.
 *   These islands are additive wrappers only.
 */

import { registerRender } from './renderRegistry.js';

// ─── Island render functions ─────────────────────────────────────────────────

/**
 * Trigger the attendance daily list render.
 * Delegates to attendance.js implementation via window global.
 */
export function renderAttendanceListIsland() {
    if (typeof window.renderAttendanceList === 'function') {
        window.renderAttendanceList();
    }
}

/**
 * Trigger the attendance monthly summary render.
 * Delegates to attendance.js implementation via window global.
 */
export function renderAttMonthlyIsland() {
    if (typeof window.renderAttMonthly === 'function') {
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
