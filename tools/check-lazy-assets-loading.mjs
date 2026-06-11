#!/usr/bin/env node
import fs from 'node:fs';

const fail = [];
const read = (p) => fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
const index = read('index.html');
const app = read('app.js');
const dashboard = read('js/modules/dashboard.js');
const reports = read('js/modules/reports.js');
const finance = read('js/modules/finance.js');
const bootstrap = read('js/core/lazyAssetsBootstrap.js');
const main = read('js/main.js');
const pkg = JSON.parse(read('package.json'));

function assert(cond, msg) { if (!cond) fail.push(msg); }

assert(!/<script\s+src=["'][^"']*xlsx-js-style/i.test(index), 'xlsx-js-style must not be loaded eagerly from index.html');
assert(!/<script\s+src=["'][^"']*chart\.js/i.test(index), 'Chart.js must not be loaded eagerly from index.html');
assert(/ensureXlsxReady/.test(bootstrap), 'bootstrap must define ensureXlsxReady');
assert(/ensureChartJsReady/.test(bootstrap), 'bootstrap must define ensureChartJsReady');
assert(/ensureXlsxReady\?\.\('download-excel-template'\)/.test(app), 'downloadExcelTemplate must call ensureXlsxReady');
assert(/ensureXlsxReady\?\.\('import-students-excel'\)/.test(app), 'handleImportExcel must call ensureXlsxReady');
assert(/ensureXlsxReady\?\.\('export-attendance-excel'\)/.test(app), 'exportAttendanceExcel must call ensureXlsxReady');
assert(/ensureXlsxReady\?\.\('reports-excel-export'\)/.test(reports), 'Reports executeExcelExport must call ensureXlsxReady');
assert(/ensureXlsxReady\?\.\('reports-export-exam-paid-list'\)/.test(reports), 'Reports exportExamPaidList must call ensureXlsxReady');
assert(/ensureXlsxReady\?\.\('reports-tax-export'\)/.test(reports), 'Reports executeTaxExport must call ensureXlsxReady');
assert(/ensureXlsxReady\?\.\('reports-achievements-export'\)/.test(reports), 'Reports exportAchievementsExcel must call ensureXlsxReady');
assert(/ensureXlsxReady\?\.\('finance-excel-export'\)/.test(finance), 'Finance executeExcelExport must call ensureXlsxReady');
assert(/ensureChartJsReady\('dashboard-render-charts'\)/.test(dashboard), 'dashboard module must lazy-load Chart.js');
assert(/ensureChartJsReady\?\.\('legacy-dashboard/.test(app), 'legacy dashboard chart path must lazy-load Chart.js');
assert(/debugLazyAssetsLoading/.test(main), 'debugRuntimeSmokeTest must include debugLazyAssetsLoading');
assert(pkg.scripts['check:mobile-startup-performance'], 'package.json missing check:mobile-startup-performance');
assert(pkg.scripts['check:lazy-assets-loading'], 'package.json missing check:lazy-assets-loading');
assert(/check:mobile-startup-performance/.test(pkg.scripts.check || ''), 'npm run check must include mobile startup check');
assert(/check:lazy-assets-loading/.test(pkg.scripts.check || ''), 'npm run check must include lazy assets check');

if (fail.length) {
  console.error('❌ check-lazy-assets-loading failed:');
  fail.forEach((f, i) => console.error(`${i + 1}. ${f}`));
  process.exit(1);
}
console.log('✅ check-lazy-assets-loading passed');
