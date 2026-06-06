// Phase 4K-6A — PerformanceMonitor Core
// Đo hiệu năng render / search / action / firestore / dashboard
// Không throw lỗi. Nếu lỗi nội bộ, return null.

window.__perfStats = window.__perfStats || {
    renders:   {},
    actions:   {},
    searches:  {},
    firestore: {},
    dashboard: {},
    warnings:  []
};

export const PerformanceMonitor = {
    markStart(name, meta) {
        try {
            return {
                name:      String(name || ''),
                startedAt: new Date().toISOString(),
                t0:        performance.now(),
                meta:      meta || {}
            };
        } catch (e) {
            return null;
        }
    },

    markEnd(name, token, meta) {
        try {
            if (!token || typeof token.t0 !== 'number') return null;
            const durationMs   = performance.now() - token.t0;
            const combinedMeta = Object.assign({}, token.meta || {}, meta || {});
            return this.record(String(name || token.name || ''), durationMs, combinedMeta);
        } catch (e) {
            return null;
        }
    },

    record(name, durationMs, meta) {
        try {
            const stats = window.__perfStats = window.__perfStats || {
                renders: {}, actions: {}, searches: {}, firestore: {}, dashboard: {}, warnings: []
            };

            let bucket;
            const n = String(name || '');
            if      (n.startsWith('render:'))    bucket = stats.renders;
            else if (n.startsWith('action:'))    bucket = stats.actions;
            else if (n.startsWith('search:'))    bucket = stats.searches;
            else if (n.startsWith('firestore:')) bucket = stats.firestore;
            else if (n.startsWith('dashboard:')) bucket = stats.dashboard;
            else                                 bucket = stats.renders;

            if (!bucket[n]) {
                bucket[n] = {
                    count: 0, lastMs: 0, maxMs: 0,
                    totalMs: 0, avgMs: 0, lastAt: '', lastMeta: null
                };
            }
            const e = bucket[n];
            e.count++;
            e.lastMs  = durationMs;
            e.maxMs   = Math.max(e.maxMs, durationMs);
            e.totalMs = e.totalMs + durationMs;
            e.avgMs   = e.totalMs / e.count;
            e.lastAt  = new Date().toISOString();
            e.lastMeta = meta || null;

            if (durationMs > 300) {
                stats.warnings = stats.warnings || [];
                if (stats.warnings.length >= 100) stats.warnings.shift();
                stats.warnings.push({
                    type: 'very-slow-operation', name: n,
                    durationMs, at: e.lastAt, meta: meta || null
                });
            } else if (durationMs > 100) {
                stats.warnings = stats.warnings || [];
                if (stats.warnings.length >= 100) stats.warnings.shift();
                stats.warnings.push({
                    type: 'slow-operation', name: n,
                    durationMs, at: e.lastAt, meta: meta || null
                });
            }

            return e;
        } catch (e) {
            return null;
        }
    },

    getSummary() {
        try {
            return JSON.parse(JSON.stringify(window.__perfStats || {}));
        } catch (e) {
            return null;
        }
    },

    reset() {
        try {
            window.__perfStats = {
                renders: {}, actions: {}, searches: {}, firestore: {}, dashboard: {}, warnings: []
            };
        } catch (e) {}
    }
};
