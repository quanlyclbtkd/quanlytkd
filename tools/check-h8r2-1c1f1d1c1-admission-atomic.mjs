import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const studentsSrc = fs.readFileSync('js/modules/students.js', 'utf8');
const appSrc = fs.readFileSync('app.js', 'utf8');
const start = studentsSrc.indexOf('window.addNewStudent = async () => {');
const end = studentsSrc.indexOf('// XEM / SỬA HỒ SƠ', start);
const helpersStart = studentsSrc.indexOf('function _admissionAmount(');
const helpersEnd = studentsSrc.indexOf('// ════════════════════════════════════════════════════════════════\n// MODULE-LEVEL STATE');
assert.ok(start > 0 && end > start && helpersStart >= 0 && helpersEnd > helpersStart, 'cannot isolate canonical admission handler');
const helpers = studentsSrc.slice(helpersStart, helpersEnd);

const bundleStart = appSrc.indexOf('window.buildPaymentBundleTransaction = function(payload) {');
const bundleEnd = appSrc.indexOf('// Phase 12: expandTransactionComponentsForAccounting', bundleStart);
assert.ok(bundleStart > 0 && bundleEnd > bundleStart, 'cannot isolate canonical payment bundle builder');
const bundleBuilder = appSrc.slice(bundleStart, bundleEnd);

globalThis.window = {
  __store: {
    db: {}, clubId: 'club-A',
    colRef: { path: 'clubs/club-A/transactions' },
    invRef: { path: 'clubs/club-A/inventory' },
    profiles: {},
  },
};
const { StudentService } = await import('../js/services/students.service.js');
const { InventoryService } = await import('../js/services/inventory.service.js');
const { FinanceService } = await import('../js/services/finance.service.js');
await import('../js/core/tuitionDebtCanonical.js');

let idCounter = 0;
let commits = 0;
let rejectCommit = false;
let deferCommit = null;
let afterCommitHook = null;
const primary = new Map();
const toasts = [];
const secondary = [];
const receiptCalls = [];

window._fb_init = {
  doc: (...args) => ({
    path: args.length === 1 ? `${args[0].path}/${++idCounter}` : args.slice(1).join('/'),
    id: args.length === 1 ? String(idCounter) : String(args.at(-1)),
  }),
  increment: n => ({ increment: n }),
  writeBatch() {
    const ops = [];
    return {
      set(ref, payload, options) { ops.push({ ref, payload, options }); },
      async commit() {
        commits++;
        if (deferCommit) await deferCommit.promise;
        if (rejectCommit) throw new Error('batch rejected');
        for (const op of ops) primary.set(op.ref.path, op.payload);
        if (afterCommitHook) afterCommitHook();
      },
    };
  },
};

const defaults = {
  add_name:'A', add_date:'2026-09-21', add_fee_actual:'100000', add_fee_display:'100.000',
  add_fee_default_actual:'100000', add_fee_default_display:'100.000', add_uniform_size:'',
  add_uniform_actual:'0', add_uniform_display:'0', add_uniform_gift:false,
  add_package:'1', add_memberId:'M1', add_belt:'Trắng', add_dob:'', add_gender:'Nam',
  add_cccd:'', add_phone:'', add_notes:'', add_nickname:'', add_shift:'',
  add_discount:false, add_discount_pct:'10', add_branch:'CS1',
};
const elements = Object.fromEntries(Object.entries(defaults).map(([id, value]) => [id, {
  value: typeof value === 'boolean' ? '' : String(value),
  checked: value === true,
  style: {}, focus() {},
  options: id === 'add_uniform_size' ? [{ value:'' }, { value:'S' }, { value:'M' }] : [],
}]));
let branchCount = 1;

const sandbox = {
  window,
  document: {
    getElementById: id => elements[id] || null,
    querySelectorAll: () => [],
  },
  _profiles: () => window.__store.profiles,
  _config: () => ({ branchCount }),
  _db: () => window.__store.db,
  StudentService,
  InventoryService,
  FinanceService,
  _recordStudentSecondaryFailure: (...args) => secondary.push(args),
  _canonicalTxPayload: d => d && typeof d === 'object' ? { ...d } : d,
  getLocalToday: () => '2026-09-21',
  alert: () => {},
  setTimeout: () => {},
  console,
  Date,
};

window.userRole = 'admin';
window.showToast = s => toasts.push(String(s));
window.closeAddModal = () => {};
window.buildAdmissionTuitionPackage = (date, count) => {
  const months = Array.from({ length: count }, (_, i) => {
    const d = new Date(Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1 + i, 1));
    return d.toISOString().slice(0, 7);
  });
  return {
    packageCount: count,
    startMonth: months[0],
    months,
    lastMonth: months.at(-1),
    label: months.join(', '),
    monthsStr: months.join(','),
  };
};
window.exportReceipt = async (...args) => { receiptCalls.push(args); return { ok: true }; };
window.mergeInventoryIntoRuntimeStore = () => {};
window.notifyInventoryMutation = () => {};
window.mergeTransactionIntoRuntimeStore = () => {};
window.updateActiveNewStudentCountBadge = () => {};
window.resetActiveRenderLimit = () => {};
window.refreshListsComputation = () => {};
window.invalidateList = () => {};

vm.createContext(sandbox);
vm.runInContext(bundleBuilder, sandbox, { filename:'app.js:buildPaymentBundleTransaction' });
vm.runInContext(helpers + '\nlet _addStudentInProgress = false;\n' + studentsSrc.slice(start, end), sandbox, { filename:'students.js:admission' });

function set(id, value) {
  if (typeof value === 'boolean') elements[id].checked = value;
  else elements[id].value = String(value);
}
function resetForm() {
  for (const [id, value] of Object.entries(defaults)) {
    if (typeof value === 'boolean') elements[id].checked = value;
    else elements[id].value = String(value);
  }
}
function resetCase() {
  primary.clear();
  commits = 0;
  rejectCommit = false;
  deferCommit = null;
  afterCommitHook = null;
  toasts.length = 0;
  secondary.length = 0;
  receiptCalls.length = 0;
  window.__store.profiles = {};
  window.userRole = 'admin';
  window.exportReceipt = async (...args) => { receiptCalls.push(args); return { ok: true }; };
  window.mergeInventoryIntoRuntimeStore = () => {};
  window.notifyInventoryMutation = () => {};
  window.mergeTransactionIntoRuntimeStore = () => {};
  window.closeAddModal = () => {};
  window.updateActiveNewStudentCountBadge = () => {};
  window.resetActiveRenderLimit = () => {};
  window.refreshListsComputation = () => {};
  window.invalidateList = () => {};
  branchCount = 1;
  resetForm();
}
function entries(collectionName) {
  return [...primary.entries()].filter(([key]) => key.includes('/' + collectionName + '/'));
}
function onlyPayload(collectionName) {
  const xs = entries(collectionName);
  assert.equal(xs.length, 1, `expected one ${collectionName}, got ${xs.length}: ${JSON.stringify([...primary.keys()])}`);
  return xs[0][1];
}
function txObjects() {
  return entries('transactions').map(([path, payload]) => ({ id:path.split('/').at(-1), ...payload }));
}
function debtFor(profile, transactions = txObjects()) {
  return window.TuitionDebtCanonical.computeProfileDebt(profile, '2026-09', { name:'A', transactions });
}
function assertUnpaidAdmission(profile, transactions = txObjects()) {
  assert.equal(String(profile.paidUntil || ''), '');
  assert.deepEqual(Array.from(profile.paidMonths || []), []);
  assert.notEqual(profile.feeExempt, true);
  assert.equal('lastAdmissionTuitionMonths' in profile, false);
  assert.equal('lastAdmissionTuitionStartMonth' in profile, false);
  assert.equal('tuitionPackageCount' in profile, false);
  const debt = debtFor(profile, transactions);
  assert.ok(debt.chargeableMonths.includes('2026-09'), JSON.stringify(debt));
  assert.equal(debt.shouldAppearInDebtBeforeRender, true, JSON.stringify(debt));
  assert.equal(window.TuitionDebtCanonical.getTuitionMonthSettlement(profile, '2026-09', { name:'A', transactions }).paid, false);
}
function pass(id, text) { console.log(`PASS ${id} — ${text}`); }
function deferred() { let release; const promise = new Promise(r => { release = r; }); return { promise, release }; }

// F01-F04 — positive tuition packages remain exact and atomic.
for (const [id, count] of [['F01',1],['F02',3],['F03',6],['F04',12]]) {
  resetCase(); set('add_package', count); set('add_fee_actual', 100000 * count);
  await window.addNewStudent();
  assert.equal(commits, 1);
  const profile = onlyPayload('profiles');
  const tx = onlyPayload('transactions');
  assert.equal(profile.paidMonths.length, count);
  assert.equal(profile.paidUntil, profile.paidMonths.at(-1));
  assert.equal(tx.components.length, 1);
  assert.equal(tx.components[0].kind, 'tuition');
  assert.deepEqual(Array.from(tx.components[0].packageMonths), Array.from(profile.paidMonths));
  pass(id, `paid tuition package ${count} month(s)`);
}

// F05 — tuition + paid uniform is one canonical bundle with two-way identity.
resetCase(); set('add_uniform_size','S'); set('add_uniform_actual',50000);
await window.addNewStudent();
assert.equal(commits,1);
assert.equal(entries('profiles').length,1); assert.equal(entries('inventory').length,1); assert.equal(entries('transactions').length,1);
{
  const [invPath, inv] = entries('inventory')[0];
  const [txPath, tx] = entries('transactions')[0];
  assert.equal(tx.amount,150000);
  assert.equal(tx.components.length,2);
  assert.equal(inv.paidTxId,txPath.split('/').at(-1));
  assert.equal(inv.paymentBundleId,txPath.split('/').at(-1));
  assert.equal(tx.components.find(c => c.kind === 'inventory').relatedInvId,invPath.split('/').at(-1));
}
pass('F05','tuition + paid uniform atomic canonical bundle');

// F06 — tuition + gifted uniform keeps gift tx separate, tuition evidence only from tuition.
resetCase(); set('add_uniform_size','S'); set('add_uniform_gift',true); set('add_uniform_actual',0);
await window.addNewStudent();
assert.equal(commits,1);
assert.equal(entries('inventory').length,1); assert.equal(entries('transactions').length,2);
{
  const profile = onlyPayload('profiles');
  assert.deepEqual(Array.from(profile.paidMonths),['2026-09']);
  const txs = txObjects();
  const gift = txs.find(t => t.type === 'Tặng Võ phục');
  const tuition = txs.find(t => Array.isArray(t.components) && t.components.some(c => c.kind === 'tuition'));
  assert.ok(gift && gift.amount === 0 && gift.relatedInvId);
  assert.ok(tuition && tuition.tuitionAmount === 100000);
  const inv = entries('inventory')[0][1];
  assert.equal('paidTxId' in inv,false); assert.equal('paymentBundleId' in inv,false);
}
pass('F06','tuition + gifted uniform atomic without fake paid inventory link');

// F07 — zero tuition/no uniform: profile only, debt begins at admission month.
resetCase(); set('add_fee_actual',0); set('add_package',12);
await window.addNewStudent();
assert.equal(commits,1); assert.equal(entries('profiles').length,1); assert.equal(entries('transactions').length,0); assert.equal(entries('inventory').length,0); assert.equal(receiptCalls.length,0);
assertUnpaidAdmission(onlyPayload('profiles'), []);
pass('F07','zero tuition profile-only commit remains canonical debt');

// F08 — zero tuition + paid uniform: accounting is uniform only; tuition remains debt.
resetCase(); set('add_fee_actual',0); set('add_package',12); set('add_uniform_size','S'); set('add_uniform_actual',50000);
await window.addNewStudent();
assert.equal(commits,1); assert.equal(entries('profiles').length,1); assert.equal(entries('inventory').length,1); assert.equal(entries('transactions').length,1);
{
  const profile = onlyPayload('profiles');
  const [invPath, inv] = entries('inventory')[0];
  const [txPath, tx] = entries('transactions')[0];
  assertUnpaidAdmission(profile, [{ id:txPath.split('/').at(-1), ...tx }]);
  assert.equal(tx.type,'Thu Võ phục');
  assert.equal(tx.receiptType,'Thu Võ phục');
  assert.equal(tx.txMonth,'2026-09');
  assert.equal(tx.tuitionAmount,0);
  assert.deepEqual(Array.from(tx.packageMonths || []),[]);
  assert.ok(tx.components.every(c => c.kind !== 'tuition'));
  assert.equal(tx.components.length,1); assert.equal(tx.components[0].kind,'inventory');
  assert.equal(tx.components[0].relatedInvId,invPath.split('/').at(-1));
  assert.equal(inv.paidTxId,txPath.split('/').at(-1));
  assert.equal(receiptCalls.length,1);
  assert.equal(receiptCalls[0][2],'Võ phục');
  assert.equal(receiptCalls[0][4],'');
  assert.equal(receiptCalls[0][8].length,1);
  assert.match(receiptCalls[0][8][0].label,/Võ phục/);
}
pass('F08','zero tuition + paid uniform records only uniform income/receipt');

// F09 — zero tuition + gifted uniform: gift ledger remains, no receipt, tuition remains debt.
resetCase(); set('add_fee_actual',0); set('add_uniform_size','S'); set('add_uniform_actual',0); set('add_uniform_gift',true);
await window.addNewStudent();
assert.equal(commits,1); assert.equal(entries('profiles').length,1); assert.equal(entries('inventory').length,1); assert.equal(entries('transactions').length,1); assert.equal(receiptCalls.length,0);
{
  const profile = onlyPayload('profiles');
  const txs = txObjects();
  assertUnpaidAdmission(profile,txs);
  assert.equal(txs[0].type,'Tặng Võ phục'); assert.equal(txs[0].amount,0);
  const inv = entries('inventory')[0][1]; assert.equal('paidTxId' in inv,false); assert.equal('paymentBundleId' in inv,false);
}
pass('F09','zero tuition + gifted uniform keeps tuition debt and no payment receipt');

// F10 — paid admission primary batch rejection leaves zero partial state.
resetCase(); rejectCommit=true;
await window.addNewStudent();
assert.equal(commits,1); assert.equal(primary.size,0); assert.ok(toasts.some(s => s.includes('Không thể hoàn tất')));
pass('F10','paid admission batch rejection leaves zero primary docs');

// F11 — zero-fee profile-only rejection leaves zero state.
resetCase(); set('add_fee_actual',0); rejectCommit=true;
await window.addNewStudent();
assert.equal(commits,1); assert.equal(primary.size,0);
pass('F11','zero-fee profile-only batch rejection leaves zero primary docs');

// F12 — zero-fee + paid uniform rejection leaves zero profile/inventory/tx/stats.
resetCase(); set('add_fee_actual',0); set('add_uniform_size','S'); set('add_uniform_actual',50000); rejectCommit=true;
await window.addNewStudent();
assert.equal(commits,1); assert.equal(primary.size,0);
pass('F12','zero-fee + paid uniform rejection is atomic');

// F13A — receipt failure after paid commit is secondary and non-retryable.
resetCase();
window.exportReceipt = async (...args) => { receiptCalls.push(args); throw new Error('PDF failed'); };
await window.addNewStudent();
assert.equal(commits,1); assert.equal(entries('profiles').length,1); assert.equal(entries('transactions').length,1);
assert.ok(secondary.some(s => s[0] === 'admission-receipt'));
assert.ok(toasts.some(s => s.includes('Đã ghi sổ'))); assert.ok(!toasts.some(s => s.includes('Không thể hoàn tất')));
// F13B — runtime projection failure after zero-fee commit remains secondary.
resetCase(); set('add_fee_actual',0);
let profileBacking = window.__store.profiles;
afterCommitHook = () => {
  Object.defineProperty(window.__store,'profiles',{
    configurable:true,
    get(){ return profileBacking; },
    set(){ throw new Error('UI projection failed'); },
  });
};
await window.addNewStudent();
Object.defineProperty(window.__store,'profiles',{ configurable:true, writable:true, value:profileBacking });
assert.equal(commits,1); assert.equal(entries('profiles').length,1); assert.equal(entries('transactions').length,0);
assert.ok(secondary.some(s => s[0] === 'admission-runtime-projection'));
assert.ok(!toasts.some(s => s.includes('Không thể hoàn tất')));

// F13C — zero-fee actual UI-refresh failure preserves original error and empty tx identity.
resetCase(); set('add_fee_actual',0);
window.refreshListsComputation = () => { throw new Error('F13C ui refresh failed'); };
await window.addNewStudent();
assert.equal(commits,1); assert.equal(entries('profiles').length,1); assert.equal(entries('transactions').length,0);
{
  const uiFailure = secondary.find(s => s[0] === 'admission-ui-refresh');
  assert.ok(uiFailure, 'F13C admission-ui-refresh telemetry missing');
  assert.equal(uiFailure[1]?.message, 'F13C ui refresh failed');
  assert.equal(uiFailure[2]?.transactionId, '');
  assert.notEqual(uiFailure[1]?.name, 'ReferenceError');
}
assert.equal(receiptCalls.length,0);
assert.ok(!toasts.some(s => s.includes('Không thể hoàn tất')));
assertUnpaidAdmission(onlyPayload('profiles'), []);

// F13D — paid admission UI-refresh failure keeps committed tx identity and continues to receipt.
resetCase();
window.closeAddModal = () => { throw new Error('F13D close modal failed'); };
await window.addNewStudent();
assert.equal(commits,1); assert.equal(entries('profiles').length,1); assert.equal(entries('transactions').length,1);
{
  const uiFailure = secondary.find(s => s[0] === 'admission-ui-refresh');
  const txId = entries('transactions')[0][0].split('/').at(-1);
  assert.ok(uiFailure, 'F13D admission-ui-refresh telemetry missing');
  assert.equal(uiFailure[1]?.message, 'F13D close modal failed');
  assert.equal(uiFailure[2]?.transactionId, txId);
  assert.notEqual(uiFailure[1]?.name, 'ReferenceError');
}
assert.equal(receiptCalls.length,1, 'F13D UI-refresh failure must not skip downstream receipt');
assert.ok(!toasts.some(s => s.includes('Không thể hoàn tất')));
pass('F13','receipt/runtime/UI-refresh secondary failures preserve committed primary state (F13A-F13D)');

// F14 — same-runtime double click paid admission => one commit.
resetCase();
deferCommit = deferred();
{
  const first = window.addNewStudent();
  const second = window.addNewStudent();
  deferCommit.release();
  await Promise.all([first,second]);
}
assert.equal(commits,1); assert.equal(entries('profiles').length,1); assert.equal(entries('transactions').length,1);
pass('F14','same-runtime paid double click commits once');

// F15 — same-runtime double click zero-fee => one profile commit, no tuition payment, debt remains.
resetCase(); set('add_fee_actual',0); set('add_package',12);
deferCommit = deferred();
{
  const first = window.addNewStudent();
  const second = window.addNewStudent();
  deferCommit.release();
  await Promise.all([first,second]);
}
assert.equal(commits,1); assert.equal(entries('profiles').length,1); assert.equal(entries('transactions').length,0);
assertUnpaidAdmission(onlyPayload('profiles'),[]);
pass('F15','same-runtime zero-fee double click commits once and remains debt');

console.log('ADMISSION F01-F15 PASS: 15/15');
