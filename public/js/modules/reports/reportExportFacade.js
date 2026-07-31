/**
 * Phase 4K-6U — Report/Excel Canonical Ownership + Lazy Isolation
 *
 * Small eager facade for report globals used by inline HTML handlers.
 * Heavy report implementations are loaded only when the user exports a file.
 * No Firestore writes and no realtime listeners are allowed in this file.
 */

import { GlobalOwnershipRegistry } from '../../core/globalOwnershipRegistry.js';

const OWNER = 'js/modules/reports/reportExportFacade.js';
const OWNED_GLOBALS = Object.freeze([
  'openExcelExportModal',
  'updateExcelPeriodOptions',
  'exportToExcel',
  'executeExcelExport',
  'exportAchievementsExcel',
  'exportExamPaidList',
  'updateTaxPeriodOptions',
  'executeTaxExport',
  'exportAttendanceExcel',
  'copyAttReport',
]);

let reportsModulePromise = null;
let attendanceModulePromise = null;
let reportsApi = null;
const actionPromises = new Map();

function getEl(id) {
  return typeof document !== 'undefined' ? document.getElementById(id) : null;
}

function guardViewer() {
  if (window.userRole !== 'viewer') return false;
  if (typeof window.showToast === 'function') window.showToast('⛔ Tài khoản khách không thể tải File!');
  return true;
}

function runActionOnce(key, executor) {
  if (actionPromises.has(key)) return actionPromises.get(key);
  const promise = Promise.resolve()
    .then(executor)
    .finally(() => actionPromises.delete(key));
  actionPromises.set(key, promise);
  return promise;
}

function showModuleError(label, error) {
  console.error(`[4K-6U] ${label} lazy module failed:`, error);
  const message = `❌ Không thể tải mô-đun ${label}. Vui lòng kiểm tra mạng và thử lại.`;
  if (typeof window.showToast === 'function') window.showToast(message, 5000);
  else if (typeof window.alert === 'function') window.alert(message);
}

function restoreFacadeOwnership() {
  for (const name of OWNED_GLOBALS) {
    const result = GlobalOwnershipRegistry.restoreCanonical(name);
    if (!result.ok && result.reason !== 'not-registered') {
      console.warn('[4K-6U] restore report facade failed:', result);
    }
  }
}

async function ensureReportsApi() {
  if (reportsApi) return reportsApi;
  if (!reportsModulePromise) {
    reportsModulePromise = import('../reports.js')
      .then((mod) => {
        if (typeof mod.initReports !== 'function') {
          throw new Error('reports.js không export initReports()');
        }
        mod.initReports();
        const api = window.ReportsModule;
        if (!api) throw new Error('ReportsModule chưa được khởi tạo');
        reportsApi = api;
        // reports.js intentionally installs its implementation globals while it
        // initializes. The facade remains the canonical public owner afterwards.
        restoreFacadeOwnership();
        return api;
      })
      .catch((error) => {
        reportsModulePromise = null;
        reportsApi = null;
        restoreFacadeOwnership();
        throw error;
      });
  }
  return reportsModulePromise;
}

async function ensureAttendanceApi() {
  if (!attendanceModulePromise) {
    attendanceModulePromise = import('./attendanceExcelReport.js?v=attendance-excel-documentid-sdk-fix-20260801-v5u2e')
      .catch((error) => {
        attendanceModulePromise = null;
        throw error;
      });
  }
  return attendanceModulePromise;
}

export function updateExcelPeriodOptions() {
  const typeEl = getEl('excel_periodType');
  const sel = getEl('excel_periodValue');
  if (!typeEl || !sel) return false;
  const type = typeEl.value;
  sel.innerHTML = '';
  if (type === 'month') {
    for (let i = 1; i <= 12; i++) sel.insertAdjacentHTML('beforeend', `<option value="${i}">Tháng ${i}</option>`);
  } else if (type === 'quarter') {
    for (let i = 1; i <= 4; i++) sel.insertAdjacentHTML('beforeend', `<option value="${i}">Quý ${i}</option>`);
  } else if (type === 'half') {
    sel.innerHTML = '<option value="1">6 tháng đầu năm</option><option value="2">6 tháng cuối năm</option>';
  } else {
    sel.innerHTML = '<option value="1">Cả năm</option>';
  }
  return true;
}

export function openExcelExportModal() {
  if (window.userRole === 'viewer') {
    if (typeof window.showToast === 'function') window.showToast('⛔ Tài khoản khách không thể tải File!');
    return false;
  }
  const modal = getEl('excelExportModal');
  if (!modal) return false;
  modal.style.display = 'flex';
  updateExcelPeriodOptions();
  return true;
}

export function updateTaxPeriodOptions() {
  const typeEl = getEl('taxPeriodType');
  const sel = getEl('taxPeriodValue');
  if (!typeEl || !sel) return false;
  const type = typeEl.value;
  sel.innerHTML = '';
  if (type === 'month') {
    for (let i = 1; i <= 12; i++) sel.insertAdjacentHTML('beforeend', `<option value="${i}">Tháng ${i}</option>`);
  } else if (type === 'quarter') {
    for (let i = 1; i <= 4; i++) sel.insertAdjacentHTML('beforeend', `<option value="${i}">Quý ${i}</option>`);
  } else if (type === 'half') {
    sel.innerHTML = '<option value="1">6 tháng đầu</option><option value="2">6 tháng cuối</option>';
  } else {
    sel.innerHTML = '<option value="1">Cả năm</option>';
  }
  return true;
}

async function callReports(method, args, label) {
  if (guardViewer()) return undefined;
  return runActionOnce(method, async () => {
    try {
      const api = await ensureReportsApi();
      const fn = api && api[method];
      if (typeof fn !== 'function') throw new Error(`ReportsModule.${method} không tồn tại`);
      return await fn(...args);
    } catch (error) {
      showModuleError(label, error);
      return undefined;
    }
  });
}

export function executeExcelExport(...args) {
  return callReports('executeExcelExport', args, 'xuất Excel');
}

export function exportAchievementsExcel(...args) {
  return callReports('exportAchievementsExcel', args, 'xuất thành tích');
}

export function exportExamPaidList(...args) {
  return callReports('exportExamPaidList', args, 'xuất danh sách thi đai');
}

export function executeTaxExport(...args) {
  return callReports('executeTaxExport', args, 'xuất báo cáo thuế');
}

export async function exportAttendanceExcel(...args) {
  if (guardViewer()) return undefined;
  return runActionOnce('exportAttendanceExcel', async () => {
    try {
      const mod = await ensureAttendanceApi();
      if (typeof mod.exportAttendanceExcel !== 'function') {
        throw new Error('attendanceExcelReport.js không export exportAttendanceExcel()');
      }
      return await mod.exportAttendanceExcel(...args);
    } catch (error) {
      showModuleError('xuất điểm danh', error);
      return undefined;
    }
  });
}

export function copyAttReport(name, present, excused, absent, monthDisplay) {
  const text = `Kính gửi Phụ huynh võ sinh ${name}, báo cáo tình hình tập luyện tháng ${monthDisplay}: Bé đã đi tập ${present} buổi, nghỉ có phép ${excused} buổi, nghỉ không phép ${absent} buổi. Cảm ơn gia đình đã đồng hành cùng CLB!`;
  const success = () => {
    if (typeof window.showToast === 'function') window.showToast('✅ Đã copy báo cáo của ' + name);
  };
  const fallback = () => {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      success();
    } catch (_) {
      if (typeof window.showToast === 'function') window.showToast('⚠️ Không thể copy. Vui lòng copy thủ công.', 3000);
    }
  };

  if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    return navigator.clipboard.writeText(text).then(success).catch(fallback);
  }
  fallback();
  return Promise.resolve();
}

export function registerReportExportFacade() {
  if (typeof window === 'undefined') return { ok: false, reason: 'no-window' };

  const implementations = {
    openExcelExportModal,
    updateExcelPeriodOptions,
    exportToExcel: openExcelExportModal,
    executeExcelExport,
    exportAchievementsExcel,
    exportExamPaidList,
    updateTaxPeriodOptions,
    executeTaxExport,
    exportAttendanceExcel,
    copyAttReport,
  };

  const results = [];
  for (const [name, implementation] of Object.entries(implementations)) {
    results.push(GlobalOwnershipRegistry.register(name, implementation, {
      owner: OWNER,
      risk: name === 'copyAttReport' ? 'ui-only' : 'report-readonly-lazy',
      policy: 'module-primary',
    }));
  }

  window.ReportExportFacade = Object.freeze({
    ...implementations,
    ensureReportsApi,
    ensureAttendanceApi,
    getMetrics() {
      return {
        phase: '4K-6U-report-excel-lazy-isolation',
        reportsModuleRequested: !!reportsModulePromise,
        reportsModuleReady: !!reportsApi,
        attendanceModuleRequested: !!attendanceModulePromise,
        activeActions: Array.from(actionPromises.keys()),
        ownedGlobals: OWNED_GLOBALS.slice(),
      };
    },
  });

  const failed = results.filter((item) => !item.ok);
  if (failed.length) console.warn('[4K-6U] report facade ownership registration failures:', failed);
  return { ok: failed.length === 0, results, failed };
}

export default registerReportExportFacade;
