#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';

const root=process.cwd();
let pass=0, fail=0;
function check(name, cond, detail=''){ if(cond){pass++; console.log('✅',name);} else {fail++; console.error('❌',name+(detail?' — '+detail:''));} }
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
const sha=rel=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,rel))).digest('hex');

const baselineRed=JSON.parse(read('tools/fixtures/bstats-r1-1-baseline-red.json'));
check('BSTATS_ACCUMULATION_BASELINE_RED', baselineRed.baselineZipSha256==='968fa0cdc71747d53ee894834920b89359e5ed6543d8c80e25e790a3a20b39df' && baselineRed.BSTATS_SHARED_MUTATION_ACCUMULATION_RED?.red===true);
check('BSTATS_FINANCE_REFRESH_CACHE_HIT_ZERO_BASELINE_RED', baselineRed.BSTATS_FINANCE_REFRESH_STUDENTS_CACHE_HIT_ZERO_RED?.red===true);
check('BSTATS_LEGACY_BRANCH_BASELINE_RED', baselineRed.BSTATS_LEGACY_BRANCH_IDENTITY_RED?.red===true);
check('BSTATS_BRANCH_DEBT_AUTHORITY_MISMATCH_BASELINE_RED', baselineRed.BSTATS_BRANCH_DEBT_AUTHORITY_MISMATCH_RED?.red===true);

// Minimal browser-like runtime for computation modules.
globalThis.window=globalThis;
globalThis.performance={now:()=>Date.now()};
globalThis.location={hostname:'localhost'};
const elements={filterMonth:{value:'2026-10'},filterBranch:{value:'all'},searchInput:{value:''}};
globalThis.document={getElementById:id=>elements[id]||null};
window.__ENABLE_PERF_WARNINGS=false;
window.__store={clubId:'club-A',currentClubId:'club-A',clubConfig:{branchCount:3,branchName1:'Huỳnh Tấn Phát',branchName2:'Sân vận động Quy Nhơn',branchName3:'Cơ sở 3'},selectedMonth:'2026-10',transactionCoverage:{complete:true,pageServerComplete:true},_profileDataVersion:1,_tuitionEvidenceVersion:1,_settingsVersion:1};
window.normalizeVNForSearch=v=>String(v||'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/\s+/g,' ');
window.normalizeBranchCodeForStats=function(branchInput,branchCount){
  const cfg=window.__store?.clubConfig||window.clubConfig||{}; const raw=String(branchInput||'').trim(); if(!raw)return 'CS1';
  const m=raw.match(/^CS(\d+)$/i); if(m){const n=Number(m[1]); if(n>=1&&n<=(branchCount||cfg.branchCount||10)) return 'CS'+n;}
  const norm=window.normalizeVNForSearch(raw); const count=Number(branchCount||cfg.branchCount||10);
  if(['mac dinh','default','primary','co so mac dinh','cs 1','1'].includes(norm)) return 'CS1';
  for(let i=1;i<=count;i++){const code='CS'+i; const name=cfg['branchName'+i]||('Cơ sở '+i); const normName=window.normalizeVNForSearch(name); if(norm===normName||norm===('co so '+i)||norm===('coso '+i)) return code;}
  return raw.startsWith('CS')?raw:'CS1';
};
window.BranchIdentity={normalize(v,{fallback='CS1'}={}){ const n=window.normalizeBranchCodeForStats(v,window.__store?.clubConfig?.branchCount||1); return n||fallback; }};
window.classifyProfileStatus=p=>p?.status==='quit'?'quit':'active';
window.getDebtOverdueFilterValue=()=>Number(window.__store?._debtOverdueFilter||0);
window.getCurrentAdmissionMonth=()=> '2026-10';
window.isCurrentMonthNewStudent=()=>false;
window.shouldShowActiveStudentByNewFilter=()=>true;
window.sortActiveStudentEntries=x=>x;
window.getStudentJoinTimestamp=()=>0;
window.PerformanceMonitor={record(){}};
window.getBranchNameDisplay=b=>b;
window.getChargeableTuitionMonths=(p,sel)=>p?.feeExempt?[]:(String(p?.paidUntil||'')>=sel?[]:['2026-10']);
window.DebtProfileReadBoundary={markActiveSyncStage(){},clearFreshSyncOperations(){}};
let coverage={ready:true,presentationState:'FRESH',sameClub:true,clubId:'club-A',activeSource:{authoritySessionEpoch:7,activeOwnerUid:'admin-A'}};
window.getDebtProfileCoverageStatus=()=>coverage;

const students=await import(pathToFileURL(path.join(root,'js/ui/render/computation/studentsRenderer.js')).href+'?r1='+Date.now());
const dashboard=await import(pathToFileURL(path.join(root,'js/ui/render/computation/dashboardRenderer.js')).href+'?r1='+Date.now());

const params=(extra={})=>({curTabId:'active',selMonth:'2026-10',selBranch:'all',search:'',isSingleBranch:false,isAdmin:true,pgStudents:null,pgStudentsActive:false,activePage:1,debtPage:1,quitPage:1,...extra});
const mkFin=()=>({
 CS1:{income:100,active:0,debt:0,tuitionMap:{500000:2},examFeeMap:{250000:1},examRegisteredCount:1,examRegisteredNames:['Alice']},
 CS2:{income:200,active:0,debt:0,tuitionMap:{500000:1},examFeeMap:{},examRegisteredCount:0,examRegisteredNames:[]},
 CS3:{income:300,active:0,debt:0,tuitionMap:{},examFeeMap:{},customFinanceField:{x:1}}
});
const profiles={
 Alice:{status:'active',branch:'Mặc định',paidUntil:'2026-09',tuitionFee:500000,createdAt:'2026-01-01'},
 Bob:{status:'active',branch:'CS2',paidUntil:'2026-09',tuitionFee:500000,createdAt:'2026-01-01'},
 Carol:{status:'active',branch:'Cơ sở 3',paidUntil:'2026-10',tuitionFee:500000,createdAt:'2026-01-01'}
};
function deepFreeze(o){ if(!o||typeof o!=='object'||Object.isFrozen(o))return o; Object.freeze(o); Object.values(o).forEach(deepFreeze); return o; }
function clone(o){return JSON.parse(JSON.stringify(o));}

// Students owns member state; Finance remains immutable.
const fin=mkFin(); const finBefore=clone(fin); deepFreeze(fin);
students.computeAndCacheStudents(profiles,params());
let std=students.getStudentsSummary();
let composed=dashboard.composeDashboardBranchStats(fin,std);
check('FINANCE_BSTATS_IMMUTABLE_FROM_STUDENTS', JSON.stringify(fin)===JSON.stringify(finBefore));
check('STUDENTS_BRANCH_MEMBER_STATS_OWNED_LOCALLY', std?.branchMemberStats?.CS1?.active===1 && std?.branchMemberStats?.CS1?.debt===1 && std?.branchMemberStats?.CS2?.active===1 && std?.branchMemberStats?.CS2?.debt===1);
check('FRESH_BRANCH_DEBT_MATCHES_CURRENT_VERIFIED', std?.branchDebtPending===false && std?.branchDebtUpdating===false && composed.CS1.debt===1 && composed.CS2.debt===1);
check('DASHBOARD_BRANCH_STATS_COMPOSER_IS_PURE', JSON.stringify(fin)===JSON.stringify(finBefore) && composed!==fin && composed!==std.branchMemberStats && composed.CS1.tuitionMap!==fin.CS1.tuitionMap && composed.CS1.examRegisteredNames!==fin.CS1.examRegisteredNames);
check('FINANCE_MISS_STUDENTS_MISS_PARITY', composed.CS1.active===1 && composed.CS1.debt===1 && composed.CS3.active===1 && composed.CS3.debt===0);
check('PRESERVE_FINANCE_FIELDS', composed.CS1.income===100 && composed.CS1.tuitionMap[500000]===2 && composed.CS1.examFeeMap[250000]===1 && composed.CS1.examRegisteredCount===1 && composed.CS3.customFinanceField.x===1);

// Cache hit preserves Students-owned stats and Finance recompute cannot zero them.
const metricsBefore=students.getStudentsMetrics();
students.computeAndCacheStudents(profiles,params());
const metricsAfter=students.getStudentsMetrics();
std=students.getStudentsSummary(); const finRefresh=mkFin(); composed=dashboard.composeDashboardBranchStats(finRefresh,std);
check('STUDENTS_CACHE_HIT_PRESERVES_BRANCH_MEMBER_STATS', metricsAfter.cacheHits===metricsBefore.cacheHits+1 && composed.CS1.active===1 && composed.CS1.debt===1);
check('FINANCE_MISS_STUDENTS_HIT_PARITY', composed.CS1.active===1 && composed.CS2.active===1 && composed.CS1.debt===1 && composed.CS2.debt===1);
check('FINANCE_ONLY_UPDATE_DOES_NOT_ZERO_MEMBER_COUNTS', composed.CS1.active===1 && composed.CS1.debt===1 && composed.CS2.active===1 && composed.CS2.debt===1);

// Students MISS while Finance object stays same.
window.__store._profileDataVersion++;
const changedProfiles={...profiles, Dave:{status:'active',branch:'CS1',paidUntil:'2026-10',tuitionFee:500000,createdAt:'2026-01-01'}};
students.computeAndCacheStudents(changedProfiles,params());
std=students.getStudentsSummary(); const composedHitMiss=dashboard.composeDashboardBranchStats(finRefresh,std);
check('FINANCE_HIT_STUDENTS_MISS_PARITY', composedHitMiss.CS1.active===2 && composedHitMiss.CS1.debt===1);
const finAgain=mkFin(); const bothFresh=dashboard.composeDashboardBranchStats(finAgain,std);
check('FINANCE_HIT_STUDENTS_HIT_PARITY', bothFresh.CS1.active===2 && bothFresh.CS1.debt===1);

// Legacy/configured branch identity.
check('LEGACY_DEFAULT_BRANCH_MAPS_TO_CS1', window.normalizeBranchCodeForStats('Mặc định',3)==='CS1' && window.normalizeBranchCodeForStats('CS01',3)==='CS1' && window.normalizeBranchCodeForStats('cs 1',3)==='CS1' && window.normalizeBranchCodeForStats('default',3)==='CS1');
check('CONFIGURED_BRANCH_NAME_MAPS_CANONICALLY', window.normalizeBranchCodeForStats('Huỳnh Tấn Phát',3)==='CS1' && window.normalizeBranchCodeForStats('Sân vận động Quy Nhơn',3)==='CS2');

// Search recompute must not touch Finance. Update DOM to same presentation context.
elements.searchInput.value='ali';
students.computeAndCacheStudents(changedProfiles,params({search:'ali'}));
std=students.getStudentsSummary(); const searchOut=dashboard.composeDashboardBranchStats(finRefresh,std);
check('SEARCH_DOES_NOT_MUTATE_FINANCE', finRefresh.CS1.active===0 && finRefresh.CS1.debt===0 && searchOut.CS1.active===2 && searchOut.CS1.debt===1);

// Load-more is Students-only and must not depend on Finance bStats.
const refreshSrc=read('js/ui/render/listComputationRefresh.js');
const refreshStudentsBody=refreshSrc.slice(refreshSrc.indexOf('function _refreshStudents()'), refreshSrc.indexOf('function _refreshInventory()'));
check('LOAD_MORE_DOES_NOT_RECOMPUTE_FINANCE', !refreshStudentsBody.includes('getFinanceSummary') && !refreshStudentsBody.includes('computeAndCacheFinance') && !refreshStudentsBody.includes('bStats'));

// Debt authority: restore blank search and capture verified branch snapshot in matching context.
elements.searchInput.value=''; window.__store._profileDataVersion++; coverage={ready:true,presentationState:'FRESH',sameClub:true,clubId:'club-A',activeSource:{authoritySessionEpoch:7,activeOwnerUid:'admin-A'}};
students.computeAndCacheStudents(changedProfiles,params({curTabId:'debt'}));
let freshStd=students.getStudentsSummary();
check('BRANCH_DEBT_AUTHORITY_KEY_ISOLATION', freshStd.branchDebtPending===false && freshStd.branchMemberStats.CS1.debt===1);
coverage={ready:false,presentationState:'TRANSIENT_LOCAL_WRITE',sameClub:true,clubId:'club-A',activeSource:{authoritySessionEpoch:7,activeOwnerUid:'admin-A'}};
let transientStd=students.getStudentsSummary(); let transientOut=dashboard.composeDashboardBranchStats(mkFin(),transientStd);
check('TRANSIENT_BRANCH_DEBT_REUSES_LAST_VERIFIED', transientStd.debtCount===freshStd.debtCount && transientStd.branchDebtPending===false && transientStd.branchDebtUpdating===true && transientOut.CS1.debt===1 && transientOut.CS1.debtUpdating===true);
coverage={ready:false,presentationState:'TRANSIENT_LOCAL_WRITE',sameClub:true,clubId:'club-A',activeSource:{authoritySessionEpoch:8,activeOwnerUid:'admin-A'}};
let wrongAuthority=students.getStudentsSummary();
check('BRANCH_DEBT_AUTHORITY_KEY_ISOLATION_2', wrongAuthority.branchDebtPending===true && wrongAuthority.branchMemberStats?.CS1?.debt===null);
coverage={ready:false,presentationState:'NOT_READY',sameClub:false,clubId:'club-B',activeSource:{authoritySessionEpoch:9,activeOwnerUid:'admin-B'}};
let notReady=students.getStudentsSummary(); let notReadyOut=dashboard.composeDashboardBranchStats(mkFin(),notReady);
check('NOT_READY_BRANCH_DEBT_IS_NOT_FALSE_ZERO', notReady.branchDebtPending===true && notReadyOut.CS1.debt===null && notReadyOut.CS1.debtPending===true);
// Context mismatch cannot reuse verified branch debt.
coverage={ready:false,presentationState:'TRANSIENT_LOCAL_WRITE',sameClub:true,clubId:'club-A',activeSource:{authoritySessionEpoch:7,activeOwnerUid:'admin-A'}}; elements.searchInput.value='different-context';
let contextMismatch=students.getStudentsSummary();
check('BRANCH_DEBT_CONTEXT_KEY_ISOLATION', contextMismatch.branchDebtPending===true && contextMismatch.branchMemberStats===null);
elements.searchInput.value='';

// Coverage-state × cache-combination matrix (Finance MISS/HIT × Students MISS/HIT).
function _assertCoverageCacheMatrix(stateName, stateCoverage, profileSet, expected) {
  coverage=stateCoverage;
  const financeHit=mkFin();
  const outputs=[];
  for (const financeMiss of [true,false]) {
    for (const studentsMiss of [true,false]) {
      if (studentsMiss) window.__store._profileDataVersion++;
      students.computeAndCacheStudents(profileSet,params({curTabId:'debt'}));
      const summary=students.getStudentsSummary();
      const finInput=financeMiss?mkFin():financeHit;
      const out=dashboard.composeDashboardBranchStats(finInput,summary);
      outputs.push({financeMiss,studentsMiss,summary,out});
    }
  }
  return outputs.every(({summary,out})=>
    out.CS1?.active===expected.cs1Active && out.CS2?.active===expected.cs2Active &&
    out.CS1?.debt===expected.cs1Debt && out.CS2?.debt===expected.cs2Debt &&
    summary?.branchDebtPending===expected.pending && summary?.branchDebtUpdating===expected.updating
  );
}
window.__store.clubId='club-A'; window.__store.currentClubId='club-A'; elements.filterMonth.value='2026-10'; elements.searchInput.value='';
coverage={ready:true,presentationState:'FRESH',sameClub:true,clubId:'club-A',activeSource:{authoritySessionEpoch:7,activeOwnerUid:'admin-A'}};
window.__store._profileDataVersion++; students.computeAndCacheStudents(changedProfiles,params({curTabId:'debt'}));
check('COVERAGE_CACHE_MATRIX_FRESH', _assertCoverageCacheMatrix('FRESH',coverage,changedProfiles,{cs1Active:2,cs2Active:1,cs1Debt:1,cs2Debt:1,pending:false,updating:false}));
const localPendingProfiles={...changedProfiles,Alice:{...changedProfiles.Alice,paidUntil:'2026-10'}};
coverage={ready:false,presentationState:'TRANSIENT_LOCAL_WRITE',sameClub:true,clubId:'club-A',activeSource:{authoritySessionEpoch:7,activeOwnerUid:'admin-A'}};
check('COVERAGE_CACHE_MATRIX_TRANSIENT_LOCAL_WRITE', _assertCoverageCacheMatrix('TRANSIENT',coverage,localPendingProfiles,{cs1Active:2,cs2Active:1,cs1Debt:1,cs2Debt:1,pending:false,updating:true}));
coverage={ready:false,presentationState:'NOT_READY',sameClub:true,clubId:'club-A',activeSource:{authoritySessionEpoch:7,activeOwnerUid:'admin-A'}};
check('COVERAGE_CACHE_MATRIX_NOT_READY', _assertCoverageCacheMatrix('NOT_READY',coverage,localPendingProfiles,{cs1Active:2,cs2Active:1,cs1Debt:null,cs2Debt:null,pending:true,updating:false}));

// Search blank → A → B → clear: member branch stats are presentation-independent and Finance stays immutable.
coverage={ready:true,presentationState:'FRESH',sameClub:true,clubId:'club-A',activeSource:{authoritySessionEpoch:7,activeOwnerUid:'admin-A'}};
const searchFin=mkFin(); const searchFinBefore=clone(searchFin); let searchMatrixOk=true; const searchObserved=[];
const searchExpected=[['',1,1],['a',1,0],['bob',0,1],['',1,1]];
for (const [q,cs1Debt,cs2Debt] of searchExpected) {
  elements.searchInput.value=q; students.computeAndCacheStudents(changedProfiles,params({search:q}));
  const o=dashboard.composeDashboardBranchStats(searchFin,students.getStudentsSummary());
  searchObserved.push({q,cs1Active:o.CS1.active,cs1Debt:o.CS1.debt,cs2Active:o.CS2.active,cs2Debt:o.CS2.debt});
  searchMatrixOk=searchMatrixOk && o.CS1.active===2 && o.CS1.debt===cs1Debt && o.CS2.active===1 && o.CS2.debt===cs2Debt;
}
check('SEARCH_MATRIX_BLANK_A_B_CLEAR', searchMatrixOk && JSON.stringify(searchFin)===JSON.stringify(searchFinBefore), JSON.stringify(searchObserved));
elements.searchInput.value='';

// Load-more contexts remain Students-only and cannot accumulate counts.
let loadMoreOk=true; const loadMoreObserved=[];
for (const extra of [{activePage:2},{debtPage:2},{quitPage:2}]) {
  window._debtPage=Number(extra.debtPage || 1);
  students.computeAndCacheStudents(changedProfiles,params(extra));
  const o=dashboard.composeDashboardBranchStats(searchFin,students.getStudentsSummary());
  loadMoreObserved.push({extra,cs1Active:o.CS1.active,cs1Debt:o.CS1.debt,cs2Active:o.CS2.active,cs2Debt:o.CS2.debt,pending:o.CS1.debtPending});
  loadMoreOk=loadMoreOk && o.CS1.active===2 && o.CS1.debt===1 && o.CS2.active===1 && o.CS2.debt===1;
}
check('LOAD_MORE_MATRIX_ACTIVE_DEBT_QUIT',loadMoreOk && JSON.stringify(searchFin)===JSON.stringify(searchFinBefore), JSON.stringify(loadMoreObserved));
window._debtPage=1;

// Finance-only updates may change monetary/exam fields while Students cache hits retain member counts.
students.computeAndCacheStudents(changedProfiles,params()); const stableStd=students.getStudentsSummary();
const financeVariants=[
  f=>{f.CS1.income+=11;},
  f=>{f.CS2.income+=22;},
  f=>{f.CS1.examFeeMap[300000]=1;},
  f=>{f.CS3.customFinanceField={x:9};},
];
let financeOnlyOk=true;
for(const mutate of financeVariants){const f=mkFin();mutate(f);const o=dashboard.composeDashboardBranchStats(f,stableStd);financeOnlyOk=financeOnlyOk&&o.CS1.active===2&&o.CS1.debt===1&&o.CS2.active===1&&o.CS2.debt===1;}
check('FINANCE_ONLY_UPDATE_MATRIX',financeOnlyOk);

// Profile update matrix preserves baseline qualification semantics while changing only derived member ownership.
function profileStats(profile){window.__store._profileDataVersion++;coverage={ready:true,presentationState:'FRESH',sameClub:true,clubId:'club-A',activeSource:{authoritySessionEpoch:7,activeOwnerUid:'admin-A'}};students.computeAndCacheStudents({P:profile},params({curTabId:'debt'}));return dashboard.composeDashboardBranchStats(mkFin(),students.getStudentsSummary());}
const pBase={status:'active',branch:'Mặc định',paidUntil:'2026-09',tuitionFee:500000,createdAt:'2026-01-01'};
const pIrrelevant=profileStats({...pBase,phone:'0900'}), pQuit=profileStats({...pBase,status:'quit'}), pActive=profileStats({...pBase,status:'active'}), pCS2=profileStats({...pBase,branch:'CS2'}), pDefault=profileStats({...pBase,branch:'Mặc định'}), pCS1=profileStats({...pBase,branch:'CS1'}), pExempt=profileStats({...pBase,feeExempt:true}), pPaid=profileStats({...pBase,paidUntil:'2026-10'});
check('PROFILE_UPDATE_MATRIX',pIrrelevant.CS1.active===1&&pIrrelevant.CS1.debt===1&&pQuit.CS1.active===0&&pQuit.CS1.debt===0&&pActive.CS1.active===1&&pActive.CS1.debt===1&&pCS2.CS1.active===0&&pCS2.CS2.active===1&&pCS2.CS2.debt===1&&pDefault.CS1.active===pCS1.CS1.active&&pDefault.CS1.debt===pCS1.CS1.debt&&pExempt.CS1.active===1&&pExempt.CS1.debt===0&&pPaid.CS1.active===1&&pPaid.CS1.debt===0);

// Single/multi-branch generic behavior; no CS1/CS2-only composition path.
window.__store.clubConfig={branchCount:1,branchName1:'Huỳnh Tấn Phát'}; window.__store._settingsVersion++; const single=profileStats({...pBase,branch:'Mặc định'});
check('SINGLE_BRANCH_CLUB_MATRIX',single.CS1.active===1&&single.CS1.debt===1&&Object.keys(students.getStudentsSummary().branchMemberStats||{}).every(k=>k==='CS1'));
window.__store.clubConfig={branchCount:3,branchName1:'Huỳnh Tấn Phát',branchName2:'Sân vận động Quy Nhơn',branchName3:'Cơ sở 3'}; window.__store._settingsVersion++; const multi=profileStats({...pBase,branch:'Cơ sở 3'});
check('MULTI_BRANCH_CLUB_MATRIX',multi.CS3.active===1&&multi.CS3.debt===1&&Object.keys(students.getStudentsSummary().branchMemberStats||{}).includes('CS3'));

// Rapid state changes: verified debt survives only the matching transient authority and is never reused across club/month/auth changes.
window.__store.clubId='club-A'; window.__store.currentClubId='club-A'; elements.filterMonth.value='2026-10'; elements.searchInput.value=''; window.__store._profileDataVersion++;
coverage={ready:true,presentationState:'FRESH',sameClub:true,clubId:'club-A',activeSource:{authoritySessionEpoch:41,activeOwnerUid:'admin-A'}}; students.computeAndCacheStudents({P:pBase},params({curTabId:'debt'}));
coverage={ready:false,presentationState:'TRANSIENT_LOCAL_WRITE',sameClub:true,clubId:'club-A',activeSource:{authoritySessionEpoch:41,activeOwnerUid:'admin-A'}}; window.__store._profileDataVersion++; students.computeAndCacheStudents({P:{...pBase,paidUntil:'2026-10'}},params({curTabId:'debt'})); const transientRace=students.getStudentsSummary();
coverage={ready:false,presentationState:'TRANSIENT_LOCAL_WRITE',sameClub:true,clubId:'club-A',activeSource:{authoritySessionEpoch:42,activeOwnerUid:'admin-A'}}; const authRace=students.getStudentsSummary();
window.__store.clubId='club-B'; window.__store.currentClubId='club-B'; coverage={ready:false,presentationState:'NOT_READY',sameClub:false,clubId:'club-B',activeSource:{authoritySessionEpoch:1,activeOwnerUid:'admin-B'}}; const clubRace=students.getStudentsSummary();
window.__store.clubId='club-A'; window.__store.currentClubId='club-A'; elements.filterMonth.value='2026-11'; coverage={ready:false,presentationState:'NOT_READY',sameClub:true,clubId:'club-A',activeSource:{authoritySessionEpoch:42,activeOwnerUid:'admin-A'}}; const monthRace=students.getStudentsSummary();
check('RAPID_RACE_MATRIX_NO_ACCUMULATION_OR_STALE_DEBT',transientRace.branchMemberStats?.CS1?.debt===1&&transientRace.branchDebtUpdating===true&&authRace.branchMemberStats?.CS1?.debt===null&&authRace.branchDebtPending===true&&clubRace.branchMemberStats===null&&clubRace.branchDebtPending===true&&monthRace.branchMemberStats===null&&monthRace.branchDebtPending===true);
window.__store.clubId='club-A'; window.__store.currentClubId='club-A'; elements.filterMonth.value='2026-10';

// Static ownership and policy guards.
const studentsSrc=read('js/ui/render/computation/studentsRenderer.js');
const renderSrc=read('js/ui/render.js');
const dashRendererSrc=read('js/ui/render/computation/dashboardRenderer.js');
check('STUDENTS_NO_FINANCE_BSTATS_PARAM', !studentsSrc.includes('params.bStats') && !/\bbStats\s*=\s*\{\}/.test(studentsSrc) && !studentsSrc.includes('bStats[safeBranch]'));
check('RENDER_USES_PURE_COMPOSER', renderSrc.includes('composeDashboardBranchStats(_financeBStats, _stdSummary)'));
check('R1_2_NO_MIGRATION_POLICY_STILL_CLOSED', sha('js/core/transactionCanonicalBoundary.js')==='01db7c3b9cce2c606ecbe95c3be69a3114a2dbd9ba0e79689c0d476d8562608f');
check('EXPLICIT_CANONICAL_ROLLBACK_REMAINS_SAFE', read('tools/check-fin-canon-r1-2-policy.mjs').includes('EXISTING_CANONICAL_MONTH_EXPLICIT_ROLLBACK_REMAINS_SAFE'));
const changedBusiness=['js/ui/render/computation/studentsRenderer.js','js/ui/render/computation/dashboardRenderer.js','js/ui/render.js','js/ui/render/listComputationRefresh.js','js/modules/dashboard.js'];
const firestoreOps=['getDoc','getDocs','onSnapshot','setDoc','updateDoc','addDoc','deleteDoc','writeBatch','runTransaction'];
const baselineFirestoreCounts={
 'js/ui/render/computation/studentsRenderer.js':{getDoc:0,getDocs:0,onSnapshot:0,setDoc:0,updateDoc:0,addDoc:0,deleteDoc:0,writeBatch:0,runTransaction:0},
 'js/ui/render/computation/dashboardRenderer.js':{getDoc:0,getDocs:0,onSnapshot:0,setDoc:0,updateDoc:0,addDoc:0,deleteDoc:0,writeBatch:0,runTransaction:0},
 'js/ui/render.js':{getDoc:0,getDocs:0,onSnapshot:0,setDoc:0,updateDoc:0,addDoc:0,deleteDoc:0,writeBatch:0,runTransaction:0},
 'js/ui/render/listComputationRefresh.js':{getDoc:0,getDocs:0,onSnapshot:0,setDoc:0,updateDoc:0,addDoc:0,deleteDoc:0,writeBatch:0,runTransaction:0},
 'js/modules/dashboard.js':{getDoc:6,getDocs:5,onSnapshot:0,setDoc:0,updateDoc:0,addDoc:0,deleteDoc:0,writeBatch:0,runTransaction:0},
};
const currentFirestoreCounts=Object.fromEntries(changedBusiness.map(f=>[f,Object.fromEntries(firestoreOps.map(op=>[op,(read(f).match(new RegExp('\\b'+op+'\\b','g'))||[]).length]))]));
check('NO_NEW_FIRESTORE_OWNER', JSON.stringify(currentFirestoreCounts)===JSON.stringify(baselineFirestoreCounts), JSON.stringify(currentFirestoreCounts));
check('COMPOSER_HAS_NO_WINDOW_OR_DOM', !dashRendererSrc.slice(dashRendererSrc.indexOf('export function composeDashboardBranchStats'), dashRendererSrc.indexOf('// ── Module-local dashboard data cache')).includes('window.') && !dashRendererSrc.slice(dashRendererSrc.indexOf('export function composeDashboardBranchStats'), dashRendererSrc.indexOf('// ── Module-local dashboard data cache')).includes('document.'));

console.log(`\nFINANCE-STUDENTS-BSTATS-OWNERSHIP-R1: ${pass} PASS / ${fail} FAIL`);
if(fail) process.exit(1);
