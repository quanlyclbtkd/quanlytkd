/**
 * js/legacy/legacyUiFallbacks.js
 * Phase 4K-6S — Classic-script rollback layer for low-risk UI globals.
 *
 * Loaded before app.js and main.js. It preserves file:// / module-failure
 * compatibility while allowing duplicate UI implementations to be removed
 * from the legacy app.js kernel.
 *
 * Scope: DOM/localStorage/pure formatting only.
 * No Firebase imports, Firestore reads/writes, auth, listeners, or finance writes.
 */
(function installLegacyUiFallbacks(global) {
  'use strict';

  if (!global || global.__legacyUiFallbacksInstalled) return;

  function getElement(id) {
    return global.document && typeof global.document.getElementById === 'function'
      ? global.document.getElementById(id)
      : null;
  }

  function safeStorageGet(key) {
    try { return global.localStorage ? global.localStorage.getItem(key) : null; }
    catch (_) { return null; }
  }

  function safeStorageSet(key, value) {
    try {
      if (global.localStorage) global.localStorage.setItem(key, value);
      return true;
    } catch (_) {
      return false;
    }
  }


  function normalizeRole(value) {
    var role = String(value || '').trim().toLowerCase().replace(/-/g, '_');
    if (role === 'hlv' || role === 'trainer') return 'coach';
    if (role === 'superadmin') return 'super_admin';
    return role;
  }

  function currentRole() {
    try {
      if (global.RoleReadBoundary && typeof global.RoleReadBoundary.readContext === 'function') {
        var ctx = global.RoleReadBoundary.readContext() || {};
        var rbRole = normalizeRole(ctx.role || '');
        if (rbRole) return rbRole;
      }
    } catch (_) {}
    try {
      var store = global.__store || {};
      return normalizeRole(global.userRole || store.userRole || store.role || '');
    } catch (_) {}
    return '';
  }

  function canShowMonthlyReminder() {
    var role = currentRole();
    if (!role || role === 'coach') return false;
    return role === 'admin' || role === 'super_admin' || role === 'viewer' || role === 'club_admin';
  }

  function hideMonthlyReminder() {
    var reminder = getElement('monthlyReminder');
    if (reminder) reminder.style.display = 'none';
  }

  function asDate(value) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
    var parsed = value ? new Date(value) : new Date();
    return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  }

  function formatSingleMonth(value) {
    var raw = String(value || '').trim();
    var match = /^(\d{4})-(\d{1,2})$/.exec(raw);
    if (!match) return raw;
    return String(Number(match[2])) + '/' + match[1];
  }

  function showToast(msg, duration, isLoading) {
    var toast = getElement('toastMessage');
    if (!toast) return false;
    var timeout = Number(duration);
    if (!Number.isFinite(timeout) || timeout < 0) timeout = 3000;
    toast.innerText = String(msg == null ? '' : msg);
    if (toast.classList) {
      if (isLoading) toast.classList.add('loading');
      else toast.classList.remove('loading');
      toast.classList.add('show');
    }
    global.setTimeout(function() {
      if (toast.classList) toast.classList.remove('show');
    }, timeout);
    return true;
  }

  function openMobileMenu() {
    var sheet = getElement('mobileMenuSheet');
    if (!sheet) return false;
    var adminBtn = getElement('mmsAdminBtn');
    if (adminBtn) {
      adminBtn.style.display =
        (typeof global.isSuperAdminRole === 'function' && global.isSuperAdminRole())
          ? 'block'
          : 'none';
    }
    if (sheet.classList) sheet.classList.add('open');
    return true;
  }

  function closeMobileMenu() {
    var sheet = getElement('mobileMenuSheet');
    if (!sheet) return false;
    if (sheet.classList) sheet.classList.remove('open');
    return true;
  }

  function checkMonthlyReminder(now) {
    if (!canShowMonthlyReminder()) {
      hideMonthlyReminder();
      return false;
    }
    var today = asDate(now);
    var day = today.getDate();
    if (day < 1 || day > 3) { hideMonthlyReminder(); return false; }
    var monthKey = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0');
    if (safeStorageGet('mrDismissed_' + monthKey)) return false;

    var prevDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    var reminder = getElement('monthlyReminder');
    var label = getElement('mrPrevMonth');
    if (!reminder || !label) return false;

    label.textContent = 'Tháng ' + (prevDate.getMonth() + 1) + '/' + prevDate.getFullYear();
    reminder.style.display = 'flex';
    return true;
  }

  function dismissMonthlyReminder(now) {
    var today = asDate(now);
    var monthKey = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0');
    safeStorageSet('mrDismissed_' + monthKey, '1');
    var reminder = getElement('monthlyReminder');
    if (reminder) reminder.style.display = 'none';
    return true;
  }

  function openMonthlyExport(now) {
    if (!canShowMonthlyReminder()) {
      hideMonthlyReminder();
      return false;
    }
    var today = asDate(now);
    dismissMonthlyReminder(today);
    var prevDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    if (typeof global.openExcelExportModal !== 'function') return false;

    global.openExcelExportModal();
    global.setTimeout(function() {
      var yearEl = getElement('excel_year');
      if (yearEl) yearEl.value = String(prevDate.getFullYear());
      var typeEl = getElement('excel_periodType');
      if (typeEl) {
        typeEl.value = 'month';
        if (typeof global.updateExcelPeriodOptions === 'function') {
          global.updateExcelPeriodOptions();
        }
      }
      var valueEl = getElement('excel_periodValue');
      if (valueEl) valueEl.value = String(prevDate.getMonth() + 1);
    }, 120);
    return true;
  }

  function openTaxModal() {
    var modal = getElement('taxExportModal');
    if (!modal) return false;
    modal.style.display = 'flex';
    if (typeof global.updateTaxPeriodOptions === 'function') {
      global.updateTaxPeriodOptions();
    }
    return true;
  }

  function closeTaxModal() {
    var modal = getElement('taxExportModal');
    if (!modal) return false;
    modal.style.display = 'none';
    return true;
  }

  function openComboModal() {
    var modal = getElement('comboModal');
    if (!modal) return false;
    modal.style.display = 'flex';
    return true;
  }

  function closeModal(modalId) {
    var modal = getElement(modalId || 'profileModal');
    if (!modal) return false;
    modal.style.display = 'none';
    return true;
  }

  function formatMonthCompact(monthsStr) {
    var raw = String(monthsStr || '').trim();
    if (!raw || raw.indexOf(',') < 0) return formatSingleMonth(raw);

    var byYear = Object.create(null);
    raw.split(',').map(function(item) { return item.trim(); }).filter(Boolean).forEach(function(item) {
      var match = /^(\d{4})-(\d{1,2})$/.exec(item);
      if (!match) return;
      var year = match[1];
      var month = Number(match[2]);
      if (!byYear[year]) byYear[year] = [];
      if (month >= 1 && month <= 12 && byYear[year].indexOf(month) < 0) byYear[year].push(month);
    });

    var years = Object.keys(byYear).sort();
    if (!years.length) return raw;
    return years.map(function(year) {
      return byYear[year]
        .sort(function(a, b) { return a - b; })
        .map(function(month) { return 'T' + month; })
        .join(', ') + '/' + year;
    }).join('; ');
  }

  function updateSelectOptions(typeId, valueId, halfLabels) {
    var typeEl = getElement(typeId);
    var sel = getElement(valueId);
    if (!typeEl || !sel) return false;
    var type = typeEl.value;
    var html = '';
    var i;
    if (type === 'month') {
      for (i = 1; i <= 12; i++) html += '<option value="' + i + '">Tháng ' + i + '</option>';
    } else if (type === 'quarter') {
      for (i = 1; i <= 4; i++) html += '<option value="' + i + '">Quý ' + i + '</option>';
    } else if (type === 'half') {
      html = '<option value="1">' + halfLabels[0] + '</option><option value="2">' + halfLabels[1] + '</option>';
    } else {
      html = '<option value="1">Cả năm</option>';
    }
    sel.innerHTML = html;
    return true;
  }

  function updateExcelPeriodOptions() {
    return updateSelectOptions('excel_periodType', 'excel_periodValue', ['6 tháng đầu năm', '6 tháng cuối năm']);
  }

  function openExcelExportModal() {
    if (global.userRole === 'viewer') return showToast('⛔ Tài khoản khách không thể tải File!');
    var modal = getElement('excelExportModal');
    if (!modal) return false;
    modal.style.display = 'flex';
    updateExcelPeriodOptions();
    return true;
  }

  function updateTaxPeriodOptions() {
    return updateSelectOptions('taxPeriodType', 'taxPeriodValue', ['6 tháng đầu', '6 tháng cuối']);
  }

  function reportModuleUnavailable() {
    showToast('⚠️ Mô-đun xuất báo cáo chưa sẵn sàng. Vui lòng tải lại trang.', 5000);
    return false;
  }

  function copyAttReport(name, present, excused, absent, monthDisplay) {
    var text = 'Kính gửi Phụ huynh võ sinh ' + name + ', báo cáo tình hình tập luyện tháng ' + monthDisplay + ': Bé đã đi tập ' + present + ' buổi, nghỉ có phép ' + excused + ' buổi, nghỉ không phép ' + absent + ' buổi. Cảm ơn gia đình đã đồng hành cùng CLB!';
    function ok() { showToast('✅ Đã copy báo cáo của ' + name); }
    function fallback() {
      try {
        var ta = global.document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        global.document.body.appendChild(ta);
        ta.focus(); ta.select();
        global.document.execCommand('copy');
        global.document.body.removeChild(ta);
        ok();
      } catch (_) { showToast('⚠️ Không thể copy. Vui lòng copy thủ công.', 3000); }
    }
    if (global.navigator && global.navigator.clipboard && typeof global.navigator.clipboard.writeText === 'function') {
      return global.navigator.clipboard.writeText(text).then(ok).catch(fallback);
    }
    fallback();
    return true;
  }

  var fallbacks = {
    showToast: showToast,
    openMobileMenu: openMobileMenu,
    closeMobileMenu: closeMobileMenu,
    _checkMonthlyReminder: checkMonthlyReminder,
    _dismissMonthlyReminder: dismissMonthlyReminder,
    _openMonthlyExport: openMonthlyExport,
    openTaxModal: openTaxModal,
    closeTaxModal: closeTaxModal,
    openComboModal: openComboModal,
    closeModal: closeModal,
    formatMonthCompact: formatMonthCompact,
    openExcelExportModal: openExcelExportModal,
    updateExcelPeriodOptions: updateExcelPeriodOptions,
    exportToExcel: openExcelExportModal,
    executeExcelExport: reportModuleUnavailable,
    exportAchievementsExcel: reportModuleUnavailable,
    exportExamPaidList: reportModuleUnavailable,
    updateTaxPeriodOptions: updateTaxPeriodOptions,
    executeTaxExport: reportModuleUnavailable,
    exportAttendanceExcel: reportModuleUnavailable,
    copyAttReport: copyAttReport,
  };

  Object.keys(fallbacks).forEach(function(name) {
    if (typeof global[name] !== 'function') global[name] = fallbacks[name];
  });

  global.LegacyUiFallbacks = Object.freeze(fallbacks);
  global.__legacyUiFallbacksInstalled = {
    phase: '4K-6U-report-excel-lazy-isolation',
    installedAt: Date.now(),
    names: Object.keys(fallbacks),
    writeSafe: true,
  };

  global.debugLegacyUiFallbacks = function debugLegacyUiFallbacks() {
    var names = Object.keys(fallbacks);
    var missing = names.filter(function(name) { return typeof global[name] !== 'function'; });
    var result = {
      ok: missing.length === 0,
      phase: global.__legacyUiFallbacksInstalled.phase,
      count: names.length,
      names: names,
      missing: missing,
      writeSafe: true,
    };
    if (global.console && typeof global.console.log === 'function') {
      global.console.log('[debugLegacyUiFallbacks]', result);
    }
    return result;
  };
})(typeof window !== 'undefined' ? window : globalThis);
