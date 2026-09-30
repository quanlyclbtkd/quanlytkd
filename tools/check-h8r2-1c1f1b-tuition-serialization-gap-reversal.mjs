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
const rendererSrc = read('js/ui/render/computation/financeRenderer.js');
let pass = 0, fail = 0;
const check = (name, ok, detail='') => { if (ok) { pass++; console.log('✅ '+name); } else { fail++; console.error('❌ '+name+(detail?' — '+detail:'')); } };

// Static architecture / ownership assertions.
check('1. one canonical tuition writer remains', /TuitionCommandBoundary\?\.collectTuition/.test(financeSrc) && /commitAtomicWritePlan\(/.test(boundarySrc));
check('2. per-profile mutation lane exists in TuitionCommandBoundary', /const profileMutationLanes = new Map\(\)/.test(boundarySrc) && /_withProfileMutationLane/.test(boundarySrc));
check('3. lane key includes club/profile', /function _profileLaneKey\(clubId, profileId\)/.test(boundarySrc));
check('4. no global mutation lock', !/globalMutationLock|paymentMutex|tuitionGlobalLane/.test(boundarySrc));
check('5. collect is wrapped by profile lane', /_run\('tuition\.collect'[\s\S]*_withProfileMutationLane\(profileLaneKey/.test(boundarySrc));
check('6. delete/reversal is wrapped by same profile lane owner', /_run\('tuition\.deleteTransaction'[\s\S]*_withProfileMutationLane\(deleteProfileLaneKey/.test(boundarySrc));
check('7. settlement is re-resolved inside lane', /_withProfileMutationLane\(profileLaneKey[\s\S]*const latestProfile = _profiles\(\)\[name\][\s\S]*_canonicalSettlement\(latestProfile/.test(boundarySrc));
check('8. correctness no longer depends on TTL', /COMPLETED_REPLAY_TTL_MS\s*=\s*30000/.test(boundarySrc) && /settlement\.allSettled/.test(boundarySrc) && /reconcilePaidUntilFromMonthEvidence/.test(boundarySrc));
check('9. explicit paidMonths after paidUntil are recognized', /if \(paidMonths\.includes\(target\)\)/.test(canonicalSrc));
check('10. skippedMonths has first precedence', canonicalSrc.indexOf("skippedMonths.includes(target)") < canonicalSrc.indexOf('paidMonths.includes(target)'));
check('11. gap month can remain unpaid while later month is paid', /futurePaidMonthsAfterPaidUntil/.test(canonicalSrc) && /paidMonths-after-paidUntil-preserved/.test(canonicalSrc));
check('12. legacy paidUntil semantics remain', /reason: 'legacy-paid-until'/.test(canonicalSrc));
check('13. packageMonths transaction fallback exists', /Array\.isArray\(tx\.packageMonths\)/.test(canonicalSrc));
check('14. txMonth transaction fallback exists', /tx\.txMonth/.test(canonicalSrc));
check('15. description is legacy identity fallback after stable identity', canonicalSrc.indexOf('stableProfileId && txStableId') < canonicalSrc.indexOf('legacyDescription'));
check('16. deleted/reversed transaction evidence is rejected', /tx\.deleted === true/.test(canonicalSrc) && /status === 'deleted' \|\| status === 'reversed'/.test(canonicalSrc));
check('17. delete success immediately invalidates replay before reconciliation', boundarySrc.indexOf('completedReplayInvalidated = _invalidateCompletedReplayForTransaction(id)') < boundarySrc.indexOf('reconcileStudentTuitionAfterDeletedTransaction'));
check('18. reconcile failure cannot restore deleted tx replay', /transactionDeleted = true[\s\S]*_invalidateCompletedReplayForTransaction\(id\)[\s\S]*tuition\/delete-reconcile-failed/.test(boundarySrc));
check('19. failed delete does not invalidate replay', boundarySrc.indexOf('await _service().deleteTransaction(id)') < boundarySrc.indexOf('_invalidateCompletedReplayForTransaction(id)'));
check('20. receipt reprint remains payment-write free', /data-action="print-tuition-receipt"/.test(rendererSrc) && !/print-tuition-receipt[\s\S]{0,1200}collectTuition/.test(rendererSrc));
check('21. asset recovery F1 preserved', /asset\.promise\s*=\s*null/.test(lazySrc) && /asset\.generation/.test(lazySrc) && /ensureHtml2CanvasReady/.test(lazySrc));
check('22. fee_audit remains secondary', /void _service\(\)\.addFeeAuditSilent/.test(boundarySrc) && !/await _service\(\)\.addFeeAuditSilent/.test(boundarySrc));
check('23. receipt render queue preserved', /let _receiptRenderQueue = Promise\.resolve\(\)/.test(appSrc));
check('24. one filterBranch authority remains', (htmlSrc.match(/id="filterBranch"/g)||[]).length === 1 && !/mobileFilterBranch|filterBranchProxy/.test(htmlSrc+financeSrc+appSrc));
check('25. main reversal helper delegates to canonical gap reconciler', /TuitionDebtCanonical\.reconcilePaidUntilFromMonthEvidence/.test(mainSrc));

function walk(dir,out=[]) { for (const e of fs.readdirSync(dir,{withFileTypes:true})) { const f=path.join(dir,e.name); if(e.isDirectory()){ if(!['migrations','diagnostics'].includes(e.name)) walk(f,out); } else if(e.name.endsWith('.js')) out.push(f); } return out; }
const runtime=['app.js',...walk('js')];
const pats={getDoc:/(?<![A-Za-z0-9_$])(?:getDoc|_getDoc|fbGetDoc)\s*\(/g,getDocs:/(?<![A-Za-z0-9_$])(?:getDocs|_getDocs|fbGetDocs|_pG4k)\s*\(/g,onSnapshot:/(?<![A-Za-z0-9_$])(?:onSnapshot|fbOnSnapshot)\s*\(/g};
const counts={getDoc:0,getDocs:0,onSnapshot:0};
for(const f of runtime) for(const line of read(f).split('\n')) { const t=line.trim(); if(t.startsWith('//')||t.startsWith('*')||t.startsWith('/*')) continue; for(const[k,re]of Object.entries(pats)){re.lastIndex=0;if(re.test(line))counts[k]++;} }
check('26. no new getDoc', counts.getDoc===29, JSON.stringify(counts));
check('27. no new getDocs', counts.getDocs===45, JSON.stringify(counts));
check('28. no new onSnapshot', counts.onSnapshot===16, JSON.stringify(counts));
check('29. Firestore budget 29/45/16', counts.getDoc===29&&counts.getDocs===45&&counts.onSnapshot===16, JSON.stringify(counts));

let importSeq=0;
async function makeHarness({clubId='clubA', profiles, delayMode=false}={}) {
  globalThis.window=globalThis;
  window.userRole='admin'; window.currentUserEmail='qa@example.invalid'; window.currentUserUid='admin-1'; window.currentClubId=clubId;
  window.__verifiedAuthContextState={generation:1,uid:'admin-1'};
  const baseProfiles=profiles||{A:{profileId:'pA',memberId:'M-A',name:'A',branch:'CS1',tuitionFee:100000,paidUntil:'2026-08',paidMonths:['2026-08'],skippedMonths:[]}};
  window.__store={clubId,profiles:structuredClone(baseProfiles),transactions:[],allTransactions:[],currentUser:{uid:'admin-1'}};
  window.allProfiles=window.__store.profiles; window.allTransactions=window.__store.transactions;
  window.guardFinancialWriteIntent=()=>true;window.isFinancialWriteAllowed=r=>r===true||r?.ok===true; window.recordFinancialActionAudit=()=>{}; window.recordRuntimeError=()=>{};
  window.studentProfileStore={getAllProfilesCompat(){return window.__store.profiles;},mergeProfile(k,v){window.__store.profiles[k]=v;window.allProfiles[k]=v;}};
  window.invalidateLists=()=>{}; window.refreshListsComputation=()=>{}; window.invalidateDashboard=()=>{}; window.invalidateList=()=>{};
  globalThis.document={getElementById:()=>null};
  importSeq++; await import(pathToFileURL(path.resolve('js/core/tuitionDebtCanonical.js')).href+`?f1b-canonical=${importSeq}`);
  const calls={primary:0,active:0,maxActive:0,started:[],del:0,reconcile:0};
  let deleteMode='ok', reconcileMode='ok', failNextPrimary=false, controlled=delayMode; const releases=[];
  window.FinanceService={
    _arrayUnion:(...xs)=>xs,
    async commitAtomicWritePlan(plan){
      calls.primary++; calls.active++; calls.maxActive=Math.max(calls.maxActive,calls.active);
      const txData=structuredClone(plan.transactions?.[0]?.data||{}); calls.started.push({name:txData.description,months:[...(txData.packageMonths||[])],amount:Number(txData.amount)||0});
      if (failNextPrimary){failNextPrimary=false;calls.active--;throw new Error('mock-primary-fail');}
      if (controlled) await new Promise(resolve=>releases.push(resolve));
      calls.active--;
      const id=`tx-${calls.primary}`; const row={id,...txData}; window.__store.transactions.push(row); window.__store.allTransactions=window.__store.transactions; window.allTransactions=window.__store.transactions;
      return {txIds:[id]};
    },
    async addFeeAuditSilent(){return {ok:true};},
    async deleteTransaction(id){calls.del++; if(deleteMode==='fail') throw new Error('mock-delete-fail');},
    async getStudentTuitionTxs(){return [];},
    async updateProfileAfterTxDelete(){},
  };
  window.TransactionDeleteIntegrity={analyzeTransactionDeleteImpact(tx){return {valid:true,failClosed:false,hasTuition:true,hasInventory:false,requiresInventoryRollback:false,isMixedBundle:false,isPureTuition:true,requiresProfileReconcile:true,studentName:tx.description||tx.studentName||'A',requiresExamRefresh:false,safeToHardDelete:true};}};
  window.reconcileStudentTuitionAfterDeletedTransaction=async(name,tx)=>{
    calls.reconcile++; if(reconcileMode==='fail') return {ok:false,reason:'mock-reconcile-fail'};
    const p=window.__store.profiles[name]; if(!p) return {ok:false,reason:'no-profile'};
    const remove=Array.isArray(tx.packageMonths)?tx.packageMonths:(tx.txMonth?[tx.txMonth]:[]);
    p.paidMonths=(Array.isArray(p.paidMonths)?p.paidMonths:[]).filter(m=>!remove.includes(m));
    p.paidUntil=window.TuitionDebtCanonical.reconcilePaidUntilFromMonthEvidence(p,p.paidMonths,{allowRegression:true});
    return {ok:true,newPaidMonths:[...p.paidMonths],newPaidUntil:p.paidUntil};
  };
  importSeq++; const mod=await import(pathToFileURL(path.resolve('js/core/tuitionCommandBoundary.js')).href+`?f1b-boundary=${importSeq}`);
  return {T:mod.TuitionCommandBoundary,calls,setDeleteMode:v=>deleteMode=v,setReconcileMode:v=>reconcileMode=v,setFailNextPrimary:v=>failNextPrimary=v,setControlled:v=>controlled=v,releaseOne(){releases.shift()?.();},releaseAll(){while(releases.length)releases.shift()?.();}};
}
const collect=(h,name,month,amount=100000)=>h.T.collectTuition({studentName:name,months:Array.isArray(month)?month:[month],branch:'CS1',amount});

// ML01 / ML02 — same profile serializes even when invocation order reverses.
{
  const h=await makeHarness({delayMode:true}); const a=collect(h,'A','2026-09'), b=collect(h,'A','2026-10');
  await new Promise(r=>setTimeout(r,0)); const firstOnly=h.calls.primary===1&&h.calls.maxActive===1; h.releaseOne(); await new Promise(r=>setTimeout(r,0)); h.releaseOne(); await Promise.all([a,b]);
  const p=window.__store.profiles.A;
  check('30. ML01 same-profile Sep+Oct serialize with +2 legitimate writes', firstOnly&&h.calls.primary===2&&h.calls.maxActive===1&&p.paidUntil==='2026-10'&&p.paidMonths.includes('2026-09')&&p.paidMonths.includes('2026-10'), JSON.stringify({calls:h.calls,p}));
}
{
  const h=await makeHarness(); const [oct,sep]=await Promise.all([collect(h,'A','2026-10'),collect(h,'A','2026-09')]); const p=window.__store.profiles.A;
  check('31. ML02 reverse invocation Oct+Sep does not regress paidUntil', h.calls.primary===2&&p.paidUntil==='2026-10'&&p.paidMonths.includes('2026-09')&&p.paidMonths.includes('2026-10')&&oct.paidUntil==='2026-08'&&sep.paidUntil==='2026-10', JSON.stringify({oct,sep,p}));
}
// ML03 / ML04 same-month variants.
{
  const h=await makeHarness(); await Promise.all([collect(h,'A','2026-09',100000),collect(h,'A','2026-09',100000)]);
  check('32. ML03 same month/same amount concurrent total +1', h.calls.primary===1);
}
{
  const h=await makeHarness(); const r=await Promise.all([collect(h,'A','2026-09',100000),collect(h,'A','2026-09',120000)]);
  check('33. ML04 same month/different amount rechecks settlement and total +1', h.calls.primary===1&&r.some(x=>x.alreadySettled===true));
}
// ML05 different profiles overlap.
{
  const h=await makeHarness({delayMode:true,profiles:{A:{profileId:'pA',name:'A',branch:'CS1',tuitionFee:100000,paidUntil:'2026-08',paidMonths:['2026-08']},B:{profileId:'pB',name:'B',branch:'CS1',tuitionFee:100000,paidUntil:'2026-08',paidMonths:['2026-08']}}});
  const a=collect(h,'A','2026-09'), b=collect(h,'B','2026-09'); await new Promise(r=>setTimeout(r,0)); const overlapped=h.calls.primary===2&&h.calls.maxActive===2; h.releaseAll(); await Promise.all([a,b]);
  check('34. ML05 different profiles need not serialize', overlapped&&h.calls.primary===2, JSON.stringify(h.calls));
}
// ML06 / ML07 first failure does not poison lane.
{
  const h=await makeHarness(); h.setFailNextPrimary(true); let failed=false; try{await collect(h,'A','2026-09')}catch{failed=true}; const r=await collect(h,'A','2026-09');
  check('35. ML06-07 failed mutation cleans lane and next mutation runs', failed&&h.calls.primary===2&&r.ok===true&&h.T.getMetrics().profileMutationLaneCount===0);
}
// ML08 updated local profile seen by second command.
{
  const h=await makeHarness(); const a=collect(h,'A','2026-09'), b=collect(h,'A','2026-09',120000); const [,r2]=await Promise.all([a,b]);
  check('36. ML08 second mutation sees updated profile state', h.calls.primary===1&&r2.alreadySettled===true&&r2.primaryWritePerformed===false);
}
// ML09 replay + lane; ML10 cleanup.
{
  const h=await makeHarness(); const first=await collect(h,'A','2026-09'); const before=h.calls.primary; const replay=await collect(h,'A','2026-09');
  check('37. ML09 completed replay coexists with profile lane', h.calls.primary===before&&replay.txId===first.txId&&replay.completedReplay===true);
  check('38. ML10 profile lane cleanup returns to zero', h.T.getMetrics().profileMutationLaneCount===0);
}

// GS01–GS10 canonical gap settlement semantics.
{
  globalThis.window=globalThis; globalThis.document={getElementById:()=>null}; importSeq++; await import(pathToFileURL(path.resolve('js/core/tuitionDebtCanonical.js')).href+`?f1b-gs=${importSeq}`); const C=window.TuitionDebtCanonical;
  const st=(p,m,opt={allowTransactionFallback:false})=>C.getTuitionMonthSettlement(p,m,opt);
  check('39. GS01 contiguous paidUntil Oct remains paid', st({paidUntil:'2026-10',paidMonths:['2026-08','2026-09','2026-10']},'2026-10').paid===true);
  check('40. GS02 paidUntil Aug + paidMonths Oct => Oct paid', st({paidUntil:'2026-08',paidMonths:['2026-08','2026-10']},'2026-10').paid===true);
  check('41. GS03 paidUntil Aug + paidMonths Oct => Sep unpaid', st({paidUntil:'2026-08',paidMonths:['2026-08','2026-10']},'2026-09').paid===false);
  check('42. GS04 skipped month wins over paidUntil/paidMonths', (()=>{const x=st({paidUntil:'2026-10',paidMonths:['2026-09'],skippedMonths:['2026-09']},'2026-09');return x.skipped===true&&x.paid===false;})());
  check('43. GS05 gap recollect advances contiguous paidUntil through later paid month', C.reconcilePaidUntilFromMonthEvidence({paidUntil:'2026-08',paidMonths:['2026-08','2026-10']},['2026-08','2026-09','2026-10'])==='2026-10');
  check('44. GS06 legacy paidUntil only remains supported', st({paidUntil:'2026-09'},'2026-09').reason==='legacy-paid-until');
  check('45. GS07 paidMonths-only evidence remains supported', st({paidUntil:'',paidMonths:['2026-09']},'2026-09').paid===true);
  check('46. GS08 future paid month after gap remains paid', st({paidUntil:'2026-08',paidMonths:['2026-08','2026-11']},'2026-11').paid===true);
  check('47. GS09 multiple gaps keep only explicit future months paid', st({paidUntil:'2026-08',paidMonths:['2026-08','2026-10','2026-12']},'2026-11').paid===false&&st({paidUntil:'2026-08',paidMonths:['2026-08','2026-10','2026-12']},'2026-12').paid===true);
  check('48. GS10 normal contiguous payment reconciliation unchanged', C.reconcilePaidUntilFromMonthEvidence({paidUntil:'2026-08',paidMonths:['2026-08','2026-09']},['2026-08','2026-09','2026-10'])==='2026-10');

  const p={profileId:'pA',memberId:'M-A',name:'Student A',paidUntil:'',paidMonths:[],skippedMonths:[]};
  const txState=(tx,m='2026-09')=>C.getTuitionMonthSettlement(p,m,{name:'Student A',transactions:[tx]});
  check('49. TF01 profileId + packageMonths fallback', txState({type:'Học phí',profileId:'pA',packageMonths:['2026-09']}).paid===true);
  check('50. TF02 profileId + txMonth fallback', txState({type:'Học phí',profileId:'pA',txMonth:'2026-09'}).paid===true);
  check('51. TF03 legacy description + packageMonths fallback', txState({type:'Học phí',description:'Student A',packageMonths:['2026-09']}).paid===true);
  check('52. TF04 legacy description + txMonth fallback', txState({type:'Học phí',description:'Student A',txMonth:'2026-09'}).paid===true);
  check('53. TF05 wrong stable student does not match same description', txState({type:'Học phí',profileId:'pB',description:'Student A',txMonth:'2026-09'}).paid===false);
  check('54. TF06 non-tuition transaction does not match', txState({type:'Thu Võ phục',profileId:'pA',description:'Student A',txMonth:'2026-09'}).paid===false);
  check('55. TF07 deleted transaction does not count', txState({type:'Học phí',profileId:'pA',txMonth:'2026-09',deleted:true}).paid===false);
  const future=C.getTuitionMonthSettlement({...p,paidUntil:'2026-08',paidMonths:['2026-08']},'2026-10',{name:'Student A',transactions:[{type:'Học phí',profileId:'pA',txMonth:'2026-10'}]});
  check('56. TF08 later valid transaction after gap counts', future.paid===true&&future.reason==='transaction-fallback');
}

// PR01–PR08 partial reversal replay invalidation.
{
  const h=await makeHarness(); const first=await collect(h,'A','2026-09'); const tx={id:first.txId,type:'Học phí',description:'A',packageMonths:['2026-09'],txMonth:'2026-09'};
  const d=await h.T.deleteTuitionTransaction({txId:first.txId,transaction:tx,impact:{hasTuition:true,requiresProfileReconcile:true,studentName:'A'}});
  check('57. PR01 delete success + reconcile success invalidates exact replay', d.ok===true&&d.completedReplayInvalidated===1&&window.__store.profiles.A.paidUntil==='2026-08');
}
{
  const h=await makeHarness(); const first=await collect(h,'A','2026-09'); h.setDeleteMode('fail'); let failed=false; try{await h.T.deleteTuitionTransaction({txId:first.txId,transaction:{id:first.txId,type:'Học phí',description:'A',packageMonths:['2026-09']},impact:{hasTuition:true,requiresProfileReconcile:true,studentName:'A'}})}catch{failed=true}; const replay=await collect(h,'A','2026-09');
  check('58. PR02 failed delete does not falsely invalidate replay', failed&&h.calls.primary===1&&replay.txId===first.txId&&replay.completedReplay===true);
}
{
  const h=await makeHarness(); const first=await collect(h,'A','2026-09'); h.setReconcileMode('fail'); let partial; try{await h.T.deleteTuitionTransaction({txId:first.txId,transaction:{id:first.txId,type:'Học phí',description:'A',packageMonths:['2026-09']},impact:{hasTuition:true,requiresProfileReconcile:true,studentName:'A'}})}catch(e){partial=e};
  check('59. PR03 delete success + reconcile fail still invalidates deleted tx replay', partial?.transactionDeleted===true&&h.T.getMetrics().completedReplayCount===0);
  const before=h.calls.primary; const blocked=await collect(h,'A','2026-09');
  check('60. PR04 still-paid profile blocks write but never returns deleted txId', h.calls.primary===before&&blocked.alreadySettled===true&&blocked.txId===null);
  window.__store.profiles.A.paidUntil='2026-08'; window.__store.profiles.A.paidMonths=['2026-08']; const next=await collect(h,'A','2026-09');
  check('61. PR05 later repaired unpaid profile recollects with new txId', h.calls.primary===before+1&&next.txId&&next.txId!==first.txId);
}
check('62. PR06 deleted transaction receipt reprint is not active-payment authority', !/print-tuition-receipt[\s\S]{0,1000}collectTuition/.test(rendererSrc));
{
  const h=await makeHarness(); const first=await collect(h,'A',['2026-09','2026-10'],200000); const tx={id:first.txId,type:'Học phí',description:'A',packageMonths:['2026-09','2026-10'],txMonth:'2026-10'}; await h.T.deleteTuitionTransaction({txId:first.txId,transaction:tx,impact:{hasTuition:true,requiresProfileReconcile:true,studentName:'A'}});
  check('63. PR07 multi-month reversal preserves existing reconcile semantics', window.__store.profiles.A.paidUntil==='2026-08'&&!window.__store.profiles.A.paidMonths.includes('2026-09')&&!window.__store.profiles.A.paidMonths.includes('2026-10'));
}
{
  const h=await makeHarness(); const a=await collect(h,'A','2026-09'); const b=await collect(h,'A','2026-10'); await h.T.deleteTuitionTransaction({txId:a.txId,transaction:{id:a.txId,type:'Học phí',description:'A',packageMonths:['2026-09']},impact:{hasTuition:true,requiresProfileReconcile:true,studentName:'A'}}); const m=h.T.getMetrics();
  check('64. PR08 txId invalidation is narrow and leaves unrelated replay entry', m.completedReplayCount>=1&&b.txId!==a.txId, JSON.stringify(m));
}

const parity=spawnSync(process.execPath,['tools/check-root-public-parity.mjs'],{encoding:'utf8'});
check('65. root/public parity', parity.status===0, (parity.stderr||parity.stdout||'').trim().slice(-500));

console.log(`\nFirestore static budget: ${counts.getDoc}/${counts.getDocs}/${counts.onSnapshot}`);
console.log(`Total: ${pass+fail} | PASS: ${pass} | FAIL: ${fail}`);
if(fail) process.exit(1);
console.log('H8R2.1C1F1B tuition serialization/gap/reversal gate PASS.');
