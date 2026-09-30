#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const read = p => fs.readFileSync(p, 'utf8');
const boundarySrc = read('js/core/tuitionCommandBoundary.js');
const canonicalSrc = read('js/core/tuitionDebtCanonical.js');
const financeSrc = read('js/modules/finance.js');
const mainSrc = read('js/main.js');
const lazySrc = read('js/core/lazyAssetsBootstrap.js');
const appSrc = read('app.js');
const htmlSrc = read('index.html');
let pass = 0, fail = 0;
const check = (name, ok, detail='') => { if (ok) { pass++; console.log('✅ '+name); } else { fail++; console.error('❌ '+name+(detail?' — '+detail:'')); } };

// Architecture / static invariants.
check('1. one canonical Tuition writer remains', /TuitionCommandBoundary\?\.collectTuition/.test(financeSrc) && /commitAtomicWritePlan\(/.test(boundarySrc));
check('2. one profile mutation lane owner remains', (boundarySrc.match(/const profileMutationLanes = new Map\(\)/g)||[]).length === 1 && /_withProfileMutationLane/.test(boundarySrc));
check('3. collect completed replay is explicitly deferred until after lane entry', /completedReplayAfterLane:\s*true/.test(boundarySrc) && /_withProfileMutationLane\(profileLaneKey[\s\S]*getCompletedReplay/.test(boundarySrc));
check('4. exact in-flight lookup precedes non-lane completed replay lookup', boundarySrc.indexOf('const existing = inFlight.get(key)') < boundarySrc.indexOf("if (options.completedReplayAfterLane !== true)"));
check('5. delete success invalidates replay before profile reconciliation', boundarySrc.indexOf('_invalidateCompletedReplayForTransaction(id)') < boundarySrc.indexOf('reconcileStudentTuitionAfterDeletedTransaction'));
check('6. deleted tx replay cannot be re-stored by deferred completed replay path', /value\?\.completedReplay !== true/.test(boundarySrc));
check('7. future-gap reversal context is passed from main reconciliation', /monthsActuallyRemoved:\s*monthsToRemove/.test(mainSrc));
check('8. canonical reversal helper consumes removedMonths context', /var removedMonths = normalizeMonthList\(opt\.removedMonths \|\| opt\.monthsActuallyRemoved\)/.test(canonicalSrc));
check('9. future-only removed months preserve previous paidUntil', /if \(!affectingBoundary\.length\) return previous/.test(canonicalSrc));
check('10. current/middle boundary removal regresses before earliest affected month', /var boundary = addMonths\(affectingBoundary\[0\], -1\)/.test(canonicalSrc));
check('11. skippedMonths semantics participate in reversal baseline', /while \(boundary && skipped\.includes\(boundary\)\)/.test(canonicalSrc));
check('12. explicit later paidMonths settlement remains supported', /if \(paidMonths\.includes\(target\)\)/.test(canonicalSrc));
check('13. packageMonths fallback remains aligned', /Array\.isArray\(tx\.packageMonths\)/.test(canonicalSrc));
check('14. txMonth fallback remains aligned', /tx\.txMonth/.test(canonicalSrc));
check('15. fee_audit remains secondary', /void _service\(\)\.addFeeAuditSilent/.test(boundarySrc) && !/await _service\(\)\.addFeeAuditSilent/.test(boundarySrc));
check('16. receipt queue remains serialized', /let _receiptRenderQueue = Promise\.resolve\(\)/.test(appSrc));
check('17. receipt asset recovery remains canonical', /asset\.promise\s*=\s*null/.test(lazySrc) && /asset\.generation/.test(lazySrc) && /ensureHtml2CanvasReady/.test(lazySrc));
check('18. one filterBranch authority remains', (htmlSrc.match(/id="filterBranch"/g)||[]).length===1 && !/mobileFilterBranch|filterBranchProxy/.test(htmlSrc+financeSrc+appSrc));

function walk(dir,out=[]) { for (const e of fs.readdirSync(dir,{withFileTypes:true})) { const f=path.join(dir,e.name); if(e.isDirectory()){ if(!['migrations','diagnostics'].includes(e.name)) walk(f,out); } else if(e.name.endsWith('.js')) out.push(f); } return out; }
const runtime=['app.js',...walk('js')];
const pats={getDoc:/(?<![A-Za-z0-9_$])(?:getDoc|_getDoc|fbGetDoc)\s*\(/g,getDocs:/(?<![A-Za-z0-9_$])(?:getDocs|_getDocs|fbGetDocs|_pG4k)\s*\(/g,onSnapshot:/(?<![A-Za-z0-9_$])(?:onSnapshot|fbOnSnapshot)\s*\(/g};
const counts={getDoc:0,getDocs:0,onSnapshot:0};
for(const f of runtime) for(const line of read(f).split('\n')) { const t=line.trim(); if(t.startsWith('//')||t.startsWith('*')||t.startsWith('/*')) continue; for(const[k,re]of Object.entries(pats)){re.lastIndex=0;if(re.test(line))counts[k]++;} }
check('19. no new getDoc', counts.getDoc===29, JSON.stringify(counts));
check('20. no new getDocs', counts.getDocs===45, JSON.stringify(counts));
check('21. no new onSnapshot', counts.onSnapshot===16, JSON.stringify(counts));
check('22. Firestore budget is 29/45/16', counts.getDoc===29&&counts.getDocs===45&&counts.onSnapshot===16, JSON.stringify(counts));

let seq=0;
const tick=()=>new Promise(r=>setTimeout(r,0));
function deferred(){ let resolve,reject; const promise=new Promise((res,rej)=>{resolve=res;reject=rej;}); return {promise,resolve,reject}; }
async function makeHarness({profiles, controlledDelete=false, deleteOutcome='ok', reconcileOutcome='ok', controlledPrimary=false}={}) {
  globalThis.window=globalThis; globalThis.document={getElementById:()=>null};
  window.userRole='admin'; window.currentUserEmail='qa@example.invalid'; window.currentUserUid='admin-1'; window.currentClubId='clubA';
  window.__verifiedAuthContextState={generation:1,uid:'admin-1'};
  const initial=profiles||{A:{profileId:'pA',memberId:'M-A',name:'A',branch:'CS1',tuitionFee:100000,paidUntil:'2026-08',paidMonths:['2026-08'],skippedMonths:[]}};
  window.__store={clubId:'clubA',profiles:structuredClone(initial),transactions:[],allTransactions:[],currentUser:{uid:'admin-1'}};
  window.allProfiles=window.__store.profiles; window.allTransactions=window.__store.transactions;
  window.guardFinancialWriteIntent=()=>true;window.isFinancialWriteAllowed=r=>r===true||r?.ok===true; window.recordFinancialActionAudit=()=>{}; window.recordRuntimeError=()=>{};
  window.invalidateLists=()=>{}; window.refreshListsComputation=()=>{}; window.invalidateDashboard=()=>{}; window.invalidateList=()=>{};
  window.studentProfileStore={getAllProfilesCompat(){return window.__store.profiles;},mergeProfile(k,v){window.__store.profiles[k]=v;window.allProfiles[k]=v;}};
  seq++; await import(pathToFileURL(path.resolve('js/core/tuitionDebtCanonical.js')).href+`?f1c-c=${seq}`);
  const deleteGate=deferred(); const primaryGate=deferred();
  const calls={primary:0,del:0,reconcile:0,active:0,maxActive:0};
  window.FinanceService={
    _arrayUnion:(...xs)=>xs,
    async commitAtomicWritePlan(plan){
      calls.primary++; calls.active++; calls.maxActive=Math.max(calls.maxActive,calls.active);
      if(controlledPrimary) await primaryGate.promise;
      calls.active--;
      const data=structuredClone(plan.transactions?.[0]?.data||{}); const id=`tx-${calls.primary}`; const row={id,...data};
      window.__store.transactions.push(row); window.__store.allTransactions=window.__store.transactions; window.allTransactions=window.__store.transactions;
      return {txIds:[id]};
    },
    async addFeeAuditSilent(){return {ok:true};},
    async deleteTransaction(id){ calls.del++; if(controlledDelete) await deleteGate.promise; if(deleteOutcome==='fail') throw new Error('mock-delete-fail'); },
    async getStudentTuitionTxs(){return [];}, async updateProfileAfterTxDelete(){}
  };
  window.TransactionDeleteIntegrity={analyzeTransactionDeleteImpact(tx){return {valid:true,failClosed:false,hasTuition:true,hasInventory:false,requiresInventoryRollback:false,isMixedBundle:false,isPureTuition:true,requiresProfileReconcile:true,studentName:tx.description||tx.studentName||'A',requiresExamRefresh:false,safeToHardDelete:true};}};
  window.reconcileStudentTuitionAfterDeletedTransaction=async(name,tx)=>{
    calls.reconcile++; if(reconcileOutcome==='fail') return {ok:false,reason:'mock-reconcile-fail'};
    const p=window.__store.profiles[name]; if(!p) return {ok:false,reason:'no-profile'};
    const removed=Array.isArray(tx.packageMonths)?tx.packageMonths:(tx.txMonth?[tx.txMonth]:[]);
    const remaining=(Array.isArray(p.paidMonths)?p.paidMonths:[]).filter(m=>!removed.includes(m));
    const nextPaidUntil=window.TuitionDebtCanonical.reconcilePaidUntilFromMonthEvidence(p,remaining,{allowRegression:true,removedMonths:removed});
    p.paidMonths=remaining; p.paidUntil=nextPaidUntil;
    return {ok:true,newPaidMonths:[...remaining],newPaidUntil:nextPaidUntil};
  };
  seq++; const {TuitionCommandBoundary:T}=await import(pathToFileURL(path.resolve('js/core/tuitionCommandBoundary.js')).href+`?f1c-b=${seq}`);
  const collect=(name='A',month='2026-09',amount=100000)=>T.collectTuition({studentName:name,months:[month],amount,branch:'CS1'});
  return {T,calls,collect,deleteGate,primaryGate};
}

// Exact in-flight duplicate still coalesces.
{
  const h=await makeHarness({controlledPrimary:true});
  const a=h.collect(); const b=h.collect(); await tick();
  check('23. exact in-flight duplicate still coalesces', h.calls.primary===1);
  h.primaryGate.resolve(); const [ra,rb]=await Promise.all([a,b]);
  check('24. exact in-flight duplicate returns one transaction result', h.calls.primary===1 && ra.txId===rb.txId);
}

// LR01: delete pending + recollect must wait lane, then create new tx after successful reconciliation.
{
  const h=await makeHarness({controlledDelete:true}); const first=await h.collect();
  const tx={id:first.txId,type:'Học phí',description:'A',packageMonths:['2026-09'],txMonth:'2026-09'};
  const del=h.T.deleteTuitionTransaction({txId:first.txId,transaction:tx,impact:{hasTuition:true,requiresProfileReconcile:true,studentName:'A'}}); await tick();
  let resolved=false; const second=h.collect().then(v=>{resolved=true;return v;}); await tick();
  check('25. LR01 completed replay does not resolve ahead of pending delete', !resolved && h.calls.primary===1);
  h.deleteGate.resolve(); await del; const r2=await second;
  check('26. LR01 delete success releases queued recollect to new tx', h.calls.primary===2 && r2.txId && r2.txId!==first.txId);
}
// LR02: delete failure => queued collect reuses still-valid tx, no new primary write.
{
  const h=await makeHarness({controlledDelete:true,deleteOutcome:'fail'}); const first=await h.collect();
  const tx={id:first.txId,type:'Học phí',description:'A',packageMonths:['2026-09']};
  const del=h.T.deleteTuitionTransaction({txId:first.txId,transaction:tx,impact:{hasTuition:true,requiresProfileReconcile:true,studentName:'A'}}).catch(e=>e); await tick();
  let resolved=false; const second=h.collect().then(v=>{resolved=true;return v;}); await tick(); check('27. LR02 collect waits for failing delete lane', !resolved);
  h.deleteGate.resolve(); await del; const r2=await second;
  check('28. LR02 delete failure preserves valid active replay with zero extra write', h.calls.primary===1 && r2.txId===first.txId && r2.completedReplay===true);
}
// LR03: delete success + reconcile failure => deleted tx can never replay; still-paid local state blocks new write.
{
  const h=await makeHarness({controlledDelete:true,reconcileOutcome:'fail'}); const first=await h.collect();
  const tx={id:first.txId,type:'Học phí',description:'A',packageMonths:['2026-09']};
  const del=h.T.deleteTuitionTransaction({txId:first.txId,transaction:tx,impact:{hasTuition:true,requiresProfileReconcile:true,studentName:'A'}}).catch(e=>e); await tick();
  let resolved=false; const second=h.collect().then(v=>{resolved=true;return v;}); await tick(); check('29. LR03 queued collect waits through delete/reconcile lane', !resolved);
  h.deleteGate.resolve(); const de=await del; const r2=await second;
  check('30. LR03 deleted txId is never returned after delete success/reconcile fail', de?.transactionDeleted===true && h.calls.primary===1 && r2.alreadySettled===true && r2.txId===null && r2.completedReplay!==true);
}

// Different profiles remain parallel (no global mutex).
{
  const h=await makeHarness({controlledPrimary:true,profiles:{A:{profileId:'pA',name:'A',branch:'CS1',tuitionFee:100000,paidUntil:'2026-08',paidMonths:['2026-08']},B:{profileId:'pB',name:'B',branch:'CS1',tuitionFee:100000,paidUntil:'2026-08',paidMonths:['2026-08']}}});
  const a=h.collect('A'), b=h.collect('B'); await tick(); check('31. different profiles still run in parallel', h.calls.primary===2 && h.calls.maxActive===2); h.primaryGate.resolve(); await Promise.all([a,b]);
}

// LB01–LB10 reversal-baseline behavior.
{
  globalThis.window=globalThis; globalThis.document={getElementById:()=>null}; seq++; await import(pathToFileURL(path.resolve('js/core/tuitionDebtCanonical.js')).href+`?f1c-lb=${seq}`); const C=window.TuitionDebtCanonical;
  const recon=(p,remaining,removed)=>C.reconcilePaidUntilFromMonthEvidence(p,remaining,{allowRegression:true,removedMonths:removed});
  check('32. LB02 Aug + explicit Oct, delete Oct => Aug', recon({paidUntil:'2026-08',paidMonths:['2026-10']},[],['2026-10'])==='2026-08');
  check('33. LB03 Aug + Oct/Nov, delete Nov => Aug baseline', recon({paidUntil:'2026-08',paidMonths:['2026-10','2026-11']},['2026-10'],['2026-11'])==='2026-08');
  check('34. LB04 middle-gap Sep removal from Oct boundary => Aug', recon({paidUntil:'2026-10',paidMonths:['2026-08','2026-09','2026-10']},['2026-08','2026-10'],['2026-09'])==='2026-08');
  check('35. LB05 delete current Oct boundary => Sep', recon({paidUntil:'2026-10',paidMonths:[]},[],['2026-10'])==='2026-09');
  check('36. LB06 delete future Dec preserves Oct', recon({paidUntil:'2026-10',paidMonths:['2026-12']},[],['2026-12'])==='2026-10');
  check('37. LB07 delete Sep regresses to Aug while future Dec can remain explicit', recon({paidUntil:'2026-10',paidMonths:['2026-12']},['2026-12'],['2026-09'])==='2026-08');
  check('38. LB08 skipped month precedence is preserved during boundary regression', recon({paidUntil:'2026-10',paidMonths:['2026-10'],skippedMonths:['2026-09']},[],['2026-10'])==='2026-08');
}
// LB01 dynamic collect future Oct then delete future Oct preserves legacy Aug.
{
  const h=await makeHarness({profiles:{A:{profileId:'pA',name:'A',branch:'CS1',tuitionFee:100000,paidUntil:'2026-08',paidMonths:[],skippedMonths:[]}}});
  const c=await h.collect('A','2026-10'); let p=window.__store.profiles.A;
  const afterCollect=p.paidUntil==='2026-08'&&p.paidMonths.includes('2026-10');
  await h.T.deleteTuitionTransaction({txId:c.txId,transaction:{id:c.txId,type:'Học phí',description:'A',packageMonths:['2026-10'],txMonth:'2026-10'},impact:{hasTuition:true,requiresProfileReconcile:true,studentName:'A'}}); p=window.__store.profiles.A;
  check('39. LB01 future-gap collect then delete restores legacy Aug baseline', afterCollect && p.paidUntil==='2026-08' && !p.paidMonths.includes('2026-10'), JSON.stringify(p));
}
// LB09 reconcile failure leaves current local legacy state untouched.
{
  const h=await makeHarness({reconcileOutcome:'fail',profiles:{A:{profileId:'pA',name:'A',branch:'CS1',tuitionFee:100000,paidUntil:'2026-08',paidMonths:['2026-10'],skippedMonths:[]}}});
  let err; try { await h.T.deleteTuitionTransaction({txId:'tx-oct',transaction:{id:'tx-oct',type:'Học phí',description:'A',packageMonths:['2026-10']},impact:{hasTuition:true,requiresProfileReconcile:true,studentName:'A'}}); } catch(e){err=e;}
  const p=window.__store.profiles.A; check('40. LB09 reconcile failure does not corrupt local legacy baseline', err?.transactionDeleted===true && p.paidUntil==='2026-08' && p.paidMonths.includes('2026-10'));
}
// LB10 delete future gap then recollect creates a fresh tx and keeps baseline.
{
  const h=await makeHarness({profiles:{A:{profileId:'pA',name:'A',branch:'CS1',tuitionFee:100000,paidUntil:'2026-08',paidMonths:[],skippedMonths:[]}}});
  const c1=await h.collect('A','2026-10'); await h.T.deleteTuitionTransaction({txId:c1.txId,transaction:{id:c1.txId,type:'Học phí',description:'A',packageMonths:['2026-10']},impact:{hasTuition:true,requiresProfileReconcile:true,studentName:'A'}}); const c2=await h.collect('A','2026-10'); const p=window.__store.profiles.A;
  check('41. LB10 future-gap recollect creates new tx and preserves legacy baseline', h.calls.primary===2 && c2.txId!==c1.txId && p.paidUntil==='2026-08' && p.paidMonths.includes('2026-10'));
}

// Middle-gap and transaction-fallback regressions remain explicitly checked.
{
  globalThis.window=globalThis; globalThis.document={getElementById:()=>null}; seq++; await import(pathToFileURL(path.resolve('js/core/tuitionDebtCanonical.js')).href+`?f1c-reg=${seq}`); const C=window.TuitionDebtCanonical;
  const base={profileId:'pA',name:'A',paidUntil:'2026-08',paidMonths:['2026-08','2026-10'],skippedMonths:[]};
  check('42. F1B middle-gap settlement remains Sep unpaid / Oct paid', C.getTuitionMonthSettlement(base,'2026-09',{allowTransactionFallback:false}).paid===false && C.getTuitionMonthSettlement(base,'2026-10',{allowTransactionFallback:false}).paid===true);
  const txp={profileId:'pA',name:'A',paidUntil:'',paidMonths:[]};
  check('43. F1B packageMonths fallback remains correct', C.getTuitionMonthSettlement(txp,'2026-10',{name:'A',transactions:[{type:'Học phí',profileId:'pA',packageMonths:['2026-10']}]}).paid===true);
  check('44. F1B txMonth fallback remains correct', C.getTuitionMonthSettlement(txp,'2026-10',{name:'A',transactions:[{type:'Học phí',profileId:'pA',txMonth:'2026-10'}]}).paid===true);
  check('45. deleted transaction is excluded from fallback evidence', C.getTuitionMonthSettlement(txp,'2026-10',{name:'A',transactions:[{type:'Học phí',profileId:'pA',txMonth:'2026-10',deleted:true}]}).paid===false);
}

const parity=spawnSync(process.execPath,['tools/check-root-public-parity.mjs'],{encoding:'utf8'});
check('46. root/public parity', parity.status===0, (parity.stderr||parity.stdout||'').trim().slice(-500));
console.log(`\nFirestore static budget: ${counts.getDoc}/${counts.getDocs}/${counts.onSnapshot}`);
console.log(`Total: ${pass+fail} | PASS: ${pass} | FAIL: ${fail}`);
if(fail) process.exit(1);
console.log('H8R2.1C1F1C lane-aware replay / legacy gap gate PASS.');
