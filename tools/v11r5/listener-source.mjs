import fs from 'node:fs';
export function listenerSource(root = process.cwd()) {
    const src = fs.readFileSync(root + '/app.js', 'utf8');
    const rhs = (name, next) => {
        const prefix = 'const ' + name + ' = ', start = src.indexOf(prefix);
        if (start < 0) throw Error('Missing source owner ' + name);
        const end = src.indexOf('\n        const ' + next, start);
        if (end < 0) throw Error('Missing owner boundary ' + next);
        return src.slice(start + prefix.length, end).trim().replace(/;$/, '');
    };
    const buildStart = src.indexOf('function _buildTransactionCoverage(');
    const attachStart = src.indexOf('const _attachTxSnapshots = () => {');
    const attachEnd = src.indexOf('return combinedUnsub;\n        };', attachStart) + 'return combinedUnsub;\n        };'.length;
    return {
        principal: src.includes('const _txPrincipal = ') ? src.slice(src.indexOf('const _txPrincipal = ') + 'const _txPrincipal = '.length, src.indexOf(';', src.indexOf('const _txPrincipal = '))) : '() => undefined',
        seen: src.slice(src.indexOf('const _txSourceSnapshotSeen = ') + 'const _txSourceSnapshotSeen = '.length, src.indexOf(';', src.indexOf('const _txSourceSnapshotSeen = '))),
        build: src.slice(buildStart, src.indexOf('\n    function _resetTransactionCoverage', buildStart)),
        record: rhs('_recordTxSourceSnapshot', '_isTxInitialHydrationComplete'),
        initial: rhs('_isTxInitialHydrationComplete', '_txHydrationCoverageComplete'),
        coverage: rhs('_txHydrationCoverageComplete', '_fingerprintMergedTransactions'),
        current: rhs('_isCurrentTxListenerContext', '_publishTransactionCoverage'),
        publish: rhs('_publishTransactionCoverage', '_invalidateDashboardCoalesced'),
        merge: src.slice(src.indexOf('const _mergeAndRender = ') + 'const _mergeAndRender = '.length, src.indexOf('\n\n        // [PERF] Giữ 2 query song song')).trim().replace(/;$/, ''),
        attach: src.slice(attachStart + 'const _attachTxSnapshots = '.length, attachEnd).trim().replace(/;$/, ''),
    };
}
