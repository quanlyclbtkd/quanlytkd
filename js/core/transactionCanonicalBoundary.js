/*
 * Phase 4K-6V3A — Firestore Read Attribution + Canonical Transaction Read Boundary
 * Classic deferred script loaded before app.js.
 *
 * Safety rules:
 * - Does NOT attach a Firestore listener.
 * - Does NOT auto-run any comparison query.
 * - Does NOT migrate old documents.
 * - Existing 3-query transaction authority remains unchanged in V3A.
 */
(function initTransactionCanonicalBoundary(global) {
    'use strict';

    if (global.CanonicalTransactionBoundary && global.CanonicalTransactionBoundary.version === '4K-6V3A') return;

    const SCHEMA_VERSION = 1;
    const MONTH_RE = /^(\d{4})-(\d{1,2})$/;
    const _auditCache = new Map();

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
            updatedAt: Date.now(),
        };
        metrics.transactionOverlap[String(month || '')] = report;
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

        const maxDocs = Math.max(1, Math.min(5000, Number(opts.limit) || (((global.__scaleConfig || {}).txListenerLimit) || 1200)));
        const ref = sdk.collection(db, 'clubs', clubId, 'transactions');
        const canonicalQuery = sdk.query(ref, sdk.where('accountingMonths', 'array-contains', month), sdk.limit(maxDocs));
        const snap = await sdk.getDocs(canonicalQuery);
        recordRead('transactions.canonicalParityAudit', snap.size, { initial: true, reason: 'manual-parity-audit:' + month });

        const canonical = snap.docs.map(function(d) { return Object.assign({ id: d.id }, d.data()); });
        const activeMonth = String(store._activeTxListenerMonth || '');
        if (activeMonth !== month) {
            throw new Error('[V3A] Chỉ đối chiếu tháng đang được listener cũ tải (' + (activeMonth || 'chưa có') + '). Chọn tháng ' + month + ' trên giao diện trước.');
        }
        const legacy = (Array.isArray(store.transactions) ? store.transactions : [])
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
            readyForCanonicalCutover: legacyIds.size === canonicalIds.size && missingFromCanonical.length === 0 && extraInCanonical.length === 0 && canonicalAmount === legacyAmount,
            queryLimit: maxDocs,
            truncatedRisk: snap.size >= maxDocs,
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
        console.group('[Firestore Read Attribution] Phase 4K-6V3A');
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
            version: '4K-6V3A',
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
        version: '4K-6V3A',
        schemaVersion: SCHEMA_VERSION,
        normalizeMonth: normalizeMonth,
        deriveAccountingMonths: deriveAccountingMonths,
        canonicalizeCreate: canonicalizeCreate,
        canonicalizePatch: canonicalizePatch,
        recordRead: recordRead,
        recordSnapshot: recordSnapshot,
        recordTransactionOverlap: recordTransactionOverlap,
        runParityAudit: runParityAudit,
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
    global.printFirestoreReadAudit = printAudit;
    global.resetFirestoreReadAudit = resetAudit;
    ensureMetrics();
})(window);
