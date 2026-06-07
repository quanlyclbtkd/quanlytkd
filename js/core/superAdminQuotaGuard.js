// js/core/superAdminQuotaGuard.js
// Phase 4K-6I-C — SuperAdmin Aggregation Hard Stop
// Chống 429/resource-exhausted do getCountFromServer bằng cache-only mặc định,
// hard-stop aggregation khi gặp quota và không xem null/{ok:false} là success.

const CIRCUIT_DURATION_MS = 15 * 60 * 1000;
const MAX_GENERIC_FAILURES_BEFORE_OPEN = 3;
const MAX_QUOTA_FAILURES_BEFORE_OPEN = 1;
const MIN_COUNT_INTERVAL_MS = 500;

let _circuitOpen = false;
let _circuitOpenAt = 0;
let _failureCount = 0;
let _quotaFailureCount = 0;
let _attemptCount = 0;
let _successCount = 0;
let _invalidResultCount = 0;
let _lastAttemptAt = 0;
let _totalThrottleWait = 0;
let _lastFailure = null;

const _singleFlights = {};
const _recent = [];

function _pushRecent(type, meta = {}) {
    _recent.push({ ts: Date.now(), type, ...meta });
    if (_recent.length > 50) _recent.splice(0, _recent.length - 50);
}

function _isQuotaError(error) {
    const msg = String(error?.message || error?.code || error || '').toLowerCase();
    return msg.includes('resource-exhausted') || msg.includes('quota') || msg.includes('429') || msg.includes('too many');
}

function _openCircuit(error, meta = {}, quota = false) {
    if (!_circuitOpen) {
        _circuitOpen = true;
        _circuitOpenAt = Date.now();
        console.warn('[SuperAdminQuotaGuard] Circuit OPENED — aggregation disabled.', {
            quota,
            failures: _failureCount,
            quotaFailures: _quotaFailureCount,
            durationMs: CIRCUIT_DURATION_MS,
            error: error?.message || error,
            meta
        });
        _pushRecent('circuit-open', { quota, error: error?.message || String(error || ''), meta });
    }
}

export const SuperAdminQuotaGuard = {
    isQuotaError: _isQuotaError,

    isCircuitOpen() {
        if (!_circuitOpen) return false;
        if (Date.now() - _circuitOpenAt >= CIRCUIT_DURATION_MS) {
            _circuitOpen = false;
            _circuitOpenAt = 0;
            _failureCount = 0;
            _quotaFailureCount = 0;
            console.info('[SuperAdminQuotaGuard] Circuit auto-reset after cooldown.');
            _pushRecent('circuit-reset');
            return false;
        }
        return true;
    },

    shouldUseCachedCountsOnly(reason = '') {
        const open = this.isCircuitOpen();
        const hardStop = (typeof window !== 'undefined' && window.__saDisableBackgroundCountRefresh === true);
        if (open || hardStop) {
            console.info('[SuperAdminQuotaGuard] cached-counts-only:', { reason, open, hardStop });
        }
        return open || hardStop;
    },

    recordAggregationAttempt(meta = {}) {
        _attemptCount++;
        _lastAttemptAt = Date.now();
        _pushRecent('attempt', { meta });
        console.debug('[SuperAdminQuotaGuard] attempt #' + _attemptCount, meta);
    },

    recordAggregationSuccess(meta = {}) {
        _successCount++;
        _failureCount = Math.max(0, _failureCount - 1);
        _pushRecent('success', { meta });
        console.debug('[SuperAdminQuotaGuard] success #' + _successCount, meta);
    },

    recordAggregationFailure(error, meta = {}) {
        const quota = _isQuotaError(error);
        _failureCount++;
        if (quota) _quotaFailureCount++;
        _lastFailure = {
            ts: Date.now(),
            quota,
            message: error?.message || String(error || ''),
            code: error?.code || '',
            meta
        };
        _pushRecent('failure', _lastFailure);
        console.warn('[SuperAdminQuotaGuard] failure #' + _failureCount, error?.message || error, meta);

        if (quota || _failureCount >= MAX_GENERIC_FAILURES_BEFORE_OPEN || _quotaFailureCount >= MAX_QUOTA_FAILURES_BEFORE_OPEN) {
            _openCircuit(error, meta, quota);
        }
    },

    getCircuitState() {
        const open = this.isCircuitOpen();
        return {
            open,
            openAt: _circuitOpen ? _circuitOpenAt : null,
            remainingMs: open ? Math.max(0, CIRCUIT_DURATION_MS - (Date.now() - _circuitOpenAt)) : 0,
            failureCount: _failureCount,
            quotaFailureCount: _quotaFailureCount,
            maxGenericFailures: MAX_GENERIC_FAILURES_BEFORE_OPEN,
            maxQuotaFailures: MAX_QUOTA_FAILURES_BEFORE_OPEN,
            lastFailure: _lastFailure,
        };
    },

    async runThrottledCount(task, meta = {}) {
        if (this.isCircuitOpen()) {
            console.info('[SuperAdminQuotaGuard] runThrottledCount skipped — circuit open', meta);
            return { ok: false, count: null, reason: 'circuit-open', meta };
        }

        const now = Date.now();
        const wait = Math.max(0, MIN_COUNT_INTERVAL_MS - (now - _lastAttemptAt));
        if (wait > 0) {
            _totalThrottleWait += wait;
            await new Promise(r => setTimeout(r, wait));
        }

        this.recordAggregationAttempt(meta);
        try {
            const result = await task();
            const valid = (
                typeof result === 'number' ||
                (result && result.ok === true && Number.isFinite(Number(result.count)))
            );

            if (!valid) {
                _invalidResultCount++;
                const err = new Error(result?.reason || 'invalid-count-result');
                err.__invalidCountResult = true;
                this.recordAggregationFailure(err, meta);
                return result || { ok: false, count: null, reason: 'invalid-count-result', meta };
            }

            this.recordAggregationSuccess(meta);
            return (typeof result === 'number') ? { ok: true, count: result, meta } : result;
        } catch (err) {
            this.recordAggregationFailure(err, meta);
            return { ok: false, count: null, reason: err?.message || 'count-error', error: err, meta };
        }
    },

    createSingleFlight(key, fn) {
        if (_singleFlights[key]) {
            console.debug('[SuperAdminQuotaGuard] singleFlight reuse:', key);
            return _singleFlights[key];
        }
        _singleFlights[key] = Promise.resolve().then(fn).finally(() => {
            delete _singleFlights[key];
        });
        return _singleFlights[key];
    },

    getMetrics() {
        return {
            summary: {
                circuitOpen: this.isCircuitOpen(),
                failureCount: _failureCount,
                quotaFailureCount: _quotaFailureCount,
                attemptCount: _attemptCount,
                successCount: _successCount,
                invalidResultCount: _invalidResultCount,
                totalThrottleWait: _totalThrottleWait,
                lastAttemptAt: _lastAttemptAt,
                autoBackgroundRefreshDisabled: typeof window !== 'undefined' ? window.__saDisableBackgroundCountRefresh === true : true,
            },
            circuit: this.getCircuitState(),
            recent: _recent.slice(-20),
            constants: {
                CIRCUIT_DURATION_MS,
                MAX_GENERIC_FAILURES_BEFORE_OPEN,
                MAX_QUOTA_FAILURES_BEFORE_OPEN,
                MIN_COUNT_INTERVAL_MS,
            },
        };
    },
};
