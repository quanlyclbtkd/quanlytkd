#!/usr/bin/env node
import fs from 'node:fs';

let pass=0, fail=0;
const check=(label,cond,detail='')=>{ if(cond){pass++;console.log('PASS',label);} else {fail++;console.error('FAIL',label,detail);} };

const boundarySrc=fs.readFileSync('js/core/debtProfileReadBoundary.js','utf8');
const statusSrc=fs.readFileSync('js/core/studentStatusCommandBoundary.js','utf8');
const refreshSrc=fs.readFileSync('js/ui/render/listComputationRefresh.js','utf8');
const storeSrc=fs.readFileSync('js/store.js','utf8');
const tuitionSrc=fs.readFileSync('js/core/tuitionCommandBoundary.js','utf8');
const invSrc=fs.readFileSync('js/modules/inventory.js','utf8');
const txBoundarySrc=fs.readFileSync('js/core/transactionCanonicalBoundary.js','utf8');
const studentsUiSrc=fs.readFileSync('js/modules/students.js','utf8');

check('A1 planning authority is separated from diagnostics', boundarySrc.includes('refreshPlanning: new Set()') && boundarySrc.includes('canonicalRefreshAcceptedAt'));
check('A1 canonical acceptance retires from planning', boundarySrc.includes("planningRetireReason = 'canonical-refresh-accepted'") && boundarySrc.includes('_syncDiag.refreshPlanning.delete(id)'));
check('A1 acceptance validates authority/context token', boundarySrc.includes('_sameOperationAuthorityAndContext(row)') && boundarySrc.includes('debtContextKey'));
check('A2 rename dependency is not hard-coded for every rename', statusSrc.includes('_renameNeedsPrimaryCompletionForDebt') && statusSrc.includes("previous?.paidUntil") && statusSrc.includes('_stableTxIdentity'));
check('A2 rename dependency reuses canonical classifier', /(?:window|globalThis)\.isTuitionFinanceTransaction/.test(statusSrc) || /(?:window|globalThis)\.getAccountingComponents/.test(statusSrc));
check('A3 delete can defer Students compute to profile listener authority', statusSrc.includes("_commitDelete(key, 'v5u1-profile-delete', { deferStudentsToAuthority: profileAckOwned })"));
check('A4 cross-context previous summary is not used as fallback', refreshSrc.includes('prevForContext = sameSummaryContext ? prev : {}'));
check('A4 true-zero authority uses semantic freshness + coverage', refreshSrc.includes('isFinanceSemanticSourceFresh()') && refreshSrc.includes('isStudentsSemanticSourceFresh()') && refreshSrc.includes('authoritativeCurrentContext'));
check('B1 transaction removal has no direct epoch writer', !/window\.__store\._transactionsVersion\s*=/.test(tuitionSrc));
check('B1 inventory category UI has no direct semantic epoch writer', !/_inventoryCategoryVersion\s*=/.test(invSrc));
check('B2 canonicalTransactionReadMonths uses clubConfig assignment', txBoundarySrc.includes('store.clubConfig = { ...(store.clubConfig || {}), canonicalTransactionReadMonths:'));
check('Current UI rename is displayName-only H8R1', studentsUiSrc.includes('profile document ID là immutable profileKey') && /newName:\s*profileKey/.test(studentsUiSrc));

// Dynamic A1/A2/A3

globalThis.window=globalThis;
window.userRole='admin';
window.__verifiedAuthContextState={ready:true,generation:11,uid:'uid-A',role:'admin',clubId:'club-A'};
window.__store={clubId:'club-A',currentClubId:'club-A',userRole:'admin',selectedMonth:'2026-10',selectedBranch:'all',clubConfig:{},profiles:{}};
let listener={activeListenerMounted:true,activeListenerFailed:false,activeListenerKey:'students:profiles:active:club-A:admin',authorityClubId:'club-A',fullAuthoritySnapshotSeen:true,fullAuthoritySnapshotCount:1,fullAuthorityComplete:true,authorityServerConfirmed:true,authorityFreshness:'fresh',authorityHasPendingWrites:false,authoritySessionEpoch:11,activeOwnerUid:'uid-A',role:'admin',lastProfilesMode:'full-profiles-authoritative',quitComplete:true};
window.studentProfileStore={quitComplete:true,version:1};
window.getProfilesListenerMetrics=()=>({...listener});
window.getProfileStatusConfig=()=>({activeQueryValues:['active','trial'],quitQueryValues:['quit']});
window.hasListener=()=>true;
window.getDebtOverdueFilterValue=()=>0;
let domMonth='2026-10';
globalThis.document={getElementById(id){ const vals={filterMonth:domMonth,filterBranch:'all',searchInput:''}; return id in vals ? {value:vals[id]} : null; },querySelector(){return null;}};
await import(`../js/core/debtProfileReadBoundary.js?r2r52=${Date.now()}`);
const debt=window.DebtProfileReadBoundary;

const hidden=debt.beginSyncOperation({action:'hidden.update',profileId:'P1',affectsDebt:true});
debt.markSyncStage(hidden,'primaryWriteStart');
listener={...listener,authorityFreshness:'stale',authorityHasPendingWrites:true};
debt.markActiveSyncStage('profilePendingSnapshotAt',{clubId:'club-A'});
debt.markSyncStage(hidden,'primaryWriteAckAt');
listener={...listener,authorityFreshness:'fresh',authorityHasPendingWrites:false};
let plan=debt.markActiveSyncStage('profileServerFreshAt',{clubId:'club-A'});
check('A1 first server-fresh produces one eligible hidden operation',plan.operationIds.length===1 && plan.operationIds[0]===hidden);
debt.markActiveSyncStage('debtRefreshRequestedAt',{clubId:'club-A',onlyDebt:true});
let accepted=debt.acceptDebtRefreshOperations(plan.operationIds,{clubId:'club-A'});
check('A1 canonical refresh acceptance retires operation without DOM render',accepted.length===1 && debt.getSyncDiagnostics().active.every(x=>x.operationId!==hidden) && !debt.getSyncDiagnostics().refreshPlanningOperationIds.includes(hidden));
plan=debt.markActiveSyncStage('profileServerFreshAt',{clubId:'club-A'});
check('A1 later unrelated server snapshot requests zero refresh for old operation',plan.operationIds.length===0 && plan.affectsDebt===false);
// diagnostics may still be completed after planning retirement
for (const stage of ['debtComputeStartAt','debtComputeEndAt','debtRenderAt']) debt.markActiveSyncStage(stage,{clubId:'club-A',onlyDebt:true});
debt.clearFreshSyncOperations({clubId:'club-A'});
const hiddenHist=debt.getSyncDiagnostics().history.find(x=>x.operationId===hidden);
check('A1 diagnostics can continue after planning retirement',!!hiddenHist && hiddenHist.canonicalRefreshAcceptedAt!=null && hiddenHist.debtRenderAt!=null && hiddenHist.syncClearedAt!=null);

// Operation context mismatch cannot remain planning-authoritative.
const mismatch=debt.beginSyncOperation({action:'context.change',profileId:'P2',affectsDebt:true});
window.__store.selectedMonth='2026-11'; domMonth='2026-11';
plan=debt.markActiveSyncStage('profileServerFreshAt',{clubId:'club-A'});
check('A1 changed Debt context retires old operation rather than authorizing it',!plan.operationIds.includes(mismatch) && !debt.getSyncDiagnostics().refreshPlanningOperationIds.includes(mismatch));
window.__store.selectedMonth='2026-10'; domMonth='2026-10';

// StudentStatusCommandBoundary mocks.
window.__store.profiles={A:{status:'active',profileId:'PID-A',paidUntil:'2026-09',paidMonths:['2026-09'],displayName:'A'}};
window.__store.transactions=[];
window.studentProfileStore={quitComplete:true,version:1,getProfile:n=>window.__store.profiles[n],mergeProfile(n,d){window.__store.profiles[n]=d;this.version++;},removeProfile(n){delete window.__store.profiles[n];this.version++;}};
window.syncStudentStatusLocal=()=>{};
window.invalidateSearchCache=()=>{};
let invalidations=0, directHeavy=0, dashboardInvalidations=0;
window.invalidateLists=()=>{invalidations++;};
window.invalidateList=()=>{};
window.invalidateDashboard=()=>{dashboardInvalidations++;};
window.refreshListsComputation=()=>{directHeavy++; return {refreshed:[],fallback:[]};};
window.invalidateStudents=()=>{invalidations++;};
window.markQuitAuthorityDirty=()=>{};
window.removeStudentFromDebtDom=()=>{};
window.TuitionCommandBoundary={runInProfileTuitionMutationLane:async(_m,task)=>task()};
window.isTuitionFinanceTransaction=tx=>tx?.type==='Học phí';
let serviceMode='';
window.StudentService={
  async updateProfile(){}, async deleteProfile(){},
  async renameWithBatch(){
    if(serviceMode==='fresh-before-primary'){
      const p=debt.markActiveSyncStage('profileServerFreshAt',{clubId:'club-A'});
      if(p.affectsDebt){ invalidations++; debt.acceptDebtRefreshOperations(p.operationIds,{clubId:'club-A'}); }
    }
  }
};
const ss=await import(`../js/core/studentStatusCommandBoundary.js?r2r52=${Date.now()}`);
ss.initStudentStatusCommandBoundary();

// Stable ID + paidUntil: tx rename chunks are not required for Debt.
debt.reset('stable-rename'); invalidations=directHeavy=dashboardInvalidations=0;
window.__store.selectedMonth='2026-10';
window.__store.profiles={A:{status:'active',profileId:'PID-A',paidUntil:'2026-09',paidMonths:['2026-09'],displayName:'A'}};
window.__store.transactions=[{id:'t1',profileId:'PID-A',type:'Học phí',description:'A - Học phí'}];
serviceMode='fresh-before-primary';
let rr=await window.StudentStatusCommandBoundary.updateProfile({oldName:'A',newName:'B',updateData:{displayName:'B'},txUpdates:[{txId:'t1',newDesc:'B - Học phí'}]});
check('A2 stable/paidUntil rename does not wait for transaction chunks for Debt',rr.requiresPrimaryCompletionForDebtRefresh===false);
check('A2 stable fast path does not duplicate command-side Students heavy compute',directHeavy===0);

// Legacy name fallback: no paidUntil and no stable tx identity -> rendezvous.
debt.reset('legacy-rename'); invalidations=directHeavy=dashboardInvalidations=0;
window.__store.profiles={A:{status:'active',displayName:'A',paidUntil:'',paidMonths:[]}};
window.__store.transactions=[{id:'t2',type:'Học phí',description:'A'}];
serviceMode='fresh-before-primary';
rr=await window.StudentStatusCommandBoundary.updateProfile({oldName:'A',newName:'B',updateData:{displayName:'B'},txUpdates:[{txId:'t2',newDesc:'B'}]});
check('A2 legacy fallback rename requires primary completion rendezvous',rr.requiresPrimaryCompletionForDebtRefresh===true);
check('A2 profile-fresh-before-primary produces exactly one final Debt refresh',invalidations===1 && directHeavy===0);

// Opposite event order: primary complete first; later listener fresh owns the one refresh.
debt.reset('legacy-rename-order2'); invalidations=directHeavy=dashboardInvalidations=0;
window.__store.profiles={A:{status:'active',displayName:'A',paidUntil:'',paidMonths:[]}};
window.__store.transactions=[{id:'t3',type:'Học phí',description:'A'}];
serviceMode='primary-before-fresh';
rr=await window.StudentStatusCommandBoundary.updateProfile({oldName:'A',newName:'B',updateData:{displayName:'B'},txUpdates:[{txId:'t3',newDesc:'B'}]});
check('A2 primary-first emits no premature final Debt refresh',rr.requiresPrimaryCompletionForDebtRefresh===true && invalidations===0 && directHeavy===0);
plan=debt.markActiveSyncStage('profileServerFreshAt',{clubId:'club-A'});
if(plan.affectsDebt){ invalidations++; debt.acceptDebtRefreshOperations(plan.operationIds,{clubId:'club-A'}); }
check('A2 primary-before-profile-fresh completes with exactly one listener-owned refresh',invalidations===1);

// Delete: command does local projection; listener remains canonical Students/Debt refresh owner.
debt.reset('delete'); invalidations=directHeavy=dashboardInvalidations=0;
window.__store.profiles={A:{status:'active',profileId:'PID-A',paidUntil:'2026-09'}};
window.StudentService.deleteProfile=async()=>{};
await window.StudentStatusCommandBoundary.deleteProfile('A');
check('A3 delete command does not start duplicate Students heavy compute when listener owns ACK',directHeavy===0);
plan=debt.markActiveSyncStage('profileServerFreshAt',{clubId:'club-A'});
if(plan.affectsDebt){ invalidations++; debt.acceptDebtRefreshOperations(plan.operationIds,{clubId:'club-A'}); }
check('A3 delete reaches one post-ACK Students/Debt refresh',invalidations===1);

console.log(`\nR2R5.2 correctness: ${pass} PASS / ${fail} FAIL`);
if(fail) process.exit(1);
