#!/usr/bin/env node
/** Phase 4K-6V5U6C — Current-month stats authority must come from canonical RAM payload. */
import fs from 'node:fs';
const dash=fs.readFileSync('js/modules/dashboard.js','utf8');
const render=fs.readFileSync('js/ui/render.js','utf8');
let p=0,f=0; const c=(n,x)=>{x?(p++,console.log('✅',n)):(f++,console.error('❌',n))};
const t0=dash.indexOf('export async function tryApplyCurrentMonthStats');
const t1=dash.indexOf('// initDashboard',t0);
const t=dash.slice(t0,t1);
console.log('\n=== V5U6C Dashboard Current-Month Authority ===\n');
c('tryApplyCurrentMonthStats remains compatibility API',t0>=0);
c('compatibility API performs no standalone fetchMonthStats read',!t.includes('fetchMonthStats('));
c('compatibility API reads canonical RAM snapshot',t.includes('getDashboardCanonicalStatsSnapshot'));
c('canonical payload carries selectedMonth + monthStats',dash.includes('selectedMonth: selMonth')&&dash.includes('monthStats'));
c('current-month apply uses payload.monthStats[selectedMonth]',dash.includes('payload.monthStats[payload.selectedMonth]'));
c('income authority supports flat income.total',dash.includes("'income.total'"));
c('income authority supports nested income.total',dash.includes("'income', 'total'"));
c('expense authority supports flat expense.total',dash.includes("'expense.total'"));
c('zero is valid via coverage semantics',dash.includes('stats.coverage.income')&&dash.includes('stats.coverage.expense')&&!dash.includes('if (!incTotal)'));
c('current-month apply updates totalIncomeDashboard',dash.includes("'totalIncomeDashboard'"));
c('current-month apply updates totalExpenseDashboard',dash.includes("'totalExpenseDashboard'"));
c('current-month apply updates totalProfitDashboard',dash.includes("'totalProfitDashboard'"));
c('render.js no longer calls standalone current-month network path',!render.includes('tryApplyCurrentMonthStats(selMonth)'));
c('render.js consumes canonical Dashboard snapshot',render.includes('getDashboardCanonicalStatsSnapshot(selMonth)'));
c('normal current-month legacy read metric is not incremented by RAM apply',!dash.slice(dash.indexOf('function _applyCurrentMonthStatsFromPayload'),dash.indexOf('function _applyHistoricalDashboardPayload')).includes('dashboardCurrentMonthStatsRead'));
console.log(`\nPASS ${p}/${p+f}`); if(f) process.exit(1);
