#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
let pass=0,fail=0;const ok=(n,c,d='')=>{if(c){pass++;console.log('✅ '+n)}else{fail++;console.error('❌ '+n+(d?' — '+d:''))}};
const root=process.cwd();
const addMonths=(ym,delta)=>{let [y,m]=ym.split('-').map(Number);let idx=y*12+(m-1)+delta;return `${Math.floor(idx/12)}-${String(idx%12+1).padStart(2,'0')}`};
const monthsFrom=(start,count)=>Array.from({length:count},(_,i)=>addMonths(start,i));
globalThis.window=globalThis;window.userRole='admin';window.currentUserEmail='qa@example.com';window.currentUserUid='u1';window.currentClubId='club-A';window.__verifiedAuthContextState={ready:true,uid:'u1',clubId:'club-A',generation:7,sessionEpoch:11,authGeneration:13};window.getCanonicalTransactionReadMode=()=> 'legacy';
window.guardFinancialWriteIntent=()=>true;window.isFinancialWriteAllowed=()=>true;window.recordRuntimeError=()=>{};window.invalidateLists=()=>{};window.refreshListsComputation=()=>{};window.invalidateDashboard=()=>{};window.invalidateList=()=>{};
window.__store={clubId:'club-A',profiles:{},transactions:[],allTransactions:[],currentUser:{uid:'u1'}};window.allProfiles=window.__store.profiles;window.allTransactions=[];window.studentProfileStore={getAllProfilesCompat:()=>window.__store.profiles,mergeProfile:(n,d)=>{window.__store.profiles[n]={...window.__store.profiles[n],...d}}};
await import(pathToFileURL(path.resolve('js/core/tuitionDebtCanonical.js')).href+'?r12='+Date.now());
let atomicPlans=[],feeAudits=[],financialAudits=[],completeReads=0,currentComplete=true,evidenceFail=false;
window.recordFinancialActionAudit=(action,stage,payload)=>financialAudits.push({action,stage,payload:structuredClone(payload||{})});
const opCtx=()=>({clubId:window.__store.clubId,uid:'u1',generation:window.__verifiedAuthContextState.generation,sessionEpoch:window.__verifiedAuthContextState.sessionEpoch,authGeneration:window.__verifiedAuthContextState.authGeneration});const opCurrent=c=>!!c&&c.clubId===window.__store.clubId&&c.uid==='u1'&&c.generation===window.__verifiedAuthContextState.generation&&c.sessionEpoch===window.__verifiedAuthContextState.sessionEpoch&&c.authGeneration===window.__verifiedAuthContextState.authGeneration;window.FinanceService={_arrayUnion:(...x)=>({__arrayUnion:x}),captureFinancialWriteContext:opCtx,isFinancialWriteContextCurrent:opCurrent,financialWriteContextToken:c=>[c.clubId,c.uid,c.generation,c.sessionEpoch,c.authGeneration].join('|'),captureWriteEvidenceContext:(month,c)=>({...c,month,readMode:'legacy'}),isWriteEvidenceContextCurrent:c=>opCurrent(c)&&c.readMode==='legacy',getRuntimeTransactionRowsForEvidence(){return[]},getCurrentMonthEvidenceForWrite({month}){return{strictCurrentCoverageComplete:currentComplete,serverComplete:currentComplete,contextStillCurrent:true,rows:[],context:{...opCtx(),month,readMode:'legacy'}}},async getCompleteMonthEvidence({month}){completeReads++;if(evidenceFail)return{serverComplete:false,contextStillCurrent:true,rows:[],code:'SERVER_EVIDENCE_UNVERIFIED'};return{serverComplete:true,contextStillCurrent:true,rows:[],context:{...opCtx(),month,readMode:'legacy'}}},async commitAtomicWritePlan(plan){atomicPlans.push(structuredClone(plan));return{txIds:['tx-'+atomicPlans.length],primaryCommitted:true,postCommitContextCurrent:true,commitClubId:plan.expectedContext?.clubId||window.__store.clubId}},async addFeeAuditSilent(data){feeAudits.push(structuredClone(data));return{ok:true}}};
const {TuitionCommandBoundary:B}=await import(pathToFileURL(path.resolve('js/core/tuitionCommandBoundary.js')).href+'?r12='+Date.now());
let caseSeq=0;function reset(profile){atomicPlans=[];feeAudits=[];financialAudits=[];completeReads=0;currentComplete=true;evidenceFail=false;const name='Student '+(++caseSeq);window.__store.profiles={[name]:{profileId:'p'+caseSeq,name,branch:'CS1',tuitionFee:500000,skippedMonths:[],...profile}};window.allProfiles=window.__store.profiles;return name;}
async function collectCase(label,count,amount,start='2026-01'){const months=monthsFrom(start,count),name=reset({paidUntil:addMonths(start,-1),paidMonths:[]});const r=await B.collectTuition({studentName:name,months,branch:'CS1',amount,source:'r1.2-test'});await new Promise(r=>setTimeout(r,0));const p=atomicPlans[0]||{},tx=p.transactions?.[0]?.data||{},pu=p.profileUpdates?.[0]?.data||{};ok(label+': one atomic plan',atomicPlans.length===1&&p.transactions?.length===1&&p.profileUpdates?.length===1);ok(label+': requested/package/profile/result parity',r.paidMonths?.length===count&&tx.packageMonths?.length===count&&pu.paidMonths?.__arrayUnion?.length===count&&r.paidMonths.join(',')===months.join(',')&&tx.packageMonths.join(',')===months.join(',')&&pu.paidMonths.__arrayUnion.join(',')===months.join(','),JSON.stringify({months,r:r.paidMonths,tx:tx.packageMonths,pu:pu.paidMonths}));ok(label+': amount preserved',Number(tx.amount)===amount&&Number(r.amount)===amount);ok(label+': paidUntil uses full canonical months',r.paidUntil===months.at(-1),`${r.paidUntil} vs ${months.at(-1)}`);ok(label+': fee audit months parity',feeAudits[0]?.months?.join(',')===months.join(','));ok(label+': financial audit months parity',financialAudits.some(x=>x.stage==='before'&&x.payload?.months?.join(',')===months.join(',')));ok(label+': zero extra server reads',completeReads===0);return r;}
await collectCase('A1 1 month exact',1,500000,'2026-01');
await collectCase('A2 3 months exact',3,1500000,'2026-03');
await collectCase('A3 3 months 10% discount',3,1350000,'2026-06');
await collectCase('A4 3 months custom amount',3,1200000,'2026-09');
await collectCase('A5 6 months exact',6,3000000,'2027-01');
await collectCase('A6 6 months discount',6,2700000,'2027-07');
await collectCase('A7 9 months exact',9,4500000,'2028-01');
await collectCase('A8 9 months discount',9,4050000,'2028-10');
await collectCase('A9 12 months exact',12,6000000,'2030-01');
await collectCase('A10 12 months discount',12,5400000,'2031-01');
// PAID -> idempotent zero write.
{const months=['2032-01'];const name=reset({paidUntil:'2032-01',paidMonths:['2032-01']});const r=await B.collectTuition({studentName:name,months,branch:'CS1',amount:500000});ok('B1 PAID QuickPay zero primary write',r.alreadySettled===true&&atomicPlans.length===0);}
// PARTIAL -> zero write.
{const months=['2032-02','2032-03','2032-04'];const name=reset({paidUntil:'2032-01',paidMonths:['2032-02']});const r=await B.collectTuition({studentName:name,months,branch:'CS1',amount:1350000});ok('B2 PARTIAL_SETTLED zero primary write',r.blocked===true&&r.writeDecision?.status==='PARTIAL_SETTLED'&&atomicPlans.length===0);}
// NON_CHARGEABLE fee exempt/skipped -> zero write.
{const months=['2032-05'];const name=reset({paidUntil:'2032-04',feeExempt:true});const r=await B.collectTuition({studentName:name,months,branch:'CS1',amount:500000});ok('B3 FEE_EXEMPT zero primary write',r.blocked===true&&r.writeDecision?.status==='NON_CHARGEABLE'&&atomicPlans.length===0);}
{const months=['2032-06'];const name=reset({paidUntil:'2032-05',skippedMonths:['2032-06']});const r=await B.collectTuition({studentName:name,months,branch:'CS1',amount:500000});ok('B4 SKIPPED zero primary write',r.blocked===true&&r.writeDecision?.status==='NON_CHARGEABLE'&&atomicPlans.length===0);}
// UNKNOWN evidence -> zero write.
{const months=['2032-07'];const name=reset({paidUntil:'2032-06'});currentComplete=false;evidenceFail=true;const r=await B.collectTuition({studentName:name,months,branch:'CS1',amount:500000});ok('B5 UNKNOWN zero primary write',r.blocked===true&&r.writeDecision?.status==='UNKNOWN'&&atomicPlans.length===0&&completeReads===1);}
// VERIFIED_UNPAID -> one primary atomic plan.
{const months=['2032-08'];const name=reset({paidUntil:'2032-07'});const r=await B.collectTuition({studentName:name,months,branch:'CS1',amount:400000});ok('B6 VERIFIED_UNPAID exactly one atomic plan',r.ok===true&&atomicPlans.length===1);}
const boundarySrc=fs.readFileSync('js/core/tuitionCommandBoundary.js','utf8');const financeSrc=fs.readFileSync('js/modules/finance.js','utf8');const appSrc=fs.readFileSync('app.js','utf8');const mainSrc=fs.readFileSync('js/main.js','utf8');
const a=boundarySrc.indexOf('async collectTuition');const z=boundarySrc.indexOf('async deleteTuitionTransaction',a);const collectSrc=boundarySrc.slice(a,z);
ok('C1 collectTuition has no amount/fee month truncation',!/Math\.floor\s*\([^)]*numericAmount\s*\/\s*feePerMonth/.test(collectSrc)&&!/paidMonths\s*=\s*monthsList\.slice\(0,/.test(collectSrc)&&/const paidMonths = monthsList\.slice\(\)/.test(collectSrc));
ok('C2 UI forwards selected months list unchanged',/window\.quickPay[\s\S]*TuitionCommandBoundary\.collectTuition\(\{[\s\S]*months:monthsList/.test(financeSrc));
ok('C3 finance comment states month intent authority',financeSrc.includes('monthsStr xác định chính xác kỳ học phí cần settlement')&&financeSrc.includes('không suy số tháng từ amount'));
ok('C4 QuickPay only VERIFIED_UNPAID reaches primary writer',/if \(writeDecision\.status !== 'VERIFIED_UNPAID'\)[\s\S]*commitAtomicWritePlan/.test(collectSrc));
ok('C5 Form uses require gate before atomic write',/requireTuitionUnpaidForWrite[\s\S]*commitAtomicWritePlan/.test(financeSrc));
ok('C6 Combo uses require gate before atomic write',/processCombo[\s\S]*requireTuitionUnpaidForWrite[\s\S]*commitAtomicWritePlan/.test(financeSrc));
ok('C7 MultiItem blocks non-VERIFIED_UNPAID before batch',/status!=='VERIFIED_UNPAID'[\s\S]*writeBatch\(db\)/.test(appSrc));
ok('C8 auth context writer synchronously aligns club mirrors',/currentClubId = ctx\.clubId;[\s\S]*window\.currentClubId = ctx\.clubId;[\s\S]*window\.__store\.clubId = ctx\.clubId;/.test(appSrc));
ok('C9 no new context authority token introduced',!/expectedContextForTuitionR12|TuitionContextAuthorityV2|QuickPayContextV2/.test(boundarySrc+financeSrc+appSrc+mainSrc));
console.log(`\nFINANCE-TUITION-MONTH-AUTHORITY-R1.2: ${fail?'FAIL '+fail:`PASS ${pass}/${pass}`}`);if(fail)process.exit(1);
