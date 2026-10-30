/**
 * Phase 4K-6V4C1 — Debt Profile Coverage Spark Aggregation Guard
 *
 * Goal:
 *   - BÁO NỢ reuses the already-mounted active profiles listener.
 *   - Remove repeated full collection scans on every debt-tab open.
 *   - Use already-loaded profile cache for debt readiness.
 *   - Do NOT auto-run client getCountFromServer/runAggregationQuery on login/tab-open.
 *   - Manual count audit remains available behind an explicit debug flag/cooldown.
 *
 * This file is a classic script (not an ES module) so legacy app.js and main.js
 * can share the same boundary in HTTP and file-compatible runtime modes.
 */
(function initDebtProfileReadBoundary(global) {
    'use strict';

    if (global.DebtProfileReadBoundary) return;

    const SCHEMA_VERSION = 2;
    const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;
    const LOCK_TTL_MS = 5 * 60 * 1000;
    const RETRY_DELAY_MS = 30 * 1000;
    const COUNT_AUDIT_COOLDOWN_MS = 60 * 60 * 1000;
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
        countAuditDisabledUntil: 0,
    };

    const _metrics = {
        ensureCalls: 0,
        scheduledRuns: 0,
        countAuditRuns: 0,
        countAggregationQueries: 0,
        countAggregationSuppressed: 0,
        countAuditQuotaErrors: 0,
        localCoverageRuns: 0,
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
        const ctx = context();
        const listener = typeof global.getProfilesListenerMetrics === 'function'
            ? global.getProfilesListenerMetrics()
            : (global.__profileScaleMetrics || {});
        const authorityClubId = String(listener.authorityClubId || '').trim();
        const currentClubId = String(ctx.clubId || '').trim();
        const fullAuthoritySnapshotSeen = listener.fullAuthoritySnapshotSeen === true;
        const authorityComplete = listener.fullAuthorityComplete === true;
        const completeStore = !!(
            (global.studentProfileStore && global.studentProfileStore.quitComplete === true) ||
            listener.quitComplete === true
        );
        const sameClub = !!currentClubId && authorityClubId === currentClubId;
        const authorityMode = String(listener.lastProfilesMode || '');
        const allowedMode = authorityMode === 'full-profiles-authoritative' || authorityMode === 'full-fallback';
        const auth = global.__verifiedAuthContextState;
        const sameSession = !auth || (auth.ready === true
            && Number(auth.generation) === Number(listener.authoritySessionEpoch)
            && (String(auth.role || '').toLowerCase().replace(/-/g, '_') === 'super_admin'
                || String(auth.clubId || '') === currentClubId)
            && String(auth.role || '').toLowerCase().replace(/-/g, '_') === String(listener.role || '').toLowerCase().replace(/-/g, '_'));
        const serverVerified = listener.authorityServerConfirmed === true
            && listener.authorityFreshness === 'fresh'
            && listener.authorityHasPendingWrites === false;
        const ready = isAdminRole(ctx.role) && sameClub && sameSession && serverVerified
            && fullAuthoritySnapshotSeen && authorityComplete && completeStore && allowedMode;
        return {
            ready,
            listener,
            authorityClubId,
            currentClubId,
            sameClub,
            sameSession,
            serverVerified,
            authorityFreshness: listener.authorityFreshness || 'pending',
            authorityServerConfirmed: listener.authorityServerConfirmed === true,
            authorityHasPendingWrites: listener.authorityHasPendingWrites === true,
            authoritySessionEpoch: listener.authoritySessionEpoch,
            activeOwnerUid: String(listener.activeOwnerUid || ''),
            activeListenerMounted: listener.activeListenerMounted === true,
            activeListenerFailed: listener.activeListenerFailed === true,
            fullAuthoritySnapshotSeen,
            fullAuthorityComplete: authorityComplete,
            storeComplete: completeStore,
            completeStore,
            authorityMode,
            profilesCount: Number(listener.fullAuthoritySnapshotCount || Object.keys(st.profiles || {}).length || 0),
        };
    }

    const COVERAGE_STATE = Object.freeze({
        FRESH: 'FRESH',
        TRANSIENT_LOCAL_WRITE: 'TRANSIENT_LOCAL_WRITE',
        NOT_READY: 'NOT_READY',
    });

    function classifyCoverageState(source) {
        const ctx = context();
        if (source && source.ready === true) return COVERAGE_STATE.FRESH;
        const listener = source?.listener || {};
        const auth = global.__verifiedAuthContextState;
        const sameOwner = !!auth && auth.ready === true
            && !!String(auth.uid || '')
            && String(listener.activeOwnerUid || '') === String(auth.uid || '')
            && Number(listener.authoritySessionEpoch) === Number(auth.generation);
        const transient = isAdminRole(ctx.role)
            && source?.sameClub === true
            && source?.sameSession === true
            && sameOwner
            && source?.activeListenerMounted === true
            && source?.activeListenerFailed !== true
            && source?.fullAuthoritySnapshotSeen === true
            && source?.fullAuthorityComplete === true
            && source?.completeStore === true
            && source?.authorityServerConfirmed === true
            && source?.authorityHasPendingWrites === true
            && source?.authorityFreshness === 'stale'
            && source?.authorityMode === 'full-profiles-authoritative';
        return transient ? COVERAGE_STATE.TRANSIENT_LOCAL_WRITE : COVERAGE_STATE.NOT_READY;
    }

    // R2R5.1-SYNC diagnostics live inside the existing Debt coverage owner.
    // They are RAM-only and deliberately store an anonymized profile token.
    const _syncDiag = { seq: 0, active: new Map(), refreshPlanning: new Set(), history: [] };
    function _anonProfileId(value) {
        const text = String(value || '');
        let h = 2166136261;
        for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
        return 'p#' + (h >>> 0).toString(16).padStart(8, '0');
    }
    function _selectedMonth() {
        try { return String(global.document?.getElementById?.('filterMonth')?.value || global.__store?.selectedMonth || ''); }
        catch (_) { return String(global.__store?.selectedMonth || ''); }
    }
    function _debtContextKey() {
        const st = global.__store || {};
        const read = id => { try { return String(global.document?.getElementById?.(id)?.value || ''); } catch (_) { return ''; } };
        let overdue = '';
        try { overdue = String(global.getDebtOverdueFilterValue?.() ?? st._debtOverdueFilter ?? ''); } catch (_) { overdue = String(st._debtOverdueFilter || ''); }
        return JSON.stringify([
            String(context().clubId || ''),
            _selectedMonth(),
            read('filterBranch') || String(st.selectedBranch || 'all'),
            read('searchInput') || String(st.search || ''),
            overdue,
        ]);
    }
    function _sameOperationAuthorityAndContext(row) {
        const auth = global.__verifiedAuthContextState || {};
        const ctx = context();
        return !!row
            && String(row.club || '') === String(ctx.clubId || '')
            && Number(row.authGeneration || 0) === Number(auth.generation || 0)
            && String(row.ownerUidToken || '') === _anonProfileId(auth.uid || '')
            && String(row.debtContextKey || '') === _debtContextKey();
    }
    function beginSyncOperation(meta) {
        const ctx = context();
        const id = `sync-${now().toString(36)}-${++_syncDiag.seq}`;
        const row = {
            operationId: id,
            action: String(meta?.action || 'profile-mutation'),
            profileId: _anonProfileId(meta?.profileId),
            club: String(ctx.clubId || ''),
            month: String(meta?.month || _selectedMonth()),
            affectsDebt: meta?.affectsDebt !== false,
            requiresPrimaryCompletionForDebtRefresh: meta?.requiresPrimaryCompletionForDebtRefresh === true,
            planningState: 'WAITING_FOR_REQUIRED_EVIDENCE',
            canonicalRefreshAcceptedAt: null,
            retiredFromPlanningAt: null,
            planningRetireReason: '',
            authGeneration: Number(global.__verifiedAuthContextState?.generation || 0),
            ownerUidToken: _anonProfileId(global.__verifiedAuthContextState?.uid || ''),
            debtContextKey: _debtContextKey(),
            actionStart: now(),
            primaryWriteStart: null,
            profilePendingSnapshotAt: null,
            primaryWriteAckAt: null,
            profileServerFreshAt: null,
            debtRefreshRequestedAt: null,
            debtComputeStartAt: null,
            debtComputeEndAt: null,
            debtRenderAt: null,
            syncClearedAt: null,
        };
        _syncDiag.active.set(id, row);
        if (row.affectsDebt === true) _syncDiag.refreshPlanning.add(id);
        return id;
    }
    function markSyncStage(operationId, stage) {
        const id = String(operationId || '');
        let row = _syncDiag.active.get(id);
        if (!row) row = _syncDiag.history.find(item => item.operationId === id) || null;
        if (!row || !Object.prototype.hasOwnProperty.call(row, stage)) return false;
        if (row[stage] == null) row[stage] = now();
        return true;
    }
    function markActiveSyncStage(stage, options) {
        const clubId = String(options?.clubId || context().clubId || '');
        const onlyDebt = options?.onlyDebt === true;
        const diagnosticStage = stage === 'debtComputeStartAt' || stage === 'debtComputeEndAt' || stage === 'debtRenderAt';
        const rows = [];
        const eligible = [];
        const ts = now();

        if (diagnosticStage) {
            const candidates = [
                ..._syncDiag.active.values(),
                ..._syncDiag.history.filter(row => row.canonicalRefreshAcceptedAt != null && row.syncClearedAt == null),
            ];
            for (const row of candidates) {
                if ((clubId && row.club !== clubId) || (onlyDebt && row.affectsDebt !== true)) continue;
                if (Object.prototype.hasOwnProperty.call(row, stage) && row[stage] == null) row[stage] = ts;
                rows.push(row);
            }
            return { tracked: rows.length > 0, affectsDebt: rows.some(row => row.affectsDebt === true), operationIds: rows.map(row => row.operationId), waitingOperationIds: [] };
        }

        for (const [id, row] of Array.from(_syncDiag.active.entries())) {
            if (row.syncClearedAt != null || (clubId && row.club !== clubId) || (onlyDebt && row.affectsDebt !== true)) continue;
            const planningAuthoritative = row.affectsDebt !== true || _syncDiag.refreshPlanning.has(id);
            if (!planningAuthoritative) continue;
            if (row.affectsDebt === true && !_sameOperationAuthorityAndContext(row)) {
                row.planningState = 'RETIRED_FROM_PLANNING';
                row.retiredFromPlanningAt = ts;
                row.planningRetireReason = 'authority-or-context-changed';
                row.syncClearedAt = row.syncClearedAt || ts;
                _syncDiag.refreshPlanning.delete(id);
                _syncDiag.history.push({ ...row });
                _syncDiag.active.delete(id);
                continue;
            }
            if (Object.prototype.hasOwnProperty.call(row, stage) && row[stage] == null) row[stage] = ts;
            if (row.affectsDebt === true && row.profileServerFreshAt != null &&
                (!row.requiresPrimaryCompletionForDebtRefresh || row.primaryWriteAckAt != null)) {
                row.planningState = 'READY_TO_REFRESH';
                eligible.push(row);
            }
            rows.push(row);
        }
        if (_syncDiag.history.length > 80) _syncDiag.history.splice(0, _syncDiag.history.length - 80);
        return {
            tracked: rows.length > 0,
            affectsDebt: eligible.some(row => row.affectsDebt === true),
            operationIds: eligible.map(row => row.operationId),
            waitingOperationIds: rows.filter(row => row.affectsDebt === true && !eligible.includes(row)).map(row => row.operationId),
        };
    }
    function getOperationRefreshPlan(operationId) {
        const id = String(operationId || '');
        const row = _syncDiag.active.get(id);
        if (!row || row.affectsDebt !== true || !_syncDiag.refreshPlanning.has(id) || !_sameOperationAuthorityAndContext(row)) return { ready: false, operationIds: [] };
        const ready = row.profileServerFreshAt != null && (!row.requiresPrimaryCompletionForDebtRefresh || row.primaryWriteAckAt != null);
        if (ready) row.planningState = 'READY_TO_REFRESH';
        return { ready, clubId: row.club, operationIds: ready ? [id] : [], contextKey: row.debtContextKey };
    }
    function acceptDebtRefreshOperations(operationIds, options) {
        const clubId = String(options?.clubId || context().clubId || '');
        const ids = new Set(Array.isArray(operationIds) ? operationIds.map(String) : []);
        const accepted = [];
        const ts = now();
        for (const id of ids) {
            const row = _syncDiag.active.get(id);
            if (!row || row.affectsDebt !== true || !_syncDiag.refreshPlanning.has(id) || (clubId && row.club !== clubId)) continue;
            if (!_sameOperationAuthorityAndContext(row)) continue;
            if (row.profileServerFreshAt == null || (row.requiresPrimaryCompletionForDebtRefresh && row.primaryWriteAckAt == null)) continue;
            row.canonicalRefreshAcceptedAt = row.canonicalRefreshAcceptedAt || ts;
            row.retiredFromPlanningAt = row.retiredFromPlanningAt || ts;
            row.planningRetireReason = 'canonical-refresh-accepted';
            row.planningState = 'RETIRED_FROM_PLANNING';
            _syncDiag.refreshPlanning.delete(id);
            _syncDiag.history.push({ ...row });
            _syncDiag.active.delete(id);
            accepted.push(id);
        }
        if (_syncDiag.history.length > 80) _syncDiag.history.splice(0, _syncDiag.history.length - 80);
        return accepted;
    }
    function clearFreshSyncOperations(options) {
        const clubId = String(options?.clubId || context().clubId || '');
        const ts = now();
        for (const [id, row] of _syncDiag.active.entries()) {
            if (row.syncClearedAt != null || (clubId && row.club !== clubId)) continue;
            if (row.affectsDebt === true && row.debtRenderAt == null) continue;
            row.syncClearedAt = ts;
            _syncDiag.refreshPlanning.delete(id);
            _syncDiag.history.push({ ...row });
            _syncDiag.active.delete(id);
        }
        for (const row of _syncDiag.history) {
            if (row.syncClearedAt != null || (clubId && row.club !== clubId)) continue;
            if (row.canonicalRefreshAcceptedAt != null && row.debtRenderAt != null) row.syncClearedAt = ts;
        }
        if (_syncDiag.history.length > 80) _syncDiag.history.splice(0, _syncDiag.history.length - 80);
    }
    function isProfileAckOwnedOperation(operationId) {
        const id = String(operationId || '');
        const row = _syncDiag.active.get(id);
        if (!row) {
            const completed = _syncDiag.history.find(item => item.operationId === id && item.cancelled !== true);
            return !!completed && completed.profileServerFreshAt != null;
        }
        const source = activeSourceReady();
        return source.sameClub === true && source.sameSession === true
            && source.activeListenerMounted === true && source.activeListenerFailed !== true
            && source.fullAuthoritySnapshotSeen === true && source.fullAuthorityComplete === true
            && source.authorityMode === 'full-profiles-authoritative';
    }
    function cancelSyncOperation(operationId) {
        const id = String(operationId || '');
        const row = _syncDiag.active.get(id);
        if (!row) return false;
        row.syncClearedAt = row.syncClearedAt || now();
        _syncDiag.refreshPlanning.delete(id);
        _syncDiag.history.push({ ...row, cancelled: true });
        _syncDiag.active.delete(id);
        if (_syncDiag.history.length > 80) _syncDiag.history.splice(0, _syncDiag.history.length - 80);
        return true;
    }
    function getSyncDiagnostics() {
        return {
            active: Array.from(_syncDiag.active.values(), row => ({ ...row })),
            refreshPlanningOperationIds: Array.from(_syncDiag.refreshPlanning),
            history: _syncDiag.history.map(row => ({ ...row })),
        };
    }

    function queryForStatuses(ref, values, sdk) {
        if (values.length === 1) return sdk.query(ref, sdk.where('status', '==', values[0]));
        return sdk.query(ref, sdk.where('status', 'in', values.slice(0, 10)));
    }

    function isQuotaError(error) {
        const code = String(error && (error.code || error.name || '') || '').toLowerCase();
        const msg = String(error && (error.message || '') || '').toLowerCase();
        return code.includes('resource-exhausted') || code.includes('resource_exhausted') || msg.includes('resource-exhausted') || msg.includes('429') || msg.includes('quota');
    }

    function isCountAuditAllowed(options) {
        if (options && options.force === true) return true;
        if (global.__ENABLE_DEBT_COUNT_AUDIT === true) return true;
        return false;
    }

    function runLocalCoverageAudit(reason) {
        const source = activeSourceReady();
        const profiles = (global.__store && global.__store.profiles) || {};
        let active = 0, quit = 0, unknown = 0;
        Object.values(profiles || {}).forEach(profile => {
            try {
                const status = canonicalStatus(profile || {});
                if (status === 'quit') quit++;
                else if (status === 'active') active++;
                else unknown++;
            } catch (_) { unknown++; }
        });
        _metrics.localCoverageRuns++;
        const audit = {
            ok: true,
            local: true,
            noRead: true,
            reason: reason || 'local-profile-cache-audit',
            clubId: context().clubId,
            totalLoaded: Object.keys(profiles || {}).length,
            activeLoaded: active,
            quitLoaded: quit,
            unknownLoaded: unknown,
            activeSourceReady: !!source.ready,
            profilesCount: source.profilesCount,
            covered: !!source.ready,
            coveredBy: source.ready ? 'full-profile-authority' : 'not-authoritative',
            auditedAt: now(),
        };
        _state.lastAudit = audit;
        return audit;
    }

    async function runCountAudit(reason, options) {
        const ctx = context();
        const sdk = global._fb_init || {};
        const opts = options || {};
        if (!isCountAuditAllowed(opts)) {
            _metrics.countAggregationSuppressed += 3;
            return { ok: false, skipped: true, noRead: true, reason: 'count-audit-disabled-spark-guard' };
        }
        if (_state.countAuditDisabledUntil && now() < _state.countAuditDisabledUntil) {
            _metrics.countAggregationSuppressed += 3;
            return { ok: false, skipped: true, noRead: true, reason: 'count-audit-cooldown', retryAfterMs: _state.countAuditDisabledUntil - now() };
        }
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
            if (isQuotaError(error)) {
                _metrics.countAuditQuotaErrors++;
                _state.countAuditDisabledUntil = now() + COUNT_AUDIT_COOLDOWN_MS;
                return { ok: false, skipped: true, quotaGuarded: true, noRead: false, reason: 'count-audit-quota-guarded', error, retryAfterMs: COUNT_AUDIT_COOLDOWN_MS };
            }
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
            const source = activeSourceReady();
            if (!source.ready) return { ok: false, deferred: true, reason: 'active-source-not-ready' };

            const localAudit = runLocalCoverageAudit(reason || 'automatic-local');

            // D1C3B: only a same-club complete profile authority can verify Debt
            // coverage. Local audit describes already-loaded docs but never proves
            // that a filtered query did not omit other active profiles.
            _state.sessionVerified = true;
            _metrics.verifiedWithoutFullScan++;
            _metrics.fullScansAvoided++;
            _state.lastSource = source.authorityMode || 'full-profile-authority';
            _metrics.lastSource = _state.lastSource;
            return { ok: true, ready: true, source: _state.lastSource, audit: localAudit, noRead: true };

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
        if (!isAdminRole(ctx.role)) {
            return { ok: false, ready: false, blocked: true, source: 'role-not-allowed' };
        }
        if (_state.clubId && _state.clubId !== ctx.clubId) {
            _state.sessionVerified = false;
            _state.fullFallbackReady = false;
            _state.lastSource = 'club-switch-waiting-authority';
        }
        _state.clubId = ctx.clubId || '';
        const source = activeSourceReady();

        if (source.ready) {
            _state.sessionVerified = true;
            _metrics.fullScansAvoided++;
            _state.lastSource = source.authorityMode || 'full-profile-authority';
            _metrics.lastSource = _state.lastSource;
            return {
                ok: true,
                ...source,
                ready: true,
                source: _state.lastSource,
                profilesCount: source.profilesCount,
                noRead: true,
                audit: runLocalCoverageAudit(reason || 'ensure-verified-local'),
            };
        }

        // D1C3B2: a registered Admin listener still awaiting its first snapshot
        // is not a failure. Return fail-closed loading instead of evicting it
        // normal pending coverage returns immediately; the original listener callback stays live.
        const pending = source.listener || {};
        if (pending.activeListenerKey && pending.activeListenerFailed !== true
            && source.authorityClubId === ctx.clubId
            && typeof global.hasListener === 'function'
            && global.hasListener(pending.activeListenerKey)) {
            return { ok: false, ready: false, deferred: true,
                source: 'full-profile-listener-pending', authorityClubId: ctx.clubId };
        }

        // Admin may explicitly run count audit via runCountAudit(reason, { force: true }) for diagnostics.
        // Normal tab-open/login path must not call getCountFromServer because Spark quota can 429.
        // Non-admin never triggers client aggregation here.

        // Admin performs automatic verification/normalization. Non-admin may only audit;
        // if coverage is incomplete, use the existing guarded full fallback for correctness.
        if (isAdminRole(ctx.role)) {
            const result = await runAutomaticVerification(reason || 'debt-tab-open');
            if (result.ready) return result;
        } else {
            _metrics.countAggregationSuppressed += 3;
        }

        if (typeof global.loadFullProfilesFallback === 'function') {
            _metrics.fullFallbackRuns++;
            const ok = await global.loadFullProfilesFallback('debt-coverage-emergency:' + (reason || 'debt-tab'));
            if (ok) {
                const fallbackSource = activeSourceReady();
                if (fallbackSource.ready) {
                    _state.fullFallbackReady = true;
                    _state.sessionVerified = true;
                    _state.lastSource = fallbackSource.authorityMode || 'full-fallback';
                    _metrics.lastSource = _state.lastSource;
                    return { ok: true, ...fallbackSource, ready: true, source: _state.lastSource, fallback: true };
                }
            }
        }

        return { ok: false, ready: false, source: 'not-ready' };
    }

    function scheduleAutomaticVerification(reason, delay) {
        const ctx = context();
        if (!ctx.clubId || !isAdminRole(ctx.role)) return false;
        if (_state.scheduled || _state.inFlight) return false;
        if (_state.sessionVerified) return false;

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
        _state.countAuditDisabledUntil = 0;
        _syncDiag.active.clear();
        _syncDiag.refreshPlanning.clear();
        global.__debtProfileCoverageLocalLock = false;
    }

    function getStatus() {
        const ctx = context();
        const source = activeSourceReady();
        const presentationState = classifyCoverageState(source);
        return {
            schemaVersion: SCHEMA_VERSION,
            clubId: ctx.clubId,
            ready: source.ready === true,
            presentationState,
            transientLocalWrite: presentationState === COVERAGE_STATE.TRANSIENT_LOCAL_WRITE,
            authorityClubId: source.authorityClubId,
            sameClub: source.sameClub === true,
            fullAuthoritySnapshotSeen: source.fullAuthoritySnapshotSeen === true,
            fullAuthorityComplete: source.fullAuthorityComplete === true,
            storeComplete: source.storeComplete === true,
            authorityMode: source.authorityMode,
            configVerified: isConfigVerified(ctx.config),
            sessionVerified: _state.sessionVerified,
            inFlight: _state.inFlight,
            scheduled: _state.scheduled,
            source: _state.lastSource,
            lastAudit: _state.lastAudit,
            lastError: _state.lastError,
            countAuditDisabledUntil: _state.countAuditDisabledUntil,
            activeSource: source,
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
            aggregationSuppressed: { value: _metrics.countAggregationSuppressed },
            aggregationQuotaErrors: { value: _metrics.countAuditQuotaErrors },
            localCoverageRuns: { value: _metrics.localCoverageRuns },
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
        runLocalCoverageAudit,
        buildNormalizationPlan,
        getStatus,
        printMetrics,
        reset,
        beginSyncOperation,
        markSyncStage,
        markActiveSyncStage,
        getOperationRefreshPlan,
        acceptDebtRefreshOperations,
        clearFreshSyncOperations,
        isProfileAckOwnedOperation,
        cancelSyncOperation,
        getSyncDiagnostics,
        coverageStates: COVERAGE_STATE,
    };

    global.DebtProfileReadBoundary = api;
    global.ensureDebtProfileCoverage = ensureDebtProfileCoverage;
    global.scheduleAutomaticDebtProfileCoverage = scheduleAutomaticVerification;
    global.runAutomaticDebtProfileCoverage = runAutomaticVerification;
    global.getDebtProfileCoverageStatus = getStatus;
    global.getDebtSyncDiagnostics = getSyncDiagnostics;
    global.printDebtReadMetrics = printMetrics;
    global.resetDebtProfileReadBoundary = reset;
})(window);
