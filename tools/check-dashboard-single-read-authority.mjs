#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const dashboard = fs.readFileSync('js/modules/dashboard.js','utf8');
const render = fs.readFileSync('js/ui/render.js','utf8');
const lcr = fs.readFileSync('js/ui/render/listComputationRefresh.js','utf8');
const main = fs.readFileSync('js/main.js','utf8');
let pass=0, fail=0;
const check=(name,ok,detail='')=>{ if(ok){pass++;console.log('✅',name)} else {fail++;console.error('❌',name,detail)} };

console.log('\n=== Phase 4K-6V5U6C2 — Dashboard Single Read Authority + Freshness Freeze ===\n');

const renderDashboardSection = render.slice(render.indexOf('// ── Chart data — 6 tháng gần nhất'), render.indexOf('export function initRender'));
const legacyStart = dashboard.indexOf('export async function fetchAndRenderHistoricalCharts');
const legacyEnd = dashboard.indexOf('// fetchMonthStats', legacyStart);
const legacyBlock = dashboard.slice(legacyStart, legacyEnd);
const tryStart = dashboard.indexOf('export async function tryApplyCurrentMonthStats');
const tryEnd = dashboard.indexOf('// initDashboard', tryStart);
const tryBlock = dashboard.slice(tryStart, tryEnd);
const canonicalStart = dashboard.indexOf('export async function fetchHistoricalDashboardFallback');
const canonicalEnd = dashboard.indexOf('export function scheduleDashboardHistoryFetch', canonicalStart);
const canonicalBlock = dashboard.slice(canonicalStart, canonicalEnd);

check('render.js Dashboard section has zero Firestore getDoc/getDocs', !/\bgetDoc(?:s)?\s*\(/.test(renderDashboardSection));
check('render.js no longer calls legacy historical network owner', !render.includes('fetchAndRenderHistoricalCharts('));
check('render.js no longer calls standalone current-month network owner', !render.includes('tryApplyCurrentMonthStats(selMonth)'));
check('render.js consumes canonical RAM snapshot', render.includes('getDashboardCanonicalStatsSnapshot(selMonth)'));
check('legacy fetchAndRenderHistoricalCharts has no getDoc/getDocs', !/\bgetDoc(?:s)?\s*\(/.test(legacyBlock));
check('legacy fetchAndRenderHistoricalCharts is RAM compatibility only', legacyBlock.includes('getDashboardCanonicalStatsSnapshot'));
check('tryApplyCurrentMonthStats has no standalone fetchMonthStats call', !tryBlock.includes('fetchMonthStats('));
check('tryApplyCurrentMonthStats consumes canonical payload', tryBlock.includes('getDashboardCanonicalStatsSnapshot'));
check('canonical scheduler remains trigger aggregator', dashboard.includes('export function scheduleDashboardHistoryFetch'));
check('canonical loader owns six-month/targeted stats acquisition', canonicalBlock.includes('Promise.all(monthsToFetch.map') && canonicalBlock.includes("'stats'") && canonicalBlock.includes('monthsToFetch'));
check('canonical loader reuses existing TTL', dashboard.includes('_SPARK_HISTORY_TTL_MS') && dashboard.includes('_readSparkHistoryCache'));
check('canonical loader reuses one single-flight map', dashboard.includes('const _sparkHistoryInFlight = new Map()') && canonicalBlock.includes('_sparkHistoryInFlight.has(key)'));
check('canonical loader uses immutable flight freshness token', canonicalBlock.includes('Object.freeze({ ...requestToken })') && !canonicalBlock.includes('flight.token = requestToken'));
check('dirty month revalidation remains inside canonical loader', canonicalBlock.includes('monthsToFetch') && canonicalBlock.includes('_isCachedDashboardMonthReusable'));
check('hidden Dashboard remains zero-read via scheduler gate', dashboard.includes('dashboardHistorySkippedHidden') && dashboard.includes("skipped: 'dashboard-hidden'"));
check('compact transaction fallback remains txMonth/date/packageMonths', dashboard.includes('loadTransactionsForTxMonthRange') && dashboard.includes('loadTransactionsForDateRange') && dashboard.includes("'array-contains-any'"));
check('canonical payload includes monthStats/current month reuse', canonicalBlock.includes('monthStats') && canonicalBlock.includes('selectedMonth: selMonth'));
check('zero values use coverage, not truthiness, for authority', dashboard.includes('stats.coverage.income') && dashboard.includes('stats.coverage.expense') && !dashboard.includes('if (!incTotal)'));
check('stale guard captures club/month/auth/request generation', dashboard.includes('_captureDashboardHistoryRequestToken') && dashboard.includes('_isDashboardHistoryTokenCurrent'));
check('stale result increments dedicated metric', dashboard.includes('dashboardStaleResultDropped++'));
check('canonical read attribution uses dashboard.canonicalStatsReads', dashboard.includes("'dashboard.canonicalStatsReads'"));
check('transaction fallback docs metric exists', dashboard.includes('dashboardTransactionFallbackDocs'));
check('main APP_BUILD_VERSION is V5U6C2 marker', main.includes("4K-6V5U6C2-dashboard-hydration-mutation-guard-20260812"));
check('Dashboard recompute still routes network intent through scheduler', lcr.includes('scheduleDashboardHistoryFetch'));

function deferred(){ let resolve; const promise=new Promise(r=>resolve=r); return {promise,resolve}; }
function makeEnv({month='2026-08', clubId='club-A', generation=1, deferredGroups=false, statsData: customStatsData=null}={}) {
  const storage=new Map();
  const elements=new Map();
  let currentMonth=month;
  const filter={ get value(){return currentMonth}, set value(v){currentMonth=v} };
  const activeTab={id:'tab_dashboard'};
  const getEl=(id)=>{
    if(id==='filterMonth'||id==='monthPicker') return filter;
    if(!elements.has(id)) elements.set(id,{innerText:'',innerHTML:'',value:'',style:{},classList:{add(){},remove(){}}});
    return elements.get(id);
  };
  globalThis.document={
    getElementById:getEl,
    querySelector:(sel)=> sel==='.tab-content.active'?activeTab:null,
    querySelectorAll:()=>[],
  };
  globalThis.localStorage={
    getItem:k=>storage.has(k)?storage.get(k):null,
    setItem:(k,v)=>storage.set(k,String(v)),
    removeItem:k=>storage.delete(k),
  };
  let getDocCount=0, getDocsCount=0, renderCount=0;
  const gateA=deferred(), gateB=deferred();
  let useDeferred=deferredGroups;
  const statsData=customStatsData || {
    'income.total': 900000,
    'expense.total': 100000,
    'members.active': 25,
    'members.new': 2,
    'members.quit': 1,
    txCount: 12,
  };
  const sdk={
    doc:(...parts)=>({parts}),
    getDoc: async ()=>{
      getDocCount++;
      if(useDeferred){
        if(getDocCount<=6) await gateA.promise; else await gateB.promise;
      }
      return {exists:()=>true,data:()=>({...statsData})};
    },
    collection:(...parts)=>({parts}),
    query:(ref,...args)=>({ref,args}),
    where:(...args)=>({where:args}),
    limit:(n)=>({limit:n}),
    getDocs: async ()=>{ getDocsCount++; return {docs:[]}; },
  };
  globalThis.window={
    _fb_init:sdk,
    __store:{db:{},clubId,currentClubId:clubId,selectedMonth:month,tabHtmlCache:{},_lastSummaryNumbers:{}},
    __verifiedAuthContextState:{generation},
    __sparkReadMetrics:null,
    formatMonthLabel:(m)=>m,
    getRecentMonths:(sel,count)=>{
      const [y0,m0]=sel.split('-').map(Number); const arr=[];
      for(let i=count-1;i>=0;i--){ let y=y0,m=m0-i; while(m<=0){m+=12;y--} arr.push(`${y}-${String(m).padStart(2,'0')}`); }
      return arr;
    },
    renderDashboardCharts:()=>{renderCount++},
    computeMonthlyFinanceHistory:()=>({}),
    recordFirestoreReadAttribution:()=>{},
  };
  return {
    elements, filter, gateA, gateB,
    setMonth(v){currentMonth=v; window.__store.selectedMonth=v},
    setClub(id,gen){window.__store.clubId=id;window.__store.currentClubId=id;window.__verifiedAuthContextState.generation=gen},
    counts:()=>({getDocCount,getDocsCount,renderCount}),
    storage,
  };
}

try {
  const env=makeEnv();
  const mod=await import(pathToFileURL(path.resolve('js/modules/dashboard.js')).href+`?v5u6c=${Date.now()}`);
  const p1=mod.fetchHistoricalDashboardFallback('2026-08','test-1');
  const p2=mod.fetchHistoricalDashboardFallback('2026-08','test-2');
  const p3=mod.fetchHistoricalDashboardFallback('2026-08','test-3');
  await Promise.all([p1,p2,p3]);
  check('dynamic single-flight: 3 same-key calls perform exactly 6 stats reads', env.counts().getDocCount===6, JSON.stringify(env.counts()));
  check('dynamic single-flight: coalesced metric increments', window.__sparkReadMetrics.dashboardSingleFlightCoalesced===2);
  check('dynamic current-month stats authority overrides RAM totals', env.elements.get('totalIncomeDashboard')?.innerText==='900.000 ₫', env.elements.get('totalIncomeDashboard')?.innerText||'');
  const before=env.counts().getDocCount;
  await mod.fetchHistoricalDashboardFallback('2026-08','ttl-repeat');
  check('dynamic TTL: repeat call performs zero additional stats reads', env.counts().getDocCount===before);
  check('dynamic TTL: cacheHit metric increments', window.__sparkReadMetrics.dashboardCacheHit>=1);
  const forceBefore=env.counts().getDocCount;
  await Promise.all([
    mod.fetchHistoricalDashboardFallback('2026-08','force-reload',{force:true}),
    mod.fetchHistoricalDashboardFallback('2026-08','force-reload',{force:true}),
  ]);
  check('dynamic force refresh still single-flights same key', env.counts().getDocCount===forceBefore+6);
} catch(e) {
  console.error(e);
  check('dynamic single-flight/TTL/current-month simulation completed',false);
}


try {
  const env=makeEnv({statsData:{'income.total':0,'expense.total':0,'members.active':0,'members.new':0,'members.quit':0,txCount:0}});
  const mod=await import(pathToFileURL(path.resolve('js/modules/dashboard.js')).href+`?zero=${Date.now()}`);
  await mod.fetchHistoricalDashboardFallback('2026-08','zero-stats',{force:true});
  check('dynamic zero semantics: zero-valued covered stats do not trigger transaction fallback', env.counts().getDocsCount===0, JSON.stringify(env.counts()));
  check('dynamic zero semantics: authoritative zero applies to current total', env.elements.get('totalIncomeDashboard')?.innerText==='0 ₫', env.elements.get('totalIncomeDashboard')?.innerText||'');
} catch(e) {
  console.error(e);
  check('dynamic zero-value simulation completed',false);
}

try {
  const env=makeEnv({month:'2026-07',deferredGroups:true});
  const mod=await import(pathToFileURL(path.resolve('js/modules/dashboard.js')).href+`?stale=${Date.now()}`);
  const a=mod.fetchHistoricalDashboardFallback('2026-07','month-A',{force:true});
  await Promise.resolve();
  env.setMonth('2026-08');
  const b=mod.fetchHistoricalDashboardFallback('2026-08','month-B',{force:true});
  await Promise.resolve();
  env.gateB.resolve();
  const br=await b;
  env.gateA.resolve();
  const ar=await a;
  const snap=mod.getDashboardCanonicalStatsSnapshot('2026-08');
  check('dynamic stale month: newer month B is applied', br?.ready===true && snap.ready && snap.selectedMonth==='2026-08');
  check('dynamic stale month: late month A is dropped', ar?.stale===true && ar?.dropped===true);
  check('dynamic stale month: staleResultDropped increments', window.__sparkReadMetrics.dashboardStaleResultDropped===1);
  check('dynamic stale month: only B renders charts', env.counts().renderCount===1, JSON.stringify(env.counts()));
} catch(e) {
  console.error(e);
  check('dynamic stale month simulation completed',false);
}

try {
  const env=makeEnv({month:'2026-08',clubId:'club-A',generation:1,deferredGroups:true});
  const mod=await import(pathToFileURL(path.resolve('js/modules/dashboard.js')).href+`?clubstale=${Date.now()}`);
  const a=mod.fetchHistoricalDashboardFallback('2026-08','club-A',{force:true});
  await Promise.resolve();
  env.setClub('club-B',2);
  const b=mod.fetchHistoricalDashboardFallback('2026-08','club-B',{force:true});
  await Promise.resolve();
  env.gateB.resolve(); await b;
  env.gateA.resolve(); const ar=await a;
  const snap=mod.getDashboardCanonicalStatsSnapshot('2026-08');
  check('dynamic stale club: late Club A result is dropped', ar?.stale===true);
  check('dynamic stale club: canonical snapshot remains Club B', snap.ready && snap.clubId==='club-B');
} catch(e) {
  console.error(e);
  check('dynamic stale club simulation completed',false);
}

console.log(`\nPASS ${pass}/${pass+fail}`);
if(fail) process.exit(1);
