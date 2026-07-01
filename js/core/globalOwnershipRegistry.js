/**
 * js/core/globalOwnershipRegistry.js
 * Phase 4K-6V — Attendance Canonical Ownership + Monthly Pagination
 *
 * Central registry for reviewed window globals. It preserves the classic-script
 * fallback reference for rollback, installs one canonical module owner, detects
 * later replacement, and can explicitly restore an owned reference for recovery.
 *
 * It never intercepts arbitrary window assignments and never owns Firestore,
 * authentication, listener, render-kernel, or financial write flows.
 */

const _owners = new Map();
const _legacyFallbacks = new Map();
const _collisions = [];
const _restorations = [];

export const GLOBAL_OWNERSHIP_MANIFEST = Object.freeze({
  // Canonical module owners required after the module bootstrap completes.
  showToast:               { owner: 'js/ui/toast.js', risk: 'ui-only', policy: 'module-primary', registrationRequired: true },
  closeModal:              { owner: 'js/ui/modal.js', risk: 'ui-only', policy: 'module-primary', registrationRequired: true },
  openComboModal:          { owner: 'js/modules/finance.js', risk: 'ui-only', policy: 'module-primary', registrationRequired: true },
  formatMonthCompact:      { owner: 'js/utils/format.js', risk: 'pure-helper', policy: 'module-primary', registrationRequired: true },

  // Low-risk UI shell ownership established in Phase 4K-6R.
  openMobileMenu:          { owner: 'js/ui/legacyUiShell.js', risk: 'ui-only', policy: 'module-primary', registrationRequired: true },
  closeMobileMenu:         { owner: 'js/ui/legacyUiShell.js', risk: 'ui-only', policy: 'module-primary', registrationRequired: true },
  _checkMonthlyReminder:   { owner: 'js/ui/legacyUiShell.js', risk: 'ui-only', policy: 'module-primary', registrationRequired: true },
  _dismissMonthlyReminder: { owner: 'js/ui/legacyUiShell.js', risk: 'ui-only', policy: 'module-primary', registrationRequired: true },
  _openMonthlyExport:      { owner: 'js/ui/legacyUiShell.js', risk: 'ui-readonly-orchestration', policy: 'module-primary', registrationRequired: true },
  openTaxModal:            { owner: 'js/ui/legacyUiShell.js', risk: 'ui-only', policy: 'module-primary', registrationRequired: true },
  closeTaxModal:           { owner: 'js/ui/legacyUiShell.js', risk: 'ui-only', policy: 'module-primary', registrationRequired: true },


  // Phase 4K-6U: eager facade owns public report handlers; heavy code is lazy.
  openExcelExportModal:    { owner: 'js/modules/reports/reportExportFacade.js', risk: 'report-ui', policy: 'module-primary', registrationRequired: true },
  updateExcelPeriodOptions:{ owner: 'js/modules/reports/reportExportFacade.js', risk: 'report-ui', policy: 'module-primary', registrationRequired: true },
  exportToExcel:           { owner: 'js/modules/reports/reportExportFacade.js', risk: 'report-ui', policy: 'module-primary', registrationRequired: true },
  executeExcelExport:      { owner: 'js/modules/reports/reportExportFacade.js', risk: 'report-readonly-lazy', policy: 'module-primary', registrationRequired: true },
  exportAchievementsExcel: { owner: 'js/modules/reports/reportExportFacade.js', risk: 'report-readonly-lazy', policy: 'module-primary', registrationRequired: true },
  exportExamPaidList:      { owner: 'js/modules/reports/reportExportFacade.js', risk: 'report-readonly-lazy', policy: 'module-primary', registrationRequired: true },
  updateTaxPeriodOptions:  { owner: 'js/modules/reports/reportExportFacade.js', risk: 'report-ui', policy: 'module-primary', registrationRequired: true },
  executeTaxExport:        { owner: 'js/modules/reports/reportExportFacade.js', risk: 'report-readonly-lazy', policy: 'module-primary', registrationRequired: true },
  exportAttendanceExcel:   { owner: 'js/modules/reports/reportExportFacade.js', risk: 'report-readonly-lazy', policy: 'module-primary', registrationRequired: true },
  copyAttReport:           { owner: 'js/modules/reports/reportExportFacade.js', risk: 'ui-only', policy: 'module-primary', registrationRequired: true },


  // Phase 4K-6V: attendance core is module-owned; app.js keeps no duplicate implementation.
  _getClubShifts:              { owner: 'js/modules/attendance.js', risk: 'attendance-readonly', policy: 'module-primary', registrationRequired: true },
  _ensureClubShiftsLoaded:     { owner: 'js/modules/attendance.js', risk: 'attendance-readonly', policy: 'module-primary', registrationRequired: true },
  _renderHomeBirthdayBanner:   { owner: 'js/modules/attendance.js', risk: 'attendance-ui', policy: 'module-primary', registrationRequired: true },
  showAttMemberHistory:        { owner: 'js/modules/attendance.js', risk: 'attendance-readonly', policy: 'module-primary', registrationRequired: true },
  renderAttendanceList:        { owner: 'js/modules/attendance.js', risk: 'attendance-readwrite', policy: 'module-primary', registrationRequired: true },
  onShiftChange:               { owner: 'js/modules/attendance.js', risk: 'attendance-ui', policy: 'module-primary', registrationRequired: true },
  openShiftModal:              { owner: 'js/modules/attendance.js', risk: 'attendance-ui', policy: 'module-primary', registrationRequired: true },
  closeShiftModal:             { owner: 'js/modules/attendance.js', risk: 'attendance-ui', policy: 'module-primary', registrationRequired: true },
  addShift:                    { owner: 'js/modules/attendance.js', risk: 'attendance-write', policy: 'module-primary', registrationRequired: true },
  deleteShift:                 { owner: 'js/modules/attendance.js', risk: 'attendance-write', policy: 'module-primary', registrationRequired: true },
  toggleAttendance:            { owner: 'js/modules/attendance.js', risk: 'attendance-write', policy: 'module-primary', registrationRequired: true },
  toggleAttendanceStatus:      { owner: 'js/modules/attendance.js', risk: 'attendance-write', policy: 'module-primary', registrationRequired: true },
  setAttendanceStatus:         { owner: 'js/modules/attendance.js', risk: 'attendance-write', policy: 'module-primary', registrationRequired: true },
  bulkCheckIn:                 { owner: 'js/modules/attendance.js', risk: 'attendance-write', policy: 'module-primary', registrationRequired: true },
  syncOfflineAttendance:       { owner: 'js/modules/attendance.js', risk: 'attendance-write', policy: 'module-primary', registrationRequired: true },
  switchAttSubTab:             { owner: 'js/modules/attendance.js', risk: 'attendance-ui', policy: 'module-primary', registrationRequired: true },
  renderAttMonthly:            { owner: 'js/modules/attendance.js', risk: 'attendance-readonly-paginated', policy: 'module-primary', registrationRequired: true },
  printAttendanceStatus:       { owner: 'js/modules/attendance.js', risk: 'attendance-diagnostics-readonly', policy: 'module-primary', registrationRequired: true },
  printAttendanceSessionCompletion:{ owner: 'js/modules/attendance.js', risk: 'attendance-diagnostics-readonly', policy: 'module-primary', registrationRequired: true },
  printAttendanceBranchReport: { owner: 'js/modules/attendance.js', risk: 'attendance-diagnostics-readonly', policy: 'module-primary', registrationRequired: true },


  // Phase 4K-6T: read-only diagnostics extracted from app.js.
  debugMobileSuperAdminGate: { owner: 'js/diagnostics/runtimeReadinessDiagnostics.js', risk: 'diagnostics-readonly', policy: 'module-primary', registrationRequired: true },
  printDataHydrationStatus:  { owner: 'js/diagnostics/runtimeReadinessDiagnostics.js', risk: 'diagnostics-readonly', policy: 'module-primary', registrationRequired: true },
  printTabDataStatus:        { owner: 'js/diagnostics/runtimeReadinessDiagnostics.js', risk: 'diagnostics-readonly', policy: 'module-primary', registrationRequired: true },
  printFirestorePathStatus:  { owner: 'js/diagnostics/runtimeReadinessDiagnostics.js', risk: 'diagnostics-bounded-read', policy: 'module-primary', registrationRequired: true },
  printPilotTabReadiness:    { owner: 'js/diagnostics/runtimeReadinessDiagnostics.js', risk: 'diagnostics-readonly', policy: 'module-primary', registrationRequired: true },
  printPilotLaunchStatus:    { owner: 'js/diagnostics/runtimeReadinessDiagnostics.js', risk: 'diagnostics-readonly', policy: 'module-primary', registrationRequired: true },
  printTenClubPilotReadiness:{ owner: 'js/diagnostics/runtimeReadinessDiagnostics.js', risk: 'diagnostics-readonly', policy: 'module-primary', registrationRequired: true },
  generatePilotLaunchSnapshot:{ owner: 'js/diagnostics/runtimeReadinessDiagnostics.js', risk: 'diagnostics-readonly', policy: 'module-primary', registrationRequired: true },
  printOneClubPilotGate:     { owner: 'js/diagnostics/runtimeReadinessDiagnostics.js', risk: 'diagnostics-readonly', policy: 'module-primary', registrationRequired: true },

  // Lazy wrappers remain canonical globals; implementations load only when used.
  runOnboardingGate:                { owner: 'js/diagnostics/legacyDiagnostics.js', risk: 'diagnostics-lazy-readonly', policy: 'module-primary', registrationRequired: true },
  printOnboardingGate:              { owner: 'js/diagnostics/legacyDiagnostics.js', risk: 'diagnostics-lazy-readonly', policy: 'module-primary', registrationRequired: true },
  generateOnboardingReportText:     { owner: 'js/diagnostics/legacyDiagnostics.js', risk: 'diagnostics-lazy-readonly', policy: 'module-primary', registrationRequired: true },
  runSuperAdminAudit:               { owner: 'js/diagnostics/legacyDiagnostics.js', risk: 'diagnostics-lazy-readonly', policy: 'module-primary', registrationRequired: true },
  printSuperAdminAudit:             { owner: 'js/diagnostics/legacyDiagnostics.js', risk: 'diagnostics-lazy-readonly', policy: 'module-primary', registrationRequired: true },
  generateSuperAdminAuditReportText:{ owner: 'js/diagnostics/legacyDiagnostics.js', risk: 'diagnostics-lazy-readonly', policy: 'module-primary', registrationRequired: true },

  // switchTab has an intentional main.js async wrapper around tabs.js. It is
  // inventoried but not registered until that wrapper is extracted as one unit.
  switchTab:               { owner: 'js/main.js async wrapper + js/ui/tabs.js', risk: 'render-control', policy: 'audit-only-wrapper', registrationRequired: false },

  // Protected legacy kernel/write flows. Inventory only; registry cannot own them.
  processMultiItem:        { owner: 'app.js legacy kernel', risk: 'very-high-write', policy: 'protected-legacy', registrationRequired: false },
  quickPay:                { owner: 'js/modules/finance.js + guarded legacy fallback', risk: 'high-write', policy: 'protected', registrationRequired: false },
  deleteTx:                { owner: 'js/modules/finance.js + integrity guard', risk: 'high-write', policy: 'protected', registrationRequired: false },
  markInvPaid:             { owner: 'inventory module/legacy guarded path', risk: 'high-write', policy: 'protected', registrationRequired: false },
  cancelExamPayment:       { owner: 'legacy/module guarded path', risk: 'high-write', policy: 'protected', registrationRequired: false },
  initSaaSDatabase:        { owner: 'app.js legacy kernel', risk: 'critical-bootstrap', policy: 'protected-legacy', registrationRequired: false },
  listenToData:            { owner: 'app.js legacy kernel', risk: 'critical-listener', policy: 'protected-legacy', registrationRequired: false },
  renderApp:               { owner: 'app.js legacy fallback + render bridge', risk: 'critical-render', policy: 'protected-legacy', registrationRequired: false },
  scheduleRender:          { owner: 'app.js legacy fallback + invalidation bridge', risk: 'critical-render', policy: 'protected-legacy', registrationRequired: false },
});

function _isFunction(value) {
  return typeof value === 'function';
}

function _recordCollision(name, existingOwner, requestedOwner, reason) {
  const item = {
    name,
    existingOwner: existingOwner || 'unregistered',
    requestedOwner: requestedOwner || 'unknown',
    reason: reason || 'duplicate-owner',
    at: Date.now(),
  };
  _collisions.push(item);
  if (_collisions.length > 100) _collisions.splice(0, _collisions.length - 100);
  return item;
}

export const GlobalOwnershipRegistry = Object.freeze({
  /**
   * Register one reviewed canonical implementation on window.
   * The first pre-existing function is retained as the rollback fallback.
   */
  register(name, implementation, options = {}) {
    if (typeof window === 'undefined') return { ok: false, reason: 'no-window' };
    if (!name || !_isFunction(implementation)) {
      return { ok: false, reason: 'invalid-registration', name };
    }

    const owner = String(options.owner || 'unknown-owner');
    const manifest = GLOBAL_OWNERSHIP_MANIFEST[name];

    if (!manifest && options.allowUnmanifested !== true) {
      return { ok: false, reason: 'unmanifested-global', name, owner };
    }

    if (manifest && String(manifest.policy || '').startsWith('protected') && options.allowProtected !== true) {
      return { ok: false, reason: 'protected-policy', name, owner, policy: manifest.policy };
    }

    if (manifest?.policy === 'audit-only-wrapper' && options.allowAuditOnly !== true) {
      return { ok: false, reason: 'audit-only-policy', name, owner, policy: manifest.policy };
    }

    if (manifest?.owner && manifest.owner !== owner && options.allowOwnerMismatch !== true) {
      return {
        ok: false,
        reason: 'manifest-owner-mismatch',
        name,
        owner,
        expectedOwner: manifest.owner,
      };
    }

    const existingRecord = _owners.get(name);
    if (
      existingRecord &&
      (existingRecord.owner !== owner || existingRecord.implementation !== implementation) &&
      options.override !== true
    ) {
      const collision = _recordCollision(name, existingRecord.owner, owner, 'registered-owner-conflict');
      return { ok: false, reason: 'owner-conflict', collision };
    }

    const current = window[name];
    if (_isFunction(current) && current !== implementation && !_legacyFallbacks.has(name)) {
      _legacyFallbacks.set(name, current);
    }

    window[name] = implementation;
    const record = {
      name,
      owner,
      risk: options.risk || manifest?.risk || 'unknown',
      policy: options.policy || manifest?.policy || 'module-primary',
      implementation,
      installedAt: Date.now(),
      hadLegacyFallback: _legacyFallbacks.has(name),
    };
    _owners.set(name, record);
    return { ok: true, record: { ...record, implementation: undefined } };
  },

  getOwner(name) {
    const record = _owners.get(name);
    return record ? { ...record, implementation: undefined } : null;
  },

  getLegacyFallback(name) {
    return _legacyFallbacks.get(name) || null;
  },

  callLegacyFallback(name, args = []) {
    const fallback = _legacyFallbacks.get(name);
    if (!_isFunction(fallback)) return undefined;
    return fallback.apply(window, Array.isArray(args) ? args : []);
  },

  /**
   * Explicit recovery only. No Proxy and no automatic mutation of arbitrary
   * globals. This restores a previously registered canonical reference.
   */
  restoreCanonical(name) {
    if (typeof window === 'undefined') return { ok: false, reason: 'no-window', name };
    const record = _owners.get(name);
    if (!record) return { ok: false, reason: 'not-registered', name };
    const replaced = window[name] !== record.implementation;
    window[name] = record.implementation;
    const restoration = { name, owner: record.owner, replaced, at: Date.now() };
    _restorations.push(restoration);
    if (_restorations.length > 100) _restorations.splice(0, _restorations.length - 100);
    return { ok: true, restoration };
  },

  getSnapshot() {
    const registered = Array.from(_owners.values()).map((record) => ({
      name: record.name,
      owner: record.owner,
      risk: record.risk,
      policy: record.policy,
      installed: typeof window !== 'undefined' && window[record.name] === record.implementation,
      hadLegacyFallback: record.hadLegacyFallback,
    }));

    const manifest = Object.entries(GLOBAL_OWNERSHIP_MANIFEST).map(([name, meta]) => ({
      name,
      expectedOwner: meta.owner,
      risk: meta.risk,
      policy: meta.policy,
      registrationRequired: meta.registrationRequired === true,
      exists: typeof window !== 'undefined' && typeof window[name] !== 'undefined',
      registeredOwner: _owners.get(name)?.owner || '',
      installed: !!(_owners.get(name) && typeof window !== 'undefined' && window[name] === _owners.get(name).implementation),
    }));

    return {
      phase: '4K-6V-attendance-canonical-ownership',
      registered,
      manifest,
      collisions: _collisions.slice(),
      restorations: _restorations.slice(),
      legacyFallbackNames: Array.from(_legacyFallbacks.keys()),
    };
  },

  assertRegisteredOwnership() {
    const failures = [];
    for (const record of _owners.values()) {
      if (typeof window === 'undefined' || window[record.name] !== record.implementation) {
        failures.push({ name: record.name, owner: record.owner, reason: 'global-reference-replaced' });
      }
    }
    return { ok: failures.length === 0, failures };
  },

  assertManifestCoverage() {
    const failures = [];
    for (const [name, meta] of Object.entries(GLOBAL_OWNERSHIP_MANIFEST)) {
      if (meta.registrationRequired !== true) continue;
      const record = _owners.get(name);
      if (!record) {
        failures.push({ name, expectedOwner: meta.owner, reason: 'required-owner-not-registered' });
      } else if (record.owner !== meta.owner) {
        failures.push({ name, expectedOwner: meta.owner, actualOwner: record.owner, reason: 'required-owner-mismatch' });
      }
    }
    return { ok: failures.length === 0, failures };
  },
});

export function initGlobalOwnershipRegistry() {
  if (typeof window === 'undefined') return GlobalOwnershipRegistry;
  window.GlobalOwnershipRegistry = GlobalOwnershipRegistry;
  window.GLOBAL_OWNERSHIP_MANIFEST = GLOBAL_OWNERSHIP_MANIFEST;
  window.debugGlobalOwnership = function debugGlobalOwnership() {
    const snapshot = GlobalOwnershipRegistry.getSnapshot();
    const assertion = GlobalOwnershipRegistry.assertRegisteredOwnership();
    const coverage = GlobalOwnershipRegistry.assertManifestCoverage();
    const result = {
      ok: assertion.ok && coverage.ok && snapshot.collisions.length === 0,
      phase: snapshot.phase,
      registeredCount: snapshot.registered.length,
      requiredRegistrationCount: snapshot.manifest.filter((item) => item.registrationRequired).length,
      manifestCount: snapshot.manifest.length,
      collisionCount: snapshot.collisions.length,
      fallbackCount: snapshot.legacyFallbackNames.length,
      assertion,
      coverage,
      snapshot,
    };
    console.log('[debugGlobalOwnership]', result);
    if (console.table) console.table(snapshot.registered);
    return result;
  };
  return GlobalOwnershipRegistry;
}

export default GlobalOwnershipRegistry;
