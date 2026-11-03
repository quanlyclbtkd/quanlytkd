#!/usr/bin/env node
import fs from 'node:fs';
let fail=0; const ok=(n,c,d='')=>{if(c)console.log('✅',n);else{fail++;console.error('❌',n,d)}};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
globalThis.window=globalThis;
window.userRole='admin'; window.currentUserEmail='admin@example.com';
window.__verifiedAuthContextState={ready:true,uid:'u1',role:'admin',clubId:'club-A',generation:7,sessionEpoch:11,authGeneration:13};
window.getCanonicalTransactionReadMode=()=> 'legacy';
window.__store={clubId:'club-A',profiles:{},transactions:[],allTransactions:[],_activeTxReadMode:'legacy',_activeTxProjectionEpoch:{id:'ep'}};
window.__store.transactionCoverage={clubId:'club-A',month:'2026-09',readMode:'legacy',ready:false,complete:false,pageServerComplete:false,pageEvidence:{epoch:window.__store._activeTxProjectionEpoch}};
window.guardFinancialWriteIntent=()=>true;window.isFinancialWriteAllowed=()=>true;window.recordFinancialActionAudit=()=>{};window.invalidateLists=()=>{};window.refreshListsComputation=()=>{};window.invalidateDashboard=()=>{};window.invalidateList=()=>{};
let sourcePages={}; let getDocsCalls=0; let delayMs=0;
function where(field,op,value){return{t:'where',field,op,value}} function limit(n){return{t:'limit',n}} function startAfter(cursor){return{t:'cursor',cursor}}
function query(ref,...constraints){return{ref,constraints}} function collection(...args){return{args}} function doc(...args){return{args}}
function sourceOf(q){const ws=q.constraints.filter(x=>x.t==='where'); if(ws.some(x=>x.field==='accountingMonths'))return'canonical'; if(ws.some(x=>x.field==='txMonth'))return'byTxMonth'; if(ws.some(x=>x.field==='packageMonths'))return'byPackageMonth'; return'byDate';}
function pageIndex(q){return q.constraints.some(x=>x.t==='cursor')?1:0}
function snap(spec={}){const docs=(spec.rows||[]).map((data,i)=>({id:data.id||`d${i}`,data:()=>({...data})}));return{docs,size:docs.length,metadata:spec.metadata,forEach(cb){docs.forEach(cb)}}}
window._fb_init={query,where,limit,startAfter,collection,doc,async getDocs(q){getDocsCalls++; if(delayMs)await sleep(delayMs);const src=sourceOf(q),idx=pageIndex(q),spec=(sourcePages[src]||[])[idx]||{rows:[],metadata:{fromCache:false,hasPendingWrites:false}};return snap(spec)},arrayUnion:(...x)=>({arrayUnion:x}),arrayRemove:(...x)=>({arrayRemove:x})};
window.__store.db={}; window.__store.colRef={};
await import(`../js/core/tuitionDebtCanonical.js?fw=${Date.now()}`);
const {FinanceService}=await import(`../js/services/finance.service.js?fw=${Date.now()}`);
window.FinanceService=FinanceService;
function resetCoverage(month='2026-09',complete=false){window.__store._activeTxProjectionEpoch={id:'ep'+Math.random()};window.__store._activeTxReadMode='legacy';window.__store.transactionCoverage={clubId:'club-A',month,readMode:'legacy',ready:complete,complete,pageServerComplete:complete,pageEvidence:{epoch:window.__store._activeTxProjectionEpoch}};window.__store.transactions=[];window.__store.allTransactions=[];window.allTransactions=[];}
const trusted={fromCache:false,hasPendingWrites:false};
// Evidence trust matrices
resetCoverage(); sourcePages={byTxMonth:[{rows:[],metadata:trusted}],byDate:[{rows:[],metadata:trusted}],byPackageMonth:[{rows:[],metadata:trusted}]}; getDocsCalls=0;
let e=await FinanceService.getCompleteMonthEvidence({month:'2026-09',reason:'all-server'}); ok('ALL_PAGES_SERVER_CONFIRMED',e.serverComplete===true&&e.sources.length===3&&getDocsCalls===3); ok('LEGACY_MODE_ALL_REQUIRED_SOURCES_COMPLETE',e.serverComplete===true&&new Set(e.sources.map(x=>x.source)).size===3&&['byTxMonth','byDate','byPackageMonth'].every(x=>e.sources.some(s=>s.source===x&&s.paginationComplete)));
resetCoverage(); sourcePages={byTxMonth:[{rows:[],metadata:{fromCache:true,hasPendingWrites:false}}],byDate:[{rows:[],metadata:trusted}],byPackageMonth:[{rows:[],metadata:trusted}]}; e=await FinanceService.getCompleteMonthEvidence({month:'2026-09'});ok('CACHE_ONLY_EVIDENCE_BLOCKED',e.serverComplete===false);
resetCoverage(); sourcePages={byTxMonth:[{rows:[],metadata:{fromCache:false,hasPendingWrites:true}}],byDate:[{rows:[],metadata:trusted}],byPackageMonth:[{rows:[],metadata:trusted}]};e=await FinanceService.getCompleteMonthEvidence({month:'2026-09'});ok('PENDING_WRITE_EVIDENCE_BLOCKED',e.serverComplete===false);
resetCoverage(); sourcePages={byTxMonth:[{rows:[]}],byDate:[{rows:[],metadata:trusted}],byPackageMonth:[{rows:[],metadata:trusted}]};e=await FinanceService.getCompleteMonthEvidence({month:'2026-09'});ok('MISSING_METADATA_EVIDENCE_BLOCKED',e.serverComplete===false);
// earlier page cached, later trusted: first page must be full 500 to paginate
resetCoverage(); const rows500=Array.from({length:500},(_,i)=>({id:'x'+i,type:'Thu khác'})); sourcePages={byTxMonth:[{rows:rows500,metadata:{fromCache:true,hasPendingWrites:false}},{rows:[],metadata:trusted}],byDate:[{rows:[],metadata:trusted}],byPackageMonth:[{rows:[],metadata:trusted}]}; e=await FinanceService.getCompleteMonthEvidence({month:'2026-09'});ok('EARLIER_PAGE_CACHE_LATER_PAGE_SERVER_BLOCKED',e.serverComplete===false&&e.sources.find(x=>x.source==='byTxMonth').pageCount===2);
// strict coverage zero read
resetCoverage('2026-09',true);getDocsCalls=0;e=await FinanceService.getCompleteMonthEvidence({month:'2026-09'});ok('STRICT_COMPLETE_CURRENT_COVERAGE_CAUSES_ZERO_EXTRA_READ',e.serverComplete===true&&getDocsCalls===0);
// single flight
resetCoverage();sourcePages={byTxMonth:[{rows:[],metadata:trusted}],byDate:[{rows:[],metadata:trusted}],byPackageMonth:[{rows:[],metadata:trusted}]};getDocsCalls=0;delayMs=20;const [s1,s2]=await Promise.all([FinanceService.getCompleteMonthEvidence({month:'2026-09'}),FinanceService.getCompleteMonthEvidence({month:'2026-09'})]);delayMs=0;ok('EVIDENCE_SINGLE_FLIGHT',s1.serverComplete&&s2.serverComplete&&getDocsCalls===3);
// stale club during read
resetCoverage();delayMs=20;const staleP=FinanceService.getCompleteMonthEvidence({month:'2026-09'});await sleep(2);window.__store.clubId='club-B';e=await staleP;ok('EVIDENCE_CLUB_SWITCH_STALE',e.serverComplete===false&&e.contextStillCurrent===false);window.__store.clubId='club-A';delayMs=0;
// stale session during read
resetCoverage();delayMs=20;const staleS=FinanceService.getCompleteMonthEvidence({month:'2026-09'});await sleep(2);window.__verifiedAuthContextState={...window.__verifiedAuthContextState,generation:8};e=await staleS;ok('EVIDENCE_SESSION_STALE',e.serverComplete===false);window.__verifiedAuthContextState={...window.__verifiedAuthContextState,generation:7};delayMs=0;
// canonical mode source only accountingMonths
window.getCanonicalTransactionReadMode=()=> 'canonical';window.__store._activeTxReadMode='canonical';resetCoverage();window.__store._activeTxReadMode='canonical';window.__store.transactionCoverage.readMode='canonical';sourcePages={canonical:[{rows:[],metadata:trusted}]};getDocsCalls=0;e=await FinanceService.getCompleteMonthEvidence({month:'2026-09'});ok('CANONICAL_MODE_ACCOUNTINGMONTH_COMPLETE',e.serverComplete===true&&e.sources.length===1&&e.sources[0].source==='canonical'&&getDocsCalls===1);
window.getCanonicalTransactionReadMode=()=> 'legacy';
// Static no UI filter and ownership checks
const svc=fs.readFileSync('js/services/finance.service.js','utf8'),tb=fs.readFileSync('js/core/tuitionCommandBoundary.js','utf8'),fm=fs.readFileSync('js/modules/finance.js','utf8'),app=fs.readFileSync('app.js','utf8');
const evidencePrimitive=svc.slice(svc.indexOf('async function _readServerCompleteMonth'),svc.indexOf('export const FinanceService')); ok('EVIDENCE_IGNORES_UI_SEARCH',!/(searchText|filterSearch|transactionSearch|search\s*=)/.test(evidencePrimitive));
ok('EVIDENCE_IGNORES_UI_BRANCH_FILTER',!svc.match(/getCompleteMonthEvidence[\s\S]{0,9000}(filterBranch|branchFilter)/));
ok('LEGACY_GLOBAL_RECONCILE_NORMAL_CALLERS_ZERO',!tb.includes('reconcileStudentTuitionAfterDeletedTransaction')&&!fm.includes('reconcileStudentTuitionAfterDeletedTransaction'));
ok('MULTIITEM_USES_TUITION_EVIDENCE_OWNER',app.includes("resolveTuitionSettlementForWrite({profile:latestProfile"));
ok('MULTIITEM_USES_EXAM_EVIDENCE_OWNER',app.includes("resolveExamPaymentForWrite({profile,studentName:name"));
ok('COMBO_USES_SHARED_TUITION_EVIDENCE',fm.includes('requireTuitionUnpaidForWrite') && fm.includes('finance.processCombo'));
ok('FORM_USES_SHARED_TUITION_EVIDENCE',fm.includes('requireTuitionUnpaidForWrite') && fm.includes('finance.transactionForm'));
ok('QUICK_EXAM_USES_SHARED_EXAM_EVIDENCE',fm.includes('requireExamUnpaidForWrite') && fm.includes('finance.quickCollectExam'));
// Tuition boundary dynamic
window.__store.profiles={'Nguyen A':{profileId:'p1',tuitionFee:100000,paidUntil:'2026-05',paidMonths:['2026-05']}};window.studentProfileStore={getAllProfilesCompat:()=>window.__store.profiles,mergeProfile:(n,d)=>{window.__store.profiles[n]={...window.__store.profiles[n],...d}}};
window.TransactionDeleteIntegrity={analyzeTransactionDeleteImpact(tx){return{valid:true,failClosed:false,hasTuition:true,hasInventory:false,requiresInventoryRollback:false,isMixedBundle:false,isPureTuition:true,requiresProfileReconcile:true,studentName:tx.description,requiresExamRefresh:false,safeToHardDelete:true,tuitionMonths:tx.packageMonths||[]}}};
let atomic=0,deleted=0,profileUpdates=0,completeReads=0,legacyReconcile=0; let evidenceRows=[], evidenceFail=false, currentComplete=false;
const fwOpCtx=()=>({clubId:window.__store.clubId,uid:'u1',generation:window.__verifiedAuthContextState?.generation??7,sessionEpoch:window.__verifiedAuthContextState?.sessionEpoch??11,authGeneration:window.__verifiedAuthContextState?.authGeneration??13});const fwOpCurrent=c=>!!c&&c.clubId===window.__store.clubId&&(c.generation??7)===(window.__verifiedAuthContextState?.generation??7);
window.FinanceService={
 captureFinancialWriteContext:fwOpCtx,isFinancialWriteContextCurrent:fwOpCurrent,financialWriteContextToken:c=>[c.clubId,c.uid,c.generation,c.sessionEpoch,c.authGeneration].join('|'),captureWriteEvidenceContext:(month,c)=>({...c,month,readMode:'legacy'}),isWriteEvidenceContextCurrent:c=>fwOpCurrent(c)&&c.readMode==='legacy',
 getRuntimeTransactionRowsForEvidence(){return window.__store.transactions||[]},getCurrentMonthEvidenceForWrite({month}){return{strictCurrentCoverageComplete:currentComplete,serverComplete:currentComplete,contextStillCurrent:true,rows:window.__store.transactions||[],context:{clubId:'club-A',month,readMode:'legacy'}}},
 async getCompleteMonthEvidence({month}){completeReads++;return evidenceFail?{serverComplete:false,contextStillCurrent:true,rows:[],code:'SERVER_EVIDENCE_UNVERIFIED'}:{serverComplete:true,contextStillCurrent:true,rows:evidenceRows,context:{clubId:'club-A',month,readMode:'legacy'}}},
 async commitAtomicWritePlan(plan){atomic++;return{txIds:['newtx'+atomic]}},_arrayUnion:(...x)=>({x}),async addFeeAuditSilent(){return{ok:true}},async deleteTransaction(){deleted++},async updateProfileAfterTxDelete(){profileUpdates++}
};
window.reconcileStudentTuitionAfterDeletedTransaction=async()=>{legacyReconcile++};
const tmod=await import(`../js/core/tuitionCommandBoundary.js?fwgate=${Date.now()}`);tmod.initTuitionCommandBoundary();const B=window.TuitionCommandBoundary;
// profile-paid zero read
completeReads=0;let d=await B.resolveTuitionSettlementForWrite({profile:{profileId:'p1',paidMonths:['2026-09']},studentName:'Nguyen A',targetMonths:['2026-09']});ok('PROFILE_PROVEN_PAID_CAUSES_ZERO_READ',d.status==='PAID'&&completeReads===0);
// Multi-month profile-proven fast path must remain zero-read for supported collection sizes.
for (const count of [1,3,6,9,12]) { const months=Array.from({length:count},(_,i)=>`2026-${String(i+1).padStart(2,'0')}`); completeReads=0; d=await B.resolveTuitionSettlementForWrite({profile:{profileId:'p1',paidMonths:months},studentName:'Nguyen A',targetMonths:months}); ok(`MULTIMONTH_${count}_PROFILE_PROVEN_ZERO_READ`,d.status==='PAID'&&completeReads===0); }
// server existing tx blocks duplicate
window.__store.profiles['Nguyen A']={profileId:'p1',tuitionFee:100000,paidUntil:'2026-05',paidMonths:['2026-05']};window.__store.transactions=[];currentComplete=false;evidenceFail=false;evidenceRows=[{id:'server-pay',type:'Học phí',description:'Nguyen A',profileId:'p1',packageMonths:['2026-09'],txMonth:'2026-09',amount:100000}];atomic=0;d=await B.collectTuition({studentName:'Nguyen A',months:['2026-09'],branch:'CS1',amount:100000});ok('QUICKPAY_EXISTING_SERVER_TX_BLOCKS_DUPLICATE',d.alreadySettled===true&&atomic===0);
// failure zero write
window.__store.transactions=[];evidenceRows=[];evidenceFail=true;atomic=0;d=await B.collectTuition({studentName:'Nguyen A',months:['2026-10'],branch:'CS1',amount:100000});ok('SERVER_EVIDENCE_FAILURE_CAUSES_ZERO_WRITE',d.blocked===true&&atomic===0);
// delete alternative preserves profile
evidenceFail=false;evidenceRows=[{id:'alt',type:'Học phí',description:'Nguyen A',profileId:'p1',packageMonths:['2026-09'],txMonth:'2026-09'}];profileUpdates=0;legacyReconcile=0;d=await B.deleteTuitionTransaction({txId:'del1',transaction:{id:'del1',type:'Học phí',description:'Nguyen A',packageMonths:['2026-09'],txMonth:'2026-09'}});ok('ALTERNATIVE_PAYMENT_PRESERVES_PAIDMONTH_AND_PAIDUNTIL',d.ok===true&&profileUpdates===0&&legacyReconcile===0);
// delete true removal writes once
evidenceRows=[];profileUpdates=0;d=await B.deleteTuitionTransaction({txId:'del2',transaction:{id:'del2',type:'Học phí',description:'Nguyen A',packageMonths:['2026-09'],txMonth:'2026-09'}});ok('TRUE_UNCOVERED_MONTH_REMOVED_WITH_SINGLE_WRITER',d.ok===true&&profileUpdates===1&&legacyReconcile===0);
// delete evidence fail: delete done, no profile lowering
evidenceFail=true;profileUpdates=0;d=await B.deleteTuitionTransaction({txId:'del3',transaction:{id:'del3',type:'Học phí',description:'Nguyen A',packageMonths:['2026-09'],txMonth:'2026-09'}});ok('EVIDENCE_FAILURE_DOES_NOT_LOWER_PROFILE',d.transactionDeleted===true&&d.profileReconcileVerified===false&&profileUpdates===0);
// exam resolver server existing, failure
window.FinanceService=FinanceService;window.__store.profiles={'Nguyen A':{profileId:'p1'}};window.getCanonicalStudentName=(x)=>x;window.buildCanonicalExamPaymentLedger=({month,transactions})=>{const found=(transactions||[]).find(t=>(t.type==='Lệ phí thi'||t.examAmount>0)&&t.txMonth===month);return{byName:found?{'Nguyen A':found}:{}}};
resetCoverage();sourcePages={byTxMonth:[{rows:[{id:'exam1',type:'Lệ phí thi',studentName:'Nguyen A',profileId:'p1',txMonth:'2026-09',amount:250000}],metadata:trusted}],byDate:[{rows:[],metadata:trusted}],byPackageMonth:[{rows:[],metadata:trusted}]};d=await FinanceService.resolveExamPaymentForWrite({profile:{profileId:'p1'},studentName:'Nguyen A',month:'2026-09'});ok('QUICKCOLLECT_EXISTING_SERVER_PAYMENT_ZERO_WRITE_DECISION',d.status==='PAID');
resetCoverage();sourcePages={byTxMonth:[{rows:[],metadata:{fromCache:true,hasPendingWrites:false}}],byDate:[{rows:[],metadata:trusted}],byPackageMonth:[{rows:[],metadata:trusted}]};d=await FinanceService.resolveExamPaymentForWrite({profile:{profileId:'p1'},studentName:'Nguyen A',month:'2026-09'});ok('EXAM_EVIDENCE_FAILURE_ZERO_WRITE_DECISION',d.status==='UNKNOWN');
// Exam decision must also fail closed when the captured auth/session context becomes stale mid-read.
resetCoverage();sourcePages={byTxMonth:[{rows:[],metadata:trusted}],byDate:[{rows:[],metadata:trusted}],byPackageMonth:[{rows:[],metadata:trusted}]};delayMs=20;const examStaleP=FinanceService.resolveExamPaymentForWrite({profile:{profileId:'p1'},studentName:'Nguyen A',month:'2026-09'});await sleep(2);window.__verifiedAuthContextState={...window.__verifiedAuthContextState,generation:8};d=await examStaleP;ok('EXAM_CONTEXT_STALE_ZERO_WRITE',d.status==='UNKNOWN');window.__verifiedAuthContextState={...window.__verifiedAuthContextState,generation:7};delayMs=0;
// no new listener/write owner static: service adds getDocs only, no onSnapshot; writes unchanged owners
ok('NO_NEW_LISTENER_OWNER',!svc.includes('onSnapshot('));
const multiItemSnippet=app.slice(app.indexOf('window.processMultiItem = async'),app.indexOf('// ─── Setup currency inputs')); ok('NO_PARALLEL_FINANCE_READER_OWNER',!fm.includes('getDocs(')&&!multiItemSnippet.includes('getDocs(')&&!tb.includes('getDocs('));
console.log(`\nFINANCE-WRITE-EVIDENCE-R1.1: ${fail?'FAIL '+fail:'PASS'}`);if(fail)process.exit(1);
