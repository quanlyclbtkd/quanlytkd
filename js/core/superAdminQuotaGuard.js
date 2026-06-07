// js/core/superAdminQuotaGuard.js
// Phase 4K-6I-B — SuperAdmin Aggregation Throttle / Circuit Breaker
// Mục đích: Chống 429 resource-exhausted do gọi hàng loạt getCountFromServer.

const CIRCUIT_DURATION_MS       = 5 * 60 * 1000;
const MAX_FAILURES_BEFORE_OPEN  = 3;
const MIN_COUNT_INTERVAL_MS     = 250;

let _circuitOpen       = false;
let _circuitOpenAt     = 0;
let _failureCount      = 0;
let _attemptCount      = 0;
let _successCount      = 0;
let _lastAttemptAt     = 0;
let _totalThrottleWait = 0;

const _singleFlights = {};

function _isQuotaError(error) {
    const msg = String(error?.message || error?.code || error || '').toLowerCase();
    return (
        msg.includes('resource-exhausted') ||
        msg.includes('quota') ||
        msg.includes('429') ||
        msg.includes('too many')
    );
}

export const SuperAdminQuotaGuard = {

    isCircuitOpen() {
        if (!_circuitOpen) return false;
        if (Date.now() - _circuitOpenAt >= CIRCUIT_DURATION_MS) {
            _circuitOpen    = false;
            _failureCount   = 0;
            console.info('[SuperAdminQuotaGuard] Circuit auto-reset after cooldown.');
            return false;
        }
        return true;
    },

    shouldUseCachedCountsOnly(reason = '') {
        const open = this.isCircuitOpen();
        if (open) {
            console.info('[SuperAdminQuotaGuard] shouldUseCachedCountsOnly=true (circuit open):', reason);
        }
        return open;
    },

    recordAggregationAttempt(meta = {}) {
        _attemptCount++;
        _lastAttemptAt = Date.now();
        console.debug('[SuperAdminQuotaGuard] attempt #' + _attemptCount, meta);
    },

    recordAggregationSuccess(meta = {}) {
        _successCount++;
        _failureCount = Math.max(0, _failureCount - 1);
        console.debug('[SuperAdminQuotaGuard] success #' + _successCount, meta);
    },

    recordAggregationFailure(error, meta = {}) {
        _failureCount++;
        console.warn('[SuperAdminQuotaGuard] failure #' + _failureCount, error?.message || error, meta);
        if (_isQuotaError(error) || _failureCount >= MAX_FAILURES_BEFORE_OPEN) {
            if (!_circuitOpen) {
                _circuitOpen  = true;
                _circuitOpenAt = Date.now();
                console.warn('[SuperAdminQuotaGuard] Circuit OPENED — pausing aggregation for 5 min.', {
                    failures: _failureCount,
                    error: error?.message || error,
                });
            }
        }
    },

    getCircuitState() {
        const open = this.isCircuitOpen();
        return {
            open,
            openAt:        _circuitOpen ? _circuitOpenAt : null,
            remainingMs:   open ? Math.max(0, CIRCUIT_DURATION_MS - (Date.now() - _circuitOpenAt)) : 0,
            failureCount:  _failureCount,
            maxFailures:   MAX_FAILURES_BEFORE_OPEN,
        };
    },

    async runThrottledCount(task, meta = {}) {
        if (this.isCircuitOpen()) {
            console.info('[SuperAdminQuotaGuard] runThrottledCount skipped — circuit open', meta);
            return null;
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
            this.recordAggregationSuccess(meta);
            return result;
        } catch (err) {
            this.recordAggregationFailure(err, meta);
            return null;
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
                circuitOpen:       this.isCircuitOpen(),
                failureCount:      _failureCount,
                attemptCount:      _attemptCount,
                successCount:      _successCount,
                totalThrottleWait: _totalThrottleWait,
                lastAttemptAt:     _lastAttemptAt,
            },
            circuit:   this.getCircuitState(),
            constants: {
                CIRCUIT_DURATION_MS,
                MAX_FAILURES_BEFORE_OPEN,
                MIN_COUNT_INTERVAL_MS,
            },
        };
    },
};
