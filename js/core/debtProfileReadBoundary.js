/**
 * Phase 4K-6V3D — Debt Profile Coverage Read Boundary
 *
 * Goal:
 *   - BÁO NỢ reuses the already-mounted active profiles listener.
 *   - Remove repeated full collection scans on every debt-tab open.
 *   - Verify status-query coverage with lightweight count aggregation.
 *   - Run one guarded legacy-status normalization only when coverage has a gap.
 *
 * This file is a classic script (not an ES module) so legacy app.js and main.js
 * can share the same boundary in HTTP and file-compatible runtime modes.
 */
(function initDebtProfileReadBoundary(global) {
    'use strict';

    if (global.DebtProfileReadBoundary) return;

    const SCHEMA_VERSION = 1;
    const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;
    const LOCK_TTL_MS = 5 * 60 * 1000;
    const RETRY_DELAY_MS = 30 * 1000;
    const WAIT_STEP_MS = 120;
    const WAIT_TIMEOUT_MS = 8000;
    const BATCH_SIZE = 400;

    const _state = {
        clubId: '',
        inFlight: false,
        scheduled: false,
        timer: null,
        lastSource: 'unknown',
        lastReason: '',
        lastError: '',
        lastAudit: null,
        sessionVerified: false,
        fullFallbackReady: false,
    };

    const _metrics = {
        ensureCalls: 0,
        scheduledRuns: 0,
        countAuditRuns: 0,
        countAggregationQueries: 0,
        fullScansAvoided: 0,
        fullFallbackRuns: 0,
        normalizationCandidates: 0,
        normalizationWrites: 0,
        lockAcquired: 0,
        lockBusy: 0,
        parityFailures: 0,
        verifiedWithoutFullScan: 0,
        verifiedAfterNormalization: 0,
        lastClubId: '',
        lastSource: 'unknown',
        lastReason: '',
        lastError: '',
        lastRunAt: 0,
    };

    function now() { return Date.now(); }
    function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

    function context() {
        const st = global.__store || {};
        return {
            st,
            db: st.db || global.db || global._db || null,
            clubId: st.clubId || st.currentClubId || global.currentClubId || '',
            user: st.currentUser || global.currentUser || null,
            role: String(global.userRole || st.userRole || '').toLowerCase(),
            config: st.clubConfig || {},
        };
    }

    function isAdminRole(role) {
        return ['admin', 'super_admin', 'superadmin', 'root', 'root_admin'].includes(String(role || '').toLowerCase());
    }

    function statusValues() {
        const cfg = typeof global.getProfileStatusConfig === 'function'
            ? global.getProfileStatusConfig()
            : null;
        return {
            active: Array.isArray(cfg && cfg.activeQueryValues) && cfg.activeQueryValues.length
                ? cfg.activeQueryValues.map(v => String(v).trim())
                : ['active', 'trial'],
            quit: Array.isArray(cfg && cfg.quitQueryValues) && cfg.quitQueryValues.length
                ? cfg.quitQueryValues.map(v => String(v).trim())
                : ['quit', 'inactive', 'retired'],
        };
    }

    function isConfigVerified(config) {
        const version = Number(config && config.debtProfileCoverageVersion || 0);
        const verified = config && config.debtProfileCoverageVerified === true;
        const verifiedAt = Number(config && config.debtProfileCoverageVerifiedAt || 0);
        return version >= SCHEMA_VERSION && verified && verifiedAt > 0 && (now() - verifiedAt) < VERIFY_TTL_MS;
    }

    function activeSourceReady() {
        const st = global.__store || {};
        const listener = typeof global.getProfilesListenerMetrics === 'function'
            ? global.getProfilesListenerMetrics()
            : (global.__profileScaleMetrics || {});
        const activeLoaded = !!(
            (global.studentProfileStore && global.studentProfileStore.activeLoaded) ||
            listener.activeLoaded ||
            listener.activeListenerMounted ||
            Object.keys(st.profiles || {}).length > 0
        );
        const initialSeen = Number(listener.activeSnapshotCount || 0) > 0 || listener.lastProfilesMode === 'full-fallback';
        return {
            ready: activeLoaded && (initialSeen || Object.keys(st.profiles || {}).length > 0),
            listener,
            profilesCount: Object.keys(st.profiles || {}).length,
        };
    }

    async function waitForActiveSource() {
        const started = now();
        while (now() - started < WAIT_TIMEOUT_MS) {
            const source = activeSourceReady();
            if (source.ready) return source;
            await sleep(WAIT_STEP_MS);
        }
        return activeSourceReady();
    }

    function queryForStatuses(ref, values, sdk) {
        if (values.length === 1) return sdk.query(ref, sdk.where('status', '==', values[0]));
        return sdk.query(ref, sdk.where('status', 'in', values.slice(0, 10)));
    }

    async function runCountAudit(reason) {
        const ctx = context();
        const sdk = global._fb_init || {};
        const required = ['collection', 'query', 'where', 'getCountFromServer'];
        if (!ctx.db || !ctx.clubId || required.some(k => typeof sdk[k] !== 'function')) {
            return { ok: false, reason: 'count-sdk-or-context-missing' };
        }

        const vals = statusValues();
        const ref = sdk.collection(ctx.db, 'clubs', ctx.clubId, 'profiles');
        _metrics.countAuditRuns++;
        _metrics.countAggregationQueries += 3;

        try {
            const [totalSnap, activeSnap, quitSnap] = await Promise.all([
                sdk.getCountFromServer(ref),
                sdk.getCountFromServer(queryForStatuses(ref, vals.active, sdk)),
                sdk.getCountFromServer(queryForStatuses(ref, vals.quit, sdk)),
            ]);
            const total = Number(totalSnap.data().count || 0);
            const active = Number(activeSnap.data().count || 0);
            const quit = Number(quitSnap.data().count || 0);
            const gap = Math.max(0, total - active - quit);
            const audit = {
                ok: true,
                reason: reason || 'debt-count-audit',
                clubId: ctx.clubId,
                total,
                active,
                quit,
                gap,
                covered: gap === 0,
                activeValues: vals.active,
                quitValues: vals.quit,
                auditedAt: now(),
            };
            _state.lastAudit = audit;
            return audit;
        } catch (error) {
            _metrics.lastError = String(error && (error.code || error.message) || error);
            return { ok: false, reason: 'count-audit-error', error };
        }
    }

    function canonicalStatus(profile) {
        const kind = typeof global.classifyProfileStatus === 'function'
            ? global.classifyProfileStatus(profile || {})
            : (() => {
                const raw = String(profile && profile.status || '').toLowerCase().trim();
                if (profile && (profile.quit === true || profile.stopped === true || profile.active === false || profile.isActive === false)) return 'quit';
                if (raw.includes('nghỉ') || raw.includes('nghi') || ['quit', 'inactive', 'retired'].includes(raw)) return 'quit';
                return 'active';
            })();
        return kind === 'quit' ? 'quit' : 'active';
    }

    function buildNormalizationPlan(profiles) {
        const vals = statusValues();
        const activeSet = new Set(vals.active);
        const quitSet = new Set(vals.quit);
        const candidates = [];

        Object.entries(profiles || {}).forEach(([id, profile]) => {
            if (!id || !profile || typeof profile !== 'object') return;
            const expected = canonicalStatus(profile);
            const raw = String(profile.status || '').trim();
            // Firestore equality/in queries are case-sensitive. Compare exact stored
            // values so legacy variants such as 'Active' are normalized too.
            const compatible = expected === 'quit' ? quitSet.has(raw) : activeSet.has(raw);
            if (!compatible) candidates.push({ id, status: expected });
        });

        return { candidates, activeValues: vals.active, quitValues: vals.quit };
    }

    async function acquireLock(reason) {
        const ctx = context();
        const sdk = global._fb_init || {};
        if (!ctx.db || !ctx.clubId || typeof sdk.doc !== 'function') return { acquired: false, reason: 'lock-context-missing' };

        const owner = String(ctx.user && (ctx.user.uid || ctx.user.email) || 'anonymous-admin');
        const ref = sdk.doc(ctx.db, 'clubs', ctx.clubId, 'settings', 'debt_profile_coverage_lock');

        if (typeof sdk.runTransaction !== 'function') {
            if (global.__debtProfileCoverageLocalLock) return { acquired: false, reason: 'local-lock-busy' };
            global.__debtProfileCoverageLocalLock = true;
            _metrics.lockAcquired++;
            return { acquired: true, local: true, ref, owner };
        }

        try {
            const result = await sdk.runTransaction(ctx.db, async tx => {
                const snap = await tx.get(ref);
                const data = snap.exists() ? snap.data() : {};
                const expiresAt = Number(data.expiresAt || 0);
                const busy = data.status === 'running' && expiresAt > now() && data.owner !== owner;
                if (busy) return { acquired: false, owner: data.owner || '', expiresAt };
                tx.set(ref, {
                    status: 'running',
                    owner,
                    reason: reason || 'automatic-debt-profile-coverage',
                    startedAt: now(),
                    expiresAt: now() + LOCK_TTL_MS,
                    schemaVersion: SCHEMA_VERSION,
                }, { merge: true });
                return { acquired: true, owner };
            });
            if (result.acquired) _metrics.lockAcquired++;
            else _metrics.lockBusy++;
            return { ...result, ref };
        } catch (error) {
            _metrics.lastError = String(error && (error.code || error.message) || error);
            return { acquired: false, reason: 'lock-error', error, ref };
        }
    }

    async function releaseLock(lock, status, extra) {
        if (!lock) return;
        if (lock.local) {
            global.__debtProfileCoverageLocalLock = false;
            return;
        }
        const ctx = context();
        const sdk = global._fb_init || {};
        if (!ctx.db || !lock.ref || typeof sdk.setDoc !== 'function') return;
        try {
            await sdk.setDoc(lock.ref, {
                status: status || 'released',
                owner: lock.owner || '',
                expiresAt: 0,
                completedAt: now(),
                ...(extra || {}),
            }, { merge: true });
        } catch (_) {}
    }

    async function normalizeLegacyStatuses(reason) {
        const ctx = context();
        const sdk = global._fb_init || {};
        if (!isAdminRole(ctx.role)) return { ok: false, reason: 'role-not-allowed' };
        if (typeof global.loadFullProfilesFallback !== 'function') return { ok: false, reason: 'full-fallback-unavailable' };
        if (!ctx.db || !ctx.clubId || typeof sdk.writeBatch !== 'function' || typeof sdk.doc !== 'function') {
            return { ok: false, reason: 'normalization-sdk-missing' };
        }

        _metrics.fullFallbackRuns++;
        const loaded = await global.loadFullProfilesFallback('debt-profile-coverage:' + (reason || 'normalize'));
        if (!loaded) return { ok: false, reason: 'full-fallback-failed' };

        const profiles = (global.__store && global.__store.profiles) || {};
        const plan = buildNormalizationPlan(profiles);
        _metrics.normalizationCandidates += plan.candidates.length;

        for (let i = 0; i < plan.candidates.length; i += BATCH_SIZE) {
            const chunk = plan.candidates.slice(i, i + BATCH_SIZE);
            const batch = sdk.writeBatch(ctx.db);
            chunk.forEach(item => {
                batch.set(
                    sdk.doc(ctx.db, 'clubs', ctx.clubId, 'profiles', item.id),
                    {
                        status: item.status,
                        profileStatusSchemaVersion: SCHEMA_VERSION,
                        profileStatusCanonicalizedAt: now(),
                    },
                    { merge: true }
                );
            });
            await batch.commit();
            _metrics.normalizationWrites += chunk.length;
        }

        _state.fullFallbackReady = true;
        return { ok: true, normalized: plan.candidates.length, profilesCount: Object.keys(profiles).length };
    }

    async function persistVerified(audit, source) {
        const ctx = context();
        const sdk = global._fb_init || {};
        if (!ctx.db || !ctx.clubId || typeof sdk.doc !== 'function' || typeof sdk.setDoc !== 'function') return false;
        const patch = {
            debtProfileCoverageVersion: SCHEMA_VERSION,
            debtProfileCoverageVerified: true,
            debtProfileCoverageVerifiedAt: now(),
            debtProfileCoverageSource: source || 'count-audit',
            debtProfileCoverageTotal: Number(audit.total || 0),
            debtProfileCoverageActive: Number(audit.active || 0),
            debtProfileCoverageQuit: Number(audit.quit || 0),
        };
        await sdk.setDoc(sdk.doc(ctx.db, 'clubs', ctx.clubId, 'settings', 'main_config'), patch, { merge: true });
        if (ctx.st) ctx.st.clubConfig = { ...(ctx.st.clubConfig || {}), ...patch };
        _state.sessionVerified = true;
        return true;
    }

    async function runAutomaticVerification(reason) {
        const ctx = context();
        if (!ctx.clubId) return { ok: false, deferred: true, reason: 'context-not-ready' };
        if (global.__settingsSnapshotReady === false) {
            scheduleAutomaticVerification('wait-settings-ready', 1000);
            return { ok: false, deferred: true, reason: 'settings-not-ready' };
        }
        if (_state.inFlight) return { ok: false, deferred: true, reason: 'in-flight' };
        if (!isAdminRole(ctx.role)) return { ok: false, deferred: true, reason: 'role-not-allowed' };

        _state.inFlight = true;
        _state.clubId = ctx.clubId;
        _metrics.lastClubId = ctx.clubId;
        _metrics.lastRunAt = now();
        _metrics.lastReason = reason || 'automatic';

        let lock = null;
        try {
            const source = await waitForActiveSource();
            if (!source.ready) return { ok: false, deferred: true, reason: 'active-source-not-ready' };

            if (isConfigVerified(context().config) || _state.sessionVerified) {
                _state.lastSource = 'active-listener-verified';
                _metrics.lastSource = _state.lastSource;
                _metrics.fullScansAvoided++;
                return { ok: true, ready: true, source: _state.lastSource, noRead: true };
            }

            let audit = await runCountAudit(reason || 'automatic');
            if (!audit.ok) return audit;
            if (audit.covered) {
                await persistVerified(audit, 'count-audit');
                _metrics.verifiedWithoutFullScan++;
                _metrics.fullScansAvoided++;
                _state.lastSource = 'active-listener-count-verified';
                _metrics.lastSource = _state.lastSource;
                return { ok: true, ready: true, source: _state.lastSource, audit };
            }

            lock = await acquireLock(reason);
            if (!lock.acquired) {
                scheduleAutomaticVerification('lock-retry', RETRY_DELAY_MS);
                return { ok: false, deferred: true, reason: lock.reason || 'lock-busy', audit };
            }

            // Another device may have completed while this device waited for the lock.
            audit = await runCountAudit('post-lock-recheck');
            if (audit.ok && audit.covered) {
                await persistVerified(audit, 'post-lock-count-audit');
                _metrics.verifiedWithoutFullScan++;
                _metrics.fullScansAvoided++;
                _state.lastSource = 'active-listener-post-lock-verified';
                _metrics.lastSource = _state.lastSource;
                await releaseLock(lock, 'complete', { result: 'already-covered' });
                lock = null;
                return { ok: true, ready: true, source: _state.lastSource, audit };
            }

            const normalized = await normalizeLegacyStatuses(reason);
            if (!normalized.ok) throw new Error('Debt profile normalization failed: ' + normalized.reason);

            const parity = await runCountAudit('post-normalization-parity');
            if (!parity.ok || !parity.covered) {
                _metrics.parityFailures++;
                throw new Error('Debt profile coverage parity failed: gap=' + Number(parity.gap || -1));
            }

            await persistVerified(parity, 'legacy-status-normalization');
            _metrics.verifiedAfterNormalization++;
            _state.lastSource = 'full-fallback-normalized';
            _metrics.lastSource = _state.lastSource;
            await releaseLock(lock, 'complete', { result: 'normalized', normalized: normalized.normalized || 0 });
            lock = null;
            return { ok: true, ready: true, source: _state.lastSource, audit: parity, normalized };
        } catch (error) {
            _state.lastError = String(error && (error.code || error.message) || error);
            _metrics.lastError = _state.lastError;
            if (lock) await releaseLock(lock, 'failed', { error: _state.lastError.slice(0, 180) });
            return { ok: false, ready: _state.fullFallbackReady, source: _state.fullFallbackReady ? 'full-fallback-session' : 'unknown', error };
        } finally {
            _state.inFlight = false;
        }
    }

    async function ensureDebtProfileCoverage(reason) {
        if (global.RoleReadBoundary?.isCoachAttendanceOnly?.() === true) {
            global.RoleReadBoundary?.canMount?.('debt.coverage', { reason: reason || 'ensure-debt' });
            return { ok: false, ready: false, blocked: true, source: 'coach-attendance-only' };
        }
        _metrics.ensureCalls++;
        const ctx = context();
        const source = await waitForActiveSource();

        if (source.ready && (isConfigVerified(ctx.config) || _state.sessionVerified)) {
            _metrics.fullScansAvoided++;
            _state.lastSource = 'active-listener-verified';
            _metrics.lastSource = _state.lastSource;
            return { ok: true, ready: true, source: _state.lastSource, profilesCount: source.profilesCount };
        }

        // Admin performs automatic verification/normalization. Non-admin may only audit;
        // if coverage is incomplete, use the existing guarded full fallback for correctness.
        if (isAdminRole(ctx.role)) {
            const result = await runAutomaticVerification(reason || 'debt-tab-open');
            if (result.ready) return result;
        } else {
            const audit = await runCountAudit(reason || 'debt-tab-non-admin-audit');
            if (audit.ok && audit.covered) {
                _metrics.fullScansAvoided++;
                _state.sessionVerified = true;
                _state.lastSource = 'active-listener-session-verified';
                _metrics.lastSource = _state.lastSource;
                return { ok: true, ready: true, source: _state.lastSource, audit };
            }
        }

        if (typeof global.loadFullProfilesFallback === 'function') {
            _metrics.fullFallbackRuns++;
            const ok = await global.loadFullProfilesFallback('debt-coverage-emergency:' + (reason || 'debt-tab'));
            if (ok) {
                _state.fullFallbackReady = true;
                _state.lastSource = 'full-fallback-emergency';
                _metrics.lastSource = _state.lastSource;
                return { ok: true, ready: true, source: _state.lastSource, fallback: true };
            }
        }

        return { ok: source.ready, ready: source.ready, source: source.ready ? 'active-listener-unverified' : 'not-ready' };
    }

    function scheduleAutomaticVerification(reason, delay) {
        const ctx = context();
        if (!ctx.clubId || !isAdminRole(ctx.role)) return false;
        if (_state.scheduled || _state.inFlight) return false;
        if (isConfigVerified(ctx.config) || _state.sessionVerified) return false;

        _state.scheduled = true;
        _metrics.scheduledRuns++;
        const run = () => {
            _state.scheduled = false;
            _state.timer = null;
            runAutomaticVerification(reason || 'idle-auto').catch(error => {
                _metrics.lastError = String(error && (error.code || error.message) || error);
            });
        };
        const ms = Number.isFinite(Number(delay)) ? Number(delay) : 1500;
        if (typeof global.requestIdleCallback === 'function' && ms <= 1500) {
            _state.timer = global.requestIdleCallback(run, { timeout: 4000 });
        } else {
            _state.timer = setTimeout(run, ms);
        }
        return true;
    }

    function reset(reason) {
        if (_state.timer) {
            try {
                if (typeof global.cancelIdleCallback === 'function') global.cancelIdleCallback(_state.timer);
                else clearTimeout(_state.timer);
            } catch (_) {}
        }
        _state.clubId = '';
        _state.inFlight = false;
        _state.scheduled = false;
        _state.timer = null;
        _state.lastSource = 'unknown';
        _state.lastReason = reason || 'reset';
        _state.lastError = '';
        _state.lastAudit = null;
        _state.sessionVerified = false;
        _state.fullFallbackReady = false;
        global.__debtProfileCoverageLocalLock = false;
    }

    function getStatus() {
        const ctx = context();
        return {
            schemaVersion: SCHEMA_VERSION,
            clubId: ctx.clubId,
            configVerified: isConfigVerified(ctx.config),
            sessionVerified: _state.sessionVerified,
            inFlight: _state.inFlight,
            scheduled: _state.scheduled,
            source: _state.lastSource,
            lastAudit: _state.lastAudit,
            lastError: _state.lastError,
            activeSource: activeSourceReady(),
            metrics: { ..._metrics },
        };
    }

    function printMetrics() {
        const status = getStatus();
        console.group('[Phase 4K-6V3D] Debt Profile Read Boundary');
        console.table({
            clubId: { value: status.clubId },
            configVerified: { value: status.configVerified },
            sessionVerified: { value: status.sessionVerified },
            source: { value: status.source },
            activeProfiles: { value: status.activeSource.profilesCount },
            ensureCalls: { value: _metrics.ensureCalls },
            countAuditRuns: { value: _metrics.countAuditRuns },
            aggregationQueries: { value: _metrics.countAggregationQueries },
            fullScansAvoided: { value: _metrics.fullScansAvoided },
            fullFallbackRuns: { value: _metrics.fullFallbackRuns },
            normalizationWrites: { value: _metrics.normalizationWrites },
            parityFailures: { value: _metrics.parityFailures },
        });
        if (status.lastAudit) console.log('Last audit:', status.lastAudit);
        if (status.lastError) console.warn('Last error:', status.lastError);
        console.groupEnd();
        return status;
    }

    const api = {
        version: SCHEMA_VERSION,
        ensureDebtProfileCoverage,
        scheduleAutomaticVerification,
        runAutomaticVerification,
        runCountAudit,
        buildNormalizationPlan,
        getStatus,
        printMetrics,
        reset,
    };

    global.DebtProfileReadBoundary = api;
    global.ensureDebtProfileCoverage = ensureDebtProfileCoverage;
    global.scheduleAutomaticDebtProfileCoverage = scheduleAutomaticVerification;
    global.runAutomaticDebtProfileCoverage = runAutomaticVerification;
    global.getDebtProfileCoverageStatus = getStatus;
    global.printDebtReadMetrics = printMetrics;
    global.resetDebtProfileReadBoundary = reset;
})(window);
