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

console.log('\n🔎 Phase 4K-6S — Global Ownership Adoption + Duplicate UI Cleanup\n');

check(exists(fallbackPath), 'classic rollback layer exists');
check(index.indexOf('js/legacy/legacyUiFallbacks.js') < index.indexOf('src="app.js"'), 'classic rollback layer loads before app.js');
check(fallback.includes('4K-6S-global-ownership-adoption-duplicate-ui-cleanup'), 'fallback layer declares Phase 4K-6S');
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
check(registry.includes("phase: '4K-6S-global-ownership-adoption-duplicate-ui-cleanup'"), 'registry reports Phase 4K-6S');
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
check(main.includes("APP_BUILD_VERSION = '4K-6S-global-ownership-adoption-duplicate-ui-cleanup-20260615'"), 'APP_BUILD_VERSION is Phase 4K-6S');
check(index.includes('main.js?v=global-ownership-adoption-duplicate-ui-cleanup-20260615'), 'index cache bust is Phase 4K-6S');

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
globalThis.document = { getElementById: (id) => elements.get(id) || null };
globalThis.localStorage = {
  getItem: (key) => storage.has(key) ? storage.get(key) : null,
  setItem: (key, value) => storage.set(key, String(value)),
};
globalThis.isSuperAdminRole = () => true;
globalThis.openExcelExportModal = () => { globalThis.__excelOpened = true; };
globalThis.updateExcelPeriodOptions = () => { globalThis.__excelOptionsUpdated = true; };
globalThis.updateTaxPeriodOptions = () => { globalThis.__taxOptionsUpdated = true; };

try {
  vm.runInThisContext(fallback, { filename: fallbackPath });
  const fallbackRefs = Object.fromEntries(migratedNames.map((name) => [name, globalThis[name]]));

  const registryModule = await import(pathToFileURL(path.join(root, 'js/core/globalOwnershipRegistry.js')).href);
  const shellModule = await import(pathToFileURL(path.join(root, 'js/ui/legacyUiShell.js')).href);
  const toastModule = await import(pathToFileURL(path.join(root, 'js/ui/toast.js')).href);
  const modalModule = await import(pathToFileURL(path.join(root, 'js/ui/modal.js')).href);
  const formatModule = await import(pathToFileURL(path.join(root, 'js/utils/format.js')).href);
  const financeModule = await import(pathToFileURL(path.join(root, 'js/modules/finance.js')).href);

  registryModule.initGlobalOwnershipRegistry();
  shellModule.initLegacyUiShell();
  toastModule.registerToastGlobal();
  modalModule.registerModalGlobals();
  formatModule.registerFormatGlobals();
  financeModule.registerFinanceUiGlobals();

  const snapshot = globalThis.GlobalOwnershipRegistry.getSnapshot();
  const assertion = globalThis.GlobalOwnershipRegistry.assertRegisteredOwnership();
  const coverage = globalThis.GlobalOwnershipRegistry.assertManifestCoverage();
  check(snapshot.registered.length === 11, 'exactly 11 reviewed low-risk globals have canonical owners');
  check(snapshot.legacyFallbackNames.length === 11, 'all 11 classic fallback references are preserved');
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
