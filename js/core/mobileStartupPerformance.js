/*
 * Phase 4K-6O — Mobile Startup Performance Gate
 * Module layer: attaches phase metadata and smoke-test friendly debug helpers.
 */
export function initMobileStartupPerformance() {
    const st = window.__mobileStartupPerf || (window.__mobileStartupPerf = {
        phase: '4K-6O-mobile-startup-performance-lazy-assets-20260608',
        marks: [],
        assets: {}
    });

    st.phase = '4K-6O-mobile-startup-performance-lazy-assets-20260608';
    st.moduleLoaded = true;
    st.buildVersion = window.APP_BUILD_VERSION || '';

    if (typeof window.markMobileStartup === 'function') {
        window.markMobileStartup('mobile-startup-module-init', { buildVersion: window.APP_BUILD_VERSION || '' });
    }

    window.debugLazyAssetsLoading = function debugLazyAssetsLoading() {
        const assets = (window.__mobileStartupPerf && window.__mobileStartupPerf.assets) || {};
        const result = {
            phase: st.phase,
            hasEnsureXlsxReady: typeof window.ensureXlsxReady === 'function',
            hasEnsureChartJsReady: typeof window.ensureChartJsReady === 'function',
            hasXlsx: !!window.XLSX,
            hasChart: !!window.Chart,
            xlsx: assets.xlsx || null,
            chart: assets.chart || null,
            xlsxInitiallyDeferred: !(assets.xlsx && assets.xlsx.loadedAtStart),
            chartInitiallyDeferred: !(assets.chart && assets.chart.loadedAtStart)
        };
        try { console.table({
            hasEnsureXlsxReady: result.hasEnsureXlsxReady,
            hasEnsureChartJsReady: result.hasEnsureChartJsReady,
            hasXlsx: result.hasXlsx,
            hasChart: result.hasChart,
            xlsxRequested: result.xlsx && result.xlsx.requested,
            chartRequested: result.chart && result.chart.requested,
            xlsxInitiallyDeferred: result.xlsxInitiallyDeferred,
            chartInitiallyDeferred: result.chartInitiallyDeferred
        }); } catch (_) {}
        return result;
    };

    // If bootstrap somehow did not expose these debug functions, expose safe fallbacks.
    window.debugMobileStartupPerformance = window.debugMobileStartupPerformance || function() {
        return { phase: st.phase, missingBootstrapDebug: true, state: window.__mobileStartupPerf || null };
    };
    window.debugStartupTimeline = window.debugStartupTimeline || function() {
        return (window.__mobileStartupPerf && window.__mobileStartupPerf.marks) || [];
    };
    window.debugStartupBottlenecks = window.debugStartupBottlenecks || function() {
        return { phase: st.phase, state: window.__mobileStartupPerf || null };
    };

    return st;
}

export default { initMobileStartupPerformance };
