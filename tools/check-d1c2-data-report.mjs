import assert from 'node:assert/strict';

globalThis.window = { __store: { db: {}, clubId: 'club-A', colRef: { path: 'transactions' } } };

const docs = (count, extra = {}) => Array.from({ length: count }, (_, i) => ({
    id: `tx-${String(i).padStart(4, '0')}`,
    txMonth: '2026-09', date: '2026-09-01', packageMonths: [],
    timestamp: count - i, description: i === count - 1 ? 'needle' : 'other', ...extra,
}));
let source = [];
let reads = 0;
let calls = 0;
let rejectAt = -1;
window._fb_init = {
    where: (...args) => ({ op: 'where', args }),
    orderBy: (...args) => ({ op: 'orderBy', args }),
    limit: n => ({ op: 'limit', n }),
    startAfter: cursor => ({ op: 'cursor', id: cursor.id }),
    query: (_ref, ...parts) => parts,
    collection: (_db, ...path) => ({ path }),
    async getDocs(parts) {
        calls++;
        if (calls === rejectAt) throw Object.assign(new Error('permission-denied'), { code: 'permission-denied' });
        const filters = parts.filter(p => p.op === 'where');
        const cursor = parts.find(p => p.op === 'cursor')?.id;
        const size = parts.find(p => p.op === 'limit')?.n ?? 500;
        let found = source.filter(d => filters.every(f => {
            const [field, op, value] = f.args;
            if (op === '==') return d[field] === value;
            if (op === 'array-contains') return (d[field] || []).includes(value);
            if (op === '>=') return d[field] >= value;
            if (op === '<=') return d[field] <= value;
            return false;
        })).sort((a, b) => a.id.localeCompare(b.id));
        if (cursor) found = found.filter(d => d.id > cursor);
        const page = found.slice(0, size).map(d => ({ id: d.id, data: () => d }));
        reads += page.length;
        return { docs: page, empty: !page.length, forEach: fn => page.forEach(fn) };
    },
};

const { fetchAllMatchingDocs, loadTransactionsForDateRange, loadInventoryForDateRange } = await import('../js/firebase/paginatedQuery.js');
const { FinanceService } = await import('../js/services/finance.service.js');

function reset(items, fail = -1) { source = items; reads = 0; calls = 0; rejectAt = fail; }
function builder(cursor, size = 50) {
    return window._fb_init.query({}, ...(cursor ? [window._fb_init.startAfter(cursor)] : []), window._fb_init.limit(size));
}

for (const n of [0, 50, 250, 251, 2001]) {
    reset(docs(n));
    const result = await fetchAllMatchingDocs({ baseQueryBuilder: c => builder(c, 50), pageSize: 50, maxPages: 50, reason: 'test' });
    assert.equal(result.length, n);
    assert.equal(reads, n);
    console.log(`PASS report complete ${n} rows (${calls} pages, ${reads} document reads)`);
}
reset(docs(100), 2);
await assert.rejects(fetchAllMatchingDocs({ baseQueryBuilder: c => builder(c), pageSize: 50, maxPages: 5 }), /permission-denied/);
console.log('PASS report page 2 rejection cannot return page 1');
reset(docs(100));
await assert.rejects(fetchAllMatchingDocs({ baseQueryBuilder: c => builder(c), pageSize: 50, maxPages: 2 }), /maxPages/);
console.log('PASS exact full maxPages is incomplete');
reset(docs(2001));
assert.equal((await loadTransactionsForDateRange({ colRef: {}, startDate: '2026-09-01', endDate: '2026-09-30' })).length, 2001);
console.log('PASS date export >2000 rows');
reset(docs(1001));
assert.equal((await loadInventoryForDateRange({ invRef: {}, startDate: '2026-09-01', endDate: '2026-09-30' })).length, 1001);
console.log('PASS inventory export >1000 rows');

for (const n of [0, 50, 250, 251]) {
    reset(docs(n));
    let monthState = null, page, clicks = 0;
    do {
        page = await FinanceService.getTransactionsForMonthInclusive({ monthStr: '2026-09', pageSize: 50, state: monthState });
        monthState = page._monthState;
        clicks++;
        assert.ok(clicks < 10);
    } while (!page._complete);
    assert.equal(page._mergedItems.length, n);
    assert.equal(reads, n * 2); // same document in txMonth and date branches
    console.log(`PASS month ${n} rows (${clicks} service pages, ${calls} requests, ${reads} mock document reads)`);
}

reset([...docs(251), { id: 'pkg-1', txMonth: '2026-07', date: '2026-07-01', packageMonths: ['2026-09'], timestamp: 77 }, { id: 'date-1', txMonth: '2026-08', date: '2026-09-25', timestamp: 77 }]);
let state = null, result, steps = 0;
do {
    result = await FinanceService.getTransactionsForMonthInclusive({ monthStr: '2026-09', pageSize: 50, state });
    state = result._monthState;
    steps++;
    assert.ok(steps < 10);
} while (!result._complete);
assert.equal(result._mergedItems.length, 253);
assert.equal(new Set(result._mergedItems.map(x => x.id)).size, 253);
assert.ok(result._mergedItems.some(x => x.id === 'pkg-1'));
assert.ok(result._mergedItems.some(x => x.id === 'date-1'));
assert.deepEqual(result._mergedItems.slice(0, 2).map(x => x.id), ['tx-0000', 'tx-0001']);
console.log(`PASS month 251+ overlap/dedupe/cursors (${steps} clicks, ${reads} document reads)`);

reset(docs(251));
state = null; steps = 0;
do {
    result = await FinanceService.getTransactionsForMonthInclusive({ monthStr: '2026-09', search: 'needle', pageSize: 50, state });
    state = result._monthState; steps++;
    assert.ok(steps < 10);
} while (!result._complete);
assert.deepEqual(result._mergedItems.map(t => t.id), ['tx-0250']);
console.log(`PASS search finds row 251 without reporting early empty as complete (${steps} clicks)`);
const switched = await FinanceService.getTransactionsForMonthInclusive({ monthStr: '2026-10', pageSize: 50, state });
assert.equal(switched._mergedItems.length, 0);
assert.equal(switched._complete, true);
console.log('PASS month switch rejects old cursor/buffer state');

reset(docs(251));
result = await FinanceService.getTransactionsForMonthInclusive({ monthStr: '2026-09', pageSize: 50 });
state = result._monthState;
rejectAt = calls + 2;
await assert.rejects(FinanceService.getTransactionsForMonthInclusive({ monthStr: '2026-09', pageSize: 50, state }), /permission-denied/);
assert.equal(state.items.length, 50);
console.log('PASS one of three month sources fails closed without changing last good cursor');

reset(docs(2001, { packageMonths: ['2026-09'] }));
assert.equal((await FinanceService.queryTxByPackageMonths(['2026-09'])).length, 2001);
console.log(`PASS packageMonths >2000 (${reads} document reads)`);
