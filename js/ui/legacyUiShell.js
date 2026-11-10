/**
 * js/ui/legacyUiShell.js
 * Phase 4K-6S — Low-Risk UI Ownership (retained from 6R)
 *
 * Owns only DOM/localStorage orchestration previously embedded in app.js.
 * No Firebase imports, no Firestore reads/writes, no financial calculations.
 */

import { GlobalOwnershipRegistry } from '../core/globalOwnershipRegistry.js';

function _getElement(id) {
  return typeof document !== 'undefined' ? document.getElementById(id) : null;
}

function _safeStorageGet(key) {
  try { return typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null; }
  catch (_) { return null; }
}

function _safeStorageSet(key, value) {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(key, value);
    return true;
  } catch (_) {
    return false;
  }
}

function _asDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  const parsed = value ? new Date(value) : new Date();
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

let mobileMenuOpener = null;

function releaseMobileMenuFocus(sheet, opener, doc) {
  function inside() { return !!doc.activeElement && sheet.contains(doc.activeElement); }
  if (!inside()) return true;
  const selector = '[aria-controls="mobileMenuSheet"]';
  const triggers = [opener, ...Array.from(doc.querySelectorAll(selector))];
  for (const trigger of triggers) {
    if (!trigger || !trigger.isConnected || trigger.disabled || trigger.hidden
        || typeof trigger.matches !== 'function' || !trigger.matches(selector)
        || sheet.contains(trigger) || trigger.getAttribute('aria-disabled') === 'true'
        || (typeof trigger.closest === 'function' && trigger.closest('[inert], [aria-hidden="true"]'))
        || (typeof trigger.getClientRects === 'function' && !trigger.getClientRects().length)
        || typeof trigger.focus !== 'function') continue;
    try { trigger.focus({ preventScroll: true }); } catch (_) {}
    if (!inside()) return true;
  }
  try { doc.activeElement.blur(); } catch (_) {}
  return !inside();
}

export function openMobileMenu() {
  const sheet = _getElement('mobileMenuSheet');
  if (!sheet) return false;
  const active = document.activeElement;
  if (active?.isConnected && !active.disabled && active.matches?.('[aria-controls="mobileMenuSheet"]') && !sheet.contains(active)) {
    mobileMenuOpener = active;
  } else if (!mobileMenuOpener?.isConnected) mobileMenuOpener = null;

  const adminBtn = _getElement('mmsAdminBtn');
  if (adminBtn) {
    adminBtn.style.display =
      (typeof window.isSuperAdminRole === 'function' && window.isSuperAdminRole())
        ? 'block'
        : 'none';
  }

  const coachAction = _getElement('mmsCoachAccountsAction');
  if (coachAction) {
    const v = window.__verifiedAuthContextState;
    coachAction.style.display = v?.ready === true && ['admin','owner','super_admin'].includes(v.role)
      && window.userRole === v.role && window.__store?.currentUser?.uid === v.uid ? 'flex' : 'none';
  }
  if (typeof sheet.removeAttribute === 'function') sheet.removeAttribute('inert');
  sheet.classList.add('open');
  sheet.setAttribute('aria-hidden', 'false');
  document.querySelectorAll('[aria-controls="mobileMenuSheet"]').forEach((trigger) => {
    trigger.setAttribute('aria-expanded', 'true');
  });
  if (document.body) document.body.style.overflow = 'hidden';
  return true;
}

export function closeMobileMenu() {
  const sheet = _getElement('mobileMenuSheet');
  const opener = mobileMenuOpener;
  mobileMenuOpener = null;
  if (!sheet) return false;
  if (!releaseMobileMenuFocus(sheet, opener, document)) return false;
  sheet.classList.remove('open');
  sheet.setAttribute('aria-hidden', 'true');
  sheet.setAttribute('inert', '');
  document.querySelectorAll('[aria-controls="mobileMenuSheet"]').forEach((trigger) => {
    trigger.setAttribute('aria-expanded', 'false');
  });
  if (document.body) document.body.style.overflow = '';
  return true;
}

export function checkMonthlyReminder(now) {
  const today = _asDate(now);
  const day = today.getDate();
  if (day < 1 || day > 3) return false;

  const monthKey = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0');
  if (_safeStorageGet('mrDismissed_' + monthKey)) return false;

  const prevDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const prevMonth = prevDate.getMonth() + 1;
  const prevYear = prevDate.getFullYear();
  const reminder = _getElement('monthlyReminder');
  const label = _getElement('mrPrevMonth');
  if (!reminder || !label) return false;

  label.textContent = 'Tháng ' + prevMonth + '/' + prevYear;
  reminder.style.display = 'flex';
  return true;
}

export function dismissMonthlyReminder(now) {
  const today = _asDate(now);
  const key = 'mrDismissed_' + today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0');
  _safeStorageSet(key, '1');
  const reminder = _getElement('monthlyReminder');
  if (reminder) reminder.style.display = 'none';
  return true;
}

export function openMonthlyExport(now) {
  const today = _asDate(now);
  dismissMonthlyReminder(today);

  const prevDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const prevMonth = prevDate.getMonth() + 1;
  const prevYear = prevDate.getFullYear();

  if (typeof window.openExcelExportModal !== 'function') {
    console.warn('[LegacyUiShell] openExcelExportModal is not ready');
    return false;
  }

  window.openExcelExportModal();
  setTimeout(() => {
    const yearEl = _getElement('excel_year');
    if (yearEl) yearEl.value = String(prevYear);

    const typeEl = _getElement('excel_periodType');
    if (typeEl) {
      typeEl.value = 'month';
      if (typeof window.updateExcelPeriodOptions === 'function') {
        window.updateExcelPeriodOptions();
      }
    }

    const valueEl = _getElement('excel_periodValue');
    if (valueEl) valueEl.value = String(prevMonth);
  }, 120);
  return true;
}

export function openTaxModal() {
  const modal = _getElement('taxExportModal');
  if (!modal) return false;
  modal.style.display = 'flex';
  if (typeof window.updateTaxPeriodOptions === 'function') {
    window.updateTaxPeriodOptions();
  }
  return true;
}

export function closeTaxModal() {
  const modal = _getElement('taxExportModal');
  if (!modal) return false;
  modal.style.display = 'none';
  return true;
}

export const LegacyUiShell = Object.freeze({
  openMobileMenu,
  closeMobileMenu,
  checkMonthlyReminder,
  dismissMonthlyReminder,
  openMonthlyExport,
  openTaxModal,
  closeTaxModal,
});

export function initLegacyUiShell() {
  if (typeof window === 'undefined') return LegacyUiShell;

  const owner = 'js/ui/legacyUiShell.js';
  const registrations = [
    ['openMobileMenu', openMobileMenu, 'ui-only'],
    ['closeMobileMenu', closeMobileMenu, 'ui-only'],
    ['_checkMonthlyReminder', checkMonthlyReminder, 'ui-only'],
    ['_dismissMonthlyReminder', dismissMonthlyReminder, 'ui-only'],
    ['_openMonthlyExport', openMonthlyExport, 'ui-readonly-orchestration'],
    ['openTaxModal', openTaxModal, 'ui-only'],
    ['closeTaxModal', closeTaxModal, 'ui-only'],
  ];

  const results = registrations.map(([name, fn, risk]) =>
    GlobalOwnershipRegistry.register(name, fn, {
      owner,
      risk,
      policy: 'module-primary',
    })
  );

  window.LegacyUiShell = LegacyUiShell;
  window.__legacyUiShellInit = {
    phase: '4K-6S-global-ownership-adoption-duplicate-ui-cleanup',
    ok: results.every((item) => item && item.ok),
    results,
  };

  window.debugLegacyUiShell = function debugLegacyUiShell() {
    const required = registrations.map(([name]) => name);
    const missing = required.filter((name) => typeof window[name] !== 'function');
    const ownership = GlobalOwnershipRegistry.assertRegisteredOwnership();
    const result = {
      ok: missing.length === 0 && ownership.ok,
      phase: '4K-6S-global-ownership-adoption-duplicate-ui-cleanup',
      requiredCount: required.length,
      missing,
      ownership,
      hasLegacyUiShell: !!window.LegacyUiShell,
      protectedFlows: {
        processMultiItem: typeof window.processMultiItem === 'function',
        quickPay: typeof window.quickPay === 'function',
        deleteTx: typeof window.deleteTx === 'function',
        markInvPaid: typeof window.markInvPaid === 'function',
        initSaaSDatabase: typeof window.initSaaSDatabase === 'function',
        listenToData: typeof window.listenToData === 'function',
        renderApp: typeof window.renderApp === 'function',
        scheduleRender: typeof window.scheduleRender === 'function',
      },
    };
    console.log('[debugLegacyUiShell]', result);
    return result;
  };

  return LegacyUiShell;
}

export default LegacyUiShell;
