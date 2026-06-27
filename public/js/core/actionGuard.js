// Phase 4K-6A — ActionGuard
// Chống double click, ghi action history, đo performance
// Tương thích ngược với window.runGuardedAction cũ

import { PerformanceMonitor } from './performanceMonitor.js';

window.__actionLocks   = window.__actionLocks   || {};
window.__actionHistory = window.__actionHistory || [];

function _pushHistory(item) {
    try {
        window.__actionHistory = window.__actionHistory || [];
        if (window.__actionHistory.length >= 50) window.__actionHistory.shift();
        window.__actionHistory.push(item);
    } catch (e) {}
}

export const ActionGuard = {
    async run(actionName, fn, options) {
        options = options || {};
        const name      = String(actionName || 'unknown-action');
        const startedAt = new Date().toISOString();

        // Kiểm tra lock
        if (window.__actionLocks[name]) {
            const lockedItem = {
                actionName: name, ok: false, locked: true,
                durationMs: 0, startedAt, endedAt: startedAt, message: 'locked'
            };
            _pushHistory(lockedItem);
            return { ok: false, locked: true, actionName: name };
        }

        window.__actionLocks[name] = true;
        const perfToken = PerformanceMonitor.markStart('action:' + name);

        // Timeout warning nếu action > 5000ms
        const timeoutWarn = setTimeout(function() {
            try {
                const stats = window.__perfStats = window.__perfStats || {};
                stats.warnings = stats.warnings || [];
                if (stats.warnings.length >= 100) stats.warnings.shift();
                stats.warnings.push({ type: 'slow-action', name, at: new Date().toISOString() });
                if (typeof window.recordRuntimeError === 'function') {
                    window.recordRuntimeError('slow-action:' + name,
                        new Error('Action exceeded 5000ms'), options);
                }
            } catch (e) {}
        }, 5000);

        try {
            if (options.startToast && window.showToast) window.showToast(options.startToast);
            const value   = await Promise.resolve(fn());
            const endedAt = new Date().toISOString();
            PerformanceMonitor.markEnd('action:' + name, perfToken);
            if (options.successToast && window.showToast) window.showToast(options.successToast);

            const durationMs = perfToken ? performance.now() - perfToken.t0 : 0;
            _pushHistory({
                actionName: name, ok: true, locked: false,
                durationMs, startedAt, endedAt, message: null
            });
            return { ok: true, actionName: name, value };

        } catch (err) {
            const endedAt = new Date().toISOString();
            PerformanceMonitor.markEnd('action:' + name, perfToken, { error: true });
            if (typeof window.recordRuntimeError === 'function') {
                window.recordRuntimeError('action:' + name, err, options);
            }
            if (options.errorAlert !== false) {
                alert(options.errorMessage ||
                    'Thao tác không thành công. Vui lòng kiểm tra mạng/quyền hoặc Console.');
            }
            const durationMs = perfToken ? performance.now() - perfToken.t0 : 0;
            _pushHistory({
                actionName: name, ok: false, locked: false,
                durationMs, startedAt, endedAt,
                message: err && err.message || String(err)
            });
            return {
                ok: false, actionName: name,
                message: err && err.message || String(err),
                stack:   err && err.stack   || ''
            };

        } finally {
            clearTimeout(timeoutWarn);
            window.__actionLocks[name] = false;
        }
    },

    isLocked(actionName) {
        try {
            return !!window.__actionLocks[String(actionName || '')];
        } catch (e) {
            return false;
        }
    },

    clear(actionName) {
        try {
            if (actionName) {
                window.__actionLocks[String(actionName)] = false;
            } else {
                window.__actionLocks = {};
            }
        } catch (e) {}
    },

    getState() {
        try {
            const history  = window.__actionHistory || [];
            const locks    = Object.assign({}, window.__actionLocks || {});
            const failed   = history.filter(function(h) { return !h.ok && !h.locked; });
            const slow     = history.filter(function(h) { return h.ok && h.durationMs > 1000; });
            const recent   = history.slice(-10);
            return { locks, historyCount: history.length, failedActions: failed, slowActions: slow, recentActions: recent };
        } catch (e) {
            return null;
        }
    }
};
