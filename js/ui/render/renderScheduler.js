/**
 * renderScheduler.js — Phase 3.4 Render Isolation Architecture
 *
 * RAF-based scheduler. Queues render functions by key.
 * Each key fires AT MOST once per animation frame (deduplication).
 * Prevents duplicate renders, render storms, and off-frame DOM mutations.
 *
 * API (named exports):
 *   requestRender(key, fn)           → queue a render fn, deduplicate by key
 *   cancelRender(key)                → remove from queue
 *   cancelRendersByPrefix(prefix)    → cancel all keys starting with prefix
 *   hasPendingRender(key)            → boolean
 *   getRenderStats()                 → debug diagnostics object
 */

const _queue = new Map();   // key → { fn, queuedAt }
let   _rafId        = null; // current requestAnimationFrame handle
let   _totalFrames  = 0;
let   _totalCalls   = 0;
let   _stormWarns   = 0;
let   _slowWarns    = 0;
const _slowRenderLastWarnAt = Object.create(null);
const _slowRenderSuppressed = Object.create(null);

const STORM_THRESHOLD = 12;  // warn if > N unique renders queued in one frame
const SLOW_MS         = 16;  // warn if a single render fn exceeds one frame budget (60fps)

function _isDev() {
    const h = window.location.hostname;
    return h === 'localhost' || h === '127.0.0.1' || h.endsWith('.replit.dev');
}

function _shouldLogPerfWarning() {
    try {
        return _isDev() || window.__RENDER_DEBUG === true || localStorage.getItem('renderDebug') === '1';
    } catch (_) {
        return _isDev() || window.__RENDER_DEBUG === true;
    }
}

function _processFrame() {
    _rafId = null;
    _totalFrames++;

    // Snapshot and clear queue BEFORE executing.
    // Any requestRender() calls made during execution get scheduled for the NEXT frame.
    const entries = Array.from(_queue.entries());
    _queue.clear();

    if (entries.length > STORM_THRESHOLD) {
        _stormWarns++;
        console.warn(
            `[renderScheduler] ⚡ Storm frame #${_totalFrames}: ` +
            `${entries.length} renders — [${entries.map(e => e[0]).join(', ')}]`
        );
    }

    for (const [key, { fn }] of entries) {
        const t0 = performance.now();
        try {
            fn();
        } catch (err) {
            console.error(`[renderScheduler] ❌ Error in render "${key}":`, err);
        }
        const ms = performance.now() - t0;
        _totalCalls++;

        if (ms > SLOW_MS) {
            _slowWarns++;
            if (!window.__renderSchedulerMetrics) window.__renderSchedulerMetrics = {};
            window.__renderSchedulerMetrics.lastSlowRender = { key, ms, budget: SLOW_MS, at: Date.now() };
            window.__renderSchedulerMetrics.slowWarnings = _slowWarns;
            const now = Date.now();
            const lastAt = _slowRenderLastWarnAt[key] || 0;
            const shouldWarn = _shouldLogPerfWarning() && (now - lastAt > 120000);
            if (shouldWarn) {
                _slowRenderLastWarnAt[key] = now;
                console.warn(
                    `[renderScheduler] 🐢 Slow render "${key}": ${ms.toFixed(1)}ms ` +
                    `(budget ${SLOW_MS}ms @ 60fps)`
                );
            } else {
                _slowRenderSuppressed[key] = (_slowRenderSuppressed[key] || 0) + 1;
                window.__renderSchedulerMetrics.slowWarningsSuppressed = _slowRenderSuppressed;
            }
        }
    }
}

/**
 * Queue a render function by key.
 * Duplicate keys within the same frame are silently deduplicated — the LAST fn wins.
 * @param {string}   key  — unique render identifier (e.g. "tx.txList")
 * @param {Function} fn   — the render function to execute
 */
export function requestRender(key, fn) {
    if (typeof fn !== 'function') {
        console.warn('[renderScheduler] requestRender: fn must be a function, got', typeof fn, 'for key:', key);
        return;
    }
    const wasDuplicate = _queue.has(key);
    _queue.set(key, { fn, queuedAt: performance.now() });
    if (_isDev() && wasDuplicate) {
        console.info(`[renderScheduler] ♻️ Deduplicated render key: "${key}"`);
    }
    if (!_rafId) {
        _rafId = requestAnimationFrame(_processFrame);
    }
}

/**
 * Remove a pending render by key. No-op if not queued.
 * @param {string} key
 */
export function cancelRender(key) {
    _queue.delete(key);
}

/**
 * Cancel all pending renders whose key starts with prefix.
 * Used by tabs to cancel all island renders for a departing tab.
 * @param {string} prefix  — e.g. "students." cancels "students.activeList" etc.
 */
export function cancelRendersByPrefix(prefix) {
    for (const k of _queue.keys()) {
        if (k.startsWith(prefix)) _queue.delete(k);
    }
}

/**
 * @param {string} key
 * @returns {boolean}
 */
export function hasPendingRender(key) {
    return _queue.has(key);
}

/**
 * Dev diagnostics snapshot.
 * @returns {{ pendingCount, pendingKeys, totalFrames, totalCalls, stormWarnings }}
 */
export function getRenderStats() {
    return {
        pendingCount:  _queue.size,
        pendingKeys:   Array.from(_queue.keys()),
        totalFrames:   _totalFrames,
        totalCalls:    _totalCalls,
        stormWarnings: _stormWarns,
    };
}
