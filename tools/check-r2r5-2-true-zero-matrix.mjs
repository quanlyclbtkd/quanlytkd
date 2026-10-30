import fs from 'node:fs';
const src=fs.readFileSync('js/ui/render/listComputationRefresh.js','utf8');
const start=src.indexOf('function _cacheAndApplyDashboardSummary(reason)');
if(start<0) throw new Error('target function not found');
let brace=src.indexOf('{',start), depth=0, end=-1;
for(let i=brace;i<src.length;i++){
  if(src[i]==='{') depth++;
  else if(src[i]==='}') { depth--; if(depth===0){end=i+1;break;} }
}
if(end<0) throw new Error('target function parse failed');
const fnSrc=src.slice(start,end);
const factory=new Function(`
const getFinanceSummary=globalThis.__tz.getFinanceSummary;
const getStudentsSummary=globalThis.__tz.getStudentsSummary;
const getCachedUnpaidInvCount=globalThis.__tz.getCachedUnpaidInvCount;
const _getSelMonth=globalThis.__tz._getSelMonth;
const _getSelBranch=globalThis.__tz._getSelBranch;
const _getSearch=globalThis.__tz._getSearch;
const formatMonth=globalThis.__tz.formatMonth;
const cacheDashboardData=globalThis.__tz.cacheDashboardData;
const isFinanceSemanticSourceFresh=globalThis.__tz.isFinanceSemanticSourceFresh;
const isStudentsSemanticSourceFresh=globalThis.__tz.isStudentsSemanticSourceFresh;
${fnSrc}
return _cacheAndApplyDashboardSummary;`);

globalThis.window=globalThis;
globalThis.document={getElementById(){return null;}};
let state={};
const ctxKey=(s)=>JSON.stringify([String(s.clubId||s.currentClubId||''),String(s.month||''),String(s.branch||'all'),String(s.search||''),String(s.overdue||'')]);
const mkSummary=(active=0, extra={})=>({
  activeCount:active,debtSummaryPending:false,debtCount:0,totalDebtEst:0,m_active_theo:active,m_new:0,m_quit:0,m_skipped:0,...extra
});
const zeroFin=()=>({incTuition:0,incExam:0,incOther:0,incUniform:0,exp:0,expExamTotal:0,expUniform:0,txCount:0,bStats:{},bExamStats:{}});
const nonzeroPrev=(s)=>({activeCount:8,debtCount:3,totalDebtEst:900000,txCount:4,incTuition:1000000,incExam:0,incOther:0,incUniform:0,expTotal:0,expExamTotal:0,expUniform:0,selMonth:s.month,unpaidInvCount:0});
function runCase(name,{club='club-A',month='2026-10',branch='all',search='',overdue='',prev=null,prevCtx=null,fin=zeroFin(),std=mkSummary(0),txComplete=true,finFresh=true,debtFresh=true,stdFresh=true}){
  state={clubId:club,currentClubId:club,month,branch,search,overdue,fin,std,finFresh,stdFresh,cached:null};
  window.__store={clubId:club,currentClubId:club,selectedMonth:month,selectedBranch:branch,_debtOverdueFilter:overdue,transactionCoverage:{complete:txComplete},_lastSummaryNumbers:prev||{},_lastSummaryContextKey:prevCtx||''};
  window.getDebtProfileCoverageStatus=()=>debtFresh?{presentationState:'FRESH',ready:true}:{presentationState:'NOT_READY',ready:false};
  globalThis.__tz={
    getFinanceSummary:()=>state.fin,
    getStudentsSummary:()=>state.std,
    getCachedUnpaidInvCount:()=>0,
    _getSelMonth:()=>state.month,
    _getSelBranch:()=>state.branch,
    _getSearch:()=>state.search,
    formatMonth:(m)=>m,
    cacheDashboardData:(v)=>{state.cached=v;},
    isFinanceSemanticSourceFresh:()=>state.finFresh,
    isStudentsSemanticSourceFresh:()=>state.stdFresh,
  };
  const fn=factory();
  const result=fn(name);
  return {result,cached:state.cached,store:window.__store};
}
let pass=0,fail=0;
const check=(name,cond,detail='')=>{if(cond){pass++;console.log('PASS',name)}else{fail++;console.error('FAIL',name,detail)}};
const base={clubId:'club-A',month:'2026-10',branch:'CS1',search:'',overdue:''};
const prev=nonzeroPrev(base); const prevKey=ctxKey(base);
let r;
// 1 transient incomplete empty
r=runCase('transient-incomplete',{club:'club-A',month:'2026-10',branch:'CS1',prev,prevCtx:prevKey,txComplete:false,finFresh:false,debtFresh:false,stdFresh:false});
check('1 transient incomplete empty retains same-context valid summary',r.result.activeCount===8 && r.cached===null);
// 2 authoritative true zero
r=runCase('verified-zero',{club:'club-A',month:'2026-10',branch:'CS1',prev,prevCtx:prevKey});
check('2 verified authoritative zero replaces stale nonzero',r.result.activeCount===0 && r.result.incTuition===0 && !!r.cached);
// 3 branch change
r=runCase('branch-zero',{club:'club-A',month:'2026-10',branch:'CS2',prev,prevCtx:prevKey});
check('3 branch nonzero to true-zero does not inherit previous branch',r.result.activeCount===0 && !!r.cached && r.store._lastSummaryContextKey!==prevKey);
// 4 month change
r=runCase('month-zero',{club:'club-A',month:'2026-11',branch:'CS1',prev,prevCtx:prevKey});
check('4 month nonzero to true-zero does not inherit previous month',r.result.activeCount===0 && !!r.cached);
// 5 club switch
r=runCase('club-zero',{club:'club-B',month:'2026-10',branch:'CS1',prev,prevCtx:prevKey});
check('5 club switch cannot reuse previous club summary',r.result.activeCount===0 && !!r.cached);
// 6 finance incomplete same context
r=runCase('finance-incomplete',{club:'club-A',month:'2026-10',branch:'CS1',prev,prevCtx:prevKey,txComplete:false,finFresh:false});
check('6 finance incomplete zero cannot overwrite valid current-context summary',r.result.activeCount===8 && r.cached===null);
// 7 students incomplete same context
r=runCase('students-incomplete',{club:'club-A',month:'2026-10',branch:'CS1',prev,prevCtx:prevKey,debtFresh:false,stdFresh:false});
check('7 students coverage incomplete zero cannot overwrite valid current-context summary',r.result.activeCount===8 && r.cached===null);
// 8 zero revenue but nonzero students
r=runCase('zero-revenue-nonzero-students',{club:'club-A',month:'2026-10',branch:'CS1',prev,prevCtx:prevKey,std:mkSummary(12),txComplete:true,finFresh:true,debtFresh:true,stdFresh:true});
check('8 legitimate zero revenue with nonzero students is accepted',r.result.activeCount===12 && r.result.incTuition===0 && !!r.cached);
// 9 legitimate all-zero club/month
r=runCase('legit-all-zero',{club:'club-Z',month:'2026-12',branch:'all',prev:{},prevCtx:''});
check('9 legitimate authoritative all-zero club/month is accepted',r.result.activeCount===0 && r.result.txCount===0 && !!r.cached);
console.log(`\nR2R5.2 true-zero matrix: ${pass} PASS / ${fail} FAIL`);
if(fail) process.exit(1);
