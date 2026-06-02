/**
 * renderDashboard.js — Phase 3.5B Render Invalidation & Lifecycle Stabilization
 *
 * Dashboard render islands. Đọc data từ dashboardRenderer module-local cache
 * thay vì trực tiếp từ tabHtmlCache (backward compat vẫn giữ).
 *
 * Islands registered:
 *   dashboard.reportList    → #reportList          (monthly report row)
 *   dashboard.charts        → #financeChart         (finance/member charts)
 *   dashboard.branchStats   → #branchStatsContainer (branch statistics)
 *   dashboard.summary       → (calls updateSummaryNumbers)
 *   dashboard.examBranchFees→ (calls renderExamBranchFees)
 *
 * Phase 3.5B CHANGES:
 *   [1] Thêm dashboard.summary island — gọi updateSummaryNumbers() khi active
 *   [2] Thêm dashboard.examBranchFees island — gọi renderExamBranchFees() khi active
 *   [3] Đọc data từ dashboardRenderer cache (cacheDashboardData) thay vì tabHtmlCache
 *   [4] Fallback về tabHtmlCache nếu dashboardRenderer cache chưa có (backward compat)
 *
 * Backward compatibility:
 *   - Giữ key cũ: dashboard.reportList, dashboard.charts, dashboard.branchStats
 *   - Fallback về window.renderDashboardCharts/renderBranchStats/updateSummaryNumbers
 *   - tabHtmlCache vẫn được render.js populate để tabs.js legacy reader tiếp tục hoạt động
 */

import { registerRender } from './renderRegistry.js';
import {
    getDashboardReportHtml,
    getDashboardChartData,
    getDashboardBranchStats,
    getDashboardExamStats,
    getDashboardSummaryNumbers,
} from './computation/dashboardRenderer.js';

// ─── Core DOM helper ────────────────────────────────────────────────────────

function _applyHtml(el, html) {
    if (!el) return;
    if (!html) {
        el.replaceChildren();
        return;
    }
    const tpl = document.createElement('template');
    tpl.innerHTML = html;
    el.replaceChildren(tpl.content);
}

// Đọc từ dashboardRenderer cache, fallback về tabHtmlCache (backward compat)
function _getReportHtml() {
    const fromRenderer = getDashboardReportHtml();
    if (fromRenderer) return fromRenderer;
    // Fallback: tabHtmlCache set bởi render.js
    return ((window.__store || {}).tabHtmlCache || {}).reportList || '';
}

function _getChartData() {
    const fromRenderer = getDashboardChartData();
    if (fromRenderer) return fromRenderer;
    // Fallback: tabHtmlCache._chartData set bởi render.js
    return ((window.__store || {}).tabHtmlCache || {})._chartData || null;
}

function _getBStats() {
    const fromRenderer = getDashboardBranchStats();
    if (fromRenderer) return fromRenderer;
    // Fallback: _lastBStats set bởi render.js
    return (window.__store && window.__store._lastBStats) || null;
}

// ─── Island render functions ──────────────────────────────────────────────────

/**
 * Render the monthly report row (#reportList).
 * Đọc từ dashboardRenderer cache, fallback về tabHtmlCache.
 */
export function renderReportListIsland() {
    _applyHtml(document.getElementById('reportList'), _getReportHtml());
}

/**
 * Trigger dashboard chart renders.
 * Đọc chartData từ dashboardRenderer cache.
 * Delegates to dashboard.js via window.renderDashboardCharts.
 */
export function renderDashboardChartsIsland() {
    const chartData = _getChartData();
    if (chartData && typeof window.renderDashboardCharts === 'function') {
        window.renderDashboardCharts(chartData);
    }
}

/**
 * Trigger branch stats render.
 * Delegates to dashboard.js via window.renderBranchStats.
 */
export function renderBranchStatsIsland() {
    const bStats = _getBStats();
    if (bStats && typeof window.renderBranchStats === 'function') {
        window.renderBranchStats(bStats);
    }
}

/**
 * [Phase 3.5B NEW] Render summary numbers.
 * Gọi updateSummaryNumbers() với data từ dashboardRenderer cache.
 * Fallback về window.__store._lastSummaryNumbers nếu cache chưa có.
 */
export function renderDashboardSummaryIsland() {
    const summaryNumbers = getDashboardSummaryNumbers()
        || (window.__store && window.__store._lastSummaryNumbers)
        || null;
    if (summaryNumbers && typeof window.updateSummaryNumbers === 'function') {
        window.updateSummaryNumbers(summaryNumbers);
    } else if (summaryNumbers && typeof window._moduleDashboard === 'object'
               && typeof window._moduleDashboard.updateSummaryNumbers === 'function') {
        window._moduleDashboard.updateSummaryNumbers(summaryNumbers);
    }
    // Nếu không có function → không làm gì, để render.js handle như cũ
}

/**
 * [Phase 3.5B NEW] Render exam branch fees.
 * Gọi renderExamBranchFees() với data từ dashboardRenderer cache.
 */
export function renderExamBranchFeesIsland() {
    const bExamStats = getDashboardExamStats()
        || (window.__store && window.__store._lastBExamStats)
        || null;
    const incExam = (window.__store && window.__store._lastIncExam) || 0;
    if (bExamStats && typeof window.renderExamBranchFees === 'function') {
        window.renderExamBranchFees(bExamStats, incExam);
    }
}

// ─── Island initialiser ──────────────────────────────────────────────────────

/**
 * Register all dashboard render islands with the registry.
 * Call once during application bootstrap (main.js).
 *
 * Phase 3.5B: thêm dashboard.summary và dashboard.examBranchFees islands.
 * Giữ key cũ (dashboard.reportList, dashboard.charts, dashboard.branchStats)
 * để không breaking change.
 */
export function initDashboardIslands() {
    // ── Islands từ Phase 3.4 (giữ nguyên key) ────────────────────────────
    registerRender('dashboard.reportList', renderReportListIsland, {
        selector: '#reportList',
        tabId:    'dashboard',
    });
    registerRender('dashboard.charts', renderDashboardChartsIsland, {
        selector: '#financeChart',
        tabId:    'dashboard',
    });
    registerRender('dashboard.branchStats', renderBranchStatsIsland, {
        selector: '#branchStatsContainer',
        tabId:    'dashboard',
    });

    // ── Islands mới từ Phase 3.5B ─────────────────────────────────────────
    registerRender('dashboard.summary', renderDashboardSummaryIsland, {
        selector: '#summaryNumbers',
        tabId:    'dashboard',
    });
    registerRender('dashboard.examBranchFees', renderExamBranchFeesIsland, {
        selector: '#examBranchFees',
        tabId:    'dashboard',
    });
}
