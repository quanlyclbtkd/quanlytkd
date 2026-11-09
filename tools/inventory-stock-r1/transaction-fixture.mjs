// Sequential SDK-double adapter for pre-existing non-stock regression suites.
// Conflict/retry proof lives in harness.mjs, not in this fixture bridge.
export function installTransactionFixture(sdk, read) {
    sdk.__transactionFixtureReads = [];
    sdk.runTransaction = async (db, callback) => {
        const batch = sdk.writeBatch(db); let wrote = false;
        const transaction = {
            async get(ref) {
                if (wrote) throw Error('Transaction fixture: reads must precede writes');
                sdk.__transactionFixtureReads.push(ref.path);
                return read(ref);
            },
            set(...args) { wrote = true; batch.set(...args); return transaction; },
            update(...args) { wrote = true; batch.update(...args); return transaction; },
            delete(...args) { wrote = true; batch.delete(...args); return transaction; },
        };
        const result = await callback(transaction);
        await batch.commit();
        return result;
    };
}
export function fixtureSnapshot(ref, data) {
    const copy = data === undefined ? undefined : structuredClone(data);
    return { id: ref.id, exists: () => copy !== undefined, data: () => structuredClone(copy), metadata: { fromCache: false, hasPendingWrites: false } };
}
