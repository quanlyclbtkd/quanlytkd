#!/usr/bin/env node
let failures = 0;
function check(name, condition, details = '') {
  if (condition) console.log(`✅ ${name}`);
  else { failures++; console.error(`❌ ${name}${details ? ` — ${details}` : ''}`); }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

globalThis.window = globalThis;
window.userRole = 'admin';
window.currentUserEmail = 'admin@example.com';
window.__store = { profiles: { 'Nguyen A': { tuitionFee: 100000, paidUntil: '2026-05', paidMonths: ['2026-05'] } }, transactions: [], allTransactions: [] };
window.allProfiles = window.__store.profiles;
window.allTransactions = [];
const calls = { add:0, update:0, audit:0, del:0, query:0, updateAfterDelete:0, reconcile:0, invalidate:0, auditEvents:[] };
let failProfileUpdate = false;
let failReconcile = false;
window.FinanceService = {
  async addTransaction(data) { calls.add++; await sleep(25); calls.lastTx = data; return `tx-${calls.add}`; },
  async updateStudentPayment(name, data) { calls.update++; calls.lastProfileUpdate = {name,data}; if (failProfileUpdate) throw new Error('profile update failed'); },
  _arrayUnion(...items) { return { __arrayUnion: items }; },
  async addFeeAuditSilent(data) { calls.audit++; calls.lastAudit = data; },
  async deleteTransaction(id) { calls.del++; calls.lastDelete = id; await sleep(20); },
  async getStudentTuitionTxs() { calls.query++; return []; },
  async updateProfileAfterTxDelete(name, paidUntil, months) { calls.updateAfterDelete++; calls.lastDeleteProfile = {name,paidUntil,months}; },
};
window.studentProfileStore = { mergeProfile(name, data) { calls.mergedProfile = {name,data}; }, getAllProfilesCompat() { return window.__store.profiles; } };
window.invalidateLists = (keys, reason) => { calls.invalidate++; calls.lastInvalidation = {keys,reason}; };
window.refreshListsComputation = () => {};
window.invalidateDashboard = () => {};
window.invalidateList = () => {};
window.guardFinancialWriteIntent = () => true;
window.recordFinancialActionAudit = (action, stage, payload) => calls.auditEvents.push({action,stage,payload});
window.TransactionDeleteIntegrity = { analyzeTransactionDeleteImpact(tx) { return { hasTuition:true, requiresProfileReconcile:true, studentName:tx.description, requiresExamRefresh:false, safeToHardDelete:true, tuitionMonths:tx.packageMonths || [] }; } };
window.reconcileStudentTuitionAfterDeletedTransaction = async (name, tx, opts) => { calls.reconcile++; calls.lastReconcile = {name,tx,opts}; if (failReconcile) throw new Error('reconcile failed'); return {ok:true}; };

const mod = await import(`../js/core/tuitionCommandBoundary.js?behavior=${Date.now()}`);
mod.initTuitionCommandBoundary();
const boundary = window.TuitionCommandBoundary;

const p1 = boundary.collectTuition({ studentName:'Nguyen A', months:['2026-06','2026-07'], branch:'CS1', amount:200000 });
const p2 = boundary.collectTuition({ studentName:'Nguyen A', months:['2026-06','2026-07'], branch:'CS1', amount:200000 });
const [r1,r2] = await Promise.all([p1,p2]);
check('identical quickPay command writes transaction once', calls.add === 1 && calls.update === 1 && calls.audit === 1, JSON.stringify(calls));
check('duplicate quickPay callers share same result', r1.txId === r2.txId && r1.paidMonths.length === 2);
check('quickPay preserves canonical transaction fields', calls.lastTx.type === 'Học phí' && calls.lastTx.description === 'Nguyen A' && calls.lastTx.txMonth === '2026-07' && calls.lastTx.packageMonths.join(',') === '2026-06,2026-07');
check('quickPay advances paidUntil without overwriting profile status fields', r1.paidUntil === '2026-07' && calls.lastProfileUpdate.name === 'Nguyen A' && Object.keys(calls.lastProfileUpdate.data).sort().join(',') === 'paidMonths,paidUntil');
check('quickPay commits canonical local profile after success', window.__store.profiles['Nguyen A'].paidUntil === '2026-07' && window.__store.profiles['Nguyen A'].paidMonths.includes('2026-06'));
check('quickPay invalidates tuition/debt domains once', calls.invalidate === 1 && calls.lastInvalidation.keys.includes('tx.txList') && calls.lastInvalidation.keys.includes('students.debtList'));
check('quickPay financial audit records before and after', calls.auditEvents.some(x=>x.action==='tuition.quickPay'&&x.stage==='before') && calls.auditEvents.some(x=>x.action==='tuition.quickPay'&&x.stage==='after'));

const tx = { id:'tuition-1', type:'Học phí', description:'Nguyen A', amount:100000, packageMonths:['2026-07'], txMonth:'2026-07' };
const d1 = boundary.deleteTuitionTransaction({ txId:tx.id, transaction:tx });
const d2 = boundary.deleteTuitionTransaction({ txId:tx.id, transaction:tx });
await Promise.all([d1,d2]);
check('identical tuition delete executes Firestore delete once', calls.del === 1, `delete calls=${calls.del}`);
check('tuition delete reuses existing reconcile helper', calls.reconcile === 1 && calls.lastReconcile.opts.skipInvalidate === true);
check('tuition delete centralizes invalidation after reconcile', calls.invalidate === 2 && calls.lastInvalidation.reason === 'v5u2-delete-tuition');

failReconcile = true;
const partialDeleteTx = { id:'tuition-partial-delete', type:'Học phí', description:'Nguyen A', amount:100000, packageMonths:['2026-06'], txMonth:'2026-06' };
window.__store.transactions = [partialDeleteTx];
window.__store.allTransactions = [partialDeleteTx];
window.allTransactions = [partialDeleteTx];
let deletePartial = false;
try {
  await boundary.deleteTuitionTransaction({ txId:partialDeleteTx.id, transaction:partialDeleteTx });
} catch (e) { deletePartial = e.partialWrite === true && e.transactionDeleted === true && e.transactionId === partialDeleteTx.id; }
check('delete reconcile failure reports transaction-already-deleted partial state', deletePartial);
check('delete partial state removes stale local transaction row', window.__store.transactions.length === 0 && window.__store.allTransactions.length === 0 && window.allTransactions.length === 0);
check('delete partial state forces tuition/debt refresh', calls.lastInvalidation.reason === 'v5u2-delete-tuition-partial-reconcile');
failReconcile = false;

failProfileUpdate = true;
let partial = false;
try {
  await boundary.collectTuition({ studentName:'Nguyen A', months:['2026-08'], branch:'CS1', amount:100000 });
} catch (e) { partial = e.partialWrite === true && !!e.transactionId; }
check('profile-update failure is surfaced as partial write', partial);
check('partial write does not commit paidUntil locally', window.__store.profiles['Nguyen A'].paidUntil === '2026-07');
check('partial write forces visible refresh for reconciliation', calls.lastInvalidation.reason === 'v5u2-tuition-partial-write');

const metrics = boundary.getMetrics();
check('tuition command metrics record duplicate prevention and partial writes', metrics.duplicatePrevented >= 2 && metrics.partialWrites === 2, JSON.stringify(metrics));

if (failures) {
  console.error(`\nV5U-2 tuition command behavior check FAILED: ${failures}`);
  process.exit(1);
}
console.log('\nV5U-2 tuition command behavior check PASS.');
