// Test only: execute the actual recorder/publisher/merge/subscription callbacks.
// The caller supplies either the real local Emulator SDK or an in-memory port.
export function createActualListenerFixture(parts, store, { month = '2026-10', mode = 'legacy', onSnapshot, queries } = {}) {
    const principal = Function('return ' + parts.principal)();
    const handlers = {}, seen = Function('_txPrincipal', 'return ' + parts.seen)(principal);
    const env = {
        _cid: store.clubId, _txPrincipal: principal, monthStr: month, _desiredTxReadMode: mode, _txListLim: 1200,
        _byDate: [], _byTxMonth: [], _byPackageMonth: [], allTransactions: [],
        _txSourceSnapshotSeen: seen,
        _txSourceServerVerified: { byDate: false, byTxMonth: false, byPackageMonth: false, canonical: false },
        _txHydrationReconciled: false, _lastCommittedTxFingerprint: '', _txKey: 'qa-finance', currentTxUnsub: null,
        _fingerprintMergedTransactions: JSON.stringify, _updateHydrationMetrics() {}, _invalidateDashboardCoalesced() {},
        onSnapshot: onSnapshot || ((query, ...args) => { handlers[query.key] = args.at(-1); return () => {}; }),
        qByDate: queries?.byDate || { key: 'byDate' }, qByTxMonth: queries?.byTxMonth || { key: 'byTxMonth' },
        qByPackageMonth: queries?.byPackageMonth || { key: 'byPackageMonth' }, qCanonical: queries?.canonical || { key: 'canonical' },
    };
    store._activeTxListenerMonth = month; store._activeTxReadMode = mode; store._activeTxProjectionEpoch = seen;
    window.__dataHydrationMetrics ||= {};
    const compile = text => Function('env', 'with (env) { return ' + text + '; }')(env);
    for (const [name, part] of Object.entries({ _buildTransactionCoverage: 'build', _recordTxSourceSnapshot: 'record', _isTxInitialHydrationComplete: 'initial', _txHydrationCoverageComplete: 'coverage', _isCurrentTxListenerContext: 'current', _publishTransactionCoverage: 'publish', _mergeAndRender: 'merge' })) env[name] = compile(parts[part]);
    const stop = compile(parts.attach)();
    return {
        state: env, stop,
        push(key, rows, metadata = { fromCache: false, hasPendingWrites: false }) {
            if (!handlers[key]) throw Error('Source not attached: ' + key);
            handlers[key]({ metadata, size: rows.length, docs: rows.map(row => ({ id: row.id, data: () => ({ ...row }) })) });
        },
    };
}
