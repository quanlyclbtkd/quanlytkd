# BSTATS R1.1 — Baseline Call Graph / Ownership Inventory

Baseline normal path proved before patch:

```text
Finance compute/cache → render.js or list refresh → SAME finance bStats passed to Students → Students mutates active/debt → Dashboard cache → __store._lastBStats → renderBranchStats
```

## Occurrence classification

| File:line | Class | Baseline occurrence |
|---|---|---|
| `js/ui/render/computation/financeRenderer.js:375` | **PRODUCER** | `const bStats = {}, bExamStats = {};` |
| `js/ui/render/computation/financeRenderer.js:377` | **PRODUCER** | `bStats['CS' + bi]     = { income: 0, active: 0, debt: 0, tuitionMap: {}, examFeeMap: {} };` |
| `js/ui/render/computation/financeRenderer.js:512` | **PRODUCER** | `if (!bStats[_normBr]) {` |
| `js/ui/render/computation/financeRenderer.js:513` | **PRODUCER** | `bStats[_normBr] = { income: 0, active: 0, debt: 0, tuitionMap: {}, examFeeMap: {} };` |
| `js/ui/render/computation/financeRenderer.js:535` | **PRODUCER** | `if (!bStats[cBr]) {` |
| `js/ui/render/computation/financeRenderer.js:536` | **PRODUCER** | `bStats[cBr] = { income: 0, active: 0, debt: 0, tuitionMap: {}, examFeeMap: {} };` |
| `js/ui/render/computation/financeRenderer.js:546` | **PRODUCER** | `bStats[cBr].income += amtM;` |
| `js/ui/render/computation/financeRenderer.js:551` | **PRODUCER** | `if (fk > 0) bStats[cBr].tuitionMap[fk] = (bStats[cBr].tuitionMap[fk] \|\| 0) + 1;` |
| `js/ui/render/computation/financeRenderer.js:556` | **PRODUCER** | `bStats[cBr].income += ca;` |
| `js/ui/render/computation/financeRenderer.js:558` | **PRODUCER** | `if (ek > 0) bStats[cBr].examFeeMap[ek] = (bStats[cBr].examFeeMap[ek] \|\| 0) + 1;` |
| `js/ui/render/computation/financeRenderer.js:561` | **PRODUCER** | `bStats[cBr].income += amtM \|\| ca;` |
| `js/ui/render/computation/financeRenderer.js:564` | **PRODUCER** | `bStats[cBr].income += amtM;` |
| `js/ui/render/computation/financeRenderer.js:575` | **PRODUCER** | `bStats[_normBr].income += allocatedAmount + _examPart;` |
| `js/ui/render/computation/financeRenderer.js:579` | **PRODUCER** | `if (_ek > 0) bStats[_normBr].examFeeMap[_ek] = (bStats[_normBr].examFeeMap[_ek] \|\| 0) + 1;` |
| `js/ui/render/computation/financeRenderer.js:583` | **PRODUCER** | `if (_ek2 > 0) bStats[_normBr].examFeeMap[_ek2] = (bStats[_normBr].examFeeMap[_ek2] \|\| 0) + 1;` |
| `js/ui/render/computation/financeRenderer.js:590` | **PRODUCER** | `if (_tf > 0) bStats[_normBr].tuitionMap[_tf] = (bStats[_normBr].tuitionMap[_tf] \|\| 0) + 1;` |
| `js/ui/render/computation/financeRenderer.js:626` | **PRODUCER** | `Object.keys(bStats).forEach(branch => {` |
| `js/ui/render/computation/financeRenderer.js:627` | **PRODUCER** | `bStats[branch].examFeeMap = {};` |
| `js/ui/render/computation/financeRenderer.js:628` | **PRODUCER** | `bStats[branch].examRegisteredCount = 0;` |
| `js/ui/render/computation/financeRenderer.js:629` | **PRODUCER** | `bStats[branch].examRegisteredNames = [];` |
| `js/ui/render/computation/financeRenderer.js:634` | **PRODUCER** | `if (!bStats[branch]) {` |
| `js/ui/render/computation/financeRenderer.js:635` | **PRODUCER** | `bStats[branch] = {` |
| `js/ui/render/computation/financeRenderer.js:643` | **PRODUCER** | `bStats[branch].examFeeMap = { ...(info.feeMap \|\| {}) };` |
| `js/ui/render/computation/financeRenderer.js:644` | **PRODUCER** | `bStats[branch].examRegisteredCount = info.registeredCount \|\| 0;` |
| `js/ui/render/computation/financeRenderer.js:645` | **PRODUCER** | `bStats[branch].examRegisteredNames = info.names \|\| [];` |
| `js/ui/render/computation/financeRenderer.js:658` | **PRODUCER** | `bStats, bExamStats,` |
| `js/ui/render/computation/studentsRenderer.js:389` | **MUTATOR** | `bStats          = {},` |
| `js/ui/render/computation/studentsRenderer.js:572` | **MUTATOR** | `if (bStats[safeBranch]) bStats[safeBranch].active++;` |
| `js/ui/render/computation/studentsRenderer.js:659` | **MUTATOR** | `if (bStats[safeBranch] !== undefined) bStats[safeBranch].debt++;` |
| `js/ui/render.js:342` | **COMPOSER** | `const _bStats        = _finSummary.bStats        \|\| {};` |
| `js/ui/render.js:354` | **COMPOSER** | `isAdmin: _isAdmin, bStats: _bStats,` |
| `js/ui/render.js:473` | **COMPOSER** | `bStats:         _bStats,` |
| `js/ui/render.js:480` | **CACHE** | `window.__store._lastBStats        = _bStats;` |
| `js/ui/render/listComputationRefresh.js:336` | **COMPOSER** | `const bStats     = finSummary.bStats \|\| {};` |
| `js/ui/render/listComputationRefresh.js:349` | **COMPOSER** | `bStats,` |
| `js/ui/render/listComputationRefresh.js:453` | **CACHE** | `const bStats = (fin && fin.bStats) \|\| (window.__store && window.__store._lastBStats) \|\| {};` |
| `js/ui/render/listComputationRefresh.js:497` | **COMPOSER** | `bStats,` |
| `js/ui/render/listComputationRefresh.js:505` | **CACHE** | `window.__store._lastBStats = bStats;` |
| `js/ui/render/listComputationRefresh.js:519` | **COMPOSER** | `try { window.renderBranchStats(bStats); } catch (_) {}` |
| `js/ui/render/computation/dashboardRenderer.js:33` | **CACHE** | `bStats:           null,   // { CS1: { income, active, debt, ... }, ... }` |
| `js/ui/render/computation/dashboardRenderer.js:52` | **CACHE** | `if (section === 'branchStats'   \|\| section === 'all') _cache.bStats         = null;` |
| `js/ui/render/computation/dashboardRenderer.js:98` | **CACHE** | `if (data.bStats         !== undefined) _cache.bStats         = data.bStats;` |
| `js/ui/render/computation/dashboardRenderer.js:127` | **CACHE** | `return _cache.bStats \|\| null;` |
| `js/modules/dashboard.js:186` | **PRESENTATION** | `export function renderBranchStats(bStats) {` |
| `js/modules/dashboard.js:202` | **PRESENTATION** | `const bd    = bStats[bCode] \|\| { income: 0, active: 0, debt: 0, tuitionMap: {}, examFeeMap: {} };` |
| `js/modules/dashboard.js:1401` | **CACHE** | `bStats: (window.__store && window.__store._lastBStats) \|\| {},` |
| `js/modules/dashboard.js:1996` | **DIAGNOSTIC** | `window.refreshDashboardBranchStatsFullMonth = async function(selectedMonth) {` |
| `js/modules/dashboard.js:2010` | **DIAGNOSTIC** | `const bStats = {}, bExamStats = {};` |
| `js/modules/dashboard.js:2012` | **DIAGNOSTIC** | `bStats['CS' + bi]     = { income: 0, active: 0, debt: 0, tuitionMap: {}, examFeeMap: {} };` |
| `js/modules/dashboard.js:2036` | **DIAGNOSTIC** | `if (!bStats[cBr]) { bStats[cBr] = { income: 0, active: 0, debt: 0, tuitionMap: {}, examFeeMap: {} }; }` |
| `js/modules/dashboard.js:2041` | **DIAGNOSTIC** | `bStats[cBr].income += amtM;` |
| `js/modules/dashboard.js:2043` | **DIAGNOSTIC** | `if (fk > 0) bStats[cBr].tuitionMap[fk] = (bStats[cBr].tuitionMap[fk] \|\| 0) + 1;` |
| `js/modules/dashboard.js:2047` | **DIAGNOSTIC** | `bStats[cBr].income += ca;` |
| `js/modules/dashboard.js:2049` | **DIAGNOSTIC** | `if (ek > 0) bStats[cBr].examFeeMap[ek] = (bStats[cBr].examFeeMap[ek] \|\| 0) + 1;` |
| `js/modules/dashboard.js:2052` | **DIAGNOSTIC** | `bStats[cBr].income += amtM \|\| ca;` |
| `js/modules/dashboard.js:2055` | **DIAGNOSTIC** | `bStats[cBr].income += amtM;` |
| `js/modules/dashboard.js:2062` | **DIAGNOSTIC** | `if (!bStats[br]) { bStats[br] = { income: 0, active: 0, debt: 0, tuitionMap: {}, examFeeMap: {} }; }` |
| `js/modules/dashboard.js:2067` | **DIAGNOSTIC** | `bStats[br].income += alloc;` |
| `js/modules/dashboard.js:2069` | **DIAGNOSTIC** | `if (tf > 0) bStats[br].tuitionMap[tf] = (bStats[br].tuitionMap[tf] \|\| 0) + 1;` |
| `js/modules/dashboard.js:2073` | **DIAGNOSTIC** | `bStats[br].income += ta + ea;` |
| `js/modules/dashboard.js:2074` | **DIAGNOSTIC** | `if (ta > 0) bStats[br].tuitionMap[Math.round(ta)] = (bStats[br].tuitionMap[Math.round(ta)] \|\| 0) + 1;` |
| `js/modules/dashboard.js:2075` | **DIAGNOSTIC** | `if (ea > 0) { bStats[br].examFeeMap[Math.round(ea)] = (bStats[br].examFeeMap[Math.round(ea)] \|\| 0) + 1; bExamStats[br] += ea; }` |
| `js/modules/dashboard.js:2077` | **DIAGNOSTIC** | `bStats[br].income += alloc;` |
| `js/modules/dashboard.js:2079` | **DIAGNOSTIC** | `if (ek > 0) { bStats[br].examFeeMap[ek] = (bStats[br].examFeeMap[ek] \|\| 0) + 1; bExamStats[br] += alloc; }` |
| `js/modules/dashboard.js:2081` | **DIAGNOSTIC** | `bStats[br].income += alloc;` |
| `js/modules/dashboard.js:2095` | **DIAGNOSTIC** | `Object.keys(bStats).forEach(function(branch) {` |
| `js/modules/dashboard.js:2096` | **DIAGNOSTIC** | `bStats[branch].examFeeMap = {};` |
| `js/modules/dashboard.js:2097` | **DIAGNOSTIC** | `bStats[branch].examRegisteredCount = 0;` |
| `js/modules/dashboard.js:2098` | **DIAGNOSTIC** | `bStats[branch].examRegisteredNames = [];` |
| `js/modules/dashboard.js:2103` | **DIAGNOSTIC** | `if (!bStats[branch]) {` |
| `js/modules/dashboard.js:2104` | **DIAGNOSTIC** | `bStats[branch] = {` |
| `js/modules/dashboard.js:2112` | **DIAGNOSTIC** | `bStats[branch].examFeeMap = Object.assign({}, info.feeMap \|\| {});` |
| `js/modules/dashboard.js:2113` | **DIAGNOSTIC** | `bStats[branch].examRegisteredCount = info.registeredCount \|\| 0;` |
| `js/modules/dashboard.js:2114` | **DIAGNOSTIC** | `bStats[branch].examRegisteredNames = info.names \|\| [];` |
| `js/modules/dashboard.js:2119` | **DIAGNOSTIC** | `if (typeof window.renderBranchStats    === 'function') window.renderBranchStats(bStats);` |
| `js/modules/dashboard.js:2122` | **DIAGNOSTIC** | `st._lastBStats     = bStats;` |
| `js/modules/dashboard.js:2130` | **DIAGNOSTIC** | `const bStats    = st._lastBStats    \|\| {};` |
| `js/modules/dashboard.js:2138` | **DIAGNOSTIC** | `const rows = Object.entries(bStats).map(([branch, data]) => ({` |
| `js/modules/dashboard.js:2163` | **DIAGNOSTIC** | `return { rows, componentRows, bStats, bExamStats };` |
| `js/modules/dashboard.js:2236` | **DIAGNOSTIC** | `refreshDashboardBranchStatsFullMonth: window.refreshDashboardBranchStatsFullMonth,` |
| `app.js:11126` | **LEGACY FALLBACK** | `const bStats = st._lastBStats \|\| {};` |
| `app.js:11127` | **LEGACY FALLBACK** | `const rows = Object.entries(bStats).map(function(_entry) {` |

## Reachability conclusion

- `financeRenderer`: normal-runtime **PRODUCER** of monetary/exam branch state; compatibility `active/debt` zeros are shape only.
- `studentsRenderer`: normal-runtime **MUTATOR** of the Finance-owned object on baseline; this is the root defect.
- `render.js` and `listComputationRefresh.js`: normal-runtime **COMPOSER/bridge** that passed the shared object into Students and then cached it.
- `dashboardRenderer`: **CACHE** for final presentation.
- `js/modules/dashboard.js::renderBranchStats`: **PRESENTATION**.
- `refreshDashboardBranchStatsFullMonth`: definition/export only in runtime; **DIAGNOSTIC_ONLY / UNREACHABLE_NORMAL_RUNTIME**.
- `app.js` `_lastBStats` reader: **LEGACY FALLBACK**; modular `window._moduleRenderApp` is the normal initialized path.
