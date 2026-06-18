/*
 * Phase 4K-6V3BC1 — Automatic Canonical Transaction Optimization
 * Classic deferred script loaded before app.js.
 *
 * Safety rules:
 * - Does NOT attach a Firestore listener.
 * - Automatically optimizes only the active month after all three legacy snapshots are complete.
 * - Backfill uses already-loaded memory data; no collection scan is added.
 * - Canonical mode is enabled only after exact count/ID/amount parity; failures roll back to legacy.
 */
(function initTransactionCanonicalBoundary(global) {
    'use strict';

    if (global.CanonicalTransactionBoundary && global.CanonicalTransactionBoundary.version === '4K-6V3BC1') return;

    const SCHEMA_VERSION = 1;
    const MONTH_RE = /^(\d{4})-(\d{1,2})$/;
    const _auditCache = new Map();
    const AUTO_OPTIMIZE_VERSION = 1;
    const AUTO_OPTIMIZE_DELAY_MS = 2200;
    const AUTO_RETRY_COOLDOWN_MS = 12 * 60 * 60 * 1000;
    const AUTO_STORAGE_PREFIX = 'tkd:canonical-tx-auto:v1:';
    const _autoTimers = new Map();
    const _autoRuns = new Map();

    function normalizeMonth(value) {
        const raw = String(value == null ? '' : value).trim();
        if (!raw) return '';
        const direct = raw.slice(0, 7);
        const match = direct.match(MONTH_RE);
        if (!match) return '';
        const year = Number(match[1]);
        const month = Number(match[2]);
        if (!Number.isInteger(year) || year < 2000 || year > 2200 || month < 1 || month > 12) return '';
        return String(year).padStart(4, '0') + '-' + String(month).padStart(2, '0');
    }

    function pushMonth(target, value) {
        const month = normalizeMonth(value);
        if (month) target.add(month);
    }

    function collectMonthsFromComponent(target, component) {
        if (!component || typeof component !== 'object') return;
        pushMonth(target, component.month);
        pushMonth(target, component.txMonth);
        pushMonth(target, component.paymentMonth);
        if (Array.isArray(component.packageMonths)) component.packageMonths.forEach(function(m) { pushMonth(target, m); });
        if (Array.isArray(component.accountingMonths)) component.accountingMonths.forEach(function(m) { pushMonth(target, m); });
    }

    function deriveAccountingMonths(data) {
        const tx = data && typeof data === 'object' ? data : {};
        const months = new Set();

        if (Array.isArray(tx.accountingMonths)) tx.accountingMonths.forEach(function(m) { pushMonth(months, m); });
        if (Array.isArray(tx.packageMonths)) tx.packageMonths.forEach(function(m) { pushMonth(months, m); });
        pushMonth(months, tx.paymentMonth);
        pushMonth(months, tx.txMonth);
        pushMonth(months, tx.primaryAccountingMonth);
        pushMonth(months, tx.date);

        if (Array.isArray(tx.components)) tx.components.forEach(function(c) { collectMonthsFromComponent(months, c); });
        if (Array.isArray(tx.paymentComponents)) tx.paymentComponents.forEach(function(c) { collectMonthsFromComponent(months, c); });

        return Array.from(months).sort();
    }

    function choosePrimaryMonth(data, months) {
        const tx = data && typeof data === 'object' ? data : {};
        const preferred = [
            tx.primaryAccountingMonth,
            tx.paymentMonth,
            tx.txMonth,
            Array.isArray(tx.packageMonths) && tx.packageMonths.length ? tx.packageMonths[0] : '',
            tx.date,
        ];
        for (let i = 0; i < preferred.length; i++) {
            const normalized = normalizeMonth(preferred[i]);
            if (normalized) return normalized;
        }
        return months[0] || '';
    }

    function canonicalizeCreate(data, reason) {
        const input = data && typeof data === 'object' ? data : {};
        const output = Object.assign({}, input);
        const months = deriveAccountingMonths(input);
        output.accountingMonths = months;
        output.primaryAccountingMonth = choosePrimaryMonth(input, months);
        output.accountingSchemaVersion = SCHEMA_VERSION;
        if (!output.accountingBoundarySource) output.accountingBoundarySource = String(reason || 'transaction-create');
        return output;
    }

    function canonicalizePatch(patch, existing, reason) {
        const delta = patch && typeof patch === 'object' ? patch : {};
        const base = existing && typeof existing === 'object' ? existing : {};
        const merged = Object.assign({}, base, delta);
        const hasMonthMutation = [
            'date', 'txMonth', 'paymentMonth', 'packageMonths', 'accountingMonths',
            'primaryAccountingMonth', 'components', 'paymentComponents'
        ].some(function(key) { return Object.prototype.hasOwnProperty.call(delta, key); });
        if (!hasMonthMutation && !Object.keys(base).length) return Object.assign({}, delta);
        const canonical = canonicalizeCreate(merged, reason || 'transaction-patch');
        return Object.assign({}, delta, {
            accountingMonths: canonical.accountingMonths,
            primaryAccountingMonth: canonical.primaryAccountingMonth,
            accountingSchemaVersion: SCHEMA_VERSION,
            accountingBoundarySource: canonical.accountingBoundarySource,
        });
    }

    function ensureMetrics() {
        if (!global.__firestoreReadAttribution || typeof global.__firestoreReadAttribution !== 'object') {
            global.__firestoreReadAttribution = {
                version: '4K-6V3A',
                sessionStartedAt: Date.now(),
                sources: {},
                events: [],
                transactionOverlap: {},
                canonicalParity: {},
            };
        }
        return global.__firestoreReadAttribution;
    }

    function recordRead(source, estimatedDocs, detail) {
        const metrics = ensureMetrics();
        const key = String(source || 'unknown');
        const count = Math.max(0, Number(estimatedDocs) || 0);
        const meta = detail && typeof detail === 'object' ? detail : {};
        const item = metrics.sources[key] || {
            source: key,
            events: 0,
            estimatedDocs: 0,
            initialEvents: 0,
            initialDocs: 0,
            changeEvents: 0,
            changedDocs: 0,
            maxDocs: 0,
            lastDocs: 0,
            lastAt: 0,
            lastReason: '',
        };
        item.events += 1;
        item.estimatedDocs += count;
        item.maxDocs = Math.max(item.maxDocs, count);
        item.lastDocs = count;
        item.lastAt = Date.now();
        item.lastReason = String(meta.reason || '');
        if (meta.initial) {
            item.initialEvents += 1;
            item.initialDocs += count;
        } else {
            item.changeEvents += 1;
            item.changedDocs += count;
        }
        metrics.sources[key] = item;
        metrics.events.push({ source: key, estimatedDocs: count, at: item.lastAt, initial: !!meta.initial, reason: item.lastReason });
        if (metrics.events.length > 400) metrics.events = metrics.events.slice(-400);
        return item;
    }

    function recordSnapshot(source, snapshot, detail) {
        const meta = detail && typeof detail === 'object' ? detail : {};
        const size = snapshot && typeof snapshot.size === 'number' ? snapshot.size : 0;
        let changed = size;
        if (!meta.initial && snapshot && typeof snapshot.docChanges === 'function') {
            try { changed = snapshot.docChanges().length; } catch (_) { changed = size; }
        }
        return recordRead(source, meta.initial ? size : changed, Object.assign({}, meta, {
            resultSize: size,
            changedDocs: changed,
        }));
    }

    function recordTransactionOverlap(month, sources) {
        const metrics = ensureMetrics();
        const byDate = Array.isArray(sources && sources.byDate) ? sources.byDate : [];
        const byTxMonth = Array.isArray(sources && sources.byTxMonth) ? sources.byTxMonth : [];
        const byPackage = Array.isArray(sources && sources.byPackageMonth) ? sources.byPackageMonth : [];
        const all = byDate.concat(byTxMonth, byPackage).filter(Boolean);
        const uniqueById = new Map();
        all.forEach(function(tx) { if (tx && tx.id && !uniqueById.has(tx.id)) uniqueById.set(tx.id, tx); });
        const canonicalCovered = Array.from(uniqueById.values()).filter(function(tx) {
            return Array.isArray(tx.accountingMonths) && tx.accountingMonths.indexOf(month) >= 0;
        }).length;
        const rawDocs = all.length;
        const uniqueDocs = uniqueById.size;
        const sourceSeen = sources && sources.sourceSeen && typeof sources.sourceSeen === 'object' ? sources.sourceSeen : {};
        const queryLimit = Math.max(1, Number(sources && sources.queryLimit) || Number((global.__scaleConfig || {}).txListenerLimit) || 1200);
        const allSourcesReady = !!(sourceSeen.byDate && sourceSeen.byTxMonth && sourceSeen.byPackageMonth);
        const truncatedSources = [];
        if (byDate.length >= queryLimit) truncatedSources.push('byDate');
        if (byTxMonth.length >= queryLimit) truncatedSources.push('byTxMonth');
        if (byPackage.length >= queryLimit) truncatedSources.push('byPackageMonth');
        const report = {
            month: month,
            byDate: byDate.length,
            byTxMonth: byTxMonth.length,
            byPackageMonths: byPackage.length,
            rawDocs: rawDocs,
            uniqueDocs: uniqueDocs,
            duplicateDocs: Math.max(0, rawDocs - uniqueDocs),
            overlapPercent: rawDocs ? Math.round(((rawDocs - uniqueDocs) / rawDocs) * 10000) / 100 : 0,
            canonicalCovered: canonicalCovered,
            canonicalMissing: Math.max(0, uniqueDocs - canonicalCovered),
            canonicalCoveragePercent: uniqueDocs ? Math.round((canonicalCovered / uniqueDocs) * 10000) / 100 : 100,
            queryLimit: queryLimit,
            allSourcesReady: allSourcesReady,
            truncatedSources: truncatedSources,
            truncatedRisk: truncatedSources.length > 0,
            safeForBackfill: allSourcesReady && truncatedSources.length === 0,
            updatedAt: Date.now(),
        };
        metrics.transactionOverlap[String(month || '')] = report;
        if (report.safeForBackfill && typeof scheduleAutomaticCutover === 'function') {
            scheduleAutomaticCutover(month, 'legacy-snapshots-ready');
        }
        return report;
    }

    function sumAmounts(items) {
        return (Array.isArray(items) ? items : []).reduce(function(total, tx) {
            return total + (Number(tx && tx.amount) || 0);
        }, 0);
    }

    async function runParityAudit(monthInput, options) {
        const opts = options && typeof options === 'object' ? options : {};
        const month = normalizeMonth(monthInput || ((document.getElementById('filterMonth') || {}).value));
        if (!month) throw new Error('[V3A] Tháng đối chiếu không hợp lệ. Dùng YYYY-MM.');

        const store = global.__store || {};
        const db = store.db;
        const clubId = store.clubId || store.currentClubId || global.currentClubId;
        const sdk = global._fb_init || {};
        if (!db || !clubId || !sdk.collection || !sdk.query || !sdk.where || !sdk.limit || !sdk.getDocs) {
            throw new Error('[V3A] Firestore context chưa sẵn sàng.');
        }

        const cacheKey = clubId + ':' + month;
        const cached = _auditCache.get(cacheKey);
        const ttlMs = Math.max(60_000, Number(opts.ttlMs) || 600_000);
        if (!opts.force && cached && Date.now() - cached.auditedAt < ttlMs) return Object.assign({}, cached, { fromCache: true });

        const listenerLimit = Math.max(1, Number((global.__scaleConfig || {}).txListenerLimit) || 1200);
        const maxDocs = Math.max(2, Math.min(5001, Number(opts.limit) || (listenerLimit + 1)));
        const ref = sdk.collection(db, 'clubs', clubId, 'transactions');
        const canonicalQuery = sdk.query(ref, sdk.where('accountingMonths', 'array-contains', month), sdk.limit(maxDocs));
        const snap = await sdk.getDocs(canonicalQuery);
        recordRead('transactions.canonicalParityAudit', snap.size, { initial: true, reason: 'manual-parity-audit:' + month });

        const canonical = snap.docs.map(function(d) { return Object.assign({ id: d.id }, d.data()); });
        const activeMonth = String(store._activeTxListenerMonth || '');
        const suppliedLegacy = Array.isArray(opts.legacyTransactions) ? opts.legacyTransactions : null;
        if (!suppliedLegacy && activeMonth !== month) {
            throw new Error('[V3A] Chỉ đối chiếu tháng đang được listener cũ tải (' + (activeMonth || 'chưa có') + '). Chọn tháng ' + month + ' trên giao diện trước.');
        }
        const legacy = (suppliedLegacy || (Array.isArray(store.transactions) ? store.transactions : []))
            .filter(function(tx) {
                return typeof global.txMatchesSelectedMonth === 'function'
                    ? global.txMatchesSelectedMonth(tx, month)
                    : deriveAccountingMonths(tx).indexOf(month) >= 0;
            });

        const legacyIds = new Set(legacy.map(function(t) { return t && t.id; }).filter(Boolean));
        const canonicalIds = new Set(canonical.map(function(t) { return t && t.id; }).filter(Boolean));
        const missingFromCanonical = Array.from(legacyIds).filter(function(id) { return !canonicalIds.has(id); });
        const extraInCanonical = Array.from(canonicalIds).filter(function(id) { return !legacyIds.has(id); });
        const legacyAmount = sumAmounts(legacy);
        const canonicalAmount = sumAmounts(canonical);
        const report = {
            version: '4K-6V3A',
            clubId: clubId,
            month: month,
            legacyCount: legacyIds.size,
            canonicalCount: canonicalIds.size,
            missingFromCanonicalCount: missingFromCanonical.length,
            extraInCanonicalCount: extraInCanonical.length,
            legacyAmount: legacyAmount,
            canonicalAmount: canonicalAmount,
            amountDelta: canonicalAmount - legacyAmount,
            countMatch: legacyIds.size === canonicalIds.size,
            idSetMatch: missingFromCanonical.length === 0 && extraInCanonical.length === 0,
            amountMatch: canonicalAmount === legacyAmount,
            readyForCanonicalCutover: legacyIds.size === canonicalIds.size && missingFromCanonical.length === 0 && extraInCanonical.length === 0 && canonicalAmount === legacyAmount && snap.size <= listenerLimit,
            queryLimit: listenerLimit,
            fetchedLimit: maxDocs,
            truncatedRisk: snap.size > listenerLimit,
            fromCache: false,
            auditedAt: Date.now(),
        };
        ensureMetrics().canonicalParity[month] = report;
        _auditCache.set(cacheKey, report);
        console.group('[V3A Canonical Transaction Parity] ' + month);
        console.table(report);
        if (!report.readyForCanonicalCutover) {
            console.warn('[V3A] Chưa được tắt 3 query cũ. Dữ liệu accountingMonths chưa đạt parity.');
        } else {
            console.info('[V3A] Parity đạt cho tháng này. V3A vẫn KHÔNG tự tắt query cũ.');
        }
        console.groupEnd();
        return report;
    }


    function getContext() {
        const store = global.__store || {};
        return {
            store: store,
            db: store.db,
            clubId: store.clubId || store.currentClubId || global.currentClubId || '',
            role: String(global.userRole || store.userRole || '').toLowerCase(),
            sdk: global._fb_init || {},
        };
    }

    function isAdminRuntime() {
        const role = getContext().role;
        return role === 'admin' || role === 'super_admin' || role === 'superadmin' || role === 'root' || role === 'root_admin';
    }

    function autoStorageKey(clubId, month) {
        return AUTO_STORAGE_PREFIX + String(clubId || '') + ':' + String(month || '');
    }

    function readAutoRecord(clubId, month) {
        try {
            const raw = global.localStorage && global.localStorage.getItem(autoStorageKey(clubId, month));
            const parsed = raw ? JSON.parse(raw) : null;
            return parsed && typeof parsed === 'object' ? parsed : null;
        } catch (_) { return null; }
    }

    function writeAutoRecord(clubId, month, patch) {
        const previous = readAutoRecord(clubId, month) || {};
        const next = Object.assign({}, previous, patch || {}, {
            clubId: String(clubId || ''),
            month: String(month || ''),
            version: AUTO_OPTIMIZE_VERSION,
            updatedAt: Date.now(),
        });
        try {
            if (global.localStorage) global.localStorage.setItem(autoStorageKey(clubId, month), JSON.stringify(next));
        } catch (_) {}
        _autoRuns.set(String(clubId || '') + ':' + String(month || ''), next);
        return next;
    }

    function clearAutoTimer(key) {
        const timer = _autoTimers.get(key);
        if (timer) {
            try { clearTimeout(timer); } catch (_) {}
            _autoTimers.delete(key);
        }
    }

    function resetAutomaticOptimization(reason) {
        _autoTimers.forEach(function(timer) { try { clearTimeout(timer); } catch (_) {} });
        _autoTimers.clear();
        global.__canonicalTxAutoState = {
            version: '4K-6V3BC1',
            reason: String(reason || 'reset'),
            resetAt: Date.now(),
        };
        removeOptimizerButton();
        return global.__canonicalTxAutoState;
    }

    function automaticCutoverBlockedReason(month) {
        const ctx = getContext();
        const store = ctx.store;
        if (!ctx.clubId || !ctx.db) return 'context-not-ready';
        if (!isAdminRuntime()) return 'role-not-allowed';
        if (!month || String(store._activeTxListenerMonth || '') !== month) return 'month-not-active';
        if (String(store._activeTxReadMode || 'legacy') !== 'legacy') return 'already-canonical';
        if (global.__canonicalTxCutoverInFlight) return 'cutover-in-flight';
        if (global.__examUpgradeInFlight || global.__addStudentInProgress) return 'financial-action-in-flight';
        if (global.navigator && global.navigator.onLine === false) return 'offline';
        const overlap = ensureMetrics().transactionOverlap[month];
        if (!overlap || !overlap.safeForBackfill) return 'legacy-sources-not-safe';
        const record = readAutoRecord(ctx.clubId, month);
        if (record && record.status === 'failed' && Date.now() - Number(record.updatedAt || 0) < AUTO_RETRY_COOLDOWN_MS) {
            return 'cooldown';
        }
        return '';
    }

    async function runAutomaticCutover(monthInput, trigger) {
        const month = normalizeMonth(monthInput);
        const ctx = getContext();
        const key = ctx.clubId + ':' + month;
        clearAutoTimer(key);
        const blocked = automaticCutoverBlockedReason(month);
        if (blocked) {
            const transient = blocked === 'financial-action-in-flight' || blocked === 'offline' || blocked === 'context-not-ready';
            if (transient) {
                const retryKey = ctx.clubId + ':' + month;
                if (!_autoTimers.has(retryKey)) {
                    const retryTimer = setTimeout(function() {
                        _autoTimers.delete(retryKey);
                        scheduleAutomaticCutover(month, 'retry-' + blocked);
                    }, 5000);
                    _autoTimers.set(retryKey, retryTimer);
                }
            }
            return { ok: false, deferred: true, reason: blocked, month: month };
        }
        writeAutoRecord(ctx.clubId, month, { status: 'running', reason: '', trigger: String(trigger || '') });
        try {
            const result = await executeCanonicalCutover(month, {
                dryRun: false,
                confirmToken: 'ENABLE_CANONICAL_READ',
                automatic: true,
            });
            if (!result || !result.ok) {
                writeAutoRecord(ctx.clubId, month, { status: 'failed', reason: 'parity-failed', rollbackApplied: true });
                return result || { ok: false, reason: 'parity-failed' };
            }
            writeAutoRecord(ctx.clubId, month, {
                status: 'success',
                reason: 'canonical-enabled',
                patchedCount: Number(result.patchedCount || 0),
                completedAt: Date.now(),
            });
            console.info('[V3BC1] Tự động tối ưu Reads thành công:', ctx.clubId, month);
            return result;
        } catch (error) {
            const message = error && error.message ? error.message : String(error);
            writeAutoRecord(ctx.clubId, month, { status: 'failed', reason: message, failedAt: Date.now() });
            console.warn('[V3BC1] Tự động tối ưu Reads tạm hoãn; hệ thống tiếp tục dùng legacy:', message);
            return { ok: false, reason: message, rollbackApplied: true };
        }
    }

    function scheduleAutomaticCutover(monthInput, trigger) {
        const month = normalizeMonth(monthInput);
        const ctx = getContext();
        if (!month || !ctx.clubId) return false;
        if (getReadMode(ctx.clubId, month) === 'canonical') return false;
        const key = ctx.clubId + ':' + month;
        if (_autoTimers.has(key) || global.__canonicalTxCutoverInFlight) return false;
        const blocked = automaticCutoverBlockedReason(month);
        if (blocked && blocked !== 'financial-action-in-flight') return false;
        const run = function() {
            _autoTimers.delete(key);
            const execute = function() { runAutomaticCutover(month, trigger || 'automatic').catch(function(error) { console.warn('[V3BC1 auto]', error); }); };
            if (typeof global.requestIdleCallback === 'function') global.requestIdleCallback(execute, { timeout: 3000 });
            else execute();
        };
        const timer = setTimeout(run, AUTO_OPTIMIZE_DELAY_MS);
        _autoTimers.set(key, timer);
        global.__canonicalTxAutoState = { version: '4K-6V3BC1', clubId: ctx.clubId, month: month, status: 'scheduled', trigger: String(trigger || ''), scheduledAt: Date.now() };
        return true;
    }

    function removeOptimizerButton() {
        if (!global.document || typeof global.document.getElementById !== 'function') return false;
        const button = global.document.getElementById('btnCanonicalTxOptimize');
        if (button && button.parentElement) button.parentElement.removeChild(button);
        return !!button;
    }

    function getAutomaticOptimizationStatus(monthInput) {
        const ctx = getContext();
        const month = normalizeMonth(monthInput || (ctx.store && ctx.store._activeTxListenerMonth) || ((global.document && global.document.getElementById('filterMonth')) || {}).value);
        const key = ctx.clubId + ':' + month;
        return {
            version: '4K-6V3BC1',
            clubId: ctx.clubId,
            month: month,
            readMode: getReadMode(ctx.clubId, month),
            scheduled: _autoTimers.has(key),
            inFlight: !!global.__canonicalTxCutoverInFlight,
            record: readAutoRecord(ctx.clubId, month) || _autoRuns.get(key) || null,
            overlap: ensureMetrics().transactionOverlap[month] || null,
        };
    }

    function configuredReadMonths() {
        const config = (getContext().store || {}).clubConfig || {};
        const values = Array.isArray(config.canonicalTransactionReadMonths)
            ? config.canonicalTransactionReadMonths
            : [];
        return values.map(normalizeMonth).filter(Boolean);
    }

    function getReadMode(clubIdInput, monthInput) {
        const ctx = getContext();
        const clubId = String(clubIdInput || ctx.clubId || '');
        const month = normalizeMonth(monthInput);
        if (!clubId || !month) return 'legacy';
        return configuredReadMonths().indexOf(month) >= 0 ? 'canonical' : 'legacy';
    }

    function arraysEqual(a, b) {
        const left = Array.isArray(a) ? a.slice().sort() : [];
        const right = Array.isArray(b) ? b.slice().sort() : [];
        return left.length === right.length && left.every(function(value, index) { return value === right[index]; });
    }

    function buildBackfillPlan(monthInput, options) {
        const opts = options && typeof options === 'object' ? options : {};
        const month = normalizeMonth(monthInput || ((document.getElementById('filterMonth') || {}).value));
        if (!month) throw new Error('[V3B/C] Tháng chuẩn hóa không hợp lệ. Dùng YYYY-MM.');
        const ctx = getContext();
        const store = ctx.store;
        if (!ctx.db || !ctx.clubId) throw new Error('[V3B/C] Firestore context chưa sẵn sàng.');
        if (!opts.allowNonAdmin && !isAdminRuntime()) throw new Error('[V3B/C] Chỉ Admin mới được tối ưu giao dịch.');
        const activeMonth = String(store._activeTxListenerMonth || '');
        if (activeMonth !== month) throw new Error('[V3B/C] Hãy chọn tháng ' + month + ' trên giao diện và chờ dữ liệu tải xong.');
        if (String(store._activeTxReadMode || 'legacy') !== 'legacy' && !opts.allowCanonicalMode) {
            return { ok: true, month: month, clubId: ctx.clubId, alreadyCanonical: true, candidates: [], candidateCount: 0, blockedReasons: [] };
        }

        const metrics = ensureMetrics();
        const overlap = metrics.transactionOverlap[month] || null;
        const blockedReasons = [];
        if (!overlap || !overlap.allSourcesReady) blockedReasons.push('Ba nguồn giao dịch cũ chưa tải hoàn tất.');
        if (overlap && overlap.truncatedRisk) blockedReasons.push('Có query chạm giới hạn ' + overlap.queryLimit + ': ' + overlap.truncatedSources.join(', ') + '.');

        const source = Array.isArray(opts.legacyTransactions) ? opts.legacyTransactions : (Array.isArray(store.transactions) ? store.transactions : []);
        const unique = new Map();
        source.forEach(function(tx) { if (tx && tx.id && !unique.has(tx.id)) unique.set(tx.id, tx); });
        if (overlap && overlap.allSourcesReady && unique.size !== overlap.uniqueDocs) {
            blockedReasons.push('Store giao dịch không khớp snapshot nguồn: store=' + unique.size + ', source=' + overlap.uniqueDocs + '.');
        }

        const candidates = [];
        const invalid = [];
        unique.forEach(function(tx, id) {
            const canonical = canonicalizeCreate(tx, 'v3bc-month-backfill');
            if (canonical.accountingMonths.indexOf(month) < 0) {
                invalid.push(id);
                return;
            }
            const needsPatch = !arraysEqual(tx.accountingMonths, canonical.accountingMonths) ||
                normalizeMonth(tx.primaryAccountingMonth) !== canonical.primaryAccountingMonth ||
                Number(tx.accountingSchemaVersion || 0) < SCHEMA_VERSION;
            if (needsPatch) {
                candidates.push({
                    id: id,
                    patch: {
                        accountingMonths: canonical.accountingMonths,
                        primaryAccountingMonth: canonical.primaryAccountingMonth,
                        accountingSchemaVersion: SCHEMA_VERSION,
                        accountingBoundarySource: tx.accountingBoundarySource || 'v3bc-month-backfill',
                    },
                });
            }
        });
        if (invalid.length) blockedReasons.push(invalid.length + ' giao dịch không suy ra được tháng ' + month + '.');

        return {
            ok: blockedReasons.length === 0,
            version: '4K-6V3BC',
            clubId: ctx.clubId,
            month: month,
            activeReadMode: String(store._activeTxReadMode || 'legacy'),
            loadedTransactionCount: unique.size,
            candidateCount: candidates.length,
            unchangedCount: Math.max(0, unique.size - candidates.length - invalid.length),
            invalidCount: invalid.length,
            invalidIds: invalid.slice(0, 20),
            candidates: candidates,
            overlap: overlap,
            blockedReasons: blockedReasons,
            estimatedReadsForBackfill: 0,
            estimatedParityReads: unique.size,
            plannedAt: Date.now(),
        };
    }

    function detachFinanceListener(reason) {
        if (typeof global.cleanupListenersByOwner === 'function') {
            try { global.cleanupListenersByOwner('finance', reason || 'canonical-cutover'); } catch (_) {}
        }
        const store = getContext().store;
        store._activeTxListenerMonth = '';
        store._activeTxReadMode = '';
    }

    function reattachMonth(month, mode, reason) {
        const store = getContext().store;
        store._activeTxListenerMonth = '';
        store._activeTxReadMode = '';
        if (typeof global.listenToData === 'function') {
            global.listenToData(month);
        }
        console.info('[V3B/C] Transaction listener reattached:', mode, month, reason || '');
    }

    function updateLocalConfiguredMonth(month, enabled) {
        const store = getContext().store;
        store.clubConfig = store.clubConfig || {};
        const current = Array.isArray(store.clubConfig.canonicalTransactionReadMonths)
            ? store.clubConfig.canonicalTransactionReadMonths.map(normalizeMonth).filter(Boolean)
            : [];
        const set = new Set(current);
        if (enabled) set.add(month); else set.delete(month);
        store.clubConfig.canonicalTransactionReadMonths = Array.from(set).sort();
        return store.clubConfig.canonicalTransactionReadMonths;
    }

    async function persistReadMode(month, enabled) {
        const ctx = getContext();
        const sdk = ctx.sdk;
        if (!sdk.setDoc || !sdk.doc || !sdk.arrayUnion || !sdk.arrayRemove) {
            throw new Error('[V3B/C] Firebase SDK thiếu setDoc/doc/arrayUnion/arrayRemove.');
        }
        const value = enabled ? sdk.arrayUnion(month) : sdk.arrayRemove(month);
        await sdk.setDoc(
            sdk.doc(ctx.db, 'clubs', ctx.clubId, 'settings', 'main_config'),
            {
                canonicalTransactionReadMonths: value,
                canonicalTransactionReadVersion: 1,
                canonicalTransactionReadUpdatedAt: Date.now(),
            },
            { merge: true }
        );
        updateLocalConfiguredMonth(month, enabled);
    }

    async function executeCanonicalCutover(monthInput, options) {
        const opts = options && typeof options === 'object' ? options : {};
        const month = normalizeMonth(monthInput || ((document.getElementById('filterMonth') || {}).value));
        if (global.__canonicalTxCutoverInFlight) throw new Error('[V3B/C] Một tiến trình tối ưu giao dịch đang chạy.');
        const plan = buildBackfillPlan(month, opts);
        if (!plan.ok) throw new Error('[V3B/C] Chưa thể chuyển đổi: ' + plan.blockedReasons.join(' '));
        if (plan.alreadyCanonical) return plan;
        if (opts.dryRun !== false) return Object.assign({}, plan, { dryRun: true });
        if (opts.confirmToken !== 'ENABLE_CANONICAL_READ') {
            throw new Error('[V3B/C] Thiếu confirmToken ENABLE_CANONICAL_READ.');
        }

        const ctx = getContext();
        const sdk = ctx.sdk;
        if (!sdk.writeBatch || !sdk.doc || !sdk.setDoc || !sdk.getDocs) {
            throw new Error('[V3B/C] Firebase SDK chưa đủ cho cutover.');
        }
        global.__canonicalTxCutoverInFlight = true;
        const frozenLegacy = (Array.isArray(ctx.store.transactions) ? ctx.store.transactions : []).map(function(tx) { return Object.assign({}, tx); });
        let patched = 0;
        try {
            detachFinanceListener('canonical-cutover-backfill');
            const chunks = [];
            for (let i = 0; i < plan.candidates.length; i += 400) chunks.push(plan.candidates.slice(i, i + 400));
            for (let index = 0; index < chunks.length; index++) {
                const batch = sdk.writeBatch(ctx.db);
                chunks[index].forEach(function(item) {
                    batch.set(sdk.doc(ctx.db, 'clubs', ctx.clubId, 'transactions', item.id), item.patch, { merge: true });
                });
                await batch.commit();
                patched += chunks[index].length;
            }
            _auditCache.delete(ctx.clubId + ':' + month);
            const parity = await runParityAudit(month, {
                force: true,
                legacyTransactions: frozenLegacy,
                limit: (Number((global.__scaleConfig || {}).txListenerLimit) || 1200) + 1,
            });
            if (!parity.readyForCanonicalCutover || parity.truncatedRisk) {
                reattachMonth(month, 'legacy', 'parity-failed');
                return { ok: false, cutoverEnabled: false, patchedCount: patched, plan: plan, parity: parity, rollbackApplied: true };
            }
            await persistReadMode(month, true);
            reattachMonth(month, 'canonical', 'parity-passed');
            const result = { ok: true, cutoverEnabled: true, patchedCount: patched, plan: plan, parity: parity, completedAt: Date.now() };
            ensureMetrics().canonicalCutover = ensureMetrics().canonicalCutover || {};
            ensureMetrics().canonicalCutover[month] = result;
            return result;
        } catch (error) {
            try { reattachMonth(month, 'legacy', 'cutover-error'); } catch (_) {}
            throw error;
        } finally {
            global.__canonicalTxCutoverInFlight = false;
            refreshOptimizerButton();
        }
    }

    async function disableCanonicalRead(monthInput, options) {
        const opts = options && typeof options === 'object' ? options : {};
        const month = normalizeMonth(monthInput || ((document.getElementById('filterMonth') || {}).value));
        if (!month) throw new Error('[V3B/C] Tháng rollback không hợp lệ.');
        if (!opts.allowNonAdmin && !isAdminRuntime()) throw new Error('[V3B/C] Chỉ Admin mới được rollback.');
        detachFinanceListener('canonical-read-rollback');
        await persistReadMode(month, false);
        reattachMonth(month, 'legacy', 'manual-rollback');
        refreshOptimizerButton();
        return { ok: true, month: month, readMode: 'legacy', rolledBackAt: Date.now() };
    }


    function startListenerAfterSettings(monthInput) {
        const month = normalizeMonth(monthInput);
        if (!month || typeof global.listenToData !== 'function') return false;
        if (global.__settingsSnapshotReady) { global.listenToData(month); return true; }
        if (global.__canonicalTxSettingsWait && global.__canonicalTxSettingsWait.month === month) return false;
        let finished = false;
        const finish = function(reason) {
            if (finished) return;
            finished = true;
            if (global.__canonicalTxSettingsWait && global.__canonicalTxSettingsWait.timer) clearTimeout(global.__canonicalTxSettingsWait.timer);
            global.__canonicalTxSettingsWait = null;
            global.listenToData(month);
            console.info('[V3B/C] Transaction listener started after settings gate:', reason, month);
        };
        const onReady = function() { finish('settings-ready'); };
        if (typeof global.addEventListener === 'function') global.addEventListener('app:settings-ready', onReady, { once: true });
        const timer = setTimeout(function() { finish('settings-timeout-fallback'); }, 2000);
        global.__canonicalTxSettingsWait = { month: month, timer: timer };
        return false;
    }

    function syncReadModeFromConfig(reason) {
        if (global.__canonicalTxCutoverInFlight) return false;
        const store = getContext().store;
        const month = normalizeMonth(store._activeTxListenerMonth || ((document.getElementById('filterMonth') || {}).value));
        if (!month || typeof global.listenToData !== 'function') return false;
        const desired = getReadMode(null, month);
        const active = String(store._activeTxReadMode || 'legacy');
        refreshOptimizerButton();
        if (desired === active) return false;
        detachFinanceListener('canonical-config-sync:' + String(reason || 'settings'));
        reattachMonth(month, desired, 'settings-sync');
        return true;
    }

    function refreshOptimizerButton() {
        // V3BC1: one-time manual control was removed. Keep bridge idempotent for old callers.
        removeOptimizerButton();
        return getAutomaticOptimizationStatus();
    }

    function ensureOptimizerButton() {
        // V3BC1: automatic per-club optimization; remove stale button left by cached HTML/JS.
        removeOptimizerButton();
        return false;
    }

    if (global.document && typeof global.document.addEventListener === 'function') {
        const cleanupLegacyButton = function() { setTimeout(removeOptimizerButton, 0); };
        if (global.document.readyState === 'loading') global.document.addEventListener('DOMContentLoaded', cleanupLegacyButton);
        else cleanupLegacyButton();
        if (typeof global.addEventListener === 'function') global.addEventListener('app:shell-ready', cleanupLegacyButton);
    }

    function printAudit() {
        const metrics = ensureMetrics();
        const rows = Object.keys(metrics.sources).sort().map(function(key) {
            const s = metrics.sources[key];
            return {
                source: key,
                events: s.events,
                estimatedDocs: s.estimatedDocs,
                initialDocs: s.initialDocs,
                changedDocs: s.changedDocs,
                maxDocs: s.maxDocs,
                lastReason: s.lastReason,
            };
        });
        console.group('[Firestore Read Attribution] Phase 4K-6V3BC1');
        console.table(rows);
        const month = String(((global.__store || {})._activeTxListenerMonth) || '');
        if (month && metrics.transactionOverlap[month]) {
            console.log('Transaction overlap:', metrics.transactionOverlap[month]);
        }
        if (month && metrics.canonicalParity[month]) {
            console.log('Canonical parity:', metrics.canonicalParity[month]);
        }
        console.info('Lưu ý: estimatedDocs là ước tính theo initial snapshot/docChanges, không thay thế số liệu billing trong Firebase Console.');
        console.groupEnd();
        return { sources: rows, transactionOverlap: metrics.transactionOverlap, canonicalParity: metrics.canonicalParity };
    }

    function resetAudit(reason) {
        global.__firestoreReadAttribution = {
            version: '4K-6V3BC1',
            sessionStartedAt: Date.now(),
            resetReason: String(reason || 'manual'),
            sources: {},
            events: [],
            transactionOverlap: {},
            canonicalParity: {},
        };
        _auditCache.clear();
        return global.__firestoreReadAttribution;
    }

    const api = {
        version: '4K-6V3BC1',
        schemaVersion: SCHEMA_VERSION,
        normalizeMonth: normalizeMonth,
        deriveAccountingMonths: deriveAccountingMonths,
        canonicalizeCreate: canonicalizeCreate,
        canonicalizePatch: canonicalizePatch,
        recordRead: recordRead,
        recordSnapshot: recordSnapshot,
        recordTransactionOverlap: recordTransactionOverlap,
        runParityAudit: runParityAudit,
        getReadMode: getReadMode,
        buildBackfillPlan: buildBackfillPlan,
        executeCanonicalCutover: executeCanonicalCutover,
        disableCanonicalRead: disableCanonicalRead,
        syncReadModeFromConfig: syncReadModeFromConfig,
        startListenerAfterSettings: startListenerAfterSettings,
        scheduleAutomaticCutover: scheduleAutomaticCutover,
        runAutomaticCutover: runAutomaticCutover,
        resetAutomaticOptimization: resetAutomaticOptimization,
        getAutomaticOptimizationStatus: getAutomaticOptimizationStatus,
        ensureOptimizerButton: ensureOptimizerButton,
        refreshOptimizerButton: refreshOptimizerButton,
        printAudit: printAudit,
        resetAudit: resetAudit,
    };

    global.CanonicalTransactionBoundary = api;
    global.canonicalizeTransactionForWrite = canonicalizeCreate;
    global.canonicalizeTransactionPatch = canonicalizePatch;
    global.recordFirestoreReadAttribution = recordRead;
    global.recordFirestoreSnapshotAttribution = recordSnapshot;
    global.recordTransactionQueryOverlap = recordTransactionOverlap;
    global.runCanonicalTransactionParityAudit = runParityAudit;
    global.getCanonicalTransactionReadMode = getReadMode;
    global.shouldUseCanonicalTransactionRead = function(clubId, month) { return getReadMode(clubId, month) === 'canonical'; };
    global.planCanonicalTransactionCutover = buildBackfillPlan;
    global.executeCanonicalTransactionCutover = executeCanonicalCutover;
    global.disableCanonicalTransactionRead = disableCanonicalRead;
    global.syncCanonicalTransactionReadModeFromConfig = syncReadModeFromConfig;
    global.startTransactionListenerAfterSettings = startListenerAfterSettings;
    global.scheduleAutomaticCanonicalTransactionOptimization = scheduleAutomaticCutover;
    global.runAutomaticCanonicalTransactionOptimization = runAutomaticCutover;
    global.resetAutomaticCanonicalTransactionOptimization = resetAutomaticOptimization;
    global.getAutomaticCanonicalTransactionOptimizationStatus = getAutomaticOptimizationStatus;
    global.ensureCanonicalTransactionOptimizerButton = ensureOptimizerButton;
    global.refreshCanonicalTransactionOptimizerButton = refreshOptimizerButton;
    global.printFirestoreReadAudit = printAudit;
    global.resetFirestoreReadAudit = resetAudit;
    ensureMetrics();
})(window);
