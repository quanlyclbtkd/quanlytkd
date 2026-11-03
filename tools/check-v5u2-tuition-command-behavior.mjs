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
window.__verifiedAuthContextState = { ready:true, uid:'admin-1', generation:1, sessionEpoch:1, authGeneration:1 };
window.getCanonicalTransactionReadMode = () => 'legacy';
window.__store = { clubId: 'club-A', _activeTxReadMode:'legacy', _activeTxProjectionEpoch:{id:'epoch-1'}, transactionCoverage:{clubId:'club-A',month:'2026-06',readMode:'legacy',ready:true,complete:true,pageServerComplete:true,pageEvidence:{epoch:null}}, profiles: { 'Nguyen A': { profileId:'p1', branch:'CS1', tuitionFee: 100000, paidUntil: '2026-05', paidMonths: ['2026-05'] } }, currentUser:{uid:'admin-1'}, transactions: [], allTransactions: [] };
window.__store.transactionCoverage.pageEvidence.epoch = window.__store._activeTxProjectionEpoch;
window.allProfiles = window.__store.profiles;
window.allTransactions = [];
const calls = { add:0, update:0, atomic:0, audit:0, del:0, query:0, updateAfterDelete:0, reconcile:0, invalidate:0, auditEvents:[] };
let failAtomicCommit = false;
let failReconcile = false;
const _opCtx=()=>({clubId:window.__store.clubId,uid:'admin-1',generation:window.__verifiedAuthContextState.generation,sessionEpoch:window.__verifiedAuthContextState.sessionEpoch,authGeneration:window.__verifiedAuthContextState.authGeneration});
const _opCurrent=c=>!!c&&c.clubId===window.__store.clubId&&c.uid==='admin-1'&&c.generation===window.__verifiedAuthContextState.generation&&c.sessionEpoch===window.__verifiedAuthContextState.sessionEpoch&&c.authGeneration===window.__verifiedAuthContextState.authGeneration;
window.FinanceService = {
  captureFinancialWriteContext:_opCtx,isFinancialWriteContextCurrent:_opCurrent,financialWriteContextToken:c=>[c.clubId,c.uid,c.generation,c.sessionEpoch,c.authGeneration].join('|'),captureWriteEvidenceContext:(month,c)=>({...c,month,readMode:'legacy'}),isWriteEvidenceContextCurrent:c=>_opCurrent(c)&&c.readMode==='legacy',
  async addTransaction(data) { calls.add++; await sleep(25); calls.lastTx = data; return `tx-${calls.add}`; },
  async updateStudentPayment(name, data) { calls.update++; calls.lastProfileUpdate = {name,data}; },
  async commitAtomicWritePlan(plan) {
    calls.atomic++;
    await sleep(25);
    if (failAtomicCommit) throw new Error('atomic commit failed');
    const tx = (plan.transactions || [])[0] || {};
    const pu = (plan.profileUpdates || [])[0] || {};
    calls.lastTx = tx.data;
    calls.lastProfileUpdate = { name: pu.studentName, data: pu.data };
    return { committed: (plan.transactions || []).length + (plan.profileUpdates || []).length, txIds: [`tx-atomic-${calls.atomic}`] };
  },
  _arrayUnion(...items) { return { __arrayUnion: items }; },
  async addFeeAuditSilent(data) { calls.audit++; calls.lastAudit = data; },
  async deleteTransaction(id) { calls.del++; calls.lastDelete = id; await sleep(20); },
  async getStudentTuitionTxs() { calls.query++; return []; },
  async updateProfileAfterTxDelete(name, paidUntil, months) { calls.updateAfterDelete++; calls.lastDeleteProfile = {name,paidUntil,months}; },
  getRuntimeTransactionRowsForEvidence() { return window.__store.transactions || []; },
  getCurrentMonthEvidenceForWrite({month}={}) { return { strictCurrentCoverageComplete:true, serverComplete:true, contextStillCurrent:true, rows:window.__store.transactions||[], context:{clubId:'club-A',month,readMode:'legacy'} }; },
  async getCompleteMonthEvidence({month}={}) { calls.query++; if (failReconcile) return {serverComplete:false,contextStillCurrent:true,rows:[],code:'SERVER_EVIDENCE_UNVERIFIED'}; return {serverComplete:true,contextStillCurrent:true,rows:window.__store.transactions||[],context:{clubId:'club-A',month,readMode:'legacy'}}; },
};
window.studentProfileStore = { mergeProfile(name, data) { calls.mergedProfile = {name,data}; }, getAllProfilesCompat() { return window.__store.profiles; } };
window.invalidateLists = (keys, reason) => { calls.invalidate++; calls.lastInvalidation = {keys,reason}; };
window.refreshListsComputation = () => {};
window.invalidateDashboard = () => {};
window.invalidateList = () => {};
window.guardFinancialWriteIntent = () => true; window.isFinancialWriteAllowed = r => r === true || r?.ok === true;
window.recordFinancialActionAudit = (action, stage, payload) => calls.auditEvents.push({action,stage,payload});
window.TransactionDeleteIntegrity = { analyzeTransactionDeleteImpact(tx) { return { valid:true, failClosed:false, hasTuition:true, hasInventory:false, requiresInventoryRollback:false, isMixedBundle:false, isPureTuition:true, requiresProfileReconcile:true, studentName:tx.description, requiresExamRefresh:false, safeToHardDelete:true, tuitionMonths:tx.packageMonths || [] }; } };
window.TuitionDebtCanonical = { extractTuitionTransactionMonths(profile,name,{transactions}={}) { const out=[]; for(const tx of (transactions||[])){ if(tx.id==='tuition-1'||tx.id==='tuition-partial-delete') continue; if(tx.type==='Học phí'||tx.type==='Học phí + Lệ phí thi'){ if(Array.isArray(tx.packageMonths)) out.push(...tx.packageMonths); else if(tx.txMonth) out.push(tx.txMonth); } } return Array.from(new Set(out)).sort(); }, areTuitionMonthsSettled(profile, months) { const skipped=Array.isArray(profile?.skippedMonths)?profile.skippedMonths:[]; const paid=Array.isArray(profile?.paidMonths)?profile.paidMonths:[]; const until=String(profile?.paidUntil||''); const states=months.map(m=>({month:m,paid:!skipped.includes(m)&&(paid.includes(m)||(until&&m<=until)),skipped:skipped.includes(m)})); return {states,allSettled:states.length>0&&states.every(x=>x.paid),paidMonths:states.filter(x=>x.paid).map(x=>x.month),skippedMonths:states.filter(x=>x.skipped).map(x=>x.month),unpaidMonths:states.filter(x=>!x.paid).map(x=>x.month)}; }, reconcilePaidUntilFromMonthEvidence(profile, paidMonths) { const all=Array.from(new Set([...(Array.isArray(profile?.paidMonths)?profile.paidMonths:[]),...(Array.isArray(paidMonths)?paidMonths:[])])).sort(); const until=String(profile?.paidUntil||''); return all.reduce((max,m)=>m>max?m:max,until); } };
window.reconcileStudentTuitionAfterDeletedTransaction = async (name, tx, opts) => { calls.reconcile++; calls.lastReconcile = {name,tx,opts}; if (failReconcile) throw new Error('reconcile failed'); return {ok:true}; };

const mod = await import(`../js/core/tuitionCommandBoundary.js?behavior=${Date.now()}`);
mod.initTuitionCommandBoundary();
const boundary = window.TuitionCommandBoundary;

const p1 = boundary.collectTuition({ studentName:'Nguyen A', months:['2026-06','2026-07'], branch:'CS1', amount:200000 });
const p2 = boundary.collectTuition({ studentName:'Nguyen A', months:['2026-06','2026-07'], branch:'CS1', amount:200000 });
const [r1,r2] = await Promise.all([p1,p2]);
check('identical quickPay command commits one atomic plan once', calls.atomic === 1 && calls.add === 0 && calls.update === 0 && calls.audit === 1, JSON.stringify(calls));
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
check('tuition delete bypasses legacy reconcile helper', calls.reconcile === 0 && calls.updateAfterDelete === 1);
check('tuition delete centralizes invalidation after reconcile', calls.invalidate === 2 && calls.lastInvalidation.reason === 'v5u2-delete-tuition');

failReconcile = true;
const partialDeleteTx = { id:'tuition-partial-delete', type:'Học phí', description:'Nguyen A', amount:100000, packageMonths:['2026-06'], txMonth:'2026-06' };
window.__store.transactions = [partialDeleteTx];
window.__store.allTransactions = [partialDeleteTx];
window.allTransactions = [partialDeleteTx];
const deletePartialResult = await boundary.deleteTuitionTransaction({ txId:partialDeleteTx.id, transaction:partialDeleteTx });
check('delete evidence failure reports transaction-already-deleted reconcile-unverified state', deletePartialResult.transactionDeleted === true && deletePartialResult.profileReconcileVerified === false);
check('delete evidence failure removes stale local transaction row', window.__store.transactions.length === 0 && window.__store.allTransactions.length === 0 && window.allTransactions.length === 0);
check('delete evidence failure forces tuition/debt refresh', calls.lastInvalidation.reason === 'v5u2-delete-tuition-unverified-reconcile');
failReconcile = false;

failAtomicCommit = true;
const beforeAtomicFailProfile = window.__store.profiles['Nguyen A'].paidUntil;
let atomicFailedCleanly = false;
try {
  await boundary.collectTuition({ studentName:'Nguyen A', months:['2026-08'], branch:'CS1', amount:100000 });
} catch (e) { atomicFailedCleanly = e.partialWrite !== true && /atomic commit failed/.test(e.message); }
check('atomic commit failure is surfaced without partial-write marker', atomicFailedCleanly);
check('atomic failure does not commit paidUntil locally', window.__store.profiles['Nguyen A'].paidUntil === beforeAtomicFailProfile);
check('atomic failure does not synthesize a transaction/profile divergence', calls.lastInvalidation.reason !== 'v5u2-tuition-partial-write');
failAtomicCommit = false;

const metrics = boundary.getMetrics();
check('tuition command metrics record duplicate prevention without false partial-write on evidence failure', metrics.duplicatePrevented >= 2 && metrics.partialWrites === 0, JSON.stringify(metrics));

if (failures) {
  console.error(`\nV5U-2 tuition command behavior check FAILED: ${failures}`);
  process.exit(1);
}
console.log('\nV5U-2 tuition command behavior check PASS.');
