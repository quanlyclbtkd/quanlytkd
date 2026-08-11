#!/usr/bin/env node
/**
 * Phase 4K-6S — Existing Module Ownership Adoption + Duplicate UI Cleanup
 * Static + lightweight runtime checks. No network/Firebase calls.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const exists = (rel) => fs.existsSync(path.join(root, rel));
const failures = [];
const passes = [];
const check = (condition, msg) => condition ? passes.push(msg) : failures.push(msg);

const app = read('app.js');
const main = read('js/main.js');
const index = read('index.html');
const pkg = JSON.parse(read('package.json'));
const registry = read('js/core/globalOwnershipRegistry.js');
const shell = read('js/ui/legacyUiShell.js');
const toast = read('js/ui/toast.js');
const modal = read('js/ui/modal.js');
const format = read('js/utils/format.js');
const finance = read('js/modules/finance.js');
const students = read('js/modules/students.js');
const fallbackPath = 'js/legacy/legacyUiFallbacks.js';
const fallback = exists(fallbackPath) ? read(fallbackPath) : '';
const attendanceFallbackPath = 'js/legacy/legacyAttendanceFallbacks.js';
const attendanceFallback = exists(attendanceFallbackPath) ? read(attendanceFallbackPath) : '';
const attendanceOwnedNames = [
  '_getClubShifts', '_ensureClubShiftsLoaded', '_renderHomeBirthdayBanner',
  'showAttMemberHistory', 'renderAttendanceList', 'onShiftChange',
  'openShiftModal', 'closeShiftModal', 'addShift', 'deleteShift',
  'toggleAttendance', 'toggleAttendanceStatus', 'bulkCheckIn',
  'syncOfflineAttendance', 'switchAttSubTab', 'renderAttMonthly',
  'printAttendanceStatus', 'printAttendanceSessionCompletion',
  'printAttendanceBranchReport',
];

console.log('\n🔎 Phase 4K-6S — Global Ownership Adoption + Duplicate UI Cleanup\n');

check(exists(fallbackPath), 'classic rollback layer exists');
check(index.indexOf('js/legacy/legacyUiFallbacks.js') < index.indexOf('src="app.js'), 'classic rollback layer loads before app.js');
check(fallback.includes('4K-6U-report-excel-lazy-isolation'), 'UI/report fallback layer retains its Phase 4K-6U contract');
check(exists(attendanceFallbackPath), 'attendance classic rollback bridge exists');
check(index.indexOf('js/legacy/legacyAttendanceFallbacks.js') < index.indexOf('src="app.js'), 'attendance rollback bridge loads before app.js');
check(attendanceFallback.includes('4K-6V-attendance-canonical-ownership'), 'attendance rollback bridge declares Phase 4K-6V');
check(fallback.includes('debugLegacyUiFallbacks'), 'fallback layer exposes health diagnostics');

const migratedNames = [
  'showToast', 'openMobileMenu', 'closeMobileMenu', '_checkMonthlyReminder',
  '_dismissMonthlyReminder', '_openMonthlyExport', 'openTaxModal', 'closeTaxModal',
  'openComboModal', 'closeModal', 'formatMonthCompact',
];
for (const name of migratedNames) {
  check(fallback.includes(`${name}:`), `fallback layer contains ${name}`);
  const appAssignment = new RegExp(`window\\.${name.replace('$', '\\$')}\\s*=(?!=)`);
  check(!appAssignment.test(app), `app.js no longer owns duplicate body for ${name}`);
}
for (const bad of ['updateDoc(', 'setDoc(', 'addDoc(', 'deleteDoc(', 'writeBatch(', 'runTransaction(', 'onSnapshot(', 'getDocs(', 'getDoc(']) {
  check(!fallback.includes(bad), `fallback layer has no Firebase API: ${bad}`);
}

check(Buffer.byteLength(app) < 810455, 'app.js is smaller than Phase 4K-6R baseline');
check(app.split('\n').length < 13190, 'app.js line count is lower than Phase 4K-6R baseline');
check(app.includes('js/legacy/legacyUiFallbacks.js'), 'app.js documents extracted rollback layer');

check(registry.includes('assertManifestCoverage'), 'registry validates required canonical owner coverage');
check(registry.includes('restoreCanonical'), 'registry provides explicit canonical recovery');
check(registry.includes('audit-only-policy'), 'registry blocks accidental switchTab ownership');
check(registry.includes("phase: '4K-6V-attendance-canonical-ownership'"), 'registry reports current Phase 4K-6V while preserving prior ownership rules');
for (const name of migratedNames) {
  check(registry.includes(`${name}:`), `ownership manifest includes ${name}`);
}

check(toast.includes("GlobalOwnershipRegistry.register('showToast'"), 'toast module registers canonical showToast');
check(modal.includes("GlobalOwnershipRegistry.register('closeModal'"), 'modal module registers canonical closeModal');
check(format.includes("GlobalOwnershipRegistry.register('formatMonthCompact'"), 'format module registers canonical formatMonthCompact');
check(finance.includes("GlobalOwnershipRegistry.register('openComboModal'"), 'finance module registers canonical openComboModal');
check(!/window\.formatMonthCompact\s*=/.test(finance), 'finance module no longer overwrites formatMonthCompact');
check(!/window\.openComboModal\s*=/.test(finance), 'finance module no longer directly overwrites openComboModal');
check(!/window\.formatMonthCompact\s*=/.test(students), 'students module no longer overwrites formatMonthCompact');
check(students.includes('formatMonthCompact(monthsStr)'), 'students module uses imported pure formatter');
check(main.includes('registerFormatGlobals()'), 'main registers format ownership before business init');
check(main.includes('registerFinanceUiGlobals()'), 'main registers finance UI ownership before business init');
check(main.includes('debugLegacyUiFallbacks'), 'runtime smoke test includes rollback-layer diagnostics');
check(main.includes("APP_BUILD_VERSION = '4K-6U-report-excel-lazy-isolation-20260616'"), 'main retains Phase 4K-6U compatibility marker');
check(main.includes("window.APP_BUILD_VERSION = '4K-6V-attendance-canonical-ownership-pagination-20260616'") || main.includes("window.APP_BUILD_VERSION = '4K-6V2-inventory-history-pagination-complete-active-debt-20260616'") || main.includes("window.APP_BUILD_VERSION = '4K-6V5U5-canonical-security-truth-20260811'"), 'active APP_BUILD_VERSION is Phase 4K-6V or a later compatible phase');
check(index.includes('main.js?v=attendance-canonical-ownership-20260616') || index.includes('main.js?v=inventory-pagination-complete-debt-20260616') || index.includes('main.js?v=inventory-dynamic-size-catalog-20260616-v2b') || index.includes('main.js?v=inventory-ledger-reconciliation-20260616-v2c') || index.includes('main.js?v=canonical-security-truth-20260811-v5u5'), 'index cache bust is Phase 4K-6V or a later compatible phase');

for (const protectedFn of [
  'processMultiItem', 'quickPay', 'deleteTx', 'markInvPaid', 'cancelExamPayment',
  'initSaaSDatabase', 'listenToData', 'renderApp', 'scheduleRender',
]) {
  check(app.includes(protectedFn), `protected flow remains in legacy/runtime boundary: ${protectedFn}`);
}
check(!main.includes("GlobalOwnershipRegistry.register('switchTab'"), 'switchTab remains audit-only due async wrapper/lifecycle coupling');

check(!!pkg.scripts?.['check:global-ownership-adoption-cleanup'], 'package has Phase 4K-6S checker');
check(pkg.scripts?.check?.includes('check:global-ownership-adoption-cleanup'), 'default check includes Phase 4K-6S');
check(pkg.scripts?.['check:all']?.includes('check:global-ownership-adoption-cleanup'), 'check:all includes Phase 4K-6S');
check(pkg.scripts?.['check:all:critical']?.includes('check:global-ownership-adoption-cleanup'), 'critical checks include Phase 4K-6S');

// Lightweight runtime simulation.
const elements = new Map();
function makeElement(id) {
  const classes = new Set();
  return {
    id,
    style: {},
    value: '',
    textContent: '',
    innerText: '',
    classList: {
      add(name) { classes.add(name); },
      remove(name) { classes.delete(name); },
      contains(name) { return classes.has(name); },
    },
  };
}
for (const id of [
  'toastMessage', 'mobileMenuSheet', 'mmsAdminBtn', 'monthlyReminder', 'mrPrevMonth',
  'taxExportModal', 'comboModal', 'profileModal', 'otherModal',
  'excel_year', 'excel_periodType', 'excel_periodValue',
]) elements.set(id, makeElement(id));

const storage = new Map();
globalThis.window = globalThis;
globalThis.document = {
  getElementById: (id) => elements.get(id) || null,
  querySelectorAll: () => [],
  createElement: (id) => makeElement(id || 'created'),
  body: { appendChild() {}, removeChild() {} },
};
globalThis.localStorage = {
  get length() { return storage.size; },
  key: (index) => Array.from(storage.keys())[index] || null,
  getItem: (key) => storage.has(key) ? storage.get(key) : null,
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: (key) => storage.delete(key),
};
Object.defineProperty(globalThis, 'navigator', { value: { onLine: false }, configurable: true });
globalThis.addEventListener = () => {};
globalThis.__store = { clubId: 'club-test', currentClubId: 'club-test', db: {}, profiles: {}, clubConfig: {}, clubData: {} };
globalThis.currentClubId = 'club-test';
globalThis.userRole = 'admin';
globalThis.isSuperAdminRole = () => true;
globalThis.openExcelExportModal = () => { globalThis.__excelOpened = true; };
globalThis.updateExcelPeriodOptions = () => { globalThis.__excelOptionsUpdated = true; };
globalThis.updateTaxPeriodOptions = () => { globalThis.__taxOptionsUpdated = true; };

try {
  vm.runInThisContext(fallback, { filename: fallbackPath });
  vm.runInThisContext(attendanceFallback, { filename: attendanceFallbackPath });
  const fallbackRefs = Object.fromEntries(migratedNames.map((name) => [name, globalThis[name]]));

  const registryModule = await import(pathToFileURL(path.join(root, 'js/core/globalOwnershipRegistry.js')).href);
  const shellModule = await import(pathToFileURL(path.join(root, 'js/ui/legacyUiShell.js')).href);
  const toastModule = await import(pathToFileURL(path.join(root, 'js/ui/toast.js')).href);
  const modalModule = await import(pathToFileURL(path.join(root, 'js/ui/modal.js')).href);
  const formatModule = await import(pathToFileURL(path.join(root, 'js/utils/format.js')).href);
  const financeModule = await import(pathToFileURL(path.join(root, 'js/modules/finance.js')).href);
  const diagnosticsModule = await import(pathToFileURL(path.join(root, 'js/diagnostics/legacyDiagnostics.js')).href);
  const reportFacadeModule = await import(pathToFileURL(path.join(root, 'js/modules/reports/reportExportFacade.js')).href);
  const attendanceModule = await import(pathToFileURL(path.join(root, 'js/modules/attendance.js')).href);

  registryModule.initGlobalOwnershipRegistry();
  shellModule.initLegacyUiShell();
  toastModule.registerToastGlobal();
  modalModule.registerModalGlobals();
  formatModule.registerFormatGlobals();
  financeModule.registerFinanceUiGlobals();
  reportFacadeModule.registerReportExportFacade();
  diagnosticsModule.initLegacyDiagnostics();
  attendanceModule.initAttendance();

  const snapshot = globalThis.GlobalOwnershipRegistry.getSnapshot();
  const assertion = globalThis.GlobalOwnershipRegistry.assertRegisteredOwnership();
  const coverage = globalThis.GlobalOwnershipRegistry.assertManifestCoverage();
  const registeredUiNames = snapshot.registered.filter((item) => migratedNames.includes(item.name)).map((item) => item.name);
  check(registeredUiNames.length === 11, 'all 11 reviewed Phase 4K-6S UI globals retain canonical owners');
  check(snapshot.registered.length === 55, 'Phase 4K-6V registry contains 11 UI, 10 report, 19 attendance, and 15 diagnostics canonical owners');
  check(snapshot.legacyFallbackNames.length === 40, 'all 40 classic UI/report/attendance fallback references are preserved');
  const registeredAttendanceNames = snapshot.registered.filter((item) => attendanceOwnedNames.includes(item.name));
  check(registeredAttendanceNames.length === 19, 'all 19 attendance globals have canonical owners');
  check(registeredAttendanceNames.every((item) => item.owner === 'js/modules/attendance.js' && item.installed), 'attendance canonical references are installed');
  check(snapshot.collisions.length === 0, 'no ownership collision detected');
  check(assertion.ok, 'all registered globals still point to canonical implementations');
  check(coverage.ok, 'all required manifest owners are registered');
  check(migratedNames.every((name) => globalThis.GlobalOwnershipRegistry.getLegacyFallback(name) === fallbackRefs[name]), 'registry preserved every original classic fallback reference');

  check(globalThis.showToast('Đã lưu', 1) === true, 'canonical showToast renders safely');
  check(elements.get('toastMessage').innerText === 'Đã lưu', 'canonical showToast sets text');
  check(globalThis.closeModal('otherModal') === true && elements.get('otherModal').style.display === 'none', 'canonical closeModal supports explicit modal IDs');
  check(globalThis.openComboModal() === true && elements.get('comboModal').style.display === 'flex', 'canonical openComboModal opens combo modal');
  check(globalThis.formatMonthCompact('2026-03,2026-01,2025-12') === 'T12/2025; T1, T3/2026', 'canonical formatter sorts month/year groups');
  check(globalThis.openMobileMenu() === true && elements.get('mobileMenuSheet').classList.contains('open'), 'mobile menu canonical owner works');

  const canonicalToast = globalThis.showToast;
  globalThis.showToast = function rogueToast() {};
  check(!globalThis.GlobalOwnershipRegistry.assertRegisteredOwnership().ok, 'registry detects later global replacement');
  const restored = globalThis.GlobalOwnershipRegistry.restoreCanonical('showToast');
  check(restored.ok && restored.restoration.replaced, 'registry explicitly restores replaced canonical global');
  check(globalThis.showToast === canonicalToast, 'restored showToast reference matches canonical implementation');
  check(globalThis.debugGlobalOwnership().ok === true, 'global ownership diagnostics are healthy after recovery');
  check(globalThis.debugLegacyUiFallbacks().ok === true, 'classic rollback-layer diagnostics are healthy');
  check(globalThis.debugLegacyUiShell().ok === true, 'legacy UI shell diagnostics are healthy');
} catch (error) {
  failures.push(`runtime simulation failed: ${error?.stack || error}`);
}

for (const msg of passes) console.log('✅', msg);
if (failures.length) {
  console.error(`\n❌ Phase 4K-6S check failed (${failures.length})`);
  failures.forEach((msg) => console.error('FAIL:', msg));
  process.exit(1);
}
console.log(`\n✅ Phase 4K-6S check passed (${passes.length} assertions)\n`);
