#!/usr/bin/env node
import fs from 'node:fs'; import path from 'node:path'; import {pathToFileURL} from 'node:url';
import {verifyRuntimeProfile} from './v11r2/runtime-profile.mjs';
import {buildImportGraph} from './v11r2/import-graph.mjs';
const root=process.cwd();
const att=fs.readFileSync(path.join(root,'js/modules/attendance.js'),'utf8');
const svc=fs.readFileSync(path.join(root,'js/services/attendance.service.js'),'utf8');
const main=fs.readFileSync(path.join(root,'js/main.js'),'utf8');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const reportFacade=fs.readFileSync(path.join(root,'js/modules/reports/reportExportFacade.js'),'utf8');
const failures=[]; const passes=[]; const check=(n,ok,d='')=>{(ok?passes:failures).push(n);console.log(`${ok?'✅':'❌'} ${n}${d?' — '+d:''}`)};
const NEW='att-history-r1-1-20261031';
const _profile=verifyRuntimeProfile(root);
const _graph=buildImportGraph(root);
const _mainEdge=_graph.edges.find(e=>e.from==='index.html'&&e.to==='js/main.js');
const ACCEPTED_PARENT_LINEAGE=(_profile.identity.cacheLineageScopes||[]).find(scope=>(scope.edges||[]).some(edge=>Array.isArray(edge)&&edge[0]==='index.html'&&edge[1]==='js/main.js'))?.token||'';
console.log('\n=== ATTENDANCE HISTORY R1.1 ===\n');
const callsites=[...att.matchAll(/window\.showAttMemberHistory\(([^\n;]+)\)/g)].map(m=>m[1]);
check('ALL_SHOW_MEMBER_HISTORY_CALLSITES_INVENTORIED',callsites.length===3,`count=${callsites.length}`);
check('DAILY_ADMIN_MEMBER_HISTORY_DEFAULTS_TO_ALL_HISTORICAL_BRANCHES',att.includes("const requestedHistoryBranch = typeof overrideBranch === 'string' ? overrideBranch.trim() : ''")&&!att.includes("document.getElementById(overrideMonth ? 'att_month_branch' : 'att_branch')"));
check('ADMIN_HISTORY_SCOPE_NOT_INFERRED_FROM_ATT_BRANCH_DOM',!att.includes("historyBranchSelector?.value"));
check('MONTHLY_EXPLICIT_BRANCH_HISTORY_REMAINS_SCOPED',callsites.filter(x=>x.includes("'${selMonth}','${r.branch}'")).length===2);
check('ADMIN_DAILY_QUARTER_ALLTIME_SCOPE_MATCH',att.includes("branch:historyBranch\n            });")&&att.includes("page:true,branch:historyBranch,cursor"));
const moreBlock=att.slice(att.indexOf('more.onclick = async () =>'),att.indexOf('        } catch(e)',att.indexOf('more.onclick = async () =>')));
check('PAGINATION_DOES_NOT_REREAD_BRANCH_DOM',!moreBlock.includes('att_branch')&&!moreBlock.includes('att_month_branch'));
check('MEMBER_HISTORY_STALE_REQUEST_CANNOT_OVERWRITE_NEW_MODAL',att.includes('const requestId = ++_memberHistoryRequestId;')&&att.includes('requestId === _memberHistoryRequestId'));
check('MULTI_SHIFT_VIEW_MODEL_PRESERVES_ALL_SESSIONS',att.includes('const daySessions = {};')&&att.includes('daySessions[day].push(')&&att.includes('sessions.length > 1'));
check('MULTI_SHIFT_PRESENTATION_DOES_NOT_CHANGE_COUNTS',att.includes('if (s === 1) present++; else if (s === 2) absent++; else if (s === 3) excused++;')&&att.includes('if (s === 1) qPresent++; else if (s === 2) qAbsent++; else if (s === 3) qExcused++;'));
check('MULTI_SHIFT_CALENDAR_HAS_ACCESSIBLE_DETAIL',att.includes('aria-label="' + "' + escapeHtml(_cellLabel)"));
check('LEGACY_NO_SHIFT_HAS_READ_ONLY_WARNING',att.includes('bản ghi lịch sử cũ chưa xác định ca tập')&&att.includes('không được gán vào ca đang chọn'));
check('LEGACY_NO_SHIFT_STATUS_ZERO_NOT_PRESENTED_AS_EVIDENCE',att.includes("!String(data.shiftId || '').trim() && [1,2,3].includes(Number(data.status))"));
check('LEGACY_NO_SHIFT_NOT_ASSIGNED_TO_SELECTED_SHIFT',att.includes('if (token.shiftId && docShift !== token.shiftId) return;'));
check('LEGACY_NO_SHIFT_NOT_USED_AS_CAS_BASE',att.includes('Object.fromEntries(selectedShiftRows.map(({id,data}) => [id,attendanceServerVersion(data)]))'));
const loadDate=svc.slice(svc.indexOf('async loadByDate('),svc.indexOf('// ── SAVE / DELETE ATTENDANCE'));
check('PAST_DAY_ADMIN_QUERY_DOES_NOT_SERVER_FILTER_SHIFT',loadDate.includes("if (shiftId && !historicalReopen) baseConstraints.push(where('shiftId', '==', shiftId));"));
check('NO_WRITE_IN_HISTORICAL_READ_PATH',!/\b(?:setDoc|updateDoc|addDoc|deleteDoc|writeBatch|runTransaction)\s*\(/.test(loadDate));

// Canonical service runtime fixture for historical shift and cursor scope.
globalThis.window=globalThis; globalThis.__scaleConfig={attendanceDailyPageSize:400,attendanceDailySafetyCeiling:10000}; globalThis.recordFirestoreReadAttribution=()=>{};
globalThis.RoleReadBoundary={isCoachAttendanceOnly:()=>globalThis.userRole==='coach',canMount:()=>true};
globalThis.BranchIdentity={normalize(v,{fallback=''}={}){const r=String(v||'').trim();if(!r)return fallback;return /^(Mặc định|mac dinh|default)$/i.test(r)?'CS1':r;},aliases(v){const x=this.normalize(v,{fallback:''});return x==='CS1'?['CS1','Mặc định']:(x?[x]:[]);}};
const db={id:'db'}; globalThis.__store={db,clubId:'clubA',currentUser:{uid:'admin1'},userRole:'admin'};
function principal(role='admin',branch='CS1'){globalThis.userRole=role;globalThis.coachBranch=role==='coach'?branch:'';globalThis.__store.clubId='clubA';globalThis.__store.currentUser={uid:role+'1'};globalThis.__store.userRole=role;globalThis.__verifiedAuthContextState={ready:true,uid:role+'1',role,clubId:'clubA',generation:1,branchGeneration:1,assignmentVersion:'v1',allowedBranches:role==='coach'?[branch]:['CS1','CS2'],activeBranch:branch,coachBranch:role==='coach'?branch:'',branchSelectionPending:false,sessionEpoch:1,authGeneration:1};}
let data=[
 {id:'ns',club:'clubA',data:{profileId:'P_LEGACY_SHIFT',name:'P_LEGACY_SHIFT',date:'2026-01-10',month:'2026-01',branch:'CS1',status:1,historyAuthority:'old'}},
 {id:'s1',club:'clubA',data:{profileId:'P_LEGACY_SHIFT',name:'P_LEGACY_SHIFT',date:'2026-01-10',month:'2026-01',branch:'CS1',status:2,shiftId:'S1',historyAuthority:'attendance-v2'}},
 {id:'pm1',club:'clubA',data:{profileId:'PMOVE',name:'PMOVE',date:'2026-02-01',month:'2026-02',branch:'CS1',status:1,historyAuthority:'old'}},
 {id:'pm2',club:'clubA',data:{profileId:'PMOVE',name:'PMOVE',date:'2026-05-01',month:'2026-05',branch:'CS2',status:1,historyAuthority:'attendance-v2'}},
 {id:'pm3',club:'clubA',data:{profileId:'PMOVE',name:'PMOVE',date:'2026-06-01',month:'2026-06',branch:'CS2',status:3,historyAuthority:'attendance-v2'}}
]; let calls=[];
const where=(field,op,value)=>({kind:'where',field,op,value}),limit=n=>({kind:'limit',n}),startAfter=x=>({kind:'startAfter',x}),orderBy=(field,dir='asc')=>({kind:'orderBy',field,dir}),documentId=()=> '__name__',collection=(...parts)=>({parts}),query=(ref,...constraints)=>({ref,constraints});
function match(d,c){if(c.kind!=='where')return true;const v=c.field==='__name__'?d.id:d.data[c.field];if(c.op==='==')return v===c.value;if(c.op==='in')return c.value.includes(v);return true;}
function snap(q){let rows=data.filter(d=>d.club===(q.ref.parts[2]||'clubA')).filter(d=>q.constraints.every(c=>match(d,c)));const o=q.constraints.find(c=>c.kind==='orderBy');if(o)rows=rows.slice().sort((a,b)=>String(o.field==='__name__'?a.id:a.data[o.field]||'').localeCompare(String(o.field==='__name__'?b.id:b.data[o.field]||'')));const a=q.constraints.find(c=>c.kind==='startAfter');if(a){const id=typeof a.x==='string'?a.x:a.x?.id;const i=rows.findIndex(d=>d.id===id);if(i>=0)rows=rows.slice(i+1);}const l=q.constraints.find(c=>c.kind==='limit');if(l)rows=rows.slice(0,l.n);const docs=rows.map(d=>({id:d.id,data:()=>({...d.data})}));return {docs,size:docs.length,metadata:{fromCache:false,hasPendingWrites:false},forEach(fn){docs.forEach(fn)}};}
globalThis._fb_init={where,limit,startAfter,orderBy,documentId,collection,query,getDocs:async q=>{calls.push(q);return snap(q);}};
const {AttendanceService}=await import(pathToFileURL(path.join(root,'js/services/attendance.service.js')).href+'?r11='+Date.now());
principal('admin'); calls=[];
let rows=await AttendanceService.loadByDate('2026-01-10',{branch:'CS1',shiftId:'S1',requireShift:true,shiftAuthorityMode:'explicit-shift',historicalReopen:true,isCurrent:()=>true});
check('PAST_DAY_LEGACY_NO_SHIFT_RED_CLOSED',rows.some(r=>r.id==='ns')&&rows.some(r=>r.id==='s1'));
check('HISTORICAL_REOPEN_ONE_QUERY',calls.length===1);
check('HISTORICAL_REOPEN_QUERY_HAS_NO_SHIFT_FILTER',!calls[0].constraints.some(c=>c.kind==='where'&&c.field==='shiftId'));
calls=[]; rows=await AttendanceService.loadByDate('2026-01-10',{branch:'CS1',shiftId:'S1',requireShift:true,shiftAuthorityMode:'explicit-shift',historicalReopen:false,isCurrent:()=>true});
check('CURRENT_DAY_REMAINS_SHIFT_EXACT',rows.length===1&&rows[0].id==='s1'&&calls[0].constraints.some(c=>c.kind==='where'&&c.field==='shiftId'&&c.value==='S1'));
principal('admin'); calls=[]; const p1=await AttendanceService.loadMemberHistory('PMOVE',null,{page:true,pageSize:1,consistency:'server',authorityScope:'recorded'});
let cursorRejected=false;try{await AttendanceService.loadMemberHistory('PMOVE',null,{page:true,pageSize:1,branch:'CS2',cursor:p1.cursor,consistency:'server',authorityScope:'recorded'});}catch(e){cursorRejected=e.code==='attendance/history-cursor-scope';}
check('MEMBER_HISTORY_SCOPE_CHANGE_RESETS_CURSOR',cursorRejected);
const ids=[...p1.rows.map(r=>r.id)];let cur=p1.cursor;while(cur){const pg=await AttendanceService.loadMemberHistory('PMOVE',null,{page:true,pageSize:1,cursor:cur,consistency:'server',authorityScope:'recorded'});ids.push(...pg.rows.map(r=>r.id));cur=pg.cursor;}
check('PAGINATION_NO_DUPLICATE_ROW',new Set(ids).size===ids.length);
check('PAGINATION_NO_ROW_LOSS',new Set(ids).size===3);
principal('coach','CS1'); calls=[]; rows=await AttendanceService.loadByDate('2026-01-10',{branch:'CS1',shiftId:'S1',requireShift:true,shiftAuthorityMode:'explicit-shift',historicalReopen:true,isCurrent:()=>true});
check('COACH_HISTORY_ALWAYS_ASSIGNED_BRANCH_ONLY',rows.every(r=>r.data.branch==='CS1'&&r.data.historyAuthority==='attendance-v2')&&rows.every(r=>r.data.shiftId==='S1'));
check('COACH_LEGACY_HISTORY_DENIED',!rows.some(r=>r.id==='ns'));

if(process.env.ATT_R1_1_SKIP_CACHE!=='1'){
 check('ATTENDANCE_R1_1_INDEX_MAIN_USES_ACCEPTED_PARENT_TOKEN',!!ACCEPTED_PARENT_LINEAGE&&!!_mainEdge&&html.includes(_mainEdge.url)&&new URL(_mainEdge.url,'https://qa/').searchParams.get('v')===ACCEPTED_PARENT_LINEAGE);
 check('ATTENDANCE_R1_1_MAIN_ATTENDANCE_USES_NEW_TOKEN',main.includes(`./modules/attendance.js?v=${NEW}`));
 check('ATTENDANCE_R1_1_MAIN_REPORT_PARENT_USES_NEW_TOKEN',main.includes(`./modules/reports/reportExportFacade.js?v=${NEW}`));
 check('ATTENDANCE_R1_1_ATTENDANCE_SERVICE_USES_NEW_TOKEN',att.includes(`../services/attendance.service.js?v=${NEW}`));
 check('ATTENDANCE_R1_1_REPORT_EXCEL_USES_NEW_TOKEN',reportFacade.includes(`./attendanceExcelReport.js?v=${NEW}`));
 const old='qr-v11r6-a9r18-usability-perf-r2r4-r6-20261029';
 const staleChangedEdge = new RegExp('s\\.src\\s*=\\s*[\"\']\\.\\/js\\/main\\.js\\?v='+old).test(html) ||
   main.includes(`from \"./modules/attendance.js?v=${old}\"`) ||
   main.includes(`from \"./modules/reports/reportExportFacade.js?v=${old}\"`) ||
   att.includes(`from \"../services/attendance.service.js?v=${old}\"`) ||
   reportFacade.includes(`import(\"./attendanceExcelReport.js?v=${old}\")`);
 check('ATTENDANCE_R1_1_NO_OLD_ACTIVE_IMPORT_TOKEN',!staleChangedEdge);
}
console.log(`\nPASS ${passes.length}/${passes.length+failures.length}`);if(failures.length){console.error(failures.join('\n'));process.exit(1);}
