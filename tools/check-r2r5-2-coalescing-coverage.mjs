#!/usr/bin/env node
import fs from 'node:fs';import path from 'node:path';
let pass=0,fail=0;const check=(n,c,d='')=>{if(c){pass++;console.log('PASS',n)}else{fail++;console.error('FAIL',n,d)}};
const root=process.cwd();
function directCallsites(){const files=[];const walk=d=>{for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name);if(e.isDirectory())walk(p);else if(e.isFile()&&e.name.endsWith('.js'))files.push(p)}};walk(path.join(root,'js'));files.push(path.join(root,'app.js'));const out=[];for(const f of files){const ls=fs.readFileSync(f,'utf8').split(/\r?\n/);ls.forEach((line,i)=>{if(!line.includes('refreshListsComputation('))return;const t=line.trim();if(t.startsWith('//')||t.startsWith('*')||/function\s+refreshListsComputation\b/.test(line))return;out.push({file:path.relative(root,f).replaceAll('\\','/'),line:i+1,text:t})})}return out}
const calls=directCallsites();
check('B3 executable direct refresh callsites reduced to bounded retained set',calls.length===8,JSON.stringify(calls));
const allowed=new Set(['js/modules/students.js','js/ui/render/listComputationRefresh.js','js/ui/render/renderInvalidation.js','app.js']);
check('B3 no direct caller remains in main/search/listener mutation paths',calls.every(x=>allowed.has(x.file)),JSON.stringify(calls));
const byFile=Object.groupBy?Object.groupBy(calls,x=>x.file):calls.reduce((a,x)=>((a[x.file]??=[]).push(x),a),{});
check('B3 retained Students direct callers are island retry + two legacy load-more acceptance paths',(byFile['js/modules/students.js']||[]).length===3);
check('B3 coalescing owner retains exactly one internal flush direct call',(byFile['js/ui/render/listComputationRefresh.js']||[]).length===1);
check('B3 renderInvalidation retains exactly two canonical synchronous/fallback owners',(byFile['js/ui/render/renderInvalidation.js']||[]).length===2);
check('B3 protected app.js retains exactly two legacy direct callers',(byFile['app.js']||[]).length===2);
const search=fs.readFileSync('js/modules/searchRuntime.js','utf8');
check('B3 SearchRuntime has zero direct refreshListsComputation caller',!search.includes('refreshListsComputation('));
check('B3 cross-tab replay does not issue a second post-dispatch refresh',!search.includes("reason + '-refresh'")&&!search.includes("reason + '-invalidate'"));
const listSrc=fs.readFileSync('js/ui/render/listComputationRefresh.js','utf8');
check('B3 request owner stamps source/presentation context',listSrc.includes('function _requestContextStamp()')&&listSrc.includes('_retirePendingRefreshAsStale(stamp)'));
check('B3 stale incompatible pending request is retired before compute',listSrc.includes("dropReason: 'context-changed-before-flush'"));

// Dynamic same-context 3 -> 1 using the real candidate module in Node browser-like globals.
globalThis.window=globalThis;globalThis.location={hostname:'localhost'};let month='2026-10';
globalThis.document={getElementById:(id)=>({get value(){return id==='filterMonth'?month:id==='filterBranch'?'all':'';},textContent:'',innerHTML:''}),querySelector:()=>null};
window.__store={clubId:'C',currentClubId:'C',selectedMonth:'2026-10',selectedBranch:'all',transactions:[],profiles:Object.fromEntries(Array.from({length:10},(_,i)=>['S'+i,{status:'active',displayName:'S'+i,tuitionFee:250000,paidUntil:'2026-09'}])),inventory:[],clubConfig:{branchCount:1,tuitionFee:250000},transactionCoverage:{complete:true,pageServerComplete:true},pagination:{students:{currentItems:[],currentPage:1}}};
window.__verifiedAuthContextState={uid:'u',role:'admin',clubId:'C',ready:true,generation:1};window.studentProfileStore={version:1};window.__inventoryStore={version:1};window.classifyProfileStatus=p=>p?.status==='quit'?'quit':'active';window.getDebtOverdueFilterValue=()=>0;window.getActiveStudentNewFilter=()=> 'all';
window.__renderLegacyMetrics={listComputationRefreshCalls:0,listComputationRefreshByDomain:{},listComputationRefreshDuration:{},listRenderVersions:{},listComputationRefreshFallbacks:0,listComputationRefreshFailures:0};
const m=await import(`../js/ui/render/listComputationRefresh.js?r2r52coalesce=${Date.now()}`);
const same=await Promise.all([m.requestListsComputation(['students.activeList'],'a'),m.requestListsComputation(['students.debtList'],'b'),m.requestListsComputation(['students.quitList'],'c')]);
check('B3 dynamic same-context triple request shares one Students compute',window.__renderLegacyMetrics.listComputationRefreshByDomain.students===1,JSON.stringify(window.__renderLegacyMetrics.listComputationRefreshByDomain));
check('B3 dynamic same-context requests are not stale-dropped',same.every(x=>x?.stale!==true));
// Different context in the same turn: old pending request must not merge with the new one.
window.__renderLegacyMetrics.listComputationRefreshByDomain={};
const old=m.requestListsComputation(['students.activeList'],'oct');month='2026-11';window.__store.selectedMonth='2026-11';const latest=m.requestListsComputation(['students.debtList'],'nov');const [oldResult]=await Promise.all([old,latest]);
check('B3 dynamic different-context old request is stale-retired, not merged',oldResult?.stale===true&&oldResult?.dropReason==='context-changed-before-flush');
check('B3 dynamic different-context path performs at most one latest Students compute',(window.__renderLegacyMetrics.listComputationRefreshByDomain.students||0)<=1,JSON.stringify(window.__renderLegacyMetrics.listComputationRefreshByDomain));
console.log(`\nR2R5.2 coalescing coverage: ${pass} PASS / ${fail} FAIL`);if(fail)process.exit(1);
