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

// Static ownership / authority checks.
check('1. canonical payment owner unchanged', /TuitionCommandBoundary\?\.collectTuition/.test(financeSrc) && /commitAtomicWritePlan\(/.test(boundarySrc));
check('2. no Firestore SDK import in TuitionCommandBoundary', !/from ['"]firebase/.test(boundarySrc));
check('3. canonical settled resolver lives in TuitionDebtCanonical', /function getTuitionMonthSettlement/.test(canonicalSrc) && /function areTuitionMonthsSettled/.test(canonicalSrc) && /owner\.areTuitionMonthsSettled/.test(boundarySrc));
check('4. 30s TTL remains memory management, not sole correctness guard', /COMPLETED_REPLAY_TTL_MS\s*=\s*30000/.test(boundarySrc) && /settlement\.allSettled/.test(boundarySrc));
check('5. successful reversal has narrow replay invalidation', /_invalidateCompletedReplayForTransaction\(id\)/.test(boundarySrc) && /String\(row\?\.txId/.test(boundarySrc));
check('6. failed reconciliation is not reported as successful reversal', /reconcileResult\?\.ok === false/.test(boundarySrc) && /tuition\/delete-reconcile-failed/.test(boundarySrc));
check('7. local reversal state only syncs after confirmed write', /if \(writeOk\) \{[\s\S]*st\.profiles/.test(mainSrc));
check('8. receipt retry path remains separate from collect writer', /js-print-tuition-receipt/.test(rendererSrc) && /exportReceipt/.test(appSrc) && !/js-print-tuition-receipt[\s\S]{0,800}collectTuition/.test(rendererSrc));
check('9. asset recovery F1 remains present', /asset\.promise\s*=\s*null/.test(lazySrc) && /asset\.generation/.test(lazySrc) && /ensureHtml2CanvasReady/.test(lazySrc));
check('10. receipt render queue remains serialized', /let _receiptRenderQueue = Promise\.resolve\(\)/.test(appSrc) && /_receiptRenderQueue\.then/.test(appSrc));
check('11. mobile branch authority remains singular', (htmlSrc.match(/id="filterBranch"/g)||[]).length===1 && !/mobileFilterBranch|filterBranchProxy/.test(htmlSrc+financeSrc+appSrc));

// Static Firestore budget.
function walk(dir,out=[]) { for (const e of fs.readdirSync(dir,{withFileTypes:true})) { const f=path.join(dir,e.name); if(e.isDirectory()){ if(!['migrations','diagnostics'].includes(e.name)) walk(f,out); } else if(e.name.endsWith('.js')) out.push(f); } return out; }
const runtime=['app.js',...walk('js')];
const pats={getDoc:/(?<![A-Za-z0-9_$])(?:getDoc|_getDoc|fbGetDoc)\s*\(/g,getDocs:/(?<![A-Za-z0-9_$])(?:getDocs|_getDocs|fbGetDocs|_pG4k)\s*\(/g,onSnapshot:/(?<![A-Za-z0-9_$])(?:onSnapshot|fbOnSnapshot)\s*\(/g};
const counts={getDoc:0,getDocs:0,onSnapshot:0};
for(const f of runtime) for(const line of read(f).split('\n')) { const t=line.trim(); if(t.startsWith('//')||t.startsWith('*')||t.startsWith('/*')) continue; for(const[k,re]of Object.entries(pats)){re.lastIndex=0;if(re.test(line))counts[k]++;} }
check('12. Firestore budget unchanged 29/45/16', counts.getDoc===29&&counts.getDocs===45&&counts.onSnapshot===16, JSON.stringify(counts));

let importSeq = 0;
async function makeHarness({clubId='clubA', profileName='StudentA', profile={profileId:'pA',branch:'CS1',tuitionFee:100000,paidUntil:'2026-01',paidMonths:['2026-01'],skippedMonths:[]}}={}) {
  globalThis.window = globalThis;
  window.userRole='admin'; window.currentUserEmail='qa@example.invalid'; window.currentUserUid='admin-1'; window.currentClubId=clubId;
  window.__verifiedAuthContextState={generation:1,uid:'admin-1'};
  window.__store={clubId,profiles:{[profileName]:structuredClone(profile)},transactions:[],allTransactions:[],currentUser:{uid:'admin-1'}};
  window.allProfiles=window.__store.profiles; window.allTransactions=[];
  window.guardFinancialWriteIntent=()=>true;window.isFinancialWriteAllowed=r=>r===true||r?.ok===true; window.recordFinancialActionAudit=()=>{}; window.recordRuntimeError=()=>{};
  window.studentProfileStore={getAllProfilesCompat(){return window.__store.profiles;},mergeProfile(k,v){window.__store.profiles[k]=v;window.allProfiles[k]=v;}};
  window.invalidateLists=()=>{}; window.refreshListsComputation=()=>{}; window.invalidateDashboard=()=>{}; window.invalidateList=()=>{};
  globalThis.document={getElementById:()=>null};
  importSeq++;
  await import(pathToFileURL(path.resolve('js/core/tuitionDebtCanonical.js')).href+`?f1a-canonical=${importSeq}`);
  const calls={primary:0,del:0,reconcile:0}; let deleteMode='ok', reconcileMode='ok';
  window.FinanceService={
    _arrayUnion:(...xs)=>xs,
    async commitAtomicWritePlan(){calls.primary++;return {txIds:[`tx-${calls.primary}`]};},
    async addFeeAuditSilent(){return {ok:true};},
    async deleteTransaction(){calls.del++;if(deleteMode==='fail')throw new Error('delete-fail');},
    async getStudentTuitionTxs(){return [];},
    async updateProfileAfterTxDelete(){},
  };
  window.TransactionDeleteIntegrity={analyzeTransactionDeleteImpact(tx){return {valid:true,failClosed:false,hasTuition:true,hasInventory:false,requiresInventoryRollback:false,isMixedBundle:false,isPureTuition:true,requiresProfileReconcile:true,studentName:tx.description||profileName,requiresExamRefresh:false,safeToHardDelete:true,tuitionMonths:tx.packageMonths||[]};}};
  window.reconcileStudentTuitionAfterDeletedTransaction=async(name,tx)=>{
    calls.reconcile++;
    if(reconcileMode==='fail') return {ok:false,reason:'mock-reconcile-fail'};
    const p=window.__store.profiles[name];
    const remove=Array.isArray(tx.packageMonths)?tx.packageMonths:(tx.txMonth?[tx.txMonth]:[]);
    p.paidMonths=(Array.isArray(p.paidMonths)?p.paidMonths:[]).filter(m=>!remove.includes(m));
    p.paidUntil=p.paidMonths.length?[...p.paidMonths].sort().at(-1):'';
    return {ok:true,newPaidMonths:p.paidMonths.slice(),newPaidUntil:p.paidUntil};
  };
  const mod=await import(pathToFileURL(path.resolve('js/core/tuitionCommandBoundary.js')).href+`?f1a-boundary=${importSeq}`);
  return {T:mod.TuitionCommandBoundary,calls,setDeleteMode:v=>deleteMode=v,setReconcileMode:v=>reconcileMode=v};
}

// ID01/ID02 — concurrent + immediate sequential.
{
  const h=await makeHarness(); let release;
  window.FinanceService.commitAtomicWritePlan=()=>{h.calls.primary++;return new Promise(res=>{release=()=>res({txIds:['tx-concurrent']});});};
  const cmd={studentName:'StudentA',months:['2026-02'],branch:'CS1',amount:100000};
  const a=h.T.collectTuition(cmd), b=h.T.collectTuition(cmd); await new Promise(r=>setTimeout(r,0)); const before=h.calls.primary; release(); const [ra,rb]=await Promise.all([a,b]);
  check('13. ID01 concurrent duplicate total primary delta +1', before===1&&h.calls.primary===1&&ra.txId===rb.txId);
  const seq=await h.T.collectTuition(cmd);
  check('14. ID02 immediate sequential replay adds 0', h.calls.primary===1&&seq.completedReplay===true);
}

// ID03/ID09 — correctness beyond TTL and after receipt failure-like stale retry.
{
  const realNow=Date.now; let now=realNow(); Date.now=()=>now;
  try {
    const h=await makeHarness(); const cmd={studentName:'StudentA',months:['2026-02'],branch:'CS1',amount:100000};
    await h.T.collectTuition(cmd); const before=h.calls.primary; now+=31001; const stale=await h.T.collectTuition(cmd);
    check('15. ID03 replay after >30s adds 0 primary writes', h.calls.primary===before&&stale.alreadySettled===true&&stale.primaryWritePerformed===false&&stale.txId===null);
    now+=5*60*1000; const receiptRetry=await h.T.collectTuition(cmd);
    check('16. ID09 stale collect after receipt failure cannot create second payment', h.calls.primary===before&&receiptRetry.alreadySettled===true);
  } finally { Date.now=realNow; }
}

// ID04/ID15 — context cleanup/eviction does not remove correctness.
{
  const h=await makeHarness(); const cmd={studentName:'StudentA',months:['2026-02'],branch:'CS1',amount:100000};
  await h.T.collectTuition(cmd); const before=h.calls.primary; window.__verifiedAuthContextState.generation=2;
  const r=await h.T.collectTuition(cmd); const m=h.T.getMetrics();
  check('17. ID04 completed-map/context eviction still blocks paid command', h.calls.primary===before&&r.alreadySettled===true&&r.txId===null);
  check('18. ID15 auth generation change clears old replay memory lazily', m.completedReplayCount===0&&String(m.completedReplayContextToken).includes('|2|'));
}

// ID05 — fresh module boundary with canonical paid profile.
{
  const h=await makeHarness({profile:{profileId:'pA',branch:'CS1',tuitionFee:100000,paidUntil:'2026-09',paidMonths:['2026-09'],skippedMonths:[]}});
  const r=await h.T.collectTuition({studentName:'StudentA',months:['2026-09'],branch:'CS1',amount:100000});
  check('19. ID05 empty completed map + canonical paid profile adds 0', h.calls.primary===0&&r.alreadySettled===true&&r.primaryWritePerformed===false&&r.txId===null);
}

// ID06-ID08 — legitimate different payment dimensions remain allowed.
{
  const h=await makeHarness({profile:{profileId:'pA',branch:'CS1',tuitionFee:100000,paidUntil:'2026-09',paidMonths:['2026-09'],skippedMonths:[]}});
  await h.T.collectTuition({studentName:'StudentA',months:['2026-10'],branch:'CS1',amount:100000});
  check('20. ID06 different unpaid month is allowed (+1)', h.calls.primary===1);
}
{
  const h=await makeHarness(); window.__store.profiles.StudentB={profileId:'pB',branch:'CS1',tuitionFee:100000,paidUntil:'2026-01',paidMonths:['2026-01']};
  await h.T.collectTuition({studentName:'StudentB',months:['2026-02'],branch:'CS1',amount:100000});
  check('21. ID07 different student is allowed (+1)', h.calls.primary===1);
}
{
  const h=await makeHarness({clubId:'clubB'}); await h.T.collectTuition({studentName:'StudentA',months:['2026-02'],branch:'CS1',amount:100000});
  check('22. ID08 different club is allowed (+1)', h.calls.primary===1);
}

// ID10 — delete success invalidates exact tx replay, reconciles profile, recollect is legitimate +1.
{
  const h=await makeHarness(); const cmd={studentName:'StudentA',months:['2026-02'],branch:'CS1',amount:100000};
  const first=await h.T.collectTuition(cmd); const tx={id:first.txId,type:'Học phí',description:'StudentA',amount:100000,packageMonths:['2026-02'],txMonth:'2026-02'};
  const del=await h.T.deleteTuitionTransaction({txId:first.txId,transaction:tx,impact:{hasTuition:true,requiresProfileReconcile:true,studentName:'StudentA',requiresExamRefresh:false}});
  const before=h.calls.primary; const second=await h.T.collectTuition(cmd);
  check('23. ID10 successful reversal invalidates matching replay after reconcile', del.completedReplayInvalidated===1&&h.calls.reconcile===1);
  check('24. ID10 recollect after successful reversal is +1 with new txId', h.calls.primary===before+1&&second.txId&&second.txId!==first.txId);
}

// ID11 — delete failure retains replay/paid state and no tx-2.
{
  const h=await makeHarness(); const cmd={studentName:'StudentA',months:['2026-02'],branch:'CS1',amount:100000};
  const first=await h.T.collectTuition(cmd); h.setDeleteMode('fail'); let failed=false;
  try { await h.T.deleteTuitionTransaction({txId:first.txId,transaction:{id:first.txId,type:'Học phí',description:'StudentA',packageMonths:['2026-02']},impact:{hasTuition:true,requiresProfileReconcile:true,studentName:'StudentA'}}); } catch { failed=true; }
  const before=h.calls.primary; const replay=await h.T.collectTuition(cmd);
  check('25. ID11 failed delete does not invalidate replay and adds 0', failed&&h.calls.primary===before&&replay.txId===first.txId);
}

// ID12 — package reversal reopens the exact affected months under existing reversal semantics.
{
  const h=await makeHarness({profile:{profileId:'pA',branch:'CS1',tuitionFee:100000,paidUntil:'2026-08',paidMonths:['2026-08'],skippedMonths:[]}});
  const cmd={studentName:'StudentA',months:['2026-09','2026-10'],branch:'CS1',amount:200000}; const first=await h.T.collectTuition(cmd);
  const tx={id:first.txId,type:'Học phí',description:'StudentA',amount:200000,packageMonths:['2026-09','2026-10'],txMonth:'2026-10'};
  await h.T.deleteTuitionTransaction({txId:first.txId,transaction:tx,impact:{hasTuition:true,requiresProfileReconcile:true,studentName:'StudentA',requiresExamRefresh:false}});
  const before=h.calls.primary; await h.T.collectTuition(cmd);
  check('26. ID12 multi-month delete reopens affected months and recollect is +1', window.__store.profiles.StudentA.paidUntil==='2026-10'&&h.calls.primary===before+1);
}

// ID13/ID14 — actual canonical helper semantics.
{
  globalThis.window=globalThis; importSeq++; await import(pathToFileURL(path.resolve('js/core/tuitionDebtCanonical.js')).href+`?f1a-sem=${importSeq}`);
  const skipped=window.TuitionDebtCanonical.getTuitionMonthSettlement({paidUntil:'2026-10',paidMonths:['2026-10'],skippedMonths:['2026-09']},'2026-09');
  const legacy=window.TuitionDebtCanonical.getTuitionMonthSettlement({paidUntil:'2026-09',skippedMonths:[]},'2026-09');
  check('27. ID13 skipped month is not misclassified as paid', skipped.paid===false&&skipped.skipped===true);
  check('28. ID14 legacy paidUntil is handled by canonical helper', legacy.paid===true&&legacy.reason==='legacy-paid-until');
}

// ID16 — reprint is receipt-only and does not invoke payment command.
check('29. ID16 receipt reprint path is payment-write free', /data-action="print-tuition-receipt"/.test(rendererSrc) && !/print-tuition-receipt[\s\S]{0,1000}collectTuition/.test(rendererSrc));

const parity=spawnSync(process.execPath,['tools/check-root-public-parity.mjs'],{encoding:'utf8'});
check('30. root/public parity', parity.status===0, (parity.stderr||parity.stdout||'').trim().slice(-500));

console.log(`\nFirestore static budget: ${counts.getDoc}/${counts.getDocs}/${counts.onSnapshot}`);
console.log(`Total: ${pass+fail} | PASS: ${pass} | FAIL: ${fail}`);
if(fail) process.exit(1);
console.log('H8R2.1C1F1A reversal/stale-duplicate gate PASS.');
