import assert from 'node:assert/strict';

globalThis.window = { __store: { colRef: {}, invRef: {}, profiles: {}, clubConfig: { branchCount: 1 }, clubData: { clubName:'Test' } } };
const controls = {
  excel_year: { value:'2026' }, excel_periodType:{ value:'month' },
  excel_periodValue:{ value:'9', selectedIndex:0, options:[{ text:'Tháng 9' }] },
  taxYear:{ value:'2026' }, taxPeriodType:{ value:'month' },
  taxPeriodValue:{ value:'9', selectedIndex:0, options:[{ text:'Tháng 9' }] },
  toastMessage:{ classList:{ remove(){} } },
};
globalThis.document = { getElementById: id => controls[id] || { style:{}, classList:{remove(){}} } };
globalThis.alert = () => {};
window.ensureXlsxReady = async () => true;
window.ensureInventoryForFeature = async () => true;
window.ensureAllProfilesForExport = async () => true;
window.showToast = () => {};
window._fb_init = {};
let writes = 0;
window.XLSX = { writeFile: () => { writes++; }, utils:{ book_new: () => ({}), book_append_sheet(){}, aoa_to_sheet: () => ({}) } };
window.dedupeDocsById = rows => rows;
window.FinanceService = { queryTxByPackageMonths: async () => [] };
const { initReports } = await import('../js/modules/reports.js');
initReports();

async function excelFailure(which) {
  writes = 0;
  window.loadTransactionsForDateRange = async () => which === 'date' ? Promise.reject(new Error('permission-denied')) : [];
  window.loadTransactionsForTxMonthRange = async () => which === 'month' ? Promise.reject(new Error('missing-index')) : [];
  window.FinanceService.queryTxByPackageMonths = async () => which === 'package' ? Promise.reject(new Error('page-two-failed')) : [];
  window.loadInventoryForDateRange = async () => which === 'inventory' ? Promise.reject(new Error('maxPages')) : [];
  await window.executeExcelExport();
  assert.equal(writes, 0, `${which} failure downloaded an incomplete file`);
  console.log(`PASS Excel ${which} incomplete: zero downloaded files`);
}
for (const name of ['date','month','package','inventory']) await excelFailure(name);
writes=0;
window.loadTransactionsForDateRange = async () => { throw new Error('page-two-failed'); };
await window.executeTaxExport();
assert.equal(writes,0);
console.log('PASS tax page-two failure: zero downloaded files');
