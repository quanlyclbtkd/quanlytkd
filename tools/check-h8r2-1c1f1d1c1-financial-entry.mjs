import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

// Actual production handlers and canonical settlement, with primary I/O mocked.
globalThis.window = globalThis;
window.location = { hostname: 'example.test' };
window.userRole = 'admin';
window.currentUserEmail = 'qa@example.test';
window.__store = {
  clubId: 'club-A', currentUser: { uid: 'u1', email: 'qa@example.test' },
  clubConfig: { branchCount: 2 }, profiles: {}, transactions: [], inventory: []
};
window.__verifiedAuthContextState = { uid: 'u1', generation: 1 };
window.studentProfileStore = { mergeProfile: () => {} };
window.showToast = () => {};
window.recordRuntimeError = () => {};
window.recordFinancialActionAudit = () => {};
window.StudentStatusCommandBoundary = {
  addSkippedMonth: async () => {}, removeSkippedMonth: async () => {}, markQuit: async () => {}
};
window._fb_init = { arrayUnion: (...items) => ({ __arrayUnion: items }) };
const elements = {};
const element = (value = '') => ({
  value, checked: false, dataset: {}, style: {}, options: [],
  reset() { this.resets = (this.resets || 0) + 1; }
});
for (const id of [
  'transactionForm', 'type', 'description', 'amountActual', 'date', 'branch',
  'tx_package', 'tx_exam_amountActual', 'tx_exam_title', 'tx_discount',
  'tx_discount_pct', 'tx_discount_saved', 'comboModal', 'expenseForm',
  'examExpenseForm', 'filterMonth', 'exp_branch', 'exp_desc',
  'exp_amountActual', 'exp_date', 'ee_desc', 'ee_amountActual',
  'eexp_txId', 'eexp_branch', 'eexp_desc', 'eexp_amountActual',
  'eexp_date', 'editExpModal'
]) elements[id] = element();
elements.tx_package.options = ['1', '3', '6', '12'].map(value => ({ value }));
elements.type.options = ['Học phí', 'Học phí + Lệ phí thi', 'Thu khác'].map(value => ({ value }));
elements.branch.options = ['CS1', 'CS2', 'CS3'].map(value => ({ value }));
globalThis.document = { getElementById: id => elements[id] || null };
globalThis.alert = () => {};
globalThis.confirm = () => true;
let primary = 0;
let receipts = 0;
window.exportReceipt = async () => { receipts++; return { ok: true }; };
window.toggleTxFormType = () => {};
vm.runInThisContext(fs.readFileSync('js/core/tuitionDebtCanonical.js', 'utf8'), { filename: 'tuitionDebtCanonical.js' });
const { FinanceService } = await import('../js/services/finance.service.js?v=long-term-production-stability-20260917-v5u6h8r2');
window.FinanceService = FinanceService;
FinanceService.addTransaction = async () => { primary++; return 'tx-1'; };
FinanceService.commitAtomicWritePlan = async () => { primary++; return { txIds: ['tx-1'] }; };
FinanceService.addFeeAuditSilent = async () => {};
const { TuitionCommandBoundary } = await import('../js/core/tuitionCommandBoundary.js');
window.TuitionCommandBoundary = TuitionCommandBoundary;
const { initFinancialActionAuditGuard } = await import('../js/core/financialActionAuditGuard.js');
initFinancialActionAuditGuard();
const realGuard = window.guardFinancialWriteIntent;
const realNormalizer = window.isFinancialWriteAllowed;
let passed = 0;
const test = async (label, fn) => {
  try { await fn(); passed++; console.log('PASS', label); }
  catch (error) { console.error('FAIL', label, error); process.exitCode = 1; }
};
const profile = () => ({ profileId: 'P-A', branch: 'CS1', paidUntil: '2026-08',
  paidMonths: ['2026-08'], skippedMonths: [], tuitionFee: 100000 });
const reset = () => {
  primary = 0; receipts = 0; window.userRole = 'admin'; window.__store.clubId = 'club-A';
  window.__store.profiles = { A: profile() }; window.allProfiles = window.__store.profiles;
  window.guardFinancialWriteIntent = realGuard;
  window.isFinancialWriteAllowed = realNormalizer;
  delete elements.transactionForm.dataset.atomicSubmitInFlight;
};
async function blockedTuition(label, guard, normalizer, values = {}) {
  await test(label, async () => {
    reset(); window.guardFinancialWriteIntent = guard; window.isFinancialWriteAllowed = normalizer;
    try { await TuitionCommandBoundary.collectTuition({
      studentName: 'A', months: ['2026-09'], amount: 100000, ...values
    }); } catch (_) { /* rejection is safe when no primary effect occurred */ }
    assert.equal(primary, 0); assert.equal(receipts, 0);
  });
}
await blockedTuition('A01 guard missing', undefined, realNormalizer);
await blockedTuition('A02 normalizer missing', realGuard, undefined);
await blockedTuition('A03 guard throws', () => { throw Error('guard unavailable'); }, realNormalizer);
await blockedTuition('A04 boolean false', () => false, realNormalizer);
await blockedTuition('A05 structured blocked', () => ({ ok: false }), realNormalizer);
await blockedTuition('A06 malformed result', () => ({ allowed: true }), realNormalizer);
await blockedTuition('A07 unknown action', () => realGuard('nonexistent.action', { amount: 100000 }), realNormalizer);
await test('A08 missing club actual handler', async () => {
  reset(); window.__store.clubId = '';
  try { await TuitionCommandBoundary.collectTuition({ studentName: 'A', months: ['2026-09'], amount: 100000 }); } catch (_) {}
  assert.equal(primary, 0);
});
await test('A09 unauthorized role actual handler', async () => {
  reset(); window.userRole = 'viewer';
  try { await TuitionCommandBoundary.collectTuition({ studentName: 'A', months: ['2026-09'], amount: 100000 }); } catch (_) {}
  assert.equal(primary, 0);
});
await blockedTuition('B06 invalid month 2026-13', realGuard, realNormalizer, { months: ['2026-13'] });
await blockedTuition('B06b malformed month', realGuard, realNormalizer, { months: ['2026-0x'] });
await test('B valid QuickPay one primary effect', async () => {
  reset(); await TuitionCommandBoundary.collectTuition({ studentName: 'A', months: ['2026-10'], amount: 100000 });
  assert.equal(primary, 1);
});

const { initFinance } = await import('../js/modules/finance.js?v=long-term-production-stability-20260917-v5u6h8r2');
initFinance();
async function form(type, amount, date, examAmount = '', examTitle = '') {
  elements.type.value = type; elements.description.value = 'A';
  elements.amountActual.value = amount; elements.date.value = date;
  elements.branch.value = 'CS1'; elements.tx_package.value = '1';
  elements.tx_exam_amountActual.value = examAmount; elements.tx_exam_title.value = examTitle;
  await elements.transactionForm.onsubmit({ preventDefault() {}, target: elements.transactionForm });
}
await test('B02 Thu khác zero is blocked', async () => {
  reset(); await form('Thu khác', '', '2026-09-21'); assert.equal(primary, 0);
});
await test('B03 Thu khác blank date is blocked', async () => {
  reset(); await form('Thu khác', '100000', ''); assert.equal(primary, 0);
});
await test('B08 mixed Tuition+Exam invalid component is blocked', async () => {
  reset(); await form('Học phí + Lệ phí thi', '100000', '2026-09-21', '', '');
  assert.equal(primary, 0);
});
await test('B unknown type is blocked', async () => {
  reset(); await form('unregistered', '100000', '2026-09-21'); assert.equal(primary, 0);
});

// Load the production exam ledger rather than replacing its matching logic.
const appSource = fs.readFileSync('app.js', 'utf8');
const ledgerStart = appSource.indexOf('window.buildCanonicalExamPaymentLedger = function(options)');
const ledgerEnd = appSource.indexOf('// Phase 4K-5R — Helpers:', ledgerStart);
assert.ok(ledgerStart > 0 && ledgerEnd > ledgerStart);
vm.runInThisContext(appSource.slice(ledgerStart, ledgerEnd), { filename: 'app.js:exam-ledger' });
elements.filterMonth = element('2026-09');
elements.exam_fee_all_actual = element('250000');
window.BELT_NEXT = { 'Đai trắng - Cấp 10': 'Đai vàng - Cấp 9' };
window.renderExamList = () => {};
globalThis.prompt = () => '250000';
let saved = [];
window.mergeTransactionIntoRuntimeStore = tx => {
  window.__store.transactions = window.__store.transactions.filter(t => t.id !== tx.id).concat(tx);
  return true;
};
FinanceService.addTransaction = async data => {
  primary++;
  const tx = { id: 'exam-' + primary, ...data };
  saved.push(tx);
  window.mergeTransactionIntoRuntimeStore(tx);
  return tx.id;
};
await test('C01 exam valid collects once and writes through', async () => {
  reset(); saved = []; window.__store.transactions = []; window.__store.allTransactions = [];
  assert.equal(await window.quickCollectExam('A'), true);
  assert.equal(primary, 1); assert.equal(window.__store.transactions.length, 1);
  assert.equal(saved[0].txMonth, '2026-09');
});
await test('C03 immediate exam repeat before snapshot has zero new effects', async () => {
  assert.equal(await window.quickCollectExam('A'), false); assert.equal(primary, 1);
});
await test('C05 exam guard missing has zero effects', async () => {
  reset(); saved = []; window.__store.transactions = []; window.__store.allTransactions = [];
  window.guardFinancialWriteIntent = undefined;
  assert.equal(await window.quickCollectExam('A'), false); assert.equal(primary, 0);
});
await test('C02 rapid double click creates one effect', async () => {
  reset(); saved = []; window.__store.transactions = []; window.__store.allTransactions = [];
  let resolveWrite;
  FinanceService.addTransaction = data => new Promise(resolve => {
    primary++; resolveWrite = () => {
      const tx = { id: 'exam-delayed', ...data };
      window.mergeTransactionIntoRuntimeStore(tx); resolve(tx.id);
    };
  });
  const a = window.quickCollectExam('A'), b = window.quickCollectExam('A');
  assert.equal(primary, 1); resolveWrite(); await Promise.all([a, b]);
  assert.equal(primary, 1);
});

const cancelStart = appSource.indexOf('window.cancelExamPayment = async function(txId, studentName)');
const cancelEnd = appSource.indexOf('// ─── Phase 4K-4H: Debug helpers', cancelStart);
assert.ok(cancelStart > 0 && cancelEnd > cancelStart);
vm.runInThisContext(appSource.slice(cancelStart, cancelEnd), { filename: 'app.js:cancelExamPayment' });
const { TransactionDeleteIntegrity } = await import('../js/core/transactionDeleteIntegrity.js');
window.TransactionDeleteIntegrity = TransactionDeleteIntegrity;
globalThis.allTransactions = [];
globalThis.db = {};
globalThis.currentClubId = 'club-A';
let deletes = 0, updates = 0, failCancel = false;
window._fb_init.doc = (_db, ...parts) => ({ id: parts.at(-1), path: parts.join('/') });
window._fb_init.deleteDoc = async () => { if (failCancel) throw Error('rejected'); deletes++; };
window._fb_init.updateDoc = async (_ref, patch) => { if (failCancel) throw Error('rejected'); updates++; assert.deepEqual(
  Object.keys(patch).sort(), ['amount', 'examAmount', 'examPaidCancelled',
    'examPaidCancelledAt', 'examPaidCancelledBy', 'type'].sort()
); };
window.__store.db = db;
function setExamTx(tx) {
  reset(); deletes = 0; updates = 0; failCancel = false;
  window.__store.transactions = [tx]; window.__store.allTransactions = [{ ...tx }];
  allTransactions = [{ ...tx }];
}
await test('C08 pure cancel deletes and clears all local ledgers', async () => {
  setExamTx({ id: 'pure-1', type: 'Lệ phí thi', profileId: 'A', amount: 250000,
    txMonth: '2026-09', date: '2026-09-21' });
  await window.cancelExamPayment('pure-1', 'A');
  assert.equal(deletes, 1); assert.equal(updates, 0);
  assert.equal(window.__store.transactions.length, 0);
  assert.equal(window.__store.allTransactions.length, 0);
  assert.equal(allTransactions.length, 0);
});
await test('C09 repeat cancel of removed tx has zero effects', async () => {
  await window.cancelExamPayment('pure-1', 'A');
  assert.equal(deletes, 1); assert.equal(updates, 0);
});
await test('C10 mixed cancel preserves Tuition and only updates exam fields', async () => {
  setExamTx({ id: 'mix-1', type: 'Học phí + Lệ phí thi', profileId: 'A',
    tuitionAmount: 100000, examAmount: 250000, amount: 350000,
    txMonth: '2026-09', date: '2026-09-21' });
  await window.cancelExamPayment('mix-1', 'A');
  assert.equal(deletes, 0); assert.equal(updates, 1);
  for (const rows of [window.__store.transactions, window.__store.allTransactions, allTransactions]) {
    assert.equal(rows[0].amount, 100000);
    assert.equal(rows[0].type, 'Học phí');
    assert.equal(rows[0].examPaidCancelled, true);
  }
});
await test('C11 rejected cancel leaves canonical local ledgers intact', async () => {
  setExamTx({ id: 'pure-2', type: 'Lệ phí thi', profileId: 'A',
    amount: 250000, txMonth: '2026-09', date: '2026-09-21' });
  failCancel = true; await window.cancelExamPayment('pure-2', 'A');
  assert.equal(deletes, 0); assert.equal(window.__store.transactions.length, 1);
  assert.equal(window.__store.allTransactions.length, 1);
});

function expenseForm(exam, amount, date = '2026-09-21') {
  const form = elements[exam ? 'examExpenseForm' : 'expenseForm'];
  elements.filterMonth.value = date.slice(0, 7);
  elements.exp_branch.value = 'CS1'; elements.exp_desc.value = 'Tiền thuê sân';
  elements.ee_desc.value = 'Thuê sân thi';
  elements.exp_amountActual.value = amount; elements.ee_amountActual.value = amount;
  elements.exp_date.value = date;
  return form.onsubmit({ preventDefault() {}, target: form });
}
await test('E01 expense create: guard missing, zero amount, blank date have no effect', async () => {
  reset(); primary = 0; window.guardFinancialWriteIntent = undefined;
  await expenseForm(false, '50000'); assert.equal(primary, 0);
  window.guardFinancialWriteIntent = realGuard;
  await expenseForm(false, ''); await expenseForm(false, '50000', '');
  assert.equal(primary, 0);
});
await test('E02 valid expense and exam expense each create one transaction', async () => {
  reset(); primary = 0;
  FinanceService.addTransaction = async data => {
    assert.ok(['Chi phí', 'Chi phí kỳ thi'].includes(data.type)); primary++;
    return 'expense-' + primary;
  };
  await expenseForm(false, '50000'); await expenseForm(true, '250000');
  assert.equal(primary, 2);
});
await test('E03 invalid exam month and unauthorized role have no effect', async () => {
  reset(); primary = 0;
  await expenseForm(true, '250000', '2026-13-01');
  window.userRole = 'viewer'; await expenseForm(false, '50000');
  assert.equal(primary, 0);
});
await test('E04 rejected persistence leaves form intact and unlocks retry', async () => {
  reset(); primary = 0; let attempts = 0;
  FinanceService.addTransaction = async () => { attempts++; throw Error('rejected'); };
  const form = elements.expenseForm, before = form.resets || 0;
  await expenseForm(false, '50000'); await expenseForm(false, '50000');
  assert.equal(attempts, 2); assert.equal(primary, 0);
  assert.equal(form.resets || 0, before); assert.equal(form.dataset.atomicSubmitInFlight, undefined);
});
await test('E05 rapid double submit has one primary effect', async () => {
  reset(); let resolveWrite; primary = 0;
  FinanceService.addTransaction = () => new Promise(resolve => {
    primary++; resolveWrite = () => resolve('expense-one');
  });
  const first = expenseForm(false, '50000'), second = expenseForm(false, '50000');
  assert.equal(primary, 1); resolveWrite(); await Promise.all([first, second]);
});
await test('E06 edit rejects unrelated tuition and stale edit identity', async () => {
  reset(); primary = 0; updates = 0;
  window.__editingExpenseOriginal = { id: 'tuition-1', type: 'Học phí', amount: 50000,
    branch: 'CS1', description: 'A', date: '2026-09-21' };
  elements.eexp_txId.value = 'tuition-1'; elements.eexp_branch.value = 'CS1';
  elements.eexp_desc.value = 'changed'; elements.eexp_amountActual.value = '50000';
  elements.eexp_date.value = '2026-09-21';
  assert.equal(await window.saveEditExpense(), false);
  window.__editingExpenseOriginal.type = 'Chi phí'; elements.eexp_txId.value = 'other-1';
  assert.equal(await window.saveEditExpense(), false); assert.equal(updates, 0);
});
await test('E07 expense edit allowlist, one persistence and local merge', async () => {
  reset(); updates = 0; window.__editingExpenseOriginal = {
    id: 'expense-1', type: 'Chi phí', amount: 50000,
    branch: 'CS1', description: 'Old', date: '2026-09-21'
  };
  elements.eexp_txId.value = 'expense-1';
  let patch;
  window._fb_init.updateDoc = async (_ref, changes) => { updates++; patch = changes; };
  assert.equal(await window.saveEditExpense(), true);
  assert.equal(updates, 1); assert.deepEqual(Object.keys(patch).sort(),
    ['amount', 'branch', 'date', 'description'].sort());
  assert.equal(window.__store.transactions.find(x => x.id === 'expense-1')?.description, 'changed');
  assert.equal(window.__editingExpenseOriginal, null);
});
await test('E08 failed edit does not merge local state and allows retry', async () => {
  reset(); updates = 0; window.__store.transactions = [];
  window.__editingExpenseOriginal = {
    id: 'expense-2', type: 'Chi phí', amount: 50000,
    branch: 'CS1', description: 'Old', date: '2026-09-21'
  };
  elements.eexp_txId.value = 'expense-2';
  window._fb_init.updateDoc = async () => { updates++; throw Error('permission-denied'); };
  assert.equal(await window.saveEditExpense(), false);
  assert.equal(await window.saveEditExpense(), false); assert.equal(updates, 2);
  assert.equal(window.__store.transactions.length, 0);
  assert.equal(window.__editingExpenseOriginal.id, 'expense-2');
});
console.log('D1C1 financial entry:', passed, 'passed');
