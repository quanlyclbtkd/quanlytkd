import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

globalThis.window=globalThis;
window.userRole='admin';
window.__verifiedAuthContextState={uid:'qa-only',generation:1};
const name='Vo Tan Hung';
const selectedMonths=['2026-09','2026-10','2026-11'];
window.__store={clubId:'qa-only',profiles:{[name]:{profileId:'P001',branch:'CS1',name,status:'active',joinDate:'2026-09-01',tuitionFee:300000,paidMonths:['2026-08'],paidUntil:'2026-08'}},transactions:[]};
window.allProfiles=window.__store.profiles;
for (const f of ['tuitionDebtCanonical.js','transactionCanonicalBoundary.js']) vm.runInThisContext(fs.readFileSync(new URL('../../js/core/'+f,import.meta.url),'utf8'),{filename:f});
const debtBefore=window.TuitionDebtCanonical.computeProfileDebt(window.__store.profiles[name],'2026-11',{name,transactions:[]});
let plan;
window.FinanceService={
  _arrayUnion:(...items)=>({arrayUnion:items}),
  async commitAtomicWritePlan(input){plan=structuredClone(input);return{committed:2,txIds:['qa-tx-1']};},
  async addFeeAuditSilent(){},
};
window.guardFinancialWriteIntent=()=>true;
window.isFinancialWriteAllowed=x=>x===true;
const {TuitionCommandBoundary}=await import('../../js/core/tuitionCommandBoundary.js');
const result=await TuitionCommandBoundary.collectTuition({studentName:name,months:selectedMonths,branch:'CS1',amount:900000});
assert(result.ok);
const tx=window.CanonicalTransactionBoundary.canonicalizeCreate(plan.transactions[0].data,'qa-capture');
const profile=window.__store.profiles[name];
const debtAfter=window.TuitionDebtCanonical.computeProfileDebt(profile,'2026-11',{name,transactions:[tx]});
const noMemoAuthority=window.TuitionDebtCanonical.extractTuitionTransactionMonths({profileId:'P001'},name,{transactions:[{type:'Học phí',description:name,memo:'HP Y2099M1',addInfo:'HP 2099',packageMonths:selectedMonths}]});
assert.deepEqual(noMemoAuthority,selectedMonths);
assert.deepEqual(tx.packageMonths,selectedMonths);
assert.deepEqual(profile.paidMonths,['2026-08',...selectedMonths]);
assert.equal(profile.paidUntil,'2026-11');
delete tx.timestamp;
const snapshot={selectedMonths,paidMonths:profile.paidMonths,packageMonths:tx.packageMonths,accountingMonths:tx.accountingMonths,paidUntil:profile.paidUntil,transaction:tx,profileUpdate:plan.profileUpdates[0],debtBefore,debtAfter,memoNotAccountingAuthority:true,transport:'canonical command and canonical accounting/debt owners; atomic SDK transport captured, no database write'};
fs.writeFileSync(process.argv[2],JSON.stringify(snapshot,null,2));
console.log('PASS financial snapshot',process.argv[2]);
