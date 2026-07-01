/**
 * Phase 4K-6V — Attendance legacy compatibility bridge.
 *
 * Loaded before app.js so inline handlers always resolve to a function while
 * the ES-module bootstrap is starting. The full attendance implementation is
 * owned by js/modules/attendance.js and replaces these bridges through the
 * GlobalOwnershipRegistry after login/context hydration.
 *
 * This file intentionally contains no Firestore reads/writes and no business
 * implementation. It is a small failure-safe only.
 */
(function initLegacyAttendanceFallbacks(global) {
  'use strict';

  if (!global) return;

  const NAMES = [
    '_getClubShifts',
    '_ensureClubShiftsLoaded',
    '_renderHomeBirthdayBanner',
    'showAttMemberHistory',
    'renderAttendanceList',
    'onShiftChange',
    'openShiftModal',
    'closeShiftModal',
    'addShift',
    'deleteShift',
    'toggleAttendance',
    'toggleAttendanceFromCard',
    'toggleAttendanceStatus',
    'bulkCheckIn',
    'syncOfflineAttendance',
    'switchAttSubTab',
    'renderAttMonthly',
    'printAttendanceStatus',
    'printAttendanceSessionCompletion',
    'printAttendanceBranchReport'
  ];

  function notifyUnavailable(name) {
    const now = Date.now();
    if (!global.__attendanceFallbackNoticeAt || now - global.__attendanceFallbackNoticeAt > 2500) {
      global.__attendanceFallbackNoticeAt = now;
      const message = 'Mô-đun Điểm danh đang khởi tạo. Vui lòng thử lại sau giây lát.';
      if (typeof global.showToast === 'function') global.showToast('⏳ ' + message, 2500);
      else if (global.console && typeof global.console.warn === 'function') {
        global.console.warn('[AttendanceFallback] ' + message + ' Action: ' + name);
      }
    }
  }

  NAMES.forEach(function registerFallback(name) {
    if (typeof global[name] === 'function') return;
    global[name] = function attendanceLegacyBridge() {
      const api = global.AttendanceModule;
      const implementation = api && api[name];
      if (typeof implementation === 'function' && implementation !== global[name]) {
        return implementation.apply(global, arguments);
      }
      notifyUnavailable(name);
      return Promise.resolve(false);
    };
  });

  if (!global.currentAttendanceData || typeof global.currentAttendanceData !== 'object') {
    global.currentAttendanceData = {};
  }

  global.__legacyAttendanceFallbacks = Object.freeze({
    phase: '4K-6V-attendance-canonical-ownership',
    names: NAMES.slice()
  });
})(typeof window !== 'undefined' ? window : null);
