import fs from 'node:fs';
import vm from 'node:vm';

const reportsSrc = fs.readFileSync('js/modules/reports.js', 'utf8');
const appSrc = fs.readFileSync('app.js', 'utf8');
let pass = 0, fail = 0;
const check = (name, ok, detail='') => {
  if (ok) { pass++; console.log(`✅ ${name}`); }
  else { fail++; console.error(`❌ ${name}${detail ? ` — ${detail}` : ''}`); }
};

function extractAssignedFunction(src, prefix) {
  const start = src.indexOf(prefix);
  if (start < 0) throw new Error(`Missing ${prefix}`);
  const brace = src.indexOf('{', start);
  let depth=0, quote='', esc=false;
  for (let i=brace; i<src.length; i++) {
    const ch=src[i];
    if (quote) {
      if (esc) esc=false;
      else if (ch==='\\') esc=true;
      else if (ch===quote) quote='';
      continue;
    }
    if (ch==='"' || ch==="'" || ch==='`') { quote=ch; continue; }
    if (ch==='{') depth++;
    else if (ch==='}') { depth--; if (depth===0) return src.slice(start, src.indexOf(';', i)+1); }
  }
  throw new Error('unclosed function');
}

function extractExportBody() {
  const start = reportsSrc.indexOf('window.exportExamPaidList = async () => {');
  const end = reportsSrc.indexOf('// ════════════════════════════════════════════════════════════\n    // 5. updateTaxPeriodOptions', start);
  return reportsSrc.slice(start, end);
}
const exportBody = extractExportBody();

// Static contract
check('Compatibility public API exportExamPaidList remains one owner', (reportsSrc.match(/window\.exportExamPaidList\s*=\s*async/g)||[]).length === 1);
check('Full roster builder reads canonical profiles RAM state', exportBody.includes('const allProfiles = _profiles();') && exportBody.includes('buildExamFullRosterDataForExport'));
check('Export still joins through canonical exam payment ledger', exportBody.includes('window.buildCanonicalExamPaymentLedger({ month: selMonth })'));
check('Zero-paid abort was removed', !exportBody.includes('Không có võ sinh nào ĐÃ NỘP'));
check('Only true zero-active roster aborts export', exportBody.includes('Không có võ sinh đang tập để xuất danh sách.'));
check('Unpaid target belt uses existing BELT_NEXT authority', exportBody.includes('beltNext: window.BELT_NEXT || {}'));
check('Per-row fee status has paid and unpaid variants', exportBody.includes('✔ Đã nộp phí') && exportBody.includes('✖ Chưa nộp phí'));
check('Summary includes total/paid/unpaid/collected amount', ['Tổng võ sinh:', 'Đã nộp phí:', 'Chưa nộp phí:', 'Tổng lệ phí đã thu:'].every(x => exportBody.includes(x)));
check('Branch sheets are built from full roster, not paid-only data', exportBody.includes('Object.keys(examRosterData).forEach') && exportBody.includes('branchSubset[name] = examRosterData[name]'));
check('Existing belt sorter remains canonical buildSheet sorter', exportBody.includes('const sortedEntries = sortExamExportEntries(_entries)') && !exportBody.includes('Object.keys(subset).sort()'));
check('No direct profile Firestore reader added to exam export', !/getDocs?\s*\([^)]*profiles/i.test(exportBody) && !/onSnapshot\s*\([^)]*profiles/i.test(exportBody));

// Browser-like export harness with real reports module + real canonical ledger source.
globalThis.window = {};
globalThis.alert = () => {};
globalThis.document = { getElementById(id) { if (id === 'filterMonth') return { value:'2026-08' }; return null; } };
window.document = document;
const mod = await import(`../js/modules/reports.js?h5=${Date.now()}`);
const ledgerAssignment = extractAssignedFunction(appSrc, 'window.buildCanonicalExamPaymentLedger = function(options)');
vm.runInThisContext(ledgerAssignment);

window.ensureXlsxReady = async () => true;
window.classifyProfileStatus = p => (p.status === 'quit' || p.active === false || p.isActive === false ? 'quit' : 'active');
window.BELT_NEXT = {
  'Đai trắng - Cấp 10': 'Đai trắng 1 vạch - Cấp 9',
  'Đai vàng - Cấp 7': 'Đai xanh lá - Cấp 6',
};
window.BranchIdentity = { normalize: v => (v === 'Mặc định' ? 'CS1' : String(v || 'CS1')) };
window.getBranchNameDisplay = code => code;
window.normalizeVNForSearch = s => String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
window.__store = {};
window.getAppContext = () => ({
  allProfiles: window.__store.profiles || {},
  allTransactions: window.__store.transactions || [],
  clubConfig: window.__store.clubConfig || {},
  clubData: window.__store.clubData || {},
  colRef: {},
});
window.loadTransactionsForTxMonthRange = async () => window.__store.transactions || [];
window.loadTransactionsForDateRange = async () => [];
window.dedupeDocsById = docs => docs;

function makeXlsxCapture() {
  const capture = { wb:null, filename:'' };
  window.XLSX = {
    utils: {
      aoa_to_sheet: data => ({ __data:data }),
      book_new: () => ({ sheets:[] }),
      book_append_sheet: (wb, ws, name) => wb.sheets.push({ name, ws }),
    },
    writeFile: (wb, filename) => { capture.wb=wb; capture.filename=filename; },
  };
  return capture;
}
mod.initReports();

function mkProfiles(active=10, quit=0, branches=1) {
  const p={};
  for (let i=1;i<=active;i++) p[`Student ${i}`] = { status:'active', branch:`CS${((i-1)%branches)+1}`, belt:'Đai trắng - Cấp 10', memberId:`M${i}` };
  for (let i=1;i<=quit;i++) p[`Quit ${i}`] = { status:'quit', branch:'CS1', belt:'Đai trắng - Cấp 10' };
  return p;
}
function directTx(name, amount=250000, extra={}) { return { id:`tx-${name}`, studentName:name, type:'Lệ phí thi', amount, txMonth:'2026-08', timestamp:1, examTargetBelt:'Đai trắng 1 vạch - Cấp 9', ...extra }; }
function setup({ profiles, transactions=[], branchCount=1 }) {
  window.__store.profiles=profiles;
  window.__store.transactions=transactions;
  window.__store.clubConfig={ branchCount };
  window.__store.clubData={ clubName:'Test Club' };
  const cap=makeXlsxCapture();
  let alerts=[]; globalThis.alert=window.alert=(m)=>alerts.push(String(m));
  return { cap, alerts };
}
async function runScenario(opts) {
  const env=setup(opts);
  await window.exportExamPaidList();
  return env;
}
function sheetByName(cap,name){ return cap.wb?.sheets.find(s=>s.name===name); }
function studentRows(sheet){
  if(!sheet) return [];
  const rows=sheet.ws.__data;
  const out=[];
  for(let i=4;i<rows.length;i++) {
    const v=rows[i]?.[0]?.v;
    if (v === 'TỔNG CỘNG') break;
    out.push(rows[i]);
  }
  return out;
}
const v=(cell)=>cell?.v;

// E1 10 active / 3 paid / 7 unpaid
{
  const profiles=mkProfiles(10,0,1);
  const tx=[directTx('Student 1'),directTx('Student 2'),directTx('Student 3')];
  const {cap}=await runScenario({profiles,transactions:tx});
  const rows=studentRows(sheetByName(cap,'DS_ToanBo'));
  const paid=rows.filter(r=>String(v(r[9])).startsWith('✔')).length;
  const unpaid=rows.filter(r=>String(v(r[9])).startsWith('✖')).length;
  check('E1 10 active / 3 paid / 7 unpaid exports 10 rows', rows.length===10 && paid===3 && unpaid===7, `${rows.length}/${paid}/${unpaid}`);
}
// E2 zero paid still exports all active
{
  const {cap,alerts}=await runScenario({profiles:mkProfiles(10),transactions:[]});
  const rows=studentRows(sheetByName(cap,'DS_ToanBo'));
  check('E2 10 active / 0 paid exports 10 unpaid rows with no abort', rows.length===10 && rows.every(r=>String(v(r[9])).startsWith('✖')) && alerts.length===0);
}
// E3 quit excluded
{
  const {cap}=await runScenario({profiles:mkProfiles(8,2),transactions:[]});
  check('E3 8 active + 2 quit exports exactly 8 rows', studentRows(sheetByName(cap,'DS_ToanBo')).length===8);
}
// E4 direct exam fee amount
{
  const {cap}=await runScenario({profiles:mkProfiles(1),transactions:[directTx('Student 1',250000)]});
  const row=studentRows(sheetByName(cap,'DS_ToanBo'))[0];
  check('E4 direct Lệ phí thi keeps 250000 canonical exam amount', String(v(row[9])).includes('250.000'));
}
// E5 combo uses examAmount, not whole transaction amount
{
  const combo={ id:'combo', studentName:'Student 1', type:'Học phí + Lệ phí thi', amount:850000, examAmount:250000, txMonth:'2026-08', timestamp:2, examTargetBelt:'Đai trắng 1 vạch - Cấp 9' };
  const {cap}=await runScenario({profiles:mkProfiles(1),transactions:[combo]});
  const row=studentRows(sheetByName(cap,'DS_ToanBo'))[0];
  const summary=String(v(sheetByName(cap,'DS_ToanBo').ws.__data[2][0]));
  check('E5 combo uses examAmount=250000 instead of total amount', String(v(row[9])).includes('250.000') && !String(v(row[9])).includes('850.000') && summary.includes('250.000'));
}
// E6 cancelled payment is unpaid
{
  const {cap}=await runScenario({profiles:mkProfiles(1),transactions:[directTx('Student 1',250000,{examPaidCancelled:true})]});
  const row=studentRows(sheetByName(cap,'DS_ToanBo'))[0];
  check('E6 examPaidCancelled=true exports student as unpaid', String(v(row[9])).startsWith('✖'));
}
// E7 multi-branch roster
{
  const {cap}=await runScenario({profiles:mkProfiles(10,0,2),transactions:[directTx('Student 1')],branchCount:2});
  const all=studentRows(sheetByName(cap,'DS_ToanBo')).length;
  const cs1=studentRows(sheetByName(cap,'CS1_CS1')).length;
  const cs2=studentRows(sheetByName(cap,'CS2_CS2')).length;
  check('E7 multi-branch exports DS_ToanBo=10, CS1=5, CS2=5', all===10 && cs1===5 && cs2===5, `${all}/${cs1}/${cs2}`);
}
// E8 unpaid next belt from BELT_NEXT
{
  const {cap}=await runScenario({profiles:mkProfiles(1),transactions:[]});
  const row=studentRows(sheetByName(cap,'DS_ToanBo'))[0];
  check('E8 unpaid target belt comes from existing BELT_NEXT', v(row[7])==='Đai trắng 1 vạch - Cấp 9', String(v(row[7])));
}
// E9 direct active roster builder has no Firebase API calls
{
  const fnSrc=reportsSrc.slice(reportsSrc.indexOf('export function buildExamFullRosterDataForExport'), reportsSrc.indexOf('// ── Phase 4K-4D', reportsSrc.indexOf('export function buildExamFullRosterDataForExport')));
  check('E9 full roster builder performs zero Firebase reads/listeners', !/\b(?:getDoc|getDocs|onSnapshot|collection|query)\s*\(/.test(fnSrc));
}
// E10 existing belt sort contract remains wired
check('E10 full roster buildSheet still routes through existing belt sorter', /const sortedEntries = sortExamExportEntries\(_entries\)/.test(exportBody));

console.log(`\nExam Full Roster Export: ${pass}/${pass+fail} PASS`);
if (fail) process.exit(1);
