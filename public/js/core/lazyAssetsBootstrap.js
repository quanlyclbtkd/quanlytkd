/*
 * Phase 4K-6O — Mobile Startup Performance Gate + Lazy Asset Loading
 * Non-module bootstrap loaded before app.js so legacy code can call
 * window.ensureXlsxReady() / window.ensureChartJsReady() even before main.js.
 */
(function () {
  'use strict';

  var X_URL = 'https://cdn.jsdelivr.net/npm/xlsx-js-style@1.2.0/dist/xlsx.bundle.js';
  var C_URL = 'https://cdn.jsdelivr.net/npm/chart.js';
  var H_URL = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
  var _state = window.__mobileStartupPerf = window.__mobileStartupPerf || {
    phase: '4K-6O-mobile-startup-performance-lazy-assets-20260608',
    startAt: (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now(),
    marks: [],
    assets: {
      xlsx:  { loadedAtStart: !!window.XLSX, requested: 0, loaded: !!window.XLSX, loading: false, failed: false, reason: '', durationMs: 0 },
      chart: { loadedAtStart: !!window.Chart, requested: 0, loaded: !!window.Chart, loading: false, failed: false, reason: '', durationMs: 0 },
      html2canvas: { loadedAtStart: !!window.html2canvas, requested: 0, loaded: !!window.html2canvas, loading: false, failed: false, reason: '', durationMs: 0 }
    },
    errors: []
  };

  _state.assets = _state.assets || {};
  _state.assets.html2canvas = _state.assets.html2canvas || { loadedAtStart: !!window.html2canvas, requested: 0, loaded: !!window.html2canvas, loading: false, failed: false, reason: '', durationMs: 0 };

  function now() {
    return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  }

  function mark(name, data) {
    try {
      var t = now();
      _state.marks.push({ name: String(name || ''), atMs: Math.round(t), deltaMs: Math.round(t - (_state.startAt || t)), data: data || null });
      if (_state.marks.length > 120) _state.marks = _state.marks.slice(-120);
    } catch (_) {}
  }

  function _loadScriptOnce(key, url, globalName, reason) {
    var asset = _state.assets[key];
    if (window[globalName]) {
      asset.loaded = true;
      asset.loading = false;
      asset.failed = false;
      mark('asset:' + key + ':already-ready', { reason: reason || '' });
      return Promise.resolve(window[globalName]);
    }
    if (asset.promise) {
      asset.requested += 1;
      if (reason) asset.reason = reason;
      mark('asset:' + key + ':join-existing-load', { reason: reason || '' });
      return asset.promise;
    }

    asset.requested += 1;
    asset.loading = true;
    asset.failed = false;
    asset.reason = reason || '';
    asset.startedAt = now();
    asset.generation = (Number(asset.generation) || 0) + 1;
    var generation = asset.generation;
    mark('asset:' + key + ':load-start', { url: url, reason: reason || '', generation: generation });

    var flightPromise;
    flightPromise = new Promise(function (resolve, reject) {
      var settled = false;
      var s = document.createElement('script');
      s.src = url;
      s.async = true;
      s.crossOrigin = 'anonymous';
      asset.script = s;

      function isCurrentFlight() {
        return asset.generation === generation && asset.promise === flightPromise;
      }
      function detachFailedScript() {
        try { s.onload = null; s.onerror = null; } catch (_) {}
        try { if (s.parentNode) s.parentNode.removeChild(s); } catch (_) {}
        if (asset.script === s) asset.script = null;
      }
      function terminalFailure(err, markName) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (!isCurrentFlight()) return;
        asset.failed = true;
        asset.loaded = false;
        asset.loading = false;
        asset.durationMs = Math.round(now() - (asset.startedAt || now()));
        asset.promise = null;
        detachFailedScript();
        _state.errors.push({ key: key, message: err.message, code: err.code || '', reason: reason || '', at: new Date().toISOString() });
        mark('asset:' + key + ':' + markName, { reason: reason || '', generation: generation });
        reject(err);
      }

      var timer = setTimeout(function () {
        var err = new Error(key + ' lazy load timeout');
        err.code = 'asset-load-timeout';
        terminalFailure(err, 'load-timeout');
      }, 20000);

      s.onload = function () {
        if (settled || !isCurrentFlight()) return;
        if (!window[globalName]) {
          var err = new Error(globalName + ' not available after script load');
          err.code = 'asset-load-invalid';
          terminalFailure(err, 'load-invalid');
          return;
        }
        settled = true;
        clearTimeout(timer);
        asset.loaded = true;
        asset.loading = false;
        asset.failed = false;
        asset.loadedAt = now();
        asset.durationMs = Math.round((asset.loadedAt || now()) - (asset.startedAt || now()));
        mark('asset:' + key + ':load-done', { ok: true, durationMs: asset.durationMs, reason: reason || '', generation: generation });
        resolve(window[globalName]);
      };
      s.onerror = function () {
        var err = new Error(key + ' lazy load failed');
        err.code = 'asset-load-failed';
        terminalFailure(err, 'load-error');
      };
      document.head.appendChild(s);
    });

    asset.promise = flightPromise;
    return flightPromise;
  }

  window.markMobileStartup = window.markMobileStartup || mark;

  window.ensureXlsxReady = window.ensureXlsxReady || function ensureXlsxReady(reason) {
    return _loadScriptOnce('xlsx', X_URL, 'XLSX', reason || 'xlsx-needed');
  };

  window.ensureChartJsReady = window.ensureChartJsReady || function ensureChartJsReady(reason) {
    return _loadScriptOnce('chart', C_URL, 'Chart', reason || 'chart-needed');
  };

  window.ensureHtml2CanvasReady = window.ensureHtml2CanvasReady || function ensureHtml2CanvasReady(reason) {
    return _loadScriptOnce('html2canvas', H_URL, 'html2canvas', reason || 'receipt-render');
  };

  window.debugMobileStartupPerformance = window.debugMobileStartupPerformance || function debugMobileStartupPerformance() {
    var nav = (typeof performance !== 'undefined' && performance.getEntriesByType) ? performance.getEntriesByType('navigation')[0] : null;
    var result = {
      phase: _state.phase,
      buildVersion: window.APP_BUILD_VERSION || '',
      href: location.href,
      userAgent: navigator.userAgent,
      isMobile: /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent),
      runtimeMode: window.__RUNTIME_MODE || '',
      mainLoaded: !!window.MAIN_JS_LOADED,
      appLoaded: !!window.__appLoaded,
      hasXlsx: !!window.XLSX,
      hasChart: !!window.Chart,
      xlsx: _state.assets.xlsx,
      chart: _state.assets.chart,
      markCount: _state.marks.length,
      lastMarks: _state.marks.slice(-18),
      errors: _state.errors.slice(-10),
      navigation: nav ? {
        domContentLoadedMs: Math.round(nav.domContentLoadedEventEnd || 0),
        loadEventMs: Math.round(nav.loadEventEnd || 0),
        transferSize: nav.transferSize || 0,
        encodedBodySize: nav.encodedBodySize || 0,
        decodedBodySize: nav.decodedBodySize || 0
      } : null
    };
    try { console.table({
      hasXlsx: result.hasXlsx,
      hasChart: result.hasChart,
      xlsxRequested: result.xlsx.requested,
      chartRequested: result.chart.requested,
      markCount: result.markCount,
      domContentLoadedMs: result.navigation && result.navigation.domContentLoadedMs,
      loadEventMs: result.navigation && result.navigation.loadEventMs
    }); } catch (_) {}
    return result;
  };

  window.debugStartupTimeline = window.debugStartupTimeline || function debugStartupTimeline() {
    try { console.table(_state.marks); } catch (_) {}
    return _state.marks.slice();
  };

  window.debugStartupBottlenecks = window.debugStartupBottlenecks || function debugStartupBottlenecks() {
    var marks = _state.marks || [];
    var gaps = [];
    for (var i = 1; i < marks.length; i++) {
      gaps.push({ from: marks[i - 1].name, to: marks[i].name, gapMs: Math.max(0, Math.round((marks[i].deltaMs || 0) - (marks[i - 1].deltaMs || 0))) });
    }
    gaps.sort(function (a, b) { return b.gapMs - a.gapMs; });
    try { console.table(gaps.slice(0, 12)); } catch (_) {}
    return { topGaps: gaps.slice(0, 12), assets: _state.assets, errors: _state.errors.slice(-10) };
  };

  mark('lazy-assets-bootstrap-loaded', { hasXlsxAtStart: !!window.XLSX, hasChartAtStart: !!window.Chart });
})();
