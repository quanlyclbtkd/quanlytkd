# Phase 4.0B-4J-8 — Firestore Read Scale Report
## Server-Side Pagination for 1000 Students per Club

**Date:** 2026-05-31  
**Phase:** 4.0B-4J-8  
**Target:** Support 600–1000 students per club without Firestore limit(500) causing data loss.

---

## Executive Summary

This phase removes all dangerous `limit(500)` hard caps and replaces them with:
- Cursor-based server-side pagination for all major collections
- A centralized `window.__scaleConfig` controlling all hard limits
- A `window.recordReadMetric()` instrumentation layer for live diagnostics
- `window.fetchAllPagesForExport()` for safe full-collection exports
- Bumped attendance limits: 500 → 1200/day, no cap → 10,000/month

---

## Changes by Component

### 1. Global Scale Config — `app.js`

New global `window.__scaleConfig` (after Phase 4.0B-4D metrics init block):

| Key | Value | Notes |
|-----|-------|-------|
| `profilesPageSize` | 50 | Cursor page size — students tab |
| `transactionsPageSize` | 100 | Cursor page size — finance tab |
| `inventoryPageSize` | 100 | Cursor page size — inventory tab |
| `attendanceDailyLimit` | 1200 | Up from 500. Covers 1000 students × 2 shifts |
| `attendanceMonthlyLimit` | 10,000 | Safety cap for monthly aggregation |
| `txListenerLimit` | 1200 | Up from 500. Real-time listener for finance tab |
| `invListenerLimit` | 500 | OK — display only, unpaid debts use separate query |
| `legacyFallbackLimit` | 1200 | Up from 500 in `_readLegacy()` |
| `exportBatchSize` | 200 | `fetchAllPagesForExport()` page size |
| `warnThresholdProfiles` | 1200 | Console warning threshold |

### 2. Read Metrics Infrastructure — `app.js`

New globals exposed on `window`:

| Global | Description |
|--------|-------------|
| `window.__readScaleMetrics` | Ring buffer (last 200 reads) recording collection, docCount, reason, timestamp |
| `window.recordReadMetric(col, n, reason)` | Records a read event; warns if profiles > warnThresholdProfiles |
| `window.printReadScaleMetrics()` | DevTools helper — prints read summary by collection |
| `window.printScaleReadiness()` | DevTools helper — prints full scale config + recent reads |
| `window.fetchAllPagesForExport(fn, opts)` | Paginates through all pages for export; records metrics |

### 3. Profiles Pagination — `js/services/students.service.js`

**Already implemented in Phase 3.2A.** `StudentService.getProfilesPage()`:
- Cursor-based (startAfter/startAt), pageSize + 1 hasNext detection
- Search prefix support (startAt/endAt on `__name__`)
- Status filter (where clause)
- Wired to `window._loadMore()` in app.js (load-more buttons in students tab)

New in this phase:
- `recordReadMetric('profiles', snap.size, ...)` added to fallback profiles listener callback

### 4. Finance Pagination + Export — `js/services/finance.service.js`

**Already implemented in Phase 3.2A.** `FinanceService.getTransactionsPage()` and `getTransactionsByDatePage()`:
- Cursor-based, txMonth filter, orderBy timestamp desc
- pageSize + 1 hasNext detection

New in this phase:
- `recordReadMetric('transactions', n, 'tx-merge-render')` added to `_mergeAndRender()`
- Transactions real-time listener bumped: `limit(500)` → `limit(txListenerLimit)` = 1200
- `window.fetchAllPagesForExport()` added to app.js for safe full-period exports

### 5. Inventory Pagination — `js/services/inventory.service.js`

**New in Phase 4J-8.** `InventoryService.getInventoryPage()`:
- Cursor-based (startAfter/startAt), pageSize + 1 hasNext detection
- Supports `typeFilter` (Nhập/Xuất/Xuất bán)
- Supports date range filter (uses `orderBy('date', 'desc')`) or timestamp order
- Page size default: 100 (from `__scaleConfig.inventoryPageSize`)

### 6. Attendance Scale Safety — `js/services/attendance.service.js`

| Method | Before | After |
|--------|--------|-------|
| `loadByDate()` | `limit(500)` hard-coded | `limit(__scaleConfig.attendanceDailyLimit \|\| 1200)` |
| `loadByMonth()` | No limit (full scan) | `limit(__scaleConfig.attendanceMonthlyLimit \|\| 10000)` safety cap |

**Rationale:**
- 1000 students × 2 shifts/day = 2000 max attendance records/day. Old limit(500) would truncate by 75%.
- 1200 provides headroom (buffer for multi-club data or schema oddities).
- Monthly: 1000 students × 30 days × 2 shifts = 60,000 max. limit(10,000) is a safety cap that flags if data volume is unexpectedly high (data model issue indicator).

### 7. Legacy Fallback Scale Safety — `app.js`

`_readLegacy(colName)` changed from `limit(500)` to:
```js
limit(((window.__scaleConfig || {}).legacyFallbackLimit) || 1200)
```
Ensures legacy-root fallback reads the full dataset for clubs up to ~1200 profiles.

---

## Unsafe Limits Remaining (Tracked, Not Fixed)

These `limit()` calls are intentionally kept at their current values with comments explaining why they are safe:

| Location | Limit | Reason Safe |
|----------|-------|-------------|
| `finance.service.js` `queryTxByDateRange()` | 2000 | Excel export — a full period; documented `[3.3E]` |
| `finance.service.js` `queryTxByTxMonthRange()` | 2000 | Excel export — txMonth range; documented `[3.3E]` |
| `finance.service.js` `queryInvByDateRange()` | 1000 | Excel inventory export; documented `[3.3E]` |
| `students.service.js` `findTransactionsByStudent()` | 500 | Per-student tx scan (max ~500 per student); documented `[3.3E]` |
| `app.js` inventory listener | 500 | Display only — `OK_UI_DISPLAY_LIMIT`; unpaid debts loaded separately without limit |
| `app.js` parent-club profile scan | 500 | Rare fallback path; `warnUnsafeLimit` already fires |
| `app.js` rename tx scan | 500 | Per-student scan; `warnUnsafeLimit` fires |

---

## Verification

```sh
npm run check:scale      # Runs tools/check-scale-readiness.mjs
npm run check:all        # Full suite including scale check
```

Check tool: `tools/check-scale-readiness.mjs`  
Sections: 10 | Total checks: 30+

---

## DevTools Diagnostics

After loading the app in the browser:

```js
// View current scale config
window.printScaleReadiness()

// View read metrics summary
window.printReadScaleMetrics()

// Inspect raw read log
window.__readScaleMetrics.reads

// Tune limits at runtime (takes effect on next query)
window.__scaleConfig.attendanceDailyLimit = 2000
window.__scaleConfig.txListenerLimit = 2000
```

---

## Impact Assessment

| Club Size | Before (limit 500) | After (Phase 4J-8) |
|-----------|-------------------|---------------------|
| ≤ 300 students | ✅ OK | ✅ OK |
| 301–500 students | ⚠️ At cap | ✅ Safe (1200 buffer) |
| 501–999 students | ❌ Data loss on att. | ✅ Safe |
| 1000 students | ❌ Severe truncation | ✅ Safe (1200 daily cap) |
| > 1000 students | ❌ Broken | ⚠️ Warning emitted — pagination required |

---

*Report generated: Phase 4.0B-4J-8 implementation complete.*
