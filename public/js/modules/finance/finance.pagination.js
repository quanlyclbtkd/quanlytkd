/** Presentation state of the existing finance page. No transport or writer. */
export function attachTransactionPageProjection({ store, pgState, pageSize: PAGE_SIZE, getMonth, getSearch, getContext, renderControls }) {
    const principalKey = () => [store.clubId || '', store.auth?.currentUser?.uid || store.currentUser?.uid || '', window.userRole || store.userRole || '', Number(window.__verifiedAuthContextState?.generation || 0)].join('|');
    const ownerKey = principalKey();
    pgState.isCurrentContext = () => window.__store === store && store.pagination?.transactions === pgState && principalKey() === ownerKey;
    let liveContext = '', liveMonth = getMonth();
    let liveRows = new Map(), completeIds = null;
    const committedRemovals = new Set();
    // ACK fences are metadata in this projection, not a payment cache/queue.
    // Keep the existing row reference until server evidence or a delete ACK.
    const fences = new Map();
    let evidenceEpoch = null;
    const seenEpochs = new WeakSet(), sourceVersions = new Map();
    let statusFingerprint = '';
    pgState.projectionRevision = 0;
    pgState._visibleCount = PAGE_SIZE;

    function _ensureLiveContext() {
        if (liveContext === getContext()) return;
        liveContext = getContext(); liveRows = new Map(); completeIds = null;
        if (liveMonth !== getMonth()) {
            liveMonth = getMonth();
            fences.forEach(f => { f.witnesses.clear(); f.observed = false; f.review = false; f.detail = null; });
        }
    }

    function _matchesPage(tx) {
        const month = getMonth();
        const matchesMonth = typeof window.txMatchesSelectedMonth === 'function'
            ? window.txMatchesSelectedMonth(tx, month)
            : !month || tx.txMonth === month || tx.paymentMonth === month || tx.packageMonths?.includes(month) || String(tx.date || '').startsWith(month);
        const search = getSearch();
        const normalize = value => typeof window.normalizeVNForSearch === 'function' ? window.normalizeVNForSearch(value) : String(value || '').toLowerCase();
        const blob = typeof window.getTransactionSearchBlob === 'function' ? window.getTransactionSearchBlob(tx) : [tx.description, tx.type, tx.branch, tx.txMonth, ...(tx.packageMonths || [])].join(' ');
        return matchesMonth && (!search || normalize(blob).includes(normalize(search)));
    }

    function _sourceKeys(row, mode) {
        const month = getMonth();
        if (!row || !month) return [];
        if (mode === 'canonical') return ['canonical'];
        return [
            String(row.date || '').startsWith(month) ? 'byDate' : '',
            row.txMonth === month ? 'byTxMonth' : '',
            Array.isArray(row.packageMonths) && row.packageMonths.includes(month) ? 'byPackageMonth' : '',
        ].filter(Boolean);
    }

    function _sameWrittenValue(expected, actual) {
        if (expected === actual) return true;
        if (!expected || !actual || typeof expected !== 'object' || typeof actual !== 'object') return false;
        if (Array.isArray(expected)) return Array.isArray(actual) && expected.length === actual.length && expected.every((v, i) => _sameWrittenValue(v, actual[i]));
        const keys = Object.keys(expected).filter(k => expected[k] !== undefined && k !== 'id' && !k.startsWith('_'));
        return keys.every(k => _sameWrittenValue(expected[k], actual[k]));
    }

    function _acceptEvidence(evidence) {
        if (!evidence || typeof evidence.epoch !== 'object' || !evidence.epoch || !['legacy', 'canonical'].includes(evidence.mode) || !evidence.rows || !evidence.meta || !(evidence.limit > 0)) return false;
        if (store._activeTxProjectionEpoch && store._activeTxProjectionEpoch !== evidence.epoch) return false;
        if (evidenceEpoch !== evidence.epoch) {
            if (seenEpochs.has(evidence.epoch)) return false;
            seenEpochs.add(evidence.epoch); evidenceEpoch = evidence.epoch; sourceVersions.clear();
            fences.forEach(f => { f.witnesses.clear(); f.observed = false; f.detail = null; });
        }
        for (const [key, meta] of Object.entries(evidence.meta)) {
            if (Number(meta?.revision || 0) < (sourceVersions.get(key) || 0)) return false;
        }
        for (const [key, meta] of Object.entries(evidence.meta)) sourceVersions.set(key, Number(meta?.revision || 0));
        return true;
    }

    function _advanceFences(rows, evidence, accepted) {
        if (!fences.size) return false;
        const merged = new Map(rows.filter(Boolean).map(row => [String(row.id), row]));
        let rowChanged = false;
        fences.forEach((f, id) => {
            if (!f.row) return; // unknown deleted row stays a tombstone
            const keys = accepted ? _sourceKeys(f.row, evidence.mode) : [];
            for (const key of keys) {
                const meta = evidence.meta[key], sourceRows = evidence.rows[key];
                if (!meta?.trusted || !(meta.revision > 0) || !Array.isArray(sourceRows)) continue;
                const present = sourceRows.find(row => String(row?.id) === id);
                if (present && (f.observed || _sameWrittenValue(f.row, present))) f.witnesses.set(key, meta.revision);
            }
            if (keys.length && keys.every(key => f.witnesses.has(key))) f.observed = true;
            const removedAfterWitness = f.observed && keys.length && keys.every(key => {
                const meta = evidence.meta[key], sourceRows = evidence.rows[key];
                return meta?.trusted === true && Array.isArray(sourceRows) && sourceRows.length < evidence.limit
                    && meta.revision > f.witnesses.get(key) && !sourceRows.some(row => String(row?.id) === id);
            });
            if (removedAfterWitness) {
                liveRows.set(id, null); fences.delete(id); committedRemovals.delete(id);
                rowChanged = true;
            } else if (!f.deleted) {
                const candidate = merged.get(id);
                if (f.observed && candidate && accepted && keys.some(key => evidence.meta[key]?.trusted && evidence.rows[key]?.some(row => String(row?.id) === id && _sameWrittenValue(candidate, row)))) {
                    rowChanged = rowChanged || f.row !== candidate;
                    f.row = candidate;
                }
                // Historical witness (observed) is not current confirmation. A
                // later cache callback, mismatch or missing source revokes the
                // final label without discarding the acknowledged receipt.
                const sources = Object.create(null);
                for (const key of keys) {
                    const meta = evidence.meta[key], sourceRows = evidence.rows[key];
                    const present = Array.isArray(sourceRows) && sourceRows.find(row => String(row?.id) === id);
                    sources[key] = !meta?.trusted || !Array.isArray(sourceRows) ? 'cache'
                        : present ? (_sameWrittenValue(f.row, present) ? 'matched' : 'conflict')
                            : sourceRows.length >= evidence.limit ? 'bounded' : 'missing';
                }
                const verifiedSourceCount = Object.values(sources).filter(s => s === 'matched').length;
                const needsReview = Object.values(sources).some(s => ['conflict', 'missing', 'bounded'].includes(s)) || !candidate;
                f.review = needsReview;
                f.detail = {
                    state: needsReview ? 'needs-review' : keys.length && verifiedSourceCount === keys.length ? 'server-reconciled' : 'awaiting-server',
                    verifiedSourceCount, requiredSourceCount: keys.length || _sourceKeys(f.row, evidence?.mode || 'legacy').length,
                    sources,
                };
            }
        });
        return rowChanged;
    }

    function _updateStatus() {
        const relevant = [...fences.entries()].filter(([, f]) => !f.deleted && f.row && _matchesPage(f.row));
        const byId = Object.create(null);
        relevant.forEach(([id, f]) => { byId[id] = f.detail || { state: 'awaiting-server', verifiedSourceCount: 0, requiredSourceCount: _sourceKeys(f.row, store._activeTxReadMode || 'legacy').length, sources: {} }; });
        const status = {
            awaitingServer: relevant.filter(([id]) => byId[id].state !== 'server-reconciled').map(([id]) => id),
            needsReview: relevant.filter(([id]) => byId[id].state === 'needs-review').map(([id]) => id),
            reconciled: relevant.filter(([id]) => byId[id].state === 'server-reconciled').map(([id]) => id),
            byId,
        };
        const nextFingerprint = JSON.stringify(status);
        if (nextFingerprint === statusFingerprint) return false;
        statusFingerprint = nextFingerprint;
        pgState.reconciliation = status;
        return true;
    }

    function _projectPage() {
        const rows = new Map((pgState._mergedAllItems || pgState.currentItems || []).filter(Boolean).map(tx => [String(tx.id), tx]));
        liveRows.forEach((tx, id) => tx ? rows.set(id, tx) : rows.delete(id));
        fences.forEach((f, id) => f.deleted ? rows.delete(id) : rows.set(id, f.row));
        const items = [...rows.values()].filter(tx => (!completeIds || completeIds.has(String(tx.id)) || fences.has(String(tx.id))) && _matchesPage(tx))
            .sort((a, b) => Number(b.timestamp || 0) - Number(a.timestamp || 0) || String(a.id).localeCompare(String(b.id)));
        pgState._mergedAllItems = getMonth() ? items : null;
        pgState.currentItems = items.slice(0, pgState._visibleCount);
        pgState.totalLoaded = pgState.currentItems.length;
        pgState.hasNext = items.length > pgState._visibleCount || (getMonth() ? pgState._monthComplete === false : pgState._serverHasMore === true);
        _updateStatus();
        pgState.projectionRevision++;
    }

    pgState.reconcile = ({ rows = [], removedIds = [], month, complete = false, source = 'commit', evidence, metadataOnly = false } = {}) => {
        if (!pgState.isCurrentContext() || (month && month !== getMonth())) return false;
        _ensureLiveContext();
        let pageChanged = false;
        if (source === 'snapshot') {
            const accepted = _acceptEvidence(evidence);
            if (evidence && !accepted) return false;
            pageChanged = _advanceFences(rows, evidence, accepted);
            pageChanged = pageChanged || (completeIds !== null) !== complete;
            completeIds = complete ? new Set(rows.filter(Boolean).map(tx => String(tx.id))) : null;
            if (completeIds) {
                committedRemovals.forEach(id => completeIds.delete(id));
                const knownIds = new Set([...liveRows.keys(), ...(pgState._mergedAllItems || pgState.currentItems || []).filter(Boolean).map(tx => String(tx.id))]);
                knownIds.forEach(id => { if (!completeIds.has(id) && !fences.has(id)) liveRows.set(id, null); });
            }
        }
        rows.forEach(tx => {
            if (source === 'snapshot' && metadataOnly) return;
            if (!tx?.id) return;
            const id = String(tx.id);
            if (source === 'snapshot' && (committedRemovals.has(id) || fences.has(id))) return;
            if (source !== 'snapshot') {
                committedRemovals.delete(id);
                fences.set(id, { row: tx, witnesses: new Map(), observed: false, review: false, deleted: false });
            }
            liveRows.set(id, tx);
            if (source !== 'snapshot' && completeIds) completeIds.add(id);
        });
        removedIds.forEach(value => {
            const id = String(value), prior = fences.get(id);
            const row = prior?.row || liveRows.get(id) || (pgState._mergedAllItems || pgState.currentItems || []).find(tx => String(tx?.id) === id);
            fences.set(id, { row, witnesses: prior?.witnesses || new Map(), observed: prior?.observed || false, review: false, deleted: true });
            committedRemovals.add(id); liveRows.set(id, null); completeIds?.delete(id);
        });
        const statusChanged = _updateStatus();
        if (pgState.enabled && pgState._displayContextKey === getContext() && (!metadataOnly || pageChanged || statusChanged)) { _projectPage(); renderControls(); }
        return true;
    };

    function _seedListenerProjection() {
        const coverage = store.transactionCoverage;
        if (coverage?.clubId === store.clubId && coverage.month === getMonth()) {
            pgState.reconcile({ rows: store.transactions || [], month: coverage.month, complete: coverage.pageServerComplete === true, source: 'snapshot', evidence: coverage.pageEvidence });
        }
    }
    return { ensureLiveContext: _ensureLiveContext, projectPage: _projectPage, seedListenerProjection: _seedListenerProjection };
}
