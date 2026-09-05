/**
 * Phase 4K-6V5U6H6 — Exam Export State Purity
 * Ensures report export reuses the canonical ledger without mutating runtime
 * transaction ownership and remains safe when ledger construction throws.
 */
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const reportsSrc = readFileSync(resolve(root, 'js/modules/reports.js'), 'utf8');
let pass = 0, fail = 0;
const check = (name, ok, detail='') => {
  if (ok) { pass++; console.log(`✅ ${name}`); }
  else { fail++; console.error(`❌ ${name}${detail ? ` — ${detail}` : ''}`); }
};
function exportBody() {
  const a = reportsSrc.indexOf('window.exportExamPaidList = async () => {');
  const b = reportsSrc.indexOf('// ════════════════════════════════════════════════════════════\n    // 5. updateTaxPeriodOptions', a);
  if (a < 0 || b < 0) throw new Error('exportExamPaidList body not found');
  return reportsSrc.slice(a,b);
}
const body = exportBody();
check('Exactly one canonical Exam ledger call remains in export', (body.match(/buildCanonicalExamPaymentLedger\s*\(/g)||[]).length === 1);
check('Canonical ledger receives export transactions explicitly', /buildCanonicalExamPaymentLedger\s*\(\s*\{[\s\S]*?month\s*:\s*selMonth\s*,[\s\S]*?transactions\s*:\s*allTransactions[\s\S]*?\}\s*\)/.test(body));
check('Export contains no assignment to window.__store.transactions', !/window\.__store\.transactions\s*=/.test(body));
check('Export contains no delete of window.__store.transactions', !/delete\s+window\.__store\.transactions/.test(body));
check('Legacy _prevTxs temporary mutation token removed', !body.includes('_prevTxs'));
check('No second Exam ledger implementation introduced in reports module', !/function\s+buildCanonicalExamPaymentLedger|(?:const|let|var)\s+buildCanonicalExamPaymentLedger\s*=/.test(reportsSrc));
check('Exam export adds no direct Firestore profile reader/listener', !/\b(?:getDoc|getDocs|onSnapshot)\s*\([^\n]*profiles/i.test(body));

// Dynamic failure-purity harness against the real reports module.
globalThis.window = {};
globalThis.document = { getElementById(id) { return id === 'filterMonth' ? { value: '2026-08' } : null; } };
globalThis.alert = () => {};
window.document = document;
window.ensureXlsxReady = async () => true;
window.__reportsModuleMetrics = { examPaidExportCalls:0 };
window.__store = {
  profiles: {
    'Student 1': { status:'active', branch:'CS1', belt:'Đai trắng - Cấp 10' }
  },
  transactions: [{ id:'ORIGINAL' }],
  clubConfig: { branchCount:1 },
  clubData: { clubName:'Test Club' }
};
const originalRef = window.__store.transactions;
window.getAppContext = () => ({
  allProfiles: window.__store.profiles,
  allTransactions: window.__store.transactions,
  clubConfig: window.__store.clubConfig,
  clubData: window.__store.clubData,
  colRef: {}
});
window.loadTransactionsForTxMonthRange = async () => [{ id:'EXPORT', studentName:'Student 1', type:'Lệ phí thi', amount:250000, txMonth:'2026-08' }];
window.loadTransactionsForDateRange = async () => [];
window.dedupeDocsById = rows => rows;
window.classifyProfileStatus = p => p.status === 'quit' ? 'quit' : 'active';
window.BELT_NEXT = { 'Đai trắng - Cấp 10':'Đai trắng 1 vạch - Cấp 9' };
window.BranchIdentity = { normalize:v => String(v||'CS1') };
window.getBranchNameDisplay = v => v;
window.normalizeVNForSearch = s => String(s||'').toLowerCase();
let capturedTransactions = null;
window.buildCanonicalExamPaymentLedger = opts => {
  capturedTransactions = opts && opts.transactions;
  throw new Error('H6 forced ledger failure');
};
window.XLSX = {
  utils: {
    aoa_to_sheet: data => ({ __data:data }),
    book_new: () => ({ sheets:[] }),
    book_append_sheet: (wb, ws, name) => wb.sheets.push({name,ws}),
  },
  writeFile() {}
};
const mod = await import(`../js/modules/reports.js?h6purity=${Date.now()}`);
mod.initReports();
await window.exportExamPaidList();
check('E6 ledger failure leaves window.__store.transactions reference unchanged', window.__store.transactions === originalRef);
check('E6 ledger received loaded export subset without global mutation', Array.isArray(capturedTransactions) && capturedTransactions[0]?.id === 'EXPORT');

console.log(`\nExam Export State Purity: ${pass}/${pass+fail} PASS`);
if (fail) process.exit(1);
