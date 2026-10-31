#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const root=process.cwd();
const serviceSource=fs.readFileSync(path.join(root,'js/services/attendance.service.js'),'utf8');
const attendanceSource=fs.readFileSync(path.join(root,'js/modules/attendance.js'),'utf8');
const reportSource=fs.readFileSync(path.join(root,'js/modules/reports/attendanceExcelReport.js'),'utf8');
const contractSource=fs.readFileSync(path.join(root,'js/core/attendanceContract.js'),'utf8');
const failures=[]; const passes=[];
const check=(name,ok,detail='')=>{(ok?passes:failures).push(name+(detail?` — ${detail}`:'')); console.log(`${ok?'✅':'❌'} ${name}${detail?` — ${detail}`:''}`)};
const HISTORY_AUTHORITY=(contractSource.match(/HISTORY_AUTHORITY\s*=\s*'([^']+)'/)||[])[1];
if(!HISTORY_AUTHORITY) throw new Error('Missing HISTORY_AUTHORITY');

globalThis.window=globalThis;
globalThis.__scaleConfig={attendanceDailyPageSize:400,attendanceDailySafetyCeiling:10000,attendanceMonthlyPageSize:1000,attendanceMonthlyMaxPages:200};
globalThis.recordFirestoreReadAttribution=()=>{};
globalThis.RoleReadBoundary={isCoachAttendanceOnly:()=>globalThis.userRole==='coach',canMount:()=>true};
globalThis.BranchIdentity={
  normalize(value,{fallback=''}={}){const raw=String(value||'').trim();if(!raw)return fallback;return /^(Mặc định|mac dinh|default)$/i.test(raw)?'CS1':raw;},
  aliases(value){const v=this.normalize(value,{fallback:''});return v==='CS1'?['CS1','Mặc định']:(v?[v]:[]);},
};
const db={id:'db'};
globalThis.__store={db,clubId:'clubA',currentUser:{uid:'admin1'},userRole:'admin'};
let dataset=[]; let calls=[]; let metadata={fromCache:false,hasPendingWrites:false}; let deferred=null;
const where=(field,op,value)=>({kind:'where',field,op,value});
const limit=n=>({kind:'limit',n});
const startAfter=x=>({kind:'startAfter',x});
const orderBy=(field,dir='asc')=>({kind:'orderBy',field,dir});
const documentId=()=> '__name__';
const collection=(...parts)=>({kind:'collection',parts});
const query=(ref,...constraints)=>({ref,constraints});
function matches(doc,c){if(c.kind!=='where')return true;const value=c.field==='__name__'?doc.id:doc.data[c.field];if(c.op==='==')return value===c.value;if(c.op==='in')return Array.isArray(c.value)&&c.value.includes(value);return true;}
function makeSnap(q){
  const club=q.ref?.parts?.[2]||'clubA';
  let rows=dataset.filter(d=>d.club===club).filter(d=>q.constraints.every(c=>matches(d,c)));
  const order=q.constraints.find(c=>c.kind==='orderBy');
  if(order) rows=rows.slice().sort((a,b)=>String(order.field==='__name__'?a.id:a.data[order.field]??'').localeCompare(String(order.field==='__name__'?b.id:b.data[order.field]??'')));
  const after=q.constraints.find(c=>c.kind==='startAfter'); if(after){const idx=rows.findIndex(d=>d.id===after.x);if(idx>=0)rows=rows.slice(idx+1);}
  const lim=q.constraints.find(c=>c.kind==='limit'); if(lim)rows=rows.slice(0,lim.n);
  const docs=rows.map(d=>({id:d.id,data:()=>({...d.data})}));
  return {docs,size:docs.length,metadata:{...metadata},forEach(fn){docs.forEach(fn);},empty:docs.length===0};
}
globalThis._fb_init={where,limit,startAfter,orderBy,documentId,collection,query,getDocs:async q=>{calls.push(q);if(deferred){const d=deferred;deferred=null;await d.promise;}return makeSnap(q);}};
function setPrincipal(role='admin',branch='CS1'){
  globalThis.userRole=role;globalThis.coachBranch=role==='coach'?branch:'';
  globalThis.__store.clubId='clubA';globalThis.__store.userRole=role;globalThis.__store.currentUser={uid:role+'1'};
  globalThis.__verifiedAuthContextState={ready:true,uid:role+'1',role,clubId:'clubA',generation:1,branchGeneration:1,assignmentVersion:'v1',allowedBranches:role==='coach'?[branch]:['CS1','CS2'],activeBranch:branch,coachBranch:role==='coach'?branch:'',branchSelectionPending:false,sessionEpoch:1,authGeneration:1};
}
function row(id,data,club='clubA'){return {id,club,data:{name:data.profileId,...data}};}
const baseRows=[
 row('A',{profileId:'P1',month:'2026-10',date:'2026-10-01',branch:'CS1',status:1,historyAuthority:HISTORY_AUTHORITY,shiftId:'s1'}),
 row('B',{profileId:'P1',month:'2026-10',date:'2026-10-02',branch:'CS1',status:1,historyAuthority:'old-authority',shiftId:'s1'}),
 row('C',{profileId:'P1',month:'2026-10',date:'2026-10-03',branch:'CS1',status:2,shiftId:'s1'}),
 row('D',{profileId:'P1',month:'2026-10',date:'2026-10-04',branch:'Mặc định',status:3,historyAuthority:'old-authority',shiftId:'s1'}),
 row('E',{profileId:'P1',month:'2026-10',date:'2026-10-05',branch:'CS2',status:1,historyAuthority:HISTORY_AUTHORITY,shiftId:'s2'}),
 row('G',{profileId:'P1',month:'2026-10',date:'2026-10-06',branch:'CS1',status:0,historyAuthority:HISTORY_AUTHORITY,shiftId:'s1'}),
 row('H1',{profileId:'P1',month:'2026-10',date:'2026-10-07',branch:'CS1',status:1,historyAuthority:HISTORY_AUTHORITY,shiftId:'morning'}),
 row('H2',{profileId:'P1',month:'2026-10',date:'2026-10-07',branch:'CS1',status:1,historyAuthority:HISTORY_AUTHORITY,shiftId:'evening'}),
 row('F1',{profileId:'PMOVE',month:'2026-02',date:'2026-02-02',branch:'CS1',status:1,historyAuthority:'old-authority'}),
 row('F2',{profileId:'PMOVE',month:'2026-05',date:'2026-05-02',branch:'CS2',status:1,historyAuthority:HISTORY_AUTHORITY}),
 row('I',{profileId:'P1',month:'2026-10',date:'2026-10-08',branch:'CS1',status:1,historyAuthority:HISTORY_AUTHORITY},'clubB'),
 row('J',{profileId:'OLD-P',month:'2025-01',date:'2025-01-02',branch:'CS1',status:1,historyAuthority:'old-authority'}),
];
dataset=baseRows.slice();
const serviceModule=await import(pathToFileURL(path.join(root,'js/services/attendance.service.js')).href+`?att-r1=${Date.now()}`);
const {AttendanceService}=serviceModule;

console.log('\n=== ATTENDANCE HISTORY R1 ===\n');
setPrincipal('admin','CS1');calls=[];
let rows=await AttendanceService.loadMemberHistory('P1',['2026-10'],{consistency:'server',authorityScope:'recorded',branch:'CS1'});
check('ADMIN_NORMAL_MEMBER_HISTORY_INCLUDES_PRE_CUTOVER_ROWS', ['A','B','C','D','H1','H2'].every(id=>rows.some(r=>r.id===id)) && !rows.some(r=>r.id==='G'));
check('ADMIN_CS1_DEFAULT_ALIAS_HISTORY_PARITY', rows.some(r=>r.id==='D'));
check('MULTI_SHIFT_NOT_COLLAPSED', rows.filter(r=>r.data.date==='2026-10-07').length===2);
check('RECORDED_TRUST_IS_MIXED_NOT_VERIFIED', rows.trustSummary?.legacyHistory===3 && rows.trustSummary?.currentAuthority===3);
check('ADMIN_MEMBER_QUARTER_ONE_QUERY', calls.length===1);
const memberWheres=calls[0].constraints.filter(x=>x.kind==='where');
check('VERIFIED_COMPATIBILITY_NO_LONGER_IMPLIES_HISTORY_AUTHORITY', !memberWheres.some(x=>x.field==='historyAuthority'));

calls=[];rows=await AttendanceService.loadMemberHistory('P1',['2026-10'],{verified:true,branch:'CS1'});
check('VERIFIED_TRUE_MEANS_SERVER_REQUIRED_NOT_CURRENT_ONLY', rows.some(r=>r.id==='B')&&rows.some(r=>r.id==='C')&&rows.some(r=>r.id==='D'));

calls=[];rows=await AttendanceService.loadMemberHistory('P1',['2026-10'],{consistency:'server',authorityScope:'current',branch:'CS1'});
check('VERIFIED_VIEW_REMAINS_CURRENT_AUTHORITY_ONLY', rows.every(r=>r.data.historyAuthority===HISTORY_AUTHORITY)&&rows.some(r=>r.id==='A')&&!rows.some(r=>r.id==='B'));

calls=[];const page=await AttendanceService.loadMemberHistory('PMOVE',null,{page:true,consistency:'server',authorityScope:'recorded',pageSize:40});
check('ADMIN_ALL_TIME_HISTORY_INCLUDES_OLDER_LEGACY_ROWS', page.rows.some(r=>r.id==='F1')&&page.rows.some(r=>r.id==='F2'));
check('ADMIN_TRANSFERRED_MEMBER_FULL_HISTORY_PARITY', new Set(page.rows.map(r=>r.data.branch)).has('CS1')&&new Set(page.rows.map(r=>r.data.branch)).has('CS2'));
check('ADMIN_ALL_TIME_USES_ONE_PAGE_QUERY', calls.length===1);

calls=[];rows=await AttendanceService.loadByMonth('2026-10',{consistency:'server',authorityScope:'recorded',branch:'CS1',pageSize:100,maxPages:2});
check('ADMIN_MONTHLY_INCLUDES_PRE_CUTOVER_ROWS', rows.some(r=>r.id==='B')&&rows.some(r=>r.id==='C')&&rows.some(r=>r.id==='D'));
check('STATUS_ZERO_NOT_COUNTED', !rows.some(r=>r.id==='G'));
check('ADMIN_MONTHLY_CS1_ONE_QUERY', calls.length===1);
check('ADMIN_MONTHLY_CS1_SINGLE_QUERY_ALIAS_IN', !calls[0].constraints.some(x=>x.kind==='where'&&x.field==='historyAuthority') && calls[0].constraints.some(x=>x.kind==='where'&&x.field==='branch'&&x.op==='in'&&Array.isArray(x.value)&&x.value.includes('CS1')&&x.value.includes('Mặc định')));

calls=[];const historicalDay=await AttendanceService.loadByDate('2026-10-04',{branch:'CS1',historicalReopen:true});
check('PAST_DAY_CS1_DEFAULT_ALIAS_HISTORY_PARITY', historicalDay.some(r=>r.id==='D')&&calls.length===1&&calls[0].constraints.some(x=>x.kind==='where'&&x.field==='branch'&&x.op==='in'&&x.value.includes('CS1')&&x.value.includes('Mặc định')));

setPrincipal('coach','CS1');calls=[];rows=await AttendanceService.loadMemberHistory('P1',['2026-10'],{consistency:'server',authorityScope:'recorded',branch:'CS1'});
check('COACH_LEGACY_HISTORY_DENIED', rows.every(r=>r.data.historyAuthority===HISTORY_AUTHORITY)&&!rows.some(r=>['B','C','D'].includes(r.id)));
check('COACH_CURRENT_BRANCH_ONLY', rows.every(r=>r.data.branch==='CS1')&&!rows.some(r=>r.id==='E'));
check('COACH_QUERY_RETAINS_CURRENT_AUTHORITY_FILTER', calls[0].constraints.some(x=>x.kind==='where'&&x.field==='historyAuthority'&&x.value===HISTORY_AUTHORITY));
let denied=false;try{await AttendanceService.loadMemberHistory('P1',['2026-10'],{consistency:'server',authorityScope:'recorded',branch:'CS2'});}catch(e){denied=e.code==='attendance/coach-branch-required';}
check('COACH_CROSS_BRANCH_DENIED',denied);

setPrincipal('admin','CS1'); metadata={fromCache:true,hasPendingWrites:false};
let cacheRejected=false;try{await AttendanceService.loadByMonth('2026-10',{consistency:'server',authorityScope:'recorded'});}catch(e){cacheRejected=e.code==='attendance/history-server-required';}
check('SERVER_REQUIRED_REJECTS_CACHE_FINALITY',cacheRejected); metadata={fromCache:false,hasPendingWrites:false};

// Stale principal/session must invalidate an in-flight result.
let release;const promise=new Promise(r=>{release=r});deferred={promise};
const staleRead=AttendanceService.loadMemberHistory('P1',['2026-10'],{consistency:'server',authorityScope:'recorded'}).then(()=>null,e=>e);
await Promise.resolve();globalThis.__verifiedAuthContextState={...globalThis.__verifiedAuthContextState,generation:2,authGeneration:2};release();
const staleError=await staleRead;check('STALE_SESSION_RESULT_DROPPED',staleError?.code==='attendance/stale-history-context'||staleError?.code==='attendance/stale-bulk-context');
setPrincipal('admin','CS1');
async function staleMatrixCase(name, mutate) {
  let resume; const gate=new Promise(r=>{resume=r}); deferred={promise:gate};
  const pending=AttendanceService.loadMemberHistory('P1',['2026-10'],{consistency:'server',authorityScope:'recorded'}).then(()=>null,e=>e);
  await Promise.resolve(); mutate(); resume();
  const error=await pending;
  check(name,error?.code==='attendance/stale-history-context'||error?.code==='attendance/stale-bulk-context');
  setPrincipal('admin','CS1');
}
await staleMatrixCase('STALE_LOGOUT_RESULT_DROPPED',()=>{globalThis.__store.currentUser=null;globalThis.__verifiedAuthContextState={...globalThis.__verifiedAuthContextState,ready:false,uid:''};});
await staleMatrixCase('STALE_CLUB_SWITCH_RESULT_DROPPED',()=>{globalThis.__store.clubId='clubB';globalThis.__verifiedAuthContextState={...globalThis.__verifiedAuthContextState,clubId:'clubB'};});
await staleMatrixCase('STALE_ROLE_SWITCH_RESULT_DROPPED',()=>{globalThis.userRole='coach';globalThis.__store.userRole='coach';globalThis.__verifiedAuthContextState={...globalThis.__verifiedAuthContextState,role:'coach'};});
await staleMatrixCase('STALE_BRANCH_SWITCH_RESULT_DROPPED',()=>{globalThis.__verifiedAuthContextState={...globalThis.__verifiedAuthContextState,activeBranch:'CS2',branchGeneration:2};});
await staleMatrixCase('STALE_ASSIGNMENT_VERSION_RESULT_DROPPED',()=>{globalThis.__verifiedAuthContextState={...globalThis.__verifiedAuthContextState,assignmentVersion:'v2'};});
await staleMatrixCase('STALE_SESSION_EPOCH_RESULT_DROPPED',()=>{globalThis.__verifiedAuthContextState={...globalThis.__verifiedAuthContextState,sessionEpoch:2};});
await staleMatrixCase('STALE_AUTH_GENERATION_RESULT_DROPPED',()=>{globalThis.__verifiedAuthContextState={...globalThis.__verifiedAuthContextState,authGeneration:2};});
metadata={fromCache:false,hasPendingWrites:true};
let pendingRejected=false;try{await AttendanceService.loadByMonth('2026-10',{consistency:'server',authorityScope:'recorded'});}catch(e){pendingRejected=e.code==='attendance/history-server-required';}
check('SERVER_REQUIRED_REJECTS_PENDING_FINALITY',pendingRejected); metadata={fromCache:false,hasPendingWrites:false};
const auditRows=await AttendanceService.loadByMonth('2026-10',{consistency:'server',authorityScope:'recorded',pageSize:100,maxPages:2});
const normalRows=await AttendanceService.loadByMonth('2026-10',{consistency:'server',authorityScope:'recorded',pageSize:100,maxPages:2});
check('ADMIN_AUDIT_NORMAL_VISIBILITY_PARITY',JSON.stringify(auditRows.map(r=>r.id).sort())===JSON.stringify(normalRows.map(r=>r.id).sort()));
check('CROSS_CLUB_HISTORY_DENIED_BY_TENANT_QUERY',!normalRows.some(r=>r.id==='I'));

// Static consumer policy / presentation checks.
check('ADMIN_ALL_TIME_UI_LABEL_IS_NOT_FALSE_VERIFIED', attendanceSource.includes("historyAuthorityScope==='recorded' ? 'Mở toàn bộ lịch sử'"));
check('ADMIN_RATE_LABEL_USES_RECORDED_WORDING', attendanceSource.includes("historyAuthorityScope==='recorded'?'Chuyên cần ghi nhận':'Chuyên cần đã xác minh'"));
check('MONTHLY_USES_EXPLICIT_RECORDED_POLICY', attendanceSource.includes("consistency:'server', authorityScope:monthAuthorityScope"));
check('ADMIN_AUDIT_USES_SERVER_RECORDED_POLICY', attendanceSource.includes("loadByMonth(month.value,{consistency:'server',authorityScope:'recorded'})"));
check('BRANCH_REPORT_USES_CANONICAL_MONTHLY_POLICY', attendanceSource.includes("consistency:'server',authorityScope:owner.role==='coach'?'current':'recorded'"));
check('BRANCH_REPORT_USES_CANONICAL_BRANCH_EQUIVALENCE', attendanceSource.includes("branch && !_sameBranch(d.branch, branch)"));
check('EXCEL_USES_CANONICAL_MONTHLY_READER', reportSource.includes('owner.readMonth(month,{branch:scopeBranch,consistency:\'server\',authorityScope'));
check('EXCEL_HAS_NO_PARALLEL_FIRESTORE_QUERY', !/\bgetDocs\s*\(/.test(reportSource));
check('NO_AUTO_ATTEST_ON_READ', !serviceSource.includes('legacy row read') && attendanceSource.includes('AttendanceService.attestHistory('));
check('ATTENDANCE_WRITE_PATH_HAS_NO_PHYSICAL_DELETE', !/deleteDoc\s*\(|transaction\.delete\s*\(/.test(serviceSource));
check('STATUS_ZERO_REMAINS_TOMBSTONE', serviceSource.includes('Status zero is an unmarked tombstone'));
check('NO_PARALLEL_LEGACY_READER', !/LegacyAttendanceReader|AdminAttendanceReader|AttendanceHistoryReader2|AttendanceQueryManager/.test(serviceSource+attendanceSource));

// Excel policy options must be role-aware without changing reader ownership.
setPrincipal('admin','CS1');globalThis.APP_BUILD_VERSION='qr-v11r6-a9r18-usability-perf-r2r4-r6-20261029';
globalThis.document={getElementById(id){if(id==='att_month')return {value:'2026-10'};if(id==='att_month_branch')return {value:'CS1'};return null;}};
let capturedExcelOptions=null;
const excelRows=[{id:'A',data:baseRows[0].data},{id:'B',data:baseRows[1].data}];Object.defineProperty(excelRows,'pageCount',{value:1});Object.defineProperty(excelRows,'trustSummary',{value:{total:2,currentAuthority:1,legacyHistory:1}});
const stableHistoryOwner={buildTag:globalThis.APP_BUILD_VERSION,authority:HISTORY_AUTHORITY,readMonth:async(month,opts)=>{capturedExcelOptions=opts;return excelRows;}};
globalThis.AttendanceModule={getHistoryReadOwner(){return stableHistoryOwner;}};
const report=await import(pathToFileURL(path.join(root,'js/modules/reports/attendanceExcelReport.js')).href+`?att-r1=${Date.now()}`);
const excel=await report.loadAttendanceMonthPaginated({db,clubId:'clubA',month:'2026-10',branch:'CS1'});
check('ADMIN_MONTHLY_EXCEL_VISIBILITY_PARITY', excel.items.length===2&&excel.items.some(x=>x.id==='B')&&capturedExcelOptions.authorityScope==='recorded'&&capturedExcelOptions.consistency==='server');

console.log(`\nPASS ${passes.length}/${passes.length+failures.length}`);
if(failures.length){console.error('\nFailures:\n'+failures.map(x=>' - '+x).join('\n'));process.exit(1);}
