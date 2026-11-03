#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
let pass=0,fail=0; const ok=(name,cond,detail='')=>{if(cond){pass++;console.log('✅ '+name)}else{fail++;console.error('❌ '+name+(detail?' — '+detail:''))}};
const tick=()=>new Promise(r=>setTimeout(r,0)); const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return{promise,resolve,reject}};
globalThis.window=globalThis; window.userRole='admin'; window.currentUserEmail='qa@example.com'; window.currentUserUid='u1'; window.currentClubId='club-A';
window.__verifiedAuthContextState={ready:true,uid:'u1',clubId:'club-A',generation:7,sessionEpoch:11,authGeneration:13}; window.getCanonicalTransactionReadMode=()=> 'legacy';
window.guardFinancialWriteIntent=()=>true;window.isFinancialWriteAllowed=()=>true;window.recordFinancialActionAudit=()=>{};window.recordRuntimeError=()=>{};window.invalidateLists=()=>{};window.refreshListsComputation=()=>{};window.invalidateDashboard=()=>{};window.invalidateList=()=>{};
window.__store={clubId:'club-A',profiles:{},transactions:[],allTransactions:[],currentUser:{uid:'u1'}}; window.allProfiles=window.__store.profiles; window.allTransactions=[];
await import(pathToFileURL(path.resolve('js/core/tuitionDebtCanonical.js')).href+'?r11a='+Date.now());
let completeReads=0; let currentComplete=true; let runtimeRows=[]; let completeRows=[]; let evidenceFailure=false; let evidenceDeferred=null;
window.FinanceService={
 _arrayUnion:(...x)=>x,
 getRuntimeTransactionRowsForEvidence(){return runtimeRows},
 getCurrentMonthEvidenceForWrite({month}){return{strictCurrentCoverageComplete:currentComplete,serverComplete:currentComplete,contextStillCurrent:true,rows:runtimeRows,context:{clubId:'club-A',month,readMode:'legacy'}}},
 async getCompleteMonthEvidence({month}){completeReads++; if(evidenceDeferred) return evidenceDeferred.promise; if(evidenceFailure)return{serverComplete:false,contextStillCurrent:true,rows:[],code:'SERVER_EVIDENCE_UNVERIFIED'};return{serverComplete:true,contextStillCurrent:true,rows:completeRows,context:{clubId:'club-A',month,readMode:'legacy'}}},
 async commitAtomicWritePlan(){return{txIds:['tx1']}},async addFeeAuditSilent(){return{ok:true}}
};
window.studentProfileStore={getAllProfilesCompat:()=>window.__store.profiles,mergeProfile:(n,d)=>{window.__store.profiles[n]={...window.__store.profiles[n],...d}}};
const {TuitionCommandBoundary:B}=await import(pathToFileURL(path.resolve('js/core/tuitionCommandBoundary.js')).href+'?r11a='+Date.now());
function setProfile(p){window.__store.profiles={'Nguyen A':p};window.allProfiles=window.__store.profiles;runtimeRows=[];completeRows=[];completeReads=0;currentComplete=true;evidenceFailure=false;evidenceDeferred=null;}
async function resolve(p,months){setProfile(p);return B.resolveTuitionSettlementForWrite({profile:p,studentName:'Nguyen A',targetMonths:months,reason:'r1-1a-test'});}
let d;
d=await resolve({profileId:'p1',paidMonths:['2026-09']},['2026-09']);ok('SINGLE_MONTH_ALL_PAID',d.status==='PAID'&&d.settlement.allSettled===true);
d=await resolve({profileId:'p1'},['2026-09']);ok('SINGLE_MONTH_VERIFIED_UNPAID',d.status==='VERIFIED_UNPAID');
d=await resolve({profileId:'p1',skippedMonths:['2026-09']},['2026-09']);ok('SINGLE_MONTH_SKIPPED_NON_CHARGEABLE',d.status==='NON_CHARGEABLE'&&d.reason==='SKIPPED_MONTH'&&completeReads===0);
d=await resolve({profileId:'p1',feeExempt:true},['2026-09']);ok('SINGLE_MONTH_FEEEXEMPT_NON_CHARGEABLE',d.status==='NON_CHARGEABLE'&&d.reason==='FEE_EXEMPT'&&completeReads===0);
d=await resolve({profileId:'p1'},['2026-09','2026-10','2026-11']);ok('THREE_MONTH_NONE_PAID',d.status==='VERIFIED_UNPAID');
d=await resolve({profileId:'p1',paidMonths:['2026-09','2026-10','2026-11']},['2026-09','2026-10','2026-11']);ok('THREE_MONTH_ALL_PAID',d.status==='PAID'&&d.settlement.allSettled===true);
for(const paid of ['2026-09','2026-10','2026-11']){d=await resolve({profileId:'p1',paidMonths:[paid]},['2026-09','2026-10','2026-11']);ok('THREE_MONTH_PARTIAL_'+paid,d.status==='PARTIAL_SETTLED'&&d.settlement.allSettled===false&&d.settlement.paidMonths.length===1&&d.settlement.unpaidMonths.length===2&&completeReads===0);}
d=await resolve({profileId:'p1',skippedMonths:['2026-10']},['2026-09','2026-10','2026-11']);ok('THREE_MONTH_CONTAINS_SKIPPED_FAILS_CLOSED',d.status==='NON_CHARGEABLE'&&d.reason==='SKIPPED_MONTH');
for(const count of [6,12]){const months=Array.from({length:count},(_,i)=>`2026-${String(i+1).padStart(2,'0')}`);d=await resolve({profileId:'p1',paidMonths:[months[0]]},months);ok(`${count}_MONTH_PARTIAL_SETTLED`,d.status==='PARTIAL_SETTLED'&&completeReads===0);}
// Current-complete positive partial evidence must fail closed without a server read.
setProfile({profileId:'p1'});runtimeRows=[{id:'ram1',type:'Học phí',profileId:'p1',studentName:'Nguyen A',packageMonths:['2026-09'],txMonth:'2026-09'}];d=await B.resolveTuitionSettlementForWrite({profile:window.__store.profiles['Nguyen A'],studentName:'Nguyen A',targetMonths:['2026-09','2026-10']});ok('CURRENT_COMPLETE_EVIDENCE_PARTIAL_PAID',d.status==='PARTIAL_SETTLED'&&completeReads===0);
// Server-complete evidence partial paid.
setProfile({profileId:'p1'});currentComplete=false;completeRows=[{id:'srv1',type:'Học phí',profileId:'p1',studentName:'Nguyen A',packageMonths:['2026-09'],txMonth:'2026-09'}];d=await B.resolveTuitionSettlementForWrite({profile:window.__store.profiles['Nguyen A'],studentName:'Nguyen A',targetMonths:['2026-09','2026-10']});ok('SERVER_EVIDENCE_PARTIAL_PAID',d.status==='PARTIAL_SETTLED'&&completeReads===2);
setProfile({profileId:'p1'});currentComplete=false;evidenceFailure=true;d=await B.resolveTuitionSettlementForWrite({profile:window.__store.profiles['Nguyen A'],studentName:'Nguyen A',targetMonths:['2026-09']});ok('EVIDENCE_UNKNOWN_FAILS_CLOSED',d.status==='UNKNOWN');
// Latest profile must win after await: feeExempt.
setProfile({profileId:'p1'});currentComplete=false;evidenceDeferred=deferred();let promise=B.resolveTuitionSettlementForWrite({profile:window.__store.profiles['Nguyen A'],studentName:'Nguyen A',targetMonths:['2026-09']});await tick();window.__store.profiles['Nguyen A']={profileId:'p1',feeExempt:true};evidenceDeferred.resolve({serverComplete:true,contextStillCurrent:true,rows:[],context:{clubId:'club-A',month:'2026-09',readMode:'legacy'}});d=await promise;ok('FEEEXEMPT_CHANGE_DURING_AWAIT_WINS',d.status==='NON_CHARGEABLE'&&d.reason==='FEE_EXEMPT');
// Latest profile must win after await: skipped.
setProfile({profileId:'p1'});currentComplete=false;evidenceDeferred=deferred();promise=B.resolveTuitionSettlementForWrite({profile:window.__store.profiles['Nguyen A'],studentName:'Nguyen A',targetMonths:['2026-09']});await tick();window.__store.profiles['Nguyen A']={profileId:'p1',skippedMonths:['2026-09']};evidenceDeferred.resolve({serverComplete:true,contextStillCurrent:true,rows:[],context:{clubId:'club-A',month:'2026-09',readMode:'legacy'}});d=await promise;ok('SKIPPED_CHANGE_DURING_AWAIT_WINS',d.status==='NON_CHARGEABLE'&&d.reason==='SKIPPED_MONTH');
// Only VERIFIED_UNPAID can pass the require gate.
setProfile({profileId:'p1',paidMonths:['2026-09']});let blockedPartial=false;try{await B.requireTuitionUnpaidForWrite({profile:window.__store.profiles['Nguyen A'],studentName:'Nguyen A',targetMonths:['2026-09','2026-10']})}catch(e){blockedPartial=e.code==='tuition/partial-settlement-changed'}ok('PARTIAL_SETTLED_CANNOT_AUTHORIZE_WRITE',blockedPartial);
setProfile({profileId:'p1',feeExempt:true});let blockedFee=false;try{await B.requireTuitionUnpaidForWrite({profile:window.__store.profiles['Nguyen A'],studentName:'Nguyen A',targetMonths:['2026-09']})}catch(e){blockedFee=e.code==='tuition/non-chargeable-fee-exempt'}ok('FEEEXEMPT_CANNOT_AUTHORIZE_WRITE',blockedFee);
setProfile({profileId:'p1',paidUntil:'2026-10',paidMonths:['2026-10']});d=await B.requireTuitionUnpaidForWrite({profile:window.__store.profiles['Nguyen A'],studentName:'Nguyen A',targetMonths:['2026-11']});ok('PAIDUNTIL_FROM_LATEST_PROFILE_IS_MONOTONIC',d.status==='VERIFIED_UNPAID'&&d.paidUntil==='2026-11');
// Static owner/protected assertions.
const tcb=fs.readFileSync('js/core/tuitionCommandBoundary.js','utf8'),app=fs.readFileSync('app.js','utf8'),fin=fs.readFileSync('js/modules/finance.js','utf8'),svc=fs.readFileSync('js/services/finance.service.js','utf8');
ok('PAID_REQUIRES_ALL_SETTLED',!/paidMonths\.length\s*>\s*0\)\s*\{\s*return \{ status: 'PAID'/.test(tcb)&&/settlement\?\.allSettled === true/.test(tcb));
ok('MULTIITEM_EXHAUSTIVE_STATE_HANDLING',app.includes("status==='PARTIAL_SETTLED'")&&app.includes("status==='NON_CHARGEABLE'")&&app.includes("status!=='VERIFIED_UNPAID'"));
ok('FINANCE_CALLERS_USE_REQUIRE_GATE',fin.includes('requireTuitionUnpaidForWrite'));
ok('NO_NEW_FIRESTORE_QUERY_IN_BOUNDARY',!/(getDocs|onSnapshot|query\(|where\()/.test(tcb));
ok('FINANCE_SERVICE_EVIDENCE_OWNER_PRESERVED',svc.includes('getCompleteMonthEvidence'));
console.log(`\nTUITION-SETTLEMENT-WRITE-STATE-R1.1A: ${fail?'FAIL '+fail:`PASS ${pass}/${pass}`}`); if(fail)process.exit(1);
