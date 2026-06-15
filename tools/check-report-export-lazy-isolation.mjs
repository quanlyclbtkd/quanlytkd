#!/usr/bin/env node
/**
 * Phase 4K-6U — Report/Excel Canonical Ownership + Attendance Export Lazy Isolation
 * Static and lightweight runtime checks. No network and no Firebase calls.
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
const check = (condition, message) => condition ? passes.push(message) : failures.push(message);

const app = read('app.js');
const main = read('js/main.js');
const finance = read('js/modules/finance.js');
const reports = read('js/modules/reports.js');
const registry = read('js/core/globalOwnershipRegistry.js');
const fallback = read('js/legacy/legacyUiFallbacks.js');
const facadePath = 'js/modules/reports/reportExportFacade.js';
const attendancePath = 'js/modules/reports/attendanceExcelReport.js';
const facade = read(facadePath);
const attendance = read(attendancePath);
const index = read('index.html');
const pkg = JSON.parse(read('package.json'));

console.log('\n🔎 Phase 4K-6U — Report/Excel Lazy Isolation\n');

check(exists(facadePath), 'eager report facade exists');
check(exists(attendancePath), 'lazy attendance export module exists');
check(main.includes("from './modules/reports/reportExportFacade.js'"), 'main eagerly imports only the small report facade');
check(main.includes('registerReportExportFacade();'), 'main registers report facade after ownership registry');
check(main.indexOf('initGlobalOwnershipRegistry();') < main.indexOf('registerReportExportFacade();'), 'ownership registry initializes before report facade');
check(!main.includes("from './modules/reports.js'"), 'main no longer static-imports heavy reports.js');
check(!main.includes('initReports();'), 'main no longer initializes heavy reports at startup');
check(facade.includes("import('../reports.js')"), 'facade lazy-imports heavy reports.js');
check(facade.includes("import('./attendanceExcelReport.js')"), 'facade lazy-imports attendance export');
check(facade.includes('reportsModulePromise'), 'facade shares one reports import promise');
check(facade.includes('attendanceModulePromise'), 'facade shares one attendance import promise');
check(facade.includes('actionPromises'), 'facade guards duplicate rapid export actions');
check(facade.includes('restoreFacadeOwnership'), 'facade restores canonical globals after reports module init');
check(facade.includes("window.userRole !== 'viewer'"), 'facade blocks viewer before lazy loading report code');

const reportGlobals = [
  'openExcelExportModal', 'updateExcelPeriodOptions', 'exportToExcel',
  'executeExcelExport', 'exportAchievementsExcel', 'exportExamPaidList',
  'updateTaxPeriodOptions', 'executeTaxExport', 'exportAttendanceExcel', 'copyAttReport',
];
for (const name of reportGlobals) {
  check(registry.includes(`${name}:`), `ownership manifest includes ${name}`);
  check(registry.includes("owner: 'js/modules/reports/reportExportFacade.js'"), 'report ownership points to facade');
  check(fallback.includes(`${name}:`), `classic rollback layer includes ${name}`);
  const appAssignment = new RegExp(`window\\.${name}\\s*=(?!=)`);
  check(!appAssignment.test(app), `app.js no longer assigns window.${name}`);
}

check(!/window\.openExcelExportModal\s*=/.test(finance), 'finance.js no longer owns openExcelExportModal');
check(!/window\.updateExcelPeriodOptions\s*=/.test(finance), 'finance.js no longer owns updateExcelPeriodOptions');
check(!/window\.executeExcelExport\s*=/.test(finance), 'finance.js no longer owns executeExcelExport');
check(!finance.includes("ensureXlsxReady?.('finance-excel-export')"), 'duplicate finance Excel implementation was removed');
check(reports.includes("ensureXlsxReady?.('reports-excel-export')"), 'lazy reports implementation still loads XLSX on demand');
check(reports.includes("ensureXlsxReady?.('reports-export-exam-paid-list')"), 'exam export remains XLSX-lazy');
check(reports.includes("ensureXlsxReady?.('reports-tax-export')"), 'tax export remains XLSX-lazy');
check(reports.includes("ensureXlsxReady?.('reports-achievements-export')"), 'achievement export remains XLSX-lazy');

check(!app.includes('XUẤT EXCEL BÁO CÁO ĐIỂM DANH THÁNG'), 'attendance Excel implementation removed from app.js');
check(!app.includes('limit: monthly att export'), 'app.js no longer has the fixed 10,000 attendance export query');
check(attendance.includes("ensureXlsxReady?.('export-attendance-excel')"), 'attendance module lazy-loads XLSX');
check(attendance.includes("where('month', '==', month)"), 'attendance query remains scoped to selected month');
check(attendance.includes('orderBy(documentId())'), 'attendance pagination uses stable document-id ordering');
check(attendance.includes('startAfter(cursor)'), 'attendance pagination advances with cursor');
check(attendance.includes('limit(PAGE_SIZE)'), 'attendance pagination uses bounded page size');
check(attendance.includes('MAX_PAGES = 200'), 'attendance pagination has a high but finite safety ceiling');
check(attendance.includes('không xuất file thiếu dữ liệu'), 'attendance export refuses silent truncation');
check(!attendance.includes('limit(10000)'), 'attendance module removed fixed 10,000 cap');

for (const bad of ['setDoc(', 'updateDoc(', 'addDoc(', 'deleteDoc(', 'writeBatch(', 'runTransaction(', 'onSnapshot(']) {
  check(!facade.includes(bad), `report facade has no write/listener API: ${bad}`);
  check(!attendance.includes(bad), `attendance report has no write/listener API: ${bad}`);
}

const appBytes = Buffer.byteLength(app);
const appLines = app.split('\n').length;
const financeBytes = Buffer.byteLength(finance);
check(appBytes <= 735000, `app.js reduced to ${appBytes.toLocaleString()} bytes (target <= 735,000)`);
check(appLines <= 11700, `app.js reduced to ${appLines.toLocaleString()} lines (target <= 11,700)`);
check(financeBytes <= 72000, `finance.js reduced to ${financeBytes.toLocaleString()} bytes (target <= 72,000)`);
check(index.includes('app.js?v=report-excel-lazy-isolation-20260616'), 'app.js cache bust updated for 4K-6U');
check(index.includes('main.js?v=report-excel-lazy-isolation-20260616'), 'main.js cache bust updated for 4K-6U');
check(main.includes("APP_BUILD_VERSION = '4K-6U-report-excel-lazy-isolation-20260616'"), 'main build marker updated for 4K-6U');
check(registry.includes("phase: '4K-6U-report-excel-lazy-isolation'"), 'ownership diagnostics report Phase 4K-6U');
check(pkg.scripts?.['check:report-export-lazy-isolation'], 'package exposes 4K-6U checker');
check(pkg.scripts?.check?.includes('check:report-export-lazy-isolation'), 'default check includes 4K-6U checker');
check(pkg.scripts?.['check:all']?.includes('check:report-export-lazy-isolation'), 'full check includes 4K-6U checker');
check(pkg.scripts?.['check:all:critical']?.includes('check:report-export-lazy-isolation'), 'critical check includes 4K-6U checker');

// Lightweight runtime: fallback -> registry -> canonical facade. No heavy dynamic import.
function makeElement(id) {
  return {
    id,
    style: {},
    value: '',
    innerHTML: '',
    innerText: '',
    textContent: '',
    classList: { add() {}, remove() {} },
    insertAdjacentHTML(_position, html) { this.innerHTML += html; },
  };
}
const elements = new Map();
for (const id of [
  'toastMessage', 'excelExportModal', 'excel_periodType', 'excel_periodValue',
  'taxPeriodType', 'taxPeriodValue', 'mobileMenuSheet', 'mmsAdminBtn',
  'monthlyReminder', 'mrPrevMonth', 'taxExportModal', 'comboModal', 'profileModal',
]) elements.set(id, makeElement(id));
elements.get('excel_periodType').value = 'quarter';
elements.get('taxPeriodType').value = 'half';

globalThis.window = globalThis;
globalThis.document = {
  getElementById: (id) => elements.get(id) || null,
  createElement: () => makeElement('created'),
  body: { appendChild() {}, removeChild() {} },
  execCommand: () => true,
};
globalThis.localStorage = { getItem: () => null, setItem() {} };
Object.defineProperty(globalThis, 'navigator', { value: { clipboard: { writeText: async () => {} } }, configurable: true });
globalThis.alert = () => {};
globalThis.userRole = 'admin';

try {
  vm.runInThisContext(fallback, { filename: 'js/legacy/legacyUiFallbacks.js' });
  const fallbackRefs = Object.fromEntries(reportGlobals.map((name) => [name, globalThis[name]]));
  const registryModule = await import(pathToFileURL(path.join(root, 'js/core/globalOwnershipRegistry.js')).href);
  const facadeModule = await import(pathToFileURL(path.join(root, facadePath)).href);
  registryModule.initGlobalOwnershipRegistry();
  const registration = facadeModule.registerReportExportFacade();
  check(registration.ok, 'runtime facade registers all report globals');
  check(globalThis.openExcelExportModal() === true, 'canonical facade opens Excel modal');
  check(elements.get('excelExportModal').style.display === 'flex', 'Excel modal becomes visible');
  check((elements.get('excel_periodValue').innerHTML.match(/<option/g) || []).length === 4, 'quarter selector renders four options');
  check(globalThis.updateTaxPeriodOptions() === true, 'tax period selector updates');
  check(elements.get('taxPeriodValue').innerHTML.includes('6 tháng cuối'), 'tax half-year options remain compatible');
  await globalThis.copyAttReport('Võ sinh A', 8, 1, 0, '6/2026');
  check(globalThis.ReportExportFacade.getMetrics().reportsModuleRequested === false, 'UI/copy actions do not load heavy reports');
  globalThis.userRole = 'viewer';
  await globalThis.executeExcelExport();
  check(globalThis.ReportExportFacade.getMetrics().reportsModuleRequested === false, 'viewer export is blocked before heavy module import');

  // Load the heavy module without executing an export. Its temporary global
  // assignments must be captured in ReportsModule and then restored to facade.
  globalThis.userRole = 'admin';
  const canonicalBeforeLazyLoad = Object.fromEntries(reportGlobals.map((name) => [name, globalThis[name]]));
  const reportsApi = await globalThis.ReportExportFacade.ensureReportsApi();
  check(!!reportsApi && typeof reportsApi.executeExcelExport === 'function', 'heavy reports module initializes successfully on first demand');
  check(globalThis.ReportExportFacade.getMetrics().reportsModuleReady === true, 'facade reports heavy module ready after lazy init');
  check(reportGlobals.every((name) => globalThis[name] === canonicalBeforeLazyLoad[name]), 'facade restores every canonical global after lazy module initialization');

  // Simulate 10,500 monthly attendance documents to prove the old 10,000 cap
  // is gone and cursor pagination returns every document.
  let attendancePage = 0;
  const attendanceTotal = 10500;
  globalThis._fb_init = {
    collection: (...args) => ({ kind: 'collection', args }),
    query: (ref, ...constraints) => ({ ref, constraints }),
    where: (...args) => ({ kind: 'where', args }),
    orderBy: (...args) => ({ kind: 'orderBy', args }),
    documentId: () => '__name__',
    limit: (size) => ({ kind: 'limit', size }),
    startAfter: (cursor) => ({ kind: 'startAfter', cursor }),
    getDocs: async () => {
      const start = attendancePage * 1000;
      const end = Math.min(start + 1000, attendanceTotal);
      attendancePage += 1;
      const docs = Array.from({ length: Math.max(0, end - start) }, (_, index) => {
        const id = `att-${start + index}`;
        return { id, data: () => ({ month: '2026-06', profileId: `p-${start + index}`, status: 1 }) };
      });
      return { empty: docs.length === 0, docs };
    },
  };
  const attendanceModule = await import(pathToFileURL(path.join(root, attendancePath)).href);
  const paginatedAttendance = await attendanceModule.loadAttendanceMonthPaginated({ db: {}, clubId: 'club-test', month: '2026-06' });
  check(paginatedAttendance.items.length === attendanceTotal, 'attendance pagination loads all 10,500 documents');
  check(paginatedAttendance.pages === 11 && paginatedAttendance.truncated === false, 'attendance pagination completes after 11 pages without truncation');

  const snapshot = globalThis.GlobalOwnershipRegistry.getSnapshot();
  const owned = snapshot.registered.filter((item) => reportGlobals.includes(item.name));
  check(owned.length === 10, 'all ten report globals have canonical owners');
  check(owned.every((item) => item.owner === 'js/modules/reports/reportExportFacade.js' && item.installed), 'all report owners remain installed');
  check(snapshot.collisions.length === 0, 'report ownership introduces no collision');
  check(reportGlobals.every((name) => globalThis.GlobalOwnershipRegistry.getLegacyFallback(name) === fallbackRefs[name]), 'all report rollback references are preserved');
} catch (error) {
  failures.push(`runtime simulation failed: ${error?.stack || error}`);
}

for (const message of passes) console.log('✅', message);
if (failures.length) {
  console.error(`\n❌ Phase 4K-6U check failed (${failures.length})`);
  failures.forEach((message) => console.error('FAIL:', message));
  process.exit(1);
}
console.log(`\n✅ Phase 4K-6U check passed (${passes.length} assertions)\n`);
